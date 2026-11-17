#!/usr/bin/env node
// Supabase マイグレーション整合性検査（静的解析。DBへは接続しない）。
//  - ファイル名形式 <14桁タイムスタンプ>_<snake_case>.sql と重複の禁止
//  - public スキーマに作るテーブルは同一ファイル内で RLS を有効化すること
//  - RLS の無効化禁止
//  - SECURITY DEFINER 関数は search_path を固定すること
//  - anon への全権限付与禁止
//  - 破壊的操作（DROP TABLE / TRUNCATE / DROP SCHEMA）は承認マーカー必須
// 静的検査であり、ポリシー内容の正しさは検証しない（TEST_PLAN.md の RLS テストで補う）。

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const NAME_RE = /^(\d{14})_[a-z0-9_]+\.sql$/;
const APPROVAL_RE = /--\s*approved-destructive:\s*D-\d{3,}/i;

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

function normalizeTable(name) {
  const cleaned = name.replace(/"/g, "").toLowerCase();
  return cleaned.includes(".") ? cleaned : `public.${cleaned}`;
}

/** 1ファイルの SQL を検査する */
export function checkMigrationSql(rawSql, file = "<sql>") {
  const errors = [];
  const sql = stripComments(rawSql);
  const lower = sql.toLowerCase();

  const created = [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?((?:"?[\w]+"?\.)?"?[\w]+"?)/gi)].map(
    (m) => normalizeTable(m[1]),
  );
  const rlsEnabled = new Set(
    [...sql.matchAll(/alter\s+table\s+(?:only\s+)?((?:"?[\w]+"?\.)?"?[\w]+"?)\s+enable\s+row\s+level\s+security/gi)].map(
      (m) => normalizeTable(m[1]),
    ),
  );
  for (const table of created) {
    if (table.startsWith("public.") && !rlsEnabled.has(table)) {
      errors.push(`${file}: ${table} の RLS が同一マイグレーション内で有効化されていません`);
    }
  }
  if (/disable\s+row\s+level\s+security/i.test(sql) || /no\s+force\s+row\s+level\s+security/i.test(sql)) {
    errors.push(`${file}: RLS の無効化は禁止されています`);
  }
  if (/security\s+definer/i.test(sql) && !/set\s+search_path/i.test(sql)) {
    errors.push(`${file}: SECURITY DEFINER 関数には search_path の固定が必要です`);
  }
  if (/grant\s+all(?:\s+privileges)?\s+on\s+[\s\S]*?\s+to\s+[^;]*\banon\b/i.test(sql)) {
    errors.push(`${file}: anon ロールへの全権限付与は禁止されています`);
  }
  const destructive = /\bdrop\s+table\b|\btruncate\b|\bdrop\s+schema\b/.test(lower);
  if (destructive && !APPROVAL_RE.test(rawSql)) {
    errors.push(
      `${file}: 破壊的操作には DECISIONS.md の承認番号を "-- approved-destructive: D-xxx" で記載してください`,
    );
  }
  return errors;
}

/** ファイル名一覧の形式・重複を検査する */
export function checkMigrationNames(names) {
  const errors = [];
  const seen = new Map();
  for (const name of names) {
    const m = name.match(NAME_RE);
    if (!m) {
      errors.push(`${name}: ファイル名は <YYYYMMDDHHMMSS>_<snake_case>.sql 形式にしてください`);
      continue;
    }
    if (seen.has(m[1])) errors.push(`${name}: タイムスタンプが ${seen.get(m[1])} と重複しています`);
    seen.set(m[1], name);
  }
  return errors;
}

export function checkMigrationsDir(dir = "supabase/migrations") {
  if (!existsSync(dir)) return [];
  const names = readdirSync(dir).filter((n) => n.endsWith(".sql")).sort();
  const errors = checkMigrationNames(names);
  for (const name of names) {
    errors.push(...checkMigrationSql(readFileSync(join(dir, name), "utf8"), name));
  }
  return errors;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const errors = checkMigrationsDir();
  if (errors.length > 0) {
    console.error("マイグレーション検査で問題を検出しました:");
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log("migration-check: 問題なし");
}
