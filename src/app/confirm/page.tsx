import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "事前登録の確認 | おふろクエスト",
  robots: { index: false, follow: false },
  referrer: "same-origin",
};

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const valid = typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
  return (
    <main className="simple-page">
      <h1>事前登録の確認</h1>
      {valid ? (
        <>
          <p>下のボタンを押すと、おふろクエストの事前登録（リリース情報の受け取り）が完了します。</p>
          <form method="post" action="/api/waitlist/confirm">
            <input type="hidden" name="token" value={token} />
            <button type="submit" className="button-primary">
              登録を確認する
            </button>
          </form>
        </>
      ) : (
        <p>確認リンクが正しくありません。メールに記載されたリンクをもう一度開いてください。</p>
      )}
    </main>
  );
}
