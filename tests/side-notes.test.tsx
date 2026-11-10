import { expect, mock, test } from 'claude-code/testing'

import { parseNote, readReply } from '../hooks/parse'
import { checkPrompt } from '../hooks/prompt'

const ANSWER = JSON.stringify({
  topic: 'unpushed local build',
  note: 'The new build is only on this Mac, so a teammate will not see it yet.',
  kind: 'check',
  detail: '**Build only on this Mac**\n* Nothing was pushed.',
})

const nth = (topic: string, note: string) => JSON.stringify({ topic, note, kind: 'fyi', detail: '' })

const BAND = {
  plugin: 'side-notes',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 80 },
} as const

const settle = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve()
}

// Steps are counted across turns: step($, n) runs main-agent steps until this
// test has run n of them in all.
const counts = new WeakMap<object, number>()
const step = async ($: any, upTo: number) => {
  for (let n = counts.get($) ?? 0; n < upTo; n++) {
    const s = $.turn.step({ turnId: 't1', index: n % 3, model: 'm', messageCount: 3 })
    for await (const _ of s) void _
    counts.set($, n + 1)
    await settle()
  }
  await settle()
}

test('parses the JSON note, with or without fences', async () => {
  const note = parseNote(ANSWER)
  expect(note?.line).toBe('The new build is only on this Mac, so a teammate will not see it yet')
  expect(note?.kind).toBe('check')
  expect(note?.topic).toBe('unpushed local build')
  expect(note?.explanation).toContain('Nothing was pushed')
  expect(parseNote('```json\n' + ANSWER + '\n```')?.kind).toBe('check')
  expect(parseNote('{"note": null}')).toBe(null)
  expect('isNothing' in readReply('```json\n{"note": null}\n```')).toBe(true)
  expect('isNothing' in readReply('{"note": "none"}')).toBe(true)
  expect('isUnread' in readReply('Note: something')).toBe(true)
  expect('isUnread' in readReply('{"note": "x", ')).toBe(true)
  // An unknown kind reads as fyi; a missing topic falls back to the note.
  const plain = parseNote('{"note": "Uma nota em português.", "kind": "other"}')
  expect(plain?.kind).toBe('fyi')
  expect(plain?.topic).toBe('Uma nota em português')
})

test('in the app, step 6 runs the side check and shows the note', async ($, on) => {
  let forks = 0
  mock.store(on)
  on('session.id', async () => ({ value: 's1' }) as never)
  on('session.cwd', async () => ({ value: '/proj' }) as never)
  on('clock.now', async () => ({ value: 1_000 }) as never)
  on('session.surfaces', async () => ({ value: ['desktop'] }) as never)
  on('model.fork', async () => {
    forks += 1
    return { value: { isAnswered: true, text: ANSWER } } as never
  })
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never
  })
  // Stands for the engine's own band when the mod has nothing to show.
  on('ui.render', async (_$, e) => {
    const { Text } = _$.ui.resolve(e)
    return <Text key="engine">engine</Text>
  })
  await step($, 5)
  expect(forks).toBe(0)
  await step($, 6)
  expect(forks).toBe(1)
  // The check runs in the background, after the step: let it finish.
  for (let i = 0; i < 40; i++) await settle()

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  expect(await ui.find({ type: 'Text', text: /only on this Mac/ } as never)).toBeDefined()
  await ui.press({ key: 'more' } as never)
  expect(await ui.find({ type: 'Markdown', text: /Nothing was pushed/ } as never)).toBeDefined()
  await ui.press({ key: 'got' } as never)
  expect(await ui.find({ type: 'Text', text: /^✦.*only on this Mac/ } as never)).toBeUndefined()
  await ui.unmount()
})

test('in the app, Copy copies the note and Chat about it sends it to the session', async ($, on) => {
  const copied: string[] = []
  const sent: string[] = []
  mock.store(on)
  on('session.id', async () => ({ value: 's1' }) as never)
  on('session.cwd', async () => ({ value: '/proj' }) as never)
  on('clock.now', async () => ({ value: 1_000 }) as never)
  on('session.surfaces', async () => ({ value: ['desktop'] }) as never)
  on('model.fork', async () => ({ value: { isAnswered: true, text: ANSWER } }) as never)
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never
  })
  on('ui.copy', async (_$, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } } as never
  })
  on('ui.toast', async () => ({ value: undefined }) as never)
  on('prompt.submit', async (_$, e) => {
    sent.push(e.text ?? '')
    return { text: e.text ?? '' } as never
  })
  on('ui.render', async (_$, e) => {
    const { Text } = _$.ui.resolve(e)
    return <Text key="engine">engine</Text>
  })
  await step($, 6)
  for (let i = 0; i < 40; i++) await settle()

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  await ui.press({ key: 'more' } as never)
  await ui.press({ key: 'copy' } as never)
  await settle()
  expect(copied[0]).toContain('only on this Mac')
  expect(copied[0]).toContain('Nothing was pushed')
  await ui.press({ key: 'chat' } as never)
  await settle()
  expect(sent[0]).toContain('only on this Mac')
  expect(await ui.find({ type: 'Text', text: /^✦.*only on this Mac/ } as never)).toBeUndefined()
  await ui.unmount()
})

test('in a terminal it never runs the side check', async ($, on) => {
  let forks = 0
  mock.store(on)
  on('session.id', async () => ({ value: 's1' }) as never)
  on('session.cwd', async () => ({ value: '/proj' }) as never)
  on('clock.now', async () => ({ value: 1_000 }) as never)
  on('session.surfaces', async () => ({ value: ['terminal'] }) as never)
  on('model.fork', async () => {
    forks += 1
    return { value: { isAnswered: true, text: ANSWER } } as never
  })
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never
  })
  await step($, 6)
  await step($, 12)
  expect(forks).toBe(0)
})

test('after a prompt from the phone, Claude gets the note with the next phone prompt', async ($, on) => {
  const seen: string[] = []
  mock.store(on)
  on('session.id', async () => ({ value: 's1' }) as never)
  on('session.cwd', async () => ({ value: '/proj' }) as never)
  on('clock.now', async () => ({ value: 1_000 }) as never)
  on('session.surfaces', async () => ({ value: ['desktop'] }) as never)
  on('model.fork', async () => ({ value: { isAnswered: true, text: ANSWER } }) as never)
  on('prompt.submit', async (_$, e) => {
    seen.push(JSON.stringify(e.context ?? []))
    return { text: e.text } as never
  })
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never
  })
  await $.prompt.submit({ text: 'hi', origin: { kind: 'bridge' } } as never)
  await step($, 6)
  for (let i = 0; i < 40; i++) await settle()
  await $.prompt.submit({ text: 'next', origin: { kind: 'bridge' } } as never)
  expect(seen[0]).not.toContain('only on this Mac')
  expect(seen[1]).toContain('only on this Mac')
  await $.prompt.submit({ text: 'third', origin: { kind: 'bridge' } } as never)
  expect(seen[2]).not.toContain('only on this Mac')
})

test('on the phone, a reply of 2 marks the note as known and Claude is told', async ($, on) => {
  const seen: string[] = []
  const forkPrompts: string[] = []
  mock.store(on)
  on('session.id', async () => ({ value: 's1' }) as never)
  on('session.cwd', async () => ({ value: '/proj' }) as never)
  on('clock.now', async () => ({ value: 1_000 }) as never)
  on('session.surfaces', async () => ({ value: ['desktop'] }) as never)
  on('model.fork', async (_$, e) => {
    forkPrompts.push(String((e as any).prompt))
    return { value: { isAnswered: true, text: ANSWER } } as never
  })
  on('prompt.submit', async (_$, e) => {
    seen.push(JSON.stringify(e.context ?? []))
    return { text: e.text } as never
  })
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never
  })
  await $.prompt.submit({ text: 'hi', origin: { kind: 'bridge' } } as never)
  await step($, 6)
  for (let i = 0; i < 40; i++) await settle()
  await $.prompt.submit({ text: 'next', origin: { kind: 'bridge' } } as never)
  expect(seen[1]).toContain('1 learn more')
  for (const text of ['a', 'b', 'c']) await $.prompt.submit({ text, origin: { kind: 'bridge' } } as never)
  await $.prompt.submit({ text: ' 2 ', origin: { kind: 'bridge' } } as never)
  expect(seen[5]).toContain('knew it already')
  // A later 2 is just a message.
  await $.prompt.submit({ text: '2', origin: { kind: 'bridge' } } as never)
  expect(seen[6]).not.toContain('side note')
  // The next check tells the side check the topic is known.
  await step($, 12)
  for (let i = 0; i < 40; i++) await settle()
  expect(forkPrompts[1]).toContain('unpushed local build')
})

test('on the phone, any other reply lets the note go after five prompts', async ($, on) => {
  const seen: string[] = []
  mock.store(on)
  on('session.id', async () => ({ value: 's1' }) as never)
  on('session.cwd', async () => ({ value: '/proj' }) as never)
  on('clock.now', async () => ({ value: 1_000 }) as never)
  on('session.surfaces', async () => ({ value: ['desktop'] }) as never)
  on('model.fork', async () => ({ value: { isAnswered: true, text: ANSWER } }) as never)
  on('prompt.submit', async (_$, e) => {
    seen.push(JSON.stringify(e.context ?? []))
    return { text: e.text } as never
  })
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never
  })
  await $.prompt.submit({ text: 'hi', origin: { kind: 'bridge' } } as never)
  await step($, 6)
  for (let i = 0; i < 40; i++) await settle()
  await $.prompt.submit({ text: 'next', origin: { kind: 'bridge' } } as never)
  for (const text of ['a', 'b', 'c', 'd', 'e']) await $.prompt.submit({ text, origin: { kind: 'bridge' } } as never)
  await $.prompt.submit({ text: '1', origin: { kind: 'bridge' } } as never)
  expect(seen[2]).not.toContain('side note')
  expect(seen[7]).not.toContain('side note')
})

test('/side-notes off stops the checks', async ($, on) => {
  let forks = 0
  mock.store(on)
  on('session.id', async () => ({ value: 's1' }) as never)
  on('session.cwd', async () => ({ value: '/proj' }) as never)
  on('clock.now', async () => ({ value: 1_000 }) as never)
  on('session.surfaces', async () => ({ value: ['desktop'] }) as never)
  on('model.fork', async () => {
    forks += 1
    return { value: { isAnswered: true, text: ANSWER } } as never
  })
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never
  })
  await $.command.run({ command: 'side-notes', args: 'off' } as never)
  await step($, 6)
  for (let i = 0; i < 40; i++) await settle()
  expect(forks).toBe(0)
})

// Shared setup for the lost-chat tests: a store, a clock, and a session whose
// id and start time the test sets.
const lostChatSetup = (on: any, s: { id: string; startedAt: number; now: number }, sent: string[], answers: string[] = [], forkPrompts: string[] = []) => {
  let forks = 0
  mock.store(on)
  on('session.id', async () => ({ value: s.id }) as never)
  on('session.cwd', async () => ({ value: '/jbei' }) as never)
  on('session.usage', async () => ({ value: { startedAt: s.startedAt } }) as never)
  on('clock.now', async () => ({ value: s.now }) as never)
  on('session.surfaces', async () => ({ value: ['desktop'] }) as never)
  // A list of answers gives one per check, in order; none gives ANSWER every time.
  on('model.fork', async (_$: any, e: any) => {
    forkPrompts.push(String(e.prompt))
    return { value: { isAnswered: true, text: answers.length === 0 ? ANSWER : (answers[forks++] ?? '{"note": null}') } } as never
  })
  on('ui.toast', async () => ({ value: undefined }) as never)
  on('turn.step', async function* (_$: any, e: any) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never
  })
  on('prompt.submit', async (_$: any, e: any) => {
    sent.push(`${e.text}\n${JSON.stringify(e.context ?? [])}`)
    return { text: e.text } as never
  })
  on('ui.render', async (_$: any, e: any) => {
    const { Text } = _$.ui.resolve(e)
    return <Text key="engine">engine</Text>
  })
}

const pressChat = async ($: any) => {
  await step($, 6)
  for (let i = 0; i < 40; i++) await settle()
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  await ui.press({ key: 'chat' } as never)
  for (let i = 0; i < 10; i++) await settle()
  await ui.unmount()
}

test('a chat cleared before its answer reaches the next session in the folder', async ($, on) => {
  const s = { id: 's1', startedAt: 1_000, now: 10_000 }
  const sent: string[] = []
  lostChatSetup(on, s, sent)
  await pressChat($)
  expect(sent[0]).toContain('only on this Mac')
  // The clear lands before the chat's turn answers; a new session starts.
  s.id = 's2'
  s.startedAt = 20_000
  s.now = 25_000
  await $.prompt.submit({ text: 'salvalimpa: retomando', origin: { kind: 'sdk' } } as never)
  expect(sent[1]).toContain('salvalimpa: retomando')
  expect(sent[1]).toContain('Chat about it')
  expect(sent[1]).toContain('only on this Mac')
  // Handed over once: the next prompt in that session carries nothing.
  await $.prompt.submit({ text: 'next', origin: { kind: 'sdk' } } as never)
  expect(sent[2]).not.toContain('Chat about it')
})

test('an answered chat is not handed over again', async ($, on) => {
  const s = { id: 's1', startedAt: 1_000, now: 10_000 }
  const sent: string[] = []
  lostChatSetup(on, s, sent)
  on('turn.start', async (_$: any, e: any) => ({ turnId: e.turnId }) as never)
  on('turn.complete', async (_$: any, e: any) => ({ text: e.answer }) as never)
  await pressChat($)
  await $.turn.start({ turnId: 't9', text: sent[0] } as never)
  await $.turn.complete({ turnId: 't9', reason: 'answer', answer: 'ok', durationMs: 5, isAborted: false } as never)
  s.id = 's2'
  s.startedAt = 20_000
  s.now = 25_000
  await $.prompt.submit({ text: 'hi', origin: { kind: 'sdk' } } as never)
  expect(sent[1]).not.toContain('Chat about it')
})

test('another session already open in the same folder does not get the lost chat', async ($, on) => {
  const s = { id: 's1', startedAt: 1_000, now: 10_000 }
  const sent: string[] = []
  lostChatSetup(on, s, sent)
  await pressChat($)
  // A sibling session that began before the chat was sent.
  s.id = 'sibling'
  s.startedAt = 500
  s.now = 12_000
  await $.prompt.submit({ text: 'hi', origin: { kind: 'sdk' } } as never)
  expect(sent[1]).not.toContain('Chat about it')
})

test('a lost chat older than 45 minutes is dropped', async ($, on) => {
  const s = { id: 's1', startedAt: 1_000, now: 10_000 }
  const sent: string[] = []
  lostChatSetup(on, s, sent)
  await pressChat($)
  s.id = 's2'
  s.startedAt = 20_000
  s.now = 10_000 + 46 * 60_000
  await $.prompt.submit({ text: 'hi', origin: { kind: 'sdk' } } as never)
  expect(sent[1]).not.toContain('Chat about it')
})

test('every note shown is kept: the command lists it and a number opens it again', async ($, on) => {
  const s = { id: 's1', startedAt: 1_000, now: 10_000 }
  const sent: string[] = []
  lostChatSetup(on, s, sent)
  await step($, 6)
  for (let i = 0; i < 40; i++) await settle()
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  await ui.press({ key: 'dismiss' } as never)
  await settle()
  expect(await ui.find({ type: 'Text', text: /^✦.*only on this Mac/ } as never)).toBeUndefined()
  const listed = await $.command.run({ command: 'side-notes', args: '' } as never)
  expect(listed.text).toContain('#1')
  expect(listed.text).toContain('dismissed')
  expect(listed.text).toContain('only on this Mac')
  const opened = await $.command.run({ command: 'side-notes', args: '1' } as never)
  expect(opened.text).toContain('Nothing was pushed')
  await settle()
  expect(await ui.find({ type: 'Markdown', text: /Nothing was pushed/ } as never)).toBeDefined()
  await ui.unmount()
})

test('a note nobody answered comes back in the session after a clear', async ($, on) => {
  const s = { id: 's1', startedAt: 1_000, now: 10_000 }
  const sent: string[] = []
  lostChatSetup(on, s, sent)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: any, e: any) => ({ cwd: e.cwd }) as never)
  await step($, 6)
  for (let i = 0; i < 40; i++) await settle()
  // The clear: a new session in the same folder; the band starts empty.
  s.id = 's2'
  s.now = 20_000
  await $.session.start({ cwd: '/jbei', surface: 'desktop', isInteractive: true } as never)
  await settle()
  const log = await $.command.run({ command: 'side-notes', args: 'log' } as never)
  expect(log.text).toContain('shown again after a clear: #1')
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  expect(await ui.find({ type: 'Text', text: /only on this Mac/ } as never)).toBeDefined()
  await ui.unmount()
})

test('a chat pressed while a turn runs enters that turn with the next tool result', async ($, on) => {
  const s = { id: 's1', startedAt: 1_000, now: 10_000 }
  const sent: string[] = []
  lostChatSetup(on, s, sent)
  on('turn.start', async (_$: any, e: any) => ({ turnId: e.turnId }) as never)
  on('turn.complete', async (_$: any, e: any) => ({ text: e.answer }) as never)
  on('tool.call', async () => ({ result: 'file text', text: 'file text' }) as never)
  await $.turn.start({ turnId: 't1', text: 'long task' } as never)
  await pressChat($)
  // Not queued as a prompt for after the task.
  expect(sent.length).toBe(0)
  const r = await $.tool.call({ tool: 'Read', file_path: 'a.md' } as never)
  expect(JSON.stringify(r.context ?? [])).toContain('only on this Mac')
  const r2 = await $.tool.call({ tool: 'Read', file_path: 'b.md' } as never)
  expect(JSON.stringify(r2.context ?? [])).not.toContain('only on this Mac')
})

test('a chat pressed in the last step of a turn is sent as a prompt when the turn ends', async ($, on) => {
  const s = { id: 's1', startedAt: 1_000, now: 10_000 }
  const sent: string[] = []
  lostChatSetup(on, s, sent)
  on('turn.start', async (_$: any, e: any) => ({ turnId: e.turnId }) as never)
  on('turn.complete', async (_$: any, e: any) => ({ text: e.answer }) as never)
  await $.turn.start({ turnId: 't1', text: 'long task' } as never)
  await pressChat($)
  expect(sent.length).toBe(0)
  await $.turn.complete({ turnId: 't1', reason: 'answer', answer: 'done', durationMs: 5, isAborted: false } as never)
  for (let i = 0; i < 10; i++) await settle()
  expect(sent[0]).toContain('only on this Mac')
})

test('after a clear, every note nobody answered comes back, one after another', async ($, on) => {
  const s = { id: 's1', startedAt: 1_000, now: 10_000 }
  const sent: string[] = []
  lostChatSetup(on, s, sent, [nth('cache', 'First note about the cache'), nth('build', 'Second note about the build'), nth('backup', 'Third note about the backup')])
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: any, e: any) => ({ cwd: e.cwd }) as never)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  // Three notes in the first session: the first two left open, the third dismissed.
  for (const i of [6, 12, 18]) {
    await step($, i)
    for (let k = 0; k < 40; k++) await settle()
    // Each note is pushed out by the person's prompts, unanswered.
    if (i < 18) for (const text of ['a', 'b']) await $.prompt.submit({ text, origin: { kind: 'sdk' } } as never)
  }
  await ui.press({ key: 'dismiss' } as never)
  await settle()
  // The clear: the two open notes come back, the newest first.
  s.id = 's2'
  s.now = 20_000
  await $.session.start({ cwd: '/jbei', surface: 'desktop', isInteractive: true } as never)
  for (let k = 0; k < 10; k++) await settle()
  expect(await ui.find({ type: 'Text', text: /Second note/ } as never)).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1 more note after this one/ } as never)).toBeDefined()
  await ui.press({ key: 'dismiss' } as never)
  await settle()
  expect(await ui.find({ type: 'Text', text: /First note/ } as never)).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /more note/ } as never)).toBeUndefined()
  await ui.press({ key: 'knew' } as never)
  for (let k = 0; k < 5; k++) await settle()
  expect(await ui.find({ type: 'Text', text: /^✦/ } as never)).toBeUndefined()
  await ui.unmount()
})

// Shared setup for the newer tests: counts forks and records their prompts.
const forkSetup = (on: any, surfaces: string[], answers: string[] = []) => {
  const prompts: string[] = []
  mock.store(on)
  on('session.id', async () => ({ value: 's1' }) as never)
  on('session.cwd', async () => ({ value: '/proj' }) as never)
  on('clock.now', async () => ({ value: 1_000 }) as never)
  on('session.surfaces', async () => ({ value: surfaces }) as never)
  on('model.fork', async (_$: any, e: any) => {
    prompts.push(String(e.prompt))
    return { value: { isAnswered: true, text: answers.length === 0 ? '{"note": null}' : (answers[prompts.length - 1] ?? '{"note": null}') } } as never
  })
  on('turn.step', async function* (_$: any, e: any) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never
  })
  on('ui.render', async (_$: any, e: any) => {
    const { Text } = _$.ui.resolve(e)
    return <Text key="engine">engine</Text>
  })
  return prompts
}

test('check_every from /config sets how often it checks', { options: { check_every: 4 } }, async ($, on) => {
  const prompts = forkSetup(on, ['desktop'])
  await step($, 3)
  expect(prompts.length).toBe(0)
  await step($, 4)
  for (let i = 0; i < 40; i++) await settle()
  expect(prompts.length).toBe(1)
})

test('/side-notes every <n> wins over /config and default goes back', async ($, on) => {
  const prompts = forkSetup(on, ['desktop'])
  const set = await $.command.run({ command: 'side-notes', args: 'every 3' } as never)
  expect(set.text).toContain('every 3 steps')
  await step($, 3)
  for (let i = 0; i < 40; i++) await settle()
  expect(prompts.length).toBe(1)
  await step($, 6)
  for (let i = 0; i < 40; i++) await settle()
  expect(prompts.length).toBe(2)
  const bad = await $.command.run({ command: 'side-notes', args: 'every 1' } as never)
  expect(bad.text).toContain('whole number')
  await $.command.run({ command: 'side-notes', args: 'every default' } as never)
  await step($, 11)
  for (let i = 0; i < 40; i++) await settle()
  expect(prompts.length).toBe(2)
  await step($, 12)
  for (let i = 0; i < 40; i++) await settle()
  expect(prompts.length).toBe(3)
})

test('run_in_terminal turns the check and the band on in a terminal', { options: { run_in_terminal: true } }, async ($, on) => {
  const prompts = forkSetup(on, ['terminal'], [ANSWER])
  await step($, 6)
  for (let i = 0; i < 40; i++) await settle()
  expect(prompts.length).toBe(1)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' } as never)
  expect(await ui.find({ type: 'Text', text: /only on this Mac/ } as never)).toBeDefined()
  await ui.unmount()
})

test('a note on a topic already shown is not shown again', async ($, on) => {
  const same = JSON.stringify({ topic: 'Unpushed local build!', note: 'Said in other words.', kind: 'fyi', detail: '' })
  const prompts = forkSetup(on, ['desktop'], [ANSWER, same])
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  await step($, 6)
  for (let i = 0; i < 40; i++) await settle()
  await ui.press({ key: 'dismiss' } as never)
  await step($, 12)
  for (let i = 0; i < 40; i++) await settle()
  expect(prompts.length).toBe(2)
  expect(prompts[1]).toContain('unpushed local build')
  expect(await ui.find({ type: 'Text', text: /other words/ } as never)).toBeUndefined()
  const log = await $.command.run({ command: 'side-notes', args: 'log' } as never)
  expect(log.text).toContain('repeat')
  await ui.unmount()
})

test('the prompt asks for the person\'s language, guards secrets and lists known topics', async () => {
  const p = checkPrompt(['shown topic'], ['known topic'])
  expect(p).toContain('language the person writes in')
  expect(p).toContain('never copy into the note')
  expect(p).toContain('- shown topic')
  expect(p).toContain('- known topic')
  expect(p).toContain('{"note": null}')
  expect(p.split(/\s+/).length).toBeLessThan(1500)
})

// --- Undo ---------------------------------------------------------------

const NOTE_ROW = { type: 'Text', text: /^✦.*only on this Mac/ } as never
const knownPart = (prompt: string): string => prompt.slice(prompt.indexOf('already knew'), prompt.indexOf('Privacy:'))

const undoSetup = async ($: any, on: any, extra?: () => Promise<void>) => {
  const s = { id: 's1', startedAt: 1_000, now: 10_000 }
  const sent: string[] = []
  const forkPrompts: string[] = []
  lostChatSetup(on, s, sent, [ANSWER], forkPrompts)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: any, e: any) => ({ cwd: e.cwd }) as never)
  if (extra !== undefined) await extra()
  await step($, 6)
  for (let i = 0; i < 40; i++) await settle()
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  return { s, sent, forkPrompts, ui }
}

test('undo of Knew it brings the note back and forgets the known topic', async ($, on) => {
  const { forkPrompts, ui } = await undoSetup($, on)
  expect(await ui.find(NOTE_ROW)).toBeDefined()
  await ui.press({ key: 'knew' } as never)
  await settle()
  expect(await ui.find(NOTE_ROW)).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /↩ Knew it/ } as never)).toBeDefined()
  await ui.press({ key: 'undo' } as never)
  for (let i = 0; i < 10; i++) await settle()
  expect(await ui.find(NOTE_ROW)).toBeDefined()
  const listed = await $.command.run({ command: 'side-notes', args: '' } as never)
  expect(listed.text).toContain('· shown ·')
  // Dismiss it so the next check runs, then read what the side check is told.
  await ui.press({ key: 'dismiss' } as never)
  await step($, 12)
  for (let i = 0; i < 40; i++) await settle()
  expect(knownPart(forkPrompts[1] ?? '')).not.toContain('unpushed local build')
  await ui.unmount()
})

test('undo of Dismiss and of Learn more, by command', async ($, on) => {
  const { ui } = await undoSetup($, on)
  await ui.press({ key: 'dismiss' } as never)
  await settle()
  const r = await $.command.run({ command: 'side-notes', args: 'undo' } as never)
  expect(r.text).toContain('Undone: "Dismissed"')
  expect(await ui.find(NOTE_ROW)).toBeDefined()
  expect((await $.command.run({ command: 'side-notes', args: '' } as never)).text).toContain('· shown ·')
  await ui.press({ key: 'more' } as never)
  await settle()
  expect(await ui.find({ type: 'Markdown', text: /Nothing was pushed/ } as never)).toBeDefined()
  const r2 = await $.command.run({ command: 'side-notes', args: 'undo' } as never)
  expect(r2.text).toContain('Undone: "Learn more"')
  expect(await ui.find(NOTE_ROW)).toBeDefined()
  // Nothing left to undo.
  expect((await $.command.run({ command: 'side-notes', args: 'undo' } as never)).text).toBe('Nothing to undo.')
  await ui.unmount()
})

test('undo after the window is refused', async ($, on) => {
  const { s, ui } = await undoSetup($, on)
  await ui.press({ key: 'knew' } as never)
  await settle()
  s.now += 5 * 60_000 + 1
  const r = await $.command.run({ command: 'side-notes', args: 'undo' } as never)
  expect(r.text).toContain('Too late')
  expect(await ui.find(NOTE_ROW)).toBeUndefined()
  // The Undo row is gone too.
  expect(await ui.find({ type: 'Text', text: /↩/ } as never)).toBeUndefined()
  await ui.unmount()
})

test('undo_minutes sets the window', { options: { undo_minutes: 1 } }, async ($, on) => {
  const { s, ui } = await undoSetup($, on)
  await ui.press({ key: 'dismiss' } as never)
  await settle()
  s.now += 61_000
  expect((await $.command.run({ command: 'side-notes', args: 'undo' } as never)).text).toContain('1 minutes')
  await ui.unmount()
})

test('undo of a chat already sent says it cannot be taken back', async ($, on) => {
  const { sent, ui } = await undoSetup($, on)
  await ui.press({ key: 'chat' } as never)
  for (let i = 0; i < 10; i++) await settle()
  expect(sent[0]).toContain('only on this Mac')
  const r = await $.command.run({ command: 'side-notes', args: 'undo' } as never)
  expect(r.text).toContain('already been sent')
  expect(await ui.find(NOTE_ROW)).toBeDefined()
  await ui.unmount()
})

test('undo of a chat still waiting for the running turn stops it', async ($, on) => {
  const { sent, ui } = await undoSetup($, on, async () => {
    on('turn.start', async (_$: any, e: any) => ({ turnId: e.turnId }) as never)
    on('turn.complete', async (_$: any, e: any) => ({ text: e.answer }) as never)
    on('tool.call', async () => ({ result: 'file text', text: 'file text' }) as never)
    await $.turn.start({ turnId: 't1', text: 'long task' } as never)
  })
  await ui.press({ key: 'chat' } as never)
  for (let i = 0; i < 10; i++) await settle()
  const r = await $.command.run({ command: 'side-notes', args: 'undo' } as never)
  expect(r.text).toContain('will not be sent')
  const call = await $.tool.call({ tool: 'Read', file_path: 'a.md' } as never)
  expect(JSON.stringify(call.context ?? [])).not.toContain('only on this Mac')
  await $.turn.complete({ turnId: 't1', reason: 'answer', answer: 'done', durationMs: 5, isAborted: false } as never)
  for (let i = 0; i < 10; i++) await settle()
  expect(sent.length).toBe(0)
  await ui.unmount()
})

test('undo survives a clear: the next session can still take the answer back', async ($, on) => {
  const { s, ui } = await undoSetup($, on)
  await ui.press({ key: 'knew' } as never)
  await settle()
  s.id = 's2'
  s.now = 20_000
  await $.session.start({ cwd: '/jbei', surface: 'desktop', isInteractive: true } as never)
  for (let i = 0; i < 10; i++) await settle()
  expect(await ui.find({ type: 'Text', text: /↩ Knew it/ } as never)).toBeDefined()
  expect((await $.command.run({ command: 'side-notes', args: 'undo' } as never)).text).toContain('Undone')
  expect(await ui.find(NOTE_ROW)).toBeDefined()
  await ui.unmount()
})

const phoneUndoSetup = async ($: any, on: any) => {
  const seen: string[] = []
  const forkPrompts: string[] = []
  mock.store(on)
  on('session.id', async () => ({ value: 's1' }) as never)
  on('session.cwd', async () => ({ value: '/proj' }) as never)
  on('clock.now', async () => ({ value: 1_000 }) as never)
  on('session.surfaces', async () => ({ value: ['desktop'] }) as never)
  on('model.fork', async (_$: any, e: any) => {
    forkPrompts.push(String(e.prompt))
    return { value: { isAnswered: true, text: forkPrompts.length === 1 ? ANSWER : '{"note": null}' } } as never
  })
  on('prompt.submit', async (_$: any, e: any) => {
    seen.push(JSON.stringify(e.context ?? []))
    return { text: e.text } as never
  })
  on('turn.step', async function* (_$: any, e: any) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never
  })
  await $.prompt.submit({ text: 'hi', origin: { kind: 'bridge' } } as never)
  await step($, 6)
  for (let i = 0; i < 40; i++) await settle()
  await $.prompt.submit({ text: 'next', origin: { kind: 'bridge' } } as never)
  return { seen, forkPrompts }
}

test('on the phone, "undo" after 2 takes back Knew it and shows the note again', async ($, on) => {
  const { seen, forkPrompts } = await phoneUndoSetup($, on)
  await $.prompt.submit({ text: '2', origin: { kind: 'bridge' } } as never)
  expect(seen[2]).toContain('knew it already')
  await $.prompt.submit({ text: 'undo', origin: { kind: 'bridge' } } as never)
  expect(seen[3]).toContain('Undone')
  expect(seen[3]).toContain('1 learn more')
  // The note is told again, so a new 2 answers it again.
  await $.prompt.submit({ text: '2', origin: { kind: 'bridge' } } as never)
  expect(seen[4]).toContain('knew it already')
  await $.prompt.submit({ text: 'desfazer', origin: { kind: 'bridge' } } as never)
  expect(seen[5]).toContain('Undone')
  await step($, 12)
  for (let i = 0; i < 40; i++) await settle()
  expect(knownPart(forkPrompts.at(-1) ?? '')).not.toContain('unpushed local build')
})

test('on the phone, 3 dismisses only this note and undo restores it; after 1 undo says the explanation was given', async ($, on) => {
  const { seen } = await phoneUndoSetup($, on)
  await $.prompt.submit({ text: '3', origin: { kind: 'bridge' } } as never)
  expect(seen[2]).toContain('dismissed this note')
  expect(seen[2]).toContain('later notes keep coming')
  // Notes are not turned off.
  const log = await $.command.run({ command: 'side-notes', args: 'log' } as never)
  expect(log.text).not.toContain('Side notes are off')
  expect((await $.command.run({ command: 'side-notes', args: '' } as never)).text).toContain('· dismissed ·')
  await $.prompt.submit({ text: 'undo', origin: { kind: 'bridge' } } as never)
  expect(seen[3]).toContain('Undone: \\"Dismissed\\"')
  expect(seen[3]).toContain('3 dismiss')
  expect((await $.command.run({ command: 'side-notes', args: '' } as never)).text).toContain('· shown ·')
  await $.prompt.submit({ text: '1', origin: { kind: 'bridge' } } as never)
  expect(seen[4]).toContain('learn more')
  await $.prompt.submit({ text: 'undo', origin: { kind: 'bridge' } } as never)
  expect(seen[5]).toContain('already given')
  // With nothing left to undo, "undo" is a plain message.
  await $.prompt.submit({ text: 'undo', origin: { kind: 'bridge' } } as never)
  expect(seen[6]).not.toContain('side-notes')
})

// --- Remote Control, end to end -----------------------------------------

const remoteSetup = (on: any, surfaces: string[]) => {
  const seen: string[] = []
  const forkPrompts: string[] = []
  mock.store(on)
  on('session.id', async () => ({ value: 's1' }) as never)
  on('session.cwd', async () => ({ value: '/proj' }) as never)
  on('clock.now', async () => ({ value: 1_000 }) as never)
  on('session.surfaces', async () => ({ value: surfaces }) as never)
  on('model.fork', async (_$: any, e: any) => {
    forkPrompts.push(String(e.prompt))
    return { value: { isAnswered: true, text: forkPrompts.length === 1 ? ANSWER : '{"note": null}' } } as never
  })
  on('prompt.submit', async (_$: any, e: any) => {
    seen.push(JSON.stringify(e.context ?? []))
    return { text: e.text } as never
  })
  on('turn.step', async function* (_$: any, e: any) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never
  })
  on('turn.start', async (_$: any, e: any) => ({ turnId: e.turnId }) as never)
  on('turn.complete', async (_$: any, e: any) => ({ text: e.answer }) as never)
  on('tool.call', async () => ({ result: 'ok', text: 'ok' }) as never)
  return { seen, forkPrompts }
}

const phone = async ($: any, text: string) => $.prompt.submit({ text, origin: { kind: 'bridge' } } as never)

test('a terminal session driven from the phone gets the note inside the running turn, then 2 and undo answer it', async ($, on) => {
  const { seen, forkPrompts } = remoteSetup(on, ['terminal'])
  await phone($, 'fix the build')
  await $.turn.start({ turnId: 't1', text: 'fix the build' } as never)
  await step($, 6)
  for (let i = 0; i < 40; i++) await settle()
  expect(forkPrompts.length).toBe(1)
  // The next tool result of the running turn carries the note for Claude's reply.
  const r = await $.tool.call({ tool: 'Read', file_path: 'a.md' } as never)
  const ctx = JSON.stringify(r.context ?? [])
  expect(ctx).toContain('only on this Mac')
  expect(ctx).toContain('1 learn more · 2 knew it · 3 dismiss')
  // Labels are translated into the person's language.
  expect(ctx).toContain('Translate every label')
  expect(ctx).toContain('saber mais')
  expect(ctx).toContain('end of this turn')
  // Only once.
  const r2 = await $.tool.call({ tool: 'Read', file_path: 'b.md' } as never)
  expect(JSON.stringify(r2.context ?? [])).not.toContain('only on this Mac')
  await $.turn.complete({ turnId: 't1', reason: 'answer', answer: 'done', durationMs: 5, isAborted: false } as never)
  // The next phone prompt does not tell it again; a reply of 2 answers it.
  await phone($, '2')
  expect(seen[1]).toContain('knew it already')
  expect(seen[1]).toContain('undo')
  await phone($, 'undo')
  expect(seen[2]).toContain('Undone')
  await phone($, '3')
  expect(seen[3]).toContain('dismissed this note')
  // A dismissed note does not stop the next check.
  await $.turn.start({ turnId: 't2', text: 'more' } as never)
  await step($, 12)
  for (let i = 0; i < 40; i++) await settle()
  expect(forkPrompts.length).toBeGreaterThan(1)
})

test('phone only: a note found after the last tool call is told with the next phone prompt', async ($, on) => {
  const { seen, forkPrompts } = remoteSetup(on, ['mobile'])
  await phone($, 'hi')
  await $.turn.start({ turnId: 't1', text: 'hi' } as never)
  await step($, 6)
  for (let i = 0; i < 40; i++) await settle()
  expect(forkPrompts.length).toBe(1)
  await $.turn.complete({ turnId: 't1', reason: 'answer', answer: 'done', durationMs: 5, isAborted: false } as never)
  await phone($, 'next')
  expect(seen[1]).toContain('only on this Mac')
  expect(seen[1]).toContain('Start your reply')
  await phone($, '1')
  expect(seen[2]).toContain('Nothing was pushed')
})

test('a terminal session typed at the keyboard, with a phone attached, runs no check', async ($, on) => {
  const { forkPrompts } = remoteSetup(on, ['terminal'])
  await $.prompt.submit({ text: 'typed', origin: { kind: 'composer' } } as never)
  await step($, 6)
  for (let i = 0; i < 40; i++) await settle()
  expect(forkPrompts.length).toBe(0)
})

test('the desktop app driven from the phone also tells the note in the running turn', async ($, on) => {
  remoteSetup(on, ['desktop', 'mobile'])
  await phone($, 'go')
  await $.turn.start({ turnId: 't1', text: 'go' } as never)
  await step($, 6)
  for (let i = 0; i < 40; i++) await settle()
  const r = await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  expect(JSON.stringify(r.context ?? [])).toContain('only on this Mac')
})

test('steps add up across short turns: a phone question of one step still gets checked', async ($, on) => {
  const { forkPrompts } = remoteSetup(on, ['terminal'])
  for (let t = 0; t < 6; t++) {
    await phone($, `question ${t}`)
    // One step per turn, index 0 every time.
    const s = $.turn.step({ turnId: `t${t}`, index: 0, model: 'm', messageCount: 3 } as never)
    for await (const _ of s) void _
    for (let i = 0; i < 40; i++) await settle()
  }
  expect(forkPrompts.length).toBe(1)
})

test('a phone answer also clears the note from the band (the store copy is another object)', async ($, on) => {
  const { seen } = remoteSetup(on, ['terminal'])
  await phone($, 'hi')
  await step($, 6)
  for (let i = 0; i < 40; i++) await settle()
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  expect(await ui.find(NOTE_ROW)).toBeDefined()
  await phone($, 'next')
  expect(seen[1]).toContain('only on this Mac')
  await phone($, '2')
  await settle()
  expect(await ui.find(NOTE_ROW)).toBeUndefined()
  await ui.unmount()
})

test('a fresh phone session in a folder with a restored note: the note is told, and checks still run', async ($, on) => {
  const s = { id: 'old', startedAt: 1_000, now: 10_000 }
  const sent: string[] = []
  const forkPrompts: string[] = []
  const second = JSON.stringify({ topic: 'folder open to all', note: 'The folder is writable by everyone.', kind: 'check', detail: 'x' })
  lostChatSetup(on, s, sent, [ANSWER, second], forkPrompts)
  on('command.register', async () => ({ value: undefined }) as never)
  on('session.start', async (_$: any, e: any) => ({ cwd: e.cwd }) as never)
  on('turn.start', async (_$: any, e: any) => ({ turnId: e.turnId }) as never)
  on('turn.complete', async (_$: any, e: any) => ({ text: e.answer }) as never)
  on('tool.call', async () => ({ result: 'ok', text: 'ok' }) as never)
  // An earlier session shows a note nobody answers.
  await step($, 6)
  for (let i = 0; i < 40; i++) await settle()
  expect(forkPrompts.length).toBe(1)
  // A new session in the same folder: the note comes back in the band.
  s.id = 'new'
  s.now = 20_000
  await $.session.start({ cwd: '/jbei', surface: 'terminal', isInteractive: true } as never)
  for (let i = 0; i < 10; i++) await settle()
  // The first phone prompt tells the restored note.
  await phone($, 'make 3 files and chmod the folder')
  expect(sent[0]).toContain('only on this Mac')
  expect(sent[0]).toContain('3 dismiss')
  // Its turn has tool steps: the restored note does not hold back the check.
  await $.turn.start({ turnId: 't2', text: 'x' } as never)
  await step($, 12)
  for (let i = 0; i < 40; i++) await settle()
  expect(forkPrompts.length).toBe(2)
  // The new note joins the running turn; the restored one waits behind it.
  const r = await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
  expect(JSON.stringify(r.context ?? [])).toContain('writable by everyone')
  await $.turn.complete({ turnId: 't2', reason: 'answer', answer: 'done', durationMs: 5, isAborted: false } as never)
  // 3 answers the newest note told; the restored one is not told twice.
  await phone($, '3')
  expect(sent[1]).toContain('writable by everyone')
  expect(sent[1]).toContain('dismissed this note')
  await phone($, 'thanks')
  expect(sent[2]).not.toContain('only on this Mac')
  const log = await $.command.run({ command: 'side-notes', args: 'log' } as never)
  expect(log.text).toContain('told on the phone: the note in the band')
})
