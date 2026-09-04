import { useEffect, useMemo, useState } from 'react'
import { confirm } from '../../lib/confirm'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Avatar, Badge, CopyButton, EmptyState, PageHeader, Skeleton, Spinner } from '../../components/ui'
import Icon from '../../components/Icon'
import Reveal from '../../components/network/Reveal'
import SocialMark, { brandForUrl, BRAND_COLOR } from '../../components/SocialMark'
import { useMarkets, resolveMarketForCountryName } from '../../lib/markets'
import { ageFromDob, cx, timeAgo, formatDate } from '../../lib/utils'

// SIGNUP REVIEW, REBUILT 4 SEP 2026.
//
// New creators sign up, complete their profile, and wait here as `pending`
// until an admin approves or declines them.
//
// WHAT CHANGED AND WHY
//
// Ethan: "redesign the admin applications tab better. And remember, it wants
// admins to be able to decide which market to go in before it's approved, and
// then it will automatically go in that market. And just really improve the UI
// of that and give the admins more functions and see more things on a quick
// application view."
//
//  1  THE MARKET IS A DECISION ON THE CARD, NOT A LABEL ON IT. It used to be a
//     grey badge reading whatever the country resolved to, with no way to
//     disagree - and there are two ordinary cases where the country is the
//     wrong answer. A Portuguese speaker living in London is more use to
//     Portugal than to UK & Ireland; somebody in France, which no market
//     covers, might belong in Spain rather than in the worldwide pool by
//     default. Both of those turn on the LANGUAGES they speak, which is why
//     Ethan wants that section to count for something here. The card now
//     suggests, says why it is suggesting, flags any market whose own language
//     this applicant speaks, and lets the admin pick a different one before
//     approving. Approval places them in whatever is picked - see the
//     `admin_approve_application` RPC, which does both halves as one unit so
//     "approved but in no market" is not a state that can be left behind.
//
//  2  EVERYTHING THE DECISION TURNS ON, WITHOUT LEAVING THE PAGE. Their words
//     in full rather than clamped, their platforms as real links in their own
//     colours, their languages as chips (they are now load-bearing), their
//     travel photographs as a strip - a creator's photos are the single most
//     useful thing to look at when deciding whether they can shoot, and they
//     were the one thing this page never showed. Plus the phone number, which
//     an admin previously had to open the full profile to find, and which is
//     the fastest way to reach somebody about a shoot.
//
//  3  THE PAGE ADMITS WHAT IS MISSING. An application with no social links, no
//     photo or a bio of four words is a different decision from a complete one,
//     and it looked identical. Gaps are marked.
//
// A card is COLLAPSED to its summary by default and opens in place. Fifteen
// applications each three screens tall is a page nobody reads to the end.

// THE LANGUAGE A MARKET IS ACTUALLY SPOKEN IN.
//
// The obvious source is `communities.language`, and it is the wrong one: that
// column is the market's INTERFACE language, and five of the six markets are on
// 'en' because the platform has only been translated into Spanish so far. Using
// it lit up "English" as a market signal on every applicant, which is worse
// than no signal - almost everybody who applies speaks English, so a hint that
// fires for all of them tells an admin nothing and trains them to ignore the
// one that matters.
//
// What is worth flagging is somebody who speaks the language a market is LIVED
// in, which is a property of its countries. Keyed by country code so a market
// covering several (Nordics, UK & Ireland) contributes all of them.
//
// ENGLISH IS DELIBERATELY NOT A SIGNAL. It is the programme's working language
// and the assumed baseline; "speaks English" is not a reason to move anybody.
const LOCAL_LANGUAGE = {
  ES: 'Spanish', PT: 'Portuguese', DE: 'German', RO: 'Romanian',
  SE: 'Swedish', NO: 'Norwegian', DK: 'Danish', FI: 'Finnish',
  FR: 'French', IT: 'Italian', NL: 'Dutch', PL: 'Polish',
}

/** The non-English languages a market is spoken in, from its countries. */
function marketLanguages(m) {
  return [...new Set((m?.country_codes ?? []).map((c) => LOCAL_LANGUAGE[c]).filter(Boolean))]
}

export default function AdminApplications() {
  const [apps, setApps] = useState(null)
  const [emails, setEmails] = useState({})
  const [phones, setPhones] = useState({})
  const [photos, setPhotos] = useState({})
  const [busyId, setBusyId] = useState(null)
  const [toast, setToast] = useState('')
  const [search, setSearch] = useState('')
  const [market, setMarket] = useState('')
  const [openId, setOpenId] = useState(null)
  // The market each application will be approved INTO, keyed by creator.
  // Seeded from the suggestion and overridden by the admin; '' means worldwide
  // only, which is a real answer rather than a missing one.
  const [placeIn, setPlaceIn] = useState({})
  const markets = useMarkets()

  async function load() {
    const [{ data: profiles }, { data: emailRows }] = await Promise.all([
      supabase.from('profiles').select('*').eq('status', 'pending').eq('onboarded', true).order('created_at', { ascending: true }),
      supabase.rpc('admin_list_emails'),
    ])
    const list = profiles ?? []
    setApps(list)
    setEmails(Object.fromEntries((emailRows ?? []).map((r) => [r.id, r.email])))

    // The two extra reads, batched over the whole queue rather than fired per
    // card: a page of fifteen applications must not open fifteen connections.
    const ids = list.map((a) => a.id)
    if (ids.length) {
      const [{ data: priv }, { data: pics }] = await Promise.all([
        supabase.from('creator_private').select('id, phone, phone_country').in('id', ids),
        supabase.from('creator_photos').select('creator_id, photo_url').in('creator_id', ids).order('sort_order'),
      ])
      setPhones(Object.fromEntries((priv ?? []).map((r) => [r.id, [r.phone_country, r.phone].filter(Boolean).join(' ')])))
      const byCreator = {}
      for (const p of pics ?? []) (byCreator[p.creator_id] ||= []).push(p.photo_url)
      setPhotos(byCreator)
    }
  }

  useEffect(() => { load() }, [])

  function flash(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  // NOBODY APPLIES TO A MARKET, SO THE PAGE HAS TO WORK IT OUT.
  //
  // A creator gives us a country, and every open market owns a set of country
  // codes that do not overlap - so their market is a strong SUGGESTION. It is
  // not a fact, which is the change: an admin can disagree with it, and the
  // most common reason to is the language they speak.
  const suggestion = useMemo(() => {
    const out = {}
    for (const a of apps ?? []) {
      const r = resolveMarketForCountryName(a.country, markets)
      out[a.id] = r.market ?? null
    }
    return out
  }, [apps, markets])

  const marketLabel = (a) => suggestion[a.id]?.name ?? 'Worldwide'

  // Seed each card's picker from its suggestion, once the markets have loaded.
  // Not in the render, and not overwriting a choice already made.
  useEffect(() => {
    if (!apps?.length || !markets?.length) return
    setPlaceIn((prev) => {
      const next = { ...prev }
      for (const a of apps) if (next[a.id] === undefined) next[a.id] = suggestion[a.id]?.slug ?? ''
      return next
    })
  }, [apps, markets, suggestion])

  // MARKETS THIS PERSON'S LANGUAGES POINT AT. The reason the languages screen
  // exists, made visible on the screen the decision is made on: somebody who
  // speaks the language a market is lived in is worth a second look even when
  // their country says otherwise. A Portuguese speaker in London is the case
  // Ethan is describing, and it is the case the country alone cannot see.
  const languageMatches = (a) => {
    const spoken = new Set((a.languages ?? []).map((l) => String(l).toLowerCase()))
    return (markets ?? [])
      .filter((m) => m.kind === 'chapter' && m.is_active && m.slug !== suggestion[a.id]?.slug)
      .map((m) => ({ market: m, langs: marketLanguages(m).filter((l) => spoken.has(l.toLowerCase())) }))
      .filter((x) => x.langs.length > 0)
  }

  async function approve(app) {
    const slug = placeIn[app.id] || null
    const where = slug ? (markets.find((m) => m.slug === slug)?.name ?? slug) : 'the worldwide community only'
    if (!await confirm(`Approve ${app.name} into ${where}?`)) return
    setBusyId(app.id)
    const { data, error } = await supabase.rpc('admin_approve_application', {
      target: app.id,
      p_market_slug: slug,
    })
    setBusyId(null)
    if (error) { flash(`Something went wrong: ${error.message}`); return }
    flash(`${app.name} approved into ${data?.market ?? where}.`)
    setApps((prev) => prev.filter((a) => a.id !== app.id))
  }

  async function decline(app) {
    if (!await confirm(`Decline ${app.name}'s application? This permanently deletes their account.`)) return
    setBusyId(app.id)
    const { error } = await supabase.rpc('admin_decline_application', { target: app.id })
    setBusyId(null)
    if (error) { flash(`Something went wrong: ${error.message}`); return }
    flash(`${app.name}'s application declined and removed.`)
    setApps((prev) => prev.filter((a) => a.id !== app.id))
  }

  const tabs = useMemo(() => {
    const tally = {}
    for (const m of markets ?? []) if (m?.name && m.kind === 'chapter') tally[m.name] = 0
    for (const a of apps ?? []) tally[marketLabel(a)] = (tally[marketLabel(a)] ?? 0) + 1
    return Object.entries(tally).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps, suggestion, markets])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (apps ?? []).filter((a) => {
      if (market && marketLabel(a) !== market) return false
      if (!q) return true
      return `${a.name} ${a.country ?? ''} ${a.city ?? ''} ${(a.languages ?? []).join(' ')} ${emails[a.id] ?? ''}`
        .toLowerCase().includes(q)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps, search, market, suggestion, emails])

  const linksOf = (a) => [
    { label: 'Instagram', url: a.instagram_url },
    { label: 'TikTok', url: a.tiktok_url },
    { label: 'YouTube', url: a.youtube_url },
    { label: 'Facebook', url: a.facebook_url },
    { label: 'LinkedIn', url: a.linkedin_url },
    ...(Array.isArray(a.other_links) ? a.other_links : []),
  ].filter((s) => s.url?.trim())

  return (
    <div className="page max-w-4xl">
      <PageHeader
        back="/admin"
        title="Applications"
        subtitle={apps?.length ? `${apps.length} ${apps.length === 1 ? 'person is' : 'people are'} waiting on a decision.` : undefined}
      />

      {apps !== null && apps.length > 0 && (
        <div className="mb-6 space-y-3">
          {tabs.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {[['', 'All', apps.length], ...tabs.map(([m, n]) => [m, m, n])].map(([key, label, count]) => {
                const on = market === key
                return (
                  <button
                    key={key || 'all'}
                    type="button"
                    onClick={() => setMarket(key)}
                    aria-pressed={on}
                    className={cx(
                      'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200',
                      on
                        ? 'border-brand bg-brand text-white'
                        : 'border-gray-200 bg-white text-smoke hover:-translate-y-0.5 hover:border-brand hover:text-brand',
                    )}
                  >
                    {label}
                    <span className={on ? 'text-white/80' : 'text-gray-400'}>{count}</span>
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              className="input sm:max-w-xs"
              placeholder="Search name, country, language or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search applications"
            />
            <span className="text-xs text-smoke">{shown.length} shown</span>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white shadow-lift lg:bottom-8">
          {toast}
        </div>
      )}

      {apps === null ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
      ) : apps.length === 0 ? (
        <EmptyState
          icon={<Icon name="check" className="h-7 w-7" />}
          title="No applications waiting"
          hint="When a new creator finishes their profile, they'll appear here for review."
        />
      ) : (
        <Reveal className="space-y-5" stagger={0.05}>
          {shown.length === 0 && (
            <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">
              No applications match that.
            </p>
          )}
          {shown.map((a) => (
            <ApplicationCard
              key={a.id}
              app={a}
              email={emails[a.id]}
              phone={phones[a.id]}
              photos={photos[a.id] ?? []}
              links={linksOf(a)}
              suggested={suggestion[a.id]}
              languageHints={languageMatches(a)}
              markets={(markets ?? []).filter((m) => m.kind === 'chapter' && m.is_active)}
              placeIn={placeIn[a.id] ?? ''}
              onPlaceIn={(slug) => setPlaceIn((p) => ({ ...p, [a.id]: slug }))}
              open={openId === a.id}
              onToggle={() => setOpenId((v) => (v === a.id ? null : a.id))}
              busy={busyId === a.id}
              onApprove={() => approve(a)}
              onDecline={() => decline(a)}
            />
          ))}
        </Reveal>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------- card

// A gap in an application is information. Four short lines saying what is
// missing beat one complete-looking card that happens to have nothing in it.
function gapsIn(app, links) {
  const g = []
  if (!app.photo_url) g.push('no profile photo')
  if (!links.length) g.push('no links to their work')
  if (!app.about || app.about.trim().length < 40) g.push('barely wrote anything about themselves')
  if (!app.languages?.length) g.push('no languages')
  if (!app.country) g.push('no country')
  return g
}

function ApplicationCard({
  app, email, phone, photos, links, suggested, languageHints, markets,
  placeIn, onPlaceIn, open, onToggle, busy, onApprove, onDecline,
}) {
  // `profiles.dob` IS NULL ON EVERY ROW AND ALWAYS WILL BE - a BEFORE trigger
  // (mirror_dob_to_private) moves it into creator_private and derives
  // `profiles.age` from it. Reading dob here printed no age for anybody.
  const age = app.age ?? ageFromDob(app.dob)
  const gaps = gapsIn(app, links)
  const bucket = (Array.isArray(app.bucket_list) ? app.bucket_list : [])
    .map((b) => (typeof b === 'string' ? b : [b?.city, b?.country].filter(Boolean).join(', ')))
    .filter(Boolean)

  return (
    <div className="card !p-0 overflow-hidden transition-all duration-200 hover:shadow-lift">
      {/* ------------------------------------------------------- the summary */}
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:p-6">
        <Avatar src={app.photo_url} name={app.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="text-lg font-bold">{app.name}</h2>
            {age != null && <span className="text-sm text-smoke">{age}</span>}
            {app.referred_by && <Badge tone="brand">Referred</Badge>}
          </div>
          <p className="text-sm text-smoke">
            {[app.city, app.country].filter(Boolean).join(', ') || 'No location given'}
          </p>
          {app.bio && <p className="mt-1.5 text-sm font-medium leading-relaxed">{app.bio}</p>}

          {/* The platforms, as links in their own colours. What an approval
              turns on is the work, and the work is behind these. */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {links.length > 0 ? links.map((l) => {
              const brand = brandForUrl(l.url)
              const tint = BRAND_COLOR[brand]
              return (
                <a
                  key={l.label + l.url}
                  href={/^https?:\/\//i.test(l.url) ? l.url : `https://${l.url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 py-1 pl-1.5 pr-2.5 text-[11px] font-semibold text-smoke transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:text-brand"
                >
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded-full"
                    style={{ background: tint !== 'currentColor' ? `${tint}1a` : undefined }}
                  >
                    <SocialMark brand={brand} colored className="h-3 w-3" />
                  </span>
                  {l.label || brand}
                </a>
              )
            }) : (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                No links to their work
              </span>
            )}
          </div>

          {/* LANGUAGES, PROMOTED. They are what the market decision below can
              turn on, so they sit next to it rather than in a run of grey
              footnotes. A chip is highlighted when it matches a market's own
              working language. */}
          {app.languages?.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Speaks</span>
              {app.languages.map((l) => {
                const hit = languageHints.some((h) => h.langs.some((x) => x.toLowerCase() === String(l).toLowerCase()))
                return (
                  <span
                    key={l}
                    className={cx(
                      'rounded-full px-2 py-0.5 text-[11px] font-medium',
                      hit ? 'bg-brand-tint text-brand' : 'bg-cloud text-smoke',
                    )}
                  >
                    {l}
                  </span>
                )
              })}
            </div>
          )}
        </div>

        <div className="shrink-0 text-left sm:text-right">
          <p className="text-xs text-gray-400">Applied {timeAgo(app.created_at)}</p>
          <p className="text-[11px] text-gray-300">{formatDate(app.created_at)}</p>
        </div>
      </div>

      {/* Their photographs. The single best evidence of whether somebody can
          shoot, and the one thing this page never showed. */}
      {photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-5 pb-4 sm:px-6">
          {photos.slice(0, 8).map((url) => (
            <img
              key={url}
              src={url}
              alt=""
              loading="lazy"
              className="h-20 w-20 shrink-0 rounded-xl object-cover"
            />
          ))}
          {photos.length > 8 && (
            <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-cloud text-xs font-semibold text-smoke">
              +{photos.length - 8}
            </span>
          )}
        </div>
      )}

      {gaps.length > 0 && (
        <p className="mx-5 mb-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 sm:mx-6">
          <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>This application has {gaps.join(', ')}.</span>
        </p>
      )}

      {/* --------------------------------------------------- the whole thing */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 border-t border-gray-50 px-5 py-2.5 text-xs font-semibold text-smoke transition-colors hover:bg-cloud/50 hover:text-ink sm:px-6"
        aria-expanded={open}
      >
        {open ? 'Hide the details' : 'Read the whole application'}
        <Icon name={open ? 'chevronUp' : 'chevronDown'} className="h-4 w-4" />
      </button>

      {open && (
        <div className="space-y-4 border-t border-gray-50 bg-cloud/30 px-5 py-5 text-sm sm:px-6">
          {app.about && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">In their words</p>
              <p className="whitespace-pre-line leading-relaxed text-ink">{app.about}</p>
            </div>
          )}
          {app.favourite_quote && (
            <p className="border-l-2 border-brand/30 pl-3 text-sm italic text-smoke">“{app.favourite_quote}”</p>
          )}
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <Fact label="Email" value={email} copy={email} />
            <Fact label="Phone" value={phone} copy={phone} />
            <Fact label="Countries visited" value={app.countries_visited?.length ? `${app.countries_visited.length}` : null} />
            <Fact label="Bucket list" value={bucket.slice(0, 3).join(' · ')} />
            <Fact label="Timezone" value={app.timezone} />
            <Fact label="Travel photos" value={photos.length ? `${photos.length}` : null} />
          </dl>
        </div>
      )}

      {/* ------------------------------------------------------- the decision */}
      <div className="border-t border-gray-100 bg-white px-5 py-4 sm:px-6">
        {/* THE MARKET, DECIDED HERE. The suggestion and the reason for it are
            both stated, because an admin overriding a suggestion should be able
            to see what they are overriding. */}
        <div className="mb-4">
          <label htmlFor={`market-${app.id}`} className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Approve into
          </label>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <select
              id={`market-${app.id}`}
              value={placeIn}
              onChange={(e) => onPlaceIn(e.target.value)}
              className="input !py-2 text-sm sm:max-w-[16rem]"
            >
              <option value="">Worldwide community only</option>
              {markets.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.name}{suggested?.slug === m.slug ? ' (suggested)' : ''}
                </option>
              ))}
            </select>
            {placeIn !== (suggested?.slug ?? '') && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2.5 py-1 text-[11px] font-semibold text-brand">
                <Icon name="pencil" className="h-3 w-3" />
                Changed from the suggestion
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-smoke">
            {suggested
              ? `Suggested from their country (${app.country}).`
              : `No market covers ${app.country || 'their country'}, so the suggestion is the worldwide community.`}
            {languageHints.length > 0 && (
              <> They also speak {languageHints.flatMap((h) => h.langs).join(' and ')}, so {languageHints.map((h) => h.market.name).join(' or ')} would work.</>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link to={`/profile/${app.id}`} className="btn-ghost !py-2 text-xs">Full profile</Link>
          {email && (
            <CopyButton value={email} label="Copy email address" className="!h-8 !w-8" />
          )}
          <Link to={`/messages?to=${app.id}`} className="btn-secondary !py-2 text-xs">Message</Link>
          <button onClick={onDecline} disabled={busy} className="btn-danger !py-2 text-xs">Decline</button>
          <button onClick={onApprove} disabled={busy} className="btn-primary inline-flex items-center gap-1.5 !py-2 text-xs">
            {busy ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="check" className="h-3.5 w-3.5" />}
            Approve
          </button>
        </div>
      </div>
    </div>
  )
}

function Fact({ label, value, copy }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className={cx('min-w-0 flex-1 truncate text-xs', value ? 'text-ink' : 'text-gray-300')}>
        {value || 'Not given'}
      </dd>
      {value && copy && <CopyButton value={copy} label={`Copy ${label.toLowerCase()}`} className="!h-5 !w-5 shrink-0" />}
    </div>
  )
}
