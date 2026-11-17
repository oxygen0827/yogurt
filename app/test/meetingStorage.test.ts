import { mkdtempSync, realpathSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { meetingStorage } from '../src/main/meetingStorage'

let root: string, profile: string, parent: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'yogurt-storage-'))
  profile = join(root, 'profile')
  parent = join(root, 'destination')
  mkdirSync(profile)
  mkdirSync(parent)
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

it('copies committed WAL data and audio before switching, then reopens the same library', () => {
  const storage = meetingStorage(profile)
  const db = new DatabaseSync(join(profile, 'yogurt.db'))
  try {
    db.exec("PRAGMA journal_mode=WAL; CREATE TABLE notes(text); INSERT INTO notes VALUES ('minutes')")
    mkdirSync(join(profile, 'meetings', 'id'), { recursive: true })
    writeFileSync(join(profile, 'meetings', 'id', 'me.m4a'), 'audio')
    storage.choose(parent)
    expect(storage.read().current).toBe(profile)
    const dest = storage.start(e => { throw e })
    expect(dest).toBe(join(realpathSync(parent), 'Yogurt Meetings'))
    expect(readFileSync(join(dest, 'meetings', 'id', 'me.m4a'), 'utf8')).toBe('audio')
    const copy = new DatabaseSync(join(dest, 'yogurt.db'), { readOnly: true })
    try { expect(copy.prepare('SELECT text FROM notes').get()?.text).toBe('minutes') } finally { copy.close() }
    expect(meetingStorage(profile).start(e => { throw e })).toBe(dest)
    rmSync(join(dest, 'yogurt.db'))
    expect(() => storage.start(vi.fn())).toThrow()
  } finally { db.close() }
})

it('cancels a choice and preserves existing files if the target becomes occupied', () => {
  const storage = meetingStorage(profile)
  expect(() => storage.choose(profile)).toThrow()
  storage.choose(parent)
  storage.cancel()
  expect(storage.start(vi.fn())).toBe(profile)
  storage.choose(parent)
  const dest = storage.read().pending!
  mkdirSync(dest)
  writeFileSync(join(dest, 'existing'), 'original')
  const failed = vi.fn()
  expect(storage.start(failed)).toBe(profile)
  expect(failed).toHaveBeenCalledOnce()
  expect(storage.read()).toEqual({ current: profile })
  expect(readFileSync(join(dest, 'existing'), 'utf8')).toBe('original')
})
