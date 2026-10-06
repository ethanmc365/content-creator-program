import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Avatar, Modal, Spinner } from '../ui'
import Icon from '../Icon'
import VideoThumb from '../VideoThumb'
import SocialMark from '../SocialMark'
import { confirm, notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { platformOf } from '../../lib/videoLinks'
import { downloadInvoicePdf } from '../../lib/invoicePdf'
import { invoiceFromRow } from '../../lib/sendInvoice'
import { formatDate, formatViews, cx } from '../../lib/utils'
import {
  BONUS_KINDS, DEFAULT_TERMS, describeRule, money, monthLabel, nf, perK, prizesByPlace, ruleRunsIn, useVipPreview, vipRpc,
} from '../../lib/vip'
import { useT } from '../../lib/i18n'
import { CountUp } from '../network/Motion'

// THE PIECES OF A VIP'S PAGE (2 Oct 2026). Kept together because they share one vocabulary - views gained
// this month, what they are worth, what the statement says - and a screen reads best when every piece uses
// the same words for the same number.

// The database writes its refusals as plain sentences. Known ones are put into the reader's language;
// anything else is shown as it came rather than hidden.
export function vipError(message, tr) {
  const m = String(message || '')
  if (/accept the VIP terms/i.test(m)) return tr('Please accept the VIP terms first.')
  if (/full link/i.test(m)) return tr('Paste the full link to your video.')
  if (/already in the VIP programme/i.test(m)) return tr('This video is already in the VIP programme.')
  const old = m.match(/more than (\d+) days ago/i)
  if (old) return tr('That video was posted more than {n} days ago, so it cannot be added.', { n: old[1] })
  if (/before this month/i.test(m)) return tr('That video was posted before this month started. Only videos posted this month count for this month.')
  if (/already counted/i.test(m)) return tr('A statement already counted this month. Ask the team to take it out.')
  return m
}

/** A labelled bar that fills towards a target, brand coloured, with the numbers said aloud. */
export function TargetBar({ label, value, target, format = nf, done }) {
  const tr = useT()
  const pct = target > 0 ? Math.min(1, value / target) : 0
  const met = target > 0 && value >= target
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-semibold text-ink">{label}</p>
        <p className="text-xs tabular-nums text-smoke">
          <span className={cx('font-bold', met ? 'text-emerald-600' : 'text-ink')}>{format(value)}</span> / {format(target)}
        </p>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div
          className={cx('h-full rounded-full transition-[width] duration-1000 ease-out', met ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-brand to-brand-light')}
          style={{ width: `${Math.max(pct > 0 ? 3 : 0, Math.round(pct * 100))}%` }}
        />
      </div>
      {met && <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-emerald-600"><Icon name="check" className="h-3 w-3" strokeWidth={2.6} />{done || tr('Target reached')}</p>}
    </div>
  )
}

/** Add a video: paste a link, the platform is read from it, and a refusal is said in words.
 *
 * REDONE (1 Oct 2026). Ethan: the browser's own "Please enter a URL" bubble appeared over the form (it was an
 * `<input type="url">`), and the box should look like the rest of the page. The form now checks the link itself and
 * says what is wrong in the same red line every other refusal uses. Only videos posted in THIS month are taken, and
 * once one is added its views are read straight away (migration 307 asks for a reading on insert); the page asks
 * again every few seconds until the first reading lands, so the number appears without a refresh. */
export function VipSubmit({ disabled, onAdded, month }) {
  const tr = useT()
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [focus, setFocus] = useState(false)
  const platform = platformOf(url)
  const looksLink = /^https?:\/\//i.test(url.trim())
  const since = month ? monthLabel(month.year, month.month) : ''

  async function add(e) {
    e.preventDefault()
    setErr('')
    const link = url.trim()
    if (!link) { setErr(tr('Paste the link to your video first.')); return }
    if (!/^https?:\/\/\S+\.\S+/i.test(link)) { setErr(tr('That does not look like a link. Copy it from the share button on your video.')); return }
    if (!platform) { setErr(tr('Only TikTok, Instagram, YouTube and Facebook links carry a view count we can read.')); return }
    setBusy(true)
    try {
      await vipRpc('vip_submit_video', { p_url: link, p_platform: platform, p_caption: null })
      setUrl('')
      toastSuccess(tr('Added. Reading its views now.'))
      onAdded?.({ watch: true })
    } catch (e2) { setErr(vipError(e2.message, tr)) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={add} noValidate className="relative overflow-clip rounded-card border border-gray-100 bg-white p-4 shadow-card sm:p-5">
      <span aria-hidden className="pointer-events-none absolute -right-14 -top-16 h-40 w-40 rounded-full bg-brand/10 blur-2xl" />
      <div className="relative flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-light text-white shadow-card"><Icon name="video" className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold text-ink">{tr('Submit a video')}</h3>
          <p className="text-xs text-smoke">{since ? tr('Posted in {m}, on your own account.', { m: since }) : tr('Posted this month, on your own account.')}</p>
        </div>
        <span className="hidden items-center gap-1.5 sm:flex" aria-hidden>
          {['tiktok', 'instagram', 'youtube', 'facebook'].map((b) => (
            <span key={b} className={cx('block h-6 w-6 overflow-hidden rounded-lg transition-all duration-300', platform && platform.toLowerCase() !== b ? 'opacity-25 grayscale' : 'opacity-100')}><SocialMark brand={b} tile className="h-full w-full" /></span>
          ))}
        </span>
      </div>
      <div className="relative mt-4 flex flex-col gap-2.5 sm:flex-row">
        <div className={cx('field-shell relative flex min-w-0 flex-1 items-center rounded-xl border-2 bg-cloud/40 transition-colors duration-200', err ? 'border-red-200 bg-red-50/40' : focus ? 'border-brand/40 bg-white' : 'border-transparent')}>
          <Icon name="link" className={cx('ml-3.5 h-4 w-4 shrink-0 transition-colors', focus || url ? 'text-brand' : 'text-gray-400')} />
          <input
            type="text"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={url}
            onChange={(e) => { setUrl(e.target.value); setErr('') }}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            placeholder={tr('Paste the link to your video')}
            disabled={disabled}
            aria-label={tr('Link to your video')}
            aria-invalid={!!err}
            className="min-w-0 flex-1 bg-transparent px-3 py-3 text-[15px] text-ink outline-none placeholder:text-gray-400"
          />
          {looksLink && (
            <span className={cx('mr-2.5 shrink-0 animate-rise rounded-full px-2.5 py-1 text-[11px] font-bold', platform ? 'bg-brand-tint text-brand' : 'bg-amber-50 text-amber-700')}>
              {platform || tr('Unknown link')}
            </span>
          )}
        </div>
        <button type="submit" disabled={busy || disabled} className="btn-primary shrink-0 justify-center !px-6 disabled:opacity-50">
          {busy ? <Spinner className="h-4 w-4" /> : <Icon name="plus" className="h-4 w-4" strokeWidth={2.4} />}
          {tr('Add video')}
        </button>
      </div>
      {err && <p role="alert" className="relative mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-600 animate-rise"><Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />{err}</p>}
    </form>
  )
}

/** One of their videos, with the three numbers that matter: all views, views counted this month, what that earns. */
export function VipVideoRow({ video, cpm, currency, onRemoved, delay = 0 }) {
  const tr = useT()
  const [busy, setBusy] = useState(false)
  const preview = !!useVipPreview()
  const out = video.status === 'disqualified'
  const reading = !video.synced_at && !video.error && !out
  const earned = (Number(video.views_counted) / 1000) * Number(cpm || 0)

  async function remove() {
    if (!await confirm(tr('Remove this video from your VIP page? Views already counted in a closed month stay counted.'), { confirmLabel: tr('Remove'), danger: true })) return
    setBusy(true)
    try { await vipRpc('vip_remove_video', { p_video: video.id }); onRemoved?.() }
    catch (e) { notice(vipError(e.message, tr)) }
    finally { setBusy(false) }
  }

  return (
    <li className={cx('group flex gap-3.5 rounded-card border bg-white p-3 shadow-card transition-all duration-300 animate-rise hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift sm:p-3.5', out ? 'border-red-100 opacity-80' : 'border-gray-100')} style={{ animationDelay: `${delay}ms` }}>
      {/* THE VIDEO'S OWN COVER (3 Oct 2026), framed like a phone screen, with the platform's mark on it. On hover it only grows a
          little and stays clickable: no play button (6 Oct 2026, Ethan). */}
      <a href={video.url} target="_blank" rel="noopener noreferrer" className="relative block w-[4.5rem] shrink-0 overflow-hidden rounded-xl shadow-card sm:w-20" aria-label={tr('Open the video')}>
        <VideoThumb url={video.url} platform={video.platform} thumbnailUrl={video.thumb} className="aspect-[9/16] w-full transition-transform duration-500 group-hover:scale-105" />
      </a>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13px] font-bold text-ink">{video.platform}</span>
          <span className="text-[11px] text-smoke">{video.posted_at ? tr('Posted {d}', { d: formatDate(video.posted_at) }) : tr('Added {d}', { d: formatDate(video.submitted_at) })}</span>
          {out && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase text-red-600">{tr('Not counted')}</span>}
          {reading && <span className="inline-flex items-center gap-1 rounded-full bg-cloud px-2 py-0.5 text-[10px] font-bold uppercase text-smoke"><Spinner className="h-2.5 w-2.5" />{tr('Reading views')}</span>}
          {video.error && !out && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">{tr('Could not read')}</span>}
        </div>
        {out && video.reason && <p className="mt-1 text-xs text-red-600">{video.reason}</p>}
        <dl className="mt-2.5 grid grid-cols-3 gap-2">
          <div><dt className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{tr('All views')}</dt><dd className="text-[15px] font-bold tabular-nums text-ink">{formatViews(video.views_total)}</dd></div>
          <div><dt className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{tr('This month')}</dt><dd className="text-[15px] font-bold tabular-nums text-brand">{formatViews(video.views_counted)}</dd></div>
          <div><dt className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{tr('Earns')}</dt><dd className="text-[15px] font-bold tabular-nums text-ink">{money(earned, currency)}</dd></div>
        </dl>
      </div>
      {!preview && <button type="button" onClick={remove} disabled={busy} aria-label={tr('Remove')} title={tr('Remove')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-smoke transition-colors hoverable:hover:bg-red-50 hoverable:hover:text-red-500">
        <Icon name="trash" className="h-4 w-4" />
      </button>}
    </li>
  )
}

/**
 * A VIDEO AS A SMALL CARD (6 Oct 2026). Ethan: "for My videos it should show them but it should be smaller cards and a better interface so 3
 * videos fit per line ... hovering over the videos shouldn't show a play button, just magnify slightly and be clickable." The cover leads,
 * the numbers sit under it, and the whole card opens the video.
 */
export function VipVideoCard({ video, cpm, currency, onRemoved, delay = 0 }) {
  const tr = useT()
  const [busy, setBusy] = useState(false)
  const preview = !!useVipPreview()
  const out = video.status === 'disqualified'
  const reading = !video.synced_at && !video.error && !out
  const earned = (Number(video.views_counted) / 1000) * Number(cpm || 0)

  async function remove() {
    if (!await confirm(tr('Remove this video from your VIP page? Views already counted in a closed month stay counted.'), { confirmLabel: tr('Remove'), danger: true })) return
    setBusy(true)
    try { await vipRpc('vip_remove_video', { p_video: video.id }); onRemoved?.() }
    catch (e) { notice(vipError(e.message, tr)) }
    finally { setBusy(false) }
  }

  return (
    <li className={cx('group relative flex flex-col overflow-hidden rounded-card border bg-white shadow-card transition-all duration-300 animate-rise hoverable:hover:z-10 hoverable:hover:scale-[1.04] hoverable:hover:shadow-lift', out ? 'border-red-100 opacity-80' : 'border-gray-100')} style={{ animationDelay: `${delay}ms` }}>
      <a href={video.url} target="_blank" rel="noopener noreferrer" className="relative block overflow-hidden" aria-label={tr('Open the video')}>
        <VideoThumb url={video.url} platform={video.platform} thumbnailUrl={video.thumb} className="aspect-[9/16] w-full rounded-none" />
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/85 via-ink/40 to-transparent px-2.5 pb-2 pt-9 text-white">
          <span className="block text-lg font-bold tabular-nums leading-none">{formatViews(video.views_total)}</span>
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-white/80">{tr('views in all')}</span>
        </span>
        <span className="absolute left-2 top-2 flex flex-wrap gap-1">
          {out && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">{tr('Not counted')}</span>}
          {reading && <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-bold uppercase text-smoke shadow-sm"><Spinner className="h-2.5 w-2.5" />{tr('Reading')}</span>}
          {video.error && !out && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">{tr('Could not read')}</span>}
        </span>
      </a>
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[12px] font-bold text-ink">{video.platform}</span>
          <span className="shrink-0 text-[10.5px] text-smoke">{formatDate(video.posted_at || video.submitted_at)}</span>
        </div>
        {out && video.reason && <p className="text-[11px] leading-snug text-red-600">{video.reason}</p>}
        <dl className="mt-auto grid grid-cols-2 gap-2">
          <div><dt className="text-[9.5px] font-bold uppercase tracking-wide text-gray-400">{tr('This month')}</dt><dd className="text-[13.5px] font-bold tabular-nums text-brand">{formatViews(video.views_counted)}</dd></div>
          <div><dt className="text-[9.5px] font-bold uppercase tracking-wide text-gray-400">{tr('Earns')}</dt><dd className="text-[13.5px] font-bold tabular-nums text-ink">{money(earned, currency)}</dd></div>
        </dl>
      </div>
      {!preview && (
        <button type="button" onClick={remove} disabled={busy} aria-label={tr('Remove')} title={tr('Remove')}
          className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-smoke opacity-100 shadow-sm transition-all duration-200 hoverable:opacity-0 hoverable:group-hover:opacity-100 hoverable:focus-visible:opacity-100 hoverable:hover:bg-red-50 hoverable:hover:text-red-500">
          <Icon name="trash" className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  )
}

const INVOICE_STEP = {
  approved: 'Invoice approved',
  sent: 'Invoice sent',
  paid: 'Paid',
}

/** A month's statement, folded: the total on top, the working underneath, the invoice at the end. */
export function VipStatementCard({ s, programmeCpm }) {
  const tr = useT()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const cash = (s.bonuses || []).filter((b) => (b.reward || 'cash') === 'cash')
  const vouchers = (s.bonuses || []).filter((b) => b.reward === 'voucher')
  const stage = s.paid_at ? 'paid' : s.invoice_stage
  const downloadable = stage === 'sent' || stage === 'paid'

  async function download() {
    setBusy(true)
    try {
      const { data } = await supabase.from('invoices').select('*').eq('id', s.invoice_id).single()
      if (data) await downloadInvoicePdf(invoiceFromRow(data))
    } finally { setBusy(false) }
  }

  return (
    <li className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hoverable:hover:bg-cloud/40">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand"><Icon name="calendar" className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-ink">{monthLabel(s.year, s.month)}</span>
          <span className="block text-xs text-smoke">{tr('{n} views', { n: nf(s.views) })}</span>
        </span>
        <span className="text-right">
          <span className="block text-lg font-bold tabular-nums text-ink">{money(s.total, s.currency)}</span>
          {stage && INVOICE_STEP[stage]
            ? <span className={cx('text-[10px] font-bold uppercase tracking-wide', stage === 'paid' ? 'text-emerald-600' : 'text-brand')}>{tr(INVOICE_STEP[stage])}</span>
            : Number(s.total) > 0 ? <span className="text-[10px] font-bold uppercase tracking-wide text-smoke">{tr('Invoice on its way')}</span>
              : <span className="text-[10px] font-bold uppercase tracking-wide text-smoke">{tr('Carried over')}</span>}
        </span>
        <Icon name="chevronDown" className={cx('h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="animate-rise space-y-2 border-t border-gray-100 bg-cloud/30 px-4 py-4 text-sm">
          <Line label={tr('{n} views at {r} per 1,000', { n: nf(s.views), r: perK(s.cpm ?? programmeCpm, s.currency) })} value={money(s.base, s.currency)} />
          {s.cap_applied && <p className="text-xs text-smoke">{tr('Your monthly cap applied to the views pay.')}</p>}
          {Number(s.rollover_in) > 0 && <Line label={tr('Carried over from last month')} value={money(s.rollover_in, s.currency)} />}
          {cash.map((b, i) => <Line key={`c${i}`} label={b.label} value={`+ ${money(b.amount, s.currency)}`} good />)}
          {vouchers.map((b, i) => <Line key={`v${i}`} label={`${b.label} (${tr('voucher')})`} value={money(b.amount, s.currency, { cents: false })} good />)}
          {(s.adjustments || []).map((a, i) => <Line key={`a${i}`} label={a.label} value={`${Number(a.amount) >= 0 ? '+' : '-'} ${money(Math.abs(a.amount), s.currency)}`} />)}
          {Number(s.rollover_out) > 0 && <p className="text-xs text-smoke">{tr('Below the minimum payout, so {a} carries over to next month.', { a: money(s.rollover_out, s.currency) })}</p>}
          <div className="flex items-center justify-between border-t border-gray-200 pt-2.5">
            <span className="font-bold text-ink">{tr('Paid to you')}</span>
            <span className="text-base font-bold tabular-nums text-brand">{money(s.total, s.currency)}</span>
          </div>
          {downloadable && (
            <button type="button" onClick={download} disabled={busy} className="btn-secondary mt-1 !py-2 text-xs">
              {busy ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="download" className="h-3.5 w-3.5" />}
              {tr('Download the invoice')}
            </button>
          )}
        </div>
      )}
    </li>
  )
}

function Line({ label, value, good }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-smoke">{label}</span>
      <span className={cx('shrink-0 font-semibold tabular-nums', good ? 'text-emerald-700' : 'text-ink')}>{value}</span>
    </div>
  )
}

/** This month's VIPs by views: the top three as a podium, everyone else as a list, the prizes beside their places.
 *
 * REDRAWN (3 Oct 2026). Ethan: "that leaderboard graphic I think can be improved." It was three white blocks on a slab
 * of orange. Now it is a light stage: each of the top three stands on a step of its own height that rises in, the
 * leader's step in the brand gradient with a crown of light behind the photo, second and third in soft tints, the views
 * counting up and the prize as a chip under the name. The rest of the board is a list with each row's share of the
 * leader's views drawn as a thin bar. */
export function VipBoardList({ rows, rules, currency, month = null }) {
  const tr = useT()
  const prizes = useMemo(() => {
    const out = {}
    for (const { place, parts } of prizesByPlace(rules, tr, currency, month)) out[place] = parts
    return out
  }, [rules, currency, month, tr])
  if (!rows?.length) {
    return (
      <div className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center">
        <Icon name="trophy" className="mx-auto h-7 w-7 text-gray-300" />
        <p className="mt-2 text-sm text-smoke">{tr('Nobody has views yet this month. Add a video to get on the board.')}</p>
      </div>
    )
  }
  const top = rows.slice(0, 3)
  const rest = rows.slice(3)
  const lead = Math.max(1, Number(rows[0]?.views) || 0)
  // Second, first, third: the winner in the middle and tallest.
  const order = [top[1], top[0], top[2]].filter(Boolean)
  const step = { 1: 'h-28 sm:h-32', 2: 'h-20 sm:h-24', 3: 'h-14 sm:h-16' }
  const face = {
    1: 'bg-gradient-to-b from-brand to-brand-light text-white shadow-lift',
    2: 'bg-gradient-to-b from-brand-tint to-white text-brand ring-1 ring-brand/15',
    3: 'bg-gradient-to-b from-cloud to-white text-smoke ring-1 ring-gray-200/70',
  }
  return (
    // ONE CARD, FULLY ROUNDED (6 Oct 2026). Ethan: the podium was "kind of a half visible gradient card and the bottom edges are sharp." The
    // gradient used to fade out into the page with nothing round it, and the steps were cut flat at the bottom. Now the podium and the list
    // are one white card with a border and a soft shadow; the gradient lives inside it, and every step is rounded all the way round.
    <div className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
      <div className="relative bg-gradient-to-b from-brand-tint via-brand-tint/30 to-white px-3 pb-5 pt-7 sm:px-6">
        <span aria-hidden className="pointer-events-none absolute left-1/2 top-2 h-40 w-40 -translate-x-1/2 rounded-full bg-brand/15 blur-3xl" />
        <div className="relative flex items-end justify-center gap-2.5 sm:gap-4">
          {order.map((r, i) => (
            <div key={r.rank} className="flex w-1/3 max-w-[10rem] flex-col items-center animate-rise" style={{ animationDelay: `${120 + i * 110}ms` }}>
              <div className="relative">
                {r.rank === 1 && <span aria-hidden className="absolute -inset-2 rounded-full bg-gradient-to-br from-brand to-brand-light opacity-30 blur-md motion-safe:animate-pulse" />}
                <Avatar src={r.photo} name={r.name} size={r.rank === 1 ? 'lg' : 'md'} className={cx('relative ring-[3px]', r.rank === 1 ? 'ring-brand' : 'ring-white shadow-card')} />
                <span className={cx('absolute -bottom-1.5 left-1/2 flex h-5 min-w-5 -translate-x-1/2 items-center justify-center rounded-full px-1.5 text-[10px] font-extrabold ring-2 ring-white', r.rank === 1 ? 'bg-ink text-white' : 'bg-white text-ink shadow')}>{r.rank}</span>
              </div>
              <p className="mt-3 max-w-full truncate text-[13px] font-bold text-ink sm:text-sm">{r.name}{r.me ? <span className="ml-1 text-brand">· {tr('You')}</span> : null}</p>
              <p className="text-xs font-semibold tabular-nums text-smoke"><CountUp value={Number(r.views) || 0} format={formatViews} /> {tr('views')}</p>
              {prizes[r.rank] ? <p className="mt-1 max-w-full truncate rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{prizes[r.rank].join(' + ')}</p> : <span className="mt-1 h-[18px]" />}
              <div className={cx('mt-2.5 flex w-full items-start justify-center rounded-2xl pt-2 text-xl font-extrabold tabular-nums origin-bottom animate-bar-rise', step[r.rank], face[r.rank])} style={{ animationDelay: `${i * 110}ms` }}>
                {r.rank === 1 ? <Icon name="trophy" className="h-6 w-6" /> : r.rank}
              </div>
            </div>
          ))}
        </div>
      </div>
      {rest.length > 0 && (
        <ol className="border-t border-gray-100 bg-white">
          {rest.map((r, i) => (
            <li key={r.rank} className={cx('flex items-center gap-3 px-4 py-2.5 animate-rise', i > 0 && 'border-t border-gray-50', r.me && 'bg-brand-tint/60')} style={{ animationDelay: `${400 + Math.min(i, 10) * 40}ms` }}>
              <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-gray-400">{r.rank}</span>
              <Avatar src={r.photo} name={r.name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{r.name}{r.me && <span className="ml-1.5 text-[11px] font-bold text-brand">{tr('You')}</span>}</span>
                <span className="mt-1 block h-1 max-w-[12rem] overflow-hidden rounded-full bg-gray-100"><span className="block h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-[width] duration-700" style={{ width: `${Math.max(3, Math.round((Number(r.views) / lead) * 100))}%` }} /></span>
              </span>
              {prizes[r.rank] && <span className="hidden rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 sm:inline">{prizes[r.rank].join(' + ')}</span>}
              <span className="text-right">
                <span className="block text-sm font-bold tabular-nums text-ink">{formatViews(r.views)}</span>
                <span className="block text-[10.5px] text-smoke">{r.videos === 1 ? tr('1 video') : tr('{n} videos', { n: r.videos })}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** What there is to earn, in words, with how far along this creator is on the targets and milestones. */
export function VipEarn({ rules, overview, currency }) {
  const tr = useT()
  const life = overview.lifetime || {}
  const stats = overview.stats || {}
  const progressFor = (r) => {
    const c = r.conditions || {}
    if (r.kind === 'milestone') {
      const metric = c.metric || 'lifetime_views'
      const have = metric === 'lifetime_views' ? life.views : metric === 'lifetime_videos' ? life.videos : life.best_month
      return { have: Number(have) || 0, need: Number(c.threshold) || 0, format: metric === 'month_earnings' ? (v) => money(v, currency, { cents: false }) : nf }
    }
    return null
  }
  // WHAT IS THEIRS ALONE comes first (2 Oct 2026, migration 311): a monthly fee and their own rate ladder, set per
  // creator by the team. And if the market's bonuses are switched off for them, the page says so rather than
  // listing bonuses they cannot earn.
  const m = overview.member || {}
  const own = []
  if (Number(m.monthly_fee) > 0) {
    own.push({ id: 'fee', icon: 'wallet', label: tr('Your monthly bonus'), text: m.fee_min_videos
      ? tr('{a} on top of your views pay, every month you post at least {n} videos.', { a: money(m.monthly_fee, currency, { cents: false }), n: m.fee_min_videos })
      : tr('{a} on top of your views pay, every month.', { a: money(m.monthly_fee, currency, { cents: false }) }) })
  }
  if (Array.isArray(m.tiers) && m.tiers.length) {
    own.push({ id: 'tiers', icon: 'trendUp', label: tr('Your own rate steps'), text: m.tiers.map((t) => tr('{r} per 1,000 once you pass {n} views in a month', { r: perK(t.cpm, currency), n: nf(t.from_views) })).join(' · ') })
  }
  const shown = m.bonuses_on === false ? [] : (rules || []).filter((r) => ruleRunsIn(r, overview.month))
  if (!shown.length && !own.length) {
    return <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke animate-rise">{m.bonuses_on === false ? tr('Your agreement is your views pay. Market bonuses are not part of it.') : tr('No bonuses are running right now. Your views pay is the whole story until the team adds some.')}</p>
  }
  // Each card rises in a beat after the one above it, so switching to this section reads as the list arriving
  // rather than appearing (Ethan: clicking Earn more "doesn't have clean animations").
  const rise = (i) => ({ className: 'animate-rise', style: { animationDelay: `${Math.min(i, 8) * 55}ms` } })
  return (
    <ul className="space-y-3">
      {own.map((o, i) => (
        <li key={o.id} {...rise(i)}>
          <div className="flex items-start gap-3 rounded-card border border-brand/20 bg-white p-4 shadow-card">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-light text-white shadow-card"><Icon name={o.icon} className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold text-ink">{o.label}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-smoke">{o.text}</p>
            </div>
          </div>
        </li>
      ))}
      {m.bonuses_on === false && <li {...rise(own.length)}><p className="rounded-card border border-dashed border-gray-200 px-5 py-4 text-sm text-smoke">{tr('Market bonuses are not part of your agreement.')}</p></li>}
      {shown.map((r, idx) => {
        const kind = BONUS_KINDS.find((k) => k.key === r.kind)
        const prog = progressFor(r)
        const a = rise(own.length + idx)
        return (
          <li key={r.id} className={cx('rounded-card border border-gray-100 bg-white p-4 shadow-card transition-transform duration-200 hoverable:hover:-translate-y-0.5', a.className)} style={a.style}>
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-light text-white shadow-card"><Icon name={kind?.icon || 'trophy'} className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-ink">{r.label}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-smoke">{describeRule(r, tr, currency)}</p>
              </div>
            </div>
            {prog && prog.need > 0 && !overview.staff && <div className="mt-3"><TargetBar label={tr('Your progress')} value={prog.have} target={prog.need} format={prog.format} done={tr('Reached')} /></div>}
            {r.kind === 'target' && stats && (overview.member?.target_videos || overview.member?.target_views) ? (
              <div className="mt-3 space-y-3">
                {overview.member.target_videos ? <TargetBar label={tr('Videos this month')} value={stats.videos} target={overview.member.target_videos} /> : null}
                {overview.member.target_views ? <TargetBar label={tr('Views this month')} value={stats.views} target={overview.member.target_views} /> : null}
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/** The terms, accepted once in the programme's own words (or ours), and again when the version goes up. */
export function VipTermsGate({ open, programme, onAccepted }) {
  const tr = useT()
  const [ticked, setTicked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const paragraphs = programme?.terms
    ? String(programme.terms).split(/\n{2,}/).filter(Boolean)
    : DEFAULT_TERMS.map((p) => tr(p, { days: programme?.window_days || 60 }))
  async function accept() {
    setBusy(true); setErr('')
    try { await vipRpc('vip_accept_terms'); onAccepted?.() } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={() => {}} dismissible={false} title={tr('Before you start')}>
      <p className="text-sm text-smoke">{tr('These are the terms of the VIP programme. Read them once; you will not be asked again unless they change.')}</p>
      <ol className="mt-4 space-y-3">
        {paragraphs.map((p, i) => (
          <li key={i} className="flex gap-3 text-[13.5px] leading-relaxed text-ink">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">{i + 1}</span>
            <span>{p}</span>
          </li>
        ))}
      </ol>
      <label className="mt-5 flex items-start gap-3 text-sm text-ink">
        <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-brand" />
        <span>{tr('I have read the VIP terms and I agree to them.')}</span>
      </label>
      {err && <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{err}</p>}
      <button type="button" onClick={accept} disabled={!ticked || busy} className="btn-primary mt-5 w-full justify-center disabled:opacity-50">
        {busy ? <Spinner className="h-4 w-4" /> : tr('Accept and continue')}
      </button>
    </Modal>
  )
}

/** A nudge that costs nothing to ignore until money is waiting: payment details.
 *
 * IN THE PAGE'S OWN COLOURS (1 Oct 2026). Ethan asked for its colour to change: it was the amber of a warning, the
 * only amber card on a page of white and orange. It is a white card with the brand's tile, like every other card. */
export function PaymentBanner() {
  const tr = useT()
  return (
    <Link to="/settings?section=payment" className="group relative flex items-center gap-3 overflow-hidden rounded-card border border-brand/20 bg-white px-4 py-3.5 shadow-card transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-brand to-brand-light" />
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand"><Icon name="wallet" className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-ink">{tr('Add your payment details')}</span>
        <span className="block text-xs text-smoke">{tr('We cannot pay your monthly invoice until they are saved.')}</span>
      </span>
      <span className="hidden shrink-0 rounded-full bg-brand px-3 py-1.5 text-xs font-bold text-white sm:inline">{tr('Add them')}</span>
      <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-brand transition-transform group-hover:translate-x-0.5 sm:hidden" />
    </Link>
  )
}
