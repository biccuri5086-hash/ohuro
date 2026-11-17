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

// Codex（GitHub 連携）が要約コメントに埋め込む機械可読な状態（2026-11-17 に実物で確認。D-008）:
//   <!-- codex-review-state:v1 {"code_review":{"commit_sha":"<40桁>","has_any_findings":false,
//        "has_unresolved_findings":false,"status":"completed"},"security_review":{...}} -->
// REST API で取得すると JSON は生の波括弧で返る。Webhook 等の経路では HTML 文字参照（&#123; &#125;）の場合があるため両方に対応する。
const CODEX_STATE_RE = /<!--\s*codex-review-state:v1\s+([\s\S]*?)\s*-->/;
const CODEX_REVIEW_KINDS = ["code_review", "security_review"];

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Codex の状態コメントを読み取る。該当なしは null、解析不能は {invalid: true} */
export function parseCodexReviewState(body) {
  if (typeof body !== "string") return null;
  const m = body.match(CODEX_STATE_RE);
  if (!m) return null;
  try {
    const parsed = JSON.parse(decodeEntities(m[1]));
    return parsed && typeof parsed === "object" ? parsed : { invalid: true };
  } catch {
    return { invalid: true };
  }
}

/**
 * Codex 標準形式の状態を、現在の head に対するゲート判定に変換する。head に対する結果がなければ null。
 * - 実行中 → pending
 * - 未解決の指摘あり → failure（重大度は標準形式から判別できないため、すべてブロック）
 * - 指摘があったが同一コミットのまま「解決済み」→ 人間の確認ラベル audit:medium-accepted が必要
 *   （PR 作成者がスレッドを解決するだけでゲートを通過できないようにするため）
 * - 指摘なしで完了 → success
 */
export function evaluateCodexState(state, headSha, labelSet = new Set()) {
  if (!state) return null;
  if (state.invalid) return { state: "failure", description: "Codex の監査状態を解析できません" };
  const reviews = CODEX_REVIEW_KINDS.map((k) => [k, state[k]]).filter(
    ([, r]) => r && typeof r.commit_sha === "string" && /^[0-9a-f]{40}$/i.test(r.commit_sha) && headMatches(r.commit_sha, headSha),
  );
  if (reviews.length === 0) return null;
  if (reviews.some(([, r]) => r.status !== "completed")) {
    return { state: "pending", description: "Codex の監査が実行中です" };
  }
  if (reviews.some(([, r]) => r.has_unresolved_findings !== false)) {
    return { state: "failure", description: "Codex の未解決の指摘があります。修正して再監査を受けてください" };
  }
  if (reviews.some(([, r]) => r.has_any_findings === true) && !labelSet.has("audit:medium-accepted")) {
    return {
      state: "failure",
      description: "Codex の指摘が同一コミットで解決済みにされています。人間の確認（audit:medium-accepted）が必要です",
    };
  }
  if (!reviews.some(([k]) => k === "code_review")) return null;
  return { state: "success", description: "Codex 監査通過（標準形式・未解決の指摘なし）" };
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
  const nativeForHead = [];
  for (const e of trusted) {
    for (const m of parseAuditMarkers(e.body)) allMarkers.push({ ...m, at: e.at });
    const native = evaluateCodexState(parseCodexReviewState(e.body), headSha, labelSet);
    if (native) nativeForHead.push({ ...native, at: e.at });
  }

  const forHead = allMarkers.filter((m) => headMatches(m.head, headSha));
  const latest = forHead.at(-1);
  const latestNative = nativeForHead.at(-1);

  // Codex 標準形式の結果が ohuro-audit ブロックより新しい（または唯一の）場合はそちらを採用する
  if (latestNative && (!latest || String(latestNative.at) >= String(latest.at))) {
    return { state: latestNative.state, description: latestNative.description };
  }

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
