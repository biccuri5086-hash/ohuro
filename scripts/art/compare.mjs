#!/usr/bin/env node
// 変更前後の見た目を比べる（Issue #25 / Art-3）。基準は git の参照（例: origin/main）で、基準画像はコミットしない。
// 使い方: node scripts/art/compare.mjs [--base origin/main] [--head <参照>] [--fail-on-diff]
//   --head を省略すると、いまの作業ツリー（未コミットの変更を含む）を「変更後」にする。
// 結果: .art-shots/compare/ に、区間ごとの並べた比較画像（変更前 | 変更後 | 差分）と report.md / report.json。
// --fail-on-diff: 1 画素でも差があるか、撮影上の問題があれば終了コード 1（置き換えだけの変更で差がないことの確認に使う）。
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { captureAll, freePort, loadPlaywright, problemsOf, startServer } from "./capture.mjs";
import { diffPixels } from "./image-diff.mjs";
import { OUTPUT_DIR, PIXEL_THRESHOLD, TARGETS, VIEWPORTS } from "./shots.config.mjs";

const root = process.cwd();
const out = resolve(OUTPUT_DIR);

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();

/**
 * 参照を別のディレクトリ（git worktree）に取り出し、依存を入れてビルドする。
 * node_modules の共有（シンボリックリンク）は Next.js のビルドが拒否するため、参照ごとに npm ci する（npm のキャッシュを使う）。
 */
function prepareRef(ref, name, cleanup) {
  const dir = join(out, "worktrees", name);
  if (existsSync(dir)) git("worktree", "remove", "--force", dir);
  git("worktree", "add", "--detach", dir, ref);
  // 作成した直後に後片付けの対象へ登録する（npm ci・ビルドが失敗しても worktree を残さない。Codex 指摘 PR #30）
  cleanup.push(dir);
  execFileSync("npm", ["ci", "--prefer-offline", "--no-audit", "--no-fund"], { cwd: dir, stdio: "ignore" });
  build(dir);
  return dir;
}

function build(dir) {
  try {
    execFileSync(process.execPath, [join(dir, "node_modules/next/dist/bin/next"), "build"], { cwd: dir, stdio: "pipe" });
  } catch (e) {
    const tail = String(e.stdout ?? "").split("\n").slice(-15).join("\n");
    throw new Error(`ビルドに失敗しました（${dir}）\n${tail}`);
  }
}

async function shoot(dir, name) {
  const { url, stop } = await startServer(dir, await freePort());
  try {
    const outDir = join(out, name);
    rmSync(outDir, { recursive: true, force: true });
    return await captureAll({ baseUrl: url, outDir, cwd: root });
  } finally {
    stop();
  }
}

/** ブラウザの canvas で画像を読み、差分と並べた比較画像を作る */
async function compose(page, beforeFile, afterFile, title) {
  const toUrl = (f) => (f && existsSync(f) ? `data:image/png;base64,${readFileSync(f).toString("base64")}` : null);
  return page.evaluate(
    async ({ before, after, title, threshold, diffSrc }) => {
      const diffPixels = new Function(`return (${diffSrc})`)();
      const load = (src) =>
        new Promise((ok, ng) => {
          if (!src) return ok(null);
          const img = new Image();
          img.onload = () => ok(img);
          img.onerror = ng;
          img.src = src;
        });
      const [a, b] = await Promise.all([load(before), load(after)]);
      const read = (img) => {
        if (!img) return { width: 0, height: 0, data: new Uint8ClampedArray(0) };
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height);
      };
      const ia = read(a);
      const ib = read(b);
      const d = diffPixels(ia, ib, threshold);
      const gap = 24;
      const head = 44;
      const W = Math.max(ia.width, 1) + Math.max(ib.width, 1) + d.width + gap * 4;
      const H = Math.max(ia.height, ib.height, d.height, 1) + head + gap;
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#3b2a22";
      ctx.font = "22px IPAGothic, sans-serif";
      let x = gap;
      const label = (t) => ctx.fillText(t, x, 30);
      label(`変更前 ${title}`);
      if (a) ctx.drawImage(a, x, head);
      x += Math.max(ia.width, 1) + gap;
      label("変更後");
      if (b) ctx.drawImage(b, x, head);
      x += Math.max(ib.width, 1) + gap;
      label(`差分 ${(d.ratio * 100).toFixed(3)}%`);
      if (d.width && d.height) {
        const diffImg = ctx.createImageData(d.width, d.height);
        for (let i = 0; i < d.mask.length; i++) {
          const o = i * 4;
          if (d.mask[i] === 1) {
            diffImg.data.set([214, 48, 49, 255], o); // 変化あり
          } else if (d.mask[i] === 2) {
            diffImg.data.set([255, 255, 255, 255], o); // どちらの画像にもない領域
          } else {
            diffImg.data.set([238, 238, 238, 255], o); // 変化なし
          }
        }
        ctx.putImageData(diffImg, x, head);
      }
      return {
        png: c.toDataURL("image/png"),
        changed: d.changed,
        total: d.total,
        ratio: d.ratio,
        sizeMatches: d.sizeMatches,
        missingBefore: !a,
        missingAfter: !b,
      };
    },
    { before: toUrl(beforeFile), after: toUrl(afterFile), title, threshold: PIXEL_THRESHOLD, diffSrc: diffPixels.toString() },
  );
}

async function main() {
  const baseRef = arg("--base") ?? "origin/main";
  const headRef = arg("--head");
  const failOnDiff = process.argv.includes("--fail-on-diff");
  mkdirSync(out, { recursive: true });

  const worktrees = [];
  try {
    const baseDir = prepareRef(baseRef, "base", worktrees);
    const headDir = headRef ? prepareRef(headRef, "head", worktrees) : root;
    if (!headRef) build(root);

    const before = await shoot(baseDir, "before");
    const after = await shoot(headDir, "after");

    const { chromium } = loadPlaywright(root);
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const cmpDir = join(out, "compare");
    rmSync(cmpDir, { recursive: true, force: true });
    mkdirSync(cmpDir, { recursive: true });
    const rows = [];
    for (const vp of VIEWPORTS) {
      for (const t of TARGETS) {
        const bf = join(out, "before", vp.id, `${t.id}.png`);
        const af = join(out, "after", vp.id, `${t.id}.png`);
        const r = await compose(page, bf, af, `${vp.id} / ${t.label}`);
        const file = join(cmpDir, `${vp.id}-${t.id}.png`);
        writeFileSync(file, Buffer.from(r.png.split(",")[1], "base64"));
        rows.push({ viewport: vp.id, target: t.id, label: t.label, file, ...r, png: undefined });
      }
    }
    await browser.close();

    const problems = [...problemsOf(before).map((p) => `変更前 ${p}`), ...problemsOf(after).map((p) => `変更後 ${p}`)];
    const changedRows = rows.filter((r) => r.changed > 0 || !r.sizeMatches || r.missingBefore || r.missingAfter);
    const report = { base: baseRef, head: headRef ?? "作業ツリー", threshold: PIXEL_THRESHOLD, problems, rows };
    writeFileSync(join(cmpDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
    const md = [
      `# 見た目の比較（変更前: ${baseRef} / 変更後: ${headRef ?? "作業ツリー"}）`,
      "",
      `差分の判定: 各色成分の差 > ${PIXEL_THRESHOLD}。撮影はエミュレーションであり、実機の確認ではない。`,
      "",
      "| 画面幅 | 区間 | 変化した画素 | 割合 | 大きさ | 備考 |",
      "|---|---|---|---|---|---|",
      ...rows.map(
        (r) =>
          `| ${r.viewport} | ${r.label} | ${r.changed} | ${(r.ratio * 100).toFixed(3)}% | ${r.sizeMatches ? "同じ" : "異なる"} | ${
            r.missingBefore ? "変更前に区間なし" : r.missingAfter ? "変更後に区間なし" : ""
          } |`,
      ),
      "",
      problems.length ? `## 撮影上の問題\n\n${problems.map((p) => `- ${p}`).join("\n")}` : "撮影上の問題: なし",
      "",
    ].join("\n");
    writeFileSync(join(cmpDir, "report.md"), md);
    console.log(md);
    console.log(`比較画像: ${cmpDir}`);
    if (failOnDiff && (changedRows.length || problems.length)) process.exitCode = 1;
  } finally {
    for (const d of worktrees) {
      try {
        git("worktree", "remove", "--force", d);
      } catch {
        // 後片付けの失敗は無視（.art-shots/worktrees を手動で消せる）
      }
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
