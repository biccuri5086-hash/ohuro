import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// DB 結合テスト（実 PostgreSQL が必要）。`npm run test:db` で実行する。
// TEST_DATABASE_URL にローカルの PostgreSQL（スーパーユーザー）を指定する。
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/db/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
