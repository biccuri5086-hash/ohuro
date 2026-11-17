import { describe, expect, it } from "vitest";
import { evaluateAuditGate, parseAuditMarkers } from "../../scripts/harness/audit-gate.mjs";

const HEAD = "0123456789abcdef0123456789abcdef01234567";
const OTHER = "fedcba9876543210fedcba9876543210fedcba98";
const AUDITOR = "chatgpt-codex-connector[bot]";
const config = { auditors: [AUDITOR], maxAuditRounds: 3 };

function marker({ head = HEAD, critical = 0, high = 0, medium = 0, low = 0, verdict = "pass" } = {}) {
  return [
    "<!-- ohuro-audit",
    `head: ${head}`,
    `critical: ${critical}`,
    `high: ${high}`,
    `medium: ${medium}`,
    `low: ${low}`,
    `verdict: ${verdict}`,
    "-->",
  ].join("\n");
}
const entry = (body, at = "2026-11-17T00:00:00Z", author = AUDITOR) => ({ author, body, at });

// 2026-11-17 に PR #6 で実際に投稿された Codex 要約コメントと同じ構造（波括弧は HTML 文字参照）
function codexState(code = {}, security = { commit_sha: null, has_any_findings: null, has_unresolved_findings: null, status: null }) {
  const state = {
    code_review: { commit_sha: HEAD, has_any_findings: false, has_unresolved_findings: false, status: "completed", ...code },
    security_review: security,
  };
  const json = JSON.stringify(state).replace(/\{/g, "&#123;").replace(/\}/g, "&#125;");
  return `<!-- codex-pull-request-review-summary -->\n<!-- codex-review-state:v1 ${json} -->\n\n<details>Codex Review Summary</details>`;
}
const run = (entries, labels = [], headSha = HEAD) => evaluateAuditGate({ headSha, labels, entries, config });

describe("parseAuditMarkers", () => {
  it("正しい書式を読み取る", () => {
    const [m] = parseAuditMarkers(`前置き\n${marker({ medium: 2, low: 1 })}\n後書き`);
    expect(m).toMatchObject({ valid: true, head: HEAD, medium: 2, low: 1, verdict: "pass" });
  });
  it("件数欠落・不正な verdict を無効とする", () => {
    expect(parseAuditMarkers("<!-- ohuro-audit\nhead: abcdef1\nverdict: pass\n-->")[0].valid).toBe(false);
    expect(parseAuditMarkers(marker({ verdict: "lgtm" }))[0].valid).toBe(false);
  });
  it("High があるのに pass と書かれた矛盾を無効とする", () => {
    expect(parseAuditMarkers(marker({ high: 1, verdict: "pass" }))[0].valid).toBe(false);
  });
  it("文字列以外は空配列", () => {
    expect(parseAuditMarkers(undefined)).toEqual([]);
  });
});

describe("evaluateAuditGate", () => {
  it("監査結果がなければ pending", () => {
    expect(run([]).state).toBe("pending");
  });
  it("監査者以外（PR作成者など）のマーカーは無視する", () => {
    expect(run([entry(marker(), undefined, "biccuri5086-hash")]).state).toBe("pending");
  });
  it("古い head への監査は無効（再監査が必要）", () => {
    expect(run([entry(marker({ head: OTHER }))]).state).toBe("pending");
  });
  it("短縮SHA（7文字以上）を受け付ける", () => {
    expect(run([entry(marker({ head: HEAD.slice(0, 7) }))]).state).toBe("success");
  });
  it("6文字以下の SHA は無効", () => {
    expect(run([entry(marker({ head: HEAD.slice(0, 6) }))]).state).not.toBe("success");
  });
  it("Critical/High があれば failure", () => {
    expect(run([entry(marker({ critical: 1, verdict: "changes_requested" }))]).state).toBe("failure");
    expect(run([entry(marker({ high: 2, verdict: "changes_requested" }))]).state).toBe("failure");
  });
  it("Medium は人間の対応判断ラベルがなければ failure", () => {
    const e = [entry(marker({ medium: 1, verdict: "changes_requested" }))];
    expect(run(e).state).toBe("failure");
    expect(run(e, ["audit:medium-accepted"]).state).toBe("success");
  });
  it("Low のみなら success", () => {
    expect(run([entry(marker({ low: 3 }))]).state).toBe("success");
  });
  it("指摘ゼロでも verdict が changes_requested なら failure", () => {
    expect(run([entry(marker({ verdict: "changes_requested" }))]).state).toBe("failure");
  });
  it("同一 head の最新の監査結果を採用する", () => {
    const e = [
      entry(marker({ high: 1, verdict: "changes_requested" }), "2026-11-17T01:00:00Z"),
      entry(marker(), "2026-11-17T02:00:00Z"),
    ];
    expect(run(e).state).toBe("success");
    expect(run(e.slice().reverse()).state).toBe("success");
  });
  it("書式不正の最新監査は failure", () => {
    expect(run([entry(marker({ verdict: "maybe" }))]).state).toBe("failure");
  });
  it("修正ループ上限に達したら停止を要求する", () => {
    const heads = ["a".repeat(40), "b".repeat(40), HEAD];
    const e = heads.map((h, i) =>
      entry(marker({ head: h, high: 1, verdict: "changes_requested" }), `2026-11-17T0${i}:00:00Z`),
    );
    const r = run(e);
    expect(r.state).toBe("failure");
    expect(r.description).toContain("上限");
    expect(run(e, ["human:continue-fix-loop"]).description).not.toContain("上限");
  });
  it("Codex 標準形式: 指摘なしで完了なら success", () => {
    expect(run([entry(codexState())]).state).toBe("success");
  });
  it("Codex 標準形式: 実行中は pending", () => {
    expect(run([entry(codexState({ status: "running", has_any_findings: null, has_unresolved_findings: null }))]).state).toBe("pending");
  });
  it("Codex 標準形式: 未解決の指摘があれば failure", () => {
    expect(run([entry(codexState({ has_any_findings: true, has_unresolved_findings: true }))]).state).toBe("failure");
  });
  it("Codex 標準形式: 同一コミットで解決済みにされた指摘は人間の確認ラベルが必要", () => {
    const e = [entry(codexState({ has_any_findings: true, has_unresolved_findings: false }))];
    expect(run(e).state).toBe("failure");
    expect(run(e, ["audit:medium-accepted"]).state).toBe("success");
  });
  it("Codex 標準形式: 別コミットの結果は無効（pending）", () => {
    expect(run([entry(codexState({ commit_sha: OTHER }))]).state).toBe("pending");
  });
  it("Codex 標準形式: 監査者以外が書いた状態コメントは無視する", () => {
    expect(run([entry(codexState(), undefined, "biccuri5086-hash")]).state).toBe("pending");
  });
  it("Codex 標準形式: セキュリティレビューに未解決の指摘があれば failure", () => {
    const body = codexState({}, { commit_sha: HEAD, status: "completed", has_any_findings: true, has_unresolved_findings: true });
    expect(run([entry(body)]).state).toBe("failure");
  });
  it("Codex 標準形式: 解析できない状態は failure", () => {
    expect(run([entry("<!-- codex-review-state:v1 &#123;broken -->")]).state).toBe("failure");
  });
  it("Codex 標準形式と ohuro-audit ブロックは新しい方を採用する", () => {
    const e = [
      entry(marker({ high: 1, verdict: "changes_requested" }), "2026-11-17T01:00:00Z"),
      entry(codexState(), "2026-11-17T02:00:00Z"),
    ];
    expect(run(e).state).toBe("success");
    expect(run([e[1], { ...e[0], at: "2026-11-17T03:00:00Z" }]).state).toBe("failure");
  });
  it("人間の上書きラベルで success（DECISIONS.md 記録を要求）", () => {
    const r = run([], ["audit:human-override"]);
    expect(r.state).toBe("success");
    expect(r.description).toContain("DECISIONS.md");
  });
});
