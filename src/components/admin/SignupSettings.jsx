import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../Icon'
import { Select, Skeleton } from '../ui'
import { cx } from '../../lib/utils'
import { notice } from '../../lib/confirm'
import { marketsApi } from '../../api/markets'
import { profilesApi } from '../../api/profiles'
import { flagFromIso } from '../../lib/flags'
import OnboardingCall, { isCalLink } from '../../pages/OnboardingCall'
import PhoneFrame from './PhoneFrame'

// APPLICATIONS > SIGN-UP (14 Oct 2026). Everything about joining that the team sets per market, starting with the
// onboarding call: Spain sends every new creator to book 15 minutes with Marta before review. Switch it on for another
// market (UK, Germany) when somebody there can take the calls. Each market previews exactly what an applicant sees,
// and "Walk the sign-up" opens the real flow as an applicant from that country, with nothing saved.
export default function SignupSettings() {
  const [markets, setMarkets] = useState(null)
  const [rows, setRows] = useState({})
  const [team, setTeam] = useState([])
  const [open, setOpen] = useState(null)

  async function load() {
    const [{ data: m }, { data: s }, { data: t }] = await Promise.all([
      marketsApi.communities().select('id, slug, name, kind, country_codes, retired_at').eq('kind', 'chapter').is('retired_at', null).order('name'),
      marketsApi.marketSignupSettings().select('*'),
      profilesApi.profiles().select('id, name, photo_url, role_title').eq('is_admin', true).eq('is_test', false).order('name'),
    ])
    setMarkets(m || [])
    setRows(Object.fromEntries((s || []).map((r) => [`${r.community_id}:${r.audience || 'community'}`, r])))
    setTeam(t || [])
  }
  useEffect(() => { load() }, [])

  if (!markets) return <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-gray-100 bg-white p-5 shadow-card">
        <h2 className="font-semibold">Onboarding call</h2>
        <p className="mt-1 text-sm text-smoke">
          A market with a call switched on adds one last required step to sign-up: book a short call with the host. General
          community and VIP sign-ups each have their own link. With a Cal.com link the booking opens inside the app and the
          app sees it happen; the application card then shows when the call is. Only applicants from that market see it.
        </p>
        <p className="mt-2 text-xs text-smoke">
          The welcome email sent after approval is edited in <Link to="/admin/email" className="font-semibold text-brand hover:underline">Emails</Link>.
        </p>
      </div>
      {markets.map((m, i) => (
        <MarketRow key={m.id} market={m} rows={{ community: rows[`${m.id}:community`], vip: rows[`${m.id}:vip`] }} team={team} i={i}
          open={open === m.id} onToggle={() => setOpen((o) => (o === m.id ? null : m.id))} onSaved={load} />
      ))}
    </div>
  )
}

function MarketRow({ market, rows, team, open, onToggle, onSaved, i }) {
  const country = (market.country_codes || [])[0]
  const on = (a) => !!rows[a]?.call_enabled
  const summary = ['community', 'vip'].filter(on).map((a) => (a === 'vip' ? 'VIP' : 'General community'))
  return (
    <section className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-4 text-left">
        <span className="text-2xl leading-none">{flagFromIso(country) || '🌍'}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{market.name}</span>
          <span className="block truncate text-xs text-smoke">{summary.length ? `Onboarding call for ${summary.join(' and ')}` : 'No onboarding call'}</span>
        </span>
        <span className={cx('rounded-full px-2.5 py-1 text-[11px] font-bold', summary.length ? 'bg-brand text-white' : 'bg-cloud text-smoke')}>{summary.length ? 'On' : 'Off'}</span>
        <Icon name="chevronDown" className={cx('h-4 w-4 text-smoke transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-gray-50 p-5 animate-tab-in">
          {/* ONE CALL FOR GENERAL-COMMUNITY SIGN-UPS AND ANOTHER FOR VIP SIGN-UPS (migration 420): different links, so
              each can go to a different calendar or event type. */}
          <CallEditor market={market} audience="community" row={rows.community} team={team} onSaved={onSaved} country={country} />
          <CallEditor market={market} audience="vip" row={rows.vip} team={team} onSaved={onSaved} country={country} />
        </div>
      )}
    </section>
  )
}

function CallEditor({ market, audience, row, team, onSaved, country }) {
  const [draft, setDraft] = useState(() => ({
    enabled: !!row?.call_enabled, url: row?.call_url || '', minutes: row?.call_minutes || 15,
    host: row?.host_profile_id || '', note: row?.note || '',
  }))
  const [busy, setBusy] = useState(false)
  const host = team.find((p) => p.id === draft.host)
  const on = !!row?.call_enabled
  const urlOk = !draft.url || /^https?:\/\//i.test(draft.url.trim())
  const cal = isCalLink(draft.url.trim())
  const who = audience === 'vip' ? 'VIP' : 'general community'

  async function save() {
    if (draft.enabled && !draft.url.trim()) { await notice('Add the booking link before switching the call on.'); return }
    if (!urlOk) { await notice('The booking link has to start with https://'); return }
    setBusy(true)
    const { error } = await marketsApi.adminSetSignupCall({
      p_community: market.id, p_audience: audience, p_enabled: draft.enabled, p_url: draft.url.trim() || null,
      p_minutes: Number(draft.minutes) || 15, p_host: draft.host || null, p_note: draft.note,
    })
    setBusy(false)
    if (error) { await notice(`Could not save: ${error.message}`); return }
    onSaved()
  }

  return (
    <div className="grid gap-6 rounded-2xl border border-gray-100 p-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-4">
        <label className="flex items-center justify-between gap-3 rounded-xl bg-cloud/60 px-4 py-3">
          <span>
            <span className="flex items-center gap-2 text-sm font-semibold">
              {audience === 'vip' ? <Icon name="star" className="h-4 w-4 text-brand" /> : <Icon name="users" className="h-4 w-4 text-brand" />}
              {audience === 'vip' ? 'VIP sign-ups' : 'General community sign-ups'}
              {on && <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-white">On</span>}
            </span>
            <span className="block text-xs text-smoke">New {who} applicants from {market.name} must book this call before they can submit.</span>
          </span>
          <button type="button" role="switch" aria-checked={draft.enabled} onClick={() => setDraft((d) => ({ ...d, enabled: !d.enabled }))}
            className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors', draft.enabled ? 'bg-brand' : 'bg-gray-200')}>
            <span className={cx('absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform', draft.enabled ? 'translate-x-6' : 'translate-x-1')} />
          </button>
        </label>
        <div>
          <label className="label" htmlFor={`call-url-${market.id}-${audience}`}>Booking link</label>
          <input id={`call-url-${market.id}-${audience}`} className="input" value={draft.url} placeholder="https://cal.com/tryp/onboarding-spain"
            onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))} />
          {!urlOk && <p className="mt-1 text-[11px] font-medium text-brand">Starts with https://</p>}
          <p className="mt-1 text-[11px] text-smoke">
            {draft.url && urlOk && cal
              ? 'Cal.com: opens inside the app, filled in with their name and email, and the app knows the moment they book.'
              : draft.url && urlOk
                ? 'Not a Cal.com link: it opens in a new tab and the applicant ticks that they booked.'
                : 'A Cal.com link (cal.com/...) is best: the app then sees the booking itself.'}
          </p>
          {draft.url && urlOk && (
            <a href={draft.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
              Test the link <Icon name="link" className="h-3 w-3" />
            </a>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className="label">Who they meet</span>
            <Select value={draft.host} onChange={(v) => setDraft((d) => ({ ...d, host: v }))} className="w-full" ariaLabel="Host"
              options={[{ value: '', label: 'Nobody named' }, ...team.map((p) => ({ value: p.id, label: p.role_title ? `${p.name} · ${p.role_title}` : p.name }))]} />
          </div>
          <div>
            <span className="label">Length</span>
            <Select value={String(draft.minutes)} onChange={(v) => setDraft((d) => ({ ...d, minutes: Number(v) }))} className="w-full" ariaLabel="Length" search={false}
              options={[10, 15, 20, 30, 45].map((n) => ({ value: String(n), label: `${n} minutes` }))} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor={`call-note-${market.id}-${audience}`}>Extra line for applicants (optional)</label>
          <textarea id={`call-note-${market.id}-${audience}`} rows={2} className="input" value={draft.note}
            placeholder="Shown under the explanation."
            onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={save} disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Save'}</button>
          {country && (
            <a href={`/onboarding?demo=1&prefill=full&country=${country}${audience === 'vip' ? '&vip=1' : ''}`} target="_blank" rel="noopener noreferrer" className="btn-secondary">
              <Icon name="eye" className="h-4 w-4" /> Walk the {audience === 'vip' ? 'VIP ' : ''}sign-up
            </a>
          )}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-smoke">What applicants see</p>
        <PhoneFrame>
          <div className="p-4">
            <h3 className="mb-1 text-center text-lg font-bold">Book your onboarding call</h3>
            <p className="mb-4 text-center text-xs text-smoke">One last step: a short call to welcome you in.</p>
            <OnboardingCall preview
              call={{ call_url: draft.url, call_minutes: draft.minutes, note: draft.note, host_name: host?.name, host_photo_url: host?.photo_url, host_title: host?.role_title }}
              opened={false} booked={false} />
          </div>
        </PhoneFrame>
      </div>
    </div>
  )
}
