// Reads the side check's answer: one JSON object, either {"note": null} or
// {"topic", "note", "kind", "detail"}. Code fences and text around it are ignored.

export type NoteKind = 'fyi' | 'check'
export type Note = { topic: string; line: string; kind: NoteKind; explanation: string }

export const KIND_LABEL: Record<NoteKind, string> = { fyi: 'Side note', check: 'Worth checking' }

const oneLine = (v: unknown): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').replace(/^[\s"'*_`-]+/, '').replace(/[*_`]+/g, '').replace(/\.+$/, '').trim() : ''

// The outermost {...} in the reply, or null.
const jsonBlock = (text: string): unknown => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

export type Reading = { note: Note } | { isNothing: true } | { isUnread: true }

export const readReply = (text: string): Reading => {
  const v = jsonBlock(text)
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return { isUnread: true }
  const o = v as Record<string, unknown>
  if (!('note' in o)) return { isUnread: true }
  const line = oneLine(o.note)
  if (line === '' || /^(none|nothing|null)$/i.test(line)) return { isNothing: true }
  const kind: NoteKind = typeof o.kind === 'string' && /check/i.test(o.kind) ? 'check' : 'fyi'
  const topic = oneLine(o.topic) || line
  const explanation = typeof o.detail === 'string' ? o.detail.trim() : ''
  return { note: { topic, line, kind, explanation } }
}

export const parseNote = (text: string): Note | null => {
  const r = readReply(text)
  return 'note' in r ? r.note : null
}

const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

export const sameTopic = (a: string, b: string): boolean => norm(a) !== '' && norm(a) === norm(b)

// A note repeats one already shown or known when its topic or its line matches.
export const isRepeat = (note: Note, topics: string[]): boolean =>
  topics.some(t => sameTopic(t, note.topic) || sameTopic(t, note.line))
