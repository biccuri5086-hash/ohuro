// ブラウザ側の計測（ファーストパーティのみ。外部のタグは使わない）。
// - セッションID: タブ単位のランダムID（sessionStorage）。個人とは結び付けない
// - テスト流入: URL に ohuro_test=1 があれば、そのタブの計測をテストとして記録（集計から除外）
import { captureUtm } from "@/lib/waitlist/attribution";
import type { ClientEventName } from "./events";

const SESSION_KEY = "ohuro_sid";
const TEST_KEY = "ohuro_test";
const SENT_KEY = (name: string) => `ohuro_sent_${name}`;

function storage(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

function sessionId(st: Storage | undefined): string | undefined {
  try {
    const existing = st?.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    st?.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return undefined;
  }
}

function isTestSession(st: Storage | undefined): boolean {
  try {
    if (new URLSearchParams(window.location.search).get("ohuro_test") === "1") {
      st?.setItem(TEST_KEY, "1");
      return true;
    }
    return st?.getItem(TEST_KEY) === "1";
  } catch {
    return false;
  }
}

/** イベントを送る。once=true のイベントは同じタブで1回だけ送る */
export function track(name: ClientEventName, { once = true }: { once?: boolean } = {}): void {
  if (typeof window === "undefined") return;
  const st = storage();
  try {
    if (once && st?.getItem(SENT_KEY(name))) return;
    st?.setItem(SENT_KEY(name), "1");
  } catch {
    // ストレージが使えない場合はそのまま送る（集計は session_id で重複除外される）
  }
  const sid = sessionId(st);
  if (!sid) return;
  const body = JSON.stringify({ name, sessionId: sid, utm: captureUtm(window.location.search, st), test: isTestSession(st) });
  fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {
    // 計測の失敗は利用者の操作に影響させない
  });
}
