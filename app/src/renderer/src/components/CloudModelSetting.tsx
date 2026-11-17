import { useEffect, useState } from 'react'
import { language } from '../../../shared/i18n'

export function CloudModelSetting() {
  const zh = language().startsWith('zh')
  const [form, setForm] = useState<Awaited<ReturnType<typeof window.yogurt.cloud.get>>>()
  const [key, setKey] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { void window.yogurt.cloud.get().then(setForm).catch(e => setMessage(String(e))) }, [])
  const save = async () => {
    if (!form) return
    setBusy(true)
    try {
      setForm(await window.yogurt.cloud.save({ ...form, key }))
      setKey('')
      setMessage(zh ? '配置已保存' : 'Settings saved')
    } catch (e) { setMessage(String(e)) } finally { setBusy(false) }
  }
  return <>
    <h2 className="settings-section-heading">{zh ? '纪要与问答模型' : 'Model for notes and Ask'}</h2>
    <div className="settings-group settings-backup">
      {form && <fieldset disabled={busy} className="grid gap-3">
        <label><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} /> {zh ? '使用云端模型' : 'Use cloud model'}</label>
        <p className="settings-description">{zh ? '启用后，生成纪要和回答问题所需的转写、笔记及问题会发送到下方地址。' : 'The transcript, notes and questions needed for each request are sent to this endpoint.'}</p>
        <label>API URL<input className="block w-full" type="url" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} /></label>
        <label>{zh ? '模型名称' : 'Model'}<input className="block w-full" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} /></label>
        <label>API Key<input className="block w-full" type="password" autoComplete="off" value={key}
          placeholder={form.hasKey ? (zh ? '已保存，留空保留原密钥' : 'Saved. Leave blank to keep key') : ''}
          onChange={e => setKey(e.target.value)} /></label>
        <button className="workspace-button w-fit" onClick={() => void save()}>{zh ? '保存配置' : 'Save settings'}</button>
      </fieldset>}
      {message && <p role="status">{message}</p>}
    </div>
  </>
}
