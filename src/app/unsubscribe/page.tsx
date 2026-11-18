import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "配信停止・登録データの削除 | おふろクエスト",
  robots: { index: false, follow: false },
  referrer: "same-origin",
};

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const valid = typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
  if (!valid) {
    return (
      <main className="simple-page">
        <h1>配信停止・登録データの削除</h1>
        <p>リンクが正しくありません。メールに記載されたリンクをもう一度開いてください。</p>
        <p>メールが手元にない場合は、プライバシーポリシーに記載の問い合わせ先までご連絡ください。</p>
      </main>
    );
  }
  return (
    <main className="simple-page">
      <h1>配信停止・登録データの削除</h1>

      <section>
        <h2>メールの配信を停止する</h2>
        <p>おふろクエストからのメール（リリースのお知らせ等）が届かなくなります。登録データは残ります。</p>
        <form method="post" action="/api/waitlist/unsubscribe">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="mode" value="unsubscribe" />
          <button type="submit" className="button-primary">
            配信を停止する
          </button>
        </form>
      </section>

      <section>
        <h2>登録データを削除する</h2>
        <p>メールアドレスを含む事前登録のデータを削除します。削除すると元に戻せません。</p>
        <form method="post" action="/api/waitlist/unsubscribe">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="mode" value="delete" />
          <label className="check">
            <input type="checkbox" name="confirm_delete" value="yes" required /> 削除すると元に戻せないことを理解しました
          </label>
          <button type="submit" className="button-danger">
            登録データを削除する
          </button>
        </form>
      </section>
    </main>
  );
}
