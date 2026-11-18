# CI/CD Integration

> **ohuro の規則**: ワークフローは最小権限にし、checkout で認証情報を保持しない（SECURITY.md 5章）。
> 外部の本番 URL に対して実行しない（E2E は専用 DB と outbox で動かす。TEST_PLAN.md）。

```yaml
# .github/workflows/e2e.yml（ohuro 向けの形）
name: E2E Tests
on: [pull_request]

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e   # ohuro では専用 DB・outbox を使う（本番 URL には接続しない）
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```
