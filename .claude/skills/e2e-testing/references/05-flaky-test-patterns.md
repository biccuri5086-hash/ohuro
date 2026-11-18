# Flaky Test Patterns

> **ohuro の規則（必ず先に読む）**: テストの skip・fixme・隔離（quarantine）は、人間の承認と
> `policy:allow-skip D-xxx`（DECISIONS.md の記録番号）がなければ行わない（CLAUDE.md 2章・3章、11番「テスト削除による CI 成功」の禁止）。
> 未承認なら隔離はせず、下の「原因を直す」を行い、PR に原因と選択肢を書いて人間に判断を求める。
> CI を通すために不安定なテストを外すことは、このプロジェクトでは行わない。

### Quarantine（承認済みの場合のみ）

```typescript
// 承認番号（DECISIONS.md）を必ず書く。承認がない限りこの形は使わない
test('complex search', async ({ page }) => {
  test.fixme(true, 'policy:allow-skip D-xxx — flaky, Issue #123') // 承認: D-xxx
  // test code...
})
```


### Identify Flakiness

```bash
npx playwright test tests/search.spec.ts --repeat-each=10
npx playwright test tests/search.spec.ts --retries=3
```

### Common Causes & Fixes

**Race conditions:**
```typescript
// Bad: assumes element is ready
await page.click('[data-testid="button"]')

// Good: auto-wait locator
await page.locator('[data-testid="button"]').click()
```

**Network timing:**
```typescript
// Bad: arbitrary timeout
await page.waitForTimeout(5000)

// Good: wait for specific condition
await page.waitForResponse(resp => resp.url().includes('/api/data'))
```

**Animation timing:**
```typescript
// Bad: click during animation
await page.click('[data-testid="menu-item"]')

// Good: wait for stability
await page.locator('[data-testid="menu-item"]').waitFor({ state: 'visible' })
await page.waitForLoadState('networkidle')
await page.locator('[data-testid="menu-item"]').click()
```
