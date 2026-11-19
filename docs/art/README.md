# 2D アート規格（Issue #23 / Art-1）

- 状態: **案（所有者の承認待ち）**。数値は「現行」（コードから測定した事実）と「案（仮）」（未承認の提案）を分けて書く
- 対象: おふろクエストの 2D イラスト・アイコン・UI の見た目
- 方針（所有者承認済み。2026-11-19 のセッション内の指示。DECISIONS.md D-012）
  - 素材の正本は **SVG**（自作）。画像生成 AI の素材は使わない
  - 全画面 2D。3D 化しない
  - 現在のキャラクター・世界観を出発点にし、勝手に変えない。変更は「案」として提示し、承認後に実装する（Issue #27）
  - Figma・Frontend Design Plugin は導入しない。追加の有料サービスは事前承認が必要

## 文書一覧

| 文書 | 内容 |
|---|---|
| [DESIGN_GUIDELINES.md](DESIGN_GUIDELINES.md) | 全体の指針、配色パレット、線、角丸、読みやすさ、倫理上の禁止事項 |
| [CHARACTER_SPEC.md](CHARACTER_SPEC.md) | ペットのシルエット・比率・顔パーツ・色・アンカー |
| [ANIMATION_SPEC.md](ANIMATION_SPEC.md) | 表情・ポーズ・アニメーションの制作規則 |
| [ASSET_SPEC.md](ASSET_SPEC.md) | 家具・衣装・背景の制作規格 |
| [PIPELINE.md](PIPELINE.md) | 素材パイプライン（SVG の正本・検査・素材台帳・生成）の手順（Issue #24） |
| [SCREENSHOTS.md](SCREENSHOTS.md) | 画面スクリーンショット検証と変更前後の比較の手順（Issue #25） |
| `baseline/` | 変更前の基準画像（現在の絵）。仕様の記録用 |

## 現行の絵の所在（2026-11-19 時点）

| 絵 | 場所 | 備考 |
|---|---|---|
| ペット・部屋・コイン・タオル・スマートフォン | `src/components/lp/Illustrations.tsx`（インライン SVG、102 行） | LP で使用 |
| ペット（広告用の複製） | `scripts/ads/render-ads.mjs` の `PET` | `Illustrations.tsx` と同じ形を文字列で複製 |
| 広告の場面（ペットとコイン、ガチャ、収集など） | `scripts/ads/render-ads.mjs` | 広告 A/B の動画・画像の元 |

ゲーム本体の画面は未実装（Gate 2 以降）。LP 以外の UI はない。

## 現状の不整合・課題（観察した事実）

1. **ペットの絵が 2 か所にある**（`Illustrations.tsx` と `render-ads.mjs`）。片方だけ直すと見た目がズレる → **Issue #24 で解消**（正本 `art/src/pet.svg` から両方を生成。[PIPELINE.md](PIPELINE.md)）
2. **部屋の中のペットは簡略版**。口・ほっぺ・目のハイライトがない。縮小のため体の線を 6（0.48 倍で実効 約 2.9）にしており、単体のペット（線 4 / 全体 120）より全体比で太い
3. **線の太さの種類が多い**。`Illustrations.tsx` では 2・2.5・3・3.5・4・5・6 の 7 種
4. **ペットの表情・ポーズは 1 種類だけ**
5. **単体のペットの湯気の中央が、viewBox の上端で切れている**（`M62 18c-5-6 3-11-1-17` の線の太さ分が y=0 を越える。`baseline/current-art-sheet.png` で確認できる）
6. **パレットが 2 系統**。`Illustrations.tsx` の色と、広告の場面だけで使う色（`#b9a6f0` `#f7b267` `#9fb3c8` `#2e3a59` `#f1e4d6` `#e8f5fb` など）がある
7. `prefers-reduced-motion` は `scroll-behavior` だけに対応（現行はアニメーションなし）

これらを直すのは Issue #24〜#27。本書では規格だけを定める。

## 基準画像（変更前）

- `baseline/current-art-sheet.png`: ペット・部屋・アイコン 3 点（現行）
- `baseline/lp-first-view-iphone13.png`: LP のファーストビュー（iPhone 13 相当のエミュレーション。実機ではない）
- 撮影: Playwright（Chromium）、`deviceScaleFactor: 2`、IPA ゴシック。ブランチ `claude/issue-12-lp` の内容（PR #22）
- 変更前後の比較に使う。撮影条件の固定と比較画像の自動生成は Issue #25

## 制作ツールと権利（事実と確認事項）

- この環境で**画像生成機能は使えない**（画像生成のツールがない）。本規格の素材は自作の SVG を前提にする。使えるのは Playwright（Chromium）、ffmpeg、ImageMagick、Python PIL、IPA ゴシック
- 素材はすべて自作の SVG（出所を素材台帳に記録する。Issue #24）。既存作品に似せない
- フォント: LP はシステムフォントのみ（外部フォントなし）。広告の動画は IPA ゴシックを使用（`scripts/ads/render-ads.mjs`）。ライセンス条件は**所有者が確認**する（AI は法的適合を保証しない）
- 商用利用の条件を素材ごとに素材台帳へ記録する（Issue #24）。台帳が整うまで、新しい外部素材（フォント・画像・アイコン）は追加しない

## 承認と進め方

1. 本書（案）を所有者が確認する → 修正があれば反映
2. Issue #24（パイプライン）・#25（スクリーンショット検証）・#26（Skill と Codex 監査項目）
3. Issue #27: デザイン案（画像）を提示 → **所有者が承認** → 実装 → 変更前後の比較 → Codex 監査

`docs/art/` は CLAUDE.md の文書体系の表にまだない。追加は CLAUDE.md の変更（`approved:harness-change`）になるため、Issue #26 で扱う。
