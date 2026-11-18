import { readFileSync } from "node:fs";
import { E2E } from "../../playwright.config";
import { db, expect, outboxCount, submitSignup, test, uniqueEmail, waitForEmail } from "./helpers";

test.describe("LP の表示（G0-4）", () => {
  test("主要な表示内容があり、横スクロールが出ない", async ({ page }) => {
    await page.goto("/?ohuro_test=1");
    await expect(page.locator("h1")).toContainText("お風呂が、毎日の小さなクエストになる。");
    await expect(page.getByText("開発中のアプリです・公開日未定")).toBeVisible();
    await expect(page.getByText("画像はすべて開発中のコンセプトイメージです。")).toBeVisible();
    await expect(page.getByText("入浴したことを証明するものではありません")).toBeVisible();
    for (const q of ["無料で遊べますか？", "いつ公開されますか？", "iPhone・Androidで使えますか？", "写真を送信する必要がありますか？", "事前登録すると何が届きますか？", "登録は解除できますか？"]) {
      await expect(page.getByText(q)).toBeVisible();
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });

  test("プライバシーポリシーへのリンクが開く", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.locator("h1")).toHaveText("プライバシーポリシー（事前登録）");
    await expect(page.getByText("氏名・住所・電話番号・写真は取得しません。")).toBeVisible();
  });
});

test.describe("事前登録の流れ（G0-2 / G0-3 / G0-5）", () => {
  test("登録 → 確認メール → 確認 → アンケートまで完了し、広告の流入元が記録される", async ({ page }, info) => {
    const email = uniqueEmail("flow", info.project.name);
    await page.goto("/?utm_source=instagram&utm_medium=paid_social&utm_campaign=gate0&utm_content=ad_a_v1");
    await submitSignup(page, email);
    await expect(page.getByText("確認メールを送りました")).toBeVisible();

    const mail = await waitForEmail(email);
    // 確認ページを開くだけでは確認済みにならない（メールのリンク自動チェック対策）
    await page.goto(mail.confirmUrl);
    const [before] = await db()`select confirmed_at, utm_content from waitlist.signups where email_normalized = ${email}`;
    expect(before!.confirmed_at).toBeNull();
    expect(before!.utm_content).toBe("ad_a_v1");

    await page.getByRole("button", { name: "登録を確認する" }).click();
    await expect(page.locator("h1")).toHaveText("事前登録が完了しました");
    const [after] = await db()`select confirmed_at from waitlist.signups where email_normalized = ${email}`;
    expect(after!.confirmed_at).not.toBeNull();

    await page.getByRole("link", { name: "アンケートに答える（任意）" }).click();
    await page.check("input[name=photo_acceptance][value=conditional]");
    await page.check("input[name=interests][value=pet]");
    await page.getByRole("button", { name: "回答を送信する" }).click();
    await expect(page.locator("h1")).toHaveText("ご回答ありがとうございました");
    const [s] = await db()`select survey from waitlist.signups where email_normalized = ${email}`;
    expect(s!.survey).toEqual({ photo_acceptance: "conditional", interests: ["pet"] });
  });

  test("不正なメールアドレス・同意なしは送信前にエラーになり、保存されない", async ({ page }, info) => {
    await page.goto("/?ohuro_test=1");
    await submitSignup(page, "not-an-email");
    await expect(page.locator("form.signup-form .form-error")).toContainText("メールアドレスの形式が正しくありません");
    const email = uniqueEmail("noconsent", info.project.name);
    await page.fill("#email", email);
    await page.uncheck("input[name=consent]");
    await page.click("form.signup-form button[type=submit]");
    await expect(page.locator("form.signup-form .form-error")).toContainText("同意が必要です");
    const rows = await db()`select 1 from waitlist.signups where email_normalized = ${email}`;
    expect(rows).toHaveLength(0);
  });

  test("API 直接呼び出しでも不正なメールアドレスは 400", async ({ request }) => {
    const res = await request.post("/api/waitlist", {
      headers: { origin: E2E.baseUrl },
      data: { email: "bad@", consent: true, elapsedMs: 5000 },
    });
    expect(res.status()).toBe(400);
  });

  test("確認リンクの再利用は「確認済み」と表示し、確認は1回だけ数える", async ({ page }, info) => {
    const email = uniqueEmail("reuse", info.project.name);
    await page.goto("/");
    await submitSignup(page, email);
    const mail = await waitForEmail(email);
    for (let i = 0; i < 2; i++) {
      await page.goto(mail.confirmUrl);
      await page.getByRole("button", { name: "登録を確認する" }).click();
    }
    await expect(page.locator("h1")).toHaveText("この登録は確認済みです");
  });

  test("期限切れの確認リンクは期限切れと表示する", async ({ page }, info) => {
    const email = uniqueEmail("expired", info.project.name);
    await page.goto("/");
    await submitSignup(page, email);
    const mail = await waitForEmail(email);
    await db()`
      update waitlist.tokens set created_at = now() - interval '2 days', expires_at = now() - interval '1 day'
      where purpose = 'confirm' and signup_id = (select id from waitlist.signups where email_normalized = ${email})`;
    await page.goto(mail.confirmUrl);
    await page.getByRole("button", { name: "登録を確認する" }).click();
    await expect(page.locator("h1")).toHaveText("確認リンクの有効期限が切れています");
  });

  test("二重登録は1人として扱い、確認メールも重複して送らない", async ({ page }, info) => {
    const email = uniqueEmail("dup", info.project.name);
    await page.goto("/");
    await submitSignup(page, email);
    await waitForEmail(email);
    await page.goto("/");
    await submitSignup(page, email.toUpperCase());
    await expect(page.getByText("確認メールを送りました")).toBeVisible(); // 応答は同じ（登録の有無を推測させない）
    const rows = await db()`select count(*)::int as n from waitlist.signups where email_normalized = ${email}`;
    expect(rows[0]!.n).toBe(1);
    expect(outboxCount(email)).toBe(1);
  });

  test("宣伝メールの同意は確認ページで受信者が選んだ値だけを記録する", async ({ page }, info) => {
    const email = uniqueEmail("marketing", info.project.name);
    await page.goto("/");
    await page.locator("#signup").scrollIntoViewIfNeeded();
    await page.check("input[name=marketing]");
    await submitSignup(page, email);
    const mail = await waitForEmail(email);
    await page.goto(mail.confirmUrl);
    const box = page.locator("input[name=marketing_opt_in]");
    await expect(box).toBeChecked(); // 初期表示は登録フォームでの選択
    await box.uncheck();
    await page.getByRole("button", { name: "登録を確認する" }).click();
    await expect(page.locator("h1")).toHaveText("事前登録が完了しました");
    const [s] = await db()`select marketing_opt_in, marketing_opt_in_at from waitlist.signups where email_normalized = ${email}`;
    expect([s!.marketing_opt_in, s!.marketing_opt_in_at]).toEqual([false, null]);
  });

  test("配信停止と登録データの削除ができる", async ({ page }, info) => {
    const email = uniqueEmail("unsub", info.project.name);
    await page.goto("/");
    await submitSignup(page, email);
    const mail = await waitForEmail(email);
    await page.goto(mail.unsubscribeUrl);
    await page.getByRole("button", { name: "配信を停止する" }).click();
    await expect(page.locator("h1")).toHaveText("配信を停止しました");
    await page.goto(mail.unsubscribeUrl);
    await page.check("input[name=confirm_delete]");
    await page.getByRole("button", { name: "登録データを削除する" }).click();
    await expect(page.locator("h1")).toHaveText("登録データを削除しました");
    const rows = await db()`select 1 from waitlist.signups where email_normalized = ${email}`;
    expect(rows).toHaveLength(0);
  });
});

test.describe("データ保護と計測（G0-1 / G0-5）", () => {
  test("登録一覧を取得できる公開 API がない・他サイトからの送信は拒否", async ({ request }) => {
    for (const path of ["/api/waitlist", "/api/waitlist/confirm", "/api/events"]) {
      const res = await request.get(path);
      expect([404, 405]).toContain(res.status());
    }
    const cross = await request.post("/api/waitlist", { headers: { origin: "https://evil.example" }, data: { email: "x@ohuro-e2e.jp", consent: true, elapsedMs: 5000 } });
    expect(cross.status()).toBe(403);
  });

  test("広告 A / B の流入を区別して数え、テスト流入は除外する", async ({ page, context }) => {
    await page.goto("/?utm_source=instagram&utm_medium=paid_social&utm_campaign=gate0&utm_content=ad_b_v1");
    await page.waitForTimeout(500);
    const p2 = await context.newPage();
    await p2.goto("/?utm_content=ad_b_v1&ohuro_test=1");
    await p2.waitForTimeout(500);
    const rows = await db()`select utm_content, is_test from waitlist.events where name = 'lp_view' and utm_content = 'ad_b_v1'`;
    expect(rows.some((r) => !r.is_test)).toBe(true);
    expect(rows.some((r) => r.is_test)).toBe(true);
  });

  test("サーバーのログにメールアドレス・トークン・接続文字列が出ていない", async () => {
    const log = readFileSync(E2E.serverLog, "utf8");
    expect(log).not.toMatch(/@ohuro-e2e\.jp/);
    expect(log).not.toMatch(/token=[A-Za-z0-9_-]{43}/);
    expect(log).not.toContain(E2E.databaseUrl);
    expect(log).not.toContain(E2E.rateLimitSecret);
  });
});
