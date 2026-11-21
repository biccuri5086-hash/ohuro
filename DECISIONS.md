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

## D-005: ハーネス初期設定の実施記録
- 日付: 2026-11-17
- 状態: 提案（記録のみ。D-002〜D-004 の承認状態は変更しない）
- 種別: ハーネス
- 提案者: Claude Code
- 承認者: 未承認
- 承認の証跡: 所有者が RELEASE_CHECKLIST.md「A. ハーネス初期設定」を Cowork で実施したと報告（2026-11-17）
- 変更内容: 所有者の報告と、Claude Code が GitHub API で確認できた範囲を記録する
  - 確認済み: 既定ブランチ `main`、`main` が保護対象（protected）、一時ブランチ `claude/bootstrap-main` の削除、
    ラベル `approved:harness-change` / `audit:medium-accepted` の存在
  - 所有者の報告のみ（Claude Code からは設定画面を読めず未確認）: ルールセットの詳細（必須チェック・強制Push禁止等）、
    Actions 権限、Secret scanning / Push protection、Codex 連携（GitHub App「ChatGPT Codex Connector」）
- 変更理由: Gate 0 着手条件（docs/gates/GATE_0.md）の確認記録
- 影響する文書・コード: なし（記録のみ）
- 次の確認: 本記録を含む PR で Codex 監査と Audit Gate の通し動作を検証し、Codex のボット名を確定する

## D-006: 依存脆弱性検査のマージ条件を本番依存に限定
- 日付: 2026-11-17
- 状態: 提案（所有者が方針を選択済み。PR のマージと承認ラベルで確定）
- 種別: ハーネス
- 提案者: Claude Code
- 承認者: 未承認（所有者がセッション内で「本番依存のみ必須化」を選択。承認の記録は本 PR のラベル `approved:harness-change` とマージで行う）
- 承認の証跡: 本記録を含む PR
- 変更内容: CI の `dependency-audit` ジョブで、マージ条件を `npm audit --omit=dev --audit-level=high`（本番依存）に限定。
  開発依存を含む全体の `npm audit` は継続実行し、結果をジョブサマリーに表示するが失敗扱いにしない
- 変更理由: picomatch の ReDoS（GHSA-fc5q-39xc-vjpf、対象 `<=4.0.7`）が 2026-11-17 に公開され、npm 上に修正版が存在しない。
  経路は vitest / vite / eslint-config-next の開発依存のみで本番バンドルに含まれないが、全 PR がマージ不可になったため
- 影響する文書・コード: `.github/workflows/ci.yml`, TEST_PLAN.md, SECURITY.md（R-7）
- 見直し条件: 修正版の公開時、または本番依存に同種の脆弱性が入った時

## D-007: Dependabot の更新対象とマージ先の固定
- 日付: 2026-11-17
- 状態: 提案
- 種別: ハーネス
- 提案者: Claude Code
- 承認者: 未承認（本記録を含む PR のラベル `approved:harness-change` とマージで確定）
- 承認の証跡: 本記録を含む PR
- 変更内容: `.github/dependabot.yml` に `target-branch: main` を追加。`typescript` と `@types/node` のメジャー更新を対象外にする
- 変更理由: (1) `main` 作成前に作られた Dependabot PR #1〜#4 の base が作業ブランチになり、ブランチ保護と必須チェックを通らずに作業ブランチへマージされた（#1, #2）。
  (2) TypeScript 7 は typescript-eslint の対応範囲外（D-003）、`@types/node` 26 は実行環境 Node 22 と不一致
- 影響する文書・コード: `.github/dependabot.yml`, RELEASE_CHECKLIST.md（A-6）
- 見直し条件: typescript-eslint が TypeScript 7 に対応した時、または Node の実行バージョンを上げる時

## D-008: Codex 監査の実地確認と Audit Gate の標準形式対応
- 日付: 2026-11-17
- 状態: 提案
- 種別: ハーネス
- 提案者: Claude Code
- 承認者: 未承認（本記録を含む PR のラベル `approved:harness-change` とマージで確定）
- 承認の証跡: PR #6 のコメント（Codex の要約コメントと「Didn't find any major issues」）
- 確認できた事実（D-004 の未検証事項）:
  - Codex は GitHub App「ChatGPT Codex Connector」経由で動作し、投稿者は `chatgpt-codex-connector[bot]`（`.github/audit-gate.json` の設定と一致）
  - `@codex review` で起動。Draft 中・連携設定前の依頼（2回）には反応せず、所有者が Cowork で連携を確認した後の依頼で動作した
  - 結果は AGENTS.md の報告書式（`ohuro-audit` ブロック・未検証項目）ではなく、Codex 標準形式で返る。
    要約コメントに `codex-review-state:v1` の状態（commit_sha・status・has_any_findings・has_unresolved_findings）が含まれる
  - head `2731e76` の監査結果: 指摘なし
- 変更内容: Audit Gate が `codex-review-state:v1` も読むようにした（判定は AGENTS.md）。Claude の権限で GitHub のレビュースレッド解決操作を deny
- 変更理由: 標準形式のままでは Audit Gate が pending から進まず、Codex の監査結果をマージ条件にできないため
- 既知の制約: 判定コードはデフォルトブランチのものが使われるため、本変更を含む PR 自身には適用されない（この PR は人間の確認が必要）。
  標準形式では修正ループの回数を Audit Gate で数えられない（CLAUDE.md の規則で運用）
- 影響する文書・コード: scripts/harness/audit-gate.mjs, tests/harness/audit-gate.test.mjs, .claude/settings.json, AGENTS.md, ARCHITECTURE.md, SECURITY.md

## D-009: 待ち時間の作業ルール
- 日付: 2026-11-17
- 状態: 提案（所有者の指示による。本記録を含む PR のラベル `approved:harness-change` とマージで確定）
- 種別: ハーネス
- 提案者: 人間（所有者）
- 承認者: 未承認（所有者がセッション内で「待っている間はできるものをやるように設定」と指示）
- 承認の証跡: 本記録を含む PR
- 変更内容: CLAUDE.md に「4.5 待ち時間の扱い」を追加。CI・監査・人間の操作を待つ間は、承認不要の作業（自己レビュー、検証、調査、文書更新、下準備等）を自分で進める。監査依頼後の Push など、してはいけないことも明記
- 変更理由: 待ち時間が多く、その間の作業停止を避けるため
- 影響する文書・コード: CLAUDE.md

## D-010: PR #6 の監査上書き（audit:human-override）の記録
- 日付: 2026-11-17
- 状態: 記録（上書き自体は所有者が実施済み。本記録の確認は所有者が行う）
- 種別: 例外承認
- 提案者: Claude Code（記録のみ）
- 承認者: 所有者（PR #6 にラベル `audit:human-override` を付与し、2026-11-17 18:32 UTC にマージ）
- 承認の証跡: https://github.com/biccuri5086-hash/ohuro/pull/6
- 内容: PR #6 は Audit Gate の上書きでマージされた
- 理由: Audit Gate はデフォルトブランチの判定コードで動くため、Codex 標準形式に対応する変更（D-008）を含む PR #6 自身には新しい判定を適用できなかった
- 監査の範囲:
  - Codex が監査した head は `2731e76` まで（指摘なし）
  - `812291d`〜`e57d7a0`（Audit Gate の標準形式対応・回帰テスト・`.claude/settings.json` の deny 追加・待ち時間ルール等の文書）は Codex の監査を受けていない。
    CI（テスト 100 件・Lint・型検査・ビルド・秘密情報/ポリシー検査）と PR Guard は通過
- 残る対応: 未監査の差分は、今後 Codex の監査対象になる PR でハーネスに触れる際に合わせて確認する。所有者が必要と判断した場合は、未監査差分の監査依頼を別途行う

## D-011: 事前登録（Gate 0）のデータ構成
- 日付: 2026-11-17
- 状態: 提案
- 種別: 技術選定
- 提案者: Claude Code
- 承認者: 未承認（Issue #9 の PR のマージで確定）
- 承認の証跡: Issue #9 の PR
- 変更内容: 事前登録データを Supabase の `waitlist` スキーマ（Data API 非公開・RLS 既定拒否・anon/authenticated 権限なし）に保存し、
  Next.js サーバーから `postgres` ドライバ 3.4.9 で直接接続する。CI に実 PostgreSQL 17 の DB 結合テスト（`db-test`）を追加
- 変更理由: 公開 API からの漏えい・未認証での一覧取得を構造的に防ぐため。アプリ本体のアカウントと分離するため。
  `postgres` 4 系は 2026-10 公開と新しいため、実績のある 3 系を採用
- 影響する文書・コード: supabase/migrations, tests/db, .github/workflows/ci.yml, DATA_HANDLING.md, ARCHITECTURE.md, TEST_PLAN.md, RELEASE_CHECKLIST.md
- 保留: 保存期間（所有者が公開前に決定）、本番 Supabase への適用（所有者の承認後）

## D-012: 2D アート規格（案）と制作方針
- 日付: 2026-11-19
- 状態: 提案（方針は所有者が会話で承認済み。規格の数値は未承認）
- 種別: 仕様（見た目の規格）・ツール選定
- 提案者: Claude Code
- 承認者: 方針は所有者（2026-11-19 のセッション内で「推奨のものでお願いします」と回答）。規格文書（`docs/art/`）は未承認（Issue #23 の PR のマージで確定）
- 承認の証跡: 方針 = セッション内の所有者の回答。規格 = Issue #23 の PR
- 変更内容:
  1. 素材の正本は自作の SVG とし、画像生成 AI の素材・ラスター画像は使わない。全画面 2D・3D 化しない
  2. 現在のペット・世界観を出発点とし、変更は「案」として画像で提示し、承認後に実装する（Issue #27）
  3. Figma MCP・Frontend Design Plugin は導入しない。Playwright は既存の `@playwright/test` を使い、プラグインは追加しない
  4. `docs/art/` に規格文書（案）を追加。実装は Issue #24〜#27 に分割
- 変更理由: 見た目の統一と権利・商用利用の確認を保つため。この環境には画像生成機能がなく、AI 生成素材は統一感・権利の確認が難しいため
- 影響する文書・コード: docs/art/（新規）。CLAUDE.md の文書体系の表への追加は Issue #26（`approved:harness-change`）
- 保留: 素材のライセンス・商用利用条件の確認（所有者）、パレット・線の太さの確定（Issue #27 のデザイン案）

## D-013: Gate 0 の公開に使うサービス・予算・運営者（所有者の決定）
- 日付: 2026-11-21
- 状態: 決定（所有者がセッション内で回答）。判定ルールの文書・集計への反映は別 Issue
- 種別: 予算・サービス選定・運営情報
- 提案者: Claude Code（Issue #41 で選択肢を提示）
- 承認者: 所有者（2026-11-21 のセッション内の回答）
- 承認の証跡: セッション内の所有者の回答、Issue #41
- 変更内容:
  1. ホスティング: Vercel Pro（Hobby は規約上、非商用の個人利用に限られるため）
  2. データベース: Supabase Pro（所有者が契約済み）
  3. メール送信: Resend 無料プラン（1 日 100 通・月 3,000 通の上限内で運用。超える見込みになったら所有者が判断）
  4. 運営者名: 決定。値は個人情報のためリポジトリに書かず、Vercel の環境変数 `OPERATOR_NAME` に設定する
  5. Gate 0 の予算: 総額の上限 15,000 円。うち広告費は最大 10,000 円（広告 A・B 各 5,000 円まで）、残りはインタビュー・LP・予備費。追加の支出は所有者の承認が必要
  6. Gate 0 の暫定判定ルール: 所有者が提示（メール確認済み登録 20 人以上、確認済み登録単価 500 円以下、LP 登録率 5% 以上を参考指標、課題該当率・写真 2 回撮影許容率それぞれ有効回答者の 70% 以上、アンケート有効回答 最低 10 人、登録機能と計測に重大な不具合がない。合格・要改善・判断保留の 3 区分。数値は今回の実験のための仮の基準）。EXPERIMENT_PLAN.md 4.7 と `report:gate0` への反映は別 Issue（#43）で行う
  7. 判定ルールの数え方（2026-11-21、所有者が選択）:
     - 課題該当: 先延ばしの頻度が「ほぼ毎日」「週に数回」
     - 写真 2 回撮影の許容: 「受け入れられる」「条件によっては受け入れられる」（条件付きの割合も別に表示する）
     - 有効回答者（割合の分母）: その質問に回答し、「答えたくない」を選んでいない人。「わからない」は分母に残す
  8. サービスの月額（Vercel Pro・Supabase Pro）は総額 15,000 円に含めず、別に管理する。登録単価は広告費だけで計算する
  9. 解除済み登録: 一度確認した登録は確認済み登録人数に含め、そのうちの解除済みの人数を別に表示する
  10. 問い合わせ先: 決定（メールアドレス）。値はリポジトリに書かず、Vercel の環境変数 `OPERATOR_CONTACT` に設定する（確認メールとプライバシーポリシーで公開される）
- 変更理由: Gate 0 の本番公開（OPEN-7）と予算（OPEN-6 のうち Gate 0 分）を決めるため
- 影響する文書・コード: docs/gates/GATE_0_LAUNCH_RUNBOOK.md（新規）、COST_POLICY.md、PRODUCT_REQUIREMENTS.md（OPEN-6・OPEN-7）
- 保留:
  - 登録データの保存期間（手順書の付録 A の選択肢から所有者が決める）
  - 送信用ドメイン・LP のドメイン
