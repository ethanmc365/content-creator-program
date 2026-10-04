import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Avatar, Modal, Skeleton, Spinner } from '../ui'
import Icon from '../Icon'
import FlagTile from '../network/FlagTile'
import { notice } from '../../lib/confirm'
import { copyToClipboard, emailList } from '../../lib/clipboard'
import { toastSuccess } from '../../lib/toast'
import { cx, timeAgo } from '../../lib/utils'

// WHO HAS NOT POSTED YET (built 4 Oct 2026, migration 325; rebuilt the same day, migration 332).
//
// Ethan, on getting the global challenge past 50 creators: "check what creators have actually been on the platform, how many have been
// on since this challenge started and have not posted, and how many haven't been on at all ... why are we not getting them engaged?"
// And on the first version: "build it better. I want to be able to see market by market ... more like the Participation by market with
// those nice charts, gradients, numbers ... clicking on Spain, UK, Ireland or Portugal should show the people who participated and who
// didn't. I can easily re-try to send a push to them. And for the ones that never opened the app, a button to copy all the emails."
//
// The funnel, in the order a creator moves through it: in the audience -> opened the platform since it started -> posted. The people who
// have not posted are split four ways, because the message to somebody who was here yesterday is not the one for somebody who never opened it:
//   looked     on the platform since the challenge started, no entry
//   quiet      on the platform before it started, not since
//   never      has never opened it (no sign of life at all)
// "On the platform" is the latest of every sign of life the database keeps - the heartbeat, a later sign-in, a room or message read, a
// push they tapped (migration 332) - not the heartbeat alone, which under-reported anybody whose phone sleeps the app.
// Each market is a row; opening it lists who posted and who did not, with a push to a group and the emails of the ones a push cannot reach.

const SEGMENTS = {
  seen: {
    icon: 'eye', title: 'Looked, did not post', hint: 'On the platform since it started',
    title_default: 'Your country is waiting', body_default: 'The Global Challenge is live and your country is on the leaderboard. One video from you moves it up.',
  },
  dormant: {
    icon: 'clock', title: 'Quiet since it started', hint: 'Here before, not since',
    title_default: 'We saved you a spot', body_default: 'The Global Challenge started while you were away. It takes one video to join, and there are points for every post.',
  },
  never: {
    icon: 'alert', title: 'Never opened the app', hint: 'No visit on record',
    title_default: 'Your community is waiting', body_default: 'Open Tryp.com Creators and join the Global Challenge. Post one video and you are on the board.',
  },
}
const STATE_ORDER = ['posted', 'seen', 'dormant', 'never']
const STATE_LABEL = { posted: 'Posted', seen: 'Looked, did not post', dormant: 'Quiet since it started', never: 'Never opened the app' }
const STATE_TONE = { posted: 'bg-gradient-to-r from-brand to-brand-light', seen: 'bg-brand-light/50', dormant: 'bg-gray-300', never: 'bg-gray-200' }

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)

export default function ChallengeReach({ challenge }) {
  const [d, setD] = useState(undefined)
  const [sheet, setSheet] = useState(null) // { segment, market }
  const [openMarket, setOpenMarket] = useState(null)
  const [grown, setGrown] = useState(false)
  const [goal, setGoal] = useState(() => { try { return Number(localStorage.getItem(`tryp_reach_goal_${challenge.id}`)) || 50 } catch { return 50 } })

  useEffect(() => {
    let alive = true
    supabase.rpc('challenge_reach', { p_challenge: challenge.id }).then(({ data, error }) => { if (alive) setD(error ? null : data) })
    return () => { alive = false }
  }, [challenge.id])
  useEffect(() => {
    if (!d) return undefined
    const t = setTimeout(() => setGrown(true), 60)
    return () => clearTimeout(t)
  }, [d])
  const saveGoal = (n) => { setGoal(n); try { localStorage.setItem(`tryp_reach_goal_${challenge.id}`, String(n)) } catch { /* private mode */ } }

  const people = useMemo(() => d?.people || [], [d])
  const byMarket = useMemo(() => {
    const m = new Map()
    for (const p of people) { if (!m.has(p.market)) m.set(p.market, []); m.get(p.market).push(p) }
    return m
  }, [people])

  if (d === undefined) return <section className="card mb-10" aria-busy="true"><Skeleton className="h-6 w-56" /><Skeleton className="mt-5 h-24 w-full" /></section>
  if (!d) return null

  const step = [
    { label: 'In the audience', n: d.audience, sub: 'active creators' },
    { label: 'Opened the app since it started', n: d.seen, sub: `${pct(d.seen, d.audience)}% of them` },
    { label: 'Posted an entry', n: d.posted, sub: `${pct(d.posted, d.seen)}% of those who looked` },
  ]
  const toGoal = Math.max(0, goal - d.posted)
  const top = Math.max(1, ...(d.markets || []).map((m) => m.audience))

  return (
    <section className="card mb-10 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-semibold">Who has not posted yet</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-smoke">
            {d.seen_not_posted} creators have opened the platform since this challenge started and have not entered. {d.never} have never opened it at all.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-smoke">
          Goal
          <input
            className="input !w-16 !py-1.5 text-center text-sm" inputMode="numeric" value={goal}
            onChange={(e) => saveGoal(Number(e.target.value.replace(/[^\d]/g, '')) || 0)} aria-label="Creators to reach"
          />
          creators
        </label>
      </div>

      {/* the goal, as a bar */}
      <div className="mt-5">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold text-ink">{d.posted} of {goal} creators have entered</span>
          <span className="text-xs font-semibold text-smoke">{toGoal > 0 ? `${toGoal} to go` : 'Goal reached'}</span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-cloud" role="progressbar" aria-valuenow={d.posted} aria-valuemax={goal}>
          <div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-[width] duration-1000 ease-out" style={{ width: grown ? `${Math.min(100, goal ? (d.posted / goal) * 100 : 0)}%` : '0%' }} />
        </div>
        {toGoal > 0 && d.seen_not_posted > 0 && (
          <p className="mt-2 text-xs text-smoke">
            If {Math.ceil(toGoal / Math.max(1, d.seen_not_posted) * 100)}% of the {d.seen_not_posted} who have looked posted once, the goal is reached.
          </p>
        )}
      </div>

      {/* the funnel */}
      <ol className="mt-6 grid gap-3 sm:grid-cols-3">
        {step.map((s, i) => (
          <li key={s.label} className="rounded-xl bg-cloud/60 px-4 py-3.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{s.label}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-ink">{s.n}</p>
            <p className="text-xs text-smoke">{s.sub}</p>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-[width] duration-700" style={{ width: grown ? `${pct(s.n, d.audience)}%` : '0%', transitionDelay: `${i * 90}ms` }} /></div>
          </li>
        ))}
      </ol>

      {/* market by market */}
      <div className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">Market by market</h3>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-smoke">
            {STATE_ORDER.map((k) => <span key={k} className="inline-flex items-center gap-1.5"><span className={cx('h-2 w-2 rounded-full', STATE_TONE[k])} />{STATE_LABEL[k]}</span>)}
          </p>
        </div>
        <ul className="mt-3 space-y-2">
          {(d.markets || []).map((m, i) => {
            const rows = byMarket.get(m.name) || []
            const open = openMarket === m.name
            return (
              <li key={m.name} className={cx('overflow-hidden rounded-card border bg-white transition-shadow duration-200', open ? 'border-brand/30 shadow-lift' : 'border-gray-100 shadow-card')}>
                <button type="button" onClick={() => setOpenMarket(open ? null : m.name)} aria-expanded={open} className="group flex w-full items-center gap-3 px-3.5 py-3 text-left">
                  {m.codes?.length > 0
                    ? <FlagTile codes={m.codes} size="h-7 w-7" />
                    : <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-cloud text-base leading-none" aria-hidden>🌍</span>}
                  <span className="w-28 shrink-0 truncate text-sm font-semibold text-ink sm:w-36">{m.name}</span>
                  <span className="relative hidden h-5 min-w-0 flex-1 overflow-hidden rounded-md bg-cloud/70 sm:flex" style={{ maxWidth: `${Math.max(18, (m.audience / top) * 100)}%` }}>
                    {[['posted', m.posted], ['seen', m.seen_not_posted], ['dormant', m.dormant], ['never', m.never]].map(([k, n], j) => (
                      <span key={k} className={cx('h-full transition-[width] duration-700 ease-out', STATE_TONE[k])} style={{ width: grown ? `${pct(n, m.audience)}%` : '0%', transitionDelay: `${Math.min(i, 8) * 45 + j * 60}ms` }} title={`${STATE_LABEL[k]}: ${n}`} />
                    ))}
                  </span>
                  <span className="ml-auto flex shrink-0 items-baseline gap-1 tabular-nums">
                    <span className="text-base font-bold text-ink">{m.posted}</span>
                    <span className="text-xs text-smoke">of {m.audience} posted</span>
                  </span>
                  <Icon name="chevronDown" className={cx('h-4 w-4 shrink-0 text-gray-300 transition-transform duration-200 group-hover:text-brand', open && 'rotate-180 text-brand')} />
                </button>
                {open && (
                  <div className="animate-tab-in border-t border-gray-100 bg-cloud/30 px-3.5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {Object.keys(SEGMENTS).map((key) => {
                        const n = key === 'seen' ? m.seen_not_posted : m[key]
                        return (
                          <button key={key} type="button" disabled={!n} onClick={() => setSheet({ segment: key, market: m.name })}
                            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand hoverable:hover:text-brand disabled:opacity-40">
                            <Icon name="bell" className="h-3.5 w-3.5 text-brand" />Push the {n} {key === 'seen' ? 'who looked' : key === 'dormant' ? 'who went quiet' : 'who never opened it'}
                          </button>
                        )
                      })}
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      {STATE_ORDER.map((k) => {
                        const list = rows.filter((p) => p.state === k)
                        if (!list.length) return null
                        return (
                          <div key={k}>
                            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400"><span className={cx('h-2 w-2 rounded-full', STATE_TONE[k])} />{STATE_LABEL[k]} · {list.length}</p>
                            <ul className="max-h-64 divide-y divide-gray-50 overflow-y-auto rounded-xl border border-gray-100 bg-white">
                              {list.map((p) => <PersonRow key={p.id} p={p} />)}
                            </ul>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      {/* everyone who has not entered, across every market */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {Object.entries(SEGMENTS).map(([key, seg]) => {
          const n = d[key === 'seen' ? 'seen_not_posted' : key]
          return (
            <button key={key} type="button" onClick={() => setSheet({ segment: key, market: null })} disabled={!n}
              className="group flex flex-col rounded-card border border-gray-100 bg-white p-4 text-left shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lift disabled:opacity-50">
              <span className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400"><Icon name={seg.icon} className="h-3.5 w-3.5 text-brand" />{seg.title}</span>
                <Icon name="chevronRight" className="h-3.5 w-3.5 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
              </span>
              <span className="mt-1.5 text-3xl font-bold tabular-nums text-ink">{n}</span>
              <span className="text-xs text-smoke">{seg.hint}, in every market</span>
              <span className="mt-2 text-xs font-semibold text-brand">See who, push or copy emails</span>
            </button>
          )
        })}
      </div>

      {sheet && (
        <SegmentSheet
          challenge={challenge} segment={sheet.segment} market={sheet.market}
          people={people.filter((p) => p.state === sheet.segment && (!sheet.market || p.market === sheet.market))}
          onClose={() => setSheet(null)}
        />
      )}
    </section>
  )
}

function PersonRow({ p }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <Avatar src={p.photo} name={p.name} size="xs" />
      <Link to={`/profile/${p.id}`} className="min-w-0 flex-1 hover:text-brand">
        <span className="block truncate text-sm font-semibold text-ink">{p.name}</span>
        <span className="block truncate text-[11px] text-smoke" title={p.active_at || ''}>{p.active_at ? `last on ${timeAgo(p.active_at)}` : p.joined ? `joined ${timeAgo(p.joined)}, never on` : 'never on'}</span>
      </Link>
      <span title={p.push ? 'Has push notifications on' : 'No push notifications'} className={cx('shrink-0', p.push ? 'text-brand' : 'text-gray-300')}><Icon name="bell" className="h-4 w-4" /></span>
    </li>
  )
}

function SegmentSheet({ challenge, segment, market, people, onClose }) {
  const seg = SEGMENTS[segment]
  const [title, setTitle] = useState(seg.title_default)
  const [body, setBody] = useState(seg.body_default)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(null)
  const [copying, setCopying] = useState(false)

  async function send() {
    setSending(true)
    const { data, error } = await supabase.rpc('challenge_nudge', { p_challenge: challenge.id, p_segment: segment, p_title: title, p_body: body, p_market: market })
    setSending(false)
    if (error) { notice(error.message, { title: 'That did not send' }); return }
    setSent(data)
  }
  async function copyEmails() {
    setCopying(true)
    const { data, error } = await supabase.rpc('challenge_reach_emails', { p_challenge: challenge.id, p_segment: segment, p_market: market })
    setCopying(false)
    if (error) { notice(error.message, { title: 'Could not get the emails' }); return }
    const text = emailList(data || [])
    if (!text) { toastSuccess('No email addresses to copy.'); return }
    if (!await copyToClipboard(text)) { notice('Could not reach the clipboard.'); return }
    toastSuccess(`${(data || []).length} email addresses copied.`)
  }

  return (
    <Modal open onClose={onClose} title={`${seg.title}${market ? ` · ${market}` : ''}`} wide>
      <div className="space-y-5">
        {sent != null ? (
          <p className="rounded-xl bg-brand-tint/50 px-4 py-6 text-center text-sm font-semibold text-ink">Sent to {sent} creators. It is in their notifications now, and a push went to anybody who has them on.</p>
        ) : (
          <div className="space-y-3 rounded-card border border-gray-100 bg-cloud/50 p-4">
            <p className="text-sm font-semibold text-ink">Send these {people.length} creators a push</p>
            <input className="input" maxLength={70} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />
            <textarea className="input min-h-[80px]" maxLength={300} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Message" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] text-smoke">Only people who have not entered get it. Tapping it opens this challenge.</p>
              <button type="button" onClick={send} disabled={sending || !title.trim() || !body.trim()} className="btn-primary !py-2 text-sm">{sending ? <Spinner className="h-4 w-4" /> : <Icon name="bell" className="h-4 w-4" />}Send</button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 px-3.5 py-3">
          <p className="text-xs leading-relaxed text-smoke">{people.filter((p) => !p.push).length} of these have no push notifications on, so they will not see a push. {segment === 'never' ? 'They have never opened the app, so email is the way to reach them.' : 'Email reaches them anyway.'}</p>
          <button type="button" onClick={copyEmails} disabled={copying || !people.length} className="btn-secondary !py-2 text-xs">{copying ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="copy" className="h-3.5 w-3.5" />}Copy all {people.length} emails</button>
        </div>
        <ul className="max-h-80 divide-y divide-gray-50 overflow-y-auto rounded-xl border border-gray-100">
          {people.map((p) => <PersonRow key={p.id} p={p} />)}
        </ul>
      </div>
    </Modal>
  )
}
