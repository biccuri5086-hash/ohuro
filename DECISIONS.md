# DECISIONS.md — 決定記録

仕様変更・仮値の確定・例外承認・ハーネス変更・Gate 通過を記録する。**追記のみ**（過去の記録は書き換えず、
覆す場合は新しい記録で「D-xxx を置き換える」と書く）。

## 記録の書式

```markdown
## D-xxx: <タイトル>
- 日付: YYYY-MM-DD
- 状態: 提案 / 承認 / 却下 / 置換（→ D-yyy）
- 種別: 仕様変更 / 仮値確定 / 例外承認 / ハーネス / 技術選定 / Gate通過 / 費用
- 提案者: <Claude Code / Codex / 人間>
- 承認者: <GitHubアカウント名 または 「未承認」>
- 承認の証跡: <PR・Issue・コメントのURL>
- 変更内容:
- 変更理由:
- 影響する文書・コード:
```

AI（Claude Code / Codex）は「提案」までしか記録できない。状態を「承認」にする変更は人間が行うか、
人間の承認コメントの URL を証跡として記載する。

---

## D-001: 初期製品要件の登録
- 日付: 2026-11-17
- 状態: 承認
- 種別: 仕様変更（初版）
- 提案者: 人間（所有者）
- 承認者: 所有者（ハーネス構築マスタープロンプトにより指示）
- 承認の証跡: ハーネス構築セッションでの所有者の指示（本リポジトリ初回PRに記録）
- 変更内容: PRODUCT_REQUIREMENTS.md / GAME_DESIGN.md の初版。確定・仮・未確定の区分は各文書のとおり
- 変更理由: プロジェクト開始
- 影響する文書・コード: PRODUCT_REQUIREMENTS.md, GAME_DESIGN.md

## D-002: 開発ハーネスの構成
- 日付: 2026-11-17
- 状態: 提案
- 種別: ハーネス
- 提案者: Claude Code
- 承認者: 未承認
- 承認の証跡: （ハーネス初回PRのマージをもって承認とするか、所有者が判断）
- 変更内容: CLAUDE.md / AGENTS.md / `.claude/` / `.github/workflows/`（CI, PR Guard, Audit Gate, Cost Report）/
  `scripts/harness/` による開発ハーネス。構成は ARCHITECTURE.md「3. 開発ハーネス構成」
- 変更理由: Claude Code 主開発・Codex 独立監査・人間承認の体制を機械的に担保するため
- 影響する文書・コード: 上記すべて

## D-003: アプリ骨格の技術バージョン
- 日付: 2026-11-17
- 状態: 提案
- 種別: 技術選定
- 提案者: Claude Code
- 承認者: 未承認
- 承認の証跡: —
- 変更内容: Node 22 / Next.js 16.4.6 / React 19.3.1 / TypeScript 6.0.3 / ESLint 10.15.0 / Vitest 5.1.0（npm レジストリで 2026-11-17 に確認した最新安定版。
  TypeScript 7.0.2 は typescript-eslint の対応範囲 `<6.1.0` 外のため 6.0.3 に固定）
- 変更理由: CI で検査対象となる最小骨格が必要。機能実装は含まない
- 影響する文書・コード: package.json, ARCHITECTURE.md

## D-004: 独立監査のマージ条件化の方式
- 日付: 2026-11-17
- 状態: 提案（**動作未検証**）
- 種別: ハーネス
- 提案者: Claude Code
- 承認者: 未承認
- 承認の証跡: —
- 変更内容: Codex の監査コメント中の `ohuro-audit` ブロックを Audit Gate ワークフローが読み、commit status
  `audit-gate / independent-audit` を設定。ブランチ保護でこれを必須にする。信頼する監査者は
  `.github/audit-gate.json` の `auditors`（初期値 `chatgpt-codex-connector[bot]` は**未検証の想定値**）
- 変更理由: Codex のコメントだけではマージをブロックできないため
- 未検証事項: Codex の GitHub 連携の有効化状態、ボット名、書式どおりの出力
- 代替案: Codex 連携が使えない場合、(a) 人間が Codex の結果を確認して `audit:human-override` を付け本書に記録する、
  (b) `openai/codex-action` 等で API キーを使い Actions から監査する（従量課金のため費用承認が必要）
