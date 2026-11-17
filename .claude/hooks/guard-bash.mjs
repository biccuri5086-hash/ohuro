#!/usr/bin/env node
// Claude Code PreToolUse フック（Bash）。
// 禁止操作は deny、人間の確認が必要な操作は ask を返す。判定は evaluateCommand() に集約しテストする。
// これは多層防御の1層であり、GitHub 側の保護設定・CI・監査の代替ではない。

import { fileURLToPath } from "node:url";

/** @type {{id: string, decision: "deny"|"ask", re: RegExp, reason: string}[]} */
export const RULES = [
  {
    id: "force-push",
    decision: "deny",
    re: /\bgit\b[^;&|]*\bpush\b[^;&|]*(?:\s--force(?:-with-lease|-if-includes)?\b|\s-[a-zA-Z]*f\b|\s\+[\w/:.-]+)/,
    reason: "強制Pushは禁止です。必要な場合は人間が実施します。",
  },
  {
    id: "push-protected-branch",
    decision: "deny",
    re: /\bgit\b[^;&|]*\bpush\b[^;&|]*(?:\s|:)(?:refs\/heads\/)?(?:main|master|production|release)\b(?![\w/-])/,
    reason: "main 等の保護ブランチへの直接Pushは禁止です。PR を作成してください。",
  },
  {
    id: "no-verify",
    decision: "deny",
    re: /\bgit\b[^;&|]*\s--no-verify\b/,
    reason: "検査の回避（--no-verify）は禁止です。",
  },
  {
    id: "delete-remote-branch",
    decision: "deny",
    re: /\bgit\b[^;&|]*\bpush\b[^;&|]*(?:\s--delete\b|\s-d\b|\s:[\w/.-]+)/,
    reason: "リモートブランチの削除は人間の承認が必要です。",
  },
  {
    id: "rm-root",
    decision: "deny",
    re: /\brm\s+(?:-[a-zA-Z]*\s+)*(?:\/|~|\$HOME|\.git)(?:\s|$|\/\s|\/$)/,
    reason: "ルート・ホーム・.git の削除は禁止です。",
  },
  {
    id: "publish",
    decision: "deny",
    re: /\b(?:npm|pnpm|yarn)\s+publish\b/,
    reason: "パッケージ公開は禁止です。",
  },
  {
    id: "production-deploy",
    decision: "deny",
    re: /\bvercel\b[^;&|]*(?:\s--prod\b|\sdeploy\b[^;&|]*--prod|\spromote\b)|\bnetlify\s+deploy\b[^;&|]*--prod/,
    reason: "本番公開は人間の承認が必要です（RELEASE_CHECKLIST.md）。",
  },
  {
    id: "supabase-remote-write",
    decision: "deny",
    re: /\bsupabase\s+(?:db\s+push|db\s+reset\s+[^;&|]*--linked|projects\s+(?:create|delete)|secrets\s+set|functions\s+deploy|orgs\s+create|branches\s+(?:create|delete))/,
    reason: "Supabase リモート環境への書き込み・課金を伴う操作は人間の承認が必要です。",
  },
  {
    id: "read-env-file",
    decision: "deny",
    re: /(?:^|[\s;&|])(?:cat|less|more|head|tail|bat|grep|rg|sed|awk|cp|scp|curl)\b[^;&|]*(?:^|\s|\/)\.env(?:\.(?!example\b)[\w.-]+)?(?:\s|$)/,
    reason: ".env の内容表示・送信は禁止です（秘密情報）。",
  },
  {
    id: "print-secrets-env",
    decision: "deny",
    re: /(?:^|[\s;&|])(?:printenv|env)\s*(?:$|[;&|])|\becho\b[^;&|]*\$\{?[A-Z_]*(?:KEY|TOKEN|SECRET|PASSWORD)\b/,
    reason: "環境変数の秘密情報を出力してはいけません。",
  },
  {
    id: "gh-protection-change",
    decision: "deny",
    re: /\bgh\s+api\b[^;&|]*(?:-X\s*|--method\s+)(?:PUT|PATCH|DELETE|POST)\b[^;&|]*(?:protection|rulesets|collaborators|\/actions\/permissions|\/secrets)/i,
    reason: "保護設定・権限・Secrets の変更は人間が行います。",
  },
  {
    id: "hard-reset-remote",
    decision: "ask",
    re: /\bgit\s+reset\s+--hard\b/,
    reason: "未コミットの変更が失われる可能性があります。",
  },
  {
    id: "git-clean",
    decision: "ask",
    re: /\bgit\s+clean\b[^;&|]*-[a-zA-Z]*f/,
    reason: "未追跡ファイルが削除されます。",
  },
  {
    id: "remove-tests",
    decision: "ask",
    re: /\b(?:git\s+rm|rm)\b[^;&|]*(?:\btests?\/|\.test\.|\.spec\.)/,
    reason: "テストの削除は人間の承認（approved:test-removal）が必要です。",
  },
  {
    id: "curl-pipe-shell",
    decision: "ask",
    re: /\b(?:curl|wget)\b[^|]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/,
    reason: "取得したスクリプトの直接実行は確認が必要です。",
  },
];

/** @returns {{decision: "allow"|"deny"|"ask", rule?: string, reason?: string}} */
export function evaluateCommand(command) {
  if (typeof command !== "string" || command.trim() === "") return { decision: "allow" };
  let ask;
  for (const rule of RULES) {
    if (rule.re.test(command)) {
      if (rule.decision === "deny") return { decision: "deny", rule: rule.id, reason: rule.reason };
      ask ??= { decision: "ask", rule: rule.id, reason: rule.reason };
    }
  }
  return ask ?? { decision: "allow" };
}

async function readStdin() {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const raw = await readStdin();
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0); // 入力が読めない場合は他の防御層に委ねる
  }
  const result = evaluateCommand(input?.tool_input?.command);
  if (result.decision !== "allow") {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: result.decision,
          permissionDecisionReason: `[ohuro-guard:${result.rule}] ${result.reason}`,
        },
      }),
    );
  }
  process.exit(0);
}
