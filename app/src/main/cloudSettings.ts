import { ipcMain, safeStorage } from 'electron'
import { defaultEndpoint, defaultModel, endpoint, type CloudOptions } from './notes/cloud'
import { loadSettings, updateSettings } from './settings'

export function cloudSettings(file: string, changed: () => void) {
  let saved = loadSettings(file).cloud
  const view = () => ({ url: saved?.url ?? defaultEndpoint, model: saved?.model ?? defaultModel,
    enabled: saved?.enabled ?? false, hasKey: !!saved?.secret })
  const active = () => !!saved?.enabled && !!saved.secret
  ipcMain.handle('cloud:get', view)
  ipcMain.handle('cloud:save', (_, input: { enabled: boolean; url: string; model: string; key: string }) => {
    if (!input || typeof input.enabled !== 'boolean' || typeof input.key !== 'string') throw new Error('Invalid configuration')
    const url = endpoint(input.url), model = input.model.trim()
    if (!model || model.length > 200) throw new Error('Enter a model name.')
    let secret = saved?.secret
    if (input.key.trim()) {
      if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) throw new Error('Secure key storage unavailable.')
      secret = safeStorage.encryptString(input.key.trim()).toString('base64')
    } else if (saved && url !== saved.url) secret = undefined
    if (input.enabled && !secret) throw new Error('Enter an API Key for this URL.')
    const next = { enabled: input.enabled, url, model, secret }
    updateSettings(file, { cloud: next })
    saved = next
    changed()
    return view()
  })
  return { active, config(): CloudOptions {
    if (!saved || !active()) throw new Error('Cloud model is not configured')
    return { url: saved.url, model: saved.model, key: safeStorage.decryptString(Buffer.from(saved.secret!, 'base64')) }
  } }
}
