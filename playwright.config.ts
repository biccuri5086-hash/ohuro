import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// E2E テスト（Issue #16）。`npm run test:e2e` で実行する（事前に build と E2E 用 DB の準備を行う）。
// - サーバーは本番ビルド（next start）を使い、確認メールは outbox（ファイル）に書き出す
// - サーバーのログはファイルに保存し、メールアドレスや秘密情報が出ていないことをテストで確認する
// - iPhone Safari 相当（WebKit）は E2E_WEBKIT=1 のときだけ実行（CI）。実機の iOS Safari とは異なる

const PORT = 3210;
const OUT = join(process.cwd(), ".e2e");
mkdirSync(OUT, { recursive: true });

const admin = new URL(process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/postgres");
const e2eDb = new URL(admin.toString());
e2eDb.pathname = "/ohuro_e2e";

export const E2E = {
  baseUrl: `http://localhost:${PORT}`,
  databaseUrl: e2eDb.toString(),
  outboxFile: join(OUT, "outbox.jsonl"),
  serverLog: join(OUT, "server.log"),
  rateLimitSecret: process.env.E2E_RATE_LIMIT_SECRET ?? randomBytes(24).toString("hex"),
};
process.env.E2E_RATE_LIMIT_SECRET = E2E.rateLimitSecret;

const projects = [
  { name: "android-chrome", use: { ...devices["Pixel 7"] } },
  { name: "iphone-size-chromium", use: { ...devices["iPhone 13"], browserName: "chromium" as const, defaultBrowserType: "chromium" as const } },
];
if (process.env.E2E_WEBKIT === "1") projects.push({ name: "iphone-webkit", use: { ...devices["iPhone 13"] } });

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: { baseURL: E2E.baseUrl, trace: "off" },
  projects,
  webServer: {
    command: `sh -c 'npx next start -p ${PORT} > "${E2E.serverLog}" 2>&1'`,
    url: E2E.baseUrl,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      WAITLIST_DATABASE_URL: E2E.databaseUrl,
      APP_BASE_URL: E2E.baseUrl,
      RATE_LIMIT_SECRET: E2E.rateLimitSecret,
      EMAIL_PROVIDER: "outbox",
      EMAIL_OUTBOX_FILE: E2E.outboxFile,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
