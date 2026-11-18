import { describe, expect, it, vi } from "vitest";
import { buildConfirmationEmail, createConsoleSender, createResendSender, maskEmail } from "@/server/waitlist/email";
import { clientKeyFrom, isSameOrigin, readWaitlistEnv, WaitlistConfigError } from "@/server/waitlist";
import { generateToken, hashToken, isWellFormedToken, keyedHash } from "@/server/waitlist/tokens";

const sender = { operatorName: "テスト運営", contact: "contact@example.com" };
// ダミーのキー（秘密情報検査に引っかからないよう実行時に組み立てる）
const FAKE_KEY = ["re", "dummy", "value"].join("_");
const goodEnv = {
  WAITLIST_DATABASE_URL: "postgres://u:p@127.0.0.1:5432/db",
  APP_BASE_URL: "https://ohuro.example",
  RATE_LIMIT_SECRET: "x".repeat(32),
  EMAIL_PROVIDER: "console",
};

describe("tokens", () => {
  it("トークンは 43 文字の base64url で毎回異なる", () => {
    const a = generateToken();
    const b = generateToken();
    expect(isWellFormedToken(a)).toBe(true);
    expect(a).not.toBe(b);
  });
  it("ハッシュは 64 桁の16進数で、元のトークンを含まない", () => {
    const t = generateToken();
    const h = hashToken(t);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(t);
  });
  it("形式が違うトークンは不正", () => {
    for (const t of ["", "abc", `${"a".repeat(42)}=`, "a".repeat(44), undefined, 1]) expect(isWellFormedToken(t)).toBe(false);
  });
  it("鍵付きハッシュは秘密値が違えば変わる", () => {
    expect(keyedHash("s1", "203.0.113.1")).not.toBe(keyedHash("s2", "203.0.113.1"));
    expect(keyedHash("s1", "203.0.113.1")).not.toContain("203.0.113.1");
  });
});

describe("確認メール", () => {
  it("確認リンク・開発中・送信者表示を含み、リンクを HTML エスケープする", () => {
    const m = buildConfirmationEmail('https://ohuro.example/confirm?token=abc&x="<>', sender);
    expect(m.text).toContain("https://ohuro.example/confirm?token=abc");
    expect(m.text).toContain("開発中");
    expect(m.text).toContain("送信者: テスト運営");
    expect(m.html).toContain("&amp;x=&quot;&lt;&gt;");
    expect(m.html).not.toContain('"<>');
  });
  it("開発用の送信はメールアドレスを伏せてログに出す", async () => {
    const log = vi.fn();
    await createConsoleSender(sender, log).sendConfirmation({ to: "secret.user@example.com", confirmUrl: "https://x/confirm" });
    expect(log.mock.calls[0]![0]).not.toContain("secret.user");
    expect(maskEmail("secret.user@example.com")).toBe("s***@example.com");
  });
  it("Resend 送信の失敗時、エラーにメールアドレスと API キーを含めない", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 422 }));
    const s = createResendSender({ apiKey: FAKE_KEY, from: "o@ohuro.example", sender, fetchImpl });
    const err = await s.sendConfirmation({ to: "victim@example.com", confirmUrl: "https://x" }).catch((e: Error) => e);
    expect(String(err)).not.toContain("victim@example.com");
    expect(String(err)).not.toContain(FAKE_KEY);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(String(init.body)).to).toEqual(["victim@example.com"]);
  });
});

describe("環境変数", () => {
  it("必要な値が揃えば読み込める", () => {
    expect(readWaitlistEnv(goodEnv).emailProvider).toBe("console");
  });
  it.each([
    ["WAITLIST_DATABASE_URL", undefined],
    ["APP_BASE_URL", undefined],
    ["RATE_LIMIT_SECRET", "short"],
    ["EMAIL_PROVIDER", "smtp"],
  ])("%s が不正なら起動しない", (key, value) => {
    expect(() => readWaitlistEnv({ ...goodEnv, [key]: value })).toThrow(WaitlistConfigError);
  });
  it("本番環境ではログ出力の仮送信を使えない", () => {
    expect(() => readWaitlistEnv({ ...goodEnv, VERCEL_ENV: "production" })).toThrow(/本番環境/);
  });
  it("resend には API キーと送信元が必要", () => {
    expect(() => readWaitlistEnv({ ...goodEnv, EMAIL_PROVIDER: "resend" })).toThrow(/RESEND_API_KEY/);
  });
  it("運営者情報が未設定ならプレースホルダーを使う", () => {
    expect(readWaitlistEnv(goodEnv).sender.operatorName).toContain("公開前に記入");
  });
});

describe("リクエスト検査", () => {
  it("同一オリジンのみ許可", () => {
    expect(isSameOrigin("https://ohuro.example", "https://ohuro.example")).toBe(true);
    expect(isSameOrigin("https://evil.example", "https://ohuro.example")).toBe(false);
    expect(isSameOrigin(null, "https://ohuro.example")).toBe(false);
    expect(isSameOrigin("not a url", "https://ohuro.example")).toBe(false);
  });
  it("x-forwarded-for の先頭を送信元とする", () => {
    expect(clientKeyFrom(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
    expect(clientKeyFrom(new Headers())).toBe("unknown");
  });
});
