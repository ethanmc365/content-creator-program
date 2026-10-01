import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Modal, Skeleton, Spinner } from '../ui'
import Icon from '../Icon'
import CreatorMap from '../CreatorMap'
import FlagTile from '../network/FlagTile'
import DealFinder from '../DealFinder'
import HookButton from '../HookButton'
import Reveal from '../network/Reveal'
import TranslatedText, { TLine } from '../TranslatedText'
import { CountUp } from '../network/Motion'
import { TargetBar } from './parts'
import { noteExcerpt, renderNote } from '../../lib/noteMarkdown'
import { notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { cx, formatDate } from '../../lib/utils'
import { BRIEF_METRICS, PERK_KINDS, money, monthLabel, nf, prizesByPlace, safeAccent, unitLabel, useOptionalRpc, vipRpc } from '../../lib/vip'
import { ordinalFor } from '../../lib/podiumTiers'
import { useT } from '../../lib/i18n'

// THE VIP'S SIDE, THIRD PASS (30 Sep 2026, migration 299): this month's challenge, how the markets compare, perks and
// trips to unlock, the content library, the VIP map and the creator's own settings. Every block asks politely
// (useOptionalRpc) so a database without migration 299 draws nothing instead of an error.

// ------------------------------------------------------------------------------ this month's challenge
/** The month's challenge(s): a theme, a brief, hook ideas, a goal and live standings. */
export function VipChallengeCard({ overview }) {
  const tr = useT()
  const { year, month } = overview.month
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let alive = true
    supabase.from('vip_briefs').select('*').eq('year', year).eq('month', month).order('programme_id', { ascending: true, nullsFirst: true })
      .then(({ data, error }) => { if (alive) setRows(error ? [] : data || []) })
    return () => { alive = false }
  }, [year, month])
  if (!rows || rows.length === 0) return null
  return (
    <section className="space-y-4" aria-label={tr('This month\'s challenge')}>
      {rows.map((b) => <BriefCard key={b.id} brief={b} overview={overview} />)}
    </section>
  )
}

function BriefCard({ brief, overview }) {
  const tr = useT()
  const [open, setOpen] = useState(false)
  const { data: standings } = useOptionalRpc('vip_brief_standings', { p_brief: brief.id }, brief.id)
  const s = overview.stats
  const mine = brief.metric === 'videos' ? s.videos : brief.metric === 'best_video'
    ? Math.max(0, ...(overview.videos || []).filter((v) => v.status === 'tracking').map((v) => Number(v.views_counted) || 0)) : s.views
  const me = (standings || []).find((r) => r.me)
  // THE PRIZES COME FROM THE BONUS RULES (1 Oct 2026), the way the main challenges' prize lists come from their
  // structure, so the team sets them once. The typed prize is now only an extra note.
  const [rules, setRules] = useState([])
  const pid = brief.programme_id || overview.programme?.id
  useEffect(() => {
    if (!pid) return undefined
    let alive = true
    supabase.from('vip_bonus_rules').select('*').eq('programme_id', pid).eq('active', true).then(({ data }) => { if (alive) setRules(data || []) })
    return () => { alive = false }
  }, [pid])
  const places = prizesByPlace(rules, tr, overview.programme?.currency)
  return (
    <article className="overflow-hidden rounded-card border border-brand/20 bg-brand-tint/60 p-5 shadow-card animate-fade-up sm:p-6">
      <p className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-brand">
        <Icon name="flag" className="h-3.5 w-3.5" />{tr('VIP challenge')} · {monthLabel(brief.year, brief.month)}
        {brief.theme && <span className="rounded-full bg-white px-2.5 py-0.5 text-[10px] tracking-wide text-brand shadow-sm"><TLine text={brief.theme} /></span>}
      </p>
      <h3 className="mt-2 text-xl font-bold leading-tight text-ink"><TLine text={brief.title} /></h3>
      {brief.body && <div className="mt-2"><TranslatedText text={brief.body}>{(t) => <div className="space-y-2 text-sm leading-relaxed text-smoke">{renderNote(t)}</div>}</TranslatedText></div>}
      {brief.hooks?.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Hook ideas')}</p>
          <ul className="space-y-2">
            {brief.hooks.map((h, i) => <li key={i} className="flex gap-2.5 rounded-xl bg-white px-3.5 py-2.5 text-sm font-medium text-ink shadow-sm"><Icon name="bulb" className="mt-0.5 h-4 w-4 shrink-0 text-brand" /><TLine text={h} /></li>)}
          </ul>
        </div>
      )}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {brief.target > 0 && <TargetBar label={unitLabel(brief.metric, brief.target, tr, BRIEF_METRICS)} value={mine} target={Number(brief.target)} />}
        {(places.length > 0 || brief.prize) && (
          <div className="rounded-xl bg-white px-3.5 py-3 text-sm text-ink shadow-sm">
            <p className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-gray-400"><Icon name="trophy" className="h-4 w-4 text-brand" />{tr('The prizes')}</p>
            {places.length > 0 && (
              <ul className="space-y-1">
                {places.slice(0, 5).map((p) => (
                  <li key={p.place} className="flex items-center justify-between gap-3"><span className="text-xs font-bold text-smoke">{ordinalFor(p.place)}</span><span className="font-semibold">{p.parts.join(' + ')}</span></li>
                ))}
              </ul>
            )}
            {brief.prize && <p className={cx('text-smoke', places.length > 0 && 'mt-2 border-t border-gray-100 pt-2')}><TLine text={brief.prize} /></p>}
          </div>
        )}
      </div>
      {standings && standings.length > 0 && (
        <div className="mt-4">
          <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1.5 text-xs font-bold text-brand hover:underline" aria-expanded={open}>
            <Icon name="chart" className="h-3.5 w-3.5" />{open ? tr('Hide standings') : tr('See standings')}{me ? ` · ${tr('you are #{n}', { n: me.rank })}` : ''}
          </button>
          {open && (
            <ol className="mt-3 space-y-1.5 animate-fade-up">
              {standings.slice(0, 10).map((r) => (
                <li key={`${r.rank}-${r.name}`} className={cx('flex items-center gap-3 rounded-xl px-3 py-2 text-sm', r.me ? 'bg-brand text-white' : 'bg-white')}>
                  <span className={cx('w-6 text-center text-xs font-bold tabular-nums', r.me ? 'text-white' : 'text-gray-400')}>{r.rank}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                  <span className="text-xs font-bold tabular-nums">{nf(r.value)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </article>
  )
}

// ------------------------------------------------------------------------------ market standings
/** Every market side by side. A VIP sees totals only; the team also sees the spend. */
export function MarketStandings() {
  const tr = useT()
  const { data, missing } = useOptionalRpc('vip_market_standings', {}, 'standings')
  const rows = useMemo(() => [...(data || [])].sort((a, b) => Number(b.views) - Number(a.views)), [data])
  if (missing) return null
  if (data === undefined) return <Skeleton className="h-40 w-full rounded-card" />
  if (rows.length === 0) return <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">{tr('No markets to compare yet.')}</p>
  const top = Math.max(1, ...rows.map((r) => Number(r.views)))
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => {
        const pct = Math.max(Number(r.views) > 0 ? 4 : 0, Math.round((Number(r.views) / top) * 100))
        const accent = safeAccent()
        const delta = Number(r.prev_views) > 0 ? Math.round(((Number(r.views) - Number(r.prev_views)) / Number(r.prev_views)) * 100) : null
        return (
          <li key={r.programme_id} className={cx('rounded-card border bg-white p-4 shadow-card animate-fade-up sm:p-5', r.mine ? 'border-brand/40' : 'border-gray-100')} style={{ animationDelay: `${i * 70}ms` }}>
            <div className="flex items-start gap-3">
              {/* THE MARKET'S FLAG, WITH ITS PLACE (1 Oct 2026). Ethan: "per-market ones ... Maybe show the flag." */}
              <span className="relative shrink-0">
                <FlagTile codes={r.country_codes} kind="chapter" size="h-10 w-10" glyph="text-[22px]" title={r.name} />
                <span className={cx('absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-extrabold ring-2 ring-white', i === 0 ? 'bg-brand text-white' : 'bg-ink text-white')}>{i + 1}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-ink">{r.name}{r.mine && <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-bold uppercase text-brand">{tr('Your market')}</span>}</p>
                {r.tagline && <p className="text-xs text-smoke">{r.tagline}</p>}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xl font-bold tabular-nums text-ink"><CountUp value={Number(r.views)} format={nf} /></p>
                <p className="text-[11px] text-smoke">{tr('views this month')}</p>
              </div>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full transition-[width] duration-1000 ease-out" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${accent}, color-mix(in srgb, ${accent} 65%, white))` }} /></div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
              <Fact label={tr('VIP creators')} value={nf(r.members)} />
              <Fact label={tr('Videos')} value={nf(r.videos)} />
              <Fact label={tr('Average per creator')} value={nf(r.avg_views)} />
              <Fact label={tr('Last month')} value={nf(r.prev_views)} hint={delta != null ? `${delta > 0 ? '+' : ''}${delta}%` : null} />
              {r.top_name && <Fact label={tr('Top creator')} value={`${r.top_name} · ${nf(r.top_views)}`} />}
              {r.spend != null && <Fact label={tr('Spend so far')} value={money(r.spend, r.currency, { cents: false })} hint={r.budget ? tr('of {a}', { a: money(r.budget, r.currency, { cents: false }) }) : null} />}
            </dl>
          </li>
        )
      })}
    </ul>
  )
}

function Fact({ label, value, hint }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="truncate font-semibold text-ink">{value}{hint ? <span className="ml-1.5 text-[11px] font-bold text-brand">{hint}</span> : null}</dd>
    </div>
  )
}

// ------------------------------------------------------------------------------ perks and trips
/** What there is to unlock, how far along the creator is, and a claim button. */
export function PerksPath() {
  const tr = useT()
  const { data, missing, reload } = useOptionalRpc('vip_my_perks', {}, 'perks')
  const [busy, setBusy] = useState(null)
  if (missing) return null
  if (data === undefined) return <Skeleton className="h-48 w-full rounded-card" />
  if (!data || data.length === 0) {
    return <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">{tr('Perks and trips are being set up. Your team will add them here, and you unlock them as you grow.')}</p>
  }
  const unlocked = data.filter((p) => p.earned)
  const next = data.filter((p) => !p.earned && p.metric !== 'manual')
    .sort((a, b) => (Number(b.value) / Math.max(1, Number(b.threshold))) - (Number(a.value) / Math.max(1, Number(a.threshold))))[0]

  async function claim(p) {
    setBusy(p.id)
    try { await vipRpc('vip_claim_perk', { p_perk: p.id }); toastSuccess(tr('Claimed. Your market lead will be in touch.')); reload() } catch (e) { notice(e.message) } finally { setBusy(null) }
  }

  return (
    <div className="space-y-5">
      {next && (
        <section className="rounded-card border border-gray-100 bg-white p-5 shadow-card animate-fade-up">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-gray-400"><Icon name="flag" className="h-3.5 w-3.5 text-brand" />{tr('Up next')}</p>
          <h3 className="mb-4 mt-1 text-lg font-bold text-ink"><TLine text={next.title} /></h3>
          <TargetBar label={unitLabel(next.metric, next.threshold, tr)} value={Number(next.value)} target={Number(next.threshold)} format={nf} />
        </section>
      )}
      <Reveal className="grid gap-4 sm:grid-cols-2" stagger={0.06}>
        {data.map((p) => {
          const kind = PERK_KINDS.find((k) => k.key === p.kind) || PERK_KINDS[0]
          const pct = p.metric === 'manual' ? 0 : Math.min(1, Number(p.value) / Math.max(1, Number(p.threshold)))
          return (
            <article key={p.id} className={cx('relative flex h-full flex-col overflow-hidden rounded-card border bg-white p-5 shadow-card', p.earned ? 'border-brand/30' : 'border-gray-100')}>
              {p.image_url && <img src={p.image_url} alt="" loading="lazy" className="-mx-5 -mt-5 mb-4 h-32 w-[calc(100%+2.5rem)] max-w-none object-cover" />}
              <div className="flex items-start gap-3">
                <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', p.earned ? 'bg-brand text-white' : 'bg-cloud text-smoke')}><Icon name={p.earned ? 'check' : kind.icon} className="h-5 w-5" strokeWidth={p.earned ? 2.6 : 1.8} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400">{tr(kind.label)}</p>
                  <h3 className="text-[15px] font-bold leading-snug text-ink"><TLine text={p.title} /></h3>
                </div>
              </div>
              {p.description && <p className="mt-2.5 text-sm leading-relaxed text-smoke"><TLine text={p.description} /></p>}
              <div className="mt-auto pt-4">
                {p.metric !== 'manual' && !p.earned && (
                  <>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-[width] duration-1000 ease-out" style={{ width: `${Math.max(pct > 0 ? 3 : 0, Math.round(pct * 100))}%` }} /></div>
                    <p className="mt-1.5 text-xs tabular-nums text-smoke"><span className="font-bold text-ink">{nf(p.value)}</span> / {unitLabel(p.metric, p.threshold, tr)}</p>
                  </>
                )}
                {p.earned && p.status === 'earned' && <button type="button" onClick={() => claim(p)} disabled={busy === p.id} className="btn-primary !py-2 text-sm">{busy === p.id ? <Spinner className="h-4 w-4" /> : <Icon name="sparkles" className="h-4 w-4" />}{tr('Claim it')}</button>}
                {p.earned && p.status === 'claimed' && <p className="flex items-center gap-1.5 text-xs font-bold text-amber-700"><Icon name="clock" className="h-3.5 w-3.5" />{tr('Claimed. The team is arranging it.')}</p>}
                {p.earned && p.status === 'delivered' && <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-600"><Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.6} />{tr('Delivered')}</p>}
                {p.earned && p.note && <p className="mt-2 text-xs text-smoke">{p.note}</p>}
              </div>
            </article>
          )
        })}
      </Reveal>
      {unlocked.length === 0 && <p className="text-center text-xs text-smoke">{tr('Nothing unlocked yet. Keep posting.')}</p>}
    </div>
  )
}

// ------------------------------------------------------------------------------ the content library
/** Hooks, and the guides: how to film a trip, what makes a hook, how to plan a month. */
export function VipLibrary({ programmeId }) {
  const tr = useT()
  const [guides, setGuides] = useState(null)
  const [cat, setCat] = useState('all')
  const [openId, setOpenId] = useState(null)
  useEffect(() => {
    let alive = true
    supabase.from('vip_guides').select('*').eq('active', true).order('sort').order('title')
      .then(({ data, error }) => { if (alive) setGuides(error ? [] : data || []) })
    return () => { alive = false }
  }, [programmeId])
  const cats = useMemo(() => [...new Set((guides || []).map((g) => g.category))], [guides])
  const shown = (guides || []).filter((g) => cat === 'all' || g.category === cat)
  const openGuide = (guides || []).find((g) => g.id === openId) || null
  return (
    <div className="space-y-6">
      {/* TWO BIG BUTTONS, SIDE BY SIDE, NO HEADLINE (1 Oct 2026). Ethan: "don't say 'Stuck on the first line.' I don't
          like that colour. Just have the 'Hook me up' and 'find a deal' button ... bigger ... side by side." */}
      <section className="grid gap-3 sm:grid-cols-2 animate-fade-up">
        <HookButton variant="big" />
        <DealFinder variant="big" />
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px] font-bold text-ink">{tr('Guides')}</h2>
          <Link to="/resources" className="text-xs font-semibold text-brand hover:underline">{tr('More in the content library')}</Link>
        </div>
        {cats.length > 1 && (
          <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label={tr('Guide topics')}>
            {['all', ...cats].map((c) => (
              <button key={c} type="button" role="tab" aria-selected={cat === c} onClick={() => setCat(c)} className={cx('rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200', cat === c ? 'bg-brand text-white' : 'bg-cloud text-smoke hoverable:hover:text-ink')}>{c === 'all' ? tr('All') : <TLine text={c} />}</button>
            ))}
          </div>
        )}
        {guides === null ? <Skeleton className="h-40 w-full rounded-card" /> : shown.length === 0
          ? <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">{tr('No guides yet.')}</p>
          : (
            <Reveal className="grid grid-cols-1 gap-5 lg:grid-cols-2" stagger={0.05}>
              {shown.map((g) => (
                <article key={g.id} className="group flex flex-col rounded-card border border-gray-100 bg-white p-6 shadow-card transition-all duration-300 hoverable:hover:-translate-y-1 hoverable:hover:shadow-lift">
                  <button type="button" onClick={() => setOpenId(g.id)} className="flex h-full flex-col text-left">
                    <span className="text-[10.5px] font-bold uppercase tracking-wide text-brand"><TLine text={g.category} /></span>
                    <h3 className="mt-1 text-lg font-semibold leading-snug text-ink"><TLine text={g.title} /></h3>
                    <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-smoke">{noteExcerpt(g.body || '', 200)}</p>
                    <span className="mt-auto flex items-center justify-between gap-3 border-t border-gray-50 pt-4 text-xs"><span className="text-gray-400">{formatDate(g.updated_at || g.created_at)}</span><span className="font-medium text-brand">{tr('Open →')}</span></span>
                  </button>
                </article>
              ))}
            </Reveal>
          )}
      </section>
      <Modal open={!!openGuide} onClose={() => setOpenId(null)} title={openGuide?.title || ''} wide>
        {openGuide && (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-brand"><TLine text={openGuide.category} /></p>
            <TranslatedText text={openGuide.body}>{(t) => <div className="space-y-2 text-[15px] leading-relaxed">{renderNote(t)}</div>}</TranslatedText>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ------------------------------------------------------------------------------ the VIP map
/** Every VIP creator on one map. Only people who chose to be on it.
 *
 * THE MAP IS ALWAYS THERE (1 Oct 2026). Ethan: "It says 'No VIPs in the map yet,' but the map should always be
 * showing." An empty map is still the map, with a line on it. And the creator's own "show me on the VIP map" switch
 * lives HERE now, under the map it is about (it was in the Stats tab), with what else decides whether they appear:
 * their town on their profile, and their profile's own map setting. */
export function VipMap({ hint = true, onSaved }) {
  const tr = useT()
  const { data, missing, reload } = useOptionalRpc('vip_map', {}, 'map')
  const { user, profile, isAdmin } = useAuth()
  const [me, setMe] = useState(undefined)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!user?.id) return undefined
    let alive = true
    supabase.from('vip_members').select('show_on_map').eq('profile_id', user.id).maybeSingle()
      .then(({ data: row }) => { if (alive) setMe(row || null) })
    return () => { alive = false }
  }, [user?.id])
  if (missing) return null
  const list = data || []
  const countries = new Set(list.map((c) => c.country).filter(Boolean)).size
  const hasTown = profile?.city_lat != null && profile?.city_lng != null
  const profileHidden = profile?.show_on_map === false

  async function toggle(on) {
    setBusy(true)
    try { await vipRpc('vip_set_on_map', { p_on: on }); setMe({ show_on_map: on }); reload(); onSaved?.() }
    catch (e) { notice(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-smoke">
        {data === undefined ? ' ' : list.length === 0
          ? tr('No VIPs on the map yet. Creators appear once they add their town to their profile.')
          : tr('{n} VIP creators in {c} countries.', { n: list.length, c: countries })}
      </p>
      <div className="relative overflow-hidden rounded-card border border-gray-100 shadow-card">
        {data === undefined
          ? <Skeleton className="h-[26rem] w-full" />
          : <CreatorMap creators={list} myId={user?.id} maxFitZoom={6} controls={false} navigable allowFullscreen />}
      </div>
      {hint && me && (
        <section className="flex flex-wrap items-center gap-3 rounded-card border border-gray-100 bg-white px-4 py-3.5 shadow-card">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand"><Icon name="pin" className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-ink">{tr('Show me on the VIP map')}</span>
            <span className="block text-xs text-smoke">
              {!hasTown ? <>{tr('Add your town to your profile to appear.')} <Link to="/profile/edit" className="font-semibold text-brand hover:underline">{tr('Add it')}</Link></>
                : profileHidden ? <>{tr('Your profile is hidden from maps.')} <Link to="/settings" className="font-semibold text-brand hover:underline">{tr('Change it')}</Link></>
                  : me.show_on_map !== false ? tr('Other VIPs can see where you are based.') : tr('You are hidden from this map.')}
            </span>
          </span>
          <button type="button" role="switch" aria-checked={me.show_on_map !== false} disabled={busy} onClick={() => toggle(me.show_on_map === false)}
            className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-60', me.show_on_map !== false ? 'bg-brand' : 'bg-gray-200')}>
            <span className={cx('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200', me.show_on_map !== false ? 'translate-x-[22px]' : 'translate-x-0.5')} />
          </button>
        </section>
      )}
      {isAdmin && !me && list.length === 0 && <p className="text-xs text-smoke">{tr('VIPs appear here once they have a town on their profile.')}</p>}
    </div>
  )
}

// ------------------------------------------------------------------------------ make it yours
/** A VIP's own headline, colour, personal goal and whether they are on the VIP map. */
export function VipMySettings({ overview, onSaved }) {
  const tr = useT()
  const { user } = useAuth()
  const [row, setRow] = useState(undefined)
  const [headline, setHeadline] = useState('')
  const [goal, setGoal] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('vip_members').select('headline, own_goal_views').eq('profile_id', user.id).maybeSingle()
    if (error || !data) { setRow(null); return }
    setRow(data)
    setHeadline(data.headline || ''); setGoal(data.own_goal_views ? String(data.own_goal_views) : '')
  }, [user.id])
  useEffect(() => { load() }, [load])
  if (row === undefined) return <Skeleton className="h-48 w-full rounded-card" />
  if (row === null) return null

  async function save() {
    setBusy(true)
    try {
      await vipRpc('vip_update_my_settings', { p_headline: headline, p_accent: null, p_goal: goal ? Number(String(goal).replace(/[^\d]/g, '')) : null, p_on_map: null })
      toastSuccess(tr('Saved'))
      onSaved?.()
    } catch (e) { notice(e.message) } finally { setBusy(false) }
  }
  const goalNum = Number(String(goal).replace(/[^\d]/g, '')) || 0
  return (
    <section className="rounded-card border border-gray-100 bg-white p-5 shadow-card animate-fade-up">
      <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="pencil" className="h-5 w-5 text-brand" />{tr('Make it yours')}</h2>
      <p className="mb-4 mt-0.5 text-sm text-smoke">{tr('Your headline and your own goal. Only you and the team can change them.')}</p>
      <div className="space-y-4">
        <label className="block"><span className="label">{tr('Headline')}</span><input className="input" maxLength={80} value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder={tr('For example: Budget city breaks from Madrid')} /></label>
        <label className="block"><span className="label">{tr('My own monthly view goal')}</span><input className="input" inputMode="numeric" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={tr('Optional, for example 250000')} /></label>
        {goalNum > 0 && <TargetBar label={tr('Views this month')} value={overview.stats.views} target={goalNum} />}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={busy} className="btn-primary !py-2.5 text-sm">{busy ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />}{tr('Save')}</button>
        </div>
      </div>
    </section>
  )
}
