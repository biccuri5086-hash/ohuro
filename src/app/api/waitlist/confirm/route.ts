import { NextResponse } from "next/server";
import { getWaitlist, isSameOrigin } from "@/server/waitlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 確認ページのボタン（フォーム POST）で確認を確定する。
// GET のリンクで即確定しないのは、メールのセキュリティ機能がリンクを自動で開いて誤確認するのを防ぐため。
export async function POST(request: Request) {
  let status = "invalid";
  let surveyToken: string | undefined;
  let base: string | undefined;
  try {
    const waitlist = getWaitlist();
    base = waitlist.env.baseUrl;
    if (isSameOrigin(request.headers.get("origin"), base)) {
      const form = await request.formData();
      const result = await waitlist.service.confirm(form.get("token"));
      status = result.status;
      surveyToken = result.surveyToken;
    }
  } catch {
    console.error("[waitlist] confirm failed");
    status = "error";
  }
  const target = new URL("/confirm/result", base ?? request.url);
  target.searchParams.set("status", status);
  if (surveyToken) target.searchParams.set("survey", surveyToken);
  return NextResponse.redirect(target, { status: 303 });
}
