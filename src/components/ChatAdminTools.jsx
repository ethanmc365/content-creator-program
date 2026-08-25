import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Modal, Skeleton, Spinner } from './ui'
import Icon from './Icon'
import { CONTINENTS } from '../lib/countries'
import { Select } from './ui'

// The three things the team can drop into a conversation: a poll, a game
// challenge, a resource from the library.
//
// WHY THEY LIVE HERE AND NOT IN A PAGE. They were built inside the legacy
// Chat.jsx, which meant the market rooms - every room in Spain, Portugal,
// Germany, Romania and the Nordics, and every room opened next year - simply
// did not have them, and the poll was locked to #announcements even in the one
// place it existed. Ethan's rule is that an admin can do all three in ANY chat,
// and the only way that stays true for a room nobody has created yet is if the
// room inherits it rather than reimplements it.
//
// The caller owns posting. `postCard({ poll_id })` is whatever "put a message
// in this room" means where you are - the legacy chat writes a bare `channel`,
// a market room writes a namespaced key plus channel_id and community_id - so
// this component never needs to know which chat it is in.

const EMPTY_POLL = { question: '', options: ['', ''] }
const EMPTY_GAME = { title: '', mode: 'flags', region: 'World' }

export default function ChatAdminTools({ tool, onClose, postCard, roomLabel = 'this room' }) {
  const [poll, setPoll] = useState(EMPTY_POLL)
  const [game, setGame] = useState(EMPTY_GAME)
  const [busy, setBusy] = useState(false)
  const [resources, setResources] = useState(null)

  // The library loads the first time somebody opens the picker, then stays.
  useEffect(() => {
    if (tool !== 'resource' || resources !== null) return
    let alive = true
    supabase.from('resources').select('id, title, category').order('created_at', { ascending: false })
      .then(({ data }) => { if (alive) setResources(data ?? []) })
    return () => { alive = false }
  }, [tool, resources])

  function close() {
    setPoll(EMPTY_POLL)
    setGame(EMPTY_GAME)
    setBusy(false)
    onClose()
  }

  async function createPoll(e) {
    e.preventDefault()
    const options = poll.options.map((o) => o.trim()).filter(Boolean)
    if (!poll.question.trim() || options.length < 2 || busy) return
    setBusy(true)
    const { data, error } = await supabase.from('polls')
      .insert({ question: poll.question.trim(), created_by: (await supabase.auth.getUser()).data.user?.id })
      .select('id').single()
    if (!error && data) {
      await supabase.from('poll_options').insert(options.map((label, i) => ({ poll_id: data.id, label, sort_order: i })))
      // The card IS the message - no accompanying sentence, or every poll
      // arrives with an empty bubble above it.
      await postCard({ poll_id: data.id })
    }
    close()
  }

  async function createGame(e) {
    e.preventDefault()
    if (!game.title.trim() || busy) return
    setBusy(true)
    const { data, error } = await supabase.from('game_events')
      .insert({
        title: game.title.trim(),
        mode: game.mode,
        region: game.region,
        created_by: (await supabase.auth.getUser()).data.user?.id,
      })
      .select('id').single()
    if (!error && data) await postCard({ game_event_id: data.id })
    close()
  }

  async function shareResource(id) {
    if (busy) return
    setBusy(true)
    await postCard({ resource_id: id })
    close()
  }

  return (
    <>
      <Modal open={tool === 'poll'} onClose={close} title="Create a poll">
        <form onSubmit={createPoll} className="space-y-5">
          <div>
            <label htmlFor="poll-q" className="label">Question</label>
            <input id="poll-q" type="text" required className="input" value={poll.question}
              onChange={(e) => setPoll((p) => ({ ...p, question: e.target.value }))}
              placeholder="e.g. Where should our next challenge be?" />
          </div>
          <div>
            <p className="label">Options</p>
            <div className="space-y-2">
              {poll.options.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text" className="input" placeholder={`Option ${i + 1}`} value={opt}
                    onChange={(e) => setPoll((p) => ({ ...p, options: p.options.map((o, j) => (j === i ? e.target.value : o)) }))}
                  />
                  {poll.options.length > 2 && (
                    <button type="button" aria-label="Remove option" className="btn-ghost !px-3"
                      onClick={() => setPoll((p) => ({ ...p, options: p.options.filter((_, j) => j !== i) }))}>✕</button>
                  )}
                </div>
              ))}
            </div>
            {poll.options.length < 6 && (
              <button type="button" className="btn-secondary mt-2 !py-2 text-xs"
                onClick={() => setPoll((p) => ({ ...p, options: [...p.options, ''] }))}>+ Add option</button>
            )}
          </div>
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? <Spinner /> : `Post poll to ${roomLabel}`}
          </button>
        </form>
      </Modal>

      <Modal open={tool === 'game'} onClose={close} title="Post a game challenge">
        <form onSubmit={createGame} className="space-y-5">
          <div>
            <label htmlFor="game-title" className="label">Challenge title</label>
            <input id="game-title" type="text" required className="input" value={game.title}
              onChange={(e) => setGame((g) => ({ ...g, title: e.target.value }))}
              placeholder="e.g. Friday Flag Frenzy" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="game-mode" className="label">Mode</label>
              <Select
                id="game-mode" variant="field" ariaLabel="Mode"
                value={game.mode}
                onChange={(v) => setGame((g) => ({ ...g, mode: v }))}
                options={[
                  { value: 'flags', label: 'Guess the flag' },
                  { value: 'map', label: 'Find on the map' },
                  { value: 'airports', label: 'Airport codes' },
                  { value: 'currencies', label: 'Currencies' },
                ]}
              />
            </div>
            <div>
              <label htmlFor="game-region" className="label">Region</label>
              <Select
                id="game-region" variant="field" ariaLabel="Region"
                value={game.region}
                onChange={(v) => setGame((g) => ({ ...g, region: v }))}
                options={[{ value: 'World', label: 'World' }, ...CONTINENTS.map((c) => ({ value: c, label: c }))]}
              />
            </div>
          </div>
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? <Spinner /> : `Post to ${roomLabel}`}
          </button>
        </form>
      </Modal>

      <Modal open={tool === 'resource'} onClose={close} title="Share a resource">
        <p className="mb-4 text-sm text-smoke">Pick a library resource to post as a card in {roomLabel}.</p>
        {resources === null ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : resources.length === 0 ? (
          <p className="rounded-xl bg-cloud px-4 py-6 text-center text-sm text-smoke">
            No resources yet. Add some in <Link to="/admin/resources" className="font-medium text-brand hover:underline">Manage resources</Link> first.
          </p>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto overscroll-contain">
            {resources.map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={busy}
                onClick={() => shareResource(r.id)}
                className="flex w-full items-center gap-3 rounded-xl border border-gray-100 px-4 py-3 text-left transition-colors hover:border-brand hover:bg-brand-tint/40 disabled:opacity-50"
              >
                <Icon name="book" className="h-5 w-5 shrink-0 text-brand" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{r.title}</span>
                  {r.category && <span className="block truncate text-xs text-smoke">{r.category}</span>}
                </span>
                <span className="shrink-0 text-xs font-medium text-brand">Post →</span>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </>
  )
}
