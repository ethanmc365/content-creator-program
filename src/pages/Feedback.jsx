import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Badge, EmptyState, PageHeader, Skeleton, Spinner } from '../components/ui'
import Icon from '../components/Icon'
import Reveal from '../components/network/Reveal'
import { compressImage } from '../lib/image'
import { uploadFile } from '../lib/upload'
import { formatDate, cx } from '../lib/utils'
import { safeUrl } from '../lib/safeUrl'

// How a creator's own past reports are labelled back to them.
const STATUS = {
  new: { label: 'Received', tone: 'amber' },
  planned: { label: 'Planned', tone: 'light' },
  in_progress: { label: 'In progress', tone: 'brand' },
  done: { label: 'Done', tone: 'green' },
  declined: { label: 'Not planned', tone: 'grey' },
}

export default function Feedback() {
  const { user } = useAuth()
  const [type, setType] = useState('bug')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [mine, setMine] = useState([])
  const [loading, setLoading] = useState(true)
  const [shot, setShot] = useState(null) // { file, preview }
  const [shotError, setShotError] = useState('')
  const fileRef = useRef(null)

  function pickShot(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setShotError('')
    setShot({ file, preview: URL.createObjectURL(file) })
  }

  async function load() {
    const { data } = await supabase
      .from('feedback')
      .select('*')
      .eq('creator_id', user.id)
      .order('created_at', { ascending: false })
    setMine(data ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e) {
    e.preventDefault()
    if (!message.trim() || busy) return
    setBusy(true)
    // Optional screenshot: compressed then routed through the upload proxy
    // (same reliable path as chat images).
    let screenshot_url = null
    if (shot) {
      try {
        const compressed = await compressImage(shot.file, { maxDim: 1280 })
        const ext = (compressed.type || 'image/jpeg').split('/')[1] || 'jpg'
        const path = `${user.id}/feedback-${crypto.randomUUID()}.${ext}`
        screenshot_url = await uploadFile('chat-media', path, compressed, compressed.type)
      } catch (err) {
        setBusy(false)
        setShotError(err.message || 'That image could not be processed. Try a different one.')
        return
      }
    }
    const { error } = await supabase.from('feedback').insert({
      creator_id: user.id,
      type,
      message: message.trim(),
      page: document.referrer ? new URL(document.referrer).pathname : null,
      screenshot_url,
    })
    setBusy(false)
    if (error) return
    setMessage('')
    setShot(null)
    setSent(true)
    load()
    setTimeout(() => setSent(false), 3000)
  }

  return (
    <div className="page max-w-3xl">
      <PageHeader
        title="Report a bug or suggest a feature"
        subtitle="Spotted something broken, or have an idea to make the program better? Tell us, every report goes straight to the Tryp.com team."
      />

      <Reveal from="down">
      <form onSubmit={submit} className="card mb-10 !p-6 sm:!p-8">
        {/* THE TYPE TOGGLE, WHICH DID NOT SURVIVE A PHONE.
            Both halves were a single centred ROW of icon-then-label, and at
            375px "Suggest a feature" is wider than half a card - so the label
            wrapped to two lines, the icon (which had no `shrink-0`) was
            squeezed to a sliver by the flex algorithm to make room, and the two
            halves ended up different heights with everything sitting off
            centre. That is the reported "the icon and text isn't centred".
            Below `sm` the icon now sits ABOVE the label, where a wrap costs
            nothing; from `sm` up, where the row genuinely fits, it is a row
            again. `shrink-0` on the icon and `items-stretch` on the track mean
            neither half can ever be squashed or come out shorter than the other
            whatever the labels say. */}
        <div className="mb-5 grid grid-cols-2 items-stretch gap-2 rounded-2xl bg-cloud p-1">
          {[
            { key: 'bug', label: 'Report a bug', icon: 'bug' },
            { key: 'feature', label: 'Suggest a feature', icon: 'bulb' },
          ].map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setType(o.key)}
              aria-pressed={type === o.key}
              className={cx(
                'flex flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-3 text-center text-sm font-semibold leading-tight transition-all duration-200',
                'sm:flex-row sm:gap-2 sm:py-2.5',
                type === o.key
                  ? 'bg-white text-brand shadow-card'
                  : 'text-smoke hover:text-ink active:scale-[0.98]'
              )}
            >
              <Icon name={o.icon} className="h-4 w-4 shrink-0" />
              <span>{o.label}</span>
            </button>
          ))}
        </div>

        <label htmlFor="fb-message" className="label">
          {type === 'bug' ? 'What went wrong?' : "What's your idea?"}
        </label>
        <textarea
          id="fb-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          maxLength={2000}
          placeholder={type === 'bug'
            ? 'Tell us what happened, what you expected, and where in the app you saw it.'
            : 'Describe your idea and how it would help you as a creator.'}
          className="input w-full resize-y"
        />

        {/* Optional screenshot - half of all bug reports are "it looks wrong" */}
        <div className="mt-4">
          <input ref={fileRef} type="file" accept="image/*,.heic,.heif" className="hidden" onChange={pickShot} />
          {shot ? (
            <div className="flex items-center gap-3">
              <img src={shot.preview} alt="Screenshot to attach" className="h-16 w-16 rounded-xl border border-gray-100 object-cover" />
              <div className="text-xs text-smoke">
                <p className="font-medium text-ink">Screenshot attached</p>
                <button type="button" onClick={() => setShot(null)} className="text-red-500 hover:underline">Remove</button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.currentTarget.blur(); fileRef.current?.click() }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-dashed border-gray-300 px-4 py-2.5 text-xs font-medium text-smoke transition-all duration-200 hover:border-brand hover:text-brand active:scale-[0.98] sm:w-auto sm:py-2"
            >
              <Icon name="image" className="h-4 w-4 shrink-0" /> Attach a screenshot (optional)
            </button>
          )}
          {shotError && <p className="mt-2 text-xs text-red-500">{shotError}</p>}
        </div>

        {/* The confirmation and the button were on one row, so on a phone the
            sentence was squeezed into whatever the button left over and broke
            across three lines. It stacks below `sm`, and the button goes full
            width there because a right-aligned button under a left-aligned
            message reads as two unrelated things. */}
        <div className="mt-4 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          {sent && (
            <p className="animate-fade-up text-xs font-medium text-green-700">
              Thanks, your report is with the team.
            </p>
          )}
          <button type="submit" disabled={busy || !message.trim()} className="btn-primary w-full justify-center sm:ml-auto sm:w-auto">
            {busy ? <><Spinner className="h-4 w-4" /> Sending…</> : 'Send to the team'}
          </button>
        </div>
      </form>
      </Reveal>

      {/* The creator's own history */}
      <Reveal from="down"><h2 className="mb-4 text-lg font-semibold">Your reports</h2></Reveal>
      {loading ? (
        <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : mine.length === 0 ? (
        <EmptyState icon={<Icon name="chat" className="h-7 w-7" />} title="No reports yet" hint="Anything you send will show up here so you can track it." />
      ) : (
        <Reveal className="space-y-3" stagger={0.05}>
          {mine.map((f) => {
            const st = STATUS[f.status] ?? STATUS.new
            return (
              <div key={f.id} className="card !p-5">
                <div className="mb-2 flex items-center gap-2">
                  <Badge tone={f.type === 'feature' ? 'light' : 'grey'}><Icon name={f.type === 'feature' ? 'bulb' : 'bug'} className="h-3.5 w-3.5" />{f.type === 'feature' ? 'Feature' : 'Bug'}</Badge>
                  <Badge tone={st.tone}>{st.label}</Badge>
                  <span className="ml-auto text-xs text-smoke">{formatDate(f.created_at)}</span>
                </div>
                <p className="whitespace-pre-line text-sm text-ink">{f.message}</p>
                {f.screenshot_url && (
                  <a href={safeUrl(f.screenshot_url)} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block">
                    <img src={f.screenshot_url} alt="Attached screenshot" loading="lazy" className="max-h-40 rounded-xl border border-gray-100 object-cover" />
                  </a>
                )}
                {f.admin_note && (
                  <p className="mt-3 rounded-xl bg-brand-tint/60 px-3 py-2 text-xs text-ink">
                    <span className="font-semibold text-brand">Team reply: </span>{f.admin_note}
                  </p>
                )}
              </div>
            )
          })}
        </Reveal>
      )}
    </div>
  )
}
