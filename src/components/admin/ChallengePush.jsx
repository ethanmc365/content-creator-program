import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Modal, Spinner } from '../ui'
import Icon from '../Icon'
import { cx } from '../../lib/utils'
import { notice } from '../../lib/confirm'

// SEND EVERYONE A PUSH ABOUT THIS CHALLENGE, from the challenge.
//
// The platform could already notify a whole market - `notify_community` has
// been there since the market rooms were built - but the only way to reach it
// was to post in an announcements room, which is a different act: a room post is
// a message people can reply to and it lives in the room forever. Reminding a
// market that a challenge closes on Sunday is neither of those. It is a push.
//
// So this is the missing half: the same delivery, addressed from the challenge
// it is about, with the challenge's own link on it so tapping the notification
// opens the thing it is about.
//
// TWO THINGS IT REFUSES TO GUESS.
//
//   * WHO. A challenge belongs to a market or it is worldwide, and this sends
//     to exactly that by default - but it is on screen as a choice, because
//     "everybody" and "the UK" are very different sends and the difference must
//     not be a detail somebody discovers afterwards.
//   * HOW MANY. It counts the people who will actually get a push - a
//     notification always lands in the bell, but a PUSH needs a subscription -
//     and says both numbers before the button, because four of forty-three is
//     the truth and "sent to everyone" is not.
//
// It cannot be undone, so it asks once with the real numbers in the sentence.
// THE BUTTON OWNS ITS OWN OPEN STATE (30 Sep 2026). Ethan: "when I press the push button the
// screen lags a bit." The open flag lived in ChallengeDetail - a 1,900-line page with the
// leaderboard, countdown and every entry - so pressing the button re-rendered ALL of it
// during the very frame the sheet was meant to animate in. Now only this button and the
// sheet re-render, and the audience count is fetched after the sheet has finished
// arriving rather than in the same frame.
export function SendPushButton({ challenge, label }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary inline-flex items-center gap-1.5 !py-2 text-xs">
        <Icon name="bell" className="h-3.5 w-3.5" />
        {label}
      </button>
      <ChallengePush challenge={challenge} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

export default function ChallengePush({ challenge, open, onClose }) {
  const { user } = useAuth()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [scope, setScope] = useState('market')
  const [sending, setSending] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [reach, setReach] = useState(null)

  const marketId = challenge?.community_id || null
  const [marketName, setMarketName] = useState('this market')
  const toMarket = scope === 'market' && !!marketId

  // The challenge row is selected with `*`, so it carries `community_id` and no
  // name. One lookup rather than changing every caller's query.
  useEffect(() => {
    if (!open || !marketId) return undefined
    let alive = true
    supabase.from('communities').select('name').eq('id', marketId).maybeSingle()
      .then(({ data }) => { if (alive && data?.name) setMarketName(data.name) })
    return () => { alive = false }
  }, [open, marketId])

  useEffect(() => {
    if (!open) return
    setTitle(challenge?.title || '')
    setBody('')
    setScope(marketId ? 'market' : 'all')
    setConfirming(false)
  }, [open, challenge?.title, marketId])

  // WHO IS ACTUALLY REACHABLE. Counted live rather than estimated, because the
  // honest number here is small and the whole point of showing it is that
  // somebody writing a push should know that before they write it.
  useEffect(() => {
    if (!open) return undefined
    let alive = true
    let timer = null
    const run = async () => {
      setReach(null)
      // `admin_push_adoption` RATHER THAN THE TABLE. `push_subscriptions` is
      // readable only by its owner - "push: manage own" - so an admin counting
      // other people's devices off it gets zero every time, which is a wrong
      // number that looks like a real one. The RPC is admin-only and SECURITY
      // DEFINER precisely so this question can be answered, and it already
      // excludes test accounts and people on their way out.
      const [{ data: adoption }, { data: members }] = await Promise.all([
        supabase.rpc('admin_push_adoption'),
        toMarket
          ? supabase.from('community_members').select('profile_id').eq('community_id', marketId)
          : Promise.resolve({ data: null }),
      ])
      const inMarket = members ? new Set(members.map((m) => m.profile_id)) : null
      const rows = (adoption || []).filter((r) => !r.is_admin && (!inMarket || inMarket.has(r.creator_id)))
      if (alive) setReach({ people: rows.length, push: rows.filter((r) => Number(r.devices) > 0).length })
    }
    timer = setTimeout(run, 320)
    return () => { alive = false; clearTimeout(timer) }
  }, [open, toMarket, marketId])

  async function send() {
    if (!title.trim() || !body.trim() || sending) return
    setSending(true)
    const link = `/challenges/${challenge.id}`
    const args = {
      p_except: user?.id ?? null,
      p_type: 'challenge',
      p_title: title.trim(),
      p_body: body.trim(),
      p_link: link,
    }
    const { error } = toMarket
      ? await supabase.rpc('notify_community', { p_community: marketId, ...args })
      : await supabase.rpc('notify_all', args)
    setSending(false)
    if (error) {
      notice(error.message, { title: 'That did not send' })
      return
    }
    notice(
      toMarket
        ? `Sent to ${marketName}. It is in their notifications now, and a push went to anybody who has them switched on.`
        : 'Sent to every creator. It is in their notifications now, and a push went to anybody who has them switched on.',
      { title: 'Sent' },
    )
    onClose?.()
  }

  const ready = !!title.trim() && !!body.trim()

  return (
    <Modal open={open} onClose={onClose} title="Send a push about this challenge">
      <div className="space-y-5">
        {/* WHAT IT WILL LOOK LIKE ON A PHONE, because that is the only place it
            is ever read. A title and two lines - so a body that runs to a
            paragraph is visibly a paragraph nobody will see the end of. */}
        <div className="rounded-card border border-gray-100 bg-cloud/60 p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">How it arrives</p>
          <div className="flex items-start gap-3 rounded-xl bg-white p-3 shadow-card">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-white">
              <Icon name="flag" className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">{title.trim() || 'A title'}</span>
              <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-smoke">
                {body.trim() || 'What you want them to know.'}
              </span>
            </span>
          </div>
        </div>

        <div>
          <label htmlFor="push-title" className="label">Title</label>
          <input
            id="push-title" className="input mt-1.5" maxLength={70}
            value={title} onChange={(e) => { setTitle(e.target.value); setConfirming(false) }}
          />
        </div>

        <div>
          <label htmlFor="push-body" className="label">Message</label>
          <textarea
            id="push-body" className="input mt-1.5 min-h-[88px]" maxLength={300}
            placeholder="Two days left to get your video in."
            value={body} onChange={(e) => { setBody(e.target.value); setConfirming(false) }}
          />
          <p className="mt-1 text-[11px] text-gray-400">
            Tapping it opens this challenge. {300 - body.length} characters left.
          </p>
        </div>

        {marketId && (
          <div>
            <span className="label">Who gets it</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[['market', marketName], ['all', 'Every creator']].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setScope(key); setConfirming(false) }}
                  className={cx(
                    'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                    scope === key ? 'border-brand bg-brand text-white' : 'border-gray-200 bg-white text-smoke hover:text-ink',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* THE HONEST NUMBER. A notification always reaches the bell; a PUSH
            only reaches a phone that has a subscription, and on this platform
            that is a small minority. Saying so here is the difference between
            "I told everybody" and "I left a note for everybody and buzzed
            four of them". */}
        <p className="rounded-xl bg-cloud/70 px-3 py-2.5 text-[12px] leading-relaxed text-smoke">
          {reach === null ? (
            <span className="inline-flex items-center gap-2"><Spinner className="h-3.5 w-3.5" /> Counting who this reaches…</span>
          ) : (
            <>
              <strong className="font-semibold text-ink">{reach.people}</strong>
              {' '}{reach.people === 1 ? 'creator' : 'creators'} will get this in their notifications.
              {' '}
              <strong className="font-semibold text-ink">{reach.push}</strong> of them
              {' '}{reach.push === 1 ? 'has' : 'have'} push switched on, so
              {' '}{reach.push === 1 ? 'that one' : 'those'} will also get it on their phone.
            </>
          )}
        </p>

        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          {confirming ? (
            <button type="button" onClick={send} disabled={sending} className="btn-primary disabled:opacity-50">
              {sending ? <Spinner className="h-4 w-4" /> : <Icon name="bell" className="h-4 w-4" />}
              Yes, send it now
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={!ready}
              className="btn-primary disabled:opacity-40"
            >
              <Icon name="bell" className="h-4 w-4" />
              Send
            </button>
          )}
        </div>
        {confirming && (
          <p className="text-right text-[11px] text-gray-400">This cannot be taken back once it is sent.</p>
        )}
      </div>
    </Modal>
  )
}
