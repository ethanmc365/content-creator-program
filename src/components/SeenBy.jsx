import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, Modal } from './ui'
import Icon from './Icon'
import { supabase } from '../lib/supabase'
import { cx } from '../lib/utils'
import { useT } from '../lib/i18n'

// "Seen by 12", and what happens when you press it.
//
// WHAT WAS WRONG WITH THE OLD ONE, because all three faults had the same root:
// it was a CSS tooltip pretending to be a dialog.
//
//  * It opened on `group-hover`. A phone has no hover, but it DOES leave the
//    hover state latched on the last thing you tapped, so the popup appeared
//    and then stayed - over the message underneath - until you happened to tap
//    something else. Tapping the popup did nothing because it was
//    `pointer-events-none`. That is exactly the reported "it stays persistent
//    covering the text and clicking it doesn't make it go away".
//  * It was `absolute` inside a message bubble, which lives inside the fixed,
//    transformed chat overlay - so it was clipped by its own conversation and
//    positioned against a box nobody could see.
//  * It joined every name into one string. Twelve names and a "+68 more" in a
//    220px box is not a list of readers, it is a paragraph. At 80 readers it
//    is unreadable, which is the question asked of it.
//
// So: the chip is a button, and the list is a real portalled dialog with a
// scroll box, a count, avatars, links to profiles, and a filter once the list
// is long enough that scanning it stops working. Escape closes it, the backdrop
// closes it, and the close button closes it - three ways out, because the
// complaint was that there were none.

/** The faces, capped: a facepile that says "several people" at a glance. */
function Faces({ readers, max = 3 }) {
  const shown = readers.slice(0, max)
  if (!shown.length) return null
  return (
    <span className="flex -space-x-1.5">
      {shown.map((r) => (
        <Avatar key={r.id} src={r.photo_url} name={r.name} size="xs" className="!h-4 !w-4 !text-[8px] !ring-1" />
      ))}
    </span>
  )
}

export default function SeenBy({
  readers = [],
  align = 'left',
  // 1:1 threads say "Read" rather than "Seen by 1" - there is only one other
  // person in the room and naming the count is noise.
  singular = false,
  className,
  // A POLL MESSAGE SPLITS ITS READERS IN TWO (5 Oct 2026). Ethan: "the 'seen by' for this should show who's voted and who's just seen it and
  // hasn't voted." Given a poll id, the list is "Voted" (with what each picked) and "Seen, not voted yet".
  pollId = null,
}) {
  const tr = useT()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [poll, setPoll] = useState(null) // { votes: [{voter_id, option_id}], options: {id: label}, people: {id: {name, photo_url}} }
  const n = readers.length

  useEffect(() => {
    if (!pollId) return undefined
    let alive = true
    ;(async () => {
      const [{ data: votes }, { data: opts }] = await Promise.all([
        supabase.from('poll_votes').select('voter_id, option_id').eq('poll_id', pollId),
        supabase.from('poll_options').select('id, label').eq('poll_id', pollId),
      ])
      const known = new Set(readers.map((r) => r.id))
      const extra = (votes ?? []).map((v) => v.voter_id).filter((id) => !known.has(id))
      const { data: more } = extra.length ? await supabase.from('profiles').select('id, name, photo_url').in('id', extra) : { data: [] }
      if (!alive) return
      setPoll({
        votes: votes ?? [],
        options: Object.fromEntries((opts ?? []).map((o) => [o.id, o.label])),
        people: Object.fromEntries((more ?? []).map((p) => [p.id, p])),
      })
    })()
    return () => { alive = false }
    // Re-read when the list is opened, so the split is current.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollId, open, n])

  const pollSplit = useMemo(() => {
    if (!poll) return null
    const pick = new Map(poll.votes.map((v) => [v.voter_id, poll.options[v.option_id] || '']))
    const byId = new Map([...Object.values(poll.people), ...readers].map((p) => [p.id, p]))
    const voted = [...pick.keys()].map((id) => ({ ...(byId.get(id) || { id }), choice: pick.get(id) }))
    const seenOnly = readers.filter((r) => !pick.has(r.id))
    return { voted, seenOnly }
  }, [poll, readers])

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return readers
    return readers.filter((r) => (r.name || '').toLowerCase().includes(q))
  }, [readers, query])

  if (n === 0) return null

  return (
    <>
      <button
        type="button"
        onClick={() => { setQuery(''); setOpen(true) }}
        aria-haspopup="dialog"
        aria-label={`Seen by ${n}. Open the list of readers.`}
        className={cx(
          'inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[10px] text-gray-400 transition-colors hover:bg-cloud hover:text-smoke',
          align === 'right' && 'flex-row-reverse',
          className,
        )}
      >
        <Faces readers={readers} />
        <span>
          {singular && n === 1 ? 'Read' : `Seen by ${n}`}
          {pollSplit && pollSplit.voted.length > 0 ? ` · ${pollSplit.voted.length} voted` : ''}
        </span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={singular && n === 1 ? 'Read' : `Seen by ${n}`}>
        {pollSplit ? (
          <div className="-mx-2 max-h-[min(26rem,55vh)] space-y-4 overflow-y-auto overscroll-contain px-2">
            <PollGroup title={tr('Voted')} count={pollSplit.voted.length} people={pollSplit.voted} showChoice onPick={() => setOpen(false)} empty={tr('Nobody has voted yet.')} />
            <PollGroup title={tr('Seen it, has not voted')} count={pollSplit.seenOnly.length} people={pollSplit.seenOnly} onPick={() => setOpen(false)} empty={tr('Everyone who has seen it has voted.')} />
          </div>
        ) : (<>
        {/* The filter earns its place at about a dozen: below that the whole
            list is on screen and a search box is a control that does nothing. */}
        {n > 12 && (
          <div className="relative mb-3">
            <Icon name="magnifier" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr("Find someone…")}
              aria-label={tr("Filter readers")}
              className="input !pl-9"
              autoComplete="off"
            />
          </div>
        )}

        {/* A fixed-height scroll box, so eighty readers and three readers make
            the same shape of dialog. */}
        <div className="-mx-2 max-h-[min(24rem,50vh)] overflow-y-auto overscroll-contain px-2">
          {hits.length === 0 ? (
            <p className="py-6 text-center text-sm text-smoke">Nobody matches &ldquo;{query}&rdquo;.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {hits.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/profile/${r.id}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-cloud"
                  >
                    <Avatar src={r.photo_url} name={r.name} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.name || 'Someone'}</span>
                    <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        </>)}
      </Modal>
    </>
  )
}

/** One half of a poll's readers: the people who voted (and what for), or the people who only looked. */
function PollGroup({ title, count, people, showChoice = false, onPick, empty }) {
  return (
    <section>
      <p className="mb-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-smoke">
        <span>{title}</span>
        <span className="tabular-nums text-brand">{count}</span>
      </p>
      {people.length === 0 ? (
        <p className="rounded-xl bg-cloud px-3 py-3 text-sm text-smoke">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {people.map((r) => (
            <li key={r.id}>
              <Link to={`/profile/${r.id}`} onClick={onPick} className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-cloud">
                <Avatar src={r.photo_url} name={r.name} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.name || 'Someone'}</span>
                {showChoice && r.choice && (
                  <span className="max-w-[9rem] shrink-0 truncate rounded-full bg-gradient-to-r from-brand to-brand-light px-2.5 py-0.5 text-[11px] font-semibold text-white">{r.choice}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
