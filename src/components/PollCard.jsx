import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { confirm } from '../lib/confirm'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { cx } from '../lib/utils'
import { useT } from '../lib/i18n'
import { Avatar } from './ui'
import Icon from './Icon'

// An inline poll inside a message.
//  * Self-contained: loads its own options + votes and subscribes to live
//    vote changes, so results update in real time as people vote.
//  * Creators tap an option to vote (one vote each; tapping again changes it).
//  * Admins can close a poll to lock the result.
//
// WHO VOTED FOR WHAT (5 Oct 2026). Ethan: "I'm unable to see who actually voted for what ... clicking on the actual card
// shows who's voted for it, outside the buttons." Pressing the CARD (anywhere that is not an option) opens the voters, grouped
// by option, with a face and a name each. It is shown only to somebody who has already voted - an admin always sees it, and a
// closed poll shows it to everyone - because an option button is a vote, and a poll that reveals everybody's answer before you
// have given yours is a poll you copy. The little "Who voted" row is the same control for a keyboard.
//
// THE LOOK. A picked option is SOLID BRAND with white on it - the vibrant gradient, never the pale tint it used to be (Ethan:
// "I don't like the way it's currently that light-coloured orange when you select it") - and the unpicked ones are quiet grey
// bars that grow with their share, so the only orange on the card is the answer you gave.
export default function PollCard({ pollId }) {
  const tr = useT()
  const { user, isAdmin } = useAuth()
  const [poll, setPoll] = useState(null)
  const [options, setOptions] = useState([])
  const [votes, setVotes] = useState([])
  const [people, setPeople] = useState({})
  const [busy, setBusy] = useState(false)
  const [showVoters, setShowVoters] = useState(false)

  const load = useCallback(async () => {
    const [{ data: p }, { data: opts }, { data: vs }] = await Promise.all([
      supabase.from('polls').select('*').eq('id', pollId).single(),
      supabase.from('poll_options').select('*').eq('poll_id', pollId).order('sort_order'),
      supabase.from('poll_votes').select('*').eq('poll_id', pollId),
    ])
    setPoll(p)
    setOptions(opts ?? [])
    setVotes(vs ?? [])
  }, [pollId])

  useEffect(() => { load() }, [load])

  // Live vote updates.
  useEffect(() => {
    const sub = supabase
      .channel(`poll-${pollId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes', filter: `poll_id=eq.${pollId}` }, load)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'polls', filter: `id=eq.${pollId}` }, load)
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [pollId, load])

  // The faces behind the votes. Fetched for whoever has voted and is not already known.
  const voterKey = useMemo(() => votes.map((v) => v.voter_id).sort().join(','), [votes])
  useEffect(() => {
    const ids = voterKey ? voterKey.split(',') : []
    const missing = ids.filter((id) => !people[id])
    if (missing.length === 0) return undefined
    let alive = true
    supabase.from('profiles').select('id, name, photo_url').in('id', missing).then(({ data }) => {
      if (!alive || !data) return
      setPeople((cur) => ({ ...cur, ...Object.fromEntries(data.map((p) => [p.id, p])) }))
    })
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voterKey])

  const myVote = votes.find((v) => v.voter_id === user.id)
  const total = votes.length
  const closed = poll?.closed
  // An option is a vote, so the answers stay hidden until you have given yours. An admin runs the poll; a closed one cannot change.
  const canSee = !!myVote || isAdmin || !!closed

  async function vote(optionId) {
    if (closed || busy) return
    setBusy(true)
    // Always clear this user's existing vote for the poll by (poll, voter) -
    // robust even if local state is briefly stale, so a re-vote never trips the
    // one-vote-per-person unique constraint.
    await supabase.from('poll_votes').delete().eq('poll_id', pollId).eq('voter_id', user.id)
    // Clicking the option you already had toggles your vote off; otherwise record it.
    if (myVote?.option_id !== optionId) {
      await supabase.from('poll_votes').insert({ poll_id: pollId, option_id: optionId, voter_id: user.id })
    }
    await load()
    setBusy(false)
  }

  async function closePoll() {
    if (!await confirm('Close this poll? Nobody will be able to vote after this.')) return
    await supabase.from('polls').update({ closed: true }).eq('id', pollId)
    load()
  }

  // A press on the card that is not on a control: show or hide the voters.
  function onCardPress(e) {
    if (e.target.closest('button, a')) return
    if (canSee && total > 0) setShowVoters((v) => !v)
  }

  if (!poll) return null

  // Defensive: strip any leading emoji/symbol + space so a poll question never
  // renders with one, even for older polls created before this was removed.
  const question = (poll.question || '').replace(/^(?:\p{Extended_Pictographic}|️|\s)+/u, '').trim()
  const leaderCount = Math.max(0, ...options.map((o) => votes.filter((v) => v.option_id === o.id).length))
  const faces = votes.map((v) => people[v.voter_id]).filter(Boolean).slice(0, 5)

  return (
    // `text-ink` IS LOAD-BEARING (3 Sep 2026). Ethan: "the UI of the poll
    // doesn't seem to be working correctly, I can't see any of the text, maybe
    // because it is white, the same as the background."
    //
    // Exactly that. This card paints its own white background but inherited its
    // text COLOUR from whatever it was nested in - which was fine for as long as
    // the only place it appeared was an announcement on a white page. It renders
    // in the market rooms now, and a creator's own message there is a
    // brand-orange bubble with `text-white` on it, so every label in here turned
    // white on white.
    //
    // A component that brings its own background must bring its own foreground.
    // Anything that reads as body text is explicit from here down.
    <div
      onClick={onCardPress}
      className={cx(
        'mt-1 w-full max-w-[24rem] rounded-2xl border border-gray-100 bg-white p-4 text-left text-ink shadow-card sm:p-5',
        canSee && total > 0 && 'cursor-pointer',
      )}
    >
      <div className="mb-3.5 flex items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-light text-white">
          <Icon name="chart" className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand">{closed ? tr('Poll · closed') : tr('Poll')}</p>
          <p className="mt-0.5 text-[15px] font-semibold leading-snug text-ink">{question}</p>
        </div>
      </div>

      <div className="space-y-2">
        {options.map((o) => {
          const count = votes.filter((v) => v.option_id === o.id).length
          const pct = total ? Math.round((count / total) * 100) : 0
          const mine = myVote?.option_id === o.id
          const leading = count > 0 && count === leaderCount
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => vote(o.id)}
              disabled={closed || busy}
              aria-pressed={mine}
              className={cx(
                'group/opt relative w-full overflow-hidden rounded-xl px-3.5 py-2.5 text-left text-sm transition-all duration-200 disabled:cursor-default',
                mine
                  ? 'bg-gradient-to-r from-brand to-brand-light text-white shadow-[0_6px_16px_-8px_rgba(217,68,7,0.7)]'
                  : 'bg-cloud text-ink hoverable:hover:-translate-y-px hoverable:hover:shadow-card',
              )}
            >
              {/* Result bar: a quiet grey for the rest, a lighter wash of white over the picked one. */}
              <span
                className={cx('absolute inset-y-0 left-0 transition-[width] duration-500', mine ? 'bg-white/25' : 'bg-gray-200/80')}
                style={{ width: `${pct}%` }}
                aria-hidden
              />
              <span className="relative flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className={cx(
                      'flex shrink-0 items-center justify-center rounded-full border transition-colors',
                      mine ? 'border-white bg-white text-brand' : 'border-gray-300 bg-white',
                    )}
                    style={{ height: 18, width: 18 }}
                  >
                    {mine && (
                      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.4l2.3 2.3L9.5 3.6" /></svg>
                    )}
                  </span>
                  <span className={cx('truncate font-semibold', mine ? 'text-white' : 'text-ink')}>{o.label}</span>
                </span>
                <span className={cx('shrink-0 text-xs font-bold tabular-nums', mine ? 'text-white' : leading ? 'text-brand' : 'text-smoke')}>
                  {pct}%
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-3.5 flex items-center justify-between gap-3 text-xs text-smoke">
        {total > 0 && canSee ? (
          <button
            type="button"
            onClick={() => setShowVoters((v) => !v)}
            aria-expanded={showVoters}
            className="flex min-w-0 items-center gap-2 rounded-full py-0.5 pr-1 font-medium transition-colors hover:text-ink"
          >
            {faces.length > 0 && (
              <span className="flex -space-x-1.5">
                {faces.map((p) => <Avatar key={p.id} src={p.photo_url} name={p.name} size="xs" className="!h-5 !w-5 !text-[9px] !ring-2 !ring-white" />)}
              </span>
            )}
            <span>{total} {total === 1 ? tr('vote') : tr('votes')}</span>
            <Icon name="chevronRight" className={cx('h-3.5 w-3.5 transition-transform duration-200', showVoters ? '-rotate-90' : 'rotate-90')} />
          </button>
        ) : (
          <span>
            {total} {total === 1 ? tr('vote') : tr('votes')}
            {total > 0 && !canSee && <span className="text-gray-400"> · {tr('vote to see who picked what')}</span>}
          </span>
        )}
        {isAdmin && !closed && (
          <button type="button" onClick={closePoll} className="shrink-0 font-semibold text-brand hover:underline">{tr("Close poll")}</button>
        )}
      </div>

      {/* WHO PICKED WHAT. Grouped by option, in the poll's own order. Names are links to the profile. */}
      {showVoters && canSee && total > 0 && (
        <div className="mt-3 space-y-3 border-t border-gray-100 pt-3 animate-fade-up">
          {options.map((o) => {
            const who = votes.filter((v) => v.option_id === o.id).map((v) => ({ id: v.voter_id, ...(people[v.voter_id] || {}) }))
            if (who.length === 0) return null
            return (
              <div key={o.id}>
                <p className="mb-1.5 flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wide text-smoke">
                  <span className="truncate">{o.label}</span>
                  <span className="shrink-0 tabular-nums text-brand">{who.length}</span>
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {who.map((p) => (
                    <li key={p.id}>
                      <Link to={`/profile/${p.id}`} className="flex items-center gap-1.5 rounded-full bg-cloud py-0.5 pl-0.5 pr-2.5 text-xs font-medium text-ink transition-colors hover:bg-brand-tint hover:text-brand">
                        <Avatar src={p.photo_url} name={p.name} size="xs" />
                        <span className="max-w-[9rem] truncate">{p.id === user.id ? tr('You') : (p.name || tr('Someone'))}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
