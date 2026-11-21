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

  test("広告 A / B の流入を区別して数え、テスト流入・テスト登録は集計から除外する", async ({ page, context }, info) => {
    // Codex 指摘 PR #33: 生のイベントではなく、集計ビュー（funnel_by_creative・signup_summary_by_creative）の値を確かめる。
    // 並行して動く他のテストと混ざらないよう、この実行だけの utm_content を使う
    const base = `e2e_${info.project.name.replace(/[^a-z0-9]/gi, "")}_${Date.now()}`;
    const adA = `${base}_a`;
    const adB = `${base}_b`;
    const lp = (ad: string, extra = "") => `/?utm_source=instagram&utm_medium=paid_social&utm_campaign=gate0&utm_content=${ad}${extra}`;

    // 通常の流入: A と B に 1 回ずつ。A から通常の登録 → 確認
    const email = uniqueEmail("ab", info.project.name);
    await page.goto(lp(adA));
    await submitSignup(page, email);
    await page.goto((await waitForEmail(email)).confirmUrl);
    await page.getByRole("button", { name: "登録を確認する" }).click();
    await expect(page.locator("h1")).toHaveText("事前登録が完了しました");
    const pB = await context.newPage();
    await pB.goto(lp(adB));

    // テスト流入: A へのテスト訪問（?ohuro_test=1）と、B からのテスト用アドレス（+ohuro-test）での登録 → 確認。
    // 試験する人は LP を ?ohuro_test=1 付きで開く運用（EXPERIMENT_PLAN.md 4.4）。付けずに開いた訪問は通常の訪問として数えられる
    const pTest = await context.newPage();
    await pTest.goto(lp(adA, "&ohuro_test=1"));
    const testEmail = uniqueEmail("abtest", info.project.name).replace("@", "+ohuro-test@");
    const pTestSignup = await context.newPage();
    await pTestSignup.goto(lp(adB, "&ohuro_test=1"));
    await submitSignup(pTestSignup, testEmail);
    await pTestSignup.goto((await waitForEmail(testEmail)).confirmUrl);
    await pTestSignup.getByRole("button", { name: "登録を確認する" }).click();
    await expect(pTestSignup.locator("h1")).toHaveText("事前登録が完了しました");

    const funnel = async (ad: string) => {
      const [r] = await db()`select lp_sessions, signups_created, signups_confirmed from waitlist.funnel_by_creative where utm_content = ${ad}`;
      return r ? [Number(r.lp_sessions), Number(r.signups_created), Number(r.signups_confirmed)] : [0, 0, 0];
    };
    // A: 通常の訪問 1・登録 1・確認 1（テスト訪問は数えない）。B: 通常の訪問 1（テスト登録は数えない）
    await expect.poll(() => funnel(adA)).toEqual([1, 1, 1]);
    await expect.poll(() => funnel(adB)).toEqual([1, 0, 0]);
    const summary = await db()`select utm_content, signups_total, signups_confirmed from waitlist.signup_summary_by_creative where utm_content in (${adA}, ${adB})`;
    expect(summary.map((r) => [r.utm_content, Number(r.signups_total), Number(r.signups_confirmed)])).toEqual([[adA, 1, 1]]);
    // 生のデータには、テストの記録も残っている（除外は集計の側で行う）
    const raw = await db()`select count(*)::int as n from waitlist.events where utm_content in (${adA}, ${adB}) and is_test`;
    expect(raw[0]!.n).toBeGreaterThan(0);
  });

  test("サーバーのログにメールアドレス・トークン・接続文字列が出ていない", async () => {
    const log = readFileSync(E2E.serverLog, "utf8");
    expect(log).not.toMatch(/@ohuro-e2e\.jp/);
    expect(log).not.toMatch(/token=[A-Za-z0-9_-]{43}/);
    expect(log).not.toContain(E2E.databaseUrl);
    expect(log).not.toContain(E2E.rateLimitSecret);
  });
});
