import { useEffect, useState, useCallback } from 'react'
import { confirm } from '../lib/confirm'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { cx } from '../lib/utils'

// An inline poll inside an announcement message.
//  * Self-contained: loads its own options + votes and subscribes to live
//    vote changes, so results update in real time as people vote.
//  * Creators tap an option to vote (one vote each; tapping again changes it).
//  * Admins can close a poll to lock the result.
export default function PollCard({ pollId }) {
  const { user, isAdmin } = useAuth()
  const [poll, setPoll] = useState(null)
  const [options, setOptions] = useState([])
  const [votes, setVotes] = useState([])
  const [busy, setBusy] = useState(false)

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

  const myVote = votes.find((v) => v.voter_id === user.id)
  const total = votes.length
  const closed = poll?.closed

  async function vote(optionId) {
    if (closed || busy) return
    setBusy(true)
    // Always clear this user's existing vote for the poll by (poll, voter) -     // robust even if local state is briefly stale, so a re-vote never trips the
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

  if (!poll) return null

  // Defensive: strip any leading emoji/symbol + space so a poll question never
  // renders with one, even for older polls created before this was removed.
  const question = (poll.question || '').replace(/^(?:\p{Extended_Pictographic}|️|\s)+/u, '').trim()

  return (
    <div className="mt-1 w-72 max-w-full rounded-2xl border border-brand/20 bg-white p-4 text-left sm:w-80">
      <div className="mb-3 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-snug">{question}</p>
      </div>

      <div className="space-y-2">
        {options.map((o) => {
          const count = votes.filter((v) => v.option_id === o.id).length
          const pct = total ? Math.round((count / total) * 100) : 0
          const mine = myVote?.option_id === o.id
          return (
            <button
              key={o.id}
              onClick={() => vote(o.id)}
              disabled={closed || busy}
              className={cx(
                'relative w-full overflow-hidden rounded-xl border px-3 py-2 text-left text-sm transition-colors disabled:cursor-default',
                mine ? 'border-brand' : 'border-gray-200 hover:border-brand'
              )}
            >
              {/* Result bar fill */}
              <span
                className={cx('absolute inset-y-0 left-0 transition-all duration-500', mine ? 'bg-brand-tint' : 'bg-cloud')}
                style={{ width: `${pct}%` }}
                aria-hidden
              />
              <span className="relative flex items-center justify-between gap-2">
                <span className={cx('font-medium', mine && 'text-brand')}>{mine && '✓ '}{o.label}</span>
                <span className="text-xs text-smoke">{pct}%</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-smoke">
        <span>{total} {total === 1 ? 'vote' : 'votes'}{closed && ' · closed'}</span>
        {isAdmin && !closed && (
          <button onClick={closePoll} className="font-medium text-brand hover:underline">Close poll</button>
        )}
      </div>
    </div>
  )
}
