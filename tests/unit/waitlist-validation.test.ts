import { describe, expect, it } from "vitest";
import { isTestEmail, isValidEmail, normalizeEmail, sanitizeUtm } from "@/lib/waitlist/validation";

describe("isValidEmail", () => {
  it.each(["user@example.com", "a.b+tag@sub.example.co.jp", "x@y.io", " spaced@example.com "])("有効: %s", (e) => {
    expect(isValidEmail(e)).toBe(true);
  });
  it.each([
    "",
    "plain",
    "@example.com",
    "user@",
    "user@localhost",
    "user@@example.com",
    "us er@example.com",
    "user@exa mple.com",
    ".user@example.com",
    "user.@example.com",
    "us..er@example.com",
    "user@-example.com",
    "user@example.c",
    "user@example.123",
    "ユーザー@example.com",
    `${"a".repeat(65)}@example.com`,
    `a@${"b".repeat(250)}.com`,
    "<script>@example.com",
  ])("無効: %s", (e) => {
    expect(isValidEmail(e)).toBe(false);
  });
  it("文字列以外は無効", () => {
    expect(isValidEmail(undefined)).toBe(false);
    expect(isValidEmail(123)).toBe(false);
    expect(isValidEmail({})).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("前後空白を除き小文字化する", () => {
    expect(normalizeEmail("  User@Example.COM ")).toBe("user@example.com");
  });
});

describe("isTestEmail", () => {
  it.each(["a@example.com", "a@example.org", "a@foo.test", "a@foo.invalid", "me+ohuro-test@gmail.com", "me+ohuro-test-2@gmail.com"])(
    "テスト扱い: %s",
    (e) => expect(isTestEmail(e)).toBe(true),
  );
  it.each(["me@gmail.com", "me+news@gmail.com", "a@example.co.jp", "a@examples.com"])("通常: %s", (e) => {
    expect(isTestEmail(e)).toBe(false);
  });
});

describe("sanitizeUtm", () => {
  it("許可された値だけを残す", () => {
    expect(
      sanitizeUtm({
        utm_source: "instagram",
        utm_medium: "paid_social",
        utm_campaign: "gate0-2026.11",
        utm_content: "ad_a_v1",
        utm_term: "ignored",
        other: "x",
      }),
    ).toEqual({ utm_source: "instagram", utm_medium: "paid_social", utm_campaign: "gate0-2026.11", utm_content: "ad_a_v1" });
  });
  it("不正な文字・長すぎる値・文字列以外は捨てる", () => {
    expect(
      sanitizeUtm({ utm_source: "<script>", utm_medium: "a".repeat(101), utm_campaign: 1, utm_content: "広告A" }),
    ).toEqual({});
    expect(sanitizeUtm(null)).toEqual({});
    expect(sanitizeUtm("utm_source=x")).toEqual({});
  });
});
