import { NextResponse } from "next/server";
import { getWaitlist, isSameOrigin } from "@/server/waitlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let status = "invalid";
  let base: string | undefined;
  try {
    const waitlist = getWaitlist();
    base = waitlist.env.baseUrl;
    if (isSameOrigin(request.headers.get("origin"), base)) {
      const form = await request.formData();
      status = (
        await waitlist.service.submitSurvey(form.get("token"), {
          procrastination: form.get("procrastination"),
          photo_acceptance: form.get("photo_acceptance"),
          interests: form.getAll("interests"),
          intent: form.get("intent"),
          free_text: form.get("free_text"),
        })
      ).status;
    }
  } catch {
    console.error("[waitlist] survey failed");
    status = "error";
  }
  const target = new URL("/survey/result", base ?? request.url);
  target.searchParams.set("status", status);
  return NextResponse.redirect(target, { status: 303 });
}
