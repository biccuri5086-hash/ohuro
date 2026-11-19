"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { captureUtm } from "@/lib/waitlist/attribution";
import { isValidEmail, type Utm } from "@/lib/waitlist/validation";

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done" }
  | { kind: "error"; message: string };

const ERROR_MESSAGES: Record<string, string> = {
  invalid_email: "メールアドレスの形式が正しくありません。入力内容をご確認ください。",
  consent_required: "登録には、プライバシーポリシーとリリース情報の受信への同意が必要です。",
  rate_limited: "短時間に多くの送信がありました。しばらく時間をおいてからお試しください。",
};

export function SignupForm({ onEvent }: { onEvent?: (name: "form_view" | "form_submit") => void }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const shownAt = useRef<number>(0);
  const utm = useRef<Utm>({});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    shownAt.current = Date.now();
    let storage: Storage | undefined;
    try {
      storage = window.sessionStorage;
    } catch {
      storage = undefined;
    }
    utm.current = captureUtm(window.location.search, storage);
    // フォームが画面に入ったら1回だけ「フォーム表示」を記録（G0-5）
    const el = formRef.current;
    if (!el || !onEvent || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        onEvent("form_view");
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [onEvent]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state.kind === "sending") return; // 二重送信防止
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "");
    if (!isValidEmail(email)) {
      setState({ kind: "error", message: ERROR_MESSAGES.invalid_email! });
      return;
    }
    if (data.get("consent") !== "yes") {
      setState({ kind: "error", message: ERROR_MESSAGES.consent_required! });
      return;
    }
    setState({ kind: "sending" });
    onEvent?.("form_submit");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          consent: true,
          marketingOptIn: data.get("marketing") === "yes",
          utm: utm.current,
          website: String(data.get("website") ?? ""),
          elapsedMs: Date.now() - shownAt.current,
        }),
      });
      if (res.ok) {
        setState({ kind: "done" });
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setState({ kind: "error", message: ERROR_MESSAGES[body.error ?? ""] ?? "送信できませんでした。時間をおいてもう一度お試しください。" });
    } catch {
      setState({ kind: "error", message: "通信できませんでした。電波の良い場所でもう一度お試しください。" });
    }
  }

  if (state.kind === "done") {
    return (
      <div className="signup-done" role="status">
        <p className="signup-done-title">確認メールを送りました</p>
        <p>
          24時間以内に、メールのリンクから確認ページを開き「登録を確認する」を押すと事前登録が完了します。
          届かない場合は、迷惑メールフォルダもご確認ください。
        </p>
      </div>
    );
  }

  return (
    <form ref={formRef} className="signup-form" onSubmit={onSubmit} noValidate>
      <label htmlFor="email" className="field-label">
        メールアドレス
      </label>
      <input
        id="email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        maxLength={254}
        placeholder="you@example.com"
        className="field-input"
      />
      {/* Bot 対策（人には見えない入力欄。入力しないでください） */}
      <div className="hp" aria-hidden="true">
        <label htmlFor="website">ウェブサイト</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <label className="check">
        <input type="checkbox" name="consent" value="yes" required />
        <span>
          <a href="/privacy" target="_blank" rel="noopener">
            プライバシーポリシー
          </a>
          に同意し、おふろクエストのリリース情報（公開のお知らせ等）をメールで受け取ります（必須）
        </span>
      </label>
      <label className="check">
        <input type="checkbox" name="marketing" value="yes" />
        <span>リリース情報以外のお知らせ（キャンペーン等）も受け取る（任意）</span>
      </label>
      <button type="submit" className="button-primary button-block" disabled={state.kind === "sending"}>
        {state.kind === "sending" ? "送信中…" : "無料で事前登録する"}
      </button>
      {state.kind === "error" && (
        <p className="form-error" role="alert">
          {state.message}
        </p>
      )}
      <p className="form-note">
        事前登録は、リリース情報を受け取るための手続きです。アプリのアカウント作成ではありません。いつでも配信停止・登録データの削除ができます。
      </p>
    </form>
  );
}
