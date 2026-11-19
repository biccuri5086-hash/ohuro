import { describe, expect, it } from "vitest";
import { isOneClickUnsubscribeRequest } from "@/server/waitlist/one-click";

const url = "https://ohuro.example/api/waitlist/one-click?token=x";

describe("RFC 8058 ワンクリック配信停止の本文（Codex 指摘 PR #21）", () => {
  it("multipart/form-data（RFC の SHOULD）を受け付ける", async () => {
    const form = new FormData();
    form.set("List-Unsubscribe", "One-Click");
    expect(await isOneClickUnsubscribeRequest(new Request(url, { method: "POST", body: form }))).toBe(true);
  });

  it("application/x-www-form-urlencoded（RFC の MAY）を受け付ける", async () => {
    const req = new Request(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });
    expect(await isOneClickUnsubscribeRequest(req)).toBe(true);
  });

  it.each([
    ["値が One-Click でない", "application/x-www-form-urlencoded", "List-Unsubscribe=yes"],
    ["項目がない", "application/x-www-form-urlencoded", "foo=bar"],
    ["JSON", "application/json", '{"List-Unsubscribe":"One-Click"}'],
    ["Content-Type なし", "", "List-Unsubscribe=One-Click"],
  ])("%s は拒否する", async (_label, type, body) => {
    const headers: Record<string, string> = type ? { "content-type": type } : {};
    const req = new Request(url, { method: "POST", headers, body });
    if (!type) req.headers.delete("content-type");
    expect(await isOneClickUnsubscribeRequest(req)).toBe(false);
  });

  it("壊れた multipart は拒否する", async () => {
    const req = new Request(url, {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=xyz" },
      body: "not multipart",
    });
    expect(await isOneClickUnsubscribeRequest(req)).toBe(false);
  });
});
