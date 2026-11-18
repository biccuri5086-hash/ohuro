import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createWaitlistService, type RegisterInput } from "@/server/waitlist/service";
import type { EmailSender } from "@/server/waitlist/email";
import { createTestDatabase, type Sql } from "./helpers";

let sql: Sql;
let drop: () => Promise<void>;
let clock: Date;
let sent: { to: string; confirmUrl: string; unsubscribeUrl: string; oneClickUrl: string }[];
let failSend = false;
const errors: string[] = [];

const sender: EmailSender = {
  async sendConfirmation(m) {
    if (failSend) throw new Error("provider down");
    sent.push(m);
  },
};

function service() {
  return createWaitlistService({
    sql,
    sender,
    baseUrl: "https://ohuro.example",
    rateLimitSecret: "s".repeat(32),
    now: () => new Date(clock),
    logError: (m) => errors.push(m),
  });
}

const advance = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
};
const tokenOf = (url: string) => new URL(url).searchParams.get("token")!;
let ipSeq = 0;
const input = (over: Partial<RegisterInput> = {}): RegisterInput => ({
  email: "user@ohuro-mail.jp",
  consent: true,
  elapsedMs: 5000,
  clientKey: `198.51.100.${ipSeq++ % 250}`,
  ...over,
});
const countSignups = async () => (await sql`select count(*)::int as n from waitlist.signups`)[0]!.n as number;

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
  failSend = false;
  errors.length = 0;
});

describe("登録（G0-2）", () => {
  it("新規登録で未確認の登録・確認トークン・確認メール1通・登録イベントができる", async () => {
    const r = await service().register(input({ utm: { utm_source: "instagram", utm_content: "ad_a_v1", bad: "x" } }));
    expect(r.status).toBe("accepted");
    const [s] = await sql`select * from waitlist.signups`;
    expect(s!.email_normalized).toBe("user@ohuro-mail.jp");
    expect(s!.confirmed_at).toBeNull();
    expect(s!.utm_content).toBe("ad_a_v1");
    expect(s!.consent_version).toBeTruthy();
    expect(s!.is_test).toBe(false);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.confirmUrl).toMatch(/^https:\/\/ohuro\.example\/confirm\?token=[A-Za-z0-9_-]{43}$/);
    const tokens = await sql`select token_hash, purpose from waitlist.tokens order by purpose`;
    // 確認用と配信停止用（G0-3）が1件ずつ
    expect(tokens.map((t) => t.purpose)).toEqual(["confirm", "unsubscribe"]);
    for (const t of tokens) {
      expect(t.token_hash).not.toContain(tokenOf(sent[0]!.confirmUrl)); // 平文は保存しない
      expect(t.token_hash).not.toContain(tokenOf(sent[0]!.unsubscribeUrl));
    }
    const ev = await sql`select name, utm_content from waitlist.events`;
    expect(ev.map((e) => [e.name, e.utm_content])).toEqual([["signup_created", "ad_a_v1"]]);
  });

  it("不正なメールアドレスは保存せずエラーにする", async () => {
    expect((await service().register(input({ email: "not-an-email" }))).status).toBe("invalid_email");
    expect(await countSignups()).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("同意がなければ保存しない", async () => {
    expect((await service().register(input({ consent: "true" }))).status).toBe("consent_required");
    expect(await countSignups()).toBe(0);
  });

  it("ハニーポットに入力がある・送信が速すぎる場合は保存も送信もしないが、応答は同じ", async () => {
    expect((await service().register(input({ honeypot: "http://spam" }))).status).toBe("accepted");
    expect((await service().register(input({ elapsedMs: 300 }))).status).toBe("accepted");
    expect(await countSignups()).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("二重送信・表記ゆれの再登録は1件として扱う", async () => {
    const svc = service();
    await Promise.all([svc.register(input()), svc.register(input({ email: " USER@Ohuro-Mail.jp " }))]);
    expect(await countSignups()).toBe(1);
    const created = await sql`select count(*)::int as n from waitlist.events where name = 'signup_created'`;
    expect(created[0]!.n).toBe(1);
  });

  it("確認メールの再送は 60 秒間隔・24 時間に 3 通まで。最新のリンクだけ有効", async () => {
    const svc = service();
    await svc.register(input());
    await svc.register(input()); // 60 秒以内: 送らない
    expect(sent).toHaveLength(1);
    advance(61_000);
    await svc.register(input());
    advance(61_000);
    await svc.register(input());
    advance(61_000);
    await svc.register(input()); // 4 通目: 送らない
    expect(sent).toHaveLength(3);
    expect((await svc.confirm(tokenOf(sent[0]!.confirmUrl))).status).toBe("invalid"); // 古いリンク
    expect((await svc.confirm(tokenOf(sent[2]!.confirmUrl))).status).toBe("confirmed");
    advance(25 * 60 * 60 * 1000);
    await svc.register(input()); // 確認済み: 送らない
    expect(sent).toHaveLength(3);
  });

  it("24 時間たてば再送の上限はリセットされる", async () => {
    const svc = service();
    for (let i = 0; i < 3; i++) {
      await svc.register(input());
      advance(61_000);
    }
    await svc.register(input());
    expect(sent).toHaveLength(3);
    advance(24 * 60 * 60 * 1000);
    await svc.register(input());
    expect(sent).toHaveLength(4);
  });

  it("同じ送信元からの大量登録はレート制限する", async () => {
    const svc = service();
    const results = [];
    for (let i = 0; i < 12; i++) {
      results.push((await svc.register(input({ email: `bulk${i}@ohuro-mail.jp`, clientKey: "203.0.113.9" }))).status);
    }
    expect(results.filter((r) => r === "rate_limited")).toHaveLength(2);
    expect(await countSignups()).toBe(10);
    const keys = await sql`select key from waitlist.rate_limits`;
    expect(keys.every((k) => !String(k.key).includes("203.0.113.9"))).toBe(true); // IP を平文で保存しない
  });

  it("テスト用アドレスはテスト登録として保存する", async () => {
    await service().register(input({ email: "me+ohuro-test@gmail.com" }));
    const [s] = await sql`select is_test from waitlist.signups`;
    expect(s!.is_test).toBe(true);
    const [e] = await sql`select is_test from waitlist.events`;
    expect(e!.is_test).toBe(true);
  });

  it("宣伝メールの同意は任意で、同意日時と一緒に保存する", async () => {
    await service().register(input({ email: "a@ohuro-mail.jp" }));
    await service().register(input({ email: "b@ohuro-mail.jp", marketingOptIn: true }));
    const rows = await sql`select email_normalized, marketing_opt_in, marketing_opt_in_at from waitlist.signups order by email_normalized`;
    expect(rows.map((r) => [r.marketing_opt_in, r.marketing_opt_in_at !== null])).toEqual([
      [false, false],
      [true, true],
    ]);
  });

  it("メール送信に失敗しても登録は残り、ログにメールアドレスを出さない", async () => {
    failSend = true;
    expect((await service().register(input())).status).toBe("accepted");
    expect(await countSignups()).toBe(1);
    expect(errors.join()).not.toContain("user@ohuro-mail.jp");
  });
});

describe("確認（G0-2）", () => {
  it("確認すると確認済みになり、確認イベントが流入元付きで記録される", async () => {
    const svc = service();
    await svc.register(input({ utm: { utm_content: "ad_b_v1" } }));
    expect((await svc.confirm(tokenOf(sent[0]!.confirmUrl))).status).toBe("confirmed");
    const [s] = await sql`select confirmed_at from waitlist.signups`;
    expect(s!.confirmed_at).not.toBeNull();
    const [e] = await sql`select utm_content from waitlist.events where name = 'signup_confirmed'`;
    expect(e!.utm_content).toBe("ad_b_v1");
  });

  it("同じリンクの再利用は確認済みと表示し、確認イベントを重複させない", async () => {
    const svc = service();
    await svc.register(input());
    const t = tokenOf(sent[0]!.confirmUrl);
    await svc.confirm(t);
    expect((await svc.confirm(t)).status).toBe("already_confirmed");
    const n = await sql`select count(*)::int as n from waitlist.events where name = 'signup_confirmed'`;
    expect(n[0]!.n).toBe(1);
  });

  it("24 時間を過ぎたリンクは期限切れ", async () => {
    const svc = service();
    await svc.register(input());
    advance(24 * 60 * 60 * 1000 + 1);
    expect((await svc.confirm(tokenOf(sent[0]!.confirmUrl))).status).toBe("expired");
    const [s] = await sql`select confirmed_at from waitlist.signups`;
    expect(s!.confirmed_at).toBeNull();
  });

  it("改ざん・形式不正のトークンは不正", async () => {
    const svc = service();
    await svc.register(input());
    const t = tokenOf(sent[0]!.confirmUrl);
    const tampered = (t[0] === "A" ? "B" : "A") + t.slice(1);
    expect((await svc.confirm(tampered)).status).toBe("invalid");
    expect((await svc.confirm("short")).status).toBe("invalid");
    expect((await svc.confirm(undefined)).status).toBe("invalid");
  });

  it("解除済みの人が再登録すると、改めて確認からやり直す", async () => {
    const svc = service();
    await svc.register(input());
    await svc.confirm(tokenOf(sent[0]!.confirmUrl));
    await sql`update waitlist.signups set unsubscribed_at = now()`;
    advance(61_000);
    await svc.register(input());
    const [s] = await sql`select confirmed_at, unsubscribed_at from waitlist.signups`;
    expect(s!.confirmed_at).toBeNull();
    expect(s!.unsubscribed_at).toBeNull();
    expect(sent).toHaveLength(2);
  });
});

describe("配信停止・削除（G0-3）", () => {
  it("確認メールに配信停止リンクとワンクリック用リンクが付く", async () => {
    await service().register(input());
    expect(sent[0]!.unsubscribeUrl).toMatch(/^https:\/\/ohuro\.example\/unsubscribe\?token=[A-Za-z0-9_-]{43}$/);
    expect(tokenOf(sent[0]!.oneClickUrl)).toBe(tokenOf(sent[0]!.unsubscribeUrl));
    expect(tokenOf(sent[0]!.unsubscribeUrl)).not.toBe(tokenOf(sent[0]!.confirmUrl));
  });

  it("配信停止で解除済みになり、宣伝メールの同意も取り消され、未使用の確認リンクは使えなくなる", async () => {
    const svc = service();
    await svc.register(input({ marketingOptIn: true }));
    const u = tokenOf(sent[0]!.unsubscribeUrl);
    expect((await svc.unsubscribe(u, "unsubscribe")).status).toBe("unsubscribed");
    const [s] = await sql`select unsubscribed_at, marketing_opt_in from waitlist.signups`;
    expect(s!.unsubscribed_at).not.toBeNull();
    expect(s!.marketing_opt_in).toBe(false);
    expect((await svc.confirm(tokenOf(sent[0]!.confirmUrl))).status).toBe("invalid");
    // 2 回目も同じ結果（解除日時は最初のまま）
    advance(1000);
    expect((await svc.unsubscribe(u, "unsubscribe")).status).toBe("unsubscribed");
    const [s2] = await sql`select unsubscribed_at from waitlist.signups`;
    expect(s2!.unsubscribed_at.getTime()).toBe(s!.unsubscribed_at.getTime());
  });

  it("確認済みの登録も配信停止でき、集計では解除済みになる", async () => {
    const svc = service();
    await svc.register(input({ utm: { utm_content: "ad_a_v1" } }));
    await svc.confirm(tokenOf(sent[0]!.confirmUrl));
    await svc.unsubscribe(tokenOf(sent[0]!.unsubscribeUrl), "unsubscribe");
    const [r] = await sql`select signups_confirmed, signups_confirmed_active from waitlist.signup_summary_by_creative`;
    expect([Number(r!.signups_confirmed), Number(r!.signups_confirmed_active)]).toEqual([1, 0]);
  });

  it("削除するとメールアドレスを含む登録データとトークンが消え、同じリンクは以後使えない", async () => {
    const svc = service();
    await svc.register(input());
    const u = tokenOf(sent[0]!.unsubscribeUrl);
    expect((await svc.unsubscribe(u, "delete")).status).toBe("deleted");
    expect(await countSignups()).toBe(0);
    expect((await sql`select count(*)::int as n from waitlist.tokens`)[0]!.n).toBe(0);
    const emailLeft = await sql`select count(*)::int as n from waitlist.events where row_to_json(events)::text ilike '%ohuro-mail.jp%'`;
    expect(emailLeft[0]!.n).toBe(0);
    expect((await svc.unsubscribe(u, "delete")).status).toBe("invalid");
  });

  it("他人の登録は操作できない（改ざん・形式不正・確認用トークンの流用）", async () => {
    const svc = service();
    await svc.register(input());
    const u = tokenOf(sent[0]!.unsubscribeUrl);
    const tampered = (u[0] === "A" ? "B" : "A") + u.slice(1);
    expect((await svc.unsubscribe(tampered, "delete")).status).toBe("invalid");
    expect((await svc.unsubscribe("short", "delete")).status).toBe("invalid");
    expect((await svc.unsubscribe(tokenOf(sent[0]!.confirmUrl), "delete")).status).toBe("invalid");
    expect((await svc.unsubscribe(u, "drop" as never)).status).toBe("invalid");
    expect(await countSignups()).toBe(1);
  });

  it("期限切れの配信停止リンクは使えない", async () => {
    const svc = service();
    await svc.register(input());
    advance(366 * 24 * 60 * 60 * 1000);
    expect((await svc.unsubscribe(tokenOf(sent[0]!.unsubscribeUrl), "unsubscribe")).status).toBe("expired");
  });

  it("再送のたびに新しい配信停止リンクが発行され、古いものも期限内は有効", async () => {
    const svc = service();
    await svc.register(input());
    advance(61_000);
    await svc.register(input());
    expect(sent).toHaveLength(2);
    expect((await svc.unsubscribe(tokenOf(sent[0]!.unsubscribeUrl), "unsubscribe")).status).toBe("unsubscribed");
  });
});
