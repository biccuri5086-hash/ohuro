import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createWaitlistService } from "@/server/waitlist/service";
import type { EmailSender } from "@/server/waitlist/email";
import { asRole, createTestDatabase, type Sql } from "./helpers";

let sql: Sql;
let drop: () => Promise<void>;
let clock: Date;
let sent: { confirmUrl: string }[];
const sender: EmailSender = { async sendConfirmation(m) { sent.push(m); } };
const svc = () =>
  createWaitlistService({ sql, sender, baseUrl: "https://ohuro.example", rateLimitSecret: "s".repeat(32), now: () => new Date(clock) });
const tokenOf = (u: string) => new URL(u).searchParams.get("token")!;
const sid = (n: number) => `session-${String(n).padStart(4, "0")}`;
let ip = 0;
const ev = (name: string, s: string, extra: Record<string, unknown> = {}) =>
  svc().recordEvent({ name, sessionId: s, clientKey: `192.0.2.${ip++ % 200}`, ...extra });

beforeAll(async () => {
  ({ sql, drop } = await createTestDatabase());
});
afterAll(async () => {
  await drop?.();
});
beforeEach(async () => {
  await sql`truncate waitlist.signups, waitlist.tokens, waitlist.events, waitlist.rate_limits restart identity cascade`;
  clock = new Date("2026-11-20T10:00:00Z");
  sent = [];
});

async function registerAndConfirm(email: string, utm: Record<string, string> = {}) {
  const s = svc();
  await s.register({ email, consent: true, elapsedMs: 5000, clientKey: `198.51.100.${ip++ % 200}`, utm });
  return s.confirm(tokenOf(sent.at(-1)!.confirmUrl));
}

describe("計測イベント（G0-5）", () => {
  it("定義済みのイベントだけを記録し、個人情報は受け取らない", async () => {
    expect((await ev("lp_view", sid(1), { utm: { utm_content: "ad_a_v1" } })).status).toBe("recorded");
    expect((await ev("signup_confirmed", sid(1))).status).toBe("invalid"); // サーバー専用イベントは偽装できない
    expect((await ev("lp_view", "bad id!")).status).toBe("invalid");
    const rows = await sql`select name, session_id, utm_content, is_test from waitlist.events`;
    expect(rows).toEqual([{ name: "lp_view", session_id: sid(1), utm_content: "ad_a_v1", is_test: false }]);
  });

  it("同じ送信元からの大量送信はレート制限する", async () => {
    const s = svc();
    const statuses = [];
    for (let i = 0; i < 62; i++) statuses.push((await s.recordEvent({ name: "lp_view", sessionId: sid(i), clientKey: "203.0.113.50" })).status);
    expect(statuses.filter((x) => x === "rate_limited")).toHaveLength(2);
  });

  it("ファネルは広告別に、同じセッションの重複とテストを除外して数える", async () => {
    // 広告 A: 3 セッション訪問（うち1つは2回表示）、2 セッションがフォーム表示、1 セッションが送信
    for (const s of [1, 1, 2, 3]) await ev("lp_view", sid(s), { utm: { utm_content: "ad_a_v1" } });
    for (const s of [1, 2]) await ev("form_view", sid(s), { utm: { utm_content: "ad_a_v1" } });
    await ev("form_submit", sid(1), { utm: { utm_content: "ad_a_v1" } });
    // テスト流入は除外
    await ev("lp_view", sid(9), { utm: { utm_content: "ad_a_v1" }, test: true });
    // 広告 B: 1 訪問
    await ev("lp_view", sid(4), { utm: { utm_content: "ad_b_v1" } });
    // 登録・確認（A で1件確認、テスト登録は除外）
    await registerAndConfirm("a1@ohuro-mail.jp", { utm_content: "ad_a_v1" });
    await registerAndConfirm("qa+ohuro-test@gmail.com", { utm_content: "ad_a_v1" });
    const rows = await sql`select * from waitlist.funnel_by_creative order by utm_content`;
    const a = rows.find((r) => r.utm_content === "ad_a_v1")!;
    const b = rows.find((r) => r.utm_content === "ad_b_v1")!;
    expect([a.lp_sessions, a.form_view_sessions, a.form_submit_sessions, a.signups_created, a.signups_confirmed].map(Number)).toEqual([3, 2, 1, 1, 1]);
    expect([b.lp_sessions, b.signups_confirmed].map(Number)).toEqual([1, 0]);
  });

  it("配信停止後の再登録・再確認は、確認を重複して数えない（Codex 指摘 PR #31）", async () => {
    await registerAndConfirm("again@ohuro-mail.jp", { utm_content: "ad_a_v1" });
    await sql`update waitlist.signups set unsubscribed_at = now()`;
    clock = new Date(clock.getTime() + 61_000);
    expect((await registerAndConfirm("again@ohuro-mail.jp", { utm_content: "ad_a_v1" })).status).toBe("confirmed");
    const [a] = await sql`select signups_created, signups_confirmed from waitlist.funnel_by_creative where utm_content = 'ad_a_v1'`;
    expect([Number(a!.signups_created), Number(a!.signups_confirmed)]).toEqual([1, 1]);
    const [s] = await sql`select confirmed_at, first_confirmed_at from waitlist.signups`;
    expect(s!.confirmed_at).not.toBeNull();
    expect(s!.first_confirmed_at!.getTime()).toBeLessThan(s!.confirmed_at!.getTime()); // 初回の確認日時は残る
  });

  it("anon / authenticated はファネルを読めない", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await expect(asRole(sql, role, (tx) => tx.unsafe("select * from waitlist.funnel_by_creative"))).rejects.toThrow(/permission denied/);
    }
  });
});

describe("任意アンケート（G0-5）", () => {
  it("確認完了時だけアンケート用トークンが発行され、回答を版付きで保存する", async () => {
    const r = await registerAndConfirm("s1@ohuro-mail.jp");
    expect(r.status).toBe("confirmed");
    expect(r.surveyToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const res = await svc().submitSurvey(r.surveyToken, { photo_acceptance: "conditional", interests: ["pet"], intent: "probably" });
    expect(res.status).toBe("saved");
    const [s] = await sql`select survey, survey_version, survey_answered_at from waitlist.signups`;
    expect(s!.survey).toEqual({ photo_acceptance: "conditional", interests: ["pet"], intent: "probably" });
    expect(s!.survey_version).toBeTruthy();
    expect(s!.survey_answered_at).not.toBeNull();
  });

  it("同じリンクで2回は回答できない", async () => {
    const r = await registerAndConfirm("s2@ohuro-mail.jp");
    await svc().submitSurvey(r.surveyToken, { intent: "definitely" });
    expect((await svc().submitSurvey(r.surveyToken, { intent: "probably_not" })).status).toBe("invalid");
    const [s] = await sql`select survey from waitlist.signups`;
    expect(s!.survey).toEqual({ intent: "definitely" });
  });

  it("空の回答はトークンを消費せず保存しない", async () => {
    const r = await registerAndConfirm("s3@ohuro-mail.jp");
    expect((await svc().submitSurvey(r.surveyToken, {})).status).toBe("empty");
    expect((await svc().submitSurvey(r.surveyToken, { intent: "unsure" })).status).toBe("saved");
  });

  it("期限切れ・不正・他用途のトークンでは回答できない", async () => {
    const r = await registerAndConfirm("s4@ohuro-mail.jp");
    expect((await svc().submitSurvey("x", { intent: "unsure" })).status).toBe("invalid");
    expect((await svc().submitSurvey(tokenOf(sent[0]!.confirmUrl), { intent: "unsure" })).status).toBe("invalid");
    clock = new Date(clock.getTime() + 8 * 24 * 60 * 60 * 1000);
    expect((await svc().submitSurvey(r.surveyToken, { intent: "unsure" })).status).toBe("expired");
  });

  it("確認リンクの再利用ではアンケート用トークンを再発行しない", async () => {
    await svc().register({ email: "s5@ohuro-mail.jp", consent: true, elapsedMs: 5000, clientKey: "198.51.100.77" });
    const t = tokenOf(sent[0]!.confirmUrl);
    await svc().confirm(t);
    const again = await svc().confirm(t);
    expect(again.status).toBe("already_confirmed");
    expect(again.surveyToken).toBeUndefined();
  });
});
