#!/usr/bin/env node
// 月次コストレポート: 前月の GitHub Actions ジョブ実行時間（分単位切り上げの概算）と
// 独立監査の依頼・実施回数を集計し、.github/cost-policy.json の上限と比較する。
// GitHub の請求額そのものではない（請求は GitHub の Billing 画面が正）。
// 上限超過時は終了コード1で失敗させ、所有者への通知と自動実行停止の判断材料にする。

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** 前月の [start, end) を UTC で返す */
export function previousMonthRange(now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1));
  return { start, end };
}

/** ジョブの請求概算分（1分単位切り上げ）。未完了・未開始は0 */
export function jobMinutes(job) {
  if (!job?.started_at || !job?.completed_at) return 0;
  const ms = Date.parse(job.completed_at) - Date.parse(job.started_at);
  return ms > 0 ? Math.ceil(ms / 60_000) : 0;
}

/**
 * @param {{workflow: string, jobs: object[]}[]} runs
 * @param {{auditRequests: number, auditResults: number}} audit
 * @param {object} policy cost-policy.json
 */
export function summarize(runs, audit, policy) {
  const byWorkflow = {};
  let total = 0;
  for (const run of runs) {
    const minutes = run.jobs.reduce((s, j) => s + jobMinutes(j), 0);
    byWorkflow[run.workflow] = (byWorkflow[run.workflow] ?? 0) + minutes;
    total += minutes;
  }
  const alerts = [];
  const { softLimitMinutesPerMonth: soft, hardLimitMinutesPerMonth: hard } = policy.actions;
  if (total > hard) alerts.push({ level: "stop", message: `Actions ${total}分 が停止上限 ${hard}分 を超過` });
  else if (total > soft) alerts.push({ level: "warn", message: `Actions ${total}分 が警告上限 ${soft}分 を超過` });
  if (audit.auditRequests > policy.ai.maxAuditRequestsPerMonth) {
    alerts.push({
      level: "stop",
      message: `監査依頼 ${audit.auditRequests}回 が月間上限 ${policy.ai.maxAuditRequestsPerMonth}回 を超過`,
    });
  }
  return { total, byWorkflow, audit, alerts, shouldStop: alerts.some((a) => a.level === "stop") };
}

export function renderMarkdown(summary, range) {
  const lines = [
    `## 月次コストレポート ${range.start.toISOString().slice(0, 7)}`,
    "",
    "| 項目 | 値 |",
    "|---|---|",
    `| Actions 実行時間（概算・分） | ${summary.total} |`,
    `| 監査依頼コメント数 | ${summary.audit.auditRequests} |`,
    `| 監査結果の投稿数 | ${summary.audit.auditResults} |`,
    "",
    "### ワークフロー別（分）",
    "",
    ...Object.entries(summary.byWorkflow).map(([k, v]) => `- ${k}: ${v}`),
    "",
    "### 判定",
    "",
    ...(summary.alerts.length ? summary.alerts.map((a) => `- **${a.level}**: ${a.message}`) : ["- 上限内"]),
    "",
    "注: 概算値。公開リポジトリの標準ランナーの課金有無・料金は GitHub の現行情報で確認すること。",
    "AI（Claude Code / Codex）の利用料は GitHub からは取得できないため、COST_POLICY.md の手順で人間が記録する。",
  ];
  return lines.join("\n");
}

// ---------------- CLI ----------------

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json();
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!process.env.GITHUB_TOKEN || !repo) throw new Error("GITHUB_TOKEN と GITHUB_REPOSITORY が必要です");
  const policy = JSON.parse(readFileSync(".github/cost-policy.json", "utf8"));
  const auditGate = JSON.parse(readFileSync(".github/audit-gate.json", "utf8"));
  const auditors = new Set(auditGate.auditors.map((a) => a.toLowerCase()));
  const range = previousMonthRange();
  const created = `${range.start.toISOString().slice(0, 10)}..${new Date(range.end - 1).toISOString().slice(0, 10)}`;

  const runs = [];
  for (let page = 1; page <= 5; page++) {
    const data = await gh(`/repos/${repo}/actions/runs?per_page=100&page=${page}&created=${created}`);
    for (const run of data.workflow_runs) {
      const jobs = await gh(`/repos/${repo}/actions/runs/${run.id}/jobs?per_page=100&filter=all`);
      runs.push({ workflow: run.name, jobs: jobs.jobs });
    }
    if (data.workflow_runs.length < 100) break;
  }

  let auditRequests = 0;
  let auditResults = 0;
  const since = range.start.toISOString();
  for (let page = 1; page <= 10; page++) {
    const comments = await gh(`/repos/${repo}/issues/comments?since=${since}&per_page=100&page=${page}`);
    for (const c of comments) {
      const at = Date.parse(c.created_at);
      if (at < range.start.getTime() || at >= range.end.getTime()) continue;
      if (/(^|\s)@codex\s+review\b/i.test(c.body ?? "")) auditRequests++;
      if (auditors.has(String(c.user?.login).toLowerCase())) auditResults++;
    }
    if (comments.length < 100) break;
  }

  const summary = summarize(runs, { auditRequests, auditResults }, policy);
  console.log(renderMarkdown(summary, range));
  if (summary.shouldStop) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
