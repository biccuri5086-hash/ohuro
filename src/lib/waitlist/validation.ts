// 事前登録の入力検証（クライアント・サーバー共通。副作用なし）

export const EMAIL_MAX_LENGTH = 254;

/** 重複判定用の正規化（前後空白除去・小文字化） */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

const LOCAL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const TLD_RE = /^[A-Za-z]{2,63}$/;

/**
 * 実用上のメールアドレス検証（ASCII のみ）。完全な RFC 準拠ではなく、
 * 登録の可否は最終的に確認メールの到達とリンククリックで判断する。
 */
export function isValidEmail(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const email = raw.trim();
  if (email.length < 3 || email.length > EMAIL_MAX_LENGTH) return false;
  const at = email.lastIndexOf("@");
  if (at <= 0 || email.indexOf("@") !== at) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || !LOCAL_RE.test(local)) return false;
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  if (!labels.every((l) => LABEL_RE.test(l))) return false;
  return TLD_RE.test(labels.at(-1)!);
}

const TEST_DOMAINS = new Set(["example.com", "example.net", "example.org"]);
const TEST_TLDS = [".test", ".example", ".invalid", ".localhost"];

/**
 * テスト登録の判定（集計から除外する）。
 * - 予約ドメイン（RFC 2606）
 * - ローカル部に "+ohuro-test" を含むアドレス（実際に届くアドレスで試験する場合に使う）
 */
export function isTestEmail(normalized: string): boolean {
  const at = normalized.lastIndexOf("@");
  if (at < 0) return false;
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (TEST_DOMAINS.has(domain)) return true;
  if (TEST_TLDS.some((t) => domain.endsWith(t))) return true;
  return local.includes("+ohuro-test");
}

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content"] as const;
export type UtmKey = (typeof UTM_KEYS)[number];
export type Utm = Partial<Record<UtmKey, string>>;

const UTM_VALUE_RE = /^[A-Za-z0-9_.-]{1,100}$/;

/** UTM パラメータを許可文字・長さで検査し、不正な値は捨てる */
export function sanitizeUtm(input: unknown): Utm {
  const out: Utm = {};
  if (!input || typeof input !== "object") return out;
  for (const key of UTM_KEYS) {
    const v = (input as Record<string, unknown>)[key];
    if (typeof v === "string" && UTM_VALUE_RE.test(v)) out[key] = v;
  }
  return out;
}
