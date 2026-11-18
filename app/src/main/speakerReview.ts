import { execFile } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Segment } from './store'
import type { SpeakerReview } from '../shared/types'
import type { Store } from './store'

type Voice = { id: number; vector: number[] | null; sampleMs: number; sampleEndMs: number }
type Turn = { startMs: number; endMs: number; speaker: number }
type Part = Turn & { text: string }
type Result = { voices: Voice[]; turns: Turn[]; replacements?: { id: number; parts: Part[] }[] }
type Review = Result & { endedAt: number | null; names?: Record<number, string> }
type Profile = { name: string; vector: number[] }
const dims = 192
const validVector = (v: unknown): v is number[] => Array.isArray(v) && v.length === dims &&
  v.every(Number.isFinite) && Math.abs(Math.hypot(...v) - 1) < .01
export const sshTarget = (target: unknown): target is string => typeof target === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(target)

function analyze(target: string, file: string, segments: Segment[]): Promise<Result> {
  return new Promise((resolve, reject) => {
    const child = execFile('/usr/bin/ssh', ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10',
      '-o', 'StrictHostKeyChecking=yes', '-o', 'ClearAllForwardings=yes', target,
      'cd ~/.local/share/yogurt-speaker && exec .venv/bin/python analyze.py --intervals'],
    { timeout: 15 * 60_000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
      if (error) { reject(new Error('Speaker analysis on Spark failed')); return }
      try {
        const r = JSON.parse(stdout) as Result
        const ids = new Set(r.voices.map(v => v.id))
        const byId = new Map(segments.map(s => [s.id, s]))
        const validTurn = (t: Turn) => ids.has(t.speaker) && Number.isSafeInteger(t.startMs) &&
          Number.isSafeInteger(t.endMs) && t.startMs >= 0 && t.endMs > t.startMs
        const goodReplacement = ({ id, parts }: { id: number; parts: Part[] }) => {
          const segment = byId.get(id)
          return !!segment && parts.length >= 2 && parts.length <= 12 && parts.every((p, i) =>
            validTurn(p) && p.startMs >= segment.startMs && p.endMs <= segment.endMs &&
            (i === 0 || parts[i - 1].endMs <= p.startMs) && typeof p.text === 'string' && p.text.length <= 2000)
        }
        if (ids.size !== r.voices.length || r.voices.length > 30 ||
            !r.voices.every(v => Number.isSafeInteger(v.id) && (v.vector === null || validVector(v.vector)) &&
              Number.isSafeInteger(v.sampleMs) && Number.isSafeInteger(v.sampleEndMs) && v.sampleMs >= 0 && v.sampleEndMs > v.sampleMs) ||
            !r.turns.every(validTurn) || (r.replacements && !r.replacements.every(goodReplacement))) throw new Error()
        resolve(r)
      } catch { reject(new Error('Spark returned invalid speaker data')) }
    })
    const input = createReadStream(file)
    input.once('error', () => { child.kill(); reject(new Error('Recording could not be read')) })
    child.stdin?.on('error', () => input.destroy())
    child.once('close', () => input.destroy())
    if (child.stdin) {
      const header = JSON.stringify(segments.map(s => [s.id, Math.round(s.startMs), Math.round(s.endMs)]))
      child.stdin.write(header + '\n')
      input.pipe(child.stdin)
    }
  })
}

export function matches(voices: Voice[], profiles: Profile[]) {
  const proposed = new Map<number, string>()
  for (const { id, vector } of voices) {
    if (!vector) continue
    const [best, rival] = profiles.map(p => ({
      name: p.name, score: vector.reduce((sum, x, i) => sum + x * p.vector[i], 0),
    })).sort((a, b) => b.score - a.score)
    if (best && best.score >= .68 && best.score - (rival?.score ?? 0) >= .12) proposed.set(id, best.name)
  }
  const names = [...proposed.values()]
  return new Map([...proposed].filter(([, name]) => names.indexOf(name) === names.lastIndexOf(name)))
}

export function speakerAt(s: Pick<Segment, 'startMs' | 'endMs'>, turns: Turn[]) {
  const coverage = new Map<number, number>()
  for (const t of turns) {
    const overlap = Math.min(s.endMs, t.endMs) - Math.max(s.startMs, t.startMs)
    if (overlap > 0) coverage.set(t.speaker, (coverage.get(t.speaker) ?? 0) + overlap)
  }
  const [[speaker, time] = [-1, 0], [, rival = 0] = []] = [...coverage].sort((a, b) => b[1] - a[1])
  // WeType gives one timestamp range for a chunk. Keep mixed chunks explicitly uncertain.
  return time >= Math.min(600, (s.endMs - s.startMs) * .5) && time > 0 && rival < Math.min(400, .1 * time) ? speaker : undefined
}

/** Retain the original text when segmented recognition looks like an omission or hallucination. */
function similarText(a: string, b: string) {
  const normalize = (x: string) => [...x.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')]
  const x = normalize(a), y = normalize(b)
  const size = Math.max(x.length, y.length)
  if (!size || size > 2000 || Math.abs(x.length - y.length) > size * .30) return false
  let row = y.map((_, i) => i + 1)
  row.unshift(0)
  for (const [i, ch] of x.entries()) {
    const next = [i + 1]
    for (const [j, other] of y.entries()) next.push(Math.min(row[j] + Number(ch !== other), row[j + 1] + 1, next[j] + 1))
    row = next
  }
  return row[y.length] <= size * .35
}

export function speakerReview(o: { dir: string; store: Store; target: () => string | undefined; infer?: typeof analyze; track: (id: string) => string | null; changed: (id: string) => void }) {
  const busy = new Map<string, Promise<void>>()
  const failed = new Set<string>()
  const profileFile = join(o.dir, 'profiles.json')
  const file = (id: string) => join(o.dir, id + '.json')
  const read = <T>(path: string, fallback: T): T => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as T : fallback
  const write = (path: string, value: unknown) => {
    mkdirSync(o.dir, { recursive: true, mode: 0o700 })
    writeFileSync(path + '.tmp', JSON.stringify(value), { mode: 0o600 })
    renameSync(path + '.tmp', path)
  }
  const profiles = () => read<Profile[]>(profileFile, [])
  const result = (id: string) => {
    const r = read<Review | null>(file(id), null)
    return r !== null && r.endedAt === o.store.meeting(id)?.endedAt ? r : null
  }
  const label = (id: string, r: Review, names: Map<number, string>, enroll: boolean) => {
    const meeting = o.store.meeting(id)
    if (!meeting || meeting.endedAt !== r.endedAt || meeting.trashedAt != null || meeting.state === 'recording') throw new Error('Meeting changed during analysis')
    const update = o.store.db.prepare('UPDATE segments SET speaker=? WHERE id=?')
    const replace = o.store.db.prepare('UPDATE segments SET start_ms=?, end_ms=?, text=?, speaker=? WHERE id=?')
    const insert = o.store.db.prepare("INSERT INTO segments (meeting_id, track, start_ms, end_ms, text, speaker) VALUES (?, 'them', ?, ?, ?, ?)")
    const replacements = new Map(r.replacements?.map(x => [x.id, x.parts]))
    const speakerName = (speaker: number) => names.get(speaker) || ('说话人 ' + (speaker + 1))
    o.store.db.exec('SAVEPOINT speaker_review')
    try {
      for (const s of o.store.segments(id).filter(s => s.track === 'them')) {
        const speaker = speakerAt(s, r.turns)
        const parts = replacements.get(s.id)
        if (parts && parts.every(p => p.startMs >= s.startMs && p.endMs <= s.endMs) &&
            similarText(s.text, parts.map(p => p.text).join(''))) {
          const [first, ...rest] = parts
          replace.run(first.startMs, first.endMs, first.text, speakerName(first.speaker), s.id)
          for (const p of rest) insert.run(id, p.startMs, p.endMs, p.text, speakerName(p.speaker))
        } else update.run(speaker === undefined ? '待确认' : speakerName(speaker), s.id)
      }
      if (enroll) {
        const next = profiles()
        for (const v of r.voices) {
          const name = names.get(v.id)
          if (!name || !v.vector) continue
          const index = next.findIndex(p => p.name === name)
          if (index === -1) next.push({ name, vector: v.vector })
          else next[index] = { name, vector: v.vector }
        }
        write(profileFile, next)
      }
      o.store.db.exec('RELEASE speaker_review')
    } catch (error) { o.store.db.exec('ROLLBACK TO speaker_review; RELEASE speaker_review'); throw error }
    write(file(id), { ...r, names: Object.fromEntries(names) })
    o.changed(id)
  }
  function start(id: string, retry = false): Promise<void> {
    if (busy.has(id)) return busy.get(id)!
    const meeting = o.store.meeting(id), target = o.target()
    if (!target || !meeting || meeting.trashedAt != null || !['stopped', 'done'].includes(meeting.state)) return Promise.resolve()
    if (!retry && result(id)) return Promise.resolve()
    failed.delete(id)
    const job = (async () => {
      const track = o.track(id)
      if (!track) {
        if (o.store.segments(id).some(s => s.track === 'them')) throw new Error('Remote audio is missing')
        return
      }
      const data = await (o.infer ?? analyze)(target, track, o.store.segments(id).filter(s => s.track === 'them' && s.endMs > s.startMs))
      const r = { ...data, endedAt: meeting.endedAt }
      if (o.store.meeting(id)?.endedAt !== meeting.endedAt || o.store.meeting(id)?.trashedAt != null) return
      if (!data.voices.length && o.store.segments(id).some(s => s.track === 'them')) throw new Error('No speakers detected')
      write(file(id), r)
      const found = matches(data.voices, profiles())
      if (found.size === data.voices.length && data.voices.length) label(id, r, found, false)
    })().catch(() => { failed.add(id) }).finally(() => { busy.delete(id); o.changed(id) })
    busy.set(id, job)
    o.changed(id)
    return job
  }
  return {
    start,
    busy: (id: string) => busy.has(id),
    forget(id: string) { rmSync(file(id), { force: true }); failed.delete(id) },
    async beforeSummary(id: string) {
      if (!o.target() || !o.store.segments(id).some(s => s.track === 'them')) return true
      await start(id)
      return !!result(id)?.names
    },
    view(id: string): SpeakerReview {
      const r = result(id)
      const found = matches(r?.voices ?? [], profiles())
      return { enabled: !!o.target(), busy: busy.has(id), failed: failed.has(id), applied: !!r?.names,
        voices: (r?.voices ?? []).map(v => ({ id: v.id, sampleMs: v.sampleMs, sampleEndMs: v.sampleEndMs,
          name: r?.names ? r.names[v.id] ?? '' : found.get(v.id) ?? '', canEnroll: !!v.vector })) }
    },
    apply(id: string, values: unknown) {
      const r = result(id)
      if (!r || busy.has(id) || !Array.isArray(values) || values.length !== r.voices.length) return false
      const names = new Map<number, string>()
      for (const [i, v] of r.voices.entries()) {
        const name: unknown = values[i]
        if (typeof name !== 'string' || name.length > 80 || /[\x00-\x1f]/.test(name)) return false
        names.set(v.id, name.trim())
      }
      label(id, r, names, true)
      return true
    },
  }
}
