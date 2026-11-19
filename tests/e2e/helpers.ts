import { existsSync, readFileSync } from "node:fs";
import { test as base, expect } from "@playwright/test";
import postgres from "postgres";
import { E2E } from "../../playwright.config";

type OutboxEntry = { to: string; confirmUrl: string; unsubscribeUrl: string; oneClickUrl: string };

/** outbox から、指定アドレス宛ての最新のメールを待って取り出す */
export async function waitForEmail(to: string, count = 1): Promise<OutboxEntry> {
  for (let i = 0; i < 50; i++) {
    if (existsSync(E2E.outboxFile)) {
      const entries = readFileSync(E2E.outboxFile, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as OutboxEntry)
        .filter((e) => e.to === to);
      if (entries.length >= count) return entries.at(-1)!;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("確認メールが outbox に届きませんでした");
}

export function outboxCount(to: string): number {
  if (!existsSync(E2E.outboxFile)) return 0;
  return readFileSync(E2E.outboxFile, "utf8")
    .split("\n")
    .filter((l) => l && (JSON.parse(l) as OutboxEntry).to === to).length;
}

let sqlClient: postgres.Sql | undefined;
export function db(): postgres.Sql {
  sqlClient ??= postgres(E2E.databaseUrl, { max: 1, onnotice: () => {} });
  return sqlClient;
}

/** テストごとに一意なメールアドレス（テスト扱いにしない通常ドメイン。E2E 専用 DB のみに保存される） */
export function uniqueEmail(tag: string, project: string): string {
  return `${tag}-${project}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@ohuro-e2e.jp`;
}

/** 送信元 IP をテストごとに変え、レート制限が他のテストに影響しないようにする */
export const test = base.extend({
  extraHTTPHeaders: async ({}, provide) => {
    const ip = `198.18.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
    await provide({ "x-forwarded-for": ip });
  },
});
export { expect };

/** LP のフォームに入力して送信する（Bot 判定の最短時間を待つ） */
export async function submitSignup(page: import("@playwright/test").Page, email: string, opts: { consent?: boolean } = {}) {
  await page.locator("#signup").scrollIntoViewIfNeeded();
  await page.waitForTimeout(2200);
  await page.fill("#email", email);
  if (opts.consent !== false) await page.check("input[name=consent]");
  await page.click("form.signup-form button[type=submit]");
}
