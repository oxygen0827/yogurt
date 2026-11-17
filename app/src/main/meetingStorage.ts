import { constants, cpSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

interface Location { current: string; pending?: string }

export function meetingStorage(profile: string) {
  const config = join(profile, 'meeting-storage.json')
  const read = (): Location => {
    if (!existsSync(config)) return { current: profile }
    const state = JSON.parse(readFileSync(config, 'utf8')) as Location
    if (!isAbsolute(state.current) || (state.pending !== undefined && !isAbsolute(state.pending))) throw new Error(config)
    return state
  }
  const save = (state: Location) => {
    writeFileSync(config + '.tmp', JSON.stringify(state), { mode: 0o600 })
    renameSync(config + '.tmp', config)
  }
  const validate = (parent: string, current: string) => {
    const root = realpathSync(parent)
    for (const excluded of [profile, current]) {
      const path = relative(realpathSync(excluded), root)
      if (!(path === '..' || path.startsWith('..' + sep) || isAbsolute(path))) throw new Error('Choose a folder outside the current Yogurt data folder: ' + root)
    }
    const dest = join(root, 'Yogurt Meetings')
    if (existsSync(dest)) throw new Error('The destination already exists. Choose another folder: ' + dest)
    return dest
  }
  return {
    read,
    cancel() { save({ current: read().current }) },
    choose(parent: string) {
      const { current } = read()
      save({ current, pending: validate(parent, current) })
    },
    // Called under the single-instance lock before opening any meeting files.
    start(onFailure: (error: unknown) => void) {
      const { current, pending } = read()
      const database = join(current, 'yogurt.db')
      if (current !== profile && !statSync(database).isFile()) throw new Error(database)
      if (!pending) return current
      let created = false
      try {
        if (validate(dirname(pending), current) !== pending) throw new Error(pending)
        mkdirSync(pending, { mode: 0o700 })
        created = true
        const db = new DatabaseSync(database, { readOnly: true })
        try { db.prepare('VACUUM INTO ?').run(join(pending, 'yogurt.db')) } finally { db.close() }
        const recordings = join(current, 'meetings')
        if (existsSync(recordings)) cpSync(recordings, join(pending, 'meetings'), { recursive: true, mode: constants.COPYFILE_FICLONE })
        save({ current: pending })
        return pending
      } catch (error) {
        if (created) rmSync(pending, { recursive: true, force: true })
        save({ current })
        onFailure(error)
        return current
      }
    },
  }
}
