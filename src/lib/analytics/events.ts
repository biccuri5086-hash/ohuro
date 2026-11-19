// LP 計測イベントの定義（クライアント・サーバー共通）。定義の説明は EXPERIMENT_PLAN.md 4章。
export const CLIENT_EVENT_NAMES = ["lp_view", "form_view", "form_submit"] as const;
export type ClientEventName = (typeof CLIENT_EVENT_NAMES)[number];

export function isClientEventName(v: unknown): v is ClientEventName {
  return typeof v === "string" && (CLIENT_EVENT_NAMES as readonly string[]).includes(v);
}

export function isValidSessionId(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(v);
}
