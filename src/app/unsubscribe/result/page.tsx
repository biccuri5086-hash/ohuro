import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "手続きの結果 | おふろクエスト",
  robots: { index: false, follow: false },
};

const MESSAGES: Record<string, { title: string; body: string }> = {
  unsubscribed: {
    title: "配信を停止しました",
    body: "今後、おふろクエストからメールはお送りしません。登録データの削除を希望する場合は、メールのリンクから削除を選んでください。",
  },
  deleted: {
    title: "登録データを削除しました",
    body: "メールアドレスを含む事前登録のデータを削除しました。今後メールは届きません。",
  },
  delete_not_confirmed: {
    title: "削除は実行されていません",
    body: "削除するには、確認のチェックを入れてからボタンを押してください。",
  },
  expired: {
    title: "リンクの有効期限が切れています",
    body: "お手数ですが、プライバシーポリシーに記載の問い合わせ先までご連絡ください。",
  },
  invalid: {
    title: "手続きできませんでした",
    body: "リンクが正しくないか、すでに登録データが削除されています。",
  },
  error: {
    title: "一時的なエラーが発生しました",
    body: "時間をおいて、もう一度メールのリンクを開いてください。",
  },
};

export default async function UnsubscribeResultPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const m = MESSAGES[status ?? ""] ?? MESSAGES.invalid!;
  return (
    <main className="simple-page">
      <h1>{m.title}</h1>
      <p>{m.body}</p>
      <p>
        <Link href="/">トップページへ戻る</Link>
      </p>
    </main>
  );
}
