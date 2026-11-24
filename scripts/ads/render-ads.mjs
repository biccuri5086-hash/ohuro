#!/usr/bin/env node
// 広告素材の生成（Issue #15）。ads.config.mjs を元に、シーン画像 → 縦型動画（MP4・無音）・サムネイル・確認用の一覧画像を作る。
// 必要なもの: Playwright（Chromium）、ffmpeg、日本語フォント（IPAGothic）。CI では実行しない（生成物をコミットする）。
// 使用素材: キャラクターは画像生成 AI のコンセプト画像（src/assets/characters/*.webp、台帳 art/characters.json、D-015）、
// それ以外は本スクリプト内のオリジナル SVG。フォントは IPA ゴシック（art/ASSETS.json に記録）。
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { ADS, landingUrl, VIDEO } from "./ads.config.mjs";

const require = createRequire(import.meta.url);
const OUT = join(process.cwd(), "marketing", "ads");
const L = "#5b3f33";

// キャラクターの画像（Issue #54）。SVG の場面の中に data URI で埋め込む（外部の読み込みをしない）
function character(id, x, y, size, extra = "") {
  const b64 = readFileSync(join(process.cwd(), "src", "assets", "characters", `${id}.webp`)).toString("base64");
  return `<image href="data:image/webp;base64,${b64}" x="${x}" y="${y}" width="${size}" height="${size}"${extra}/>`;
}

const coin = (x, y, r = 34) => `<g transform="translate(${x} ${y})"><circle r="${r}" fill="#ffd35c" stroke="${L}" stroke-width="6"/><circle r="${r * 0.62}" fill="none" stroke="#e3a92a" stroke-width="5"/><circle cx="${-r * 0.25}" cy="${-r * 0.2}" r="${r * 0.14}" fill="#fff"/></g>`;

const ART = {
  "pet-coins": `<svg viewBox="0 0 600 520">${character("furopen", 100, 10, 400)}${coin(110, 380)}${coin(500, 360)}${coin(470, 120, 28)}${coin(130, 150, 26)}</svg>`,
  gacha: `<svg viewBox="0 0 600 560">
    <rect x="150" y="250" width="300" height="260" rx="28" fill="#f39c8b" stroke="${L}" stroke-width="8"/>
    <circle cx="300" cy="200" r="150" fill="#e8f5fb" stroke="${L}" stroke-width="8"/>
    <circle cx="240" cy="180" r="34" fill="#ffd35c" stroke="${L}" stroke-width="5"/><circle cx="330" cy="150" r="34" fill="#8cc7a0" stroke="${L}" stroke-width="5"/>
    <circle cx="350" cy="240" r="34" fill="#b9a6f0" stroke="${L}" stroke-width="5"/><circle cx="260" cy="260" r="30" fill="#f7b267" stroke="${L}" stroke-width="5"/>
    <circle cx="300" cy="380" r="44" fill="#fff4e4" stroke="${L}" stroke-width="7"/><rect x="292" y="345" width="16" height="70" rx="8" fill="${L}"/>
    <rect x="250" y="450" width="100" height="40" rx="10" fill="#fff4e4" stroke="${L}" stroke-width="6"/>
    ${coin(500, 430, 40)}</svg>`,
  collection: `<svg viewBox="0 0 600 520">
    ${character("mizuhane", 10, 80, 340)}
    <path d="M150 120l40-40 40 40z" fill="#6fb3dd" stroke="${L}" stroke-width="6" stroke-linejoin="round"/>
    <rect x="360" y="240" width="160" height="90" rx="20" fill="#f39c8b" stroke="${L}" stroke-width="6"/><rect x="350" y="290" width="30" height="70" rx="12" fill="#f39c8b" stroke="${L}" stroke-width="6"/><rect x="500" y="290" width="30" height="70" rx="12" fill="#f39c8b" stroke="${L}" stroke-width="6"/>
    <rect x="420" y="60" width="16" height="140" fill="${L}"/><path d="M380 60h96l-20 50h-56z" fill="#ffd35c" stroke="${L}" stroke-width="6" stroke-linejoin="round"/>
    <rect x="300" y="400" width="240" height="20" rx="10" fill="#bfe0c8" stroke="${L}" stroke-width="5"/></svg>`,
  room: `<svg viewBox="0 0 640 400">
    <rect x="4" y="4" width="632" height="392" rx="26" fill="#fff4e4" stroke="${L}" stroke-width="8"/>
    <rect x="8" y="290" width="624" height="102" rx="20" fill="#e8c39a"/><path d="M8 290h624" stroke="${L}" stroke-width="6"/>
    <rect x="56" y="60" width="140" height="112" rx="10" fill="#cfe9f7" stroke="${L}" stroke-width="6"/><path d="M126 60v112M56 116h140" stroke="${L}" stroke-width="6"/>
    <rect x="452" y="90" width="140" height="200" rx="10" fill="#d9a877" stroke="${L}" stroke-width="6"/><path d="M452 156h140M452 222h140" stroke="${L}" stroke-width="6"/>
    <rect x="220" y="216" width="190" height="72" rx="22" fill="#f39c8b" stroke="${L}" stroke-width="6"/>
    ${character("yuzunyan", 225, 85, 190)}
    <ellipse cx="320" cy="340" rx="140" ry="20" fill="#bfe0c8" stroke="${L}" stroke-width="5"/></svg>`,
  "phone-night": `<svg viewBox="0 0 600 600">
    <rect x="170" y="40" width="260" height="500" rx="40" fill="#2e3a59" stroke="${L}" stroke-width="10"/>
    <rect x="195" y="90" width="210" height="370" rx="14" fill="#cfe9f7"/>
    <path d="M270 220l90 55-90 55z" fill="#f39c8b"/>
    <rect x="215" y="400" width="170" height="14" rx="7" fill="#9fb3c8"/><rect x="215" y="400" width="120" height="14" rx="7" fill="#2b7bb9"/>
    <circle cx="300" cy="500" r="16" fill="#9fb3c8"/></svg>`,
  moon: `<svg viewBox="0 0 600 560">
    <rect x="40" y="40" width="520" height="480" rx="40" fill="#2e3a59" stroke="${L}" stroke-width="8"/>
    <path d="M360 140a120 120 0 1 0 80 200 100 100 0 1 1-80-200z" fill="#ffd35c" stroke="${L}" stroke-width="6"/>
    <circle cx="150" cy="140" r="8" fill="#fff"/><circle cx="210" cy="250" r="6" fill="#fff"/><circle cx="480" cy="120" r="7" fill="#fff"/><circle cx="120" cy="380" r="6" fill="#fff"/>
    ${character("kuragera", 60, 270, 240, ' opacity="0.95"')}</svg>`,
  quest: `<svg viewBox="0 0 600 560">
    <rect x="60" y="40" width="480" height="480" rx="32" fill="#fff" stroke="${L}" stroke-width="8"/>
    <rect x="60" y="40" width="480" height="90" rx="32" fill="#2b7bb9"/><rect x="60" y="100" width="480" height="30" fill="#2b7bb9"/>
    ${[0, 1, 2]
      .map(
        (i) => `<rect x="110" y="${180 + i * 110}" width="56" height="56" rx="12" fill="${i === 0 ? "#8cc7a0" : "#fff"}" stroke="${L}" stroke-width="6"/>
    ${i === 0 ? `<path d="M122 ${208 + i * 110}l14 14 22-26" stroke="#fff" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : ""}
    <rect x="196" y="${192 + i * 110}" width="${[260, 220, 180][i]}" height="32" rx="16" fill="#f1e4d6"/>`,
      )
      .join("")}</svg>`,
  cta: `<svg viewBox="0 0 600 480">${character("yuzukapi", 20, 20, 300)}${character("mizuhane", 280, 0, 310)}</svg>`,
};

function sceneHtml(scene) {
  const isCta = scene.art === "cta";
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${VIDEO.width}px; height: ${VIDEO.height}px; }
  body { background: #fdf6ec; font-family: "IPAGothic", "IPAPGothic", sans-serif; color: #3b2a22; position: relative; overflow: hidden; }
  .frame { position: absolute; inset: 36px; border: 10px solid ${L}; border-radius: 48px; background: ${isCta ? "#fff4e4" : "#fdf6ec"}; }
  .badge { position: absolute; top: 250px; left: 50%; transform: translateX(-50%); white-space: nowrap; padding: 14px 34px; border: 6px solid ${L}; border-radius: 999px; background: #ffe7c7; font-size: 40px; font-weight: bold; }
  .art { position: absolute; top: 380px; left: 50%; transform: translateX(-50%); width: 760px; height: 620px; display: flex; align-items: center; justify-content: center; }
  .art svg { width: 100%; height: 100%; }
  .text { position: absolute; top: 1040px; left: 80px; right: 80px; text-align: center; }
  .line { font-size: ${isCta ? 104 : 88}px; font-weight: bold; line-height: 1.3; white-space: nowrap; }
  .sub { margin-top: 32px; font-size: 46px; font-weight: bold; }
  .cta-button { margin: 40px auto 0; width: 760px; padding: 30px 0; border: 8px solid ${L}; border-radius: 28px; background: #2b7bb9; color: #fff; font-size: 56px; font-weight: bold; box-shadow: 0 10px 0 #1d5a88; }
  .foot { position: absolute; top: 1460px; left: 0; right: 0; text-align: center; font-size: 34px; color: #6a5448; }
  </style></head><body>
  <div class="frame"></div>
  <div class="badge">開発中のアプリ・コンセプトイメージ</div>
  <div class="art">${ART[scene.art]}</div>
  <div class="text">${scene.lines.map((l) => `<div class="line">${l}</div>`).join("")}
  ${scene.sub ? `<div class="sub">${scene.sub}</div>` : ""}
  ${isCta ? `<div class="cta-button">無料で事前登録</div>` : ""}</div>
  ${isCta ? `<div class="foot">iPhone・Android 向けに開発中（PWA 予定）</div>` : ""}
  </body></html>`;
}

function copyMarkdown(ad) {
  const { sceneSeconds: d, fadeSeconds: f } = VIDEO;
  const seconds = (ad.scenes.length * d - (ad.scenes.length - 1) * f).toFixed(1);
  return `# ${ad.name}（${ad.id}）

自動生成ファイル（編集は scripts/ads/ads.config.mjs）。

- 目的: ${ad.purpose}
- 遷移先 URL: \`${landingUrl(ad)}\`（広告マネージャーにはこの URL をそのまま貼る。UTM を消さない・書き換えない）

## 入稿テキスト（掲載用）
| 項目 | 内容 |
|---|---|
| 見出し | ${ad.headline} |
| 本文 | ${ad.primaryText.replace(/\n/g, "<br>")} |
| CTA | ${ad.cta}（${ad.ctaNote}） |

## 入稿ファイル（掲載用データ: upload/）
- \`upload/video_1080x1920.mp4\`: 9:16、1080×1920、H.264、約 ${seconds} 秒、音声なし
- \`upload/thumbnail_1080x1920.png\`: 静止画サムネイル（9:16）

## 確認用（完成イメージ: preview/）
- \`preview/storyboard.png\`: 全シーンの一覧（縮小）

## シーン構成（音声なしで伝わる構成。最初のシーンで訴求を提示）
${ad.scenes.map((s, i) => `${i + 1}. ${s.lines.join("")}${s.sub ? `（${s.sub}）` : ""}`).join("\n")}
`;
}

async function main() {
  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: VIDEO.width, height: VIDEO.height }, deviceScaleFactor: 1 });
  for (const ad of ADS) {
    const dir = join(OUT, ad.id);
    const tmp = join(dir, ".frames");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(join(dir, "upload"), { recursive: true });
    mkdirSync(join(dir, "preview"), { recursive: true });
    mkdirSync(tmp, { recursive: true });
    const frames = [];
    for (const [i, scene] of ad.scenes.entries()) {
      await page.setContent(sceneHtml(scene), { waitUntil: "load" });
      const f = join(tmp, `scene-${i + 1}.png`);
      await page.screenshot({ path: f });
      frames.push(f);
    }
    // サムネイル（掲載用）= 最初のシーン
    execFileSync("cp", [frames[0], join(dir, "upload", "thumbnail_1080x1920.png")]);
    // 動画（掲載用）: シーンを順にクロスフェードでつなぐ。音声なし
    const { sceneSeconds: d, fadeSeconds: f, fps } = VIDEO;
    const inputs = frames.flatMap((p) => ["-loop", "1", "-framerate", String(fps), "-t", String(d), "-i", p]);
    let chain = "";
    let last = "[0:v]";
    for (let i = 1; i < frames.length; i++) {
      const out = i === frames.length - 1 ? ",format=yuv420p[v]" : `[x${i}]`;
      chain += `${last}[${i}:v]xfade=transition=fade:duration=${f}:offset=${(i * (d - f)).toFixed(2)}${out};`;
      last = out;
    }
    execFileSync(
      "ffmpeg",
      ["-y", "-loglevel", "error", ...inputs, "-filter_complex", chain.replace(/;$/, ""), "-map", "[v]", "-r", String(fps), "-c:v", "libx264", "-crf", "23", "-movflags", "+faststart", "-an", join(dir, "upload", "video_1080x1920.mp4")],
      { stdio: "inherit" },
    );
    // 確認用: 全シーンを横に並べた一覧（縮小）
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...frames.flatMap((p) => ["-i", p]), "-filter_complex", `${frames.map((_, i) => `[${i}:v]scale=270:480[s${i}]`).join(";")};${frames.map((_, i) => `[s${i}]`).join("")}hstack=inputs=${frames.length}`, join(dir, "preview", "storyboard.png")]);
    rmSync(tmp, { recursive: true, force: true });
    writeFileSync(join(dir, "preview", "README.md"), `確認用の画像です（入稿には upload/ のファイルを使う）。生成元: scripts/ads/ads.config.mjs\n`);
    writeFileSync(join(dir, "copy.md"), copyMarkdown(ad));
    console.log(`rendered ${ad.id}`);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
