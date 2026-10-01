import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useT } from '../../lib/i18n'
import { flagFromIso } from '../../lib/flags'
import { cx, formatDate } from '../../lib/utils'
import { notice } from '../../lib/confirm'
import Icon from '../Icon'
import { Modal } from '../ui'

// WHAT THE OTHER MARKETS ARE RUNNING (1 Oct 2026).
//
// Ethan: "for creators in the UK community they should be able to scroll down
// and above archived it should show the Portugal and Spanish challenge but
// greyed out, this is just to show that there are other challenges running.
// And clicking on it should show a popup ... to request to join a market and
// say why you would like to create content for that market and take part in
// that challenge. All admins, anyone on the Tryp.com team should be able to go
// in and view other challenges as they could learn from them."
//
// A creator cannot read another market's live challenge (RLS, rightly), so the
// window comes from `other_market_challenges()` (migration 308): title, market,
// dates and counts, nothing from the brief. The team can read every challenge
// already, so for them the rows are the page's own and each card opens it.
export default function OtherMarketChallenges({ staffRows = null, communities = [] }) {
  const tr = useT()
  const { user } = useAuth()
  const staff = Array.isArray(staffRows)
  const [rows, setRows] = useState(null)
  const [asking, setAsking] = useState(null) // the challenge whose pop-up is open
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (staff) return undefined
    let alive = true
    supabase.rpc('other_market_challenges').then(({ data, error }) => {
      if (alive) setRows(error ? [] : (data ?? []))
    })
    return () => { alive = false }
  }, [staff])

  const list = staff
    ? staffRows.map((c) => {
      const m = communities.find((x) => x.id === c.community_id)
      return {
        id: c.id, title: c.title, community_id: c.community_id, market_name: m?.name ?? '',
        country_codes: m?.country_codes ?? [], end_date: c.end_date, start_date: c.start_date,
        entries: c.submissions?.[0]?.count ?? 0,
      }
    })
    : (rows ?? [])
  if (list.length === 0) return null

  async function sendRequest(e) {
    e.preventDefault()
    if (!asking || !user?.id) return
    const why = note.trim()
    if (why.length < 10) return
    setSending(true)
    const { error } = await supabase.from('market_join_requests').insert({
      community_id: asking.community_id, profile_id: user.id, note: why, challenge_id: asking.id,
    })
    setSending(false)
    // 23505 is the "one open request per market" index: they already asked.
    if (error && error.code !== '23505') {
      notice(tr('Could not send that request: {msg}', { msg: error.message }))
      return
    }
    setRows((cur) => (cur ?? []).map((r) => (r.community_id === asking.community_id ? { ...r, join_state: 'pending' } : r)))
    notice(tr('Request sent to the {market} team. They will let you know.', { market: asking.market_name }))
    setAsking(null)
    setNote('')
  }

  return (
    <section>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-smoke">{tr('Running in other markets')}</h2>
        <p className="mt-1 text-sm text-smoke">
          {staff
            ? tr('Every market\'s live challenge, so the team can see how each one is going.')
            : tr('Other Tryp.com markets are running these right now. Want to create for one of them? Ask to join.')}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {list.map((c) => {
          const flags = (c.country_codes || []).map(flagFromIso).join('')
          const body = (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-cloud px-2.5 py-1 text-xs font-semibold text-ink">
                  {flags && <span aria-hidden className="text-sm leading-none">{flags}</span>}
                  <span className="truncate">{c.market_name}</span>
                </span>
                <span className="shrink-0 text-xs text-smoke">{tr('Closes {date}', { date: formatDate(c.end_date) })}</span>
              </div>
              <h3 className="mt-3 line-clamp-2 text-lg font-semibold leading-snug text-ink">{c.title}</h3>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                <span className="text-smoke">
                  {Number(c.entries) === 1 ? tr('1 entry so far') : tr('{n} entries so far', { n: Number(c.entries) || 0 })}
                </span>
                {staff ? (
                  <span className="font-semibold text-brand">{tr('View challenge')} →</span>
                ) : c.join_state === 'pending' ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-smoke">
                    <Icon name="check" className="h-3.5 w-3.5" />{tr('Request sent')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-semibold text-brand">
                    <Icon name="lock" className="h-3.5 w-3.5" />{tr('Ask to join')}
                  </span>
                )}
              </div>
            </>
          )
          return staff ? (
            <Link
              key={c.id}
              to={`/challenges/${c.id}`}
              className="card block transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift"
            >
              {body}
            </Link>
          ) : (
            <button
              key={c.id}
              type="button"
              onClick={() => { setAsking(c); setNote('') }}
              // GREYED, NOT HIDDEN: it is somebody else's challenge, shown so
              // you know it exists. Full colour comes back on hover/press so the
              // card still reads as something you can open.
              className={cx(
                'card block w-full text-left opacity-60 grayscale transition-all duration-200',
                'border-dashed hover:-translate-y-0.5 hover:opacity-100 hover:grayscale-0 hover:shadow-lift focus-visible:opacity-100 focus-visible:grayscale-0',
              )}
            >
              {body}
            </button>
          )
        })}
      </div>

      {!staff && (
        <Modal open={!!asking} onClose={() => setAsking(null)} title={asking ? tr('Join {market} to take part', { market: asking.market_name }) : ''}>
          {asking && (
            <form onSubmit={sendRequest} className="space-y-4" noValidate>
              <div className="rounded-xl bg-cloud/60 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-smoke">{asking.market_name}</p>
                <p className="mt-0.5 font-semibold text-ink">{asking.title}</p>
                <p className="mt-0.5 text-xs text-smoke">{formatDate(asking.start_date)} → {formatDate(asking.end_date)}</p>
              </div>
              <p className="text-sm text-ink/80">
                {tr('This challenge is for creators in the {market} community. Ask to join it and tell the team why you would like to create content for {market} and take part.', { market: asking.market_name })}
              </p>
              {asking.join_state === 'pending' ? (
                <p className="flex items-center gap-2 rounded-xl border border-brand/20 bg-brand-tint/40 px-4 py-3 text-sm font-medium text-ink">
                  <Icon name="check" className="h-4 w-4 text-brand" />
                  {tr('You have already asked to join {market}. The team will let you know.', { market: asking.market_name })}
                </p>
              ) : (
                <>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-ink">{tr('Why would you like to join?')}</span>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={4}
                      maxLength={600}
                      className="input no-ios-zoom w-full resize-none"
                      placeholder={tr('For example: I travel there often, I speak the language, my audience is there...')}
                    />
                    <span className="mt-1 block text-right text-[11px] text-smoke">{note.trim().length < 10 ? tr('A sentence or two, please.') : `${note.length}/600`}</span>
                  </label>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setAsking(null)} className="btn-secondary">{tr('Cancel')}</button>
                    <button type="submit" disabled={sending || note.trim().length < 10} className="btn-primary disabled:opacity-50">
                      {sending ? tr('Sending...') : tr('Send request')}
                    </button>
                  </div>
                </>
              )}
            </form>
          )}
        </Modal>
      )}
    </section>
  )
}
