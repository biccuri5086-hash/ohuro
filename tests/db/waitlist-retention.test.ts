import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cutoffs, formatResult, purgeExpired, RETENTION, RetentionInputError, yearsBefore } from "../../scripts/waitlist/retention.mjs";
import { errorMessage, parseArgs, UsageError } from "../../scripts/waitlist/purge-expired.mjs";
import { createTestDatabase, type Sql } from "./helpers";

let sql: Sql;
let drop: () => Promise<void>;
// 2028 年はうるう年。2026-06-01 → 2028-06-01 は 731 日、2027-06-01 → 2028-06-01 は 366 日
const NOW = new Date("2028-06-01T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number, extraMs = 0) => new Date(NOW.getTime() - days * DAY + extraMs);
const at = (iso: string) => new Date(iso);

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
const countOf = async (table: "events" | "tokens") => {
  const [row] = await sql<{ n: number }[]>`select count(*)::int as n from ${sql("waitlist")}.${sql(table)}`;
  return row!.n;
};

describe("保存期間（D-013 の 11）", () => {
  it("期間は決定どおり（年は暦の応当日で数える）", () => {
    expect(RETENTION).toEqual({ unconfirmedDays: 30, unsubscribedYears: 1, confirmedYears: 2, eventsYears: 1, rateLimitDays: 1 });
    expect(Object.isFrozen(RETENTION)).toBe(true);
  });

  it("n 年前は同じ月日・時刻。うるう年をまたいでも 365 日・730 日にずらさない（Codex 指摘 PR #46）", () => {
    expect(yearsBefore(NOW, 2).toISOString()).toBe("2026-06-01T00:00:00.000Z"); // 731 日前
    expect(yearsBefore(NOW, 1).toISOString()).toBe("2027-06-01T00:00:00.000Z"); // 366 日前
    expect(yearsBefore(at("2027-03-01T12:34:56.789Z"), 1).toISOString()).toBe("2026-03-01T12:34:56.789Z");
    // 2 月 29 日の応当日がない年は 2 月 28 日（境界を早めにして、期限前のデータを消さない）
    expect(yearsBefore(at("2028-02-29T10:00:00Z"), 1).toISOString()).toBe("2027-02-28T10:00:00.000Z");
    expect(yearsBefore(at("2028-02-29T10:00:00Z"), 4).toISOString()).toBe("2024-02-29T10:00:00.000Z");
  });

  it("Gate 0 の判断日: 未指定・1 年未満なら計測イベントは対象外、未来・不正な日付は拒否", () => {
    expect(cutoffs(NOW).eventsBefore).toBeNull();
    expect(cutoffs(NOW, at("2027-06-01T00:00:00.001Z")).eventsBefore).toBeNull(); // 1 年に 1 ミリ秒足りない
    expect(cutoffs(NOW, at("2027-06-01T00:00:00Z")).eventsBefore?.toISOString()).toBe("2027-06-01T00:00:00.000Z");
    expect(() => cutoffs(NOW, new Date(NOW.getTime() + DAY))).toThrow(RetentionInputError);
    expect(() => cutoffs(new Date("x"))).toThrow(RetentionInputError);
  });
});

describe("期限切れの登録の削除", () => {
  beforeEach(async () => {
    // 確認されなかった登録: 30 日ちょうど前は残し、それより古いものを消す
    await addSignup({ email: "unconfirmed-31d@x.jp", created: ago(31) });
    await addSignup({ email: "unconfirmed-30d@x.jp", created: ago(30) });
    // 解除後に再登録して未確認: 最後の登録（同意）から数える
    await addSignup({ email: "reregistered@x.jp", created: ago(400), consented: ago(5) });
    // 配信停止: 停止から 1 年（2027-06-01 ちょうどは残す。365 日前の 2027-06-02 も残す）
    await addSignup({ email: "unsub-before-1y@x.jp", created: ago(500), confirmed: ago(499), unsubscribed: at("2027-05-31T23:59:59.999Z") });
    await addSignup({ email: "unsub-exactly-1y@x.jp", created: ago(500), confirmed: ago(499), unsubscribed: at("2027-06-01T00:00:00Z") });
    await addSignup({ email: "unsub-365d@x.jp", created: ago(500), confirmed: ago(499), unsubscribed: ago(365) });
    // 確認済みで登録中: 登録から 2 年（2026-06-01 ちょうどと、730 日前の途中は残す）
    await addSignup({ email: "confirmed-before-2y@x.jp", created: at("2026-05-31T23:59:59.999Z"), confirmed: at("2026-06-01T01:00:00Z") });
    await addSignup({ email: "confirmed-exactly-2y@x.jp", created: at("2026-06-01T00:00:00Z"), confirmed: at("2026-06-01T01:00:00Z") });
    await addSignup({ email: "confirmed-730d-midday@x.jp", created: at("2026-06-01T12:00:00Z"), confirmed: at("2026-06-01T13:00:00Z") });
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

  it("execute で期限切れだけを削除し、境界ちょうど・期限前・登録中の人は残す。トークンも連動して消える", async () => {
    const r = await purgeExpired(sql, { now: NOW, execute: true });
    expect(r.counts).toMatchObject({ unconfirmed: 2, unsubscribed: 1, confirmed: 1 });
    expect(await emails()).toEqual([
      "confirmed-730d-midday@x.jp",
      "confirmed-exactly-2y@x.jp",
      "confirmed-recent@x.jp",
      "reregistered@x.jp",
      "unconfirmed-30d@x.jp",
      "unsub-365d@x.jp",
      "unsub-exactly-1y@x.jp",
    ]);
    expect(await countOf("tokens")).toBe(7);
    // 2 回目は何も消えない
    const again = await purgeExpired(sql, { now: NOW, execute: true });
    expect(Object.values(again.counts).every((v) => v === 0)).toBe(true);
  });
});

describe("計測イベントとレート制限の削除", () => {
  const decided = at("2027-03-01T00:00:00Z"); // 判断から 1 年以上たっている（NOW の 1 年前 = 2027-06-01）
  beforeEach(async () => {
    for (const t of [
      "2027-02-28T00:00:00Z", // 判断前
      "2027-05-31T23:59:59.999Z", // 判断後・記録から 1 年を過ぎた
      "2027-06-01T00:00:00Z", // 判断後・記録からちょうど 1 年（残す）
      "2028-05-01T00:00:00Z", // 判断後・最近
    ]) {
      await sql`insert into waitlist.events ${sql({ name: "lp_view", session_id: "session-0001", occurred_at: at(t) })}`;
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
    expect(await countOf("events")).toBe(4);
    expect(r.counts.rateLimits).toBe(1);
  });

  it("判断から 1 年未満なら計測イベントは消さない", async () => {
    const r = await purgeExpired(sql, { now: NOW, gate0DecidedAt: at("2027-06-02T00:00:00Z"), execute: true });
    expect(r.eventsSkipped).toBe(true);
    expect(await countOf("events")).toBe(4);
  });

  it("判断から 1 年たったら、判断前のイベントと、判断後でも記録から 1 年を過ぎたイベントを消す（Codex 指摘 PR #46）", async () => {
    const r = await purgeExpired(sql, { now: NOW, gate0DecidedAt: decided, execute: true });
    expect(r.counts.events).toBe(2);
    const left = await sql<{ occurred_at: Date }[]>`select occurred_at from waitlist.events order by occurred_at`;
    expect(left.map((e) => e.occurred_at.toISOString())).toEqual(["2027-06-01T00:00:00.000Z", "2028-05-01T00:00:00.000Z"]);
    // 時間がたてば、判断後のイベントも記録から 1 年で消える（永久に残る区分がない）
    const later = await purgeExpired(sql, { now: at("2029-05-01T00:00:00.001Z"), gate0DecidedAt: decided, execute: true });
    expect(later.counts.events).toBe(2);
    expect(await countOf("events")).toBe(0);
  });
});

describe("コマンドの引数とエラー表示", () => {
  it("既定は確認モード。--execute と判断日（日本時間の 0 時）を受け取る", () => {
    expect(parseArgs([])).toEqual({ execute: false, gate0DecidedAt: null });
    const a = parseArgs(["--execute", "--gate0-decided-at", "2027-01-15"]);
    expect(a.execute).toBe(true);
    expect(a.gate0DecidedAt?.toISOString()).toBe("2027-01-14T15:00:00.000Z");
  });

  it("不正な引数・存在しない日付は拒否する", () => {
    expect(() => parseArgs(["--gate0-decided-at", "2027/01/15"])).toThrow(/YYYY-MM-DD/);
    expect(() => parseArgs(["--gate0-decided-at"])).toThrow(UsageError);
    expect(() => parseArgs(["--gate0-decided-at", "2027-02-30"])).toThrow(/日付が不正/);
    expect(() => parseArgs(["--force"])).toThrow(/不明な引数/);
  });

  it("エラー文に入力値・接続文字列を含めない（Codex 指摘 PR #46）", () => {
    // 偽の接続文字列（実在しない）。誤って位置引数に渡した場合を再現する
    const misplacedUrl = "postgresql://review_user:pw-must-not-show@localhost/db";
    let thrown: unknown;
    try {
      parseArgs([misplacedUrl]);
    } catch (e) {
      thrown = e;
    }
    expect(errorMessage(thrown)).not.toContain("pw-must-not-show");
    expect(errorMessage(thrown)).toContain("不明な引数があります");
    // 固定文面のエラー以外（接続・DB のエラーなど）は、文面を出さず固定の失敗メッセージにする
    const dbError = new Error(`connect ECONNREFUSED ${misplacedUrl}`);
    expect(errorMessage(dbError)).not.toContain("review");
    expect(errorMessage(dbError)).toContain("削除処理に失敗しました");
    expect(errorMessage("text")).toContain("削除処理に失敗しました");
    expect(errorMessage(new RetentionInputError("Gate 0 の判断日が未来です"))).toBe("Gate 0 の判断日が未来です");
  });
});
