import { describe, expect, it } from "vitest";
import { diffPixels } from "../../scripts/art/image-diff.mjs";
import { externalRedirectTarget, isInternal, problemsOf } from "../../scripts/art/capture.mjs";
import { DEVICE_SCALE_FACTOR, FREEZE_CSS, LP_PATH, OUTPUT_DIR, TARGETS, VIEWPORTS } from "../../scripts/art/shots.config.mjs";

const img = (width, height, rgba) => ({ width, height, data: Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => rgba[i % 4]) });

describe("差分計算（Issue #25）", () => {
  it("同じ画像は差分 0", () => {
    const a = img(3, 2, [255, 255, 255, 255]);
    const d = diffPixels(a, img(3, 2, [255, 255, 255, 255]), 16);
    expect([d.changed, d.ratio, d.sizeMatches]).toEqual([0, 0, true]);
  });

  it("許容値以下の差は数えず、超えた画素だけを数える", () => {
    const a = img(2, 1, [100, 100, 100, 255]);
    const b = img(2, 1, [100, 100, 100, 255]);
    b.data[0] = 116; // 差 16 = 許容値ちょうど → 数えない
    b.data[4] = 117; // 差 17 → 数える
    const d = diffPixels(a, b, 16);
    expect(d.changed).toBe(1);
    expect(Array.from(d.mask)).toEqual([0, 1]);
  });

  it("透明度の差も数える", () => {
    const b = img(1, 1, [0, 0, 0, 0]);
    expect(diffPixels(img(1, 1, [0, 0, 0, 255]), b, 16).changed).toBe(1);
  });

  it("大きさが違えば、重ならない部分をすべて変化として数える", () => {
    const d = diffPixels(img(2, 2, [0, 0, 0, 255]), img(3, 2, [0, 0, 0, 255]), 16);
    expect([d.width, d.height, d.changed, d.total, d.sizeMatches]).toEqual([3, 2, 2, 6, false]);
  });

  it("横長と縦長を比べても、どちらの画像にもない画素は数えない（Codex 指摘 PR #30）", () => {
    // 2×1 と 1×2: 重なり 1 画素（同色）、片方にしかない画素が 2 個、どちらにもない角が 1 個
    const d = diffPixels(img(2, 1, [5, 5, 5, 255]), img(1, 2, [5, 5, 5, 255]), 16);
    expect([d.changed, d.total]).toEqual([2, 3]);
    expect(Array.from(d.mask)).toEqual([0, 1, 1, 2]);
    expect(d.ratio).toBeCloseTo(2 / 3);
  });

  it("片方がない（区間が見つからない）場合は全体が変化", () => {
    const d = diffPixels({ width: 0, height: 0, data: [] }, img(2, 2, [1, 1, 1, 255]), 16);
    expect(d.ratio).toBe(1);
  });
});

describe("撮影条件（Issue #25）", () => {
  it("スマートフォンの代表的な幅を含み、ID が重複しない", () => {
    expect(VIEWPORTS.map((v) => v.width)).toEqual(expect.arrayContaining([360, 390, 412]));
    expect(new Set(VIEWPORTS.map((v) => v.id)).size).toBe(VIEWPORTS.length);
  });

  it("LP の主要な区間（ファーストビュー・製品紹介・写真の説明・フォーム・FAQ）を撮る", () => {
    expect(TARGETS.map((t) => t.id)).toEqual(expect.arrayContaining(["hero", "features", "photo", "signup", "faq"]));
    expect(new Set(TARGETS.map((t) => t.id)).size).toBe(TARGETS.length);
  });

  it("動きを止め、フォントを IPA ゴシックに固定し、テスト流入として開く", () => {
    expect(FREEZE_CSS).toMatch(/animation:\s*none !important/);
    expect(FREEZE_CSS).toMatch(/transition:\s*none !important/);
    expect(FREEZE_CSS).toContain("IPAGothic");
    expect(LP_PATH).toContain("ohuro_test=1");
    expect(DEVICE_SCALE_FACTOR).toBe(2);
  });

  it("出力先はコミットしない場所", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync(".gitignore", "utf8")).toContain(`${OUTPUT_DIR}/`);
  });

  it("同一オリジンと data: / blob: だけを内部とみなす", () => {
    const o = "http://127.0.0.1:3000";
    expect(isInternal("http://127.0.0.1:3000/_next/x.js", o)).toBe(true);
    expect(isInternal("data:image/png;base64,AAA", o)).toBe(true);
    expect(isInternal("http://127.0.0.1:3001/x", o)).toBe(false);
    expect(isInternal("https://fonts.example/x.css", o)).toBe(false);
    expect(isInternal("not a url", o)).toBe(false);
  });

  it("同一オリジンから外部へのリダイレクトを外部通信として検出する（Codex 指摘 PR #30）", () => {
    const o = "http://127.0.0.1:3000";
    const u = "http://127.0.0.1:3000/redirect";
    expect(externalRedirectTarget(u, o, 302, "https://tracker.example/p.gif")).toBe("https://tracker.example/p.gif");
    expect(externalRedirectTarget(u, o, 307, "//cdn.example/x.js")).toBe("http://cdn.example/x.js");
    expect(externalRedirectTarget(u, o, 301, "/next")).toBeNull(); // 同一オリジン内の転送は許可
    expect(externalRedirectTarget(u, o, 200, "https://tracker.example/")).toBeNull(); // リダイレクトではない
    expect(externalRedirectTarget(u, o, 302, undefined)).toBeNull();
  });

  it("横スクロールと外部への通信を問題として報告する", () => {
    const problems = problemsOf({
      results: [
        { viewport: "w360", horizontalOverflow: true, externalRequests: [], files: [] },
        { viewport: "w390", horizontalOverflow: false, externalRequests: ["https://fonts.example/x.css"], files: [] },
        { viewport: "w412", horizontalOverflow: false, externalRequests: [], files: [] },
      ],
    });
    expect(problems).toEqual(["w360: 横スクロールが出ています", "w390: 外部への通信 https://fonts.example/x.css"]);
  });
});
