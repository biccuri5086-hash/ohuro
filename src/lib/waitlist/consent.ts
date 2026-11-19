// 同意文面とプライバシーポリシーの版（クライアント・サーバー共通の唯一の定義）。
// 文面を変えたら版を上げる。登録時にこの版を保存する（waitlist.signups.consent_version）。
// "-draft" が付いている間は法務確認前（docs/legal/GATE0_LEGAL_CHECKLIST.md）。公開前に所有者が確定する。
export const CONSENT_VERSION = "2026-11-18-draft";

export const CONSENT_TEXT_REQUIRED =
  "プライバシーポリシーに同意し、おふろクエストのリリース情報（公開のお知らせ等）をメールで受け取ります（必須）";

export const CONSENT_TEXT_MARKETING = "リリース情報以外のお知らせ（キャンペーン等）も受け取る（任意）";

export const PRIVACY_POLICY_VERSION = CONSENT_VERSION;
