// 広告素材 A/B の唯一の定義（Issue #15）。文言・UTM・シーン構成はここだけを編集し、
// `npm run ads:render` で掲載用データ（marketing/ads/<id>/upload）と確認用画像（preview）を作り直す。
//
// 表現ルール（GAME_DESIGN.md / AGENTS.md / docs/legal/GATE0_LEGAL_CHECKLIST.md）:
// - 全シーンに「開発中」「コンセプトイメージ」を表示する。ストア公開済み・完成品に見せない
// - 受け手の状態・属性を決めつけない（「あなたは〜」を使わない）。医学的効果・効果の実証を示唆しない
// - 報酬を誇張しない。存在しないレビュー・評価・利用者数を載せない

export const LP_URL = "https://（公開URLは未定）/";

const utm = (content) => ({
  utm_source: "instagram",
  utm_medium: "paid_social",
  utm_campaign: "gate0",
  utm_content: content,
});

export const ADS = [
  {
    id: "ad_a_v1",
    name: "広告A：ゲーム訴求",
    purpose: "ペット育成・無料ガチャへの興味を検証する",
    utm: utm("ad_a_v1"),
    headline: "お風呂でコインが貯まるアプリ（開発中）",
    primaryText:
      "お風呂に入るとコインが貯まる。無料ガチャでペットや家具を集めよう。\nおふろクエストは開発中のアプリです。公開日は未定。無料の事前登録で、リリース情報をお届けします。\n※画像はすべて開発中のコンセプトイメージです。",
    cta: "登録する",
    ctaNote: "Meta 広告の CTA ボタンは「登録する（Sign up）」を想定。実際の選択肢は配信時に確認",
    scenes: [
      { art: "pet-coins", lines: ["お風呂に入ると", "コインが貯まる。"] },
      { art: "gacha", lines: ["貯めたコインで", "無料ガチャ。"] },
      { art: "collection", lines: ["ペットや家具を", "集めよう。"] },
      { art: "room", lines: ["自分だけの", "2Dマイホーム。"] },
      { art: "cta", lines: ["おふろクエスト"], sub: "無料で事前登録受付中・公開日未定" },
    ],
  },
  {
    id: "ad_b_v1",
    name: "広告B：課題解決訴求",
    purpose: "入浴の先延ばしを変えたいという関心を検証する",
    utm: utm("ad_b_v1"),
    headline: "お風呂の先延ばしをゲームで変えたい。新アプリ開発中",
    primaryText:
      "スマホを見ていたら、もう深夜。お風呂の先延ばしをゲームで変えることを目指して、新しいアプリを開発中です。\nお風呂までの行動を小さなクエストにして、最初の一歩を後押しできるアプリを目指しています。公開日は未定。無料の事前登録で、リリース情報をお届けします。\n※画像はすべて開発中のコンセプトイメージです。",
    cta: "登録する",
    ctaNote: "Meta 広告の CTA ボタンは「登録する（Sign up）」を想定。実際の選択肢は配信時に確認",
    scenes: [
      { art: "phone-night", lines: ["スマホを見ていたら、"] },
      { art: "moon", lines: ["もう深夜。"] },
      { art: "quest", lines: ["お風呂の先延ばしを、", "ゲームで変えたい。"] },
      { art: "pet-coins", lines: ["小さなクエストで、", "最初の一歩を。"] },
      { art: "cta", lines: ["おふろクエスト"], sub: "無料で事前登録受付中・公開日未定" },
    ],
  },
];

/** 広告から LP への URL（UTM 付き）。LP の公開 URL が決まったら LP_URL を更新する */
export function landingUrl(ad, base = LP_URL) {
  const q = new URLSearchParams(ad.utm).toString();
  return `${base}?${q}`;
}

export const VIDEO = { width: 1080, height: 1920, sceneSeconds: 2.2, fadeSeconds: 0.3, fps: 30 };
