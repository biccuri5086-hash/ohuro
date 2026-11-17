#!/usr/bin/env node
// 製品ポリシーの機械検査（CLAUDE.md の絶対禁止事項のうち、静的に検出できるもの）。
// ヒューリスティックであり、違反がないことを証明するものではない。最終確認は独立監査が行う。
//
// 使い方:
//   node scripts/harness/policy-check.mjs                 # 作業ツリー全体の内容検査
//   node scripts/harness/policy-check.mjs --base origin/main  # 加えてテスト削除の検出
// テスト削除が承認済み（PR ラベル approved:test-removal）の場合のみ ALLOW_TEST_REMOVAL=true を渡す。

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CODE_EXT = /\.(?:[cm]?[jt]sx?)$/;
const SCAN_ROOTS = ["src", "supabase/functions", "public"];
const ROOT_FILES = ["next.config.ts", "next.config.mjs", "next.config.js", "middleware.ts", "proxy.ts"];

// 入浴前後の写真を外部AIへ送らないための検査。端末内推論のみ許可する。
export const FORBIDDEN_AI_ENDPOINTS = [
  "api.openai.com",
  "api.anthropic.com",
  "generativelanguage.googleapis.com",
  "vision.googleapis.com",
  "aiplatform.googleapis.com",
  "rekognition.",
  "cognitiveservices.azure.com",
  "api-inference.huggingface.co",
  "router.huggingface.co",
  "api.clarifai.com",
  "api.replicate.com",
];

export const FORBIDDEN_3D_PACKAGES = [/^three$/, /^@react-three\//, /^babylonjs/, /^@babylonjs\//, /^playcanvas$/];

const TEST_FILE_RE = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/;

/** 1ファイル分のソースを検査する */
export function checkSource(text, file, { testRulesOnly = false } = {}) {
  const errors = [];
  if (testRulesOnly) return checkTestRules(text, file);
  const isClient = /^\s*["']use client["']/m.test(text);

  for (const host of FORBIDDEN_AI_ENDPOINTS) {
    if (text.includes(host)) {
      errors.push(`${file}: 外部AI API (${host}) の参照は禁止です。写真解析は端末内で行います`);
    }
  }
  if (/NEXT_PUBLIC_[A-Z0-9_]*SERVICE_ROLE/.test(text)) {
    errors.push(`${file}: service_role キーを NEXT_PUBLIC_ で公開してはいけません`);
  }
  if (isClient && /SUPABASE_SERVICE_ROLE_KEY|service_role/.test(text)) {
    errors.push(`${file}: クライアントコンポーネントから service_role を参照しています`);
  }
  if (isClient && /from\s+["']@\/server\//.test(text)) {
    errors.push(`${file}: クライアントコンポーネントから src/server を import しています`);
  }
  if (/(^|\/)src\/server\//.test(file) && !/import\s+["']server-only["']/.test(text)) {
    errors.push(`${file}: src/server 配下のモジュールは import "server-only" が必要です`);
  }
  if (
    isClient &&
    /Math\.random|getRandomValues/.test(text) &&
    /gacha|lottery|reward|coin|ガチャ|コイン|報酬/i.test(`${file}\n${text}`)
  ) {
    errors.push(`${file}: ガチャ・報酬・コインの抽選や確定をクライアントで行ってはいけません`);
  }
  if (/\.storage\s*\.\s*from\s*\(/.test(text)) {
    errors.push(`${file}: Supabase Storage の利用は承認が必要です（入浴写真の保存禁止のため）`);
  }
  errors.push(...checkTestRules(text, file));
  return errors;
}

function checkTestRules(text, file) {
  const errors = [];
  if (TEST_FILE_RE.test(file)) {
    text.split(/\r?\n/).forEach((line, i) => {
      if (/\b(?:it|test|describe)\.only\s*\(/.test(line)) {
        errors.push(`${file}:${i + 1}: .only はコミットできません`);
      }
      if (/\b(?:it|test|describe)\.(?:skip|todo)\s*\(/.test(line) && !/policy:allow-skip\s+D-\d{3,}/.test(line)) {
        errors.push(`${file}:${i + 1}: テストの skip には DECISIONS.md の承認番号 (policy:allow-skip D-xxx) が必要です`);
      }
    });
  }
  return errors;
}

/** package.json の依存関係を検査する（3D化の禁止など） */
export function checkPackageJson(pkg) {
  const errors = [];
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  for (const name of Object.keys(deps)) {
    if (FORBIDDEN_3D_PACKAGES.some((re) => re.test(name))) {
      errors.push(`package.json: 3D ライブラリ (${name}) は禁止です。ゲーム表現はすべて2Dです`);
    }
  }
  return errors;
}

/** 削除されたファイル一覧からテスト削除を検出する */
export function checkDeletedFiles(deleted, allowTestRemoval) {
  if (allowTestRemoval) return [];
  return deleted
    .filter((f) => TEST_FILE_RE.test(f))
    .map((f) => `${f}: テストファイルの削除には人間の承認（ラベル approved:test-removal）が必要です`);
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (CODE_EXT.test(name)) out.push(p);
  }
  return out;
}

function deletedSince(base) {
  const out = execFileSync("git", ["diff", "--name-only", "--diff-filter=D", `${base}...HEAD`], {
    encoding: "utf8",
  });
  return out.split("\n").filter(Boolean);
}

export function runPolicyCheck({ base, allowTestRemoval } = {}) {
  const errors = [];
  const files = [...SCAN_ROOTS.flatMap((r) => walk(r)), ...ROOT_FILES.filter((f) => existsSync(f)), ...walk("tests")];
  for (const file of files) {
    // ハーネス自身のテストは検出パターンを含むため、テスト規則（.only/.skip）のみ適用する
    const testRulesOnly = file.startsWith("tests/harness/");
    errors.push(...checkSource(readFileSync(file, "utf8"), file, { testRulesOnly }));
  }
  if (existsSync("package.json")) {
    errors.push(...checkPackageJson(JSON.parse(readFileSync("package.json", "utf8"))));
  }
  if (base) errors.push(...checkDeletedFiles(deletedSince(base), allowTestRemoval));
  return errors;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const idx = process.argv.indexOf("--base");
  const base = idx > -1 ? process.argv[idx + 1] : undefined;
  const errors = runPolicyCheck({ base, allowTestRemoval: process.env.ALLOW_TEST_REMOVAL === "true" });
  if (errors.length > 0) {
    console.error("ポリシー検査で違反を検出しました:");
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log("policy-check: 違反なし");
}
