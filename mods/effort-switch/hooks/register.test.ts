import { expect, test } from 'claude-code/testing'

const STEP = {
  turnId: 't1',
  index: 0,
  model: 'original-model',
  effort: 'medium',
  messageCount: 1,
} as const

type Seen = { model: string; effort: unknown }

// 土台（エンジン）の代わり：届いた model と effort を記録する。
function standIn(on: any, seen: Seen[]) {
  on('command.register', () => ({ value: { command: 'mode' } }))
  on('ui.status', () => ({ value: undefined }))
  on('turn.step', async function* (_: unknown, e: { turnId: string; index: number; model: string; effort?: unknown }) {
    seen.push({ model: e.model, effort: e.effort })

    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: null, usage: null }
  })
}

async function step($: any, input: Record<string, unknown> = STEP) {
  for await (const chunk of $.turn.step(input)) void chunk
}

test('初期値（自動）は、言葉が当てはまるまで、何も変えない', async ($, on) => {
  const seen: Seen[] = []
  standIn(on, seen)

  await step($)

  expect(seen[0]).toEqual({ model: 'original-model', effort: 'medium' })
})

test('/mode 台本 → opus / xhigh', async ($, on) => {
  const seen: Seen[] = []
  standIn(on, seen)

  await $.command.run({ command: 'mode', args: '台本' })
  await step($)

  expect(seen[0]).toEqual({ model: 'opus', effort: 'xhigh' })
})

test('モデルに合わせて、エフォートが変わる（sonnet は high まで、haiku は送らない）', async ($, on) => {
  const seen: Seen[] = []
  standIn(on, seen)

  await $.command.run({ command: 'mode', args: '台本 sonnet' })
  await step($)
  await $.command.run({ command: 'mode', args: '台本 haiku' })
  await step($)

  expect(seen[0]).toEqual({ model: 'sonnet', effort: 'high' })
  expect(seen[1].model).toBe('haiku')
  // haiku にはエフォートを指定しない（上書きしない）。元の値は、対応しないモデルならエンジンが送らない（API資料）
  expect(seen[1].effort).toBe('medium')
})

test('調査は sonnet / medium、軽作業は haiku', async ($, on) => {
  const seen: Seen[] = []
  standIn(on, seen)

  await $.command.run({ command: 'mode', args: '調査' })
  await step($)
  await $.command.run({ command: 'mode', args: '軽作業' })
  await step($)

  expect(seen[0]).toEqual({ model: 'sonnet', effort: 'medium' })
  expect(seen[1].model).toBe('haiku')
})

test('fable は使わない', async ($, on) => {
  const seen: Seen[] = []
  standIn(on, seen)

  const r = await $.command.run({ command: 'mode', args: '台本 fable' })
  await step($)

  expect(r.text).toContain('fable は使いません')
  expect(seen[0]).toEqual({ model: 'original-model', effort: 'medium' })
})

test('サブエージェントには触らない', async ($, on) => {
  const seen: Seen[] = []
  standIn(on, seen)

  await $.command.run({ command: 'mode', args: '台本' })
  await step($, { ...STEP, agentId: 'agent-1' })

  expect(seen[0]).toEqual({ model: 'original-model', effort: 'medium' })
})

test('/mode 通常 で、もとに戻る', async ($, on) => {
  const seen: Seen[] = []
  standIn(on, seen)

  await $.command.run({ command: 'mode', args: '台本' })
  await $.command.run({ command: 'mode', args: '通常' })
  await step($)

  expect(seen[0]).toEqual({ model: 'original-model', effort: 'medium' })
})

test('「/mode /mode 調査」と打っても通る', async ($, on) => {
  const seen: Seen[] = []
  standIn(on, seen)

  const r = await $.command.run({ command: 'mode', args: '/mode 調査' })
  await step($)

  expect(r.text).toContain('切り替えました')
  expect(seen[0]).toEqual({ model: 'sonnet', effort: 'medium' })
})

test('自動：「台本」を含む依頼で opus / xhigh、「調査」で sonnet / medium', async ($, on) => {
  const seen: Seen[] = []
  standIn(on, seen)
  on('prompt.submit', (_: unknown, e: { text: string }) => ({ text: e.text }))

  await $.prompt.submit({ text: 'ZERO観察日誌の台本を書いて' })
  await step($)
  await $.prompt.submit({ text: '競合を調査してください' })
  await step($)

  expect(seen[0]).toEqual({ model: 'opus', effort: 'xhigh' })
  expect(seen[1]).toEqual({ model: 'sonnet', effort: 'medium' })
})
