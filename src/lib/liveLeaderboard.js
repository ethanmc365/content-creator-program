import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import { onResume } from './resume'

// ONE LIVE BOARD PER CHALLENGE, HOWEVER MANY CARDS ARE SHOWING IT (22 Sep 2026).
//
// A leaderboard shared into a room is the board itself (migration 251), and a
// busy room can hold the same challenge's card five times over a month of
// updates. Each card opening its own socket and its own query would be five
// topics and five reads for one answer, so the answer lives here, keyed by
// challenge + board, reference-counted by the cards that are mounted.
//
// IT FOLLOWS `challenges.results_updated_at`, which `rebuild_challenge_results`
// stamps on every view sync, every hand-typed view and every points change. One
// row changing is the signal; the rows themselves are then read once. Behind
// the socket: a re-read whenever the app comes back to the foreground (a
// sleeping socket delivers nothing it missed) and a slow poll while visible.

const POLL_MS = 90_000
const entries = new Map() // key -> { state, listeners:Set, users, stop }

const keyOf = (challengeId, groupId) => `${challengeId}:${groupId || ''}`
const EMPTY = { status: 'loading', challenge: null, rows: [], prevRanks: new Map(), updatedAt: null }

async function read(challengeId, groupId) {
  const [{ data: challenge, error: chErr }, { data: rows, error: rowErr }] = await Promise.all([
    supabase.from('challenges')
      .select('id, title, scoring, status, end_date, prize_structure, prize_currency, winners_count, winners_published_at, results_status, results_updated_at, participation_threshold, participation_prize, participation_basis, participation_scope, community_id')
      .eq('id', challengeId)
      .maybeSingle(),
    (() => {
      let q = supabase.from('results')
        .select('creator_id, rank, final_views, total_views, group_id, profiles:creator_id(id, name, photo_url)')
        .eq('challenge_id', challengeId)
        .order('rank')
      q = groupId ? q.eq('group_id', groupId) : q
      return q
    })(),
  ])
  if (chErr || rowErr) throw chErr || rowErr
  return { challenge, rows: rows ?? [] }
}

function emit(entry) {
  for (const l of entry.listeners) l()
}

function start(key, challengeId, groupId) {
  const entry = { state: EMPTY, listeners: new Set(), users: 0, stop: null, inflight: null }
  entries.set(key, entry)

  const load = () => {
    if (entry.inflight) return entry.inflight
    entry.inflight = read(challengeId, groupId)
      .then(({ challenge, rows }) => {
        const before = entry.state.rows
        // Where everybody stood BEFORE this update, so a row that moved can say
        // so ("up 2"). Only kept when the ranking actually changed; an update
        // that moved nobody keeps the previous arrows rather than wiping them.
        const moved = before.length > 0
          && (before.length !== rows.length || rows.some((r) => before.find((b) => b.creator_id === r.creator_id)?.rank !== r.rank))
        entry.state = {
          status: challenge ? 'ready' : 'missing',
          challenge,
          rows,
          prevRanks: moved ? new Map(before.map((b) => [b.creator_id, b.rank])) : entry.state.prevRanks,
          updatedAt: challenge?.results_updated_at ?? null,
        }
        emit(entry)
      })
      .catch(() => {
        if (entry.state.status === 'loading') { entry.state = { ...entry.state, status: 'error' }; emit(entry) }
      })
      .finally(() => { entry.inflight = null })
    return entry.inflight
  }

  load()
  let debounce = null
  const channel = supabase
    .channel(`live-board-${key}-${Math.random().toString(36).slice(2, 8)}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'challenges', filter: `id=eq.${challengeId}` }, (payload) => {
      const stamp = payload.new?.results_updated_at
      if (stamp && stamp === entry.state.updatedAt && payload.new?.winners_published_at === entry.state.challenge?.winners_published_at) return
      clearTimeout(debounce)
      debounce = setTimeout(load, 600)
    })
    .subscribe()
  const poll = setInterval(() => { if (document.visibilityState === 'visible') load() }, POLL_MS)
  const offResume = onResume(load)

  entry.stop = () => {
    clearTimeout(debounce)
    clearInterval(poll)
    offResume()
    supabase.removeChannel(channel)
  }
  entry.reload = load
  return entry
}

function acquire(challengeId, groupId) {
  const key = keyOf(challengeId, groupId)
  const entry = entries.get(key) || start(key, challengeId, groupId)
  entry.users += 1
  return () => {
    entry.users -= 1
    // A beat before tearing down, so a card that re-mounts (a list re-render, a
    // room switch and back) picks the same board up rather than re-reading it.
    setTimeout(() => {
      if (entry.users <= 0 && entries.get(key) === entry) {
        entry.stop?.()
        entries.delete(key)
      }
    }, 4000)
  }
}

/**
 * The live board for one challenge (and one group on a split challenge).
 * @returns {{status:'loading'|'ready'|'missing'|'error', challenge, rows, prevRanks:Map, updatedAt}}
 */
export function useLiveLeaderboard(challengeId, groupId = null) {
  const key = challengeId ? keyOf(challengeId, groupId) : null
  useEffect(() => (challengeId ? acquire(challengeId, groupId) : undefined), [challengeId, groupId])
  return useSyncExternalStore(
    (cb) => {
      if (!key) return () => {}
      // The entry may not exist until the effect above has run; subscribe to it
      // lazily through a tiny poll-free indirection.
      let entry = entries.get(key)
      let bound = false
      const bind = () => {
        entry = entries.get(key)
        if (entry && !bound) { entry.listeners.add(cb); bound = true; cb() }
      }
      bind()
      const t = bound ? null : setTimeout(bind, 0)
      return () => { clearTimeout(t); entry?.listeners.delete(cb) }
    },
    () => (key ? entries.get(key)?.state ?? EMPTY : EMPTY),
    () => EMPTY,
  )
}
