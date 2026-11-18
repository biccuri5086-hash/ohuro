# RELEASE_CHECKLIST.md — 公開・Gate 通過・ハーネス初期設定のチェックリスト

すべての項目は **人間が確認・承認** する。AI は確認結果の下書きまで。

## A. ハーネス初期設定（所有者が GitHub 設定画面で実施）

本セッションの GitHub 連携にはブランチ保護・リポジトリ設定を変更する手段がないため、以下は手動設定が必要。

### A-1. ブランチ保護（Settings → Rules → Rulesets → New branch ruleset、対象: `main`）
- [ ] Enforcement status: Active
- [ ] Bypass list: 空（所有者自身も含めない。緊急時は一時的に変更し DECISIONS.md に記録）
- [ ] Restrict deletions
- [ ] Block force pushes
- [ ] Require a pull request before merging
  - Required approvals: **0**（R-1: 現状 PR 作成者と所有者が同一アカウントのため。別アカウント導入後に 1 以上へ）
  - Dismiss stale approvals / Require conversation resolution: 有効
- [ ] Require status checks to pass（Require branches to be up to date: 有効）
  - `quality`（CI）
  - `db-test`（CI。2026-11-17 追加、Issue #9）
  - `e2e`（CI。2026-11-18 追加、Issue #16）
  - `dependency-audit`（CI）
  - `guard`（PR Guard）
  - `audit-gate / independent-audit`（Audit Gate が設定する commit status）
- [ ] Require linear history（任意）

※ 必須チェックは一度実行されないと候補に表示されない。初回PRで CI が動いた後に設定する。
※ Rulesets が使えない場合は Settings → Branches → Branch protection rules で同等の設定を行う。

### A-2. Actions 設定（Settings → Actions → General）
- [ ] Workflow permissions: **Read repository contents and packages permissions**（既定を読み取り専用に）
- [ ] Allow GitHub Actions to create and approve pull requests: **無効**
- [ ] Fork pull request workflows: 外部コントリビューターの実行に承認を要求
- [ ] Artifact and log retention: 30日

### A-3. セキュリティ（Settings → Code security）
- [ ] Secret scanning / Push protection: 有効
- [ ] Dependabot alerts: 有効
- [ ] Private vulnerability reporting: 有効

### A-4. ラベル作成（Issues → Labels）
| ラベル | 付与者 | 意味 |
|---|---|---|
| `status:approved` | 人間 | Claude Code が着手してよい Issue |
| `approved:harness-change` | 人間 | ハーネス・CI・権限の変更を承認 |
| `approved:test-removal` | 人間 | テスト削除を承認（DECISIONS.md 記録） |
| `audit:medium-accepted` | 人間 | Medium 指摘への対応判断済み（DECISIONS.md 記録） |
| `audit:human-override` | 人間 | 監査ゲートの上書き（例外。DECISIONS.md 記録必須） |
| `human:continue-fix-loop` | 人間 | 修正ループ上限後の継続を許可 |
| `gate:0`〜`gate:5` | 人間 / AI | 対象 Gate の分類 |

### A-5. Codex 連携（所有者の Codex 設定画面で実施）
- [ ] Codex の GitHub 連携でこのリポジトリへのアクセスを許可し、コードレビューを有効化
- [ ] テストPRで `@codex review` を実行し、レビューが投稿されることを確認
- [ ] 投稿したボットのログイン名を `.github/audit-gate.json` と DECISIONS.md（D-004）に反映
- [ ] 監査結果に `ohuro-audit` ブロックが含まれることを確認（含まれない場合は D-004 の代替案を選択）

#### Codex が `@codex review` に反応しないとき（所有者が確認）
正常時は、Codex が PR に要約コメント（「Codex Review Summary」）を投稿し、実行中は 👀、指摘なしで完了すると 👍 を付ける
（2026-11-17 に PR #6 で確認。D-008）。数分たっても要約コメントが現れない場合は次を順に確認する。
1. Codex の設定画面で、リポジトリ `biccuri5086-hash/ohuro` の Code review が有効になっている
2. GitHub App「ChatGPT Codex Connector」のインストール対象にこのリポジトリが含まれている（GitHub → Settings → Applications）
3. 依頼コメントを投稿した GitHub アカウントが、Codex を使う ChatGPT アカウントと連携している
4. PR が Draft ではない
それでも動かない場合は D-004 の代替案から選び、DECISIONS.md に記録する。

### A-6. 日常運用の注意
- Dependabot など自動作成された PR は、マージ前に base が `main` であることを確認する。
  `main` 以外を base とする PR はブランチ保護・必須チェックの対象外になる（2026-11-17 に発生。D-007）
- 監査依頼後に head を変更すると、それまでの監査は無効になる（Audit Gate は head SHA ごとに判定）

## B. Gate 通過チェック（各 Gate 共通。記録は `docs/gates/GATE_<n>.md`）

- [ ] 完成した機能が Gate の範囲と一致し、範囲外の実装がない
- [ ] 必須テスト（TEST_PLAN.md）が CI で成功している
- [ ] 独立監査で Critical / High が0件、Medium は対応判断済み
- [ ] 未解決問題が一覧化されている
- [ ] 発生した費用が記録されている
- [ ] 次の Gate に進む条件が満たされている
- [ ] 人間の承認が DECISIONS.md に記録されている（AI だけで通過を決めない）

## C. 本番公開チェック

- [ ] 公開の承認（DECISIONS.md）
- [ ] 本番環境と開発環境が分離され、本番キーが CI・開発環境にない
- [ ] 全テーブルの RLS 有効化と RLS テスト成功
- [ ] 写真が端末外へ送信されないことの確認記録（Gate 1 の検証方法による）
- [ ] プライバシーポリシー・利用規約・特定商取引法表記（課金がある場合）の確定
- [ ] 効果・精度を断定する表現がないことの確認（ストア文言・LP・広告を含む）
- [ ] 費用上限・請求アラートの設定
- [ ] ロールバック手順の確認
- [ ] 本番データのバックアップ方針
