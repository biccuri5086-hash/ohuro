import "server-only";
import type postgres from "postgres";
import { isTestEmail, isValidEmail, normalizeEmail, sanitizeUtm, type Utm } from "@/lib/waitlist/validation";
import { CONSENT_VERSION, WAITLIST_LIMITS } from "./config";
import type { EmailSender } from "./email";
import { generateToken, hashToken, isWellFormedToken, keyedHash } from "./tokens";

export type RegisterInput = {
  email: unknown;
  consent: unknown;
  marketingOptIn?: unknown;
  utm?: unknown;
  /** 人間には見えない入力欄。値が入っていれば Bot とみなす */
  honeypot?: unknown;
  /** フォーム表示から送信までのミリ秒 */
  elapsedMs?: unknown;
  /** 送信元の識別子（IP アドレス等）。保存前に鍵付きハッシュにする */
  clientKey: string;
};

export type RegisterResult =
  | { status: "accepted" }
  | { status: "invalid_email" }
  | { status: "consent_required" }
  | { status: "rate_limited" };

export type ConfirmResult = { status: "confirmed" | "already_confirmed" | "expired" | "invalid" };

export type UnsubscribeMode = "unsubscribe" | "delete";
export type UnsubscribeResult = { status: "unsubscribed" | "deleted" | "expired" | "invalid" };

export type WaitlistDeps = {
  sql: postgres.Sql;
  sender: EmailSender;
  /** 確認リンクの組み立てに使う公開 URL（例: https://example.app） */
  baseUrl: string;
  /** IP 等のハッシュ化に使う秘密値 */
  rateLimitSecret: string;
  now?: () => Date;
  /** 秘密情報・メールアドレスを含まないメッセージだけを渡す */
  logError?: (message: string) => void;
};

type SignupRow = {
  id: string;
  confirmed_at: Date | null;
  unsubscribed_at: Date | null;
  confirmation_sent_count: number;
  last_confirmation_sent_at: Date | null;
};

export function createWaitlistService(deps: WaitlistDeps) {
  const now = deps.now ?? (() => new Date());
  const logError = deps.logError ?? ((m: string) => console.error(m));
  const L = WAITLIST_LIMITS;

  async function hitRateLimit(clientKey: string, at: Date): Promise<boolean> {
    const key = `register:${keyedHash(deps.rateLimitSecret, clientKey)}`;
    const windowStart = new Date(Math.floor(at.getTime() / L.rateLimitWindowMs) * L.rateLimitWindowMs);
    const [row] = await deps.sql<{ count: number }[]>`
      insert into waitlist.rate_limits (key, window_start, count) values (${key}, ${windowStart}, 1)
      on conflict (key, window_start) do update set count = waitlist.rate_limits.count + 1
      returning count`;
    // 古いウィンドウを掃除（1日より前）
    await deps.sql`delete from waitlist.rate_limits where window_start < ${new Date(at.getTime() - 24 * 60 * 60 * 1000)}`;
    return (row?.count ?? 0) > L.rateLimitMaxRequests;
  }

  function canSendConfirmation(row: SignupRow, at: Date): { ok: boolean; resetCount: boolean } {
    const last = row.last_confirmation_sent_at?.getTime();
    if (last === undefined) return { ok: true, resetCount: true };
    const since = at.getTime() - last;
    if (since < L.resendMinIntervalMs) return { ok: false, resetCount: false };
    if (since >= 24 * 60 * 60 * 1000) return { ok: true, resetCount: true };
    return { ok: row.confirmation_sent_count < L.maxConfirmationEmailsPerDay, resetCount: false };
  }

  async function register(input: RegisterInput): Promise<RegisterResult> {
    const at = now();
    // Bot と判定したものは保存も送信もしないが、応答は通常と同じにする（判定方法を推測させない）
    const elapsed = typeof input.elapsedMs === "number" ? input.elapsedMs : 0;
    if ((typeof input.honeypot === "string" && input.honeypot.length > 0) || elapsed < L.minFormElapsedMs) {
      return { status: "accepted" };
    }
    if (!isValidEmail(input.email)) return { status: "invalid_email" };
    if (input.consent !== true) return { status: "consent_required" };
    if (await hitRateLimit(input.clientKey, at)) return { status: "rate_limited" };

    const email = input.email.trim();
    const normalized = normalizeEmail(email);
    const utm: Utm = sanitizeUtm(input.utm);
    const marketing = input.marketingOptIn === true;
    const isTest = isTestEmail(normalized);

    const token = generateToken();
    const unsubscribeToken = generateToken();
    let shouldSend = false;

    await deps.sql.begin(async (tx) => {
      const inserted = await tx<{ id: string }[]>`
        insert into waitlist.signups ${tx({
          email,
          email_normalized: normalized,
          consented_at: at,
          consent_version: CONSENT_VERSION,
          marketing_opt_in: marketing,
          marketing_opt_in_at: marketing ? at : null,
          utm_source: utm.utm_source ?? null,
          utm_medium: utm.utm_medium ?? null,
          utm_campaign: utm.utm_campaign ?? null,
          utm_content: utm.utm_content ?? null,
          is_test: isTest,
        })}
        on conflict (email_normalized) do nothing
        returning id`;

      const [row] = await tx<SignupRow[]>`
        select id, confirmed_at, unsubscribed_at, confirmation_sent_count, last_confirmation_sent_at
        from waitlist.signups where email_normalized = ${normalized} for update`;
      if (!row) throw new Error("signup row missing after upsert");
      const isNew = inserted.length === 1;

      if (isNew) {
        shouldSend = true;
        await tx`insert into waitlist.events ${tx({ name: "signup_created", ...nullUtm(utm), is_test: isTest, occurred_at: at })}`;
      } else if (row.unsubscribed_at) {
        // 解除後の再登録: 改めて同意を取り、確認からやり直す
        await tx`
          update waitlist.signups set
            unsubscribed_at = null, confirmed_at = null, consented_at = ${at}, consent_version = ${CONSENT_VERSION},
            marketing_opt_in = ${marketing}, marketing_opt_in_at = ${marketing ? at : null}
          where id = ${row.id}`;
        shouldSend = canSendConfirmation(row, at).ok;
      } else if (row.confirmed_at) {
        shouldSend = false; // 確認済み: 何もしない（応答は同じ）
      } else {
        shouldSend = canSendConfirmation(row, at).ok;
      }

      if (shouldSend) {
        const reset = isNew || canSendConfirmation(row, at).resetCount;
        // 以前の未使用の確認トークンは無効化（最新のリンクだけが有効）
        await tx`update waitlist.tokens set used_at = ${at} where signup_id = ${row.id} and purpose = 'confirm' and used_at is null`;
        await tx`insert into waitlist.tokens ${tx({
          token_hash: hashToken(token),
          signup_id: row.id,
          purpose: "confirm",
          created_at: at,
          expires_at: new Date(at.getTime() + L.confirmTokenTtlMs),
        })}`;
        // 配信停止・削除リンク（メールごとに発行。確認前でも使える）
        await tx`insert into waitlist.tokens ${tx({
          token_hash: hashToken(unsubscribeToken),
          signup_id: row.id,
          purpose: "unsubscribe",
          created_at: at,
          expires_at: new Date(at.getTime() + L.unsubscribeTokenTtlMs),
        })}`;
        await tx`
          update waitlist.signups set
            confirmation_sent_count = ${reset ? 1 : row.confirmation_sent_count + 1},
            last_confirmation_sent_at = ${at}
          where id = ${row.id}`;
      }
    });

    if (shouldSend) {
      const link = (path: string, t: string) => {
        const u = new URL(path, deps.baseUrl);
        u.searchParams.set("token", t);
        return u.toString();
      };
      try {
        await deps.sender.sendConfirmation({
          to: email,
          confirmUrl: link("/confirm", token),
          unsubscribeUrl: link("/unsubscribe", unsubscribeToken),
          oneClickUrl: link("/api/waitlist/one-click", unsubscribeToken),
        });
      } catch (e) {
        logError(`[waitlist] confirmation email failed: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    }
    return { status: "accepted" };
  }

  async function confirm(token: unknown): Promise<ConfirmResult> {
    if (!isWellFormedToken(token)) return { status: "invalid" };
    const at = now();
    return deps.sql.begin(async (tx) => {
      const [row] = await tx<
        {
          signup_id: string;
          expires_at: Date;
          used_at: Date | null;
          confirmed_at: Date | null;
          is_test: boolean;
          utm_source: string | null;
          utm_medium: string | null;
          utm_campaign: string | null;
          utm_content: string | null;
        }[]
      >`
        select t.signup_id, t.expires_at, t.used_at, s.confirmed_at, s.is_test,
               s.utm_source, s.utm_medium, s.utm_campaign, s.utm_content
        from waitlist.tokens t join waitlist.signups s on s.id = t.signup_id
        where t.token_hash = ${hashToken(token)} and t.purpose = 'confirm'
        for update of t, s`;
      if (!row) return { status: "invalid" } as const;
      if (row.used_at) return { status: row.confirmed_at ? "already_confirmed" : "invalid" } as const;
      if (row.expires_at.getTime() <= at.getTime()) return { status: "expired" } as const;
      await tx`update waitlist.tokens set used_at = ${at} where token_hash = ${hashToken(token)}`;
      await tx`update waitlist.signups set confirmed_at = ${at}, unsubscribed_at = null where id = ${row.signup_id}`;
      await tx`insert into waitlist.events ${tx({
        name: "signup_confirmed",
        utm_source: row.utm_source,
        utm_medium: row.utm_medium,
        utm_campaign: row.utm_campaign,
        utm_content: row.utm_content,
        is_test: row.is_test,
        occurred_at: at,
      })}`;
      return { status: "confirmed" } as const;
    });
  }

  /**
   * 配信停止または登録データの削除。
   * - unsubscribe: 以後メールを送らない（集計では解除済み）。未使用の確認リンクは無効化
   * - delete: メールアドレスを含む登録データを削除（トークンも連動して削除）。計測イベントは個人情報を含まないため残る
   * 配信停止リンクは期限内なら何度でも使える（2回目以降も同じ結果）
   */
  async function unsubscribe(token: unknown, mode: UnsubscribeMode): Promise<UnsubscribeResult> {
    if (!isWellFormedToken(token)) return { status: "invalid" };
    if (mode !== "unsubscribe" && mode !== "delete") return { status: "invalid" };
    const at = now();
    return deps.sql.begin(async (tx) => {
      const [row] = await tx<{ signup_id: string; expires_at: Date }[]>`
        select t.signup_id, t.expires_at from waitlist.tokens t
        where t.token_hash = ${hashToken(token)} and t.purpose = 'unsubscribe'
        for update`;
      if (!row) return { status: "invalid" } as const;
      if (row.expires_at.getTime() <= at.getTime()) return { status: "expired" } as const;
      if (mode === "delete") {
        await tx`delete from waitlist.signups where id = ${row.signup_id}`;
        return { status: "deleted" } as const;
      }
      await tx`
        update waitlist.signups set
          unsubscribed_at = coalesce(unsubscribed_at, ${at}), marketing_opt_in = false, marketing_opt_in_at = null
        where id = ${row.signup_id}`;
      await tx`update waitlist.tokens set used_at = ${at} where signup_id = ${row.signup_id} and purpose = 'confirm' and used_at is null`;
      return { status: "unsubscribed" } as const;
    });
  }

  return { register, confirm, unsubscribe };
}

function nullUtm(utm: Utm) {
  return {
    utm_source: utm.utm_source ?? null,
    utm_medium: utm.utm_medium ?? null,
    utm_campaign: utm.utm_campaign ?? null,
    utm_content: utm.utm_content ?? null,
  };
}

export type WaitlistService = ReturnType<typeof createWaitlistService>;
