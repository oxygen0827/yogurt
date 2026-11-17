import { expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { openStore } from '../src/main/store'
import { meetingFiles } from '../src/main/meetingFiles'

it('moves original audio into dated folders, keeps Markdown updated and handles Finder removal', () => {
  const root = mkdtempSync(join(tmpdir(), 'yogurt-files-')), store = openStore(':memory:')
  try {
    const files = meetingFiles(root, store)
    const add = () => store.createMeeting({ title: '周会/研发', startedAt: new Date(2026,10,16,9).getTime(), endedAt: Date.now(), state: 'stopped', eventId: null, attendees: [], app: null })
    const a = add(), b = add()
    const legacy = join(root, a.id)
    mkdirSync(legacy); writeFileSync(join(legacy, 'me.m4a'), 'audio')
    store.addSegments([{ meetingId: a.id, track: 'them', startMs: 400, endMs: 1000, speaker: '李明', text: '周五前完成测试' }])
    store.setNotes(a.id, { enhanced: '## 行动项\n\n- 完成测试' })
    const flush = () => files.flush(() => false, id => { store.trashMeeting(id) })
    flush()
    const dir = files.dirOf(a.id)
    expect(basename(dir)).toBe('2026-11-16 周会 研发')
    expect(files.dirOf(b.id)).not.toBe(dir)
    expect(readFileSync(join(dir,'me.m4a'),'utf8')).toBe('audio')
    expect(readFileSync(join(dir,'转写.md'),'utf8')).toContain('李明')
    expect(readFileSync(join(dir,'会议纪要.md'),'utf8')).toContain('完成测试')
    rmSync(join(dir,'转写.md'))
    store.updateMeeting(a.id, { state: 'done' })
    store.setNotes(a.id, { enhanced: '已完成' })
    store.updateMeeting(a.id,{ title: '新名称' })
    flush()
    expect(existsSync(join(files.dirOf(a.id),'转写.md'))).toBe(false)
    expect(readFileSync(join(files.dirOf(a.id),'会议纪要.md'),'utf8')).toContain('已完成')
    renameSync(files.dirOf(a.id),join(root,'手动重命名')); flush()
    expect(basename(files.dirOf(a.id))).toBe('手动重命名')
    rmSync(files.dirOf(a.id),{ recursive: true }); flush()
    expect(store.meeting(a.id)?.trashedAt).toBeTruthy()
    expect(store.meeting(b.id)?.trashedAt).toBeFalsy()
    files.restore(a.id); store.restoreMeeting(a.id); flush()
    expect(readFileSync(join(files.dirOf(a.id),'转写.md'),'utf8')).toContain('周五前完成测试')
  } finally { store.close(); rmSync(root,{ recursive: true, force: true }) }
})
