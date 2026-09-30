import { Card, Eyebrow, Facts, Hero, Line, TrypMark, formatViews, wholeMoney } from './cards'
import Icon from '../Icon'
import SocialMark from '../SocialMark'
import { getLocale, useT } from '../../lib/i18n'

// THE VIP MONTH RECAP: THE CARDS (30 Sep 2026).
//
// Ethan: "For the recap card, obviously they should have their own one of that, but it'll be a bit different."
//
// A VIP is paid by views, not by winning challenges, so this recap tells the story of a MONTH of views: what came in,
// what it was worth, where they stand among the VIPs, the video that carried it, and what is next. It is the same
// runner as the Year in Review and the challenge recap (YearInReview with `build` and `Share`); every card is dropped
// when it has nothing true to say.

const nf = (n) => Number(n || 0).toLocaleString(getLocale() === 'en' ? 'en-GB' : getLocale())
const SOCIAL = { Instagram: 'instagram', TikTok: 'tiktok', YouTube: 'youtube', Facebook: 'facebook' }

function monthName(m) {
  try { return new Date(Date.UTC(m.year, m.month - 1, 1)).toLocaleDateString(getLocale() === 'en' ? 'en-GB' : getLocale(), { month: 'long', timeZone: 'UTC' }) } catch { return String(m.month) }
}

// "5 more videos to unlock ..." in the unit the perk counts.
function nextLine(next, tr) {
  const n = nf(Math.max(0, next.threshold - next.value))
  const t = next.title
  if (next.metric === 'lifetime_videos') return tr('{n} more videos to unlock "{t}".', { n, t })
  if (next.metric === 'months_active' || next.metric === 'streak_months') return tr('{n} more months to unlock "{t}".', { n, t })
  return tr('{n} more views to unlock "{t}".', { n, t })
}

const fallbackTr = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m))

export function buildVipCards(data, tr = fallbackTr) {
  const { me, recap: r } = data
  const cards = []
  const push = (c) => { if (c) cards.push(c) }
  const first = (me?.name || 'there').split(' ')[0]
  const month = monthName(r.month)
  const closed = r.month.status === 'closed'

  push({
    key: 'open', palette: 'ember', hold: 4200,
    render: () => (
      <>
        <Eyebrow palette="ember">{tr('VIP recap')}</Eyebrow>
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-5 py-4">
          <div className="flex items-center gap-3">
            {me?.photo
              ? <img data-anim="pop" src={me.photo} alt="" crossOrigin="anonymous" className="h-16 w-16 rounded-full object-cover ring-4 ring-white/50 shadow-2xl" />
              : <span data-anim="pop" className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 text-3xl font-extrabold ring-4 ring-white/50">{(me?.name || '?').slice(0, 1)}</span>}
            <p data-anim="rise" className="text-lg font-bold leading-tight">{closed ? tr('Here is your month,') : tr('Your month so far,')}<br />{first}.</p>
          </div>
          <p data-anim="spot" className="break-words text-[clamp(38px,11vw,52px)] font-extrabold leading-[1.0] tracking-tight">{month}</p>
          <div data-anim="rise" className="flex flex-wrap gap-2">
            <span className="rounded-full px-3 py-1.5 text-xs font-bold" style={{ background: 'rgba(255,255,255,0.18)' }}>{r.programme}</span>
            {r.headline && <span className="rounded-full px-3 py-1.5 text-xs font-bold" style={{ background: 'rgba(255,255,255,0.18)' }}>{r.headline}</span>}
          </div>
          <Line palette="ember">{tr('Tap through to see how it went.')}</Line>
        </div>
      </>
    ),
  })

  if (r.views > 0) {
    push({
      key: 'views', palette: 'dusk', hold: 5000,
      render: () => (
        <>
          <Eyebrow palette="dusk">{tr('Views you brought in')}</Eyebrow>
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-5">
            <Hero value={nf(r.views)} unit={tr('views')} palette="dusk" />
            <Facts palette="dusk" items={[
              { label: tr('Videos'), value: nf(r.videos) },
              r.videos > 0 && { label: tr('Per video'), value: formatViews(Math.round(r.views / Math.max(1, r.videos))) },
            ]} />
            <Line palette="dusk">{tr('Views your videos gained in {m}.', { m: month })}</Line>
          </div>
        </>
      ),
    })
  }

  if (r.total > 0) {
    push({
      key: 'earned', palette: 'mint', hold: 4800,
      render: () => (
        <>
          <Eyebrow palette="mint">{closed ? tr('What you earned') : tr('What you have earned so far')}</Eyebrow>
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-4">
            <Hero value={wholeMoney(r.total, r.currency)} palette="mint" />
            {r.bonuses?.length > 0 && (
              <div data-anim="rise" className="flex flex-wrap gap-1.5">
                {r.bonuses.slice(0, 5).map((b, n) => (
                  <span key={n} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold"><Icon name={b.reward === 'voucher' ? 'ticket' : 'cash'} className="h-3.5 w-3.5" />{b.label || tr('Bonus')}</span>
                ))}
              </div>
            )}
            <Line palette="mint">{r.statement_status === 'approved' ? tr('It is on your payouts page.') : tr('Your statement appears once the team has checked it.')}</Line>
          </div>
        </>
      ),
    })
  }

  if (r.rank && r.of > 1) {
    push({
      key: 'rank', palette: 'sky', hold: 4800,
      render: () => (
        <>
          <Eyebrow palette="sky">{tr('Where you stand')}</Eyebrow>
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-5">
            <Hero value={`#${r.rank}`} unit={tr('of {n} in your market', { n: r.of })} palette="sky" />
            {r.global_rank && r.global_of > r.of && (
              <span data-anim="pop" className="inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-xs font-bold" style={{ background: 'rgba(255,255,255,0.18)' }}>
                <Icon name="globe" className="h-3.5 w-3.5" />{tr('#{r} of {n} VIPs everywhere', { r: r.global_rank, n: r.global_of })}
              </span>
            )}
            <Line palette="sky">{tr('Ranked by views counted in {m}.', { m: month })}</Line>
          </div>
        </>
      ),
    })
  }

  if (r.best) {
    push({
      key: 'best', palette: 'night', hold: 5200,
      render: () => (
        <>
          <Eyebrow palette="night">{tr('The video that carried it')}</Eyebrow>
          <div className="flex min-h-0 flex-1 items-center gap-5">
            <div data-anim="zoom" className="relative aspect-[9/16] w-[42%] shrink-0 overflow-hidden rounded-[20px] shadow-2xl ring-2 ring-white/30">
              {r.best.thumb ? <img src={r.best.thumb} alt="" crossOrigin="anonymous" className="absolute inset-0 h-full w-full object-cover" /> : <span className="absolute inset-0 flex items-center justify-center bg-white/10"><Icon name="video" className="h-8 w-8 opacity-70" /></span>}
              {SOCIAL[r.best.platform] && <span className="absolute right-2 top-2 block h-4 w-4 overflow-hidden rounded-md shadow"><SocialMark brand={SOCIAL[r.best.platform]} tile className="h-full w-full" /></span>}
            </div>
            <div className="min-w-0 space-y-3">
              <Hero value={formatViews(r.best.views)} unit={tr('views')} palette="night" />
              {r.best.caption && <Line palette="night" className="line-clamp-3 break-words">{r.best.caption}</Line>}
            </div>
          </div>
        </>
      ),
    })
  }

  if (r.platforms?.length > 1) {
    const max = Math.max(1, ...r.platforms.map((p) => Number(p.views)))
    push({
      key: 'platforms', palette: 'sand', hold: 4600,
      render: () => (
        <>
          <Eyebrow palette="sand">{tr('Where they watched')}</Eyebrow>
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-4">
            {r.platforms.map((p) => (
              <div key={p.platform} data-anim="rise">
                <div className="mb-1 flex items-baseline justify-between gap-3"><span className="text-base font-extrabold">{p.platform}</span><span className="text-sm font-bold tabular-nums">{formatViews(Number(p.views))}</span></div>
                <div className="h-3 overflow-hidden rounded-full" style={{ background: 'rgba(217,68,7,0.14)' }}><div className="h-full rounded-full" style={{ width: `${Math.max(6, Math.round((Number(p.views) / max) * 100))}%`, background: '#d94407' }} /></div>
              </div>
            ))}
          </div>
        </>
      ),
    })
  }

  push({
    key: 'next', palette: 'dusk', hold: 5000,
    render: () => (
      <>
        <Eyebrow palette="dusk">{tr('Your VIP journey')}</Eyebrow>
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-5">
          <Hero value={formatViews(r.lifetime_views)} unit={tr('views as a VIP')} palette="dusk" />
          <Facts palette="dusk" items={[
            { label: tr('Videos'), value: nf(r.lifetime_videos) },
            r.months_active > 0 && { label: tr('Months'), value: nf(r.months_active) },
            r.streak_months > 0 && { label: tr('In a row'), value: nf(r.streak_months) },
          ]} />
          {r.next && <Line palette="dusk">{nextLine(r.next, tr)}</Line>}
        </div>
      </>
    ),
  })

  return cards
}

/** The card people post: the month, the person, the numbers. */
export function VipShareCard({ data, className = '', style, flush = false }) {
  const tr = useT()
  const { me, recap: r } = data
  const stats = [
    r.views > 0 && { label: tr('Views'), value: formatViews(r.views) },
    r.videos > 0 && { label: r.videos === 1 ? tr('Video') : tr('Videos'), value: String(r.videos) },
    r.rank && r.of > 1 && { label: tr('In my market'), value: `#${r.rank}` },
    r.total > 0 && { label: tr('Earned'), value: wholeMoney(r.total, r.currency) },
  ].filter(Boolean).slice(0, 4)
  return (
    <Card palette="ember" footer={false} flush={flush} className={className} bodyClassName="justify-between gap-4" style={style}>
      <div>
        <p data-anim="rise" className="text-[11px] font-bold uppercase tracking-[0.22em] opacity-85">{tr('VIP recap')}</p>
        <p data-anim="rise" className="mt-1.5 break-words text-[30px] font-extrabold leading-[1.05] tracking-tight">{monthName(r.month)} {r.month.year}</p>
        <p data-anim="fade" className="mt-1 text-[12px] font-semibold opacity-80">{r.programme}</p>
      </div>
      <div data-anim="rise" className="flex items-center gap-3 rounded-2xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.16)' }}>
        {me?.photo
          ? <img src={me.photo} alt="" crossOrigin="anonymous" className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-white/60" />
          : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/25 text-xl font-extrabold ring-2 ring-white/60">{(me?.name || '?').slice(0, 1)}</span>}
        <span className="min-w-0 flex-1"><span className="line-clamp-2 break-words text-[18px] font-extrabold leading-tight">{me?.name}</span>{r.headline && <span className="mt-0.5 block truncate text-[12px] font-semibold opacity-85">{r.headline}</span>}</span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[12px] font-extrabold text-brand shadow-lg"><Icon name="star" className="h-3.5 w-3.5" />VIP</span>
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-4">
        {stats.map((s) => (
          <span key={s.label} data-anim="zoom" className="min-w-0">
            <span className="block text-[28px] font-extrabold leading-none tracking-tight">{s.value}</span>
            <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.14em] opacity-80">{s.label}</span>
          </span>
        ))}
      </div>
      <div data-anim="rise" className="flex items-center justify-between gap-3 border-t border-white/25 pt-3.5"><TrypMark className="!h-6 !opacity-100" /></div>
    </Card>
  )
}
