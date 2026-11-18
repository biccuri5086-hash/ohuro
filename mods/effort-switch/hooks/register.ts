import type { Register } from 'claude-code'

// 作業に合わせて、モデルとエフォートを切り替える。
//
// 使い方：
//   /mode                  今のモードと使い方を表示
//   /mode 台本             台本・企画（既定：opus）
//   /mode 調査             調査・設計（既定：sonnet）
//   /mode 軽作業           通知の確認・コミット・整理（既定：haiku）
//   /mode 通常             切り替えをやめる（何も変えない）
//   /mode auto             直近の依頼の言葉から、自動で選ぶ（初期値）
//   /mode 台本 sonnet      モデルを指定する（opus | sonnet | haiku）
//   /mode 台本 high        エフォートを指定する（low|medium|high|xhigh|max）
//
// 初期値は「自動」（株主の指示 2026-11-11）。依頼の言葉が当てはまるまでは、何も変えない。
// 安全：サブエージェントには触らない。失敗したら、元のまま送る。
// モードは、再読み込み・新しいセッションで「自動」に戻る。

// 株主の指定（2026-11-11）：fable 以外なら使ってよい。モデルに合わせて、エフォートも変える。
type Family = 'opus' | 'sonnet' | 'haiku'
type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
type Job = 'script' | 'research' | 'light'

const FAMILIES: readonly Family[] = ['opus', 'sonnet', 'haiku']
const BLOCKED = /fable/i // 使わない

const JOBS: Record<Job, { label: string; model: Family; want: Effort }> = {
  script: { label: '台本・企画', model: 'opus', want: 'xhigh' },
  research: { label: '調査・設計', model: 'sonnet', want: 'medium' },
  light: { label: '軽作業', model: 'haiku', want: 'low' },
}

// モデルごとに、送るエフォートの上限（想定。公式では未確認）。
// 上限を超える希望は、上限まで下げる。undefined＝エフォートを送らない。
// エンジンも、対応しないモデルには自動で下げる／送らない（API資料）。
const CAP: Record<Family, Effort | undefined> = {
  opus: 'max',
  sonnet: 'high',
  haiku: undefined,
}

const ORDER: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

const ALIAS: Record<string, Job | 'normal' | 'auto'> = {
  normal: 'normal',
  通常: 'normal',
  off: 'normal',
  script: 'script',
  台本: 'script',
  企画: 'script',
  research: 'research',
  調査: 'research',
  設計: 'research',
  light: 'light',
  軽作業: 'light',
  auto: 'auto',
  自動: 'auto',
}

// モデルに合わせて、エフォートを決める。
function fit(family: Family, want: Effort): Effort | undefined {
  const cap = CAP[family]
  if (cap === undefined) return undefined
  return ORDER.indexOf(want) > ORDER.indexOf(cap) ? cap : want
}

// 自動（auto）のときの判断。台本 > 調査 > 軽作業 の順に優先する。
// どれにも当たらないときは、直前のモードのまま。
function classify(text: string): Job | undefined {
  if (/台本|脚本|企画|あらすじ|セリフ|ストーリー|コント|面白/.test(text)) return 'script'
  if (/調査|検索|設計|分析|比較|リサーチ|案を出/.test(text)) return 'research'
  if (/コミット|push|プッシュ|通知|ステータス|一覧|整理|確認して/.test(text)) return 'light'
  return undefined
}

export const register: Register = on => {
  let mode: Job | 'normal' | 'auto' = 'auto' // 初期値は自動
  let autoJob: Job | undefined // auto のとき、直近に選ばれた作業
  let modelOverride: Family | undefined
  let effortOverride: Effort | undefined

  // 今、実際に送る内容（通常のときは undefined＝何も変えない）
  const plan = (): { label: string; model: Family; effort: Effort | undefined } | undefined => {
    const job = mode === 'auto' ? autoJob : mode === 'normal' ? undefined : mode
    if (job === undefined) return undefined
    const spec = JOBS[job]
    const model = modelOverride ?? spec.model
    return { label: spec.label, model, effort: fit(model, effortOverride ?? spec.want) }
  }

  const statusText = (): string | undefined => {
    const p = plan()
    if (p === undefined) return mode === 'auto' ? 'モード：自動（まだ判断なし）' : undefined
    const head = mode === 'auto' ? `自動→${p.label}` : p.label
    return `モード：${head} / ${p.model} / ${p.effort ?? 'エフォートなし'}`
  }

  const usage = (): string =>
    [
      `今：${statusText() ?? '通常（切り替えなし）'}`,
      '使い方：/mode 台本 | 調査 | 軽作業 | 通常 | auto  ［opus|sonnet|haiku］［low|medium|high|xhigh|max］',
      ...(Object.keys(JOBS) as Job[]).map(job => {
        const s = JOBS[job]
        return `${s.label}＝${s.model}/${fit(s.model, s.want) ?? 'エフォートなし'}`
      }),
      `モデル別のエフォート上限：${FAMILIES.map(f => `${f}=${CAP[f] ?? 'なし'}`).join('、')}`,
      'fable は使いません。',
    ].join('\n')

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'mode',
      description:
        '作業に合わせて切り替える：/mode 台本|調査|軽作業|通常|auto [opus|sonnet|haiku] [low|medium|high|xhigh|max]',
    })
    $.ui.status(statusText())

    return next(e)
  })

  on('command.run', { command: 'mode' }, ($, e) => {
    const words = e.args.trim().split(/\s+/).filter(Boolean)
    if (words[0]?.toLowerCase() === '/mode') words.shift() // 「/mode /mode 調査」と打っても通す
    if (words.length === 0) return { text: usage() }

    const key = ALIAS[words[0].toLowerCase()]
    if (key === undefined) return { text: `分かりません：${words[0]}\n${usage()}` }

    let model: Family | undefined
    let effort: Effort | undefined
    for (const word of words.slice(1)) {
      const w = word.toLowerCase()
      if (BLOCKED.test(w)) return { text: `fable は使いません。\n${usage()}` }
      if ((FAMILIES as readonly string[]).includes(w)) model = w as Family
      else if ((ORDER as readonly string[]).includes(w)) effort = w as Effort
      else return { text: `分かりません：${word}\n${usage()}` }
    }

    mode = key
    modelOverride = key === 'normal' ? undefined : model
    effortOverride = key === 'normal' ? undefined : effort
    autoJob = undefined
    $.ui.status(statusText())

    return { text: `切り替えました。\n${usage()}` }
  })

  // 自動（auto）：人が打った依頼の言葉から、作業を選ぶ。通知などの見えない入力は見ない。
  on('prompt.submit', ($, e, next) => {
    if (mode === 'auto' && e.isMeta !== true && e.command === undefined) {
      const hit = classify(e.text)
      if (hit !== undefined && hit !== autoJob) {
        autoJob = hit
        $.ui.status(statusText())
      }
    }

    return next(e)
  }).catch(($, e, next) => next(e)) // 失敗しても、入力は止めない

  // モデルへの各リクエストの直前に、モデルとエフォートを差し替える（ストリーム形式）。
  // 差し替えは次のステップに引き継がれないので、毎回ここで決める。
  on('turn.step', async function* ($, e, next) {
    let send = e
    try {
      const p = e.agentId === undefined ? plan() : undefined // サブエージェントには触らない
      if (p !== undefined && !BLOCKED.test(p.model)) {
        send = { ...e, model: p.model, ...(p.effort !== undefined ? { effort: p.effort } : {}) }
      }
    } catch {
      send = e // 失敗したら、元のまま
    }

    return yield* next(send)
  })
}
