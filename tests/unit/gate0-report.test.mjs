import { describe, expect, it } from "vitest";
import { aggregateSurvey, computeRows, parseAdMetricsCsv, renderReport } from "../../scripts/report/gate0-report.mjs";

const funnel = [
  { utm_content: "ad_a_v1", lp_sessions: 200, form_view_sessions: 120, form_submit_sessions: 20, signups_created: 18, signups_confirmed: 10 },
  { utm_content: "ad_b_v1", lp_sessions: 0, form_view_sessions: 0, form_submit_sessions: 0, signups_created: 0, signups_confirmed: 0 },
];
const summary = [{ utm_content: "ad_a_v1", signups_confirmed_active: 9 }];

describe("Gate 0 レポート", () => {
  it("CSV を読み、空欄は null（未取得）にする", () => {
    const csv = "# comment\nutm_content,spend_jpy,impressions,clicks\nad_a_v1,5000,10000,250\nad_b_v1,,,\n";
    expect(parseAdMetricsCsv(csv)).toEqual([
      { utm_content: "ad_a_v1", spend: 5000, impressions: 10000, clicks: 250 },
      { utm_content: "ad_b_v1", spend: null, impressions: null, clicks: null },
    ]);
  });
  it("不正な値・列不足はエラー", () => {
    expect(() => parseAdMetricsCsv("utm_content,spend_jpy,impressions,clicks\nad,abc,1,1")).toThrow(/数値/);
    expect(() => parseAdMetricsCsv("utm_content,spend_jpy\nad,1")).toThrow(/列/);
    expect(() => parseAdMetricsCsv("utm_content,spend_jpy,impressions,clicks\nad,-1,1,1")).toThrow(/数値/);
  });
  it("CTR・CPC・登録率・確認済み登録単価を計算し、0 除算は未取得にする", () => {
    const ad = [
      { utm_content: "ad_a_v1", spend: 5000, impressions: 10000, clicks: 250 },
      { utm_content: "ad_b_v1", spend: 5000, impressions: 8000, clicks: 0 },
    ];
    const [a, b] = computeRows({ funnel, summary, adMetrics: ad });
    expect(a.ctr).toBeCloseTo(0.025);
    expect(a.cpc).toBe(20);
    expect(a.registration_rate).toBeCloseTo(0.05);
    expect(a.cost_per_confirmed).toBe(500);
    expect(a.signups_confirmed_active).toBe(9);
    expect(b.cpc).toBeNull();
    expect(b.registration_rate).toBeNull();
    expect(b.cost_per_confirmed).toBeNull();
  });
  it("広告指標が未入力なら推測せず未取得と表示し、合計も未取得", () => {
    const rows = computeRows({ funnel, summary, adMetrics: [] });
    const md = renderReport({ rows, survey: aggregateSurvey([]), generatedAt: "t" });
    expect(md).toContain("| ad_a_v1 | 未取得 | 未取得 | 未取得 | 未取得 | 未取得 | 200 |");
    expect(md).toContain("総広告費: 未取得");
    expect(md).toContain("統計的に十分な市場調査ではありません");
  });
  it("保存済みの回答に継承プロパティ名が混ざっても、件数は数値のまま壊れない（Codex 指摘 PR #31）", () => {
    const s = aggregateSurvey([
      { survey: { intent: "constructor", interests: ["__proto__", "pet"] } },
      { survey: { intent: "constructor", interests: ["pet"] } },
    ]);
    expect(s.counts.intent.constructor).toBe(2);
    expect(s.counts.interests.__proto__).toBe(1);
    expect(s.counts.interests.pet).toBe(2);
  });
  it("アンケートは任意回答者のみの集計と明記し、自由回答の本文は載せない", () => {
    const s = aggregateSurvey([
      { survey: { photo_acceptance: "yes", interests: ["pet", "gacha"], free_text: "秘密の本文" } },
      { survey: { photo_acceptance: "no", interests: ["pet"] } },
    ]);
    expect(s.counts.interests.pet).toBe(2);
    const md = renderReport({ rows: [], survey: s, generatedAt: "t" });
    expect(md).toContain("回答者: 2人");
    expect(md).toContain("登録者全体の意見ではありません");
    expect(md).not.toContain("秘密の本文");
  });
});
