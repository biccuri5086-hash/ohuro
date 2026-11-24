#!/usr/bin/env node
// デザイン案の比較シート（Issue #52 / Art-6）。承認前の案（art/concepts/<名前>/*.svg）を検査し、
// 現行の素材と並べた 1 枚の画像を作る。案は本番のコンポーネント・広告には入れない。
// 使い方: node scripts/art/concept-sheet.mjs oyuwarashi [--out docs/art/concepts/oyuwarashi-sheet.png]
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadPlaywright } from "./capture.mjs";
import { lintSvg } from "./svg-lint.mjs";

/** 案の一覧（concepts.json）を読み、各 SVG を検査する。問題があれば errors に入れる */
export function loadConcepts(root, name) {
  const dir = join(root, "art/concepts", name);
  const meta = JSON.parse(readFileSync(join(dir, "concepts.json"), "utf8"));
  const palette = JSON.parse(readFileSync(join(root, "art/palette.json"), "utf8"));
  const errors = [];
  const files = new Set(readdirSync(dir).filter((f) => f.endsWith(".svg")));
  const rows = meta.concepts.map((c) => ({
    ...c,
    stages: c.stages.map((s) => {
      if (!files.has(s.file)) errors.push(`${name}/${s.file}: ファイルがありません`);
      const text = files.has(s.file) ? readFileSync(join(dir, s.file), "utf8") : "";
      for (const e of text ? lintSvg(text, palette) : []) errors.push(`${name}/${s.file}: ${e}`);
      files.delete(s.file);
      return { ...s, svg: text };
    }),
  }));
  for (const f of files) errors.push(`${name}/${f}: concepts.json に記録がありません`);
  return { meta, rows, errors };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 比較シートの HTML（外部の読み込みなし） */
export function sheetHtml({ meta, rows }, currentSvg) {
  const cell = (svg, label) => `<figure><div class="art">${svg}</div><figcaption>${esc(label)}</figcaption></figure>`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
  body{margin:0;padding:28px;background:#fdf6ec;color:#3b2a22;font-family:IPAGothic,sans-serif;width:1100px}
  h1{font-size:28px;margin:0 0 4px} p.note{margin:0 0 20px;color:#6a5448;font-size:16px}
  .row{display:flex;gap:18px;align-items:flex-start;margin-bottom:18px;background:#fff;border:2px solid #e8c39a;border-radius:16px;padding:14px 18px}
  .head{width:240px} .head h2{font-size:22px;margin:4px 0} .head p{margin:0;font-size:15px;color:#6a5448;line-height:1.5}
  figure{margin:0;text-align:center} .art{width:200px;height:200px} .art svg{width:200px;height:200px}
  figcaption{font-size:15px;margin-top:4px}
  </style></head><body>
  <h1>${esc(meta.title)}</h1><p class="note">${esc(meta.note)}</p>
  <div class="row"><div class="head"><h2>現行</h2><p>いまの LP・広告のペット（比較のため）</p></div>${cell(currentSvg, "現行のペット")}</div>
  ${rows
    .map(
      (c) =>
        `<div class="row"><div class="head"><h2>${esc(c.title)}</h2><p>${esc(c.description)}</p></div>${c.stages
          .map((s) => cell(s.svg, s.label))
          .join("")}</div>`,
    )
    .join("\n")}
  </body></html>`;
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const root = process.cwd();
  const name = process.argv[2];
  if (!name || name.startsWith("--")) throw new Error("案の名前を指定してください（例: oyuwarashi）");
  const data = loadConcepts(root, name);
  if (data.errors.length) {
    for (const e of data.errors) console.error(`問題: ${e}`);
    process.exitCode = 1;
    return;
  }
  const out = resolve(arg("--out") ?? join("docs/art/concepts", `${name}-sheet.png`));
  const current = readFileSync(join(root, data.meta.compareWith), "utf8");
  const { chromium } = loadPlaywright(root);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1156, height: 800 }, deviceScaleFactor: 2 });
    // 外部への通信はしない（すべてインライン）
    await page.route("**/*", (route) => (route.request().url().startsWith("data:") ? route.continue() : route.abort()));
    await page.setContent(sheetHtml(data, current), { waitUntil: "load" });
    mkdirSync(dirname(out), { recursive: true });
    await page.screenshot({ path: out, fullPage: true });
    console.log(`比較シート: ${out}`);
  } finally {
    await browser.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
}
