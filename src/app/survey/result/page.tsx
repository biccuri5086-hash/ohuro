import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "アンケート | おふろクエスト",
  robots: { index: false, follow: false },
};

const MESSAGES: Record<string, { title: string; body: string }> = {
  saved: { title: "ご回答ありがとうございました", body: "いただいた回答は開発の参考にさせていただきます。" },
  empty: { title: "回答が選ばれていません", body: "アンケートは任意です。回答する場合は、メールのリンクから確認後に表示されたページに戻ってください。" },
  expired: { title: "アンケートの受付期間が終了しました", body: "ご協力ありがとうございました。事前登録は完了しています。" },
  invalid: { title: "回答を受け付けられませんでした", body: "リンクが正しくないか、すでに回答済みです。事前登録は完了しています。" },
  error: { title: "一時的なエラーが発生しました", body: "時間をおいてもう一度お試しください。" },
};

export default async function SurveyResultPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
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
