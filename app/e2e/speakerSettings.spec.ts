import { _electron as electron, expect, test } from '@playwright/test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('the voice library manages an existing profile and opens the speaker panel for a recent recording', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'yogurt-voice-library-'))
  mkdirSync(join(profile, 'speaker-profiles'))
  // Same file format as a voice enrolled before the management screen existed.
  writeFileSync(join(profile, 'speaker-profiles/profiles.json'), JSON.stringify([
    { name: 'Pat Example', vector: [1, ...Array<number>(191).fill(0)] },
  ]))
  const app = await electron.launch({ args: [join(import.meta.dirname, '../out/main/index.js')], env: {
    ...process.env, YOGURT_FAKE: '1', YOGURT_FAKE_PLATFORM: 'darwin', YOGURT_USER_DATA: profile,
  } })
  try {
    const page = await app.firstWindow()
    await expect(page.getByTestId('home')).toBeVisible()
    await app.evaluate(() => (globalThis as any).__fake__.bigMeeting(5))
    await page.evaluate(() => window.yogurt.nav.go('/settings'))
    await page.getByRole('button', { name: 'Post-meeting labels and voice library' }).click()
    const library = page.getByTestId('voice-library')
    await expect(library.getByText('Pat Example')).toBeVisible()
    await library.getByRole('button', { name: 'Rename' }).click()
    await library.getByRole('textbox', { name: 'Profile name' }).fill('Pat Corrected')
    await library.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(library.getByText('Pat Corrected')).toBeVisible()
    await library.getByRole('button', { name: 'Delete profile' }).click()
    await expect(library.getByText('Pat Corrected')).toBeVisible()
    await library.getByRole('button', { name: 'Confirm deletion' }).click()
    await expect(library.getByText('No enrolled speakers yet.')).toBeVisible()

    await library.getByText('Label speakers from a meeting recording', { exact: true }).click()
    await library.getByRole('combobox').selectOption({ index: 1 })
    await library.getByRole('button', { name: 'Open labeling' }).click()
    await expect(page.getByRole('tab', { name: 'Transcript' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('button', { name: 'Set up post-meeting speaker identification' })).toBeVisible()
  } finally { await app.close(); rmSync(profile, { recursive: true, force: true }) }
})
