import { NextResponse } from "next/server";
import { getWaitlist, isSameOrigin } from "@/server/waitlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 配信停止・登録データ削除ページのフォーム送信先
export async function POST(request: Request) {
  let status = "invalid";
  let base: string | undefined;
  try {
    const waitlist = getWaitlist();
    base = waitlist.env.baseUrl;
    if (isSameOrigin(request.headers.get("origin"), base)) {
      const form = await request.formData();
      const mode = form.get("mode");
      if (mode === "delete" && form.get("confirm_delete") !== "yes") {
        status = "delete_not_confirmed";
      } else if (mode === "unsubscribe" || mode === "delete") {
        status = (await waitlist.service.unsubscribe(form.get("token"), mode)).status;
      }
    }
  } catch {
    console.error("[waitlist] unsubscribe failed");
    status = "error";
  }
  const target = new URL("/unsubscribe/result", base ?? request.url);
  target.searchParams.set("status", status);
  return NextResponse.redirect(target, { status: 303 });
}
