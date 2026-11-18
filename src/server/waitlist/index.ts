import "server-only";
import postgres from "postgres";
import { createConsoleSender, createResendSender, type EmailSender, type SenderIdentity } from "./email";
import { createWaitlistService, type WaitlistService } from "./service";

/**
 * 環境変数（すべてサーバー専用。NEXT_PUBLIC_ を付けない）
 * - WAITLIST_DATABASE_URL: PostgreSQL 接続文字列（Supabase の接続文字列。service_role 相当の権限）
 * - APP_BASE_URL: 公開 URL（確認リンクの組み立て、Origin 検査に使う）
 * - RATE_LIMIT_SECRET: 32 文字以上のランダム値
 * - EMAIL_PROVIDER: "console"（開発）| "resend"
 * - RESEND_API_KEY, EMAIL_FROM: EMAIL_PROVIDER=resend のとき必須
 * - OPERATOR_NAME, OPERATOR_CONTACT: メールの送信者表示（未設定ならプレースホルダー）
 */
export type WaitlistEnv = {
  databaseUrl: string;
  baseUrl: string;
  rateLimitSecret: string;
  emailProvider: "console" | "resend";
  resendApiKey?: string;
  emailFrom?: string;
  sender: SenderIdentity;
};

export class WaitlistConfigError extends Error {}

export function readWaitlistEnv(env: Record<string, string | undefined> = process.env): WaitlistEnv {
  const missing = (name: string) => new WaitlistConfigError(`環境変数 ${name} が未設定です`);
  const databaseUrl = env.WAITLIST_DATABASE_URL;
  if (!databaseUrl) throw missing("WAITLIST_DATABASE_URL");
  const baseUrl = env.APP_BASE_URL;
  if (!baseUrl) throw missing("APP_BASE_URL");
  const rateLimitSecret = env.RATE_LIMIT_SECRET;
  if (!rateLimitSecret || rateLimitSecret.length < 32) throw new WaitlistConfigError("RATE_LIMIT_SECRET は32文字以上が必要です");
  const emailProvider = env.EMAIL_PROVIDER === "resend" ? "resend" : env.EMAIL_PROVIDER === "console" ? "console" : undefined;
  if (!emailProvider) throw new WaitlistConfigError("EMAIL_PROVIDER は console または resend を指定してください");
  // 本番公開環境ではログ出力の仮送信を使わない
  if (emailProvider === "console" && env.VERCEL_ENV === "production") {
    throw new WaitlistConfigError("本番環境では EMAIL_PROVIDER=console を使えません");
  }
  if (emailProvider === "resend" && (!env.RESEND_API_KEY || !env.EMAIL_FROM)) {
    throw new WaitlistConfigError("EMAIL_PROVIDER=resend には RESEND_API_KEY と EMAIL_FROM が必要です");
  }
  return {
    databaseUrl,
    baseUrl,
    rateLimitSecret,
    emailProvider,
    resendApiKey: env.RESEND_API_KEY,
    emailFrom: env.EMAIL_FROM,
    sender: {
      operatorName: env.OPERATOR_NAME || "（運営者名：公開前に記入）",
      contact: env.OPERATOR_CONTACT || "（問い合わせ先：公開前に記入）",
    },
  };
}

let cached: { service: WaitlistService; env: WaitlistEnv } | undefined;

export function getWaitlist(): { service: WaitlistService; env: WaitlistEnv } {
  if (cached) return cached;
  const env = readWaitlistEnv();
  // Supabase の接続プーラー（トランザクションモード）でも動くよう prepare を無効化
  const sql = postgres(env.databaseUrl, { max: 3, prepare: false, idle_timeout: 20 });
  const sender: EmailSender =
    env.emailProvider === "resend"
      ? createResendSender({ apiKey: env.resendApiKey!, from: env.emailFrom!, sender: env.sender })
      : createConsoleSender(env.sender);
  cached = { service: createWaitlistService({ sql, sender, baseUrl: env.baseUrl, rateLimitSecret: env.rateLimitSecret }), env };
  return cached;
}

/** 同一オリジンからの送信かを検査する（CSRF 対策） */
export function isSameOrigin(originHeader: string | null, baseUrl: string): boolean {
  if (!originHeader) return false;
  try {
    return new URL(originHeader).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

/** 送信元識別子。Vercel では x-forwarded-for の先頭がクライアント IP */
export function clientKeyFrom(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  return first || headers.get("x-real-ip") || "unknown";
}
