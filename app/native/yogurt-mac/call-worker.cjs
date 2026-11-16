// A slow accessibility call must never block the recorder or the main window.
const { parentPort, workerData } = require('node:worker_threads')
const snapshot = require(workerData.binary)
function read() {
  const start = Date.now()
  parentPort.postMessage(JSON.parse(snapshot(workerData.ids)))
  setTimeout(read, Math.max(workerData.interval, 2 * (Date.now() - start)))
}
read()
