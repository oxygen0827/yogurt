import { useEffect, useRef, useState } from 'react'
import { language } from '../../../shared/i18n'
import { clock } from '../../../shared/transcript'
import type { SpeakerReview } from '../../../shared/types'

export function SpeakerSettings({ reveal, openMeeting }: { reveal: boolean; openMeeting: (id: string) => void }) {
  const zh = language().startsWith('zh')
  const [host, setHost] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [message, setMessage] = useState('')
  const [profiles, setProfiles] = useState<string[]>()
  const [meetings, setMeetings] = useState<Awaited<ReturnType<typeof window.yogurt.speakers.meetings>>>()
  const [meeting, setMeeting] = useState('')
  const [editing, setEditing] = useState<{ name: string; next: string }>()
  const [removing, setRemoving] = useState<string>()
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const loadFailed = zh ? '无法读取声纹库或录音列表。' : 'Could not read the voice library or recordings.'
  useEffect(() => {
    let active = true
    void Promise.all([window.yogurt.speakers.host(), window.yogurt.speakers.profiles()]).then(([host, profiles]) => {
      if (active) { setHost(host); setEnabled(!!host); setProfiles(profiles) }
    }, () => { if (active) setStatus(loadFailed) })
    return () => { active = false }
  }, [loadFailed])
  useEffect(() => {
    if (reveal) {
      heading.current?.scrollIntoView({ block: 'start' })
      heading.current?.focus({ preventScroll: true })
    }
  }, [reveal])
  async function save() {
    try {
      await window.yogurt.speakers.setHost(host.trim())
      setEnabled(!!host.trim())
      setMessage(zh ? '已保存' : 'Saved')
    } catch { setMessage(zh ? '请输入有效的 SSH 主机别名' : 'Enter a valid SSH host alias') }
  }
  async function changeProfile(action: () => Promise<boolean>, success: string, failure: string) {
    setPending(true)
    setStatus('')
    try {
      if (!await action()) { setStatus(failure); return }
      setProfiles(await window.yogurt.speakers.profiles())
      setEditing(undefined)
      setRemoving(undefined)
      setStatus(success)
    } catch { setStatus(zh ? '无法保存声纹库。' : 'Could not save the voice library.') }
    finally { setPending(false) }
  }
  return <>
    <h2 ref={heading} tabIndex={-1} className="settings-section-heading">{zh ? '会后说话人识别' : 'Post-meeting speaker identification'}</h2>
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
    <h2 className="settings-section-heading">{zh ? '声纹库' : 'Voice library'}</h2>
    <div className="settings-group settings-backup" data-testid="voice-library">
      <p className="settings-description">{zh
        ? '声纹保存在本机。改名或删除会影响今后的匹配，已保存的会议标注会保留。'
        : 'Voice profiles are stored on this computer. Renaming or deleting affects future matches. Saved meeting labels are kept.'}</p>
      {profiles?.length === 0 && <p className="mt-3">{zh ? '还没有登记声纹。' : 'No enrolled speakers yet.'}</p>}
      <ul className="mt-3 grid gap-2">
        {profiles?.map(name => <li key={name} className="flex flex-wrap items-center gap-2">
          {editing?.name === name ? <>
            <input aria-label={zh ? '声纹姓名' : 'Profile name'} maxLength={80} value={editing.next}
              onChange={e => setEditing({ name, next: e.target.value })} autoFocus />
            <button className="workspace-button" disabled={pending || !editing.next.trim()} onClick={() => void changeProfile(
              () => window.yogurt.speakers.renameProfile(name, editing.next),
              zh ? '姓名已更新。' : 'Name updated.',
              zh ? '无法改名，请检查姓名是否重复。' : 'Could not rename. Check for a duplicate name.',
            )}>{zh ? '保存' : 'Save'}</button>
            <button className="workspace-button" disabled={pending} onClick={() => setEditing(undefined)}>{zh ? '取消' : 'Cancel'}</button>
          </> : <>
            <span className="min-w-0 flex-1 break-words">{name}</span>
            {removing === name ? <>
              <button className="workspace-button text-danger" disabled={pending} onClick={() => void changeProfile(
                () => window.yogurt.speakers.removeProfile(name),
                zh ? '声纹已从匹配库移除。' : 'Voice profile removed.',
                zh ? '无法移除声纹。' : 'Could not remove the voice profile.',
              )}>{zh ? '确认删除' : 'Confirm deletion'}</button>
              <button className="workspace-button" disabled={pending} onClick={() => setRemoving(undefined)}>{zh ? '取消' : 'Cancel'}</button>
            </> : <>
              <button className="workspace-button" disabled={pending} onClick={() => { setRemoving(undefined); setEditing({ name, next: name }) }}>{zh ? '改名' : 'Rename'}</button>
              <button className="workspace-button" disabled={pending} onClick={() => { setEditing(undefined); setRemoving(name) }}>{zh ? '删除声纹' : 'Delete profile'}</button>
            </>}
          </>}
        </li>)}
      </ul>
      <details className="mt-4" onToggle={e => {
        if (e.currentTarget.open) void window.yogurt.speakers.meetings().then(setMeetings, () => setStatus(loadFailed))
      }}>
        <summary>{zh ? '从会议录音标注说话人' : 'Label speakers from a meeting recording'}</summary>
        {meetings?.length === 0 && <p className="mt-2">{zh ? '最近的会议没有可用的对方录音。' : 'No recent meetings have a remote audio track.'}</p>}
        {meetings && meetings.length > 0 && <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1">{zh ? '最近有录音的会议' : 'Recent meetings with recordings'}
            <select className="block w-full" value={meeting} onChange={e => setMeeting(e.target.value)}>
              <option value="">{zh ? '选择会议' : 'Select a meeting'}</option>
              {meetings.map(({ id, title, startedAt }) => <option key={id} value={id}>{new Intl.DateTimeFormat(language()).format(startedAt)} · {title}</option>)}
            </select>
          </label>
          <button className="workspace-button" disabled={!meeting} onClick={() => openMeeting(meeting)}>{zh ? '打开标注' : 'Open labeling'}</button>
        </div>}
        {!enabled && <p className="settings-description">{zh ? '分析新录音前，请先在上方保存 Spark SSH 别名。' : 'Save a Spark SSH alias above before analyzing a new recording.'}</p>}
      </details>
      {status && <p className="mt-2" role="status">{status}</p>}
    </div>
  </>
}

export function MeetingSpeakers({ id, initialOpen }: { id: string; initialOpen: boolean }) {
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
  if (!review) return null
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
  return <details className="mx-4 my-3" open={initialOpen || review.busy || (!!review.voices.length && !review.applied) || undefined}>
    <summary>{zh ? '标注说话人' : 'Label speakers'}</summary>
    {review.busy ? <p role="status">{zh ? '正在分析录音…' : 'Analyzing recording…'}</p> :
      <>
        {review.applied && <p>{zh ? '已更新转写标注' : 'Speaker labels saved'}</p>}
        {(review.failed || error) && <p role="alert">{zh ? '处理失败。请检查 Spark 连接和录音，然后重试。' : 'Check the Spark connection and recording, then retry.'}</p>}
        {review.enabled ? <button className="workspace-button" onClick={() => void analyze()} disabled={applying}>{zh ? '分析录音' : 'Analyze recording'}</button>
          : <button className="workspace-button" onClick={() => window.yogurt.nav.go('/settings/speakers')}>{zh ? '设置会后说话人识别' : 'Set up post-meeting speaker identification'}</button>}
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
