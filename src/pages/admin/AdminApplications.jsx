import { useEffect, useMemo, useState } from 'react'
import { confirm } from '../../lib/confirm'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Avatar, Badge, CopyButton, EmptyState, PageHeader, Skeleton, Spinner } from '../../components/ui'
import PhotoLightbox from '../../components/PhotoLightbox'
import { onboardingProgress } from '../../lib/onboardingProgress'
import Icon from '../../components/Icon'
import Reveal from '../../components/network/Reveal'
import SocialMark, { brandForUrl } from '../../components/SocialMark'
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
// THE LANGUAGE COLOURS ARE GONE (4 Sep 2026). Ethan: "I don't like how you
// added the colours to the languages - just put them back to the grey, I think
// they stand out enough now."
//
// He is right, and the reason is worth keeping: the ONE colour that carries
// meaning on that row is the brand highlight on a language pointing at another
// market. Six tinted chips compete with the single signal the section exists
// for, which is the opposite of standing out.

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
// A COLOUR PER LANGUAGE, SO A ROW OF THEM IS SCANNABLE.
//
// Ethan: "for the languages, it says speaks English and Hindi and Urdu - you
// could actually colour them in different colours so they stand out a bit more."
//
// Six identical grey chips is a list you have to READ; six coloured ones is a
// list you can compare across a page of applications, which is the actual job
// here now that languages help decide the market. The colour is derived from
// the language's own name rather than assigned, so a language nobody has
// listed yet still gets a stable one and this never needs maintaining.
//
// STAYS INSIDE A QUIET RANGE ON PURPOSE. These are `hsl` at low saturation and
// high lightness - tinted paper, not paint - because the house palette is
// white, ink and one orange, and a genuinely multicoloured row would fight
// everything else on the card. What varies is HUE, which is all the eye needs
// to tell two chips apart.
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
  // THE MARKETS each application will be approved INTO, keyed by creator, as an
  // ARRAY. Seeded from the suggestion and edited by the admin; an empty array
  // means the worldwide community only, which is a real answer rather than a
  // missing one. See migration 190 for why this is a list.
  const [placeIn, setPlaceIn] = useState({})
  // 'applied' - finished the form, waiting on a decision.
  // 'incomplete' - signed up and never finished. Nobody has anything to review
  //   here, so it is a separate list rather than a filter on the same one.
  const [bucket, setBucket] = useState('applied')
  const [zoom, setZoom] = useState(null)
  const markets = useMarkets()

  async function load() {
    // BOTH BUCKETS IN ONE QUERY. `status = 'pending'` is the whole queue;
    // `onboarded` is what splits it into "waiting on you" and "never finished".
    // Two queries would be two round trips for one list.
    const [{ data: profiles }, { data: emailRows }] = await Promise.all([
      supabase.from('profiles').select('*').eq('status', 'pending').is('deletion_requested_at', null)// NEWEST FIRST. Ethan: "it should be filtered by the most recent ones at the
      // top and the older ones at the bottom - that makes sense, not the other
      // way." It does: the queue is a to-do list, and somebody who applied this
      // morning is the one whose decision is still worth making quickly.
      .order('created_at', { ascending: false }),
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
      for (const a of apps) {
        if (next[a.id] !== undefined) continue
        next[a.id] = suggestion[a.id]?.slug ? [suggestion[a.id].slug] : []
      }
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
    const slugs = placeIn[app.id] ?? []
    const names = slugs.map((sl) => markets.find((m) => m.slug === sl)?.name ?? sl)
    const where = names.length
      ? names.slice(0, -1).concat(names.length > 1 ? [`and ${names[names.length - 1]}`] : names).join(names.length > 2 ? ', ' : ' ')
      : 'the worldwide community only'
    if (!await confirm(`Approve ${app.name} into ${where}?`)) return
    setBusyId(app.id)
    const { data, error } = await supabase.rpc('admin_approve_application', {
      target: app.id,
      // ALWAYS AN ARRAY, even when it holds one slug or none. The function
      // takes text[] now; sending a bare string would resolve to no overload
      // and fail at the wire rather than in a way anybody could read.
      p_market_slugs: slugs,
    })
    setBusyId(null)
    if (error) { flash(`Something went wrong: ${error.message}`); return }
    flash(`${app.name} approved into ${data?.summary ?? where}.`)
    setApps((prev) => prev.filter((a) => a.id !== app.id))
  }

  // DECLINING IS DELETING, AND THE CONFIRMATION SAYS SO.
  // `admin_decline_application` records the decision for the analytics and then
  // removes the account entirely - so this is the one irreversible control on
  // the page, and the word on the button is "Delete" rather than "Remove".
  async function decline(app) {
    const who = app.name?.trim() || 'this account'
    if (!await confirm(`Delete ${who}? This permanently removes the account and cannot be undone.`)) return
    setBusyId(app.id)
    const { error } = await supabase.rpc('admin_decline_application', { target: app.id })
    setBusyId(null)
    if (error) { flash(`Something went wrong: ${error.message}`); return }
    flash(`${who} deleted.`)
    setApps((prev) => prev.filter((a) => a.id !== app.id))
  }

  // MARKING A FOLLOW-UP, WHICH IS ALL WE CAN HONESTLY OFFER.
  //
  // Ethan: "we don't have email automation, so don't have a Send email button.
  // Just say follow-up email - whenever you click it, that means you've sent
  // it. Clicking it again means you haven't. It's just a mark so we know which
  // ones have got the follow-up email."
  //
  // It writes `profiles.followed_up_at` (migration 191), which is admin-only.
  // The row is updated in place rather than reloaded so the toggle is instant;
  // a rejected write puts it straight back, because a mark that silently did
  // not save is worse than no mark at all.
  async function toggleFollowUp(app) {
    const next = app.followed_up_at ? null : new Date().toISOString()
    setBusyId(app.id)
    setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, followed_up_at: next } : a)))
    const { error } = await supabase.from('profiles').update({ followed_up_at: next }).eq('id', app.id)
    setBusyId(null)
    if (error) {
      setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, followed_up_at: app.followed_up_at } : a)))
      flash(`Could not save that: ${error.message}`)
      return
    }
    flash(next ? `Marked as followed up.` : 'Follow-up mark removed.')
  }

  const inThisBucket = useMemo(
    () => (apps ?? []).filter((a) => (bucket === 'applied' ? !!a.onboarded : !a.onboarded)),
    [apps, bucket],
  )

  const tabs = useMemo(() => {
    const tally = {}
    for (const m of markets ?? []) if (m?.name && m.kind === 'chapter') tally[m.name] = 0
    for (const a of inThisBucket) tally[marketLabel(a)] = (tally[marketLabel(a)] ?? 0) + 1
    return Object.entries(tally).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inThisBucket, suggestion, markets])

  const counts = useMemo(() => ({
    applied: (apps ?? []).filter((a) => a.onboarded).length,
    incomplete: (apps ?? []).filter((a) => !a.onboarded).length,
  }), [apps])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (apps ?? []).filter((a) => {
      if (bucket === 'applied' ? !a.onboarded : a.onboarded) return false
      if (market && marketLabel(a) !== market) return false
      if (!q) return true
      return `${a.name} ${a.country ?? ''} ${a.city ?? ''} ${(a.languages ?? []).join(' ')} ${emails[a.id] ?? ''}`
        .toLowerCase().includes(q)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps, search, market, suggestion, emails, bucket])

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
        subtitle={counts.applied ? `${counts.applied} ${counts.applied === 1 ? 'person is' : 'people are'} waiting on a decision.` : undefined}
      />

      {/* TWO LISTS, NOT ONE LIST WITH A FILTER (4 Sep 2026).
          Ethan: "the creators that partly signed up should not be showing in
          Creators. The only ones there should be creators actually accepted
          into the community. For the ones that partly signed up, I want them on
          the applications thing - a separate section where market managers can
          review it and maybe reach out to them."

          They are two different jobs and they take two different actions.
          Somebody who finished the form is waiting on a DECISION; somebody who
          did not is waiting on nothing at all, and the only useful thing an
          admin can do is reach them. Approving or declining an unfinished
          application is not a thing that means anything, so those buttons are
          not on those cards. */}
      {apps !== null && (counts.applied > 0 || counts.incomplete > 0) && (
        <div className="mb-6 flex gap-2 rounded-full bg-cloud p-1">
          {[
            ['applied', 'Waiting on you', counts.applied],
            ['incomplete', 'Never finished', counts.incomplete],
          ].map(([key, label, n]) => (
            <button
              key={key}
              type="button"
              onClick={() => { setBucket(key); setMarket(''); setOpenId(null) }}
              aria-pressed={bucket === key}
              className={cx(
                'flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-200',
                bucket === key ? 'bg-white text-ink shadow-card' : 'text-smoke hover:text-ink',
              )}
            >
              {label}
              <span className={cx('ml-1.5 tabular-nums', bucket === key ? 'text-brand' : 'text-gray-400')}>{n}</span>
            </button>
          ))}
        </div>
      )}

      {apps !== null && shown.length + (search ? 1 : 0) > 0 && bucket === 'applied' && (
        <div className="mb-6 space-y-3">
          {tabs.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {[['', 'All', inThisBucket.length], ...tabs.map(([m, n]) => [m, m, n])].map(([key, label, count]) => {
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
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<Icon name="check" className="h-7 w-7" />}
          title={bucket === 'applied' ? 'No applications waiting' : 'Nobody is halfway through'}
          hint={bucket === 'applied'
            ? "When a new creator finishes their profile, they'll appear here for review."
            : 'Anybody who signs up and stops before the end will show here, with the screen they stopped on.'}
        />
      ) : (
        <Reveal className="space-y-5" stagger={0.05}>
          {shown.map((a) => (
            bucket === 'applied' ? (
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
                placeIn={placeIn[a.id] ?? []}
                onPlaceIn={(slugs) => setPlaceIn((p) => ({ ...p, [a.id]: slugs }))}
                open={openId === a.id}
                onToggle={() => setOpenId((v) => (v === a.id ? null : a.id))}
                busy={busyId === a.id}
                onApprove={() => approve(a)}
                onDecline={() => decline(a)}
                onZoom={() => a.photo_url && setZoom({ src: a.photo_url, alt: a.name })}
              />
            ) : (
              <UnfinishedCard
                key={a.id}
                app={a}
                email={emails[a.id]}
                phone={phones[a.id]}
                onFollowUp={() => toggleFollowUp(a)}
                onDecline={() => decline(a)}
                busy={busyId === a.id}
                onZoom={() => a.photo_url && setZoom({ src: a.photo_url, alt: a.name })}
              />
            )
          ))}
        </Reveal>
      )}

      {/* THE FACE OPENS FULL SIZE. Ethan: "clicking on the profile picture
          should zoom it up, but it doesn't." A profile photo is one of the two
          things an admin is actually judging on this page, and it was drawn at
          56px with no way to see it bigger. PhotoLightbox is the app's own
          viewer - pinch, wheel, double-tap, drag - and it is already what a
          photograph opens into everywhere else. */}
      {zoom && (
        <PhotoLightbox src={zoom.src} alt={zoom.alt} shape="circle" onClose={() => setZoom(null)} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------- card

// THE "WHAT IS MISSING" CHIPS ARE GONE (4 Sep 2026). Ethan: "the very short
// bio pointer - actually, I don't think we need any of those pointers at all.
// You can just remove them, because obviously we can see it ourselves. And we
// want to make this card more compact and simple."
//
// He is right, and `gapsIn` was solving a problem the card no longer has: the
// bio, the links, the photo and the languages are all ON the card, so a second
// row of chips saying "no links" under a row that visibly has no links is the
// page explaining itself to somebody who can already see.

function ApplicationCard({
  app, email, phone, photos, links, suggested, languageHints, markets,
  placeIn, onPlaceIn, open, onToggle, busy, onApprove, onDecline, onZoom,
}) {
  // `profiles.dob` IS NULL ON EVERY ROW AND ALWAYS WILL BE - a BEFORE trigger
  // (mirror_dob_to_private) moves it into creator_private and derives
  // `profiles.age` from it. Reading dob here printed no age for anybody.
  const age = app.age ?? ageFromDob(app.dob)
  // Suggested first, the rest in their given order.
  const orderedMarkets = suggested
    ? [...markets].sort((a, b) => (a.slug === suggested.slug ? -1 : b.slug === suggested.slug ? 1 : 0))
    : markets
  const bucketList = (Array.isArray(app.bucket_list) ? app.bucket_list : [])
    .map((b) => (typeof b === 'string' ? b : [b?.city, b?.country].filter(Boolean).join(', ')))
    .filter(Boolean)

  return (
    <div className="card !p-0 overflow-hidden transition-all duration-200 hover:shadow-lift">
      {/* ------------------------------------------------------- the summary */}
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:p-6">
        {/* The face is a button when there is a photo to open, and a plain
            avatar when there is not - a control that does nothing when pressed
            is worse than no control. */}
        {app.photo_url ? (
          <button
            type="button"
            onClick={onZoom}
            aria-label={`See ${app.name}'s photo full size`}
            className="shrink-0 rounded-full transition-transform duration-200 hoverable:hover:scale-105"
          >
            <Avatar src={app.photo_url} name={app.name} size="lg" />
          </button>
        ) : (
          <Avatar src={app.photo_url} name={app.name} size="lg" />
        )}
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
              return (
                /* THE REAL LOGO, AS A SOLID TILE. An 12px outline glyph in the
                   platform's colour is a grey blob with a tint - see the note
                   on SocialMark's `tile`. At 18px, filled, it is unmistakable. */
                <a
                  key={l.label + l.url}
                  href={/^https?:\/\//i.test(l.url) ? l.url : `https://${l.url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white py-1 pl-1.5 pr-3 text-xs font-semibold text-ink transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand hoverable:hover:shadow-card"
                >
                  <SocialMark brand={brand} tile className="h-[18px] w-[18px]" />
                  {/* No "opens in a new tab" glyph. Ethan: "there's no need to
                      have that full screen icon, I already know clicking the
                      link is gonna open it." */}
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
                  /* A market-relevant language keeps the BRAND, because that
                     is a signal about THIS decision. Everything else is the
                     ordinary grey chip - see the note at the top of the file
                     for why colouring them all was a step backwards. */
                  <span
                    key={l}
                    className={cx(
                      'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                      hit ? 'bg-brand text-white' : 'bg-cloud text-smoke',
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
          {/* NO COPY ICONS ON THESE ROWS, AND NO TIMEZONE (4 Sep 2026).
              Ethan: "the copy icon doesn't even show what it's copying - it
              turns out it's copying the email, but it's not clear. We just need
              the copy buttons off that detail section." A bare icon at the end
              of a row is a control with no label, and there were four of them
              doing four different things. The one copy that is actually wanted
              is on the decision bar, where it says the word Email on it.

              And: "I don't get why it's showing his timezone - it doesn't even
              ask for the timezone, you just take it automatically." Right on
              both counts. It is taken from the browser at submit, so it is
              never a fact about the applicant that an admin is judging, and
              printing "Not given" for it on an older row invents a gap that
              does not exist. Gone. */}
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <Fact label="Email" value={email} copy />
            <Fact label="Phone" value={phone} copy />
            <Fact label="Countries visited" value={app.countries_visited?.length ? `${app.countries_visited.length}` : null} />
            <Fact label="Bucket list" value={bucketList.slice(0, 3).join(' · ')} />
            <Fact label="Travel photos" value={photos.length ? `${photos.length}` : null} />
          </dl>
        </div>
      )}

      {/* ------------------------------------------------------- the decision */}
      <div className="border-t border-gray-100 bg-white px-5 py-4 sm:px-6">
        {/* THE MARKET IS CHOSEN WITH CHIPS, AND YOU CAN PICK SEVERAL.
            (4 Sep 2026.)

            Ethan: "if I click on this button it shows up the weird OS dropdown.
            Remember I told you all buttons need to match the platform style."
            And: "I seem to be unable to choose multiple ones, which I want to
            be able to do - like UK & Ireland and Spain."

            Both are answered by the same control. A native `<select>` renders
            the operating system's own picker - a grey iOS wheel on a phone,
            nothing like anything else in this product - and it cannot express
            more than one answer at all. Toggle chips are what this platform
            already uses everywhere a set is chosen, they are SOLID BRAND when
            picked (never a tint - that rule is written down twice), and picking
            two is just pressing two.

            The first one picked is the creator's HOME market; the rest are
            ordinary memberships. That is said on screen rather than implied,
            because it decides which hub they land on. */}
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Approve into</p>
        {/* THE SUGGESTED ONE IS ALWAYS FIRST (4 Sep 2026). Ethan: "it should
            always show the very first one as whatever the suggested one is, on
            the very left, and then I can click the other ones if I want."
            It was alphabetical, so the market the page is recommending could
            be the sixth chip along - which makes the recommendation something
            you have to hunt for, and makes the row's first item look like the
            default when it is not. */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {orderedMarkets.map((m) => {
            const on = placeIn.includes(m.slug)
            const isSuggested = suggested?.slug === m.slug
            return (
              <button
                key={m.slug}
                type="button"
                aria-pressed={on}
                onClick={() => onPlaceIn(on ? placeIn.filter((x) => x !== m.slug) : [...placeIn, m.slug])}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200',
                  on
                    ? 'border-brand bg-brand text-white shadow-card'
                    : 'border-gray-200 bg-white text-smoke hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand hoverable:hover:text-brand',
                )}
              >
                {on && <Icon name="check" className="h-3 w-3" />}
                {m.name}
                {isSuggested && (
                  <span className={cx('text-[10px] font-medium', on ? 'text-white/75' : 'text-gray-400')}>
                    suggested
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-smoke">
          {placeIn.length === 0
            ? 'Nothing picked, so they join the worldwide community only.'
            : placeIn.length === 1
              ? `Their home market will be ${markets.find((m) => m.slug === placeIn[0])?.name ?? placeIn[0]}.`
              : `Home market: ${markets.find((m) => m.slug === placeIn[0])?.name ?? placeIn[0]}. They will also be in ${placeIn.length - 1} other${placeIn.length > 2 ? 's' : ''}.`}
          {' '}
          {suggested
            ? `Suggested from their country (${app.country}).`
            : `No market covers ${app.country || 'their country'}.`}
          {languageHints.length > 0 && (
            <> They speak {languageHints.flatMap((h) => h.langs).join(' and ')}, so {languageHints.map((h) => h.market.name).join(' or ')} would work too.</>
          )}
        </p>

        {/* EVERY CONTROL LOOKS LIKE A CONTROL, AND THE ONE THAT IS NOT USEFUL
            IS GONE. Ethan: "the Full profile button looks like it's not even a
            button" - it was `btn-ghost`, which is text with padding - and "I
            don't get the Message button, because obviously we can't message
            them before they're accepted in." He is right: a DM needs a
            conversation between two members, and this person is not one yet. */}
        {/* NO COPY ICON HERE. Ethan: "we still have that copy button beside
            Full profile, which I said we don't need. The only place we need it
            is beside their email and the phone number that shows up when you
            open the details." An unlabelled icon in a row of labelled buttons
            is the one control nobody can predict. It lives on the two rows it
            is about now - see `Fact`. */}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Link to={`/profile/${app.id}`} className="btn-secondary !py-2 text-xs">Full profile</Link>
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

// SOMEBODY WHO STARTED AND STOPPED.
//
// There is nothing to approve here - they have not asked for anything yet - so
// this card answers a different question: how far did they get, and how do we
// reach them. `onboardingProgress` derives the step from the columns the flow
// fills in, in the order it asks for them.
function UnfinishedCard({ app, email, phone, onFollowUp, onDecline, busy, onZoom }) {
  const progress = onboardingProgress(app, phone ? { phone } : null)
  return (
    <div className="card !p-0 overflow-hidden transition-all duration-200 hoverable:hover:shadow-lift">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:p-6">
        {app.photo_url ? (
          <button type="button" onClick={onZoom} aria-label={`See ${app.name}'s photo full size`}
            className="shrink-0 rounded-full transition-transform duration-200 hoverable:hover:scale-105">
            <Avatar src={app.photo_url} name={app.name} size="lg" />
          </button>
        ) : <Avatar src={app.photo_url} name={app.name} size="lg" />}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="text-lg font-bold">{app.name?.trim() || 'No name yet'}</h2>
            {app.followed_up_at
              ? <Badge tone="green">Followed up {timeAgo(app.followed_up_at)}</Badge>
              : <Badge tone="grey">Never finished</Badge>}
          </div>
          <p className="text-sm text-smoke">
            {[app.city, app.country].filter(Boolean).join(', ') || 'No location given'}
          </p>
          <p className="mt-1 text-sm font-medium text-ink">{progress.summary}</p>

          {/* THE STEPS, AS A ROW OF TICKS. A percentage says how much; this
              says WHICH, which is the thing somebody writing them a message
              actually needs. */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {progress.steps.map((st) => (
              <span
                key={st.key}
                className={cx(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                  st.done ? 'bg-green-50 text-green-700' : 'bg-cloud text-gray-400',
                )}
              >
                {st.done && <Icon name="check" className="h-2.5 w-2.5" />}
                {st.label}
              </span>
            ))}
          </div>
        </div>

        <div className="shrink-0 text-left sm:text-right">
          <p className="text-sm font-bold tabular-nums text-brand">{progress.done}/{progress.total}</p>
          <p className="text-xs text-gray-400">Signed up {timeAgo(app.created_at)}</p>
          <p className="text-[11px] text-gray-300">{formatDate(app.created_at)}</p>
        </div>
      </div>

      <div className="space-y-3 border-t border-gray-100 px-5 py-4 sm:px-6">
        {/* THE COPY ICONS SIT BESIDE WHAT THEY COPY. Ethan: "the icons should be
            beside their email, not way over on the right beside Full profile."
            An icon is only readable from what it is next to. */}
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xs text-smoke">{email || 'No email on file'}</span>
          {email && <CopyButton value={email} label="Copy email address" className="!h-6 !w-6 shrink-0" />}
        </div>
        {phone && (
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs text-smoke">{phone}</span>
            <CopyButton value={phone} label="Copy phone number" className="!h-6 !w-6 shrink-0" />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <Link to={`/profile/${app.id}`} className="btn-secondary !py-2 text-xs">Full profile</Link>
          {/* DELETE, NOT "REMOVE". Ethan: "rather than the Remove, it should be
              a Delete button to actually delete the creator permanently."
              It always did delete permanently - `admin_decline_application`
              records the decision and then removes the account - so "Remove"
              was the softer of two words for the same irreversible thing. */}
          <button onClick={onDecline} disabled={busy} className="btn-danger !py-2 text-xs">Delete</button>
          {/* A MARK, NOT A SEND. There is no email automation - all outbound
              mail is paused - so a "Send" button would either lie or queue
              something nobody receives. A manager writes the mail from their
              own mailbox and ticks it here, and the next manager can see it has
              been done. Pressing it again un-ticks it. */}
          <button
            onClick={onFollowUp}
            disabled={busy}
            className={cx(
              'inline-flex items-center gap-1.5 !py-2 text-xs',
              app.followed_up_at ? 'btn-secondary' : 'btn-primary',
            )}
          >
            {busy ? <Spinner className="h-3.5 w-3.5" />
              : <Icon name={app.followed_up_at ? 'check' : 'envelope'} className="h-3.5 w-3.5" />}
            {app.followed_up_at ? 'Followed up' : 'Follow-up email'}
          </button>
        </div>
      </div>
    </div>
  )
}

// `copy` puts a copy control on the row - and ONLY the two rows that carry
// something worth copying get one, so the icon always means the thing next to
// it. That is the whole difference from the unlabelled button that used to sit
// in the actions row meaning "the email", which nobody could have guessed.
function Fact({ label, value, copy = false }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className={cx('min-w-0 flex-1 truncate text-xs', value ? 'select-all text-ink' : 'text-gray-300')}>
        {value || 'Not given'}
      </dd>
      {copy && value && (
        <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} className="!h-5 !w-5 shrink-0" />
      )}
    </div>
  )
}
