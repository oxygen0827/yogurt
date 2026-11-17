import { useEffect, useState } from 'react'
import { language } from '../../../shared/i18n'

export function WeTypeSetting() {
  const [state, setState] = useState<{ enabled: boolean; installed: boolean }>()
  const [busy, setBusy] = useState(false)
  useEffect(() => { void window.yogurt.weType.get().then(setState) }, [])
  const toggle = async () => {
    if (!state) return
    setBusy(true)
    try {
      await window.yogurt.weType.set(!state.enabled)
      setState(await window.yogurt.weType.get())
    } finally { setBusy(false) }
  }
  const chinese = language().startsWith('zh')
  return <div className="settings-row">
    <div className="settings-row-copy">
      <p className="settings-label">{chinese ? '微信输入法在线转写（实验）' : 'WeType online transcription (experimental)'}</p>
      <p className="settings-description">{chinese ? '从下一场新会议起，双方的语音片段会发送给微信输入法服务。纪要使用下方配置的模型生成。初次设置或切回本地模型时，请完全退出并重新打开 Yogurt。' : 'Starting with the next new meeting, both audio tracks are sent to WeType. Notes use the model selected below. Restart Yogurt during initial setup or when switching back to a local model.'}</p>
      {state && !state.installed && <p className="settings-description">{chinese ? '需要先安装 VoiceKey 的 vk-test 组件，详见仓库 README。' : 'Install the VoiceKey vk-test helper first. See the repository README.'}</p>}
    </div>
    <input type="checkbox" aria-label="WeType" checked={state?.enabled ?? false} disabled={busy || !state || (!state.installed && !state.enabled)} onChange={() => void toggle()} />
  </div>
}
