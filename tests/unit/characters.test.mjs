import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ledger = JSON.parse(readFileSync("art/characters.json", "utf8"));
const files = readdirSync("src/assets/characters").filter((f) => f.endsWith(".webp"));
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

describe("画像生成 AI のキャラクター画像の台帳（Issue #54・D-015）", () => {
  it("置き場所の画像はすべて台帳に記録され、ハッシュが一致する", () => {
    expect(files.sort()).toEqual(ledger.characters.map((c) => `${c.id}.webp`).sort());
    for (const c of ledger.characters) expect(sha(c.file), c.id).toBe(c.sha256);
  });

  it("出所（サービス・生成日・生成した人・プロンプト）と加工内容を記録している", () => {
    for (const c of ledger.characters) {
      expect(c.source.service).toContain("ChatGPT");
      expect(c.source.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.source.generatedBy).toBeTruthy();
      expect(readFileSync(c.source.promptTemplate, "utf8")).toContain("おふろクエスト向けのキャラクター");
      expect(c.processing).toBeTruthy();
    }
  });

  it("規約の確認状態を記録し、似ているおそれのある画像は取り込んでいない", () => {
    expect(ledger.termsCheck.status).toBeTruthy();
    expect(files).not.toContain("yupurin.webp");
    expect(ledger.excluded.map((e) => e.id)).toContain("yupurin");
  });

  it("画像は 1 枚 120KB 以下に収めている", () => {
    for (const f of files) expect(readFileSync(`src/assets/characters/${f}`).length).toBeLessThanOrEqual(120 * 1024);
  });

  it("LP は旧ペットの SVG ではなく、キャラクター画像を使う", () => {
    const page = readFileSync("src/app/page.tsx", "utf8");
    expect(page).not.toContain("PetIllustration");
    expect(page).toContain("CharacterImage");
    const comp = readFileSync("src/components/lp/Characters.tsx", "utf8");
    // 代替テキストで開発中のコンセプトであることを示す
    expect(comp).toContain("開発中のコンセプト");
    for (const c of ledger.characters) expect(comp).toContain(`@/assets/characters/${c.id}.webp`);
  });

  it("部屋の絵から旧ペットを外した", () => {
    expect(readFileSync("art/src/room.svg", "utf8")).not.toContain("ペット");
  });
});
