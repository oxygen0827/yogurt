import { spawn, type ChildProcess } from 'node:child_process'
import os from 'node:os'
import { resolve } from 'node:path'
import { Worker } from 'node:worker_threads'
import { createInterface } from 'node:readline'
import { WATCH_EVERY_MS, type Watch, type WatchLine } from './index'

/** Watches running now, so quitting can end them (they end by themselves when Yogurt's end of stdin closes) */
const running = new Set<ChildProcess>()
const workers = new Set<Worker>()
export const killAllWatches = () => {
  for (const c of running) c.kill('SIGKILL')
  running.clear()
  for (const worker of workers) void worker.terminate()
  workers.clear()
}

// A worker thread shares the app's macOS privacy identity, unlike a separate executable.
export const macCallWatch = (helper: () => string): Watch => (ids, onLine) => {
  const dir = resolve(helper(), '../../mac-accessibility')
  const worker = new Worker(resolve(dir, 'call-worker.cjs'), {
    workerData: { binary: resolve(dir, 'call-bridge.node'), ids: ids.join('\n'), interval: WATCH_EVERY_MS },
  })
  workers.add(worker)
  worker.on('message', onLine)
  worker.on('error', error => console.error('call names: accessibility worker failed', error))
  worker.once('exit', () => workers.delete(worker))
  return { stop() { worker.off('message', onLine); void worker.terminate() } }
}

/** yogurt-mac call-watch (or yogurt-system on Linux): one JSON line per reading of the call app, until its stdin is closed */
export const helperWatch = (binary: () => string): Watch => (ids, onLine) => {
  const child = spawn(binary(), ['call-watch', String(WATCH_EVERY_MS), ...ids], { stdio: ['pipe', 'pipe', 'pipe'] })
  running.add(child)
  // recording and transcription come first
  if (child.pid) { try { os.setPriority(child.pid, 10) } catch { /* it may have exited already */ } }
  createInterface({ input: child.stdout }).on('line', (l) => {
    try { onLine(JSON.parse(l) as WatchLine) } catch { /* a cut line: the next reading comes soon */ }
  })
  child.stderr.on('data', () => {})
  child.on('error', (e) => console.error('call names: the call watch failed', e))
  child.on('exit', () => running.delete(child))
  return {
    stop() {
      child.stdin.end()
      setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL') }, 2000).unref()
    },
  }
}
