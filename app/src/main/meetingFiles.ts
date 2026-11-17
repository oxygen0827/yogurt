import { createHash, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { cleanMeetingTitle, transcriptDoc } from '../shared/exportNotes'
import { docToMd } from '../shared/markdown'
import { isId } from './ipcArgs'
import type { Store } from './store'

const marker = '.yogurt-meeting'
const digest = (s: string) => createHash('sha256').update(s).digest('hex')
type Row = { id: string; name: string; title: string; notes: string; transcript: string }
const directory = (path: string) => lstatSync(path, { throwIfNoEntry: false })?.isDirectory() === true
function owner(dir: string) {
  const file = join(dir, marker)
  return directory(dir) && lstatSync(file, { throwIfNoEntry: false })?.isFile() ? readFileSync(file, 'utf8') : ''
}
function atomic(file: string, body: string) {
  const tmp = file + '.' + randomUUID() + '.tmp'
  try { writeFileSync(tmp, body, { flag: 'wx', mode: 0o600 }); renameSync(tmp, file) }
  finally { rmSync(tmp, { force: true }) }
}

/** The capture keeps its path until it finishes. Backups still use portable meeting IDs. */
export function meetingFiles(root: string, store: Store) {
  mkdirSync(root, { recursive: true })
  const db = store.db
  db.exec(`CREATE TABLE IF NOT EXISTS meeting_files (
    id TEXT PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE, name TEXT NOT NULL, title TEXT NOT NULL,
    notes TEXT NOT NULL, transcript TEXT NOT NULL);
    CREATE TEMP TABLE IF NOT EXISTS files_dirty(id TEXT PRIMARY KEY);
    INSERT OR IGNORE INTO files_dirty SELECT id FROM meetings WHERE state IN ('stopped','done') AND trashed_at IS NULL;`)
  for (const [table, col] of [['meetings','id'], ['segments','meeting_id'], ['notes','meeting_id']]) {
    for (const action of ['INSERT','UPDATE','DELETE']) {
      const record = action === 'DELETE' ? 'OLD' : 'NEW'
      db.exec(`CREATE TEMP TRIGGER files_${table}_${action} AFTER ${action}${table === 'meetings' && action === 'UPDATE' ? ' OF title,state,started_at,trashed_at' : ''} ON ${table}
        BEGIN INSERT INTO files_dirty VALUES(${record}.${col}) ON CONFLICT DO NOTHING; END`)
    }
  }
  db.exec('CREATE TABLE IF NOT EXISTS meeting_archive_root(token TEXT NOT NULL)')
  const rootFile = join(root, '.yogurt-library')
  let token = db.prepare('SELECT token FROM meeting_archive_root LIMIT 1').get()?.token
  if (!token) {
    token = randomUUID()
    atomic(rootFile, String(token))
    db.prepare('INSERT INTO meeting_archive_root VALUES (?)').run(token)
  }
  const row = (id: string) => db.prepare('SELECT * FROM meeting_files WHERE id=?').get(id) as Row | undefined
  const safe = (name: string) => {
    if (!name || name === '.' || name === '..' || basename(name) !== name) throw new Error('Invalid meeting folder')
    return join(root, name)
  }
  function dirOf(id: string) {
    if (!isId(id)) throw new Error('Invalid meeting ID')
    const r = row(id), dir = safe(r?.name ?? id)
    if (lstatSync(dir, { throwIfNoEntry: false }) && (!directory(dir) || (r && owner(dir) !== id))) throw new Error('Unknown meeting folder')
    return dir
  }
  function sync(id: string) {
    const m = store.meeting(id)
    if (!m || (m.state !== 'stopped' && m.state !== 'done') || m.trashedAt != null) return
    const r = row(id)
    // Resolve a completed rename after a crash, or a folder renamed manually within this library.
    let dir = safe(r?.name ?? id)
    if (!directory(dir) || (r && owner(dir) !== id)) {
      const match = readdirSync(root, { withFileTypes: true }).find(e => e.isDirectory() && owner(join(root,e.name)) === id)
      if (match) dir = safe(match.name)
      else if (r) return
    }
    if (!directory(dir)) mkdirSync(dir, { mode: 0o700 })
    if (!owner(dir)) writeFileSync(join(dir, marker), id, { flag: 'wx', mode: 0o600 })
    if (owner(dir) !== id) throw new Error('Meeting folder belongs to another meeting')
    const d = new Date(m.startedAt)
    const stamp = [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-')
    const title = cleanMeetingTitle(m.title, 45) || '会议'
    const base = stamp + ' ' + title
    if (!r || r.title !== base) {
      // Compare names on disk as well: the Mac volume may be case-insensitive.
      let name = base, n = 1
      while (name !== basename(dir) && existsSync(safe(name))) name = base + ' (' + (++n) + ')'
      if (name !== basename(dir)) { renameSync(dir, safe(name)); dir = safe(name) }
    }
    const notes = store.notes(id)
    const body = [notes.enhanced?.replace(/<\/?mine>/g, '').trim(), notes.mine.trim() && '## 我的笔记\n\n' + notes.mine.trim()].filter(Boolean).join('\n\n')
    const md = '# ' + m.title.replace(/\s+/g,' ') + '\n\n' + body + '\n'
    const transcript = docToMd(transcriptDoc(store.segments(id), { gap: true })) + '\n'
    const nh = digest(md), th = digest(transcript)
    if (nh !== r?.notes) atomic(join(dir, '会议纪要.md'), md)
    if (th !== r?.transcript) atomic(join(dir, '转写.md'), transcript)
    db.prepare('INSERT OR REPLACE INTO meeting_files VALUES (?,?,?,?,?)').run(id,basename(dir),base,nh,th)
  }
  return { dirOf, sync,
    idOf: (dir: string) => owner(dir) || basename(dir),
    restore(id: string) {
      const r = row(id)
      if (r && owner(safe(r.name)) !== id) db.prepare('DELETE FROM meeting_files WHERE id=?').run(id)
    },
    flush(busy: (id: string) => boolean, missing: (id: string) => void) {
      // Reading the parent must succeed before a missing child can mean a Finder deletion.
      if (!lstatSync(rootFile, { throwIfNoEntry: false })?.isFile() || readFileSync(rootFile, 'utf8') !== token) return
      const entries = new Set(readdirSync(root))
      for (const r of db.prepare('SELECT f.id,f.name FROM meeting_files f JOIN meetings m ON m.id=f.id WHERE m.trashed_at IS NULL').all()) {
        const id = String(r.id)
        if (entries.has(String(r.name)) || busy(id)) continue
        const renamed = [...entries].find(name => owner(safe(name)) === id)
        if (renamed) db.prepare('UPDATE meeting_files SET name=? WHERE id=?').run(renamed,id)
        else missing(id)
      }
      for (const item of db.prepare('SELECT id FROM files_dirty').all()) {
        const id = String(item.id)
        if (busy(id)) continue
        try { sync(id); db.prepare('DELETE FROM files_dirty WHERE id=?').run(id) }
        catch (err) { console.warn('Meeting folder sync failed', id, err) }
      }
    },
  }
}
