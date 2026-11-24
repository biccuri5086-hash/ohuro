// Gate 0 の暫定判定ルール（DECISIONS.md D-013。所有者が 2026-11-21 に決定）。
// 今回の実験のための仮の基準であり、市場の標準値や収益性を保証するものではない。
// 判定を決めるのは所有者。レポートは基準との照合と「判定の候補」を下書きとして示すだけ。
// 値を変えるときは、配信前に DECISIONS.md へ記録する（配信後に基準を動かさない。EXPERIMENT_PLAN.md 4.7）。

export const GATE0_CRITERIA = Object.freeze({
  /** メール確認済みの事前登録（テスト除外）の最小人数 */
  minConfirmed: 20,
  /** 確認済み登録単価（広告費 ÷ 広告経由の確認済み登録）の上限（円） */
  maxCostPerConfirmedJpy: 500,
  /** LP 登録率（確認済み登録 ÷ LP 訪問）。参考指標で、合否の必須条件ではない */
  referenceLpRate: 0.05,
  /** 課題該当率（有効回答者が分母）の最小値 */
  minProblemRate: 0.7,
  /** 写真 2 回撮影の許容率（有効回答者が分母）の最小値 */
  minPhotoAcceptRate: 0.7,
  /** アンケートの有効回答の最小人数（課題・写真の各質問で） */
  minValidResponses: 10,
  /** 広告費の上限（円）。A・B 各 5,000 円 */
  adBudgetJpy: 10000,
});

/** 判定ルールの数え方（D-013 の 7）。アンケートの版 2026-11-18-v1 の選択肢に対応する */
export const SURVEY_RULES = Object.freeze({
  surveyVersion: "2026-11-18-v1",
  /** 課題該当: 先延ばしが「ほぼ毎日」「週に数回」 */
  problemHits: Object.freeze(["daily", "weekly_several"]),
  /** 課題の質問で分母から除く回答: 「答えたくない」 */
  problemExcluded: Object.freeze(["no_answer"]),
  /** 課題の質問の選択肢（この中にない値は数えない） */
  problemOptions: Object.freeze(["daily", "weekly_several", "weekly_once", "monthly", "rarely", "no_answer"]),
  /** 写真 2 回撮影の許容: 「受け入れられる」「条件によっては受け入れられる」 */
  photoHits: Object.freeze(["yes", "conditional"]),
  /** 写真の質問で分母から除く回答: なし（「わからない」は分母に残す） */
  photoExcluded: Object.freeze([]),
  photoOptions: Object.freeze(["yes", "conditional", "no", "unsure"]),
});

/** 広告 A・B の識別子（G0-7 の素材。scripts/ads/ads.config.mjs） */
export const AD_IDS = Object.freeze(["ad_a_v1", "ad_b_v1"]);
