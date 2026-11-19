#!/usr/bin/env node
// LP の区間ごとのスクリーンショットを、固定した条件で撮る（Issue #25 / Art-3）。
// 使い方: npm run build && node scripts/art/capture.mjs [--url http://127.0.0.1:3000] [--out .art-shots/current]
// --url を省略すると、このディレクトリの `next start` を空きポートで起動して撮る（事前に build が必要）。
// 結果: <out>/<画面幅>/<区間>.png と <out>/manifest.json。横スクロール・外部への通信があれば終了コード 1。
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DEVICE_SCALE_FACTOR, FREEZE_CSS, LP_PATH, OUTPUT_DIR, TARGETS, VIEWPORTS } from "./shots.config.mjs";

/** Playwright を読み込む。リポジトリの依存か、環境に入っているものを使う（新しい依存は追加しない） */
export function loadPlaywright(cwd = process.cwd()) {
  const require = createRequire(join(cwd, "package.json"));
  for (const name of ["playwright", "@playwright/test"]) {
    try {
      return require(name);
    } catch {
      // 次の候補を試す
    }
  }
  throw new Error(
    "Playwright が見つかりません。@playwright/test（E2E の依存、Issue #16）か、環境に入っている playwright が必要です",
  );
}

export async function freePort() {
  return new Promise((ok, ng) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", ng);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => ok(port));
    });
  });
}

/** `next start` を起動し、応答するまで待つ。戻り値の stop() で止める */
export async function startServer(cwd, port, timeoutMs = 60_000) {
  const child = spawn(process.execPath, [join(cwd, "node_modules/next/dist/bin/next"), "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd,
    stdio: "ignore",
    env: { ...process.env, PORT: String(port) },
  });
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next start が終了しました（${cwd}）。先に build してください`);
    try {
      const res = await fetch(url + "/", { redirect: "manual" });
      if (res.status < 500) return { url, stop: () => child.kill("SIGTERM") };
    } catch {
      // 起動待ち
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  child.kill("SIGTERM");
  throw new Error(`next start が ${timeoutMs}ms 以内に応答しませんでした`);
}

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

/** すべての画面幅・区間を撮る */
export async function captureAll({ baseUrl, outDir, cwd = process.cwd() }) {
  const { chromium } = loadPlaywright(cwd);
  const origin = new URL(baseUrl).origin;
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: DEVICE_SCALE_FACTOR,
        reducedMotion: "reduce",
        locale: "ja-JP",
        timezoneId: "Asia/Tokyo",
      });
      const external = [];
      await context.route("**/*", (route) => {
        const u = route.request().url();
        if (u.startsWith("data:") || u.startsWith("blob:") || new URL(u).origin === origin) return route.continue();
        external.push(u);
        return route.abort();
      });
      const page = await context.newPage();
      await page.goto(baseUrl + LP_PATH, { waitUntil: "networkidle" });
      await page.addStyleTag({ content: FREEZE_CSS });
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      const files = [];
      mkdirSync(join(outDir, vp.id), { recursive: true });
      for (const t of TARGETS) {
        const loc = page.locator(t.selector).nth(t.nth);
        const file = join(outDir, vp.id, `${t.id}.png`);
        if ((await loc.count()) === 0) {
          files.push({ target: t.id, missing: true });
          continue;
        }
        await loc.scrollIntoViewIfNeeded();
        await loc.screenshot({ path: file, animations: "disabled", caret: "hide" });
        files.push({ target: t.id, file, sha256: sha256(file) });
      }
      results.push({ viewport: vp.id, horizontalOverflow: overflow, externalRequests: external, files });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  const manifest = { baseUrl, deviceScaleFactor: DEVICE_SCALE_FACTOR, results };
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

/** 撮影結果の問題（横スクロール・外部通信）を文章で返す */
export function problemsOf(manifest) {
  const out = [];
  for (const r of manifest.results) {
    if (r.horizontalOverflow) out.push(`${r.viewport}: 横スクロールが出ています`);
    for (const u of r.externalRequests) out.push(`${r.viewport}: 外部への通信 ${u}`);
  }
  return out;
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const cwd = process.cwd();
  const outDir = resolve(arg("--out") ?? join(OUTPUT_DIR, "current"));
  let url = arg("--url");
  let stop = () => {};
  if (!url) {
    ({ url, stop } = await startServer(cwd, await freePort()));
  }
  try {
    const manifest = await captureAll({ baseUrl: url, outDir, cwd });
    const problems = problemsOf(manifest);
    const missing = manifest.results.flatMap((r) => r.files.filter((f) => f.missing).map((f) => `${r.viewport}/${f.target}`));
    console.log(`撮影: ${manifest.results.length} 画面幅 → ${outDir}`);
    if (missing.length) console.log(`見つからない区間: ${missing.join(", ")}`);
    for (const p of problems) console.error(`問題: ${p}`);
    process.exitCode = problems.length ? 1 : 0;
  } finally {
    stop();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
}
