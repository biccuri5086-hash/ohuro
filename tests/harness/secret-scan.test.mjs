import { describe, expect, it } from "vitest";
import { scanPath, scanText } from "../../scripts/harness/secret-scan.mjs";

// 検出対象の文字列はリポジトリに残さないよう、実行時に組み立てる
const j = (...parts) => parts.join("");
const fakes = {
  "private-key": j("-----BEGIN ", "RSA PRIVATE", " KEY-----"),
  "aws-access-key": j("AKIA", "ABCDEFGHIJKLMNOP"),
  "github-token": j("ghp_", "a".repeat(36)),
  "anthropic-key": j("sk-", "ant-", "x".repeat(30)),
  "openai-key": j("sk-", "proj-", "y".repeat(40)),
  "stripe-live-key": j("sk_", "live_", "z".repeat(24)),
  "supabase-secret-key": j("sb_", "secret_", "q".repeat(24)),
  "google-api-key": j("AIza", "B".repeat(35)),
  jwt: j("eyJ", "hbGciOiJIUzI1NiJ9", ".", "eyJ", "yb2xlIjoic2VydmljZSJ9", ".", "c".repeat(20)),
  "generic-credential-assignment": j("api_key", ' = "', "r".repeat(20), '"'),
};

describe("secret-scan", () => {
  for (const [rule, value] of Object.entries(fakes)) {
    it(`${rule} を検出する`, () => {
      expect(scanText(`const x = ${value};`).map((f) => f.rule)).toContain(rule);
    });
  }
  it("allow マーカー付きの行は除外する", () => {
    expect(scanText(`${fakes["aws-access-key"]} // ${"secret-scan"}:allow`)).toEqual([]);
  });
  it("通常のコードは検出しない", () => {
    const src = 'const apiKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;\nconst url = "https://example.com";';
    expect(scanText(src)).toEqual([]);
  });
  it(".env 実ファイルと鍵ファイルを検出し、.env.example は許可する", () => {
    expect(scanPath(".env")[0]?.rule).toBe("env-file-committed");
    expect(scanPath("apps/web/.env.local")[0]?.rule).toBe("env-file-committed");
    expect(scanPath("certs/server.pem")[0]?.rule).toBe("key-file-committed");
    expect(scanPath(".env.example")).toEqual([]);
  });
});
