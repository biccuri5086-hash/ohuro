import { describe, expect, it } from "vitest";
import { parseSurveyAnswers, SURVEY_FREE_TEXT_MAX } from "@/lib/waitlist/survey";
import { isClientEventName, isValidSessionId } from "@/lib/analytics/events";

describe("任意アンケートの検査", () => {
  it("定義済みの選択肢だけを受け付ける", () => {
    expect(
      parseSurveyAnswers({ procrastination: "daily", photo_acceptance: "hack", intent: "definitely", interests: ["pet", "gacha", "evil", 1] }),
    ).toEqual({ procrastination: "daily", intent: "definitely", interests: ["gacha", "pet"] });
  });
  it("複数選択は重複を除き、「特にない」は単独にする", () => {
    expect(parseSurveyAnswers({ interests: ["pet", "pet"] })).toEqual({ interests: ["pet"] });
    expect(parseSurveyAnswers({ interests: ["pet", "none"] })).toEqual({ interests: ["none"] });
    expect(parseSurveyAnswers({ interests: "home" })).toEqual({ interests: ["home"] });
  });
  it("自由記述は制御文字を除き長さを制限する", () => {
    const r = parseSurveyAnswers({ free_text: `  あ\u0000い${"x".repeat(1000)}` });
    expect(r!.free_text!.startsWith("あい")).toBe(true);
    expect(r!.free_text!.length).toBe(SURVEY_FREE_TEXT_MAX);
  });
  it("1問も回答がなければ null", () => {
    expect(parseSurveyAnswers({})).toBeNull();
    expect(parseSurveyAnswers({ free_text: "   ", interests: [] })).toBeNull();
  });
  it("配列で単一選択の質問を偽装できない", () => {
    expect(parseSurveyAnswers({ intent: ["definitely"] })).toBeNull();
  });
});

describe("計測イベントの検査", () => {
  it("定義済みのイベント名だけ", () => {
    expect(isClientEventName("lp_view")).toBe(true);
    expect(isClientEventName("signup_confirmed")).toBe(false); // サーバー側のみ記録
    expect(isClientEventName("purchase")).toBe(false);
  });
  it("セッションIDの形式", () => {
    expect(isValidSessionId("3f2b1c4e-1111-4222-8333-944455556666")).toBe(true);
    expect(isValidSessionId("short")).toBe(false);
    expect(isValidSessionId("a@b.c.d.e.f.g")).toBe(false);
  });
});
