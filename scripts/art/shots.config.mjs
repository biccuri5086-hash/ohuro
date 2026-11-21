// 画面スクリーンショット検証の設定（Issue #25 / Art-3）。撮影条件はここだけで決める。
// 手順と方針は docs/art/SCREENSHOTS.md。

/** 撮影する画面幅（エミュレーション。実機確認の代わりにはならない） */
export const VIEWPORTS = [
  { id: "w360", label: "小型 Android 相当", width: 360, height: 780 },
  { id: "w390", label: "iPhone 13 相当", width: 390, height: 844 },
  { id: "w412", label: "Pixel 7 相当", width: 412, height: 915 },
];

/** すべての撮影で同じ値にする（基準画像との比較のため） */
export const DEVICE_SCALE_FACTOR = 2;

/** 撮影する LP の区間。selector と nth（0 始まり）で 1 要素に絞る */
export const TARGETS = [
  { id: "hero", label: "ファーストビュー", selector: "header.hero", nth: 0 },
  { id: "problem", label: "課題提起", selector: "main.lp > section.section", nth: 0 },
  { id: "features", label: "製品紹介", selector: "main.lp > section.section", nth: 1 },
  { id: "photo", label: "写真チェックの説明", selector: "main.lp > section.section", nth: 2 },
  { id: "signup", label: "事前登録フォーム", selector: "main.lp > section.section", nth: 3 },
  { id: "faq", label: "FAQ", selector: "main.lp > section.section", nth: 4 },
];

/** LP を開く URL（テスト流入として記録され、集計から除外される） */
export const LP_PATH = "/?ohuro_test=1";

/**
 * 撮影時に足す CSS。動きを止め、日本語フォントを IPA ゴシックに固定する。
 * フォントの固定は「環境差をなくすため」で、実機の見た目（システムフォント）とは異なる。
 */
export const FREEZE_CSS = `
*, *::before, *::after {
  animation: none !important;
  transition: none !important;
  caret-color: transparent !important;
}
html, body, body * {
  font-family: "IPAGothic", "IPAゴシック", sans-serif !important;
}
`;

/** 差分の判定。1 画素の各色成分の差がこの値を超えたら「変化あり」と数える */
export const PIXEL_THRESHOLD = 16;

/** 撮影結果の置き場（.gitignore 済み。コミットしない） */
export const OUTPUT_DIR = ".art-shots";
