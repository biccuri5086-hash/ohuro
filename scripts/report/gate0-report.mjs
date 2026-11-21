#!/usr/bin/env node
// Gate 0 需要検証レポートの生成（EXPERIMENT_PLAN.md 4章）。
// - DB（waitlist スキーマ）の集計ビューと、Meta 広告マネージャーから手入力した広告指標（CSV）を突き合わせる
// - 取得できていない数値は推測で埋めず「未取得」と表示する
// - 少額テストの結果であり、統計的に十分な市場調査ではないことを明記する
//
// 使い方:
//   REPORT_DATABASE_URL=postgres://... node scripts/report/gate0-report.mjs docs/gates/gate0_ad_metrics.csv > report.md
// 判定ルール（暫定・D-013）は gate0-criteria.mjs。照合結果は「判定の候補」の下書きで、判定は所有者が行う。
// REPORT_DATABASE_URL は読み取りに使う（書き込みはしない）。

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AD_IDS, GATE0_CRITERIA, SURVEY_RULES } from "./gate0-criteria.mjs";

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

/**
 * 割合を計算できる入力かを調べる。計算できなければ理由を返す（できれば null）。
 * 確認数が訪問数を上回ることがある（LP の計測がブロックされた、同じタブから複数のアドレスで登録した等）ため、
 * その場合は区間を算出しない（Codex 指摘 PR #33）。
 */
export function rateProblem(successes, n) {
  if (n === null || n === undefined || successes === null || successes === undefined) return "データ不足";
  if (!Number.isFinite(n) || !Number.isFinite(successes) || n < 0 || successes < 0) return "値が不正";
  if (n === 0) return "データ不足";
  if (successes > n) return "確認数が LP 訪問数を上回るため算出不可（計測漏れ・同じタブでの複数登録の可能性）";
  return null;
}

/** 割合の 95% 信頼区間（Wilson 法）。計算できない入力（n=0、確認数 > 訪問数、非有限値など）は null */
export function wilsonInterval(successes, n, z = 1.96) {
  if (rateProblem(successes, n)) return null;
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
  const pa = rateProblem(a.signups_confirmed, a.lp_sessions);
  const pb = rateProblem(b.signups_confirmed, b.lp_sessions);
  if (pa || pb) {
    const reasons = [pa && `${a.utm_content}: ${pa}`, pb && `${b.utm_content}: ${pb}`].filter(Boolean).join("／");
    return `比較できません（${reasons}）`;
  }
  const ia = wilsonInterval(a.signups_confirmed, a.lp_sessions);
  const ib = wilsonInterval(b.signups_confirmed, b.lp_sessions);
  if (ia[0] > ib[1]) return `${a.utm_content} が高い傾向（区間が重ならない。ただし少額テストのため確定ではない）`;
  if (ib[0] > ia[1]) return `${b.utm_content} が高い傾向（区間が重ならない。ただし少額テストのため確定ではない）`;
  return "優劣不明（信頼区間が重なる）";
}

/** 広告（utm_content）ごとの指標を計算する */
export function computeRows({ funnel, summary, adMetrics }) {
  const keys = new Set([...funnel.map((f) => f.utm_content), ...summary.map((x) => x.utm_content), ...adMetrics.map((a) => a.utm_content)]);
  return [...keys].sort().map((key) => {
    const f = funnel.find((x) => x.utm_content === key);
    // signup_summary_by_creative は utm_source・utm_campaign・utm_content ごとの行なので、utm_content ごとに合計する
    const sRows = summary.filter((x) => x.utm_content === key);
    const sumOf = (k) => (sRows.length === 0 ? null : sRows.reduce((acc, x) => acc + Number(x[k] ?? 0), 0));
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
      // DB に今ある確認済みの登録（削除された登録・解除後に再登録して未確認の登録は含まない）
      signups_confirmed_db: sumOf("signups_confirmed"),
      signups_confirmed_active: sumOf("signups_confirmed_active"),
      registration_rate: rateProblem(confirmed, lp) ? null : ratio(confirmed, lp),
      registration_rate_ci: wilsonInterval(confirmed, lp),
      cost_per_confirmed: ratio(spend, confirmed),
    };
  });
}

/** 任意アンケートの選択肢ごとの件数（任意回答者のみ） */
// 件数の入れ物はプロトタイプを持たないオブジェクトにする。保存済みの回答に `__proto__`・`constructor` などが
// 混ざっても、継承プロパティと衝突して件数が壊れないようにする（入力側の検査に加えた多重の防御。Codex 指摘 PR #31）
export function aggregateSurvey(rows) {
  const counts = Object.create(null);
  for (const r of rows) {
    const a = r.survey ?? {};
    for (const [k, v] of Object.entries(a)) {
      if (k === "free_text") continue;
      for (const val of Array.isArray(v) ? v : [v]) {
        if (typeof val !== "string") continue;
        counts[k] ??= Object.create(null);
        counts[k][val] = (counts[k][val] ?? 0) + 1;
      }
    }
  }
  return { respondents: rows.length, counts, freeTexts: rows.map((r) => r.survey?.free_text).filter(Boolean) };
}

/** 指定した選択肢の割合（分母は有効回答者）。rows は { survey } の配列 */
function rateOf(rows, key, { options, hits, excluded }) {
  let answered = 0;
  let valid = 0;
  let count = 0;
  for (const r of rows) {
    const v = r.survey?.[key];
    if (typeof v !== "string" || !options.includes(v)) continue;
    answered++;
    if (excluded.includes(v)) continue;
    valid++;
    if (hits.includes(v)) count++;
  }
  return { answered, unanswered: rows.length - answered, valid, hits: count, rate: valid === 0 ? null : count / valid, ci: wilsonInterval(count, valid) };
}

/**
 * 判定ルールに使うアンケートの指標（D-013 の 7）。
 * - 課題該当率: 「ほぼ毎日」「週に数回」÷（回答した人 −「答えたくない」）
 * - 写真許容率: 「受け入れられる」「条件によっては」÷ 回答した人（「わからない」は分母に残す）
 * 選択肢の定義にない値は数えない（未回答と同じ扱い）
 */
export function surveyStats(rows) {
  const R = SURVEY_RULES;
  const problem = rateOf(rows, "procrastination", { options: R.problemOptions, hits: R.problemHits, excluded: R.problemExcluded });
  const photo = rateOf(rows, "photo_acceptance", { options: R.photoOptions, hits: R.photoHits, excluded: R.photoExcluded });
  const photoYesOnly = rateOf(rows, "photo_acceptance", { options: R.photoOptions, hits: ["yes"], excluded: R.photoExcluded });
  return { respondents: rows.length, problem, photo, photoYesOnly };
}

const sumOrZero = (rows, k) => rows.reduce((acc, r) => acc + (r[k] ?? 0), 0);

/** DB に残る確認済み登録が、初回確認のイベント数を上回る広告（計測の食い違い。通常は起きない） */
export function confirmationMismatch(rows) {
  return rows.filter((r) => (r.signups_confirmed_db ?? 0) > (r.signups_confirmed ?? 0)).map((r) => r.utm_content);
}

/**
 * 暫定判定ルール（D-013）との照合と、判定の候補（下書き）。決めるのは所有者。
 * - 確認済み登録人数: 初回確認のイベント数（テスト除外。解除済み・削除済みも含む。D-013 の 9）
 * - 登録単価: 広告 A・B の広告費の合計 ÷ 広告 A・B 経由の確認済み登録
 * - LP 登録率: 確認済み登録 ÷ LP 訪問（参考指標）
 */
export function evaluateGate0({ rows, stats, criteria = GATE0_CRITERIA }) {
  const adRows = AD_IDS.map((id) => rows.find((r) => r.utm_content === id));
  const spendMissing = adRows.some((r) => !r || r.spend === null);
  const spend = spendMissing ? null : adRows.reduce((acc, r) => acc + r.spend, 0);
  const adConfirmed = sumOrZero(adRows.filter(Boolean), "signups_confirmed");
  const confirmed = sumOrZero(rows, "signups_confirmed");
  const lp = sumOrZero(rows, "lp_sessions");
  const lpProblem = rateProblem(confirmed, lp);
  const cost = spend === null || adConfirmed === 0 ? null : spend / adConfirmed;

  const checks = [];
  const add = (label, target, value, status, required = true) => checks.push({ label, target, value, status, required });
  add("確認済み登録人数", `${criteria.minConfirmed}人以上`, `${confirmed}人`, confirmed >= criteria.minConfirmed ? "達成" : "未達");
  if (spendMissing) add("確認済み登録単価", `${criteria.maxCostPerConfirmedJpy}円以下`, NA, "判定不可（広告費が未取得）");
  else if (adConfirmed === 0) add("確認済み登録単価", `${criteria.maxCostPerConfirmedJpy}円以下`, `広告費 ${yen(spend)}・確認済み 0人`, spend > 0 ? "未達" : "判定不可（広告費 0円）");
  else add("確認済み登録単価", `${criteria.maxCostPerConfirmedJpy}円以下`, yen(cost), cost <= criteria.maxCostPerConfirmedJpy ? "達成" : "未達");
  add(
    "LP 登録率（参考指標）",
    `${pct(criteria.referenceLpRate)}以上`,
    lpProblem ? NA : pct(confirmed / lp),
    lpProblem ? `判定不可（${lpProblem}）` : confirmed / lp >= criteria.referenceLpRate ? "達成" : "未達",
    false,
  );
  const validMin = Math.min(stats.problem.valid, stats.photo.valid);
  add("アンケート有効回答", `各質問 ${criteria.minValidResponses}人以上`, `課題 ${stats.problem.valid}人・写真 ${stats.photo.valid}人`, validMin >= criteria.minValidResponses ? "達成" : "未達");
  const rateCheck = (label, st, min) => {
    if (st.valid < criteria.minValidResponses) add(label, `${pct(min)}以上`, st.rate === null ? NA : pct(st.rate), "判定不可（有効回答が不足）");
    else add(label, `${pct(min)}以上`, `${pct(st.rate)}（${st.hits}/${st.valid}）`, st.rate >= min ? "達成" : "未達");
  };
  rateCheck("課題該当率", stats.problem, criteria.minProblemRate);
  rateCheck("写真 2 回撮影の許容率", stats.photo, criteria.minPhotoAcceptRate);
  add("登録機能と計測に重大な不具合がない", "不具合なし", "—", "所有者が確認");

  const hold = [];
  if (spendMissing) hold.push("広告費が未取得");
  if (validMin < criteria.minValidResponses) hold.push(`アンケートの有効回答が ${criteria.minValidResponses}人未満`);
  if (lpProblem) hold.push(`LP 訪問の計測が不十分（${lpProblem}）`);
  const mismatch = confirmationMismatch(rows);
  if (mismatch.length) hold.push(`確認済み登録の記録が食い違う（${mismatch.join("・")}）`);
  const unmet = checks.filter((c) => c.required && c.status === "未達").map((c) => c.label);
  let candidate;
  if (hold.length) candidate = `判断保留の候補（${hold.join("・")}）`;
  else if (unmet.length) candidate = `要改善の候補（未達: ${unmet.join("・")}）`;
  else candidate = "合格の候補（登録機能と計測に重大な不具合がないことを所有者が確認した場合に限る）";
  return { checks, candidate, totals: { spend, adConfirmed, confirmed, lp, cost } };
}

function renderSurveyRates(label, st) {
  return `- ${label}: ${st.rate === null ? NA : pct(st.rate)}（${st.hits}/${st.valid}人${st.ci ? `、95% 区間 ${pct(st.ci[0])}〜${pct(st.ci[1])}` : ""}）。この質問の未回答 ${st.unanswered}人`;
}

export function renderReport({ rows, survey, generatedAt, surveyRows = [], testSignups = null }) {
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
    ...rows.map((r) => {
      const problem = rateProblem(r.signups_confirmed, r.lp_sessions);
      if (problem) return `- ${r.utm_content}: ${problem === "データ不足" ? NA : problem}`;
      return `- ${r.utm_content}: ${pct(r.registration_rate_ci[0])}〜${pct(r.registration_rate_ci[1])}（LP訪問 ${r.lp_sessions}）`;
    }),
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
    ...renderBreakdown(rows, surveyRows, testSignups),
    ...renderEvaluation(rows, surveyRows),
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

/** 登録人数の内訳（テスト・重複・解除済みを分ける） */
function renderBreakdown(rows, surveyRows, testSignups) {
  const confirmed = sumOrZero(rows, "signups_confirmed");
  // 集計ビューは DB に行がある utm_content だけを返すため、行がない（null）は 0 人と同じ
  const inDb = sumOrZero(rows, "signups_confirmed_db");
  const active = sumOrZero(rows, "signups_confirmed_active");
  const mismatch = confirmationMismatch(rows);
  const removed = mismatch.length
    ? `算出不可（DB の確認済み登録が確認イベントより多い: ${mismatch.join("・")}。計測の不整合のため確認が必要）`
    : `${confirmed - inDb}人`;
  return [
    "## 登録人数の内訳",
    "",
    `- 確認済み登録（初回の確認。テスト除外）: ${confirmed}人`,
    `  - うち現在も登録中: ${active}人`,
    `  - うち配信停止（解除済み）: ${inDb - active}人`,
    `  - うち削除済み、または解除後に再登録して未確認: ${removed}`,
    `- テスト登録（集計から除外）: ${testSignups === null ? NA : `${testSignups}件`}`,
    "- 重複: メールアドレスは DB で一意のため、同じアドレスでの再送信は 1 人として数える。ただし、データを削除した後に同じアドレスで再登録した場合は 2 回数えられる",
    `- アンケート未回答（DB に残る確認済み登録のうち）: ${Math.max(0, inDb - surveyRows.length)}人`,
    "",
  ];
}

/** 暫定判定ルールとの照合（広告 A・B 別のアンケートを含む） */
function renderEvaluation(rows, surveyRows) {
  const stats = surveyStats(surveyRows);
  const ev = evaluateGate0({ rows, stats });
  const byAd = [...AD_IDS, "(その他)"].map((id) => {
    const list = surveyRows.filter((r) => (id === "(その他)" ? !AD_IDS.includes(r.utm_content) : r.utm_content === id));
    return [id, surveyStats(list)];
  });
  return [
    "## 暫定判定ルールとの照合（DECISIONS.md D-013）",
    "",
    "> 今回の実験のための仮の基準との照合です。市場の標準値や収益性を保証するものではありません。判定は所有者が行い、AI だけで Gate 1 に進みません。",
    "",
    "| 指標 | 基準 | 実測 | 照合 |",
    "|---|---|---|---|",
    ...ev.checks.map((c) => `| ${c.label} | ${c.target} | ${c.value} | ${c.status} |`),
    "",
    `- 広告費の合計（A・B）: ${yen(ev.totals.spend)}（上限 ${yen(GATE0_CRITERIA.adBudgetJpy)}）`,
    `- 判定の候補（下書き）: **${ev.candidate}**`,
    "",
    "### アンケートの割合（有効回答者が分母）",
    "",
    renderSurveyRates("課題該当率（先延ばしが「ほぼ毎日」「週に数回」。「答えたくない」は分母から除く）", stats.problem),
    renderSurveyRates("写真 2 回撮影の許容率（「受け入れられる」「条件によっては」。「わからない」は分母に残す）", stats.photo),
    renderSurveyRates("うち「受け入れられる」のみ", stats.photoYesOnly),
    "",
    "広告別:",
    "",
    ...byAd.map(([id, st]) => `- ${id}: 回答者 ${st.respondents}人、課題該当率 ${st.problem.rate === null ? NA : pct(st.problem.rate)}（${st.problem.hits}/${st.problem.valid}）、写真許容率 ${st.photo.rate === null ? NA : pct(st.photo.rate)}（${st.photo.hits}/${st.photo.valid}）`),
    "",
    "広告別の回答は人数が少なく、割合の幅が大きい。広告の優劣の根拠にしない。",
    "",
  ];
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
      select survey, coalesce(utm_content, '(none)') as utm_content from waitlist.signups
      where not is_test and confirmed_at is not null and survey is not null`;
    const [{ test_signups: testSignups }] = await sql`
      select count(*)::int as test_signups from waitlist.signups where is_test`;
    const rows = computeRows({ funnel, summary, adMetrics });
    console.log(
      renderReport({ rows, survey: aggregateSurvey(surveyRows), surveyRows, testSignups, generatedAt: new Date().toISOString() }),
    );
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
