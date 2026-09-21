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

function useTopThree(challengeId) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    if (!challengeId) return undefined
    let alive = true
    supabase.from('results')
      .select('creator_id, rank, final_views, profiles:creator_id(name, photo_url, is_test)')
      .eq('challenge_id', challengeId)
      .lte('rank', 4)
      .order('rank')
      .then(({ data }) => {
        if (!alive) return
        setRows((data || []).filter((r) => !isHiddenTestRow(r.profiles)).slice(0, 3))
      })
    return () => { alive = false }
  }, [challengeId])
  return rows
}

export default function GlobalChallengeStrip({ challenge, className = '' }) {
  const tr = useT()
  const top = useTopThree(challenge?.id)
  if (!challenge) return null
  const points = challenge.scoring === 'points'
  const firstPrize = Array.isArray(challenge.prize_structure) ? challenge.prize_structure[0]?.prize : null

  return (
    <div className={cx('relative mt-7 rounded-2xl bg-white/[0.13] p-5 ring-1 ring-white/25 backdrop-blur-sm', className)}>
      <div className="grid items-center gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* What it is and how long is left. */}
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-white/85">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/80" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
            </span>
            {tr('Live worldwide')}
          </p>
          <Link to={`/challenges/${challenge.id}`} className="group mt-1 block">
            <h3 className="inline-block origin-left truncate text-2xl font-bold leading-tight transition-transform duration-200 group-hover:scale-[1.03]">
              {challenge.title}
            </h3>
          </Link>
          {firstPrize && <p className="mt-0.5 text-sm text-white/85">{tr('1st place wins {prize}', { prize: firstPrize })}</p>}
          <div className="mt-3">
            <CountdownTimer endDate={challenge.end_date} compact onDark />
          </div>
        </div>

        {/* Who is winning. */}
        <Link
          to={`/challenges/${challenge.id}?tab=leaderboard`}
          className="block rounded-xl bg-white p-3 text-ink shadow-[0_10px_28px_rgba(0,0,0,0.16)] transition-transform duration-200 hover:-translate-y-0.5"
        >
          <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest text-brand">
            <Icon name="trophy" className="h-3.5 w-3.5" /> {tr('Leaderboard')}
          </p>
          {top == null ? (
            <div className="space-y-1.5 px-1 py-1">
              {[0, 1, 2].map((i) => <div key={i} className="h-6 animate-pulse rounded-lg bg-cloud" />)}
            </div>
          ) : top.length === 0 ? (
            <p className="px-1 py-2 text-sm text-smoke">{tr('No points yet. The first video takes the lead.')}</p>
          ) : (
            <ul className="space-y-0.5">
              {top.map((r) => (
                <li key={r.creator_id} className={cx('flex items-center gap-2 rounded-lg px-1.5 py-1', Number(r.rank) === 1 && 'bg-brand-tint/60')}>
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
        </Link>

        {/* The two doors, the same size and the same shape. */}
        <div className="flex gap-2.5 lg:col-span-2 xl:col-span-1 xl:flex-col">
          <Link to={`/challenges/${challenge.id}`} className="btn flex-1 justify-center whitespace-nowrap border border-white/50 text-white hover:bg-white/10">
            {tr('Read the brief')}
          </Link>
          <Link to={`/challenges/${challenge.id}?submit=1`} className="btn flex-1 justify-center whitespace-nowrap border border-white bg-white !text-brand hover:bg-white/90">
            {tr('Submit your video')}
          </Link>
        </div>
      </div>
    </div>
  )
}
