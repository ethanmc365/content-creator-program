import { useEffect, useMemo, useState } from 'react'
import Icon from '../../../components/Icon'
import { cx } from '../../../lib/utils'
import { notice } from '../../../lib/confirm'
import { flagFromIso } from '../../../lib/flags'
import { useT } from '../../../lib/i18n'
import { challengeSlide, inlineImages, leadersSlide, marketsSlide, overviewSlide, svgToPng } from '../../../lib/meetingSlides'
import { teamApi } from '../../../api/team'
import { challengesApi } from '../../../api/challenges'
import { submissionsApi } from '../../../api/submissions'

// THE WEEKLY MEETING DECK (14 Oct 2026). Pick what goes in - the worldwide slides, any markets (two slides each: their
// numbers, then who gained most), and any running or recent challenges - and the deck is drawn here, previewed one
// slide at a time, and downloaded as PNGs (one file per slide, named in order) for Slides or the Meet. Every slide is
// built from `admin_views_gained` for the same dates and views as the page above, read once per market picked.
export default function MeetingDeck({ data, scope, market, marketName, allMarkets = [], from, to, title }) {
  const tr = useT()
  const [global, setGlobal] = useState(!market)
  const [picked, setPicked] = useState(() => new Set(market ? [market] : []))
  const [chPicked, setChPicked] = useState(() => new Set())
  const [challenges, setChallenges] = useState([])
  const [slides, setSlides] = useState(null)
  const [at, setAt] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => { setPicked(new Set(market ? [market] : [])); setGlobal(!market) }, [market])
  useEffect(() => {
    let alive = true
    challengesApi.challenges().select('id, title, status, start_date, end_date, scoring, community_id').in('status', ['active', 'completed', 'archived'])
      .order('start_date', { ascending: false }).limit(12)
      .then(({ data: c }) => { if (alive) setChallenges(c || []) })
    return () => { alive = false }
  }, [])
  // A different set of dates or views is a different deck.
  useEffect(() => { setSlides(null); setAt(0) }, [from, to, scope])

  const toggle = (set, setter, id) => setter(() => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const count = (global ? 3 : 0) + picked.size * 2 + chPicked.size

  async function build() {
    if (!count) return
    setBusy(true)
    try {
      const out = []
      const answers = []
      if (global) answers.push({ name: null, d: market ? (await teamApi.adminViewsGained({ p_from: from, p_to: to })).data : data })
      for (const id of picked) {
        const m = allMarkets.find((x) => x.id === id)
        const d = id === market ? data : (await teamApi.adminViewsGained({ p_from: from, p_to: to, p_market: id })).data
        if (d) answers.push({ name: m?.name || marketName, d })
      }
      const chosen = challenges.filter((c) => chPicked.has(c.id))
      const chData = await Promise.all(chosen.map(async (c) => {
        const [{ data: res }, { data: subs }] = await Promise.all([
          challengesApi.results().select('rank, final_views, creator_id, profiles:creator_id(name, photo_url)').eq('challenge_id', c.id).order('rank').limit(5),
          submissionsApi.submissions().select('creator_id, logged_views').eq('challenge_id', c.id),
        ])
        return { c, res: res || [], subs: subs || [] }
      }))
      const urls = [
        ...answers.flatMap((a) => [...(a.d?.top_creators || []).map((x) => x.photo_url), ...(a.d?.top_videos || []).map((x) => x.thumb)]),
        ...chData.flatMap((x) => x.res.map((r) => r.profiles?.photo_url)),
      ]
      const images = await inlineImages(urls.filter((u) => /supabase\.co\//.test(u || '')))
      for (const a of answers) {
        out.push({ label: a.name ? `${a.name}: numbers` : 'Worldwide: numbers', svg: overviewSlide(a.d, scope, title, a.name) })
        if (!a.name) out.push({ label: 'Markets side by side', svg: marketsSlide(a.d, scope, title) })
        out.push({ label: a.name ? `${a.name}: who gained most` : 'Worldwide: who gained most', svg: leadersSlide(a.d, scope, { title, marketName: a.name, images }) })
      }
      for (const { c, res, subs } of chData) {
        out.push({
          label: c.title,
          svg: challengeSlide(c, {
            title: c.status === 'active' ? 'Running now' : 'Finished',
            results: res.map((r) => ({ ...r, name: r.profiles?.name, photo_url: r.profiles?.photo_url })),
            entries: subs.length, creators: new Set(subs.map((x) => x.creator_id)).size,
            views: subs.reduce((n, x) => n + (Number(x.logged_views) || 0), 0), images,
          }),
        })
      }
      setSlides(out)
      setAt(0)
    } catch (e) {
      notice(`Could not build the slides: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function downloadAll() {
    for (let i = 0; i < slides.length; i++) {
      const blob = await svgToPng(slides[i].svg)
      if (!blob) continue
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${String(i + 1).padStart(2, '0')}-${slides[i].label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${from}.png`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 4000)
      await new Promise((r) => setTimeout(r, 350))
    }
  }
  async function downloadOne() {
    const blob = await svgToPng(slides[at].svg)
    if (!blob) { notice(tr('Could not make the picture.')); return }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${slides[at].label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${from}.png`
    document.body.appendChild(a); a.click(); a.remove()
  }

  const current = slides?.[at]
  const preview = useMemo(() => current?.svg.replace(/ width="1280" height="720"/, ' style="width:100%;height:auto;display:block"'), [current])
  const chip = (on) => cx('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200',
    on ? 'border-brand bg-brand text-white shadow-card' : 'border-gray-200 bg-white text-smoke hoverable:hover:border-brand hoverable:hover:text-brand')

  return (
    <section className="animate-rise overflow-hidden rounded-card border border-brand/25 bg-white shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-5">
        <div>
          <h3 className="flex items-center gap-2 text-[15px] font-bold text-ink"><Icon name="megaphone" className="h-4 w-4 text-brand" />{tr('Slides for the weekly meeting')}</h3>
          <p className="text-xs text-smoke">{tr('Pick what goes in. Each market gets two slides, so every manager can present their own.')}</p>
        </div>
        <button type="button" onClick={build} disabled={!count || busy} className="btn-primary !py-2 text-xs disabled:opacity-40">
          <Icon name={busy ? 'refresh' : 'sparkles'} className={cx('h-3.5 w-3.5', busy && 'animate-spin')} />
          {busy ? tr('Drawing…') : slides ? tr('Redraw {n} slides', { n: count }) : tr('Make {n} slides', { n: count })}
        </button>
      </div>
      <div className="space-y-3 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setGlobal((g) => !g)} aria-pressed={global} className={chip(global)}>
            <Icon name="globe" className="h-3.5 w-3.5" />{tr('Worldwide')}
          </button>
          {allMarkets.map((m) => (
            <button key={m.id} type="button" onClick={() => toggle(picked, setPicked, m.id)} aria-pressed={picked.has(m.id)} className={chip(picked.has(m.id))}>
              <span>{flagFromIso((m.country_codes || [])[0]) || ''}</span>{m.name}
            </button>
          ))}
        </div>
        {challenges.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-smoke">{tr('Challenges')}</span>
            {challenges.map((c) => (
              <button key={c.id} type="button" onClick={() => toggle(chPicked, setChPicked, c.id)} aria-pressed={chPicked.has(c.id)} className={chip(chPicked.has(c.id))}>
                {c.status === 'active' && <span className={cx('h-1.5 w-1.5 rounded-full', chPicked.has(c.id) ? 'bg-white' : 'bg-brand')} />}
                {c.title.length > 28 ? `${c.title.slice(0, 27)}…` : c.title}
              </button>
            ))}
          </div>
        )}
      </div>
      {slides && slides.length > 0 && (
        <div className="border-t border-gray-50 bg-cloud/40 p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setAt((i) => Math.max(0, i - 1))} disabled={at === 0} aria-label={tr('Previous slide')} className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-smoke disabled:opacity-30"><Icon name="chevronLeft" className="h-4 w-4" /></button>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{at + 1} / {slides.length} · {current.label}</span>
            <button type="button" onClick={() => setAt((i) => Math.min(slides.length - 1, i + 1))} disabled={at === slides.length - 1} aria-label={tr('Next slide')} className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-smoke disabled:opacity-30"><Icon name="chevronRight" className="h-4 w-4" /></button>
            <button type="button" onClick={downloadOne} className="btn-secondary !py-2 text-xs"><Icon name="download" className="h-3.5 w-3.5" />{tr('This slide')}</button>
            <button type="button" onClick={downloadAll} className="btn-primary !py-2 text-xs"><Icon name="download" className="h-3.5 w-3.5" />{tr('All {n} slides (PNG)', { n: slides.length })}</button>
          </div>
          <div key={at} className="overflow-hidden rounded-2xl border border-gray-100 shadow-sm animate-tab-in" dangerouslySetInnerHTML={{ __html: preview }} />
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {slides.map((sl, i) => (
              <button key={i} type="button" onClick={() => setAt(i)} aria-label={sl.label}
                className={cx('w-28 shrink-0 overflow-hidden rounded-lg border-2 transition-all', i === at ? 'border-brand' : 'border-transparent opacity-70 hover:opacity-100')}
                dangerouslySetInnerHTML={{ __html: sl.svg.replace(/ width="1280" height="720"/, ' style="width:100%;height:auto;display:block"') }} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
