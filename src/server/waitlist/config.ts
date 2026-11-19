import "server-only";

// 事前登録の運用パラメータ（仮値。変更時は DECISIONS.md に記録）
export const WAITLIST_LIMITS = {
  /** 確認リンクの有効期限 */
  confirmTokenTtlMs: 24 * 60 * 60 * 1000,
  /** 配信停止・削除リンクの有効期限（メールごとに発行） */
  unsubscribeTokenTtlMs: 365 * 24 * 60 * 60 * 1000,
  /** 同じアドレスへの確認メール再送の最短間隔 */
  resendMinIntervalMs: 60 * 1000,
  /** 同じアドレスへの確認メールの 24 時間あたり上限 */
  maxConfirmationEmailsPerDay: 3,
  /** 同じ送信元（IP の鍵付きハッシュ）からの登録リクエスト上限 */
  rateLimitWindowMs: 10 * 60 * 1000,
  rateLimitMaxRequests: 10,
  /** フォーム表示から送信までの最短時間（これより速い送信は Bot とみなし、保存しない） */
  minFormElapsedMs: 2000,
} as const;

// 同意文面の版は src/lib/waitlist/consent.ts が唯一の定義
export { CONSENT_VERSION } from "@/lib/waitlist/consent";
