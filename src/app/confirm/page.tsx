import type { Metadata } from "next";
import { CONSENT_TEXT_MARKETING } from "@/lib/waitlist/consent";
import { getWaitlist } from "@/server/waitlist";

export const metadata: Metadata = {
  title: "事前登録の確認 | おふろクエスト",
  robots: { index: false, follow: false },
  referrer: "same-origin",
};

export const dynamic = "force-dynamic";

/** 登録時に選ばれた宣伝メールの希望（初期表示用）。読み取りだけで状態は変えない */
async function initialMarketingChoice(token: string): Promise<boolean> {
  try {
    return (await getWaitlist().service.lookupConfirmation(token))?.marketingOptIn ?? false;
  } catch {
    console.error("[waitlist] confirm page lookup failed");
    return false;
  }
}

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const valid = typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
  const marketingDefault = valid ? await initialMarketingChoice(token) : false;
  return (
    <main className="simple-page">
      <h1>事前登録の確認</h1>
      {valid ? (
        <>
          <p>下のボタンを押すと、おふろクエストの事前登録（リリース情報の受け取り）が完了します。</p>
          <form method="post" action="/api/waitlist/confirm">
            <input type="hidden" name="token" value={token} />
            <p>
              <label>
                <input type="checkbox" name="marketing_opt_in" defaultChecked={marketingDefault} />{" "}
                {CONSENT_TEXT_MARKETING}
              </label>
            </p>
            <p>リリース情報の受け取りには、このチェックは必要ありません。</p>
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
