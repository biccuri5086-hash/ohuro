import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cutoffs, formatResult, purgeExpired, RETENTION } from "../../scripts/waitlist/retention.mjs";
import { parseArgs } from "../../scripts/waitlist/purge-expired.mjs";
import { createTestDatabase, type Sql } from "./helpers";

let sql: Sql;
let drop: () => Promise<void>;
const NOW = new Date("2028-06-01T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number, extraMs = 0) => new Date(NOW.getTime() - days * DAY + extraMs);

beforeAll(async () => {
  ({ sql, drop } = await createTestDatabase());
});
afterAll(async () => {
  await drop?.();
});
beforeEach(async () => {
  await sql`truncate waitlist.signups, waitlist.tokens, waitlist.events, waitlist.rate_limits restart identity cascade`;
});

type Row = { email: string; created: Date; consented?: Date; confirmed?: Date | null; unsubscribed?: Date | null; isTest?: boolean };
async function addSignup(r: Row) {
  const [row] = await sql<{ id: string }[]>`
    insert into waitlist.signups ${sql({
      email: r.email,
      email_normalized: r.email,
      created_at: r.created,
      consented_at: r.consented ?? r.created,
      consent_version: "test",
      confirmed_at: r.confirmed ?? null,
      unsubscribed_at: r.unsubscribed ?? null,
      is_test: r.isTest ?? false,
    })} returning id`;
  const id = row!.id;
  await sql`insert into waitlist.tokens ${sql({
    token_hash: id.replace(/-/g, "").padEnd(64, "0"),
    signup_id: id,
    purpose: "unsubscribe",
    created_at: r.created,
    expires_at: new Date(r.created.getTime() + 365 * DAY),
  })}`;
  return id;
}
const emails = async () => (await sql<{ email: string }[]>`select email from waitlist.signups order by email`).map((r) => r.email);

describe("保存期間（D-013 の 11）", () => {
  it("期間は決定どおり", () => {
    expect(RETENTION).toEqual({ unconfirmedDays: 30, unsubscribedDays: 365, confirmedDays: 730, eventsAfterDecisionDays: 365, rateLimitDays: 1 });
    expect(Object.isFrozen(RETENTION)).toBe(true);
  });

  it("Gate 0 の判断日: 未指定・1 年未満なら計測イベントは対象外、未来の日付は拒否", () => {
    expect(cutoffs(NOW).eventsBefore).toBeNull();
    expect(cutoffs(NOW, ago(364)).eventsBefore).toBeNull();
    expect(cutoffs(NOW, ago(365))?.eventsBefore?.toISOString()).toBe(ago(365).toISOString());
    expect(() => cutoffs(NOW, new Date(NOW.getTime() + DAY))).toThrow(/未来/);
    expect(() => cutoffs(new Date("x"))).toThrow();
  });
});

describe("期限切れの登録の削除", () => {
  beforeEach(async () => {
    // 確認されなかった登録: 30 日ちょうど前は残し、それより古いものを消す
    await addSignup({ email: "unconfirmed-31d@x.jp", created: ago(31) });
    await addSignup({ email: "unconfirmed-30d@x.jp", created: ago(30) });
    // 解除後に再登録して未確認: 最後の登録（同意）から数える
    await addSignup({ email: "reregistered@x.jp", created: ago(400), consented: ago(5) });
    // 配信停止: 停止から 1 年
    await addSignup({ email: "unsub-366d@x.jp", created: ago(500), confirmed: ago(499), unsubscribed: ago(366) });
    await addSignup({ email: "unsub-365d@x.jp", created: ago(500), confirmed: ago(499), unsubscribed: ago(365) });
    // 確認済みで登録中: 登録から 2 年
    await addSignup({ email: "confirmed-731d@x.jp", created: ago(731), confirmed: ago(731) });
    await addSignup({ email: "confirmed-730d@x.jp", created: ago(730), confirmed: ago(729) });
    await addSignup({ email: "confirmed-recent@x.jp", created: ago(10), confirmed: ago(10) });
    // テスト登録も同じ規則
    await addSignup({ email: "test-unconfirmed@x.jp", created: ago(40), isTest: true });
  });

  it("確認モードは件数だけを数え、何も変更しない", async () => {
    const before = await emails();
    const r = await purgeExpired(sql, { now: NOW });
    expect(r.mode).toBe("dry-run");
    expect(r.counts).toMatchObject({ unconfirmed: 2, unsubscribed: 1, confirmed: 1 });
    expect(await emails()).toEqual(before);
    expect(formatResult(r)).toContain("確認モード（何も変更していません）");
    expect(formatResult(r)).not.toContain("@");
  });

  it("execute で期限切れだけを削除し、境界ちょうどと登録中の人は残す。トークンも連動して消える", async () => {
    const r = await purgeExpired(sql, { now: NOW, execute: true });
    expect(r.counts).toMatchObject({ unconfirmed: 2, unsubscribed: 1, confirmed: 1 });
    expect(await emails()).toEqual([
      "confirmed-730d@x.jp",
      "confirmed-recent@x.jp",
      "reregistered@x.jp",
      "unconfirmed-30d@x.jp",
      "unsub-365d@x.jp",
    ]);
    const [tok] = await sql<{ n: number }[]>`select count(*)::int as n from waitlist.tokens`;
    expect(tok!.n).toBe(5);
    // 2 回目は何も消えない
    const again = await purgeExpired(sql, { now: NOW, execute: true });
    expect(Object.values(again.counts).every((v) => v === 0)).toBe(true);
  });
});

describe("計測イベントとレート制限の削除", () => {
  beforeEach(async () => {

    for (const at of [ago(401), ago(400, -1), ago(400), ago(10)]) {
      await sql`insert into waitlist.events ${sql({ name: "lp_view", session_id: "session-0001", occurred_at: at })}`;
    }
    await sql`insert into waitlist.rate_limits ${sql([
      { key: "k1", window_start: ago(2), count: 1 },
      { key: "k2", window_start: ago(0, -60_000), count: 1 },
    ])}`;
  });

  it("判断日が未指定なら計測イベントは消さない", async () => {
    const r = await purgeExpired(sql, { now: NOW, execute: true });
    expect(r.eventsSkipped).toBe(true);
    expect(r.counts.events).toBeUndefined();
    const [{ n } = { n: -1 }] = await sql<{ n: number }[]>`select count(*)::int as n from waitlist.events`;
    expect(n).toBe(4);
    expect(r.counts.rateLimits).toBe(1);
  });

  it("判断から 1 年たったら、判断日より前のイベントだけを消す", async () => {
    const r = await purgeExpired(sql, { now: NOW, gate0DecidedAt: ago(400), execute: true });
    expect(r.counts.events).toBe(2);
    const [{ n } = { n: -1 }] = await sql<{ n: number }[]>`select count(*)::int as n from waitlist.events`;
    expect(n).toBe(2);
  });
});

describe("コマンドの引数", () => {
  it("既定は確認モード。--execute と判断日（日本時間の 0 時）を受け取る", () => {
    expect(parseArgs([])).toEqual({ execute: false, gate0DecidedAt: null });
    const a = parseArgs(["--execute", "--gate0-decided-at", "2027-01-15"]);
    expect(a.execute).toBe(true);
    expect(a.gate0DecidedAt?.toISOString()).toBe("2027-01-14T15:00:00.000Z");
  });

  it("不正な引数は拒否する", () => {
    expect(() => parseArgs(["--gate0-decided-at", "2027/01/15"])).toThrow(/YYYY-MM-DD/);
    expect(() => parseArgs(["--gate0-decided-at"])).toThrow();
    expect(() => parseArgs(["--force"])).toThrow(/不明な引数/);
  });
});
