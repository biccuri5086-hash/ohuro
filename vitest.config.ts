import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.{ts,mjs}", "src/**/*.test.{ts,tsx}"],
    // DB 結合テストは実 PostgreSQL が必要なため `npm run test:db` で別に実行する
    exclude: ["tests/db/**", "node_modules/**"],
    environment: "node",
    testTimeout: 10_000,
  },
});
