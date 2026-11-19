import { NextResponse } from "next/server";
import { clientKeyFrom, getWaitlist, isSameOrigin } from "@/server/waitlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// LP の計測イベント（ファーストパーティ）。失敗しても利用者の操作には影響しない
export async function POST(request: Request) {
  try {
    const waitlist = getWaitlist();
    if (!isSameOrigin(request.headers.get("origin"), waitlist.env.baseUrl)) return new NextResponse(null, { status: 403 });
    const raw = await request.text();
    if (raw.length > 2048) return new NextResponse(null, { status: 413 });
    const body = JSON.parse(raw) as Record<string, unknown>;
    const r = await waitlist.service.recordEvent({
      name: body.name,
      sessionId: body.sessionId,
      utm: body.utm,
      test: body.test,
      clientKey: clientKeyFrom(request.headers),
    });
    return new NextResponse(null, { status: r.status === "recorded" ? 204 : r.status === "rate_limited" ? 429 : 400 });
  } catch {
    return new NextResponse(null, { status: 400 });
  }
}
