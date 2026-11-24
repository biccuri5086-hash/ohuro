import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadConcepts, sheetHtml } from "../../scripts/art/concept-sheet.mjs";

const root = process.cwd();

describe("お湯わらしのデザイン案（Issue #52）", () => {
  const data = loadConcepts(root, "oyuwarashi");

  it("すべての案がパレット・線の太さ・大きさの検査に通る", () => {
    expect(data.errors).toEqual([]);
  });

  it("3 案、それぞれ 2 段階以上の成長がある", () => {
    expect(data.rows).toHaveLength(3);
    for (const c of data.rows) expect(c.stages.length).toBeGreaterThanOrEqual(2);
  });

  it("出所を記録し、承認前の案と明記している", () => {
    expect(data.meta.status).toContain("承認待ち");
    expect(data.meta.provenance.method).toContain("画像生成 AI は使っていない");
    for (const c of data.rows) expect(c.keepsCore).toBeTruthy();
  });

  it("承認前の案を本番の素材・コンポーネント・広告に入れていない", () => {
    expect(readdirSync("art/src")).not.toEqual(expect.arrayContaining([expect.stringMatching(/yuge|awa|oke/)]));
    for (const f of ["src/components/art/generated.tsx", "scripts/ads/art.generated.mjs", "art/ASSETS.json"]) {
      expect(readFileSync(f, "utf8")).not.toContain("concepts/oyuwarashi");
    }
  });

  it("比較シートは外部の読み込みをせず、現行のペットと並べる", () => {
    const html = sheetHtml(data, "<svg></svg>");
    // SVG の xmlns 宣言は読み込みではないので対象外。外部の読み込み（src・href・url()・@import）がないこと
    expect(html).not.toMatch(/\b(src|href)=|url\(|@import/);
    expect(html).toContain("現行のペット");
    expect(html).toContain("案A 湯気の子");
  });
});
