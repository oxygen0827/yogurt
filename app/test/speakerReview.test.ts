import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { openStore } from '../src/main/store'
import { speakerReview } from '../src/main/speakerReview'

it('requires first-meeting confirmation, saves labels before the notes gate, then matches a later meeting', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'speaker-review-'))
  const store = openStore(':memory:')
  try {
    const start = () => {
      const m = store.createMeeting({ title: 'Meeting', state: 'done', startedAt: 1, endedAt: 8000, eventId: null, app: null, attendees: [] })
      store.addSegments([{ meetingId: m.id, track: 'them', startMs: 500, endMs: 5000, text: '讨论安排', speaker: null }])
      return m.id
    }
    const infer = vi.fn(async () => ({
      voices: [{ id: 0, vector: [1, ...new Array<number>(191).fill(0)], sampleMs: 700, sampleEndMs: 4500 }],
      turns: [{ startMs: 500, endMs: 5000, speaker: 0 }],
    }))
    const review = speakerReview({ dir, store, target: () => 'spark', track: () => 'test.wav', infer, changed: () => {} })
    const a = start()
    expect(await review.beforeSummary(a)).toBe(false)
    expect(review.view(a).voices[0].name).toBe('')
    expect(review.apply(a, ['测试参与者'])).toBe(true)
    expect(await review.beforeSummary(a)).toBe(true)
    expect(store.segments(a)[0].speaker).toBe('测试参与者')
    expect(review.profileNames()).toEqual(['测试参与者'])
    expect(review.renameProfile('测试参与者', '新姓名')).toBe(true)
    const b = start()
    store.addSegments([{ meetingId: b, track: 'them', startMs: 700, endMs: 1200, text: '确认', speaker: '会议客户端姓名' }])
    expect(await review.beforeSummary(b)).toBe(true)
    expect(store.segments(b).map(s => s.speaker)).toEqual(['新姓名', '会议客户端姓名'])
    expect(infer).toHaveBeenCalledTimes(2)
    expect(review.removeProfile('新姓名')).toBe(true)
    expect(review.profileNames()).toEqual([])
    expect(store.segments(b)[0].speaker).toBe('新姓名')
    const c = start()
    store.setSegmentSpeakers(store.segments(c).map(s => ({ id: s.id, speaker: '会议客户端姓名' })))
    expect(await review.beforeSummary(c)).toBe(true)
    expect(infer).toHaveBeenCalledTimes(2)
    expect(await review.beforeSummary(start())).toBe(false)
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }) }
})
