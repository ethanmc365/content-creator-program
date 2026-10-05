import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Avatar, Modal, Skeleton } from '../ui'
import Icon from '../Icon'
import Segmented from '../network/Segmented'
import FlagTile from '../network/FlagTile'
import { formatViews, cx } from '../../lib/utils'
import { useT } from '../../lib/i18n'

// COUNTRY AGAINST COUNTRY (4 Oct 2026, migration 324).
//
// Ethan, for the global challenge: "country versus country ... there's no reward for this, but it's just to see how each country is
// doing ... it might motivate creators to actually post for their country to get their market on the leaderboard as well." And for the
// creators with no home market: "rather than just having a blank square, you could add in the globe emoji."
//
// Every creator counts for the market they were placed in on approval. The bars are one hue because they compare ONE measure across
// countries; the switch above them changes which measure. Pressing a country opens the people who have actually entered for it, with
// what each brought in, and a line that says how many of its members have joined in - the nudge to be one of them.

const MEASURES = [
  { value: 'points', label: 'Points' },
  { value: 'views', label: 'Views' },
  { value: 'entries', label: 'Entries' },
  { value: 'creators', label: 'Creators' },
]


// THE NUMBERS DO NOT ANIMATE (5 Oct 2026). Ethan: "the animation isn't necessarily needed for the numbers, but for the cards moving positions."
// A count-up on four figures per row, all running while the cards slid, is what made switching measure look frantic. The figure now simply
// changes (rounded the same way every leaderboard rounds it - see formatViews) and the CARDS are what move.
function Figure({ value, measure }) {
  return <span className="inline-block min-w-[4.5rem] text-right tabular-nums">{fmt(measure, value)}</span>
}

// REORDER BY SLIDING, WITHOUT A LAYOUT LIBRARY. When the measure changes the rows change order; each row remembers where it was, and after the
// change plays one transform from the old place to the new (the "FLIP" technique). Only transforms animate, so nothing else is re-laid out.
function useFlip(listRef, order) {
  const tops = useRef(new Map())
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const next = new Map()
    for (const el of list.children) next.set(el.dataset.key, el.getBoundingClientRect().top)
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      for (const el of list.children) {
        const was = tops.current.get(el.dataset.key)
        const dy = was == null ? 0 : was - next.get(el.dataset.key)
        if (!dy) continue
        // SLOWER, AND THE MOVING CARD IS ON TOP (5 Oct 2026). 320ms read as a jump; ~0.85s with a long, soft landing reads as cards finding
        // their new places. A card climbing the board passes OVER the ones it overtakes instead of vanishing behind them, and the further a
        // card travels the slightly longer it takes, so a big climb does not look rushed next to a one-place swap.
        const travel = Math.min(1, Math.abs(dy) / 600)
        el.setAttribute('data-moving', '') // lifted above its neighbours while it travels (index.css)
        const anim = el.animate(
          [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
          { duration: 700 + Math.round(travel * 350), easing: 'cubic-bezier(0.33, 1, 0.68, 1)' },
        )
        const done = () => el.removeAttribute('data-moving')
        anim.onfinish = done
        anim.oncancel = done
      }
    }
    tops.current = next
  }, [listRef, order])
}

const fmt = (measure, n) => (measure === 'views' ? formatViews(Math.round(Number(n) || 0)) : Math.round(Number(n) || 0).toLocaleString())

/** The badge before a country's name: its flags, or a globe for the creators who have no home market. */
function Badge({ market, size = 'h-9 w-9', glyph = 'text-xl' }) {
  if (market.none) return <span title={market.name} className={cx('inline-flex shrink-0 items-center justify-center rounded-xl bg-cloud leading-none', size, glyph)} aria-hidden>🌍</span>
  return <FlagTile codes={market.codes} size={size} glyph={glyph} title={market.name} />
}

export default function CountryBoard({ challenge, refreshKey, meId }) {
  const tr = useT()
  const scoring = challenge?.scoring
  const [data, setData] = useState(undefined)
  const [measure, setMeasure] = useState(scoring === 'points' ? 'points' : 'views')
  const [open, setOpen] = useState(null)
  const listRef = useRef(null)
  // The bars grow from nothing ONCE, when the numbers first arrive. Switching the measure afterwards moves them from where they are.
  const [grown, setGrown] = useState(false)

  useEffect(() => {
    let alive = true
    supabase.rpc('challenge_market_board', { p_challenge: challenge.id }).then(({ data: d, error }) => { if (alive) setData(error ? null : d) })
    return () => { alive = false }
  }, [challenge.id, refreshKey])

  const measures = scoring === 'points' ? MEASURES : MEASURES.filter((m) => m.value !== 'points')
  const rows = useMemo(() => {
    if (!data) return []
    const all = [...(data.markets || []), ...(data.none ? [{ ...data.none, none: true }] : [])]
    return all
      .map((m) => ({ ...m, creators: Number(m.creators) || 0, entries: Number(m.entries) || 0, views: Number(m.views) || 0, points: Number(m.points) || 0, members: m.members == null ? null : Number(m.members) }))
      .sort((a, b) => ((b[measure] || 0) - (a[measure] || 0)) || (b.creators - a.creators) || String(a.name).localeCompare(String(b.name)))
  }, [data, measure])

  useFlip(listRef, rows.map((r) => r.id || 'none').join(','))
  useEffect(() => {
    if (!data) return undefined
    const t = setTimeout(() => setGrown(true), 60)
    return () => clearTimeout(t)
  }, [data])

  if (data === undefined) {
    return <div className="space-y-3" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-card" />)}</div>
  }
  if (!data) {
    return <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">{tr('The country leaderboard is not available right now.')}</p>
  }

  const max = Math.max(1, ...rows.map((r) => r[measure] || 0))
  const total = rows.reduce((n, r) => n + (r[measure] || 0), 0)
  const taking = rows.filter((r) => r.creators > 0 && !r.none).length
  const lead = rows.find((r) => (r[measure] || 0) > 0)
  const mine = rows.find((r) => r.mine)

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-5 text-white shadow-card sm:p-6">
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-14 h-48 w-48 rounded-full bg-white/15 blur-2xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="min-w-0 max-w-xl">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/85"><Icon name="globe" className="h-4 w-4" />{tr('Country against country')}</p>
            <p className="mt-1.5 text-2xl font-bold leading-tight sm:text-3xl">
              {lead ? tr('{n} leads', { n: lead.name }) : tr('Nobody has entered yet')}
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-2.5">
            {[[tr('Creators'), rows.reduce((n, r) => n + r.creators, 0)], [tr('Entries'), rows.reduce((n, r) => n + r.entries, 0)], [tr('Countries'), taking]].map(([label, v]) => (
              <div key={label} className="min-w-[4.4rem] rounded-2xl bg-white/15 px-3 py-2.5 text-center backdrop-blur-sm">
                <dd className="text-2xl font-bold tabular-nums leading-none">{v.toLocaleString()}</dd>
                <dt className="mt-1.5 text-[10px] font-bold uppercase tracking-wide text-white/85">{label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold text-ink">{tr('How each country is doing')}</h2>
        <Segmented value={measure} onChange={setMeasure} size="sm" label={tr('Measure')} options={measures.map((m) => ({ value: m.value, label: tr(m.label) }))} />
      </div>

      <ol ref={listRef} className="space-y-2.5">
        {rows.map((r, i) => {
          const value = r[measure] || 0
          const w = value / max
          const share = total ? value / total : 0
          const others = measures.filter((m) => m.value !== measure)
          return (
            <li key={r.id || 'none'} data-key={r.id || 'none'}>
              <button
                type="button"
                onClick={() => setOpen(r)}
                className={cx(
                  'group relative w-full overflow-hidden rounded-card border p-3.5 text-left shadow-card transition-[box-shadow,border-color,transform,background-color] duration-300 hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift sm:p-4',
                  // YOUR HOME COUNTRY IS SOLID BRAND, WITH WHITE ON IT (5 Oct 2026). Ethan: "I don't like that light orangey-yellow colour and just
                  // the little small orange bar." A picked thing on this platform is solid brand, never a tint; a market you belong to without it
                  // being your home keeps a quiet brand outline.
                  r.mine ? 'border-transparent bg-gradient-to-br from-brand to-brand-light text-white shadow-[0_10px_28px_-12px_rgba(217,68,7,0.7)]'
                    : r.also ? 'border-brand/35 bg-white' : 'border-gray-100 bg-white hoverable:hover:border-brand/30',
                )}
              >
                <div className="flex items-center gap-3">
                  <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold tabular-nums transition-colors duration-300', r.mine ? 'bg-white text-brand' : i === 0 && value > 0 ? 'bg-gradient-to-br from-brand to-brand-light text-white' : 'bg-cloud text-smoke')}>{i + 1}</span>
                  <Badge market={r} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className={cx('truncate text-[15px] font-bold', r.mine ? 'text-white' : 'text-ink')}>{r.none ? tr('Rest of the world') : r.name}</span>
                      {r.mine && <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand"><Icon name="home" className="h-3 w-3" />{tr('Your home market')}</span>}
                      {r.also && <span className="rounded-full border border-brand/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">{tr('Also yours')}</span>}
                    </span>
                    <span className={cx('block truncate text-xs', r.mine ? 'text-white/85' : 'text-smoke')}>
                      {r.creators > 0
                        ? `${r.creators === 1 ? tr('1 creator') : tr('{c} creators', { c: r.creators })} · ${r.entries === 1 ? tr('1 entry') : tr('{e} entries', { e: r.entries })}`
                        : r.none ? tr('Creators who are not placed in a market') : tr('Nobody has entered yet. Be the first.')}
                    </span>
                  </span>
                  {/* THE MEASURE ON SHOW IS THE BIG NUMBER; the other ones sit small beside it, so points, views, entries and creators are
                      all readable without switching (4 Oct 2026). */}
                  <span className={cx('hidden shrink-0 items-center gap-4 border-r pr-4 sm:flex', r.mine ? 'border-white/25' : 'border-gray-100')}>
                    {others.map((m) => (
                      <span key={m.value} className="text-right">
                        <span className={cx('block text-[13px] font-semibold tabular-nums leading-tight', r.mine ? 'text-white' : 'text-ink/80')}>{fmt(m.value, r[m.value])}</span>
                        <span className={cx('block text-[9px] font-bold uppercase tracking-wide', r.mine ? 'text-white/75' : 'text-gray-400')}>{tr(m.label)}</span>
                      </span>
                    ))}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={cx('block text-xl font-bold tabular-nums leading-tight', r.mine ? 'text-white' : 'text-ink')}><Figure value={value} measure={measure} /></span>
                    <span className={cx('block text-[10px] font-bold uppercase tracking-wide', r.mine ? 'text-white/85' : 'text-brand')}>{tr(measures.find((m) => m.value === measure)?.label || '')}</span>
                  </span>
                  <Icon name="chevronRight" className={cx('hidden h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 sm:block', r.mine ? 'text-white/80' : 'text-gray-300 group-hover:text-brand')} />
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <span className={cx('relative h-2.5 flex-1 overflow-hidden rounded-full', r.mine ? 'bg-white/25' : 'bg-cloud')}>
                    <span
                      className={cx('absolute inset-y-0 left-0 rounded-full transition-[width] duration-[900ms] ease-[cubic-bezier(0.33,1,0.68,1)]', r.mine ? 'bg-white' : 'bg-gradient-to-r from-brand to-brand-light')}
                      style={{ width: grown ? `${value > 0 ? Math.max(2.5, w * 100) : 0}%` : '0%', transitionDelay: grown ? '0ms' : `${Math.min(i, 8) * 55}ms` }}
                    />
                  </span>
                  <span className={cx('w-10 shrink-0 text-right text-[11px] font-semibold tabular-nums', r.mine ? 'text-white/90' : 'text-smoke')}>{value > 0 ? `${Math.round(share * 100)}%` : ''}</span>
                </div>
                {r.members ? (
                  <p className={cx('mt-2 text-[11px]', r.mine ? 'text-white/85' : 'text-smoke')}>{tr('{a} of {b} members have entered', { a: r.creators, b: r.members })}</p>
                ) : null}
              </button>
            </li>
          )
        })}
      </ol>

      {mine && mine.members && mine.creators < mine.members && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-brand/20 bg-brand-tint/40 px-4 py-3.5">
          <p className="min-w-0 text-sm font-semibold text-ink">{tr('{n} members of {c} have not entered yet. One video from you moves {c} up.', { n: mine.members - mine.creators, c: mine.name })}</p>
          <Link to={`/challenges/${challenge.id}?tab=brief&submit=1`} className="btn-primary !py-2 text-xs"><Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.4} />{tr('Add my video')}</Link>
        </div>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? (open.none ? tr('Rest of the world') : open.name) : ''} wide>
        {open && <CountryPeople market={open} measure={measure} rank={rows.findIndex((r) => (r.id || 'none') === (open.id || 'none')) + 1} meId={meId} challengeId={challenge.id} scoring={scoring} />}
      </Modal>
    </div>
  )
}

/** The people who entered for one country, with what each brought. */
function CountryPeople({ market, measure, rank, meId, challengeId, scoring }) {
  const tr = useT()
  const people = market.people || []
  const lead = Math.max(1, ...people.map((p) => Number(p[measure === 'creators' || measure === 'entries' ? 'points' : measure]) || 0))
  const tiles = [
    ...(scoring === 'points' ? [[tr('Points'), market.points.toLocaleString()]] : []),
    [tr('Views'), formatViews(market.views)], [tr('Entries'), market.entries.toLocaleString()], [tr('Creators'), market.creators.toLocaleString()],
  ]
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Badge market={market} size="h-12 w-12" glyph="text-3xl" />
        <div className="min-w-0">
          <p className="text-sm text-smoke">{rank ? tr('Number {n} on the country leaderboard', { n: rank }) : ''}</p>
          {market.members ? <p className="text-xs text-smoke">{tr('{a} of {b} members have entered', { a: market.creators, b: market.members })}</p> : null}
        </div>
      </div>
      <dl className={cx('grid gap-2', tiles.length === 4 ? 'grid-cols-4' : 'grid-cols-3')}>
        {tiles.map(([label, v]) => (
          <div key={label} className="rounded-xl bg-cloud px-2 py-2.5 text-center">
            <dd className="text-lg font-bold tabular-nums text-brand">{v}</dd>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</dt>
          </div>
        ))}
      </dl>
      {people.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-smoke">
          {market.none ? tr('Nobody here yet.') : tr('Nobody from {c} has entered yet. The first video puts them on the board.', { c: market.name })}
        </p>
      ) : (
        <ul className="divide-y divide-gray-50 overflow-hidden rounded-xl border border-gray-100">
          {people.map((p, i) => {
            const v = Number(p[scoring === 'points' ? 'points' : 'views']) || 0
            return (
              <li key={p.id} className={cx('flex items-center gap-3 px-3.5 py-2.5', p.id === meId && 'bg-brand-tint/50')}>
                <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-gray-400">{i + 1}</span>
                <Link to={`/profile/${p.id}`} className="flex min-w-0 flex-1 items-center gap-2.5 hover:text-brand">
                  <Avatar src={p.photo} name={p.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{p.name}{p.id === meId ? <span className="ml-1.5 text-xs font-bold text-brand">{tr('You')}</span> : null}</span>
                    <span className="mt-1 block h-1 max-w-[9rem] overflow-hidden rounded-full bg-gray-100"><span className="block h-full rounded-full bg-gradient-to-r from-brand to-brand-light" style={{ width: `${Math.max(4, Math.round((v / lead) * 100))}%` }} /></span>
                  </span>
                </Link>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-bold tabular-nums text-ink">{scoring === 'points' ? `${Math.round(v).toLocaleString()} ${tr('pts')}` : formatViews(v)}</span>
                  <span className="block text-[11px] text-smoke">{p.entries === 1 ? tr('1 entry') : tr('{n} entries', { n: p.entries })} · {formatViews(p.views)}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <div className="flex justify-end"><Link to={`/challenges/${challengeId}?tab=brief&submit=1`} className="btn-primary !py-2 text-sm"><Icon name="plus" className="h-4 w-4" strokeWidth={2.4} />{tr('Add my video')}</Link></div>
    </div>
  )
}
