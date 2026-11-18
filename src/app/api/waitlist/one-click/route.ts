import { NextResponse } from "next/server";
import { getWaitlist } from "@/server/waitlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RFC 8058 のワンクリック配信停止。メールソフトが本文 "List-Unsubscribe=One-Click" で POST する。
// ここでは配信停止のみ行い、データ削除はしない（削除は /unsubscribe ページで確認を挟む）。
export async function POST(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token");
    const body = await request.text();
    if (!new URLSearchParams(body).has("List-Unsubscribe")) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    const result = await getWaitlist().service.unsubscribe(token, "unsubscribe");
    if (result.status === "unsubscribed") return new NextResponse(null, { status: 200 });
    return NextResponse.json({ error: result.status }, { status: 400 });
  } catch {
    console.error("[waitlist] one-click unsubscribe failed");
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
