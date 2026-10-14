import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts'
import { format, startOfWeek } from 'date-fns'
import { Avatar, Skeleton } from '../../../components/ui'
import Icon from '../../../components/Icon'
import ChartPanel from '../../../components/charts/ChartPanel'
import { FILL, gridProps, xAxisProps, yAxisProps, stackShape, tooltipStyle } from '../../../components/charts/chartTheme'
import { cx, timeAgo, downloadCsv } from '../../../lib/utils'
import { flagFromIso } from '../../../lib/flags'
import { confirm, notice } from '../../../lib/confirm'
import { toastSuccess } from '../../../lib/toast'
import { allRows } from '../../../lib/fetchAll'
import { profilesApi } from '../../../api/profiles'
import { teamApi } from '../../../api/team'
import { inRange, change } from '../../../lib/analyticsPeriod'

// RECRUITMENT (14 Oct 2026). Built for Lorenzo, who joined to grow the community: "where the creators are signing up
// from, what languages they speak, and, for the creators dropping off, where they're dropping off and anyone to follow
// up with." One page that answers those in order, each list exportable, each person one press from a message.
//
// The applicants are read here (pending people belong to no market yet, so the page's market-scoped data does not hold
// them); a market narrows to applicants whose country it covers.
const DAY = 86400000
const bySignup = (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)

// The step somebody stopped on, worked out from what the onboarding autosave has written so far (same order as the form).
function stageOf(p) {
  if (p.status === 'active') return 'approved'
  if (p.onboarded) return 'submitted'
  if (!p.name?.trim() || !p.photo_url) return 'identity'
  // profiles.dob is always empty (it lives in creator_private); `age` is derived from it, so read that.
  if (!p.country_code || !p.city?.trim() || p.age == null) return 'based'
  if (![p.instagram_url, p.tiktok_url, p.youtube_url, p.facebook_url].some((u) => u?.trim())) return 'socials'
  if (!p.bio?.trim() || !p.about?.trim()) return 'story'
  if (!(p.languages || []).length) return 'languages'
  if (!(p.countries_visited || []).length) return 'map'
  return 'review'
}
const STAGES = [
  ['identity', 'Name and photo'], ['based', 'Where they live'], ['socials', 'Their channels'], ['story', 'Their story'],
  ['languages', 'Languages'], ['map', 'Travel map'], ['review', 'Final review'],
]
const SOURCE_LABEL = {
  referral: 'Creator referral', vip: 'VIP sign-up link', team: 'Team invite', instagram: 'Instagram', tiktok: 'TikTok',
  facebook: 'Facebook', youtube: 'YouTube', linkedin: 'LinkedIn', google: 'Google', whatsapp: 'WhatsApp', x: 'X',
  direct: 'Direct / typed in', 'tryp.com': 'Tryp.com', untracked: 'Before tracking (14 Oct)',
}
function sourceOf(p) {
  if (p.referred_by) return 'referral'
  if (p.team_invite_id || p.team_application) return 'team'
  if (p.is_vip) return 'vip'
  return p.signup_source?.source || 'untracked'
}

export default function Recruitment({ raw, market, markets, scopeLabel, range }) {
  const [people, setPeople] = useState(null)
  const [emails, setEmails] = useState({})
  const [list, setList] = useState('unfinished')
  // GENERAL COMMUNITY OR VIP (15 Oct 2026): Lorenzo recruits for both, and they are different funnels.
  const [aud, setAud] = useState('all')
  const [progress, setProgress] = useState(null)
  const [now] = useState(() => Date.now())

  useEffect(() => {
    let alive = true
    Promise.all([
      allRows(() => profilesApi.profiles().select('id, name, photo_url, created_at, accepted_at, submitted_at, status, onboarded, is_admin, is_test, deletion_requested_at, country_code, country, city, age, languages, countries_visited, instagram_url, tiktok_url, youtube_url, facebook_url, bio, about, referred_by, team_invite_id, team_application, is_vip, followed_up_at, signup_source, onboarding_call_opened_at, onboarding_call_booked_at, last_seen_at')),
      teamApi.adminListEmails(),
      allRows(() => profilesApi.onboardingProgress().select('id, profile_id, person, step, signed_up, country_code').order('id')),
    ]).then(([rows, { data: em }, prog]) => {
      if (!alive) return
      setProgress(prog || [])
      setPeople((rows || []).filter((p) => !p.is_admin && !p.is_test && !p.deletion_requested_at))
      setEmails(Object.fromEntries((em || []).map((r) => [r.id, r.email])))
    })
    return () => { alive = false }
  }, [])

  const codes = useMemo(() => new Set(market ? (markets.find((m) => m.id === market)?.country_codes || []) : []), [market, markets])
  const posted = useMemo(() => new Set((raw?.submissions || []).map((s) => s.creator_id)), [raw])

  const d = useMemo(() => {
    if (!people) return null
    const all = people.filter((p) => (!market || codes.has(String(p.country_code || '').toUpperCase()))
      && (aud === 'all' || (aud === 'vip') === !!p.is_vip))
    // The window: the page's period, or the last 30 days against the 30 before.
    const win = range || { start: new Date(now - 30 * DAY), end: new Date(now), prev: { start: new Date(now - 60 * DAY), end: new Date(now - 30 * DAY) }, label: 'Last 30 days', short: 'the 30 days before' }
    const inWin = all.filter((p) => inRange(p.created_at, win))
    const inPrev = win.prev ? all.filter((p) => inRange(p.created_at, win.prev)) : []
    const approvedIn = (xs) => xs.filter((p) => p.status === 'active').length
    const finishedIn = (xs) => xs.filter((p) => p.onboarded).length
    const waits = all.filter((p) => p.status === 'active' && p.accepted_at && (p.submitted_at || p.created_at))
      .map((p) => (Date.parse(p.accepted_at) - Date.parse(p.submitted_at || p.created_at)) / DAY).filter((x) => x >= 0).sort((a, b) => a - b)
    const median = waits.length ? waits[Math.floor(waits.length / 2)] : null

    // Sign-ups per week, by where they are now.
    const weeks = new Map()
    for (const p of all) {
      const k = format(startOfWeek(new Date(p.created_at), { weekStartsOn: 1 }), 'yyyy-MM-dd')
      const w = weeks.get(k) || { key: k, week: format(new Date(`${k}T12:00:00`), 'd MMM yy'), approved: 0, waiting: 0, unfinished: 0 }
      if (p.status === 'active') w.approved++
      else if (p.onboarded) w.waiting++
      else w.unfinished++
      weeks.set(k, w)
    }
    const weekly = [...weeks.values()].sort((a, b) => a.key.localeCompare(b.key))

    const cohort = range ? inWin : all
    const count = (xs, key) => {
      const m = new Map()
      for (const p of xs) for (const k of [].concat(key(p)).filter(Boolean)) m.set(k, (m.get(k) || 0) + 1)
      return [...m.entries()].sort((a, b) => b[1] - a[1])
    }
    const countries = count(cohort, (p) => (p.country_code ? String(p.country_code).toUpperCase() : null))
    const languages = count(cohort, (p) => p.languages || [])
    const sources = count(cohort, sourceOf)
    const stuck = all.filter((p) => !p.onboarded && p.status !== 'active')
    // WHERE PEOPLE STOP, EVER (migration 423): every step anybody reached, kept after they finish or are deleted. A
    // person "stopped" at the last step they reached unless they reached the next. Deleted accounts count in Worldwide
    // and by their country; the VIP split only knows the people still here.
    const ids = new Set(all.map((p) => p.id))
    const prog = (progress || []).filter((r) => (r.profile_id ? ids.has(r.profile_id)
      : aud === 'all' && (!market || codes.has(String(r.country_code || '').toUpperCase()))))
    const furthest = new Map()
    for (const r of prog) { const k = r.profile_id || r.person || `gone-${r.id}`; furthest.set(k, Math.max(furthest.get(k) || 0, r.step)) }
    for (const p of stuck) if (!furthest.has(p.id)) furthest.set(p.id, 0)
    const stoppedAt = (i) => [...furthest.values()].filter((v) => v === i).length
    const everStarted = furthest.size
    const dropoff = STAGES.map(([k, label], i) => ({ key: k, label, n: stoppedAt(i), now: stuck.filter((p) => stageOf(p) === k).length }))
    const callMarket = all.some((p) => p.onboarding_call_opened_at || p.onboarding_call_booked_at)

    const funnel = [
      { label: 'Signed up', n: cohort.length },
      { label: 'Finished the application', n: finishedIn(cohort) },
      ...(callMarket ? [{ label: 'Booked the onboarding call', n: cohort.filter((p) => p.onboarding_call_booked_at).length }] : []),
      { label: 'Approved', n: approvedIn(cohort) },
      { label: 'Posted a first video', n: cohort.filter((p) => p.status === 'active' && posted.has(p.id)).length },
    ]

    const lists = {
      // EVERY LIST IN SIGN-UP ORDER, NEWEST FIRST (15 Oct 2026: "I'm not sure what order this is in"), and each row says the date.
      unfinished: stuck.filter((p) => now - Date.parse(p.created_at) > DAY).sort(bySignup),
      waiting: all.filter((p) => p.status === 'pending' && p.onboarded).sort(bySignup),
      silent: all.filter((p) => p.status === 'active' && !p.is_vip && !posted.has(p.id) && p.accepted_at && now - Date.parse(p.accepted_at) > 7 * DAY).sort(bySignup),
    }
    return {
      win, weekly, funnel, countries, languages, sources, dropoff, lists, median, everStarted,
      kpis: {
        signups: [inWin.length, inPrev.length],
        finished: [finishedIn(inWin), finishedIn(inPrev)],
        approved: [approvedIn(inWin), approvedIn(inPrev)],
        rate: inWin.length ? Math.round((approvedIn(inWin) / inWin.length) * 100) : null,
      },
    }
  }, [people, market, codes, range, now, posted, aud, progress])

  if (!d) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        <Skeleton className="h-80" />
      </div>
    )
  }

  const kpi = (label, [a, b], hint) => ({ label, a, b, hint })
  const tiles = [
    kpi('Sign-ups', d.kpis.signups),
    kpi('Finished applications', d.kpis.finished),
    kpi('Approved', d.kpis.approved, d.kpis.rate != null ? `${d.kpis.rate}% of sign-ups` : null),
    { label: 'Waiting on a decision', a: d.lists.waiting.length, b: null, hint: d.median != null ? `typical wait ${d.median < 1 ? 'under a day' : `${Math.round(d.median)} days`}` : null },
  ]
  const pulseKeys = ['approved', 'waiting', 'unfinished']
  const LISTS = [
    ['unfinished', 'Never finished', d.lists.unfinished.length],
    ['waiting', 'Waiting on review', d.lists.waiting.length],
    ['silent', 'In, no first video yet', d.lists.silent.length],
  ]
  const rows = d.lists[list]

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-0.5 rounded-full bg-cloud p-1">
          {[['all', 'Everybody', 'users'], ['community', 'General community', 'users'], ['vip', 'VIP', 'star']].map(([k, label, icon]) => (
            <button key={k} type="button" onClick={() => setAud(k)} aria-pressed={aud === k}
              className={cx('inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200', aud === k ? 'bg-brand text-white shadow-card' : 'text-smoke hover:text-ink')}>
              <Icon name={icon} className="h-3.5 w-3.5" />{label}
            </button>
          ))}
        </div>
        <span className="text-xs text-smoke">{aud === 'vip' ? 'People who signed up with the VIP link' : aud === 'community' ? 'Everybody except VIP sign-ups' : 'General community and VIP sign-ups together'}</span>
      </div>
      <div key={aud} className="animate-tab-in">
        <p className="mb-3 flex flex-wrap items-baseline gap-x-2 text-sm text-smoke">
          <span className="text-base font-semibold text-ink">{d.win.label}</span>
          <span>{scopeLabel}</span>
          {d.win.prev && <span className="text-xs text-gray-400">compared with {d.win.short}</span>}
        </p>
        <div className="grid auto-rows-fr grid-cols-2 gap-4 lg:grid-cols-4">
          {tiles.map((t, i) => {
            const pct = t.b == null ? null : change(t.a, t.b)
            return (
              <div key={t.label} className="card flex flex-col animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
                <p className="text-sm font-medium text-smoke">{t.label}</p>
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">{t.a}</p>
                {pct != null && (
                  <p className="mt-1 text-[11px] text-smoke">
                    <span className={cx('font-bold', pct > 0 ? 'text-emerald-600' : pct < 0 ? 'text-red-500' : 'text-smoke')}>{pct === 0 ? '=' : pct > 0 ? `↑${pct}%` : `↓${Math.abs(pct)}%`}</span> vs {t.b}
                  </p>
                )}
                {t.hint && <p className="mt-auto pt-1 text-xs text-smoke">{t.hint}</p>}
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <ChartPanel
          title="Sign-ups each week"
          subtitle="Coloured by where each person is now"
          data={d.weekly} recent={16} minPoint={34} delay={80}
          csv={{ name: 'signups-by-week.csv' }}
          render={(rows2) => (
            <BarChart data={rows2} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="week" {...xAxisProps} />
              <YAxis {...yAxisProps} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={false} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Bar dataKey="approved" name="Approved" stackId="s" fill={FILL.brand} maxBarSize={32} shape={stackShape(pulseKeys, 'approved')} />
              <Bar dataKey="waiting" name="Waiting on review" stackId="s" fill={FILL.light} maxBarSize={32} shape={stackShape(pulseKeys, 'waiting')} />
              <Bar dataKey="unfinished" name="Never finished" stackId="s" fill={FILL.rest} maxBarSize={32} shape={stackShape(pulseKeys, 'unfinished')} />
            </BarChart>
          )}
        />
        <section className="card animate-rise" style={{ animationDelay: '120ms' }}>
          <h2 className="font-semibold">From sign-up to first video</h2>
          <p className="mb-5 mt-1 text-xs text-smoke">{range ? 'Everybody who signed up in this period, and how far they got' : 'Everybody who has signed up, and how far they got'}</p>
          <div className="space-y-3">
            {d.funnel.map((s, i) => {
              const top = d.funnel[0].n || 1
              const prev = i ? d.funnel[i - 1].n : null
              return (
                <div key={s.label}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">{s.label}</span>
                    <span className="tabular-nums"><span className="font-semibold">{s.n}</span>{prev ? <span className="ml-2 text-xs text-smoke">{Math.round((s.n / prev) * 100)}%</span> : null}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-cloud">
                    <div className="h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${Math.max(2, (s.n / top) * 100)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <BarList title="Where they live" sub="Country on the application" rows={d.countries.map(([k, n]) => ({ k, label: `${flagFromIso(k) || ''} ${new Intl.DisplayNames(['en'], { type: 'region' }).of(k) || k}`, n }))} csv="signups-by-country.csv" delay={160} />
        <BarList title="Languages they speak" sub="Every language on the application" rows={d.languages.map(([k, n]) => ({ k, label: k, n }))} csv="signups-by-language.csv" delay={200} />
        <BarList title="Where they found us" sub="First page they landed on; tracked from 14 Oct" rows={d.sources.map(([k, n]) => ({ k, label: SOURCE_LABEL[k] || k, n }))} csv="signups-by-source.csv" delay={240}
          foot="Add ?utm_source=name to any link you share and it shows here by name." />
      </div>

      <section className="card animate-rise" style={{ animationDelay: '280ms' }}>
        <h2 className="font-semibold">Where people stop</h2>
        <p className="mb-5 mt-1 text-xs text-smoke">The last step reached by everybody who never finished, since tracking began: {d.dropoff.reduce((n, x) => n + x.n, 0)} of {d.everStarted} people who started. The small number is how many are on that step right now.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {d.dropoff.map((x, i) => {
            const max = Math.max(1, ...d.dropoff.map((y) => y.n))
            return (
              <div key={x.key} className="flex flex-col items-center rounded-2xl bg-cloud/60 px-2 py-3 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Step {i + 2}</span>
                <div className="my-2 flex h-20 w-8 items-end overflow-hidden rounded-lg bg-white">
                  <div className="w-full rounded-lg bg-brand transition-[height] duration-700" style={{ height: `${(x.n / max) * 100}%` }} />
                </div>
                <span className="text-xl font-bold tabular-nums">{x.n}</span>
                <span className="text-[11px] leading-tight text-smoke">{x.label}</span>
                {x.now > 0 && <span className="mt-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-brand">{x.now} now</span>}
              </div>
            )
          })}
        </div>
      </section>

      <section className="card animate-rise" style={{ animationDelay: '320ms' }}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Follow up</h2>
            <p className="mt-1 text-xs text-smoke">Newest sign-ups first. Copy the email, message them, tick them off, or delete an old application.</p>
          </div>
          <button type="button" onClick={() => downloadCsv(`follow-up-${list}.csv`, rows.map((p) => ({ name: p.name, email: emails[p.id] || '', country: p.country || p.country_code || '', signed_up: p.created_at?.slice(0, 10), stage: STAGES.find(([k]) => k === stageOf(p))?.[1] || stageOf(p), followed_up: p.followed_up_at ? 'yes' : '' })))}
            className="btn-secondary !px-3 !py-2 text-xs"><Icon name="download" className="h-4 w-4" /> CSV</button>
        </div>
        <div className="mb-4 flex gap-1 overflow-x-auto rounded-full bg-cloud p-1 scrollbar-none">
          {LISTS.map(([k, label, n]) => (
            <button key={k} type="button" onClick={() => setList(k)} aria-pressed={list === k}
              className={cx('flex-1 whitespace-nowrap rounded-full px-3 py-2 text-[13px] font-semibold transition-colors', list === k ? 'bg-white text-ink shadow-card' : 'text-smoke hover:text-ink')}>
              {label} <span className={cx('ml-1 tabular-nums', list === k ? 'text-brand' : 'text-gray-400')}>{n}</span>
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <p className="rounded-xl bg-cloud/50 px-4 py-8 text-center text-sm text-smoke">Nobody here. Nice.</p>
        ) : (
          <ul key={list} className="divide-y divide-gray-50 animate-tab-in">
            {rows.slice(0, 60).map((p) => (
              <FollowRow key={p.id} p={p} email={emails[p.id]} list={list}
                onFollowed={(at) => setPeople((cur) => cur.map((x) => (x.id === p.id ? { ...x, followed_up_at: at } : x)))}
                onDeleted={() => setPeople((cur) => cur.filter((x) => x.id !== p.id))} />
            ))}
          </ul>
        )}
        {rows.length > 60 && <p className="mt-3 text-center text-xs text-smoke">Showing 60 of {rows.length}. The CSV has everybody.</p>}
      </section>
    </div>
  )
}

function BarList({ title, sub, rows, csv, foot, delay }) {
  const [all, setAll] = useState(false)
  const ref = useRef(null)
  // SHOW FEWER BRINGS YOU BACK (15 Oct 2026): collapsing a long list left the page scrolled to where its end had been,
  // far below the card. Back to the card's top, if it is above the screen now.
  const toggleAll = () => {
    const closing = all
    setAll(!all)
    if (closing) setTimeout(() => { const r = ref.current?.getBoundingClientRect(); if (r && r.top < 0) ref.current.scrollIntoView({ block: 'start', behavior: 'instant' }) }, 0)
  }
  const max = Math.max(1, ...rows.map((r) => r.n))
  const shown = all ? rows : rows.slice(0, 8)
  return (
    <section ref={ref} className="card flex scroll-mt-24 flex-col animate-rise" style={{ animationDelay: `${delay}ms` }}>
      <div className="mb-4 flex items-start justify-between gap-2">
        <div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-xs text-smoke">{sub}</p></div>
        {rows.length > 0 && (
          <button type="button" onClick={() => downloadCsv(csv, rows.map((r) => ({ name: r.label.trim(), signups: r.n })))} title="Download CSV" className="rounded-lg p-1.5 text-gray-400 hover:bg-cloud hover:text-brand">
            <Icon name="download" className="h-4 w-4" />
          </button>
        )}
      </div>
      {rows.length === 0 ? <p className="text-sm text-smoke">Nothing yet.</p> : (
        <ul className="space-y-2.5">
          {shown.map((r) => (
            <li key={r.k}>
              <div className="mb-1 flex justify-between gap-2 text-sm"><span className="truncate">{r.label}</span><span className="font-semibold tabular-nums">{r.n}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-cloud"><div className="h-full rounded-full bg-brand" style={{ width: `${(r.n / max) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 8 && <button type="button" onClick={toggleAll} className="mt-3 self-start text-xs font-semibold text-brand hover:underline">{all ? 'Show fewer' : `Show all ${rows.length}`}</button>}
      {foot && <p className="mt-auto pt-3 text-[11px] text-gray-400">{foot}</p>}
    </section>
  )
}

function FollowRow({ p, email, list, onFollowed, onDeleted }) {
  const [busy, setBusy] = useState(false)
  const stage = STAGES.find(([k]) => k === stageOf(p))?.[1]
  async function toggle() {
    const next = p.followed_up_at ? null : new Date().toISOString()
    setBusy(true)
    const { error } = await profilesApi.profiles().update({ followed_up_at: next }).eq('id', p.id)
    setBusy(false)
    if (error) { await notice(`Could not save: ${error.message}`); return }
    onFollowed(next)
  }
  async function remove() {
    const who = p.name?.trim() || 'this application'
    if (!await confirm(`Delete ${who}? This permanently removes the account and cannot be undone.`)) return
    setBusy(true)
    const { error } = await teamApi.adminDeclineApplication({ target: p.id })
    setBusy(false)
    if (error) { await notice(`Could not delete: ${error.message}`); return }
    toastSuccess(`${who} deleted.`)
    onDeleted()
  }
  const signed = new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const when = list === 'silent' ? `signed up ${signed} · in ${timeAgo(p.accepted_at)}` : list === 'waiting' ? `signed up ${signed} · applied ${timeAgo(p.submitted_at || p.created_at)}` : `signed up ${signed}`
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <Avatar src={p.photo_url} name={p.name || '?'} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {p.name || 'No name yet'} {p.country_code && <span className="ml-1">{flagFromIso(p.country_code)}</span>}
        </p>
        <p className="truncate text-xs text-smoke">
          {when}{list === 'unfinished' && stage ? ` · stopped at ${stage}` : ''}{p.last_seen_at ? ` · last seen ${timeAgo(p.last_seen_at)}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {email && (
          <button type="button" onClick={() => navigator.clipboard?.writeText(email)} title={email}
            className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-smoke transition-colors hover:border-brand hover:text-brand">
            <Icon name="copy" className="mr-1 inline h-3.5 w-3.5" />Email
          </button>
        )}
        {list !== 'unfinished' && (
          <Link to={`/messages?to=${p.id}`} className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-smoke transition-colors hover:border-brand hover:text-brand">
            <Icon name="chat" className="mr-1 inline h-3.5 w-3.5" />Message
          </Link>
        )}
        {list === 'waiting' && (
          <Link to="/admin/applications" className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white">Review</Link>
        )}
        <button type="button" onClick={toggle} disabled={busy} aria-pressed={!!p.followed_up_at}
          className={cx('rounded-full px-3 py-1.5 text-xs font-semibold transition-colors', p.followed_up_at ? 'bg-brand text-white' : 'border border-gray-200 text-smoke hover:border-brand hover:text-brand')}>
          <Icon name="check" className="mr-1 inline h-3.5 w-3.5" />{list === 'silent' ? (p.followed_up_at ? 'Nudged' : 'Mark nudged') : (p.followed_up_at ? 'Followed up' : 'Mark followed up')}
        </button>
        {list !== 'silent' && (
          <button type="button" onClick={remove} disabled={busy} aria-label="Delete this application" title="Delete this application"
            className="rounded-full p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500">
            <Icon name="trash" className="h-4 w-4" />
          </button>
        )}
      </div>
    </li>
  )
}
