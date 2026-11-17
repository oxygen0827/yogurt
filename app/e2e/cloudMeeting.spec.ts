import { _electron as electron, expect, test } from '@playwright/test'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { meetingDir } from './meetingDir'

test('cloud settings route meeting notes and Ask through the selected backend', async () => {
  const requests: string[] = []
  const server = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    if (req.url !== '/chat/completions' || req.headers.authorization !== 'Bearer test-secret') { res.writeHead(403).end(); return }
    requests.push(body)
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.end('data: {"choices":[{"delta":{"content":"## Decisions\\n\\n- Approved the cloud test."},"finish_reason":"stop"}]}\n\ndata: [DONE]\n')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const profile = mkdtempSync(join(tmpdir(), 'yogurt-cloud-'))
  const app = await electron.launch({ args: [join(import.meta.dirname, '../out/main/index.js')], env: { ...process.env, YOGURT_FAKE: '1', YOGURT_USER_DATA: profile } })
  try {
    const page = await app.firstWindow()
    await expect(page.getByTestId('home')).toBeVisible()
    // Isolate this test from the developer's OS keychain. Exercise the real settings IPC and HTTP backend.
    await app.evaluate(({ safeStorage }) => {
      safeStorage.isEncryptionAvailable = () => true
      safeStorage.encryptString = s => Buffer.from(s)
      safeStorage.decryptString = s => s.toString()
    })
    const url = 'http://127.0.0.1:' + (server.address() as AddressInfo).port
    await page.evaluate(url => window.yogurt.cloud.save({ url, key:'test-secret', enabled:true, model:'test' }), url)
    const id = await app.evaluate(() => (globalThis as any).__fake__.bigMeeting(5)) as string
    await page.evaluate(id => window.yogurt.notes.writeAgain(id), id)
    await expect.poll(() => page.evaluate(async id => (await window.yogurt.notes.get(id)).enhanced, id)).toContain('Approved the cloud test')
    await expect.poll(() => { try { return readFileSync(join(meetingDir(profile,id),'会议纪要.md'),'utf8') } catch { return '' } }).toContain('Approved the cloud test')
    await page.evaluate(id => window.yogurt.nav.go('/note/' + id), id)
    await expect(page.getByTestId('chat-open')).toBeVisible()
    await page.keyboard.press('Meta+j')
    await page.getByTestId('chat-input').fill('What was the cloud decision?')
    await page.getByTestId('chat-input').press('Enter')
    await expect(page.getByTestId('chat-turn')).toContainText('Approved the cloud test')
    expect(requests.some(body => body.includes('Line 1 of the long meeting'))).toBe(true)
    expect(requests.some(body => body.includes('What was the cloud decision?'))).toBe(true)
  } finally { await app.close(); server.close() }
})
