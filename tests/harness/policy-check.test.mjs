import { describe, expect, it } from "vitest";
import { checkDeletedFiles, checkPackageJson, checkSource } from "../../scripts/harness/policy-check.mjs";

const USE_CLIENT = '"use client";\n';
// 検出対象の書き方をそのまま書くとこのファイル自体が違反になるため、実行時に組み立てる
const dot = (name) => ["it", name].join(".");
const aiHost = ["api", "openai", "com"].join(".");

describe("policy-check", () => {
  it("外部AI API の参照を検出する", () => {
    expect(checkSource(`fetch("https://${aiHost}/v1/responses")`, "src/lib/photo.ts").join()).toContain("外部AI API");
  });
  it("service_role の公開を検出する", () => {
    expect(checkSource("process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY", "src/a.ts")).toHaveLength(1);
    expect(checkSource(`${USE_CLIENT}const k = process.env.SUPABASE_SERVICE_ROLE_KEY;`, "src/a.tsx")).toHaveLength(1);
  });
  it("クライアントでのガチャ抽選を検出する", () => {
    const src = `${USE_CLIENT}export function draw(){ return Math.random(); }`;
    expect(checkSource(src, "src/components/gacha/Draw.tsx").join()).toContain("クライアント");
    expect(checkSource(src, "src/components/ui/Sparkle.tsx")).toEqual([]);
  });
  it("サーバー専用モジュールに server-only を要求する", () => {
    expect(checkSource("export const x = 1;", "src/server/gacha.ts")).toHaveLength(1);
    expect(checkSource('import "server-only";\nexport const x = 1;', "src/server/gacha.ts")).toEqual([]);
  });
  it("クライアントから src/server の import を検出する", () => {
    expect(checkSource(`${USE_CLIENT}import { draw } from "@/server/gacha";`, "src/a.tsx")).toHaveLength(1);
  });
  it("Storage 利用を検出する", () => {
    expect(checkSource('supabase.storage.from("photos")', "src/a.ts")).toHaveLength(1);
  });
  it("テストの .only と承認なし skip を検出する", () => {
    expect(checkSource(`${dot("only")}("x", () => {});`, "tests/a.test.ts")).toHaveLength(1);
    expect(checkSource(`${dot("skip")}("x", () => {});`, "tests/a.test.ts")).toHaveLength(1);
    expect(checkSource(`${dot("skip")}("x", () => {}); // policy:allow-skip D-004`, "tests/a.test.ts")).toEqual([]);
  });
  it("testRulesOnly ではテスト規則のみ適用する", () => {
    const src = `"${aiHost}"\n${dot("only")}("x", () => {});`;
    expect(checkSource(src, "tests/harness/x.test.mjs", { testRulesOnly: true })).toHaveLength(1);
  });
  it("3D ライブラリの追加を禁止する", () => {
    expect(checkPackageJson({ dependencies: { three: "1" } })).toHaveLength(1);
    expect(checkPackageJson({ devDependencies: { "@react-three/fiber": "1" } })).toHaveLength(1);
    expect(checkPackageJson({ dependencies: { next: "16" } })).toEqual([]);
  });
  it("テスト削除は承認がなければ検出する", () => {
    const deleted = ["tests/harness/a.test.mjs", "src/lib/x.spec.ts", "docs/old.md"];
    expect(checkDeletedFiles(deleted, false)).toHaveLength(2);
    expect(checkDeletedFiles(deleted, true)).toEqual([]);
  });
});
