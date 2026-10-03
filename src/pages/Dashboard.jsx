import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { PageHeader, Skeleton, EmptyState } from '../components/ui'
import Icon from '../components/Icon'
import Reveal from '../components/network/Reveal'
import VideoThumb from '../components/VideoThumb'
import SocialMark from '../components/SocialMark'
import { CountUp } from '../components/network/Motion'
import { cx, formatMoney, formatViews } from '../lib/utils'
import { rewardsTotal } from '../lib/programme'
import { useViewAs, ViewingAsBanner } from '../components/ViewingAs'
import { useT } from '../lib/i18n'

// A `rewardsTotal` result, printed. "≈" whenever a conversion was involved.
const money = (t) => `${t?.converted ? '≈ ' : ''}${formatMoney(t?.amount ?? 0, t?.currency ?? 'EUR')}`

// YOUR DASHBOARD IS ABOUT YOU (3 Oct 2026).
//
// Ethan: "the community highlights are not necessary on the dashboard. The dashboard should just be about their own
// performance ... have it actually show a nice visual of where they appeared in the leaderboard: if they were on the
// podium or if they finished fourth or fifth ... For best finish, I don't really like the way it's #4. Maybe just have
// a nice icon." So: four figures that are all yours (what you entered, posted, were watched and earned), your best
// finish as a medal or a trophy, every result drawn as a small podium with your place lit, and - where the community
// figures were - your videos and your links, the same things your profile shows other creators.
const MEDAL = {
  1: { ring: 'from-amber-300 to-yellow-500', text: 'text-amber-600', label: 'Gold' },
  2: { ring: 'from-slate-200 to-slate-400', text: 'text-slate-500', label: 'Silver' },
  3: { ring: 'from-orange-300 to-amber-700', text: 'text-amber-800', label: 'Bronze' },
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

export default function Dashboard() {
  const tr = useT()
  // `?as=<id>` lets an admin read one creator's own dashboard. Inert for everybody else - see components/ViewingAs.
  const { id: whose, viewing, person } = useViewAs()
  const [data, setData] = useState(null)

  useEffect(() => {
    async function load() {
      const [{ data: mySubs }, { data: myResults }, { data: myRewards }, { data: me }] = await Promise.all([
        supabase.from('submissions')
          .select('id, challenge_id, logged_views, platform, video_url, thumbnail_url, caption, submitted_at, challenges(title)')
          .eq('creator_id', whose).order('logged_views', { ascending: false, nullsFirst: false }),
        supabase.from('results').select('*, challenges(title)').eq('creator_id', whose).order('created_at', { ascending: false }),
        // Filtered to this person: an admin can read every reward, and this is one creator's own page.
        supabase.from('rewards').select('amount, status, currency').eq('creator_id', whose),
        supabase.from('profiles').select('instagram_url, tiktok_url, youtube_url, facebook_url, linkedin_url, other_links').eq('id', whose).maybeSingle(),
      ])
      // How many finished each challenge, so a place reads "4th of 23" and the podium knows its width.
      const ids = [...new Set((myResults ?? []).map((r) => r.challenge_id))]
      const { data: field } = ids.length
        ? await supabase.from('results').select('challenge_id').in('challenge_id', ids)
        : { data: [] }
      const of = {}
      for (const r of field ?? []) of[r.challenge_id] = (of[r.challenge_id] || 0) + 1

      setData({
        subs: mySubs ?? [],
        challengesEntered: new Set((mySubs ?? []).map((s) => s.challenge_id)).size,
        results: (myResults ?? []).map((r) => ({ ...r, of: of[r.challenge_id] || null })),
        // Total views come from the entries, never from `results` (one ranked video per challenge).
        totalViews: (mySubs ?? []).reduce((s, r) => s + Number(r.logged_views || 0), 0),
        bestRank: (myResults ?? []).reduce((best, r) => Math.min(best, r.rank), Infinity),
        earned: rewardsTotal((myRewards ?? []).filter((r) => r.status === 'distributed')),
        pending: rewardsTotal((myRewards ?? []).filter((r) => r.status === 'pending')),
        links: me || {},
      })
    }
    load()
  }, [whose])

  if (!data) {
    return (
      <div className="page space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    )
  }

  const best = data.bestRank === Infinity ? null : data.bestRank
  const bestResult = best ? data.results.find((r) => r.rank === best) : null
  const tiles = [
    { label: tr('Challenges entered'), value: data.challengesEntered, icon: 'flag', fmt: (n) => String(Math.round(n)) },
    { label: tr('Videos posted'), value: data.subs.length, icon: 'video', fmt: (n) => String(Math.round(n)) },
    { label: tr('Views, all time'), value: data.totalViews, icon: 'eye', fmt: (n) => formatViews(Math.round(n)) },
    { label: tr('You have earned'), value: data.earned.amount, icon: 'money', fmt: () => money(data.earned), hint: data.pending.amount > 0 ? tr('{a} on its way', { a: money(data.pending) }) : null },
  ]
  const links = [
    ['instagram', data.links.instagram_url], ['tiktok', data.links.tiktok_url], ['youtube', data.links.youtube_url],
    ['facebook', data.links.facebook_url], ['linkedin', data.links.linkedin_url],
  ].filter(([, u]) => u)

  return (
    <div className="page max-w-5xl">
      <PageHeader title={tr('Dashboard')} subtitle={tr('Your performance in the community, at a glance.')} />
      <ViewingAsBanner viewing={viewing} person={person} />

      {/* ---------- My numbers ---------- */}
      <Reveal className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" row stagger={0.06}>
        {tiles.map((t) => (
          <div key={t.label} className="rounded-card border border-gray-100 bg-white px-4 py-4 shadow-card">
            <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-gray-400"><Icon name={t.icon} className="h-3.5 w-3.5 text-brand" />{t.label}</p>
            <p className="mt-1.5 truncate text-2xl font-bold tabular-nums text-ink"><CountUp value={t.value} format={t.fmt} /></p>
            {t.hint && <p className="mt-0.5 truncate text-[11px] text-smoke">{t.hint}</p>}
          </div>
        ))}
      </Reveal>

      {/* ---------- Best finish, as a medal ---------- */}
      <Reveal className="mb-12" delay={0.1}>
        <BestFinish rank={best} result={bestResult} tr={tr} />
      </Reveal>

      {/* ---------- My results, each one a podium ---------- */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><Icon name="trophy" className="h-5 w-5 text-brand" />{tr('Challenge results')}</h2>
        {data.results.length === 0 ? (
          <EmptyState
            icon={<Icon name="chart" className="h-7 w-7" />}
            title={tr('No results yet')}
            hint={tr('Results appear after a challenge closes and the Tryp.com Team logs the final views.')}
            action={<Link to="/challenges" className="btn-primary">{tr('Enter the live challenge')}</Link>}
          />
        ) : (
          <Reveal className="grid gap-3 sm:grid-cols-2" stagger={0.06}>
            {data.results.map((r) => (
              <Link key={r.id} to={`/challenges/${r.challenge_id}`} className="group flex items-center gap-4 rounded-card border border-gray-100 bg-white p-4 shadow-card transition-all duration-300 hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift">
                <MiniPodium rank={r.rank} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{r.challenges?.title}</p>
                  <p className={cx('mt-0.5 text-xs font-semibold', MEDAL[r.rank]?.text || 'text-smoke')}>
                    {r.rank <= 3 ? tr('{m} · on the podium', { m: tr(MEDAL[r.rank].label) }) : tr('Finished {p}', { p: ordinal(r.rank) })}
                    {r.of ? <span className="font-normal text-smoke"> {tr('of {n}', { n: r.of })}</span> : null}
                  </p>
                  {r.of > 3 && <PlaceTrack rank={r.rank} of={r.of} />}
                </div>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-bold tabular-nums text-ink">{formatViews(r.final_views)}</span>
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">{tr('views')}</span>
                </span>
              </Link>
            ))}
          </Reveal>
        )}
      </section>

      {/* ---------- My content: what my profile shows ---------- */}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Icon name="video" className="h-5 w-5 text-brand" />{tr('Your content')}</h2>
          {!viewing && <Link to={`/profile/${whose}`} className="text-xs font-semibold text-brand hover:underline">{tr('As it shows on your profile')}</Link>}
        </div>
        {links.length > 0 && (
          <Reveal className="mb-4 flex flex-wrap gap-2" row stagger={0.04}>
            {links.map(([k, u]) => (
              <a key={k} href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold capitalize text-ink transition-all duration-200 hoverable:hover:-translate-y-px hoverable:hover:border-brand/40 hoverable:hover:text-brand">
                <SocialMark brand={k} colored className="h-4 w-4" />{k === 'tiktok' ? 'TikTok' : k === 'youtube' ? 'YouTube' : k === 'linkedin' ? 'LinkedIn' : k}
              </a>
            ))}
          </Reveal>
        )}
        {data.subs.length === 0 ? (
          <EmptyState
            icon={<Icon name="video" className="h-7 w-7" />}
            title={tr('No videos yet')}
            hint={tr('Enter a challenge and your videos show up here and on your profile.')}
            action={<Link to="/challenges" className="btn-primary">{tr('See the challenges')}</Link>}
          />
        ) : (
          <Reveal className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" stagger={0.05}>
            {data.subs.slice(0, 8).map((v) => (
              <a key={v.id} href={v.video_url} target="_blank" rel="noopener noreferrer" className="group flex flex-col overflow-hidden rounded-card border border-gray-100 bg-white shadow-card transition-all duration-300 hoverable:hover:-translate-y-1 hoverable:hover:shadow-lift">
                <span className="relative block">
                  <VideoThumb url={v.video_url} platform={v.platform} thumbnailUrl={v.thumbnail_url} />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent px-3 pb-2.5 pt-8 text-white">
                    <span className="block text-lg font-bold tabular-nums leading-none">{formatViews(v.logged_views || 0)}</span>
                    <span className="block text-[10px] font-semibold uppercase tracking-wide text-white/80">{tr('views')}</span>
                  </span>
                </span>
                <span className="block truncate px-3 py-2.5 text-xs text-smoke">{v.challenges?.title || v.platform}</span>
              </a>
            ))}
          </Reveal>
        )}
      </section>
    </div>
  )
}

/** The best place you have ever finished, as a medal (1-3) or a trophy, never "#4". */
function BestFinish({ rank, result, tr }) {
  if (!rank) {
    return (
      <div className="flex items-center gap-4 rounded-card border border-dashed border-gray-200 bg-cloud/40 p-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-gray-300 shadow-card"><Icon name="trophy" className="h-6 w-6" /></span>
        <p className="text-sm text-smoke">{tr('Your best finish appears here once a challenge you entered has its results.')}</p>
      </div>
    )
  }
  const m = MEDAL[rank]
  return (
    <div className="relative flex items-center gap-4 overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-4 text-white shadow-card sm:p-5">
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-white/15 blur-2xl" />
      <span className={cx('relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full shadow-card', m ? `bg-gradient-to-br ${m.ring}` : 'bg-white/20')}>
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/25 ring-2 ring-white/60">
          <Icon name="trophy" className="h-6 w-6 text-white" strokeWidth={2} />
        </span>
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-white/85">{tr('Your best finish')}</span>
        <span className="block text-xl font-bold leading-tight">{m ? tr('{m} medal, {p} place', { m: tr(m.label), p: ordinal(rank) }) : tr('{p} place', { p: ordinal(rank) })}</span>
        {result?.challenges?.title && <span className="block truncate text-xs text-white/90">{result.challenges.title}</span>}
      </span>
    </div>
  )
}

/** Three steps of a podium with yours lit; past third, the podium stays grey and a marker sits beside it. */
function MiniPodium({ rank }) {
  const steps = [{ p: 2, h: 'h-6' }, { p: 1, h: 'h-9' }, { p: 3, h: 'h-4' }]
  return (
    <span aria-hidden className="relative flex h-12 w-16 shrink-0 items-end justify-center gap-0.5">
      {steps.map((s) => {
        const mine = s.p === rank
        return (
          <span key={s.p} className={cx('flex w-4 flex-col items-center justify-end rounded-t-md', s.h, mine ? `bg-gradient-to-b ${MEDAL[s.p].ring} shadow-card` : 'bg-gray-100')}>
            <span className={cx('mb-0.5 text-[9px] font-extrabold', mine ? 'text-white' : 'text-gray-300')}>{s.p}</span>
          </span>
        )
      })}
      {rank > 3 && (
        <span className="absolute -right-1 -top-0.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-extrabold text-white shadow-card">{rank}</span>
      )}
    </span>
  )
}

/** Where in the field you finished: a track from first to last with your place on it. */
function PlaceTrack({ rank, of }) {
  const pct = of > 1 ? ((rank - 1) / (of - 1)) * 100 : 0
  return (
    <span className="mt-2 block">
      <span className="relative block h-1.5 rounded-full bg-gradient-to-r from-brand/25 via-gray-100 to-gray-100">
        <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand shadow-card" style={{ left: `${pct}%` }} />
      </span>
    </span>
  )
}
