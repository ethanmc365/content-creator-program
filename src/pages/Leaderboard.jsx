import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Avatar, EmptyState, PageHeader, Skeleton } from '../components/ui'
import Podium from '../components/Podium'
import { podiumTier } from '../lib/podiumTiers'
import Icon from '../components/Icon'
import { cx, formatViews } from '../lib/utils'
import { EASE } from '../lib/motion'
import { useT } from '../lib/i18n'

// EVERY CREATOR, RANKED BY WHAT THE PROGRAMME IS FOR.
//
// WHY VIEWS AND NOT POINTS. The community boards used to rank on points, and
// points are a per-CHALLENGE scoring mode - a brief can be scored by total
// views, by best video, or by points, and only the last one writes any. So the
// board was showing the score of the one challenge that happened to use that
// mode, presented as a standing in the community: a creator who had never
// entered a points-scored brief was simply absent, through no fault of their
// own, and nothing said why. Views is the number every creator has, in every
// challenge, under every scoring mode.
//
// EVERYBODY IS ON IT, including the creators sitting on zero. A board that
// lists only the people already winning tells a new creator nothing about where
// they stand, which is the one thing they opened it to find out.

// THE PODIUM IS THE SHARED ONE (components/Podium). It was written here first
// and the challenge podium was written separately, so the two drifted on colour
// and then on shape. Ethan: "I want them to be the same." They are the same
// component now, which is the only version of that promise that keeps.
//
// NO BADGE ON THE FACE. There was a star here - and before that a trophy, which
// at fourteen pixels collapsed into a small red X on somebody's photograph. The
// winner is already the biggest avatar, on the tallest block, in the middle, in
// full brand orange, with a "1" under it.

export default function Leaderboard() {
  const tr = useT()
  const { profile } = useAuth()
  const [rows, setRows] = useState(null)
  const [markets, setMarkets] = useState([])
  const [market, setMarket] = useState('')

  useEffect(() => {
    let alive = true
    supabase.from('communities')
      .select('id, name, kind, retired_at').eq('kind', 'chapter').order('name')
      .then(({ data }) => { if (alive) setMarkets((data || []).filter((m) => !m.retired_at)) })
    return () => { alive = false }
  }, [])

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('views_leaderboard', { p_community: market || null })
    setRows((data || []).map((r) => ({ ...r, views: Number(r.views || 0) })))
  }, [market])

  useEffect(() => { setRows(null); load() }, [load])

  // Views arrive on their own (the hourly sync writes straight to
  // submissions.logged_views), so the board re-ranks in place rather than
  // making people refresh to watch it move.
  useEffect(() => {
    const channel = supabase
      .channel('leaderboard-submissions')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'submissions' }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'submissions' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  const [expanded, setExpanded] = useState(false)
  useEffect(() => { setExpanded(false) }, [market])

  const posted = useMemo(() => (rows || []).filter((r) => r.views > 0), [rows])
  const top = posted.slice(0, 3)
  // EVERYBODY, FROM FIRST (4 Sep 2026). Ethan: "even though we have the podium,
  // it should still show everyone in the actual leaderboard below."
  //
  // This list used to begin at FOURTH, so the podium was not a picture of the
  // board's head, it was a replacement for it - the three names at the top were
  // in one shape and everybody else in another, and a reader looking for the
  // leader's row found the table starting at 4. A podium is a flourish over a
  // ranking, not a substitute for its first three rows.
  //
  // The creators on nought views come last: they ARE in the programme and they
  // are ranked last, which is both true and the only honest place to put them.
  const everyone = useMemo(
    () => [...posted, ...(rows || []).filter((r) => r.views === 0)],
    [posted, rows],
  )
  // Twelve rather than nine, because the list now carries the three that used
  // to be cut out of it - so "show all" still appears at the same place on the
  // board and the collapsed view still ends somewhere past tenth.
  const COLLAPSED = 12
  const shown = expanded ? everyone : everyone.slice(0, COLLAPSED)
  const hiddenCount = everyone.length - shown.length
  // The people who have not posted yet, counted rather than listed. They belong
  // on the board - they are in the programme - but forty names on nought views
  // under the top ten reads as a wall of failure rather than as a standing.
  const yetToPost = (rows || []).length - posted.length
  const mine = (rows || []).findIndex((r) => r.creator_id === profile?.id)

  return (
    <div className="page max-w-3xl">
      <PageHeader title={tr("All-time leaderboard")} />

      {/* WHICH MARKET. The board is worldwide by default, because that is the
          community somebody opening a leaderboard is asking about - but a UK
          creator wanting to know where they stand among their own is asking a
          different, equally fair question. */}
      {markets.length > 1 && (
        <div className="mb-6 flex flex-wrap items-center gap-1.5 rounded-card border border-gray-100 bg-white p-1.5 shadow-card">
          <button
            type="button"
            onClick={() => setMarket('')}
            aria-pressed={!market}
            className={cx(
              'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
              !market ? 'bg-brand text-white' : 'text-smoke hover:bg-cloud hover:text-ink',
            )}
          >
            {tr("Worldwide")}
          </button>
          {markets.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMarket(m.id)}
              aria-pressed={market === m.id}
              className={cx(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                market === m.id ? 'bg-brand text-white' : 'text-smoke hover:bg-cloud hover:text-ink',
              )}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}

      {rows === null ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : posted.length === 0 ? (
        <EmptyState
          icon={<Icon name="trophy" className="h-7 w-7" />}
          title={tr("Nobody has posted here yet")}
          hint={tr("The first video on the board sets the pace.")}
        />
      ) : (
        <>
          <Podium
            meId={profile?.id}
            className="mb-8"
            places={top.map((c, i) => ({
              rank: i + 1,
              id: c.creator_id,
              name: c.name,
              photo_url: c.photo_url,
              score: formatViews(c.views),
            }))}
          />

          {shown.length > 0 && (
            <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
              {shown.map((c, i) => {
                const place = i + 1
                const isMe = c.creator_id === profile?.id
                return (
                  /* THE BOARD ARRIVES IN ORDER: THE PODIUM, THEN THE REST.
                     Ethan: "improve the animation of this - first the podium
                     shows up, and then the other ones, four, five, six, seven."
                     The podium's own ladder finishes at about 240ms, so the
                     rows start after it rather than alongside it, and each is
                     one 45ms step behind the last. THE LADDER IS CAPPED AT
                     EIGHT: an uncapped stagger over forty rows would take two
                     seconds to finish, and a list that is still assembling
                     after two seconds reads as a slow page, not as a flourish.
                     Everything past the eighth simply arrives with the eighth. */
                  /* THE DIVIDER MOVES TO THE WRAPPER. `last:border-0` picks the
                     last element among its SIBLINGS, and once every row is
                     wrapped, each Link is the only child of its own wrapper -
                     so every single row would have counted as "last" and the
                     list would have lost all of its dividers. The wrappers are
                     the siblings now, so the rule means what it says. */
                  <motion.div
                    key={c.creator_id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.34 + Math.min(i, 8) * 0.045, duration: 0.32, ease: EASE }}
                    className="border-b border-gray-50 last:border-0"
                  >
                  <Link
                    to={`/profile/${c.creator_id}`}
                    className={cx(
                      'flex items-center gap-4 px-4 py-3.5 transition-colors sm:px-6',
                      isMe ? 'bg-brand-tint/50 hover:bg-brand-tint' : 'hover:bg-cloud/60',
                    )}
                  >
                    {/* A PLACE LOOKS THE SAME EVERYWHERE (lib/podiumTiers).
                        Now that the top three are IN this list as well as on
                        the podium above it, their chips have to carry the same
                        ladder - a first place drawn as a plain grey circle two
                        inches under a brand-orange first step is the two halves
                        of one board disagreeing about who won. Everything from
                        fourth down stays a plain number, which is what stops a
                        forty-place board from looking like forty awards. */}
                    <span
                      className={cx(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums',
                        place > 3 && (isMe ? 'bg-brand text-white' : 'bg-cloud text-smoke'),
                      )}
                      style={place <= 3 ? { background: podiumTier(place).disc, color: podiumTier(place).ink } : undefined}
                    >
                      {place}
                    </span>
                    <Avatar src={c.photo_url} name={c.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {c.name}
                        {isMe && <span className="ml-1.5 text-xs font-medium text-brand">{tr("You")}</span>}
                      </p>
                      <p className="truncate text-xs text-smoke">
                        {c.posts} {c.posts === 1 ? 'video' : 'videos'}
                        {c.wins > 0 && ` · ${c.wins} ${c.wins === 1 ? 'win' : 'wins'}`}
                        {/* Which market they fly for, but only on the worldwide
                            board - inside a market it is the same answer on
                            every row. */}
                        {!market && c.markets?.length > 0 && ` · ${c.markets[0]}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={cx('text-sm font-bold tabular-nums', c.views > 0 ? 'text-brand' : 'text-gray-300')}>
                        {formatViews(c.views)}
                      </p>
                      <p className="text-[11px] text-smoke">views</p>
                    </div>
                  </Link>
                  </motion.div>
                )
              })}
            </div>
          )}

          {/* EXPANDING SHOWS EVERYONE, INCLUDING THE PEOPLE ON NOUGHT.
              Ethan: "it should show up absolutely everyone here whenever you
              click to expand it."
              Two things were hiding people. The board only ever drew the
              creators with views above zero, and counted the rest in a line at
              the foot - which was a deliberate call ("forty names on nought
              views reads as a wall of failure rather than as a standing") and
              is the right DEFAULT, not the right only option. And a long board
              is a long scroll before you reach anything else.
              So the default is the podium plus nine, the button says how many
              more there are, and opening it lists every single creator in the
              programme in order, the zeroes included and drawn quietly. */}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mx-auto mt-4 flex items-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-smoke transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:text-brand"
            >
              <Icon name={expanded ? 'chevronUp' : 'chevronDown'} className="h-4 w-4" />
              {expanded ? 'Show fewer' : `Show all ${everyone.length + 3} creators`}
            </button>
          )}

          {!expanded && yetToPost > 0 && (
            <p className="mt-4 text-center text-xs text-smoke">
              {yetToPost} {yetToPost === 1 ? 'creator has' : 'creators have'} not posted yet.
              {mine >= 0 && rows[mine]?.views === 0 && ' Your first video puts you on the board.'}
            </p>
          )}
        </>
      )}
    </div>
  )
}
