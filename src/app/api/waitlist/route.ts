import { NextResponse } from "next/server";
import { clientKeyFrom, getWaitlist, isSameOrigin, WaitlistConfigError } from "@/server/waitlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4096;

export async function POST(request: Request) {
  let waitlist;
  try {
    waitlist = getWaitlist();
  } catch (e) {
    console.error(e instanceof WaitlistConfigError ? `[waitlist] ${e.message}` : "[waitlist] init failed");
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  if (!isSameOrigin(request.headers.get("origin"), waitlist.env.baseUrl)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "unsupported_media_type" }, { status: 415 });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const result = await waitlist.service.register({
      email: body.email,
      consent: body.consent,
      marketingOptIn: body.marketingOptIn,
      utm: body.utm,
      honeypot: body.website,
      elapsedMs: body.elapsedMs,
      clientKey: clientKeyFrom(request.headers),
    });
    switch (result.status) {
      case "accepted":
        return NextResponse.json({ ok: true }, { status: 202 });
      case "invalid_email":
        return NextResponse.json({ error: "invalid_email" }, { status: 400 });
      case "consent_required":
        return NextResponse.json({ error: "consent_required" }, { status: 400 });
      case "rate_limited":
        return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
  } catch {
    // 例外の詳細（接続文字列・メールアドレス等）はログに出さない
    console.error("[waitlist] register failed");
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
