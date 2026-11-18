// 登録後の任意アンケート（G0-5）。質問と選択肢の唯一の定義。
// 質問を変えたら SURVEY_VERSION を上げる（回答と一緒に保存し、版ごとに集計する）。
export const SURVEY_VERSION = "2026-11-18-v1";

export const SURVEY_QUESTIONS = {
  procrastination: {
    label: "お風呂に入るのを先延ばしにしてしまうことは、どのくらいありますか？",
    type: "single",
    options: {
      daily: "ほぼ毎日",
      weekly_several: "週に数回",
      weekly_once: "週に1回くらい",
      monthly: "月に数回",
      rarely: "ほとんどない",
      no_answer: "答えたくない",
    },
  },
  photo_acceptance: {
    label: "入浴の前と後にタオルを1回ずつ（合計2回）撮影する機能を、受け入れられそうですか？",
    type: "single",
    options: {
      yes: "受け入れられる",
      conditional: "条件によっては受け入れられる",
      no: "受け入れにくい",
      unsure: "わからない",
    },
  },
  interests: {
    label: "興味のある機能をすべて選んでください（複数選択可）",
    type: "multiple",
    options: {
      quest: "お風呂までの小さなクエスト",
      coins: "入浴でコインが貯まる",
      gacha: "無料コインのガチャ",
      pet: "ペットの育成",
      collection: "家具や衣装の収集",
      home: "2Dマイホーム",
      analysis: "先延ばしの記録・振り返り",
      none: "特にない",
    },
  },
  intent: {
    label: "公開されたら、試してみたいですか？",
    type: "single",
    options: {
      definitely: "ぜひ試したい",
      probably: "たぶん試す",
      unsure: "わからない",
      probably_not: "たぶん試さない",
    },
  },
} as const;

export const SURVEY_FREE_TEXT_MAX = 500;

export type SurveyAnswers = {
  procrastination?: string;
  photo_acceptance?: string;
  interests?: string[];
  intent?: string;
  free_text?: string;
};

type QuestionKey = keyof typeof SURVEY_QUESTIONS;

/** 回答を検査して正規化する。すべて任意。1問も回答がなければ null */
export function parseSurveyAnswers(input: Record<string, unknown>): SurveyAnswers | null {
  const out: SurveyAnswers = {};
  for (const key of Object.keys(SURVEY_QUESTIONS) as QuestionKey[]) {
    const q = SURVEY_QUESTIONS[key];
    const raw = input[key];
    if (q.type === "single") {
      if (typeof raw === "string" && raw in q.options) (out as Record<string, unknown>)[key] = raw;
    } else {
      const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
      const valid = [...new Set(list.filter((v): v is string => typeof v === "string" && v in q.options))];
      if (valid.length > 0) out.interests = valid.includes("none") ? ["none"] : valid.sort();
    }
  }
  const free = input.free_text;
  if (typeof free === "string") {
    // 制御文字を除き、長さを制限する
    const cleaned = free.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, SURVEY_FREE_TEXT_MAX);
    if (cleaned.length > 0) out.free_text = cleaned;
  }
  return Object.keys(out).length > 0 ? out : null;
}
