#!/usr/bin/env node
// 保存期間を過ぎた事前登録データを数える／削除する（Issue #45。期間は DECISIONS.md D-013 の 11）。
//
// 使い方:
//   PURGE_DATABASE_URL=postgres://... npm run waitlist:purge                       # 確認モード（件数だけ。変更しない）
//   PURGE_DATABASE_URL=postgres://... npm run waitlist:purge -- --gate0-decided-at 2027-01-15
//   PURGE_DATABASE_URL=postgres://... npm run waitlist:purge -- --execute          # 削除する
//
// 本番データの削除です。--execute は所有者が承認し、所有者が実行する（CLAUDE.md 2 章）。
// 先に確認モードで件数を見てから実行する。接続文字列はコマンド履歴やチャットに残さない。

import { fileURLToPath } from "node:url";
import { formatResult, purgeExpired } from "./retention.mjs";

/** @param {string[]} argv */
export function parseArgs(argv) {
  /** @type {{ execute: boolean, gate0DecidedAt: Date | null }} */
  const out = { execute: false, gate0DecidedAt: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--execute") out.execute = true;
    else if (a === "--gate0-decided-at") {
      const v = argv[++i];
      if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error("--gate0-decided-at は YYYY-MM-DD で指定してください");
      const d = new Date(`${v}T00:00:00+09:00`);
      if (Number.isNaN(d.getTime())) throw new Error("--gate0-decided-at の日付が不正です");
      out.gate0DecidedAt = d;
    } else throw new Error(`不明な引数です: ${a}`);
  }
  return out;
}

async function main() {
  const url = process.env.PURGE_DATABASE_URL;
  if (!url) throw new Error("PURGE_DATABASE_URL を指定してください");
  const args = parseArgs(process.argv.slice(2));
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const result = await purgeExpired(sql, { ...args, now: new Date() });
    console.log(formatResult(result));
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    // 接続文字列などを含みうる詳細は出さない
    console.error(e instanceof Error && !/postgres:\/\//.test(e.message) ? e.message : "purge failed");
    process.exit(1);
  });
}
