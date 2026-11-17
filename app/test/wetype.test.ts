import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { finalText, weTypeTranscriber } from '../src/main/asr/wetype'

it('reads just the final answer, including an empty final for silence', () => {
  expect(finalText('… 报\nFINAL: 报价是 300 元。 (2.50s)\n')).toBe('报价是 300 元。')
  expect(finalText('FINAL:  (0.50s)')).toBe('')
  expect(() => finalText('… 未定稿')).toThrow()
})

it.skipIf(process.platform === 'win32')('sends a finalized WAV once, retains its track and time, and removes the temporary audio', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wetype-test-'))
  try {
    const tool = join(dir, 'vk-test')
    await writeFile(tool, '#!/bin/sh\n[ "$1" = wetype ] || exit 1\nhead -c 4 "$2" > "$0.header"\necho "$2" > "$0.path"\necho "FINAL: 开会了 (1.00s)"\n', { mode: 0o700 })
    const recognize = weTypeTranscriber(tool)
    const chunk = { track: 'them' as const, startMs: 7000, samples: new Float32Array(16000) }
    expect(await recognize(chunk, { partial: true })).toEqual([])
    expect(await recognize(chunk)).toEqual([{ track: 'them', startMs: 7000, endMs: 8000, text: '开会了' }])
    expect(await readFile(tool+'.header', 'utf8')).toBe('RIFF')
    await expect(readFile((await readFile(tool+'.path', 'utf8')).trim())).rejects.toMatchObject({ code: 'ENOENT' })
  } finally { await rm(dir, { recursive: true, force: true }) }
})

it('rejects queued speech after consent is withdrawn before creating an audio file', async () => {
  const controller = new AbortController()
  const recognize = weTypeTranscriber('/missing/helper', controller.signal)
  controller.abort()
  await expect(recognize({ track: 'me', startMs: 0, samples: new Float32Array(1600) })).rejects.toMatchObject({ name: 'AbortError' })
})
