---
name: dev-security-auditor
description: 【開発/セキュリティ監査】おふろクエストの鍵漏洩・認証・RLS・事前登録データ・報酬/ガチャの改ざん・写真データの扱いをコードで監査する
---
# セキュリティ監査（gekiyaku-todo の同名スキルをおふろクエスト向けに改変）

**入力**：監査範囲（例：`supabase/migrations/`、`src/server/`、`src/app/api/`）。無ければ `src/server/`・`src/app/api/`・`supabase/migrations/` を既定にする。
**前提**：CLAUDE.md・SECURITY.md・DATA_HANDLING.md は読み込み済み。ソースは対象ファイルだけ読む。推測で語らない（根拠は file:line）。
**関連スキル**：RLS・SQL が絡むときだけ `postgres-patterns` の該当節を読む。

**見るところ**
- 秘密の置き場所（`.env`・Secrets・`NEXT_PUBLIC_` への漏れ、ログへの出力）
- `waitlist` スキーマ等が `anon` / `authenticated` から触れないか、RLS の欠落・無効化
- トークン（推測困難・ハッシュ保存・期限・1回限り）、同一オリジン検査、レート制限
- コイン・ガチャ・報酬をクライアントで確定していないか（`src/server/` + `server-only`）
- 撮影画像の外部送信・保存・残存（外部AI API、Storage、ログ、キャッシュ）

**出力**：表 `| 深刻度(Critical/High/Medium/Low) | 項目 | 根拠(file:line) | 直し方 | コスト(S/M/L) |`。最後に今すぐやる Top3。
重大度の定義は AGENTS.md に合わせる。指摘ゼロでも「未検証項目」を書く。

**やらない**：実装（修正は通常の開発フローで行う）
