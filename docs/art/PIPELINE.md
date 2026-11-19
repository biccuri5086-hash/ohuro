# 素材パイプライン（Issue #24 / Art-2）

2D 素材は **`art/src/*.svg` の 1 か所だけ** に置き、LP・広告・将来のゲーム画面はそこから生成したコードを使う。

## 構成

| 場所 | 内容 | 編集 |
|---|---|---|
| `art/src/*.svg` | 素材の正本（自作の SVG） | 人が編集する |
| `art/palette.json` | 使ってよい色・線の太さ・ファイルの上限サイズ | 規格の変更時（承認が必要） |
| `art/ASSETS.json` | 素材台帳（出所・制作方法・ライセンス・商用利用の可否・sha256） | 素材の追加・変更時 |
| `src/components/art/generated.tsx` | LP 用の React コンポーネント | **自動生成**（直接編集しない） |
| `scripts/ads/art.generated.mjs` | 広告の場面用の SVG の中身 | **自動生成**（直接編集しない） |
| `src/components/lp/Illustrations.tsx` | 生成コンポーネントの再公開（既存の import を保つため） | 原則変更しない |

## 素材を追加・変更する手順

1. **デザイン案を先に提示して承認を得る**（[README.md](README.md) の進め方。見た目を変える場合）
2. `art/src/<id>.svg` を作る・直す。規格は [DESIGN_GUIDELINES.md](DESIGN_GUIDELINES.md)・[CHARACTER_SPEC.md](CHARACTER_SPEC.md)・[ASSET_SPEC.md](ASSET_SPEC.md)
   - 使える要素: `g`・`path`・`circle`・`ellipse`・`rect`。属性は形・塗り・線（丸端・丸角）・`opacity`・`transform`（translate / scale / rotate）だけ
   - 色は `art/palette.json` の色か `none`。線の太さも同ファイルの値だけ
   - 使えないもの: ラスター画像、外部参照（`href`・`url()`・`data:`）、`script`・`style`・`foreignObject`、グラデーション・フィルター（立体的な表現）、文字
   - ベクター編集ソフトで描いた場合も、書き出した SVG を上の形に整える（不要な属性・メタデータを消す）
3. 新しい素材なら `art/ASSETS.json` に記録を足す。必須欄: `id`・`file`・`component`・`defaultTitle`・`kind`・`author`・`method`・`references`・`createdAt`・`license`・`commercialUse`・`sha256`
4. `npm run art:build -- --update-hashes` で台帳の sha256 を更新し、生成ファイルを書き出す
5. `npm run art:compare -- --base origin/main` で変更前後を比べる（[SCREENSHOTS.md](SCREENSHOTS.md)）。広告に使う素材なら `npm run ads:render` で広告を作り直す
6. PR に比較の表と画像を添付し、Codex の監査（素材の観点は Issue #26）と所有者の確認を受ける

## 自動の検査

- `tests/unit/art-pipeline.test.mjs`（`npm test`、CI で実行）が次を確認する
  - すべての素材が検査に合格する
  - すべての素材が台帳にあり、台帳の sha256 がファイルと一致する
  - 生成ファイルが最新（生成を忘れると失敗）
  - 違反する SVG（script・ラスター画像・外部参照・パレット外の色・グラデーション等 20 種）が拒否される
- `npm run art:build -- --check` でも同じ確認ができる（書き換えない）

## 画像生成ツールについて

- この環境には**画像生成機能がない**。本パイプラインは自作の SVG だけを前提にしている（D-012）
- 画像生成ツールを使う案が出た場合は、使う前に次を確認し、所有者の承認（DECISIONS.md）を得る: 利用規約、生成物の権利と商用利用の条件、費用、学習・送信されるデータ。承認なしに有料サービスを契約しない
- ラスター画像は検査で拒否される。方針を変える場合は、規格・検査・台帳の項目を合わせて変更する

## 権利と商用利用

- 台帳の `license`・`commercialUse` は、所有者が確認して確定する。AI（Claude Code・Codex）は法的な適合を保証しない
- 既存の作品・キャラクターを参考にした場合は `references` に記録する。トレース・模写はしない
- フォント（広告で使う IPA ゴシック）は台帳の `fonts` に記録している。条件は所有者が確認する

## 確認済みの動作（2026-11-19）

- 現行の 5 素材（ペット・部屋・コイン・タオル・スマートフォン）を正本に移した。値は元のコードと同じ（白は `#fff` を `#ffffff` に表記統一）
- LP: `npm run art:compare -- --base claude/issue-25-art-screenshots --fail-on-diff` で 18 区間すべて変化 0（終了コード 0）
- 広告: 移行の前後で `npm run ads:render` の出力（動画・サムネイル・確認用画像）がバイト単位で同一（`git status` で差分なし）
- 残る重複: 部屋の中のペット（簡略版）と、広告の場面だけにある図形（コイン・ガチャ・家具）は、見た目が変わるため移していない（Issue #27）
