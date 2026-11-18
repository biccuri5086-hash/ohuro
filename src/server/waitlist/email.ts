import "server-only";

export type ConfirmationEmailInput = { to: string; confirmUrl: string; unsubscribeUrl: string; oneClickUrl: string };

export interface EmailSender {
  sendConfirmation(input: ConfirmationEmailInput): Promise<void>;
}

export type SenderIdentity = {
  /** 送信者（運営者）名。特定電子メール法の表示に使う。未確定の間はプレースホルダー */
  operatorName: string;
  /** 問い合わせ先 */
  contact: string;
};

/** 確認メールの本文（日本語）。登録の確認であり、広告宣伝ではない */
export function buildConfirmationEmail(confirmUrl: string, unsubscribeUrl: string, sender: SenderIdentity) {
  const subject = "【おふろクエスト】事前登録の確認をお願いします";
  const text = [
    "おふろクエストの事前登録（リリース情報の受け取り）を受け付けました。",
    "",
    "登録を完了するには、24時間以内に次のリンクを開き、確認ボタンを押してください。",
    confirmUrl,
    "",
    "このメールに心当たりがない場合は、何もしないでください。確認されない登録は完了しません。",
    "",
    "おふろクエストは開発中のサービスです。公開日は未定です。",
    "",
    "配信停止・登録データの削除はこちら:",
    unsubscribeUrl,
    "",
    `送信者: ${sender.operatorName}`,
    `お問い合わせ: ${sender.contact}`,
  ].join("\n");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const html = `<!doctype html><html lang="ja"><body style="font-family:sans-serif;line-height:1.7">
<p>おふろクエストの事前登録（リリース情報の受け取り）を受け付けました。</p>
<p>登録を完了するには、24時間以内に次のボタンから確認ページを開き、確認ボタンを押してください。</p>
<p><a href="${esc(confirmUrl)}" style="display:inline-block;padding:12px 20px;background:#2b7bb9;color:#fff;border-radius:8px;text-decoration:none">確認ページを開く</a></p>
<p style="font-size:12px;color:#555">ボタンが開けない場合: ${esc(confirmUrl)}</p>
<p>このメールに心当たりがない場合は、何もしないでください。確認されない登録は完了しません。</p>
<p>おふろクエストは開発中のサービスです。公開日は未定です。</p>
<p style="font-size:12px;color:#555">配信停止・登録データの削除: <a href="${esc(unsubscribeUrl)}">${esc(unsubscribeUrl)}</a></p>
<hr><p style="font-size:12px;color:#555">送信者: ${esc(sender.operatorName)}<br>お問い合わせ: ${esc(sender.contact)}</p>
</body></html>`;
  return { subject, text, html };
}

/** 開発用: 送信せずログに出す。メールアドレスは伏せる */
export function createConsoleSender(sender: SenderIdentity, log: (msg: string) => void = console.info): EmailSender {
  return {
    async sendConfirmation({ to, confirmUrl, unsubscribeUrl }) {
      const { subject } = buildConfirmationEmail(confirmUrl, unsubscribeUrl, sender);
      log(`[waitlist:dev-email] to=${maskEmail(to)} subject=${subject} confirmUrl=${confirmUrl} unsubscribeUrl=${unsubscribeUrl}`);
    },
  };
}

/**
 * Resend（https://resend.com）経由の送信。API の仕様は契約時に公式ドキュメントで再確認すること（未検証: D-011）。
 * 失敗時はメールアドレスや API キーを含まないエラーを投げる。
 */
export function createResendSender(opts: {
  apiKey: string;
  from: string;
  sender: SenderIdentity;
  fetchImpl?: typeof fetch;
}): EmailSender {
  const fetchImpl = opts.fetchImpl ?? fetch;
  return {
    async sendConfirmation({ to, confirmUrl, unsubscribeUrl, oneClickUrl }) {
      const { subject, text, html } = buildConfirmationEmail(confirmUrl, unsubscribeUrl, opts.sender);
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: opts.from,
          to: [to],
          subject,
          text,
          html,
          // RFC 8058 のワンクリック配信停止（メールソフトの「配信停止」ボタン）
          headers: { "List-Unsubscribe": `<${oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        }),
      });
      if (!res.ok) throw new Error(`email provider responded with status ${res.status}`);
    },
  };
}

export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***@${email.slice(at + 1)}`;
}
