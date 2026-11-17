# おふろクエスト

入浴を先延ばしにしがちな一般成人のための、ゲーム型の入浴習慣化アプリ（PWA）。
入浴開始までの心理的・操作的な負担を軽くし、入浴開始までの遅延時間を短くすることを目的とします。

**現在の段階: 開発ハーネス構築**（アプリ機能は未実装）

## 開発体制

| 担当 | 役割 | 規約 |
|---|---|---|
| Claude Code | 主開発（実装・テスト・PR作成・指摘修正） | [CLAUDE.md](CLAUDE.md) |
| Codex | 独立監査（PR差分・要件・セキュリティ・不正対策） | [AGENTS.md](AGENTS.md) |
| GitHub Actions | 機械的な品質検査 | [.github/workflows](.github/workflows) |
| 人間（所有者） | 仕様・費用・公開・Gate 通過の最終承認 | [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) |

## 文書

| 文書 | 内容 |
|---|---|
| [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) | 製品要件（確定・仮・未確定） |
| [GAME_DESIGN.md](GAME_DESIGN.md) | ゲーム設計と仮数値 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 技術構成・ハーネス構成図 |
| [SECURITY.md](SECURITY.md) | セキュリティ方針・残存リスク |
| [DATA_HANDLING.md](DATA_HANDLING.md) | データと画像の取り扱い |
| [TEST_PLAN.md](TEST_PLAN.md) | テスト計画 |
| [EXPERIMENT_PLAN.md](EXPERIMENT_PLAN.md) | 需要検証・指標定義 |
| [COST_POLICY.md](COST_POLICY.md) | 費用・実行量の上限 |
| [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) | 初期設定・Gate・公開のチェックリスト |
| [DECISIONS.md](DECISIONS.md) | 決定記録 |
| [docs/gates/](docs/gates) | Gate ごとの記録 |

## ローカル実行

```bash
npm ci
npm run verify   # 型検査・Lint・テスト・秘密情報/ポリシー/マイグレーション検査・ビルド
npm run dev
```

Node.js 22 が必要です（`.nvmrc`）。
