"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics/track";
import { SignupForm } from "./SignupForm";

/** LP 表示を1回記録する */
export function PageViewTracker() {
  useEffect(() => {
    track("lp_view");
  }, []);
  return null;
}

/** 計測付きの事前登録フォーム（フォーム表示は1回、送信は送信のたび） */
export function TrackedSignupForm() {
  return <SignupForm onEvent={onEvent} />;
}

function onEvent(name: "form_view" | "form_submit") {
  track(name, { once: name === "form_view" });
}
