import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Badge, EmptyState, PageHeader, Skeleton, Spinner } from '../components/ui'
import Icon from '../components/Icon'
import { formatDate, cx } from '../lib/utils'

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
    const { error } = await supabase.from('feedback').insert({
      creator_id: user.id,
      type,
      message: message.trim(),
      page: document.referrer ? new URL(document.referrer).pathname : null,
    })
    setBusy(false)
    if (error) return
    setMessage('')
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

      <form onSubmit={submit} className="card mb-10 !p-6 sm:!p-8">
        {/* Type toggle */}
        <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-cloud p-1">
          {[
            { key: 'bug', label: 'Report a bug', icon: 'bug' },
            { key: 'feature', label: 'Suggest a feature', icon: 'bulb' },
          ].map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setType(o.key)}
              className={cx(
                'flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors',
                type === o.key ? 'bg-white text-brand shadow-card' : 'text-smoke hover:text-ink'
              )}
            >
              <Icon name={o.icon} className="h-4 w-4" /> {o.label}
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

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-smoke">{sent && <span className="font-medium text-green-700">Thanks! Your report was sent to the team. 🙌</span>}</p>
          <button type="submit" disabled={busy || !message.trim()} className="btn-primary">
            {busy ? <><Spinner className="h-4 w-4" /> Sending…</> : 'Send to the team'}
          </button>
        </div>
      </form>

      {/* The creator's own history */}
      <h2 className="mb-4 text-lg font-semibold">Your reports</h2>
      {loading ? (
        <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : mine.length === 0 ? (
        <EmptyState icon={<Icon name="chat" className="h-7 w-7" />} title="No reports yet" hint="Anything you send will show up here so you can track it." />
      ) : (
        <div className="space-y-3">
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
                {f.admin_note && (
                  <p className="mt-3 rounded-xl bg-brand-tint/60 px-3 py-2 text-xs text-ink">
                    <span className="font-semibold text-brand">Team reply: </span>{f.admin_note}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
