import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildArt, PATHS } from "../../scripts/art/build-art.mjs";
import { lintSvg } from "../../scripts/art/svg-lint.mjs";

const palette = JSON.parse(readFileSync("art/palette.json", "utf8"));
const svg = (inner, root = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"') => `<svg ${root}>${inner}</svg>`;
const ok = '<circle cx="24" cy="24" r="20" fill="#ffd35c" stroke="#5b3f33" stroke-width="3.5"/>';

describe("素材の検査（Issue #24）", () => {
  it("現行の素材はすべて合格し、生成ファイルは最新（CI で生成忘れ・台帳の更新忘れを検出）", () => {
    const { errors, outputs } = buildArt(process.cwd());
    expect(errors).toEqual([]);
    for (const [p, content] of Object.entries(outputs)) expect(readFileSync(p, "utf8"), `${p} が最新ではない`).toBe(content);
  });

  it("許可した図形だけの SVG は合格", () => {
    expect(lintSvg(svg(`<g transform="translate(2 3) scale(0.5)">${ok}</g><!-- メモ -->`), palette)).toEqual([]);
  });

  it("親の g から継承した塗り・線・太さは有効として扱う", () => {
    expect(lintSvg(svg('<g fill="#ffd35c" stroke="#5b3f33" stroke-width="3"><circle cx="1" cy="1" r="1"/></g>'), palette)).toEqual([]);
    expect(lintSvg(svg('<g fill="#123456"><circle cx="1" cy="1" r="1"/></g>'), palette).join()).toContain("パレットにない色");
  });

  it.each([
    ["script", svg('<script>alert(1)</script>'), "script"],
    ["ラスター画像", svg('<image href="x.png" width="10" height="10"/>'), "image"],
    ["外部参照", svg('<path d="M0 0h1" href="https://example.com"/>'), "href"],
    ["url()", svg('<rect x="0" y="0" width="1" height="1" fill="url(#g)"/>'), "url()"],
    ["data URI", svg('<path d="M0 0h1" fill="data:x"/>'), "data:"],
    ["パレット外の色", svg('<circle cx="1" cy="1" r="1" fill="#123456"/>'), "パレットにない色"],
    ["許可外の線の太さ", svg('<path d="M0 0h1" stroke="#5b3f33" stroke-width="7"/>'), "線の太さ"],
    ["グラデーション（立体的な表現）", svg('<linearGradient></linearGradient>'), "linearGradient"],
    ["フィルター（立体的な表現）", svg('<filter></filter>'), "filter"],
    ["style 属性", svg('<path d="M0 0h1" style="fill:red"/>'), "style"],
    ["イベント属性", svg('<path d="M0 0h1" onclick="x()"/>'), "onclick"],
    ["丸以外の線の端", svg('<path d="M0 0h1" stroke-linecap="butt"/>'), "round"],
    ["matrix の変形", svg(`<g transform="matrix(1 0 0 1 0 0)">${ok}</g>`), "transform"],
    ["入れ子の svg", svg(svg(ok)), "<svg>"],
    ["文字", svg("こんにちは"), "文字"],
    ["DOCTYPE", `<!DOCTYPE svg>${svg(ok)}`, "DOCTYPE"],
    ["閉じていない要素", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><g>', "閉じられていない"],
    ["viewBox なし", svg(ok, 'xmlns="http://www.w3.org/2000/svg"'), "viewBox"],
    ["xmlns なし", svg(ok, 'viewBox="0 0 48 48"'), "xmlns"],
    ["大きすぎる", svg(`<!-- ${"x".repeat(11000)} -->${ok}`), "大きすぎ"],
    // Codex 指摘 PR #35: 省略・継承された描画属性（SVG の既定値は fill=黒・stroke-width=1）
    ["塗りの省略（既定の黒）", svg('<circle cx="24" cy="24" r="20"/>'), "塗りが省略"],
    ["線の太さの省略（既定の 1）", svg('<path d="M0 0h1" fill="none" stroke="#5b3f33"/>'), "線の太さが省略"],
    ["g から継承した線で太さがない", svg('<g stroke="#5b3f33"><path d="M0 0h1" fill="none"/></g>'), "線の太さが省略"],
    // Codex 指摘 PR #35: 閉じタグに属性・自己終了記号
    ["閉じタグに属性", svg('<circle r="20" fill="#ffffff"></circle r="2">'), "閉じタグ"],
    ["閉じタグに自己終了記号", svg('<g fill="none"></g/>'), "閉じタグ"],
  ])("%s は拒否する", (_label, text, expected) => {
    const errors = lintSvg(text, palette);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join("\n")).toContain(expected);
  });
});

describe("素材台帳と生成（Issue #24）", () => {
  let dir;
  const copyRepo = () => {
    dir = mkdtempSync(join(tmpdir(), "ohuro-art-"));
    cpSync("art", join(dir, "art"), { recursive: true });
    return dir;
  };
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  it("台帳にない素材を置くと失敗する", () => {
    const root = copyRepo();
    writeFileSync(join(root, PATHS.src, "new.svg"), svg(ok));
    expect(buildArt(root).errors.join("\n")).toContain("素材台帳");
  });

  it("素材を変えて台帳の sha256 を更新しないと失敗する", () => {
    const root = copyRepo();
    const f = join(root, PATHS.src, "coin.svg");
    writeFileSync(f, readFileSync(f, "utf8").replace('r="20"', 'r="19"'));
    expect(buildArt(root).errors.join("\n")).toContain("sha256");
  });

  it("台帳の必須欄（ライセンス・商用利用など）が空だと失敗する", () => {
    const root = copyRepo();
    const ledger = JSON.parse(readFileSync(join(root, PATHS.ledger), "utf8"));
    ledger.assets[0].commercialUse = "";
    writeFileSync(join(root, PATHS.ledger), JSON.stringify(ledger));
    expect(buildArt(root).errors.join("\n")).toContain("commercialUse");
  });

  it("SVG 以外の素材ファイルは置けない", () => {
    const root = copyRepo();
    writeFileSync(join(root, PATHS.src, "photo.png"), "x");
    expect(buildArt(root).errors.join("\n")).toContain("SVG 以外");
  });

  it("生成は決定的（2 回生成して同じ）", () => {
    expect(buildArt(process.cwd()).outputs).toEqual(buildArt(process.cwd()).outputs);
  });

  it("LP と広告は生成物だけを使い、ペットの絵を手で描いていない（重複の解消）", () => {
    const illus = readFileSync("src/components/lp/Illustrations.tsx", "utf8");
    expect(illus).toContain('from "@/components/art/generated"');
    expect(illus).not.toMatch(/<path|<circle/);
    const ads = readFileSync("scripts/ads/render-ads.mjs", "utf8");
    expect(ads).toContain("ART_ASSETS.pet.inner");
    expect(ads).not.toContain("M20 82c0-26 18-44 40-44");
  });
});
