import { useEffect, useRef, useState } from 'react'
import { language } from '../../../shared/i18n'
import { clock } from '../../../shared/transcript'
import type { SpeakerReview } from '../../../shared/types'

export function SpeakerSettings() {
  const zh = language().startsWith('zh')
  const [host, setHost] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => { void window.yogurt.speakers.host().then(setHost) }, [])
  async function save() {
    try {
      await window.yogurt.speakers.setHost(host.trim())
      setMessage(zh ? '已保存' : 'Saved')
    } catch { setMessage(zh ? '请输入有效的 SSH 主机别名' : 'Enter a valid SSH host alias') }
  }
  return <>
    <h2 className="settings-section-heading">{zh ? '会后说话人识别' : 'Post-meeting speaker identification'}</h2>
    <div className="settings-group settings-backup">
      <label>{zh ? 'Spark SSH 主机别名' : 'Spark SSH host alias'}
        <input className="block w-full" value={host} onChange={e => { setHost(e.target.value); setMessage('') }} />
      </label>
      <p className="settings-description">{zh
        ? '设置 SSH 别名后，Yogurt 会把对方音轨发到你的 Spark 区分说话人。留空可关闭。'
        : 'Save an SSH alias to send the remote audio track to your Spark for diarization. Leave blank to turn it off.'}</p>
      <button className="workspace-button" onClick={() => void save()}>{zh ? '保存' : 'Save'}</button>
      {message && <p role="status">{message}</p>}
    </div>
  </>
}

export function MeetingSpeakers({ id }: { id: string }) {
  const zh = language().startsWith('zh')
  const [review, setReview] = useState<SpeakerReview>()
  const [names, setNames] = useState<Record<number, string>>({})
  const [error, setError] = useState(false)
  const [applying, setApplying] = useState(false)
  const audio = useRef<HTMLAudioElement>(null)
  const end = useRef(0)
  useEffect(() => {
    let active = true
    function refresh() { void window.yogurt.speakers.get(id).then(review => { if (active) setReview(review) }, () => {}) }
    refresh()
    const off = window.yogurt.speakers.onChange(changed => { if (changed === id) refresh() })
    return () => { active = false; off() }
  }, [id])
  if (!review?.enabled) return null
  async function analyze() {
    setNames({})
    setError(false)
    try { setReview(await window.yogurt.speakers.analyze(id)) } catch { setError(true) }
  }
  async function apply() {
    setError(false)
    setApplying(true)
    try {
      if (!await window.yogurt.speakers.apply(id, review!.voices.map(v => names[v.id] ?? v.name))) setError(true)
    } catch { setError(true) }
    finally { setApplying(false) }
  }
  function listen(ms: number, endMs: number) {
    const player = audio.current
    if (!player) return
    end.current = endMs / 1000
    player.currentTime = ms / 1000
    void player.play().catch(() => setError(true))
  }
  return <details className="mx-4 my-3" open={review.busy || (!!review.voices.length && !review.applied) || undefined}>
    <summary>{zh ? '说话人识别' : 'Speaker identification'}</summary>
    {review.busy ? <p role="status">{zh ? '正在分析录音…' : 'Analyzing recording…'}</p> :
      <>
        {review.applied && <p>{zh ? '已更新转写标注' : 'Speaker labels saved'}</p>}
        {(review.failed || error) && <p role="alert">{zh ? '处理失败。请检查 Spark 连接和录音，然后重试。' : 'Check the Spark connection and recording, then retry.'}</p>}
        <button className="workspace-button" onClick={() => void analyze()} disabled={applying}>{zh ? '分析录音' : 'Analyze recording'}</button>
        {review.voices.length > 0 && <div className="grid gap-2 py-2">
          <p>{zh ? '试听并填写姓名。留空的说话人会保留编号。确认后保存标注和声纹。' : 'Listen and enter names. Unnamed speakers keep their number. Confirm to save labels and enroll voices.'}</p>
          <audio ref={audio} preload="metadata" src={`yogurt-audio://${id}/them`} onTimeUpdate={() => { if (audio.current && audio.current.currentTime >= end.current) audio.current.pause() }} />
          {review.voices.map(voice => <div key={voice.id} className="flex items-center gap-2">
            <button className="workspace-button" onClick={() => listen(voice.sampleMs, voice.sampleEndMs)}>
              {zh ? '试听' : 'Listen'} {clock(voice.sampleMs)}
            </button>
            <label>{zh ? '说话人' : 'Speaker'} {voice.id + 1}{' '}
              <input maxLength={80} value={names[voice.id] ?? voice.name} onChange={e => setNames({ ...names, [voice.id]: e.target.value })} />
            </label>
            {!voice.canEnroll && <span>{zh ? '样本过短' : 'Short sample'}</span>}
          </div>)}
          <button className="workspace-button w-fit" onClick={() => void apply()} disabled={applying}>
            {zh ? '确认姓名并生成纪要' : 'Confirm names and generate summary'}
          </button>
        </div>}
      </>}
  </details>
}
