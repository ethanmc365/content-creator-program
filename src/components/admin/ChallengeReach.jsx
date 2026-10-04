import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Avatar, Modal, Skeleton, Spinner } from '../ui'
import Icon from '../Icon'
import { notice } from '../../lib/confirm'
import { cx, timeAgo } from '../../lib/utils'

// WHO HAS NOT POSTED YET (4 Oct 2026, migration 325).
//
// Ethan, on getting the global challenge past 50 creators: "check what creators have actually been on the platform, how many have been
// on since this challenge started and have not posted, and how many haven't been on at all ... why are we not getting them engaged?"
//
// The funnel, in the order a creator moves through it: in the audience -> opened the platform since it started -> posted. The gap between
// the last two is the people who looked and did not enter, and that is where a nudge pays. They are split three ways, because the
// right message to somebody who was here yesterday is not the one for somebody who has never opened the app:
//   seen      on the platform since the challenge started, no entry
//   dormant   on the platform before it started, not since
//   never     has never opened it
// Each group opens as a list of names, and "Send a push" notifies that group only (challenge_nudge), with the challenge's link on it.

const SEGMENTS = {
  seen: {
    icon: 'eye', title: 'Looked, did not post', hint: 'On the platform since it started',
    title_default: 'Your video is the missing piece', body_default: 'The Global Challenge is live and your country is waiting on you. One video puts it on the leaderboard.',
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

export default function ChallengeReach({ challenge }) {
  const [d, setD] = useState(undefined)
  const [open, setOpen] = useState(null)
  const [goal, setGoal] = useState(() => { try { return Number(localStorage.getItem(`tryp_reach_goal_${challenge.id}`)) || 50 } catch { return 50 } })

  useEffect(() => {
    let alive = true
    supabase.rpc('challenge_reach', { p_challenge: challenge.id }).then(({ data, error }) => { if (alive) setD(error ? null : data) })
    return () => { alive = false }
  }, [challenge.id])
  const saveGoal = (n) => { setGoal(n); try { localStorage.setItem(`tryp_reach_goal_${challenge.id}`, String(n)) } catch { /* private mode */ } }

  if (d === undefined) return <section className="card mb-10" aria-busy="true"><Skeleton className="h-6 w-56" /><Skeleton className="mt-5 h-24 w-full" /></section>
  if (!d) return null

  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)
  const step = [
    { label: 'In the audience', n: d.audience, sub: 'active creators' },
    { label: 'Opened the app since it started', n: d.seen, sub: `${pct(d.seen, d.audience)}% of them` },
    { label: 'Posted an entry', n: d.posted, sub: `${pct(d.posted, d.seen)}% of those who looked` },
  ]
  const toGoal = Math.max(0, goal - d.posted)

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
          <div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-[width] duration-1000 ease-out" style={{ width: `${Math.min(100, goal ? (d.posted / goal) * 100 : 0)}%` }} />
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
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${pct(s.n, d.audience)}%`, transitionDelay: `${i * 90}ms` }} /></div>
          </li>
        ))}
      </ol>

      {/* the three groups who have not entered */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {Object.entries(SEGMENTS).map(([key, seg]) => {
          const n = d[key === 'seen' ? 'seen_not_posted' : key]
          return (
            <button key={key} type="button" onClick={() => setOpen(key)} disabled={!n}
              className="group flex flex-col rounded-card border border-gray-100 bg-white p-4 text-left shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lift disabled:opacity-50">
              <span className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400"><Icon name={seg.icon} className="h-3.5 w-3.5 text-brand" />{seg.title}</span>
                <Icon name="chevronRight" className="h-3.5 w-3.5 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
              </span>
              <span className="mt-1.5 text-3xl font-bold tabular-nums text-ink">{n}</span>
              <span className="text-xs text-smoke">{seg.hint}</span>
              <span className="mt-2 text-xs font-semibold text-brand">See who, and send a push</span>
            </button>
          )
        })}
      </div>

      {/* market by market */}
      <div className="mt-6 overflow-hidden rounded-xl border border-gray-100">
        <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_3.5rem] gap-3 bg-cloud/60 px-4 py-2 text-[10.5px] font-bold uppercase tracking-wide text-gray-400">
          <span>Market</span><span className="text-right">People</span><span className="text-right">Looked</span><span className="text-right">Posted</span>
        </div>
        <ul className="divide-y divide-gray-50">
          {(d.markets || []).map((m) => (
            <li key={m.name} className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_3.5rem] items-center gap-3 px-4 py-2.5 text-sm">
              <span className="flex min-w-0 items-center gap-2"><span className="truncate font-medium text-ink">{m.name}</span>
                <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-cloud sm:block"><span className="block h-full rounded-full bg-brand" style={{ width: `${pct(m.posted, m.audience)}%` }} /></span>
              </span>
              <span className="text-right tabular-nums text-smoke">{m.audience}</span>
              <span className="text-right tabular-nums text-smoke">{m.seen}</span>
              <span className="text-right font-bold tabular-nums text-ink">{m.posted}</span>
            </li>
          ))}
        </ul>
      </div>

      {open && <SegmentSheet challenge={challenge} segment={open} people={d.people?.[open] || []} total={d[open === 'seen' ? 'seen_not_posted' : open]} onClose={() => setOpen(null)} />}
    </section>
  )
}

function SegmentSheet({ challenge, segment, people, total, onClose }) {
  const seg = SEGMENTS[segment]
  const [title, setTitle] = useState(seg.title_default)
  const [body, setBody] = useState(seg.body_default)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(null)

  async function send() {
    setSending(true)
    const { data, error } = await supabase.rpc('challenge_nudge', { p_challenge: challenge.id, p_segment: segment, p_title: title, p_body: body })
    setSending(false)
    if (error) { notice(error.message, { title: 'That did not send' }); return }
    setSent(data)
  }

  return (
    <Modal open onClose={onClose} title={seg.title} wide>
      <div className="space-y-5">
        {sent != null ? (
          <p className="rounded-xl bg-brand-tint/50 px-4 py-6 text-center text-sm font-semibold text-ink">Sent to {sent} creators. It is in their notifications now, and a push went to anybody who has them on.</p>
        ) : (
          <div className="space-y-3 rounded-card border border-gray-100 bg-cloud/50 p-4">
            <p className="text-sm font-semibold text-ink">Send these {total} creators a push</p>
            <input className="input" maxLength={70} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />
            <textarea className="input min-h-[80px]" maxLength={300} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Message" />
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-smoke">Only people who have not entered get it. Tapping it opens this challenge.</p>
              <button type="button" onClick={send} disabled={sending || !title.trim() || !body.trim()} className="btn-primary !py-2 text-sm">{sending ? <Spinner className="h-4 w-4" /> : <Icon name="bell" className="h-4 w-4" />}Send</button>
            </div>
          </div>
        )}
        <ul className="max-h-80 divide-y divide-gray-50 overflow-y-auto rounded-xl border border-gray-100">
          {people.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <Avatar src={p.photo} name={p.name} size="sm" />
              <Link to={`/profile/${p.id}`} className="min-w-0 flex-1 hover:text-brand">
                <span className="block truncate text-sm font-semibold text-ink">{p.name}</span>
                <span className="block truncate text-xs text-smoke">{p.market} · {p.last_seen ? `last on ${timeAgo(p.last_seen)}` : p.joined ? `joined ${timeAgo(p.joined)}` : 'never on'}</span>
              </Link>
              <span title={p.push ? 'Has push notifications on' : 'No push notifications'} className={cx('shrink-0', p.push ? 'text-brand' : 'text-gray-300')}><Icon name="bell" className="h-4 w-4" /></span>
            </li>
          ))}
        </ul>
        {people.length < total && <p className="text-xs text-smoke">Showing the {people.length} most recent of {total}.</p>}
      </div>
    </Modal>
  )
}
