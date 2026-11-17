import { _electron as electron, expect, test } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('turning off WeType during a recording stops new uploads and retains local transcription', async () => {
  test.skip(process.platform !== 'darwin')
  const profile = mkdtempSync(join(tmpdir(), 'yogurt-wetype-e2e-'))
  const helpers = join(profile, 'helpers')
  mkdirSync(helpers)
  const helper = join(helpers, 'vk-test')
  writeFileSync(helper, '#!/bin/sh\necho call >> "$0.calls"\necho "FINAL: 微信转写 (0.10s)"\n', { mode: 0o700 })
  const app = await electron.launch({ args: [join(import.meta.dirname, '../out/main/index.js')], env: {
    ...process.env, YOGURT_USER_DATA: profile, YOGURT_FAKE: '1',
  } })
  try {
    const page = await app.firstWindow()
    await page.getByTestId('settings-open').click()
    const toggle = page.getByRole('checkbox', { name: 'WeType' })
    await toggle.click()
    await expect(toggle).toBeChecked()
    await expect.poll(() => page.evaluate(() => window.yogurt.weType.get())).toMatchObject({ enabled: true })
    await page.getByTestId('nav-home').click()
    await page.getByTestId('new-note').click()
    await expect(page.getByTestId('note-state')).toHaveAttribute('data-state', 'recording')
    const engine = page.getByTestId('transcription-engine')
    await expect(engine).toHaveText('WeType online')
    const id = (await page.evaluate(() => window.yogurt.nav.current())).slice('/note/'.length)
    const words = () => page.evaluate(async id => (await window.yogurt.transcript.get(id)).map(s => s.text), id)
    await expect.poll(words, { timeout: 20000 }).toContain('微信转写')
    await page.evaluate(() => window.yogurt.weType.set(false))
    const calls = readFileSync(helper + '.calls', 'utf8')
    await expect.poll(async () => (await words()).some(text => text !== '微信转写'), { timeout: 20000 }).toBe(true)
    await expect(engine).toHaveText('Local Whisper')
    await page.getByTestId('note-stop').click()
    await expect(engine).toHaveCount(0)
    await expect(page.getByTestId('note-enhanced')).toHaveAttribute('data-status', 'done', { timeout: 20000 })
    expect(readFileSync(helper + '.calls', 'utf8')).toBe(calls)
  } finally { await app.close(); rmSync(profile, { recursive: true, force: true }) }
})
