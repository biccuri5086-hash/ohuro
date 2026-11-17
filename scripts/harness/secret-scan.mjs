#!/usr/bin/env node
// 秘密情報混入検査: git 管理下のファイルを走査し、鍵・トークンらしき文字列を検出する。
// 誤検知の行は同じ行に `secret-scan:allow` を書いて除外できる（理由をPRに記載すること）。
// GitHub の Secret scanning / Push protection と併用する前提の補助検査であり、網羅を保証しない。

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const RULES = [
  { id: "private-key", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/ },
  { id: "aws-access-key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: "github-token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/ },
  { id: "anthropic-key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { id: "openai-key", re: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}/ },
  { id: "stripe-live-key", re: /\b(?:sk|rk)_live_[0-9A-Za-z]{16,}/ },
  { id: "supabase-secret-key", re: /\bsb_secret_[A-Za-z0-9_-]{16,}/ },
  { id: "google-api-key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: "slack-token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  // Supabase の anon / service_role キーは JWT 形式。リポジトリには一切置かない。
  { id: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  {
    id: "generic-credential-assignment",
    re: /\b(?:api[_-]?key|secret|password|passwd|access[_-]?token|auth[_-]?token)\b["']?\s*[:=]\s*["'][^"'\s]{16,}["']/i,
  },
];

const ALLOW_MARKER = "secret-scan:allow";
const MAX_BYTES = 1_000_000;

/** 1ファイル分のテキストを検査し、検出結果を返す。 */
export function scanText(text, file = "<text>") {
  const findings = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.includes(ALLOW_MARKER)) return;
    for (const rule of RULES) {
      if (rule.re.test(line)) findings.push({ file, line: i + 1, rule: rule.id });
    }
  });
  return findings;
}

/** ファイル名だけで危険と判断できるもの（.env 実ファイル、鍵ファイル） */
export function scanPath(file) {
  const base = file.split("/").pop() ?? file;
  if (/^\.env(\..+)?$/.test(base) && base !== ".env.example") {
    return [{ file, line: 0, rule: "env-file-committed" }];
  }
  if (/\.(pem|key|p12|pfx|keystore|jks)$/i.test(base)) {
    return [{ file, line: 0, rule: "key-file-committed" }];
  }
  return [];
}

function listTrackedFiles() {
  const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
  });
  return out.split("\0").filter(Boolean);
}

function looksBinary(buf) {
  return buf.subarray(0, 8000).includes(0);
}

export function scanRepository(files = listTrackedFiles()) {
  const findings = [];
  for (const file of files) {
    findings.push(...scanPath(file));
    let st;
    try {
      st = statSync(file);
    } catch {
      continue; // 削除済み
    }
    if (!st.isFile() || st.size > MAX_BYTES) continue;
    const buf = readFileSync(file);
    if (looksBinary(buf)) continue;
    findings.push(...scanText(buf.toString("utf8"), file));
  }
  return findings;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const findings = scanRepository();
  if (findings.length > 0) {
    console.error("秘密情報の可能性がある文字列を検出しました（値は表示しません）:");
    for (const f of findings) console.error(`  ${f.file}:${f.line}  [${f.rule}]`);
    console.error("本物の秘密情報なら直ちに失効・再発行し、履歴からの除去を人間に相談してください。");
    process.exit(1);
  }
  console.log("secret-scan: 検出なし");
}
