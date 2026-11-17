#!/usr/bin/env node
// 監査ゲート: 信頼できる監査者（Codex等）が PR の「現在のhead SHA」に対して出した
// 構造化監査結果を読み取り、マージ可否をコミットステータスとして設定する。
//
// 監査結果の書式（PRコメントまたはレビュー本文に含める。詳細は AGENTS.md）:
//   <!-- ohuro-audit
//   head: <commit sha (7文字以上)>
//   critical: 0
//   high: 0
//   medium: 0
//   low: 0
//   verdict: pass | changes_requested
//   -->
//
// 判定ロジックは evaluateAuditGate() に集約し、単体テストで検証する。
// CLI として実行した場合のみ GitHub API を呼ぶ（GITHUB_TOKEN 必須）。

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const STATUS_CONTEXT = "audit-gate / independent-audit";

const MARKER_RE = /<!--\s*ohuro-audit\b([\s\S]*?)-->/g;
const SEVERITIES = ["critical", "high", "medium", "low"];

/** コメント本文から監査マーカーをすべて抽出する。不正な書式は invalid として返す。 */
export function parseAuditMarkers(body) {
  if (typeof body !== "string") return [];
  const results = [];
  for (const match of body.matchAll(MARKER_RE)) {
    const fields = {};
    for (const line of match[1].split(/\r?\n/)) {
      const m = line.match(/^\s*([a-z_]+)\s*:\s*(\S+)\s*$/i);
      if (m) fields[m[1].toLowerCase()] = m[2];
    }
    const marker = { valid: true, head: fields.head ?? null, verdict: fields.verdict ?? null };
    for (const sev of SEVERITIES) {
      const n = Number(fields[sev]);
      if (!Number.isInteger(n) || n < 0) marker.valid = false;
      marker[sev] = Number.isInteger(n) && n >= 0 ? n : null;
    }
    if (!marker.head || !/^[0-9a-f]{7,40}$/i.test(marker.head)) marker.valid = false;
    if (marker.verdict !== "pass" && marker.verdict !== "changes_requested") marker.valid = false;
    // 件数と verdict の矛盾（Critical/High があるのに pass）は無効扱い
    if (marker.valid && marker.verdict === "pass" && (marker.critical > 0 || marker.high > 0)) {
      marker.valid = false;
    }
    results.push(marker);
  }
  return results;
}

function headMatches(markerHead, headSha) {
  if (!markerHead || !headSha) return false;
  const a = markerHead.toLowerCase();
  const b = headSha.toLowerCase();
  return a.length >= 7 && b.startsWith(a);
}

/**
 * @param {object} input
 * @param {string} input.headSha  PR の現在の head SHA
 * @param {string[]} input.labels PR のラベル名
 * @param {{author: string, body: string, at: string}[]} input.entries コメント・レビュー
 * @param {{auditors: string[], maxAuditRounds: number}} input.config
 * @returns {{state: "success"|"failure"|"pending", description: string}}
 */
export function evaluateAuditGate({ headSha, labels, entries, config }) {
  const labelSet = new Set(labels ?? []);
  const auditors = new Set((config.auditors ?? []).map((a) => a.toLowerCase()));

  if (labelSet.has("audit:human-override")) {
    return {
      state: "success",
      description: "人間による監査上書き。DECISIONS.md への記録が必須",
    };
  }

  const trusted = (entries ?? [])
    .filter((e) => e && typeof e.author === "string" && auditors.has(e.author.toLowerCase()))
    .slice()
    .sort((x, y) => String(x.at).localeCompare(String(y.at)));

  const allMarkers = [];
  for (const e of trusted) {
    for (const m of parseAuditMarkers(e.body)) allMarkers.push({ ...m, at: e.at });
  }

  const forHead = allMarkers.filter((m) => headMatches(m.head, headSha));
  const latest = forHead.at(-1);

  if (!latest) {
    return {
      state: "pending",
      description: `head ${String(headSha).slice(0, 7)} に対する独立監査結果がありません`,
    };
  }
  if (!latest.valid) {
    return { state: "failure", description: "監査結果の書式が不正、または件数と判定が矛盾しています" };
  }

  const rounds = new Set(
    allMarkers.filter((m) => m.valid && m.verdict === "changes_requested").map((m) => m.head),
  ).size;
  const maxRounds = Number.isInteger(config.maxAuditRounds) ? config.maxAuditRounds : 3;

  if (latest.critical > 0 || latest.high > 0) {
    if (rounds >= maxRounds && !labelSet.has("human:continue-fix-loop")) {
      return {
        state: "failure",
        description: `修正ループ上限(${maxRounds}回)到達。自動修正を停止し人間に報告してください`,
      };
    }
    return {
      state: "failure",
      description: `マージ禁止: Critical ${latest.critical} / High ${latest.high}`,
    };
  }
  if (latest.medium > 0 && !labelSet.has("audit:medium-accepted")) {
    return {
      state: "failure",
      description: `Medium ${latest.medium} 件に対する人間の対応判断が未記録です`,
    };
  }
  if (latest.verdict !== "pass" && !(latest.medium > 0 && labelSet.has("audit:medium-accepted"))) {
    return { state: "failure", description: "監査判定が pass ではありません" };
  }
  return {
    state: "success",
    description: `監査通過 (Medium ${latest.medium} / Low ${latest.low})`,
  };
}

// ---------------- CLI（GitHub Actions から実行） ----------------

async function gh(path, { method = "GET", body } = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

async function paginate(path) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const items = await gh(`${path}${sep}per_page=100&page=${page}`);
    out.push(...items);
    if (items.length < 100) break;
  }
  return out;
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  const prNumber = Number(process.env.PR_NUMBER);
  if (!process.env.GITHUB_TOKEN || !repo || !Number.isInteger(prNumber) || prNumber <= 0) {
    throw new Error("GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER が必要です");
  }
  const configPath = process.env.AUDIT_GATE_CONFIG ?? ".github/audit-gate.json";
  const config = JSON.parse(readFileSync(configPath, "utf8"));

  const pr = await gh(`/repos/${repo}/pulls/${prNumber}`);
  const comments = await paginate(`/repos/${repo}/issues/${prNumber}/comments`);
  const reviews = await paginate(`/repos/${repo}/pulls/${prNumber}/reviews`);

  const entries = [
    ...comments.map((c) => ({ author: c.user?.login, body: c.body, at: c.updated_at ?? c.created_at })),
    ...reviews.map((r) => ({ author: r.user?.login, body: r.body, at: r.submitted_at })),
  ];
  const result = evaluateAuditGate({
    headSha: pr.head.sha,
    labels: (pr.labels ?? []).map((l) => l.name),
    entries,
    config,
  });

  // GitHub のステータス説明は140文字まで
  const description = result.description.slice(0, 140);
  await gh(`/repos/${repo}/statuses/${pr.head.sha}`, {
    method: "POST",
    body: { state: result.state, context: STATUS_CONTEXT, description },
  });
  console.log(`${STATUS_CONTEXT}: ${result.state} — ${description} (head ${pr.head.sha})`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
