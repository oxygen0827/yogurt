import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export function meetingDir(profile: string, id: string) {
  const root = join(profile, 'meetings')
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const marker = join(root, entry.name, '.yogurt-meeting')
    if (entry.isDirectory() && existsSync(marker) && readFileSync(marker, 'utf8') === id) return join(root, entry.name)
  }
  return join(root, id)
}
