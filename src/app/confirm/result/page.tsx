import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "事前登録の確認結果 | おふろクエスト",
  robots: { index: false, follow: false },
};

const MESSAGES: Record<string, { title: string; body: string }> = {
  confirmed: {
    title: "事前登録が完了しました",
    body: "ありがとうございます。おふろクエストの公開が決まったら、登録したメールアドレスにお知らせします。公開日は未定です。",
  },
  already_confirmed: {
    title: "この登録は確認済みです",
    body: "すでに事前登録は完了しています。追加の手続きは必要ありません。",
  },
  expired: {
    title: "確認リンクの有効期限が切れています",
    body: "お手数ですが、トップページから同じメールアドレスでもう一度登録してください。新しい確認メールをお送りします。",
  },
  invalid: {
    title: "確認できませんでした",
    body: "リンクが正しくないか、すでに新しい確認メールが送られています。最新のメールのリンクを開いてください。",
  },
  error: {
    title: "一時的なエラーが発生しました",
    body: "時間をおいて、もう一度メールのリンクを開いてください。",
  },
};

export default async function ConfirmResultPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
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
