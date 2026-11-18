#!/usr/bin/env node
// Gate 0 需要検証レポートの生成（EXPERIMENT_PLAN.md 4章）。
// - DB（waitlist スキーマ）の集計ビューと、Meta 広告マネージャーから手入力した広告指標（CSV）を突き合わせる
// - 取得できていない数値は推測で埋めず「未取得」と表示する
// - 少額テストの結果であり、統計的に十分な市場調査ではないことを明記する
//
// 使い方:
//   REPORT_DATABASE_URL=postgres://... node scripts/report/gate0-report.mjs docs/gates/gate0_ad_metrics.csv > report.md
// REPORT_DATABASE_URL は読み取りに使う（書き込みはしない）。

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const NA = "未取得";

/** CSV（ヘッダー付き、カンマ区切り、引用符なし）を読む */
export function parseAdMetricsCsv(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (lines.length === 0) return [];
  const header = lines[0].split(",").map((h) => h.trim());
  const required = ["utm_content", "spend_jpy", "impressions", "clicks"];
  for (const r of required) if (!header.includes(r)) throw new Error(`CSV に列 ${r} がありません`);
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const row = Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
    const num = (v) => (v === "" || v === undefined ? null : Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : NaN);
    const parsed = { utm_content: row.utm_content, spend: num(row.spend_jpy), impressions: num(row.impressions), clicks: num(row.clicks) };
    for (const k of ["spend", "impressions", "clicks"]) {
      if (Number.isNaN(parsed[k])) throw new Error(`CSV の ${row.utm_content} の ${k} が数値ではありません`);
    }
    return parsed;
  });
}

const ratio = (n, d) => (n === null || d === null || d === undefined || d === 0 ? null : n / d);
const pct = (v) => (v === null ? NA : `${(v * 100).toFixed(1)}%`);
const yen = (v) => (v === null ? NA : `${Math.round(v).toLocaleString("ja-JP")}円`);
const int = (v) => (v === null || v === undefined ? NA : String(v));

/** 割合の 95% 信頼区間（Wilson 法）。n=0 は null */
export function wilsonInterval(successes, n, z = 1.96) {
  if (n === null || successes === null || n <= 0) return null;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

/**
 * 2 つの広告の登録率を比べる。信頼区間が重なる・データ不足なら「優劣不明」。
 * 統計的検定の代わりではなく、少数サンプルで差を断定しないための目安。
 */
export function compareRates(a, b) {
  const ia = wilsonInterval(a.signups_confirmed, a.lp_sessions);
  const ib = wilsonInterval(b.signups_confirmed, b.lp_sessions);
  if (!ia || !ib) return "データ不足（比較できません）";
  if (ia[0] > ib[1]) return `${a.utm_content} が高い傾向（区間が重ならない。ただし少額テストのため確定ではない）`;
  if (ib[0] > ia[1]) return `${b.utm_content} が高い傾向（区間が重ならない。ただし少額テストのため確定ではない）`;
  return "優劣不明（信頼区間が重なる）";
}

/** 広告（utm_content）ごとの指標を計算する */
export function computeRows({ funnel, summary, adMetrics }) {
  const keys = new Set([...funnel.map((f) => f.utm_content), ...adMetrics.map((a) => a.utm_content)]);
  return [...keys].sort().map((key) => {
    const f = funnel.find((x) => x.utm_content === key);
    const s = summary.find((x) => x.utm_content === key);
    const a = adMetrics.find((x) => x.utm_content === key);
    const spend = a ? a.spend : null;
    const impressions = a ? a.impressions : null;
    const clicks = a ? a.clicks : null;
    const lp = f ? Number(f.lp_sessions) : null;
    const confirmed = f ? Number(f.signups_confirmed) : null;
    return {
      utm_content: key,
      spend,
      impressions,
      clicks,
      ctr: ratio(clicks, impressions),
      cpc: ratio(spend, clicks),
      lp_sessions: lp,
      form_view_sessions: f ? Number(f.form_view_sessions) : null,
      form_submit_sessions: f ? Number(f.form_submit_sessions) : null,
      signups_created: f ? Number(f.signups_created) : null,
      signups_confirmed: confirmed,
      signups_confirmed_active: s ? Number(s.signups_confirmed_active) : null,
      registration_rate: ratio(confirmed, lp),
      registration_rate_ci: wilsonInterval(confirmed, lp),
      cost_per_confirmed: ratio(spend, confirmed),
    };
  });
}

/** 任意アンケートの選択肢ごとの件数（任意回答者のみ） */
export function aggregateSurvey(rows) {
  const counts = {};
  for (const r of rows) {
    const a = r.survey ?? {};
    for (const [k, v] of Object.entries(a)) {
      if (k === "free_text") continue;
      for (const val of Array.isArray(v) ? v : [v]) {
        counts[k] ??= {};
        counts[k][val] = (counts[k][val] ?? 0) + 1;
      }
    }
  }
  return { respondents: rows.length, counts, freeTexts: rows.map((r) => r.survey?.free_text).filter(Boolean) };
}

export function renderReport({ rows, survey, generatedAt }) {
  const total = (k) => {
    const vals = rows.map((r) => r[k]);
    return vals.some((v) => v === null) ? null : vals.reduce((x, y) => x + y, 0);
  };
  const lines = [
    `# Gate 0 需要検証レポート`,
    "",
    `生成日時: ${generatedAt}`,
    "",
    "> 少額の広告テストによる結果です。統計的に十分な市場調査ではありません。登録人数だけで市場需要が確定したとは判断できません。",
    "> 「未取得」は、データが入力・計測されていない項目です（推測で埋めていません）。テスト登録・テスト流入は除外しています。",
    "",
    "## 広告別の指標",
    "",
    "| 広告（utm_content） | 広告費 | 表示回数 | クリック | CTR | CPC | LP訪問（セッション） | フォーム表示 | フォーム送信 | 登録 | 確認済み登録 | 登録率（確認済み/LP訪問） | 確認済み登録単価 |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.utm_content} | ${yen(r.spend)} | ${int(r.impressions)} | ${int(r.clicks)} | ${pct(r.ctr)} | ${yen(r.cpc)} | ${int(r.lp_sessions)} | ${int(r.form_view_sessions)} | ${int(r.form_submit_sessions)} | ${int(r.signups_created)} | ${int(r.signups_confirmed)} | ${pct(r.registration_rate)} | ${yen(r.cost_per_confirmed)} |`,
    ),
    "",
    "### 登録率の幅（95% 信頼区間・Wilson 法）",
    "",
    ...rows.map((r) => `- ${r.utm_content}: ${r.registration_rate_ci ? `${pct(r.registration_rate_ci[0])}〜${pct(r.registration_rate_ci[1])}（LP訪問 ${r.lp_sessions}）` : NA}`),
    "",
    `- 広告 A / B の比較: ${(() => {
      const a = rows.find((r) => r.utm_content === "ad_a_v1");
      const b = rows.find((r) => r.utm_content === "ad_b_v1");
      return a && b ? compareRates(a, b) : "データ不足（比較できません）";
    })()}`,
    "",
    `- 総広告費: ${yen(total("spend"))}`,
    `- 確認済み登録（合計）: ${int(total("signups_confirmed"))}`,
    "",
    "## 任意アンケート",
    "",
    `回答者: ${survey.respondents}人（確認済み登録者のうち任意で回答した人のみ。登録者全体の意見ではありません）`,
    "",
    ...Object.entries(survey.counts).flatMap(([q, opts]) => [
      `### ${q}`,
      "",
      ...Object.entries(opts)
        .sort((a, b) => b[1] - a[1])
        .map(([opt, n]) => `- ${opt}: ${n}`),
      "",
    ]),
    `自由回答: ${survey.freeTexts.length}件（本文はレポートに載せず、DB 上で確認する。個人情報が含まれていないか確認してから共有する）`,
    "",
    "## 計測上の制約",
    "",
    "- LP 訪問・フォーム表示はブラウザのタブ単位の識別子で重複を除外しており、同じ人が別のタブ・端末で訪れると別に数える",
    "- 計測の送信がブロックされる環境（一部の広告ブロッカー等）では LP 訪問が少なく数えられる。登録・確認はサーバー側で記録するため影響を受けない",
    "- 広告費・表示回数・クリックは Meta 広告マネージャーの値を手入力したもの",
    "- 広告間の差が小さい場合は、優劣不明として扱う",
    "",
  ];
  return lines.join("\n");
}

async function main() {
  const url = process.env.REPORT_DATABASE_URL;
  if (!url) throw new Error("REPORT_DATABASE_URL を指定してください");
  const csvPath = process.argv[2];
  const adMetrics = csvPath ? parseAdMetricsCsv(readFileSync(csvPath, "utf8")) : [];
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    await sql`set default_transaction_read_only = on`;
    const funnel = await sql`select * from waitlist.funnel_by_creative`;
    const summary = await sql`select * from waitlist.signup_summary_by_creative`;
    const surveyRows = await sql`
      select survey from waitlist.signups
      where not is_test and confirmed_at is not null and survey is not null`;
    const rows = computeRows({ funnel, summary, adMetrics });
    console.log(renderReport({ rows, survey: aggregateSurvey(surveyRows), generatedAt: new Date().toISOString() }));
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : "report failed");
    process.exit(1);
  });
}
