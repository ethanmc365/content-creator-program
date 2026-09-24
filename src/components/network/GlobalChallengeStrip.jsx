import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import CountdownTimer from '../CountdownTimer'
import Icon from '../Icon'
import { Avatar } from '../ui'
import { ordinalFor } from '../../lib/podiumTiers'
import { isHiddenTestRow } from '../../lib/testData'
import { cx, formatViews } from '../../lib/utils'
import { useT } from '../../lib/i18n'
import GlowRing from './GlowRing'

// THE GLOBAL CHALLENGE, ON THE COMMUNITY CARD (21 Sep 2026).
//
// Ethan, the evening it launched: "for the Tryp.com content creator community
// card, we have that big card there that shows the plane. I would extend that
// for desktop and add in the Global Challenge details there. Don't make it too
// big, and no bigger than twice the size it currently is... showing the time,
// the leaderboard, 'Read the brief and submit your video'... and show the title."
// And: "I wouldn't change the colour. Just keep it the way it currently is."
//
// So this is a band at the foot of that card, on the card's own gradient: the
// title and the clock on the left, the top three in the middle, the two buttons
// on the right. It replaces the "Open to everyone" section that sat under the
// card as a second, full-size copy of the same challenge.
//
// IT WEARS THE GLOBAL CHALLENGE'S OWN LOOK NOW (22 Sep 2026). Ethan: "make this
// global challenge card inside match the style, gradient and animations of the
// global challenge card, that darker gradient." A translucent white panel on
// the orange card read as part of the community card; this is the Global
// Challenge card in miniature - the same deep-to-bright gradient, the same one
// sweep of light as it arrives, and the same "Global challenge" pill. (The
// turning Earth was tried here and removed the same day as too much.)

// The last top three per challenge, kept across visits so a return to the hub
// draws the names on the first frame instead of a placeholder.
const topCache = new Map()

function useTopThree(challengeId) {
  const [rows, setRows] = useState(() => topCache.get(challengeId) ?? null)
  useEffect(() => {
    if (!challengeId) return undefined
    let alive = true
    supabase.from('results')
      .select('creator_id, rank, final_views, profiles:creator_id(name, photo_url, is_test)')
      .eq('challenge_id', challengeId)
      .lte('rank', 4)
      .order('rank')
      .then(({ data }) => {
        const next = (data || []).filter((r) => !isHiddenTestRow(r.profiles)).slice(0, 3)
        topCache.set(challengeId, next)
        if (!alive) return
        setRows(next)
      })
    return () => { alive = false }
  }, [challengeId])
  return rows
}

export default function GlobalChallengeStrip({ challenge, className = '', arriveDelay = 0 }) {
  const tr = useT()
  const top = useTopThree(challenge?.id)
  if (!challenge) return null
  const points = challenge.scoring === 'points'
  const firstPrize = Array.isArray(challenge.prize_structure) ? challenge.prize_structure[0]?.prize : null
  // IT ARRIVES AFTER THE CARD IT SITS ON, wiping in the same way, and its
  // pieces follow it across (22 Sep 2026).
  const at = (s) => ({ animationDelay: `${arriveDelay + s}s` })

  // THE GLOW IS ON A WRAPPER (22 Sep 2026): the card itself clips its
  // contents (`overflow-hidden`, for the blooms and the sheen), so a light
  // running round its border has to live one box further out.
  //
  // NO HOVER MAGNIFY ANY MORE (23 Sep 2026, REMOVED). It used to scale and
  // lift the whole card AND animate its box-shadow at the same time on
  // hover - Ethan: "whenever I go over it, it magnifies. It's insanely
  // laggy." A `box-shadow` transition repaints the card's shadow every
  // frame for the whole 300ms, on a card that already carries two blurred
  // blooms, a sheen and a glow ring - the single most expensive thing this
  // card could have animated on hover, for a flourish nobody asked to keep.
  return (
    <div
      className={cx('global-glow mt-7', className)}
    >
    <GlowRing tone="onOrange" />
    <div
      className="relative animate-card-wipe overflow-hidden rounded-2xl bg-gradient-to-br from-[#8f2a04] via-brand to-brand-light p-5 shadow-[0_18px_40px_-14px_rgba(90,25,0,0.45)] ring-1 ring-white/25 sm:p-6"
      style={at(0)}
    >
      {/* Depth: a light bloom top right and a shadow bloom bottom left. */}
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-black/20 blur-2xl" />
      {/* NO GLOBE HERE (22 Sep 2026). Ethan: "I don't think we need the
          spinning world map on that because it's too much", and the gradient
          was "almost too dark" - it is the Live now card's gradient now
          (LiveNowRow), a shade deeper than the orange card it sits on. */}
      <div aria-hidden className="challenge-sheen pointer-events-none absolute inset-0" style={at(0.45)} />

      <div className="relative grid items-center gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* What it is and how long is left. */}
        <div className="wipe-item min-w-0" style={at(0.1)}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider">
              {/* JUST THE DOT, NO RING (23 Sep 2026) - see `LiveDot` in
                  network/Motion.jsx. */}
              <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-white" />
              {tr('Live now')}
            </span>
            {/* NO "GLOBAL CHALLENGE" PILL (24 Sep 2026). Ethan: "it says Global
                Challenge as the title and then above Live Now there's another
                little card saying Global Challenge. We don't need that second
                card." The title right under it already says so. */}
          </div>
          <Link to={`/challenges/${challenge.id}`} className="group mt-2.5 block">
            <h3 className="inline-block origin-left truncate text-2xl font-bold leading-tight tracking-[-0.01em] transition-transform duration-200 group-hover:scale-[1.03]">
              {challenge.title}
            </h3>
          </Link>
          {firstPrize && <p className="mt-0.5 text-sm text-white/85">{tr('1st place wins {prize}', { prize: firstPrize })}</p>}
          <div className="mt-3">
            <CountdownTimer endDate={challenge.end_date} compact onDark />
          </div>
        </div>

        {/* Who is winning.

            THE BOX NEVER CHANGES SIZE, ONLY ITS CONTENT (23 Sep 2026). Ethan:
            "whenever the initial animation loads, everything seems to jump,
            the card expands a bit, and it looks like it jitters." The
            previous fix mounted a small label-only placeholder and then swapped
            in a taller, differently-shaded box once `top` arrived - which is
            itself a discrete layout jump, just moved one step later: the card
            visibly grew and its background changed colour the instant the
            rows landed. THE BOX ITSELF is now the same element throughout,
            sized for three rows from its first frame, so nothing about its
            footprint or its white panel ever changes - only the rows inside
            it fade from a skeleton to the real names once `top` resolves. */}
        <Link
          to={`/challenges/${challenge.id}?tab=leaderboard`}
          className="strip-board block rounded-xl bg-white/95 p-3 text-ink shadow-[0_14px_32px_rgba(40,10,0,0.28)] backdrop-blur transition-transform duration-200 hover:-translate-y-0.5 hover:scale-[1.03]"
          style={at(0.1)}
        >
          <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest text-brand">
            <Icon name="trophy" className="h-3.5 w-3.5" /> {tr('Leaderboard')}
          </p>
          {/* EXACTLY THREE ROWS TALL, WHATEVER IS IN IT (24 Sep 2026). Ethan:
              "the leaderboard seems to show up quite delayed, and it makes the
              card jump bigger." The placeholder avatar was 24px and the real
              one 28px, so the card grew 12px the moment the names landed; an
              empty board or a board of two was shorter again. Every row is now
              a fixed h-9 and the list holds three rows' height regardless. */}
          <div className="min-h-[7rem]">
          {top == null ? (
            <ul className="space-y-0.5" aria-hidden>
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex h-9 items-center gap-2 rounded-lg px-1.5">
                  <span className="h-3.5 w-7 shrink-0 animate-pulse rounded bg-cloud" />
                  <span className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-cloud" />
                  <span className="h-3.5 flex-1 animate-pulse rounded bg-cloud" />
                  <span className="h-3.5 w-9 shrink-0 animate-pulse rounded bg-cloud" />
                </li>
              ))}
            </ul>
          ) : top.length === 0 ? (
            <p className="px-1 py-2 text-sm text-smoke">{tr('No points yet. The first video takes the lead.')}</p>
          ) : (
            <ul className="space-y-0.5">
              {top.map((r, i) => (
                <li
                  key={r.creator_id}
                  className={cx('flex h-9 animate-fade-up items-center gap-2 rounded-lg px-1.5', Number(r.rank) === 1 && 'bg-brand-tint/60')}
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  <span className="w-7 shrink-0 text-[11px] font-bold tabular-nums text-brand">{ordinalFor(r.rank)}</span>
                  <Avatar src={r.profiles?.photo_url} name={r.profiles?.name} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.profiles?.name?.split(' ')[0]}</span>
                  <span className="shrink-0 text-sm font-bold tabular-nums">
                    {points ? tr('{n} pts', { n: Number(r.final_views || 0).toLocaleString() }) : formatViews(r.final_views)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          </div>
        </Link>

        {/* The two doors, the same size and the same shape. */}
        <div className="wipe-item grid grid-cols-2 gap-2.5 lg:col-span-2 xl:col-span-1 xl:grid-cols-1" style={at(0.2)}>
          <Link to={`/challenges/${challenge.id}`} className="btn flex-1 justify-center whitespace-nowrap border border-white/50 text-white hover:scale-105 hover:bg-white/10">
            {tr('Read the brief')}
          </Link>
          <Link to={`/challenges/${challenge.id}?submit=1`} className="btn flex-1 justify-center whitespace-nowrap border border-white bg-white !text-brand shadow-[0_8px_20px_rgba(40,10,0,0.25)] hover:scale-105 hover:bg-white/90">
            {tr('Submit your video')}
          </Link>
        </div>
      </div>
    </div>
    </div>
  )
}
