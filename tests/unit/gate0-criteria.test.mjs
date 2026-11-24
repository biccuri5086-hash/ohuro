import { describe, expect, it } from "vitest";
import { AD_IDS, GATE0_CRITERIA, SURVEY_RULES } from "../../scripts/report/gate0-criteria.mjs";
import { computeRows, evaluateGate0, renderReport, aggregateSurvey, surveyStats } from "../../scripts/report/gate0-report.mjs";
import { SURVEY_QUESTIONS, SURVEY_VERSION } from "../../src/lib/waitlist/survey";
import { ADS } from "../../scripts/ads/ads.config.mjs";

const survey = (procrastination, photo_acceptance, utm_content = "ad_a_v1") => ({ utm_content, survey: { procrastination, photo_acceptance } });
const many = (n, p, ph, utm) => Array.from({ length: n }, () => survey(p, ph, utm));

/** 広告 A・B の行（computeRows の結果と同じ形） */
const adRows = ({ spendA = 5000, spendB = 5000, confA = 10, confB = 10, lpA = 200, lpB = 200 } = {}) =>
  computeRows({
    funnel: [
      { utm_content: "ad_a_v1", lp_sessions: lpA, form_view_sessions: 0, form_submit_sessions: 0, signups_created: confA, signups_confirmed: confA },
      { utm_content: "ad_b_v1", lp_sessions: lpB, form_view_sessions: 0, form_submit_sessions: 0, signups_created: confB, signups_confirmed: confB },
    ],
    summary: [],
    adMetrics: [
      { utm_content: "ad_a_v1", spend: spendA, impressions: 1, clicks: 1 },
      { utm_content: "ad_b_v1", spend: spendB, impressions: 1, clicks: 1 },
    ],
  });

const goodSurvey = [...many(8, "daily", "yes"), ...many(2, "rarely", "no")]; // 課題 8/10・写真 8/10

describe("暫定判定ルールの値（D-013）", () => {
  it("所有者が決めた数値と一致する", () => {
    expect(GATE0_CRITERIA).toEqual({
      minConfirmed: 20,
      maxCostPerConfirmedJpy: 500,
      referenceLpRate: 0.05,
      minProblemRate: 0.7,
      minPhotoAcceptRate: 0.7,
      minValidResponses: 10,
      adBudgetJpy: 10000,
    });
    expect(Object.isFrozen(GATE0_CRITERIA)).toBe(true);
  });

  it("数え方はアンケートの現在の版の選択肢に対応している（質問を変えたら判定ルールも見直す）", () => {
    expect(SURVEY_RULES.surveyVersion).toBe(SURVEY_VERSION);
    expect([...SURVEY_RULES.problemOptions].sort()).toEqual(Object.keys(SURVEY_QUESTIONS.procrastination.options).sort());
    expect([...SURVEY_RULES.photoOptions].sort()).toEqual(Object.keys(SURVEY_QUESTIONS.photo_acceptance.options).sort());
    expect(SURVEY_RULES.problemHits).toEqual(["daily", "weekly_several"]);
    expect(SURVEY_RULES.problemExcluded).toEqual(["no_answer"]);
    expect(SURVEY_RULES.photoHits).toEqual(["yes", "conditional"]);
    expect(SURVEY_RULES.photoExcluded).toEqual([]);
  });

  it("広告の識別子は広告素材の設定と一致する", () => {
    expect([...AD_IDS].sort()).toEqual(ADS.map((a) => a.id).sort());
  });
});

describe("アンケートの割合（分母は有効回答者）", () => {
  it("課題該当: 「ほぼ毎日」「週に数回」を数え、「答えたくない」と未回答は分母から除く", () => {
    const st = surveyStats([
      survey("daily"),
      survey("weekly_several"),
      survey("weekly_once"),
      survey("no_answer"),
      { survey: { photo_acceptance: "yes" } }, // 課題は未回答
    ]);
    expect(st.respondents).toBe(5);
    expect([st.problem.hits, st.problem.valid, st.problem.answered, st.problem.unanswered]).toEqual([2, 3, 4, 1]);
    expect(st.problem.rate).toBeCloseTo(2 / 3);
  });

  it("写真の許容: 「受け入れられる」「条件によっては」を数え、「わからない」は分母に残す", () => {
    const st = surveyStats([survey("daily", "yes"), survey("daily", "conditional"), survey("daily", "no"), survey("daily", "unsure")]);
    expect([st.photo.hits, st.photo.valid]).toEqual([2, 4]);
    expect([st.photoYesOnly.hits, st.photoYesOnly.valid]).toEqual([1, 4]);
  });

  it("定義にない値・継承プロパティ名は数えない", () => {
    const st = surveyStats([survey("constructor", "__proto__"), survey("daily", "yes")]);
    expect([st.problem.answered, st.problem.valid, st.photo.valid]).toEqual([1, 1, 1]);
  });

  it("回答がなければ割合は null（推測しない）", () => {
    const st = surveyStats([]);
    expect(st.problem.rate).toBeNull();
    expect(st.problem.ci).toBeNull();
  });
});

describe("判定の候補（下書き）", () => {
  it("すべての必須条件を満たせば合格の候補。ただし不具合の確認は所有者", () => {
    const ev = evaluateGate0({ rows: adRows(), stats: surveyStats(goodSurvey) });
    expect(ev.candidate).toMatch(/^合格の候補/);
    expect(ev.candidate).toContain("所有者が確認");
    expect(ev.totals).toMatchObject({ spend: 10000, adConfirmed: 20, confirmed: 20, cost: 500 });
    expect(ev.checks.find((c) => c.label.startsWith("登録機能")).status).toBe("所有者が確認");
  });

  it("境界値: 20人・500円・70%・10人ちょうどは達成、1つ外れると未達", () => {
    const st70 = surveyStats([...many(7, "daily", "yes"), ...many(3, "rarely", "no")]);
    expect(evaluateGate0({ rows: adRows(), stats: st70 }).candidate).toMatch(/^合格の候補/);

    const fewer = evaluateGate0({ rows: adRows({ confB: 9 }), stats: st70 });
    expect(fewer.candidate).toMatch(/^要改善の候補/);
    expect(fewer.candidate).toContain("確認済み登録人数");
    expect(fewer.candidate).toContain("確認済み登録単価"); // 10000/19 > 500

    const costly = evaluateGate0({ rows: adRows({ spendA: 5001 }), stats: st70 });
    expect(costly.checks.find((c) => c.label === "確認済み登録単価").status).toBe("未達");

    const st69 = surveyStats([...many(7, "daily", "yes"), ...many(3, "rarely", "no"), survey("rarely", "yes")]); // 課題 7/11
    const low = evaluateGate0({ rows: adRows(), stats: st69 });
    expect(low.candidate).toBe("要改善の候補（未達: 課題該当率）");
  });

  it("LP 登録率は参考指標で、未達でも要改善にしない", () => {
    const ev = evaluateGate0({ rows: adRows({ lpA: 1000, lpB: 1000 }), stats: surveyStats(goodSurvey) }); // 1%
    expect(ev.checks.find((c) => c.label.startsWith("LP 登録率")).status).toBe("未達");
    expect(ev.candidate).toMatch(/^合格の候補/);
  });

  it("広告費が未取得なら判断保留（推測で埋めない）", () => {
    const ev = evaluateGate0({ rows: adRows({ spendB: null }), stats: surveyStats(goodSurvey) });
    expect(ev.candidate).toContain("判断保留の候補");
    expect(ev.candidate).toContain("広告費が未取得");
    expect(ev.checks.find((c) => c.label === "確認済み登録単価").status).toContain("判定不可");
  });

  it("必須の指標が判定不可（広告費 0 円で広告経由の確認 0 人）なら、他の流入で人数を満たしても判断保留（Codex 指摘 PR #44）", () => {
    const rows = computeRows({
      funnel: [
        { utm_content: "ad_a_v1", lp_sessions: 10, form_view_sessions: 0, form_submit_sessions: 0, signups_created: 0, signups_confirmed: 0 },
        { utm_content: "ad_b_v1", lp_sessions: 10, form_view_sessions: 0, form_submit_sessions: 0, signups_created: 0, signups_confirmed: 0 },
        { utm_content: "(none)", lp_sessions: 200, form_view_sessions: 0, form_submit_sessions: 0, signups_created: 20, signups_confirmed: 20 },
      ],
      summary: [],
      adMetrics: [
        { utm_content: "ad_a_v1", spend: 0, impressions: 0, clicks: 0 },
        { utm_content: "ad_b_v1", spend: 0, impressions: 0, clicks: 0 },
      ],
    });
    const ev = evaluateGate0({ rows, stats: surveyStats(goodSurvey) });
    expect(ev.checks.find((c) => c.label === "確認済み登録単価").status).toBe("判定不可（広告費 0円）");
    expect(ev.candidate).toBe("判断保留の候補（確認済み登録単価が判定不可（広告費 0円））");
  });

  it("有効回答が 10 人未満なら判断保留", () => {
    const ev = evaluateGate0({ rows: adRows(), stats: surveyStats(many(9, "daily", "yes")) });
    expect(ev.candidate).toContain("判断保留の候補");
    expect(ev.checks.find((c) => c.label === "課題該当率").status).toContain("有効回答が不足");
  });

  it("LP 訪問が 0、または確認数が訪問数を上回るなら計測不十分として判断保留", () => {
    expect(evaluateGate0({ rows: adRows({ lpA: 0, lpB: 0 }), stats: surveyStats(goodSurvey) }).candidate).toContain("LP 訪問の計測が不十分");
    expect(evaluateGate0({ rows: adRows({ lpA: 5, lpB: 5 }), stats: surveyStats(goodSurvey) }).candidate).toContain("算出不可");
  });

  it("広告費があり確認済み 0 人なら単価は未達（0 除算で落ちない）", () => {
    const ev = evaluateGate0({ rows: adRows({ confA: 0, confB: 0 }), stats: surveyStats(goodSurvey) });
    expect(ev.totals.cost).toBeNull();
    expect(ev.checks.find((c) => c.label === "確認済み登録単価").status).toBe("未達");
  });

  it("単価の分母は広告 A・B 経由の確認済み登録。人数の基準は全体（その他の流入を含む）", () => {
    const rows = computeRows({
      funnel: [
        { utm_content: "ad_a_v1", lp_sessions: 200, form_view_sessions: 0, form_submit_sessions: 0, signups_created: 10, signups_confirmed: 10 },
        { utm_content: "ad_b_v1", lp_sessions: 200, form_view_sessions: 0, form_submit_sessions: 0, signups_created: 5, signups_confirmed: 5 },
        { utm_content: "(none)", lp_sessions: 50, form_view_sessions: 0, form_submit_sessions: 0, signups_created: 5, signups_confirmed: 5 },
      ],
      summary: [],
      adMetrics: [
        { utm_content: "ad_a_v1", spend: 5000, impressions: 1, clicks: 1 },
        { utm_content: "ad_b_v1", spend: 5000, impressions: 1, clicks: 1 },
      ],
    });
    const ev = evaluateGate0({ rows, stats: surveyStats(goodSurvey) });
    expect(ev.totals).toMatchObject({ confirmed: 20, adConfirmed: 15 });
    expect(ev.totals.cost).toBeCloseTo(10000 / 15);
  });
});

describe("レポートへの表示", () => {
  it("登録人数の内訳（解除済み・削除済み・テスト）と照合表・広告別アンケートを表示する", () => {
    const rows = computeRows({
      funnel: [{ utm_content: "ad_a_v1", lp_sessions: 100, form_view_sessions: 0, form_submit_sessions: 0, signups_created: 6, signups_confirmed: 5 }],
      // utm_campaign 違いの 2 行は utm_content ごとに合計する
      summary: [
        { utm_content: "ad_a_v1", utm_campaign: "x", signups_confirmed: 2, signups_confirmed_active: 1 },
        { utm_content: "ad_a_v1", utm_campaign: "y", signups_confirmed: 2, signups_confirmed_active: 2 },
      ],
      adMetrics: [],
    });
    expect(rows[0]).toMatchObject({ signups_confirmed_db: 4, signups_confirmed_active: 3 });
    const surveyRows = [survey("daily", "yes", "ad_a_v1"), survey("rarely", "no", "ad_b_v1")];
    const md = renderReport({ rows, survey: aggregateSurvey(surveyRows), surveyRows, testSignups: 2, generatedAt: "t" });
    expect(md).toContain("確認済み登録（初回の確認。テスト除外）: 5人");
    expect(md).toContain("うち現在も登録中: 3人");
    expect(md).toContain("うち配信停止（解除済み）: 1人");
    expect(md).toContain("うち削除済み、または解除後に再登録して未確認: 1人");
    expect(md).toContain("テスト登録（集計から除外）: 2件");
    expect(md).toContain("アンケート未回答（DB に残る確認済み登録のうち）: 2人");
    expect(md).toContain("| 確認済み登録人数 | 20人以上 | 5人 | 未達 |");
    expect(md).toContain("判断保留の候補");
    expect(md).toContain("- ad_a_v1: 回答者 1人");
    expect(md).toContain("- ad_b_v1: 回答者 1人");
    expect(md).toContain("市場の標準値や収益性を保証するものではありません");
    expect(md).toContain("AI だけで Gate 1 に進みません");
    expect(md).not.toContain("NaN");
  });

  it("テスト登録の件数が取れなければ未取得", () => {
    const md = renderReport({ rows: [], survey: aggregateSurvey([]), generatedAt: "t" });
    expect(md).toContain("テスト登録（集計から除外）: 未取得");
    expect(md).not.toContain("NaN");
    expect(md).not.toMatch(/証明|確実に需要/);
  });

  it("DB の確認済み登録が確認イベントより多いときは、負の人数を出さず判断保留にする", () => {
    const rows = computeRows({
      funnel: [],
      summary: [{ utm_content: "ad_a_v1", signups_confirmed: 1, signups_confirmed_active: 1 }],
      adMetrics: [],
    });
    expect(rows.map((r) => r.utm_content)).toEqual(["ad_a_v1"]); // 集計ビューにだけある広告も行にする
    const md = renderReport({ rows, survey: aggregateSurvey([]), generatedAt: "t" });
    expect(md).toContain("算出不可（DB の確認済み登録が確認イベントより多い: ad_a_v1");
    expect(md).not.toMatch(/-\d+人/);
    expect(md).toContain("確認済み登録の記録が食い違う");
  });
});
