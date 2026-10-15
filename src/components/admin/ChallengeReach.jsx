import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, Modal, Select, Skeleton, Spinner } from '../ui'
import Icon from '../Icon'
import { confirm, notice } from '../../lib/confirm'
import { copyToClipboard, emailList } from '../../lib/clipboard'
import { toastSuccess } from '../../lib/toast'
import { cx, timeAgo } from '../../lib/utils'
import { challengesApi } from '../../api/challenges'

// WHO HAS NOT POSTED YET (built, migration 325; rebuilt the same day, migration 332).
//
// And on the first version: "build it better. I want to be able to see market by market... more like the Participation
// by market with those nice charts, gradients, numbers... clicking on Spain, UK, Ireland or Portugal should show the
// people who participated and who didn't. I can easily re-try to send a push to them. And for the ones that never opened
// the app, a button to copy all the emails."
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
  all: {
    icon: 'users', title: 'Everyone still to enter', hint: 'All creators without an entry',
    title_default: 'Your next video could change the leaderboard', body_default: 'There is still time to join this challenge. Open the brief, share your video and earn your place on the board.',
  },
  posted: {
    icon: 'check', title: 'Already posted', hint: 'Thank the creators taking part',
    title_default: 'Thanks for taking part', body_default: 'Your video is part of this challenge. Thank you for creating with us. Open the challenge to see how you are doing.',
  },
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

export default function ChallengeReach({ challenge }) {
  const [data, setData] = useState(undefined)
  const [sheet, setSheet] = useState(null)
  const [market, setMarket] = useState('')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let alive = true
    setData(undefined)
    challengesApi.challengeReach({ p_challenge: challenge.id })
      .then(({ data, error }) => { if (alive) setData(error ? null : data) }, () => { if (alive) setData(null) })
    return () => { alive = false }
  }, [challenge.id, refresh])
  const people = useMemo(() => (data?.people || []).filter((p) => !market || p.market === market), [data, market])
  const markets = data?.markets || []
  if (data === undefined) return <section className="card mt-6 mb-10" aria-busy="true"><Skeleton className="h-6 w-56" /><Skeleton className="mt-5 h-36 w-full" /></section>
  if (!data) return <section className="card my-6"><p className="text-sm text-smoke">The challenge audience could not be loaded.</p><button type="button" onClick={() => setRefresh((n) => n + 1)} className="btn-secondary mt-3">Try again</button></section>
  const countFor = (key) => people.filter((p) => key === 'all' ? p.state !== 'posted' : p.state === key).length
  return (
    <section className="my-8 overflow-hidden rounded-3xl border border-brand/15 bg-white shadow-card animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-br from-brand-tint/80 via-white to-white px-5 py-5 sm:px-6">
        <div className="min-w-0 max-w-xl">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-brand"><Icon name="megaphone" className="h-4 w-4" />Challenge outreach</p>
          <h2 className="text-lg font-bold text-ink">Bring your creators into the challenge</h2>
          <p className="mt-1 text-sm leading-relaxed text-smoke">Choose who needs a reminder, or thank those who took part. Review your message, send a push, or copy the email list and message for your email app.</p>
        </div>
        <Select value={market} onChange={setMarket} ariaLabel="Outreach market" className="w-full sm:w-48" search={false}
          options={[{ value: '', label: 'Every market' }, ...markets.map((m) => ({ value: m.name, label: m.name }))]} />
      </div>
      <div className="px-5 pb-5 sm:px-6 sm:pb-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cloud/60 px-4 py-3">
          <p className="text-sm text-smoke"><strong className="text-ink">{countFor('posted')} of {people.length}</strong> creators have entered · <strong className="text-ink">{countFor('all')}</strong> still to enter</p>
          <button type="button" disabled={!countFor('all')} onClick={() => setSheet('all')} className="btn-primary !py-2 text-xs disabled:opacity-40"><Icon name="bell" className="h-4 w-4" />Follow up with all {countFor('all')}</button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {['seen', 'dormant', 'never', 'posted'].map((key) => {
            const segment = SEGMENTS[key]
            const n = countFor(key)
            return <button key={key} type="button" disabled={!n || (key === 'posted' && !data.can_thank_posted)} onClick={() => setSheet(key)} className="group flex min-w-0 flex-col items-start rounded-2xl border border-gray-100 bg-gradient-to-br from-white to-brand-tint/30 p-4 text-left transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/30 hoverable:hover:shadow-card disabled:opacity-50">
              <span className="mb-3 flex w-full items-center justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-tint text-brand"><Icon name={segment.icon} className="h-5 w-5" /></span><span className="text-3xl font-bold tabular-nums text-ink">{n}</span></span>
              <span className="text-sm font-semibold text-ink">{segment.title}</span><span className="mt-1 text-xs text-smoke">{segment.hint}</span>
              <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-brand">{key === 'posted' ? 'Send a thank you' : 'Prepare a reminder'}<Icon name="chevronRight" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
            </button>
          })}
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-smoke">App activity shows whether someone visited the platform since this challenge started. It does not prove they read the brief.</p>
      </div>
      {sheet && <SegmentSheet key={`${sheet}:${market}`} challenge={challenge} segment={sheet} market={market || null}
        people={people.filter((p) => sheet === 'all' ? p.state !== 'posted' : p.state === sheet)} onClose={() => setSheet(null)} />}
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
    if (!await confirm(`Send this notification to ${people.length} creators${market ? ` in ${market}` : ''}?`, { title: 'Send challenge notification', confirmLabel: 'Send notification' })) return
    setSending(true)
    const { data, error } = await challengesApi.challengeNudge({ p_challenge: challenge.id, p_segment: segment, p_title: title, p_body: body, p_market: market })
    setSending(false)
    if (error) { notice(error.message, { title: 'That did not send' }); return }
    setSent(data)
  }
  async function copyEmails() {
    setCopying(true)
    const { data, error } = await challengesApi.challengeReachEmails({ p_challenge: challenge.id, p_segment: segment, p_market: market })
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
        <p className="rounded-xl bg-brand-tint/50 px-4 py-3 text-sm text-ink"><strong>{challenge.title}</strong> · {people.length} recipients · {people.filter((p) => p.push).length} with push enabled</p>
        {sent != null ? (
          <p className="rounded-xl bg-cloud/70 px-4 py-6 text-center text-sm font-semibold text-ink">Sent to {sent} creators. It is in their notifications now, and a push went to anybody who has them on.</p>
        ) : (
          <div className="space-y-3 rounded-card border border-gray-100 bg-cloud/50 p-4">
            <p className="text-sm font-semibold text-ink">Send these {people.length} creators a push</p>
            <input className="input" maxLength={70} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />
            <textarea className="input min-h-[80px]" maxLength={300} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Message" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] text-smoke">{segment === 'posted' ? 'Only creators who have entered get this thank you.' : 'Only creators in this group who have not entered get this reminder.'} Tapping it opens this challenge.</p>
              <button type="button" onClick={send} disabled={sending || !people.length || !title.trim() || !body.trim()} className="btn-primary !py-2 text-sm">{sending ? <Spinner className="h-4 w-4" /> : <Icon name="bell" className="h-4 w-4" />}Send</button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 px-3.5 py-3">
          <p className="text-xs leading-relaxed text-smoke">{people.filter((p) => !p.push).length} of these have no push notifications on, so they will not see a push. {segment === 'never' ? 'They have never opened the app, so email is the way to reach them.' : 'Email reaches them anyway.'}</p>
          <button type="button" onClick={copyEmails} disabled={copying || !people.length} className="btn-secondary !py-2 text-xs">{copying ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="copy" className="h-3.5 w-3.5" />}Copy all {people.length} emails</button>
        </div>
        <button type="button" onClick={async () => { if (await copyToClipboard(`${title}\n\n${body}`)) toastSuccess('Message copied. Paste it into your email app.') }} className="btn-secondary w-full justify-center"><Icon name="copy" className="h-4 w-4" />Copy message for email</button>
        <ul className="max-h-80 divide-y divide-gray-50 overflow-y-auto rounded-xl border border-gray-100">
          {people.map((p) => <PersonRow key={p.id} p={p} />)}
        </ul>
      </div>
    </Modal>
  )
}
