import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { wavBytes, type Transcribe } from './transcribe'

/** VoiceKey's pinned vk-test prints partials followed by FINAL: <text> (<elapsed>s). */
export function finalText(output: string): string {
  const match = /^FINAL: ([\s\S]*?) \(\d+(?:\.\d+)?s\)\s*$/m.exec(output.trimEnd())
  if (!match) throw new Error('WeType returned no final result')
  return match[1].trim()
}

export function weTypeTranscriber(binary: string, signal?: AbortSignal): Transcribe {
  return async (chunk, options) => {
    // Repeated quick readings contain overlapping audio. Only send a completed speech chunk.
    if (options?.partial || !chunk.samples.length) return []
    signal?.throwIfAborted()
    const dir = await mkdtemp(join(tmpdir(), 'yogurt-wetype-'))
    try {
      const path = join(dir, 'speech.wav')
      await writeFile(path, wavBytes(chunk.samples), { mode: 0o600 })
      const output = await new Promise<string>((resolve, reject) => {
        execFile(binary, ['wetype', path], { signal, timeout: 45_000, killSignal: 'SIGKILL', maxBuffer: 512 * 1024 }, (err, stdout) => {
          // The CLI prints recognized words to stdout. Keep them out of persistent error logs.
          if (err) reject(new Error('WeType transcription failed'))
          else resolve(stdout)
        })
      })
      const text = finalText(output)
      return text ? [{ track: chunk.track, startMs: chunk.startMs, endMs: Math.round(chunk.startMs + chunk.samples.length / 16), text }] : []
    } finally { await rm(dir, { recursive: true, force: true }) }
  }
}
