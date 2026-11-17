import { describe, expect, it } from "vitest";
import { jobMinutes, previousMonthRange, renderMarkdown, summarize } from "../../scripts/harness/cost-report.mjs";

const policy = {
  actions: { softLimitMinutesPerMonth: 10, hardLimitMinutesPerMonth: 20 },
  ai: { maxAuditRequestsPerMonth: 5 },
};
const job = (sec) => ({ started_at: "2026-10-01T00:00:00Z", completed_at: new Date(Date.parse("2026-10-01T00:00:00Z") + sec * 1000).toISOString() });

describe("cost-report", () => {
  it("前月の範囲を返す（年跨ぎを含む）", () => {
    const r = previousMonthRange(new Date("2027-01-15T00:00:00Z"));
    expect(r.start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(r.end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
  it("ジョブ時間を分単位で切り上げる", () => {
    expect(jobMinutes(job(1))).toBe(1);
    expect(jobMinutes(job(60))).toBe(1);
    expect(jobMinutes(job(61))).toBe(2);
    expect(jobMinutes({ started_at: null, completed_at: null })).toBe(0);
  });
  it("上限内なら停止しない", () => {
    const s = summarize([{ workflow: "CI", jobs: [job(120)] }], { auditRequests: 1, auditResults: 1 }, policy);
    expect(s.total).toBe(2);
    expect(s.shouldStop).toBe(false);
    expect(renderMarkdown(s, previousMonthRange())).toContain("上限内");
  });
  it("警告上限・停止上限を判定する", () => {
    expect(summarize([{ workflow: "CI", jobs: [job(60 * 15)] }], { auditRequests: 0, auditResults: 0 }, policy).alerts[0].level).toBe("warn");
    expect(summarize([{ workflow: "CI", jobs: [job(60 * 25)] }], { auditRequests: 0, auditResults: 0 }, policy).shouldStop).toBe(true);
  });
  it("監査依頼回数の超過で停止する", () => {
    expect(summarize([], { auditRequests: 6, auditResults: 0 }, policy).shouldStop).toBe(true);
  });
});
