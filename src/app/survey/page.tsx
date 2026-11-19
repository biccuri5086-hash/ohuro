import type { Metadata } from "next";
import { SURVEY_FREE_TEXT_MAX, SURVEY_QUESTIONS } from "@/lib/waitlist/survey";

export const metadata: Metadata = {
  title: "任意アンケート | おふろクエスト",
  robots: { index: false, follow: false },
  referrer: "same-origin",
};

export default async function SurveyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const valid = typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
  if (!valid) {
    return (
      <main className="simple-page">
        <h1>任意アンケート</h1>
        <p>リンクが正しくありません。</p>
      </main>
    );
  }
  return (
    <main className="simple-page">
      <h1>任意アンケート</h1>
      <p>回答はすべて任意です。答えたくない質問は空欄のままで構いません。回答は開発の参考として、個人を特定しない形で集計します。</p>
      <form method="post" action="/api/waitlist/survey" className="survey">
        <input type="hidden" name="token" value={token} />
        {Object.entries(SURVEY_QUESTIONS).map(([key, q]) => (
          <fieldset key={key} className="section">
            <legend className="survey-legend">{q.label}</legend>
            {Object.entries(q.options).map(([value, label]) => (
              <label key={value} className="check">
                <input type={q.type === "single" ? "radio" : "checkbox"} name={key} value={value} />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
        ))}
        <fieldset className="section">
          <legend className="survey-legend">ご意見・ご要望（自由記述・任意）</legend>
          <p className="note">氏名・住所・電話番号などの個人情報は書かないでください。</p>
          <textarea name="free_text" maxLength={SURVEY_FREE_TEXT_MAX} rows={4} className="field-input" />
        </fieldset>
        <button type="submit" className="button-primary button-block">
          回答を送信する
        </button>
      </form>
    </main>
  );
}
