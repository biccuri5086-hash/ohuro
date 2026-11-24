import { describe, expect, it } from "vitest";
import { ADS, landingUrl, LP_URL, VIDEO } from "../../scripts/ads/ads.config.mjs";

const textOf = (ad) => [ad.headline, ad.primaryText, ad.cta, ...ad.scenes.flatMap((s) => [...s.lines, s.sub ?? ""])].join("\n");

// 広告表現のルール（docs/legal/GATE0_LEGAL_CHECKLIST.md 4〜5章）を機械的に確認する。網羅的ではない
const BANNED = [
  [/あなたは|あなたも|君は/, "受け手の属性・状態を決めつける表現"],
  [/効果|治る|治す|改善され|健康|医学|科学的|ストレス|うつ|ADHD/, "効果・医学的な示唆"],
  [/No\.?\s?1|ナンバーワン|ランキング|満足度|口コミ|レビュー|万人|ダウンロード数/, "存在しない実績・評価"],
  [/今すぐダウンロード|App Store|Google Play|配信中|リリース済み/, "ストア公開済みに見せる表現"],
  [/必ず|絶対|確実/, "断定・誇張"],
  // 未検証の行動変容を断定する言い方（Codex 指摘 PR #18）。「変えたい」「変えることを目指す」のような目標表現は可
  [/(?:変える|変わる|変えます|変わります|なくなる|なくせる|解消)(?:[。、！!）)]|$)/m, "行動変容・効果の断定"],
];

describe("広告素材の定義（G0-7）", () => {
  it("A/B の2本で、識別子が UTM の規則に沿い重複しない", () => {
    expect(ADS.map((a) => a.id)).toEqual(["ad_a_v1", "ad_b_v1"]);
    for (const ad of ADS) {
      expect(ad.utm.utm_content).toBe(ad.id);
      for (const v of Object.values(ad.utm)) expect(v).toMatch(/^[A-Za-z0-9_.-]{1,100}$/);
    }
  });
  it("遷移先は本番の LP（ohuro-quest.com）で、広告ごとに utm_content が違う（Issue #47）", () => {
    expect(LP_URL).toBe("https://ohuro-quest.com/");
    const urls = ADS.map((a) => new URL(landingUrl(a)));
    for (const [i, u] of urls.entries()) {
      expect(u.origin).toBe("https://ohuro-quest.com");
      expect(u.pathname).toBe("/");
      expect(u.searchParams.get("utm_source")).toBe("instagram");
      expect(u.searchParams.get("utm_medium")).toBe("paid_social");
      expect(u.searchParams.get("utm_campaign")).toBe("gate0");
      expect(u.searchParams.get("utm_content")).toBe(ADS[i].id);
      // テスト流入の印（ohuro_test）を広告の URL に付けない
      expect(u.searchParams.has("ohuro_test")).toBe(false);
    }
    expect(new Set(urls.map((u) => u.searchParams.get("utm_content"))).size).toBe(ADS.length);
  });
  it("同じ LP に、広告ごとの UTM を付けて誘導する", () => {
    const urls = ADS.map((a) => landingUrl(a, "https://ohuro.example/"));
    expect(urls[0]).toBe("https://ohuro.example/?utm_source=instagram&utm_medium=paid_social&utm_campaign=gate0&utm_content=ad_a_v1");
    expect(new Set(urls.map((u) => u.split("?")[0])).size).toBe(1);
  });
  for (const ad of ADS) {
    it(`${ad.id}: 本文に「開発中」と「コンセプトイメージ」、公開日未定を明示している`, () => {
      expect(ad.primaryText).toContain("開発中");
      expect(ad.primaryText).toContain("コンセプトイメージ");
      expect(textOf(ad)).toMatch(/公開日[はも]?未定/);
    });
    it(`${ad.id}: 禁止表現を含まない`, () => {
      const t = textOf(ad);
      for (const [re, why] of BANNED) expect(t, why).not.toMatch(re);
    });
    it(`${ad.id}: 最後のシーンは登録への誘導`, () => {
      expect(ad.scenes.at(-1).art).toBe("cta");
    });
  }
  it("動画は 9:16（1080×1920）", () => {
    expect(VIDEO.width / VIDEO.height).toBeCloseTo(9 / 16);
  });
});
