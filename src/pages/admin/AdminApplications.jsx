import { useEffect, useMemo, useRef, useState } from 'react'
import { confirm } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
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
import { copyToClipboard, emailList } from '../../lib/clipboard'

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

// WHEN AN APPLICATION ARRIVED, WHICH IS NOT WHEN ITS ACCOUNT WAS MADE.
//
// Ethan: "when someone partly applied and then later completes it, after a few
// days their application should show as new, not signed up 5 days ago. It would
// make more sense this way because it's when they officially submitted their
// application."
//
// `created_at` is the moment somebody pressed Sign up; `submitted_at`
// (migration 218) is the moment they finished the form. For anybody who started
// and came back those are different days, and this queue is sorted and labelled
// by the wrong one - so an application that landed twenty minutes ago sat at
// the bottom of a newest-first list under "Applied 6 days ago".
//
// THE COALESCE IS NOT DEFENSIVE PADDING, IT IS THE BACKFILL. Every row that had
// already finished when 218 ran has no honest submission time - the moment was
// never recorded anywhere - so it keeps its signup date and renders through the
// same path. It is also what makes this file correct on an origin where 218 has
// not been applied yet.
const appliedAt = (app) => app?.submitted_at || app?.created_at

// How many whole days somebody sat on a half-finished form. Only used to decide
// whether the signup date is worth printing as well.
function gapDays(app) {
  if (!app?.submitted_at || !app?.created_at) return 0
  return Math.floor((new Date(app.submitted_at) - new Date(app.created_at)) / 86400000)
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
  // The thumbnail that was pressed, so the photo grows out of it (PhotoLightbox).
  const zoomFrom = useRef(null)
  // THE SELECTION, AND THE BULK RUN.
  // `picked` is a Set of creator ids. `running` is what a batch is doing right
  // now, so the bar can say "Approving 3 of 12" rather than freezing.
  const [picked, setPicked] = useState(() => new Set())
  const [running, setRunning] = useState(null)
  // 'Never finished' gets a filter of its own: after a follow-up round, the
  // only list worth looking at is the people who have not had one.
  const [onlyUnfollowed, setOnlyUnfollowed] = useState(false)
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

  // ONE TOAST HOST FOR THE WHOLE APP, AND THIS PAGE HAD ITS OWN (4 Sep 2026).
  //
  // Ethan, on a phone: "in the applications admin page, go to never finished
  // and click follow-up email - it shows a little pop up saying marked as
  // followed up, but this pop up is hidden behind the bar at the bottom where
  // the challenges and rooms show."
  //
  // He is describing a hand-rolled `fixed bottom-24` pill that predated
  // `ToastHost` and never learned two things that host already knows: the tab
  // bar is ~56px PLUS `env(safe-area-inset-bottom)`, which on an iPhone puts
  // its top edge at about 90px and leaves a 96px offset overlapping it; and a
  // `fixed` element inside a transformed ancestor is positioned against that
  // ancestor rather than the viewport, so the z-index was never the fix.
  // Deleted rather than nudged - the shared toast is above the bar, above the
  // safe area, dismissible, and identical to every other confirmation.
  const flash = (msg) => toastSuccess(msg)

  // NOBODY APPLIES TO A MARKET, SO THE PAGE HAS TO WORK IT OUT.
  //
  // A creator gives us a country, and every open market owns a set of country
  // codes that do not overlap - so their market is a strong SUGGESTION. It is
  // not a fact, which is the change: an admin can disagree with it, and the
  // most common reason to is the language they speak.
  //
  // AND WHEN THE COUNTRY POINTS AT NOTHING, THE LANGUAGE DOES (8 Sep 2026).
  //
  // Ethan: "currently you have one line that shows this - 'big German'. If
  // someone is just put into the worldwide community only, and let's say
  // they're from Austria but they speak German, whenever it shows up in the
  // admin panel the suggestion should be the German community, and then a
  // little line below saying 'because they speak German'. Obviously an admin
  // can then change this, but it's just making it more clear, because it's easy
  // to miss."
  //
  // He is describing exactly the case the country test cannot see. Austria is
  // not in the German market's country codes and probably should not be, so
  // `resolveMarketForCountryName` correctly returns nothing and the picker
  // seeded EMPTY - which means the default action for an Austrian applicant was
  // "worldwide only", and the German market they would obviously belong in was
  // one unhighlighted chip among six. The information was on the page; it was in
  // the last clause of a grey paragraph under the chips, which is where a busy
  // reviewer's eye does not go.
  //
  // So the language is now a real fallback rather than a footnote: country
  // first, because a market is defined by its countries and that is the
  // stronger signal; language when the country resolves to nothing at all.
  // It never overrides a country match, and it is still only a suggestion - the
  // chips are unchanged and one press disagrees with it.
  //
  // MOST MATCHES WINS, THEN ALPHABETICAL. Somebody who speaks Portuguese and
  // Spanish matches two markets, and picking whichever the array happened to
  // hold first would make the suggestion depend on row order in `communities`.
  // A tie broken by name is arbitrary but STABLE, which is the property that
  // matters: the same application suggests the same market every time it is
  // opened.
  const suggestion = useMemo(() => {
    const out = {}
    const chapters = (markets ?? []).filter((m) => m.kind === 'chapter' && m.is_active)
    for (const a of apps ?? []) {
      const r = resolveMarketForCountryName(a.country, markets)
      if (r.market) { out[a.id] = { market: r.market, why: 'country', langs: [] }; continue }

      const spoken = new Set((a.languages ?? []).map((l) => String(l).toLowerCase()))
      const byLanguage = chapters
        .map((m) => ({ market: m, langs: marketLanguages(m).filter((l) => spoken.has(l.toLowerCase())) }))
        .filter((x) => x.langs.length > 0)
        .sort((x, y) => y.langs.length - x.langs.length || x.market.name.localeCompare(y.market.name))
      out[a.id] = byLanguage.length
        ? { market: byLanguage[0].market, why: 'language', langs: byLanguage[0].langs }
        : null
    }
    return out
  }, [apps, markets])

  const marketLabel = (a) => suggestion[a.id]?.market?.name ?? 'Worldwide'

  // Seed each card's picker from its suggestion, once the markets have loaded.
  // Not in the render, and not overwriting a choice already made.
  useEffect(() => {
    if (!apps?.length || !markets?.length) return
    setPlaceIn((prev) => {
      const next = { ...prev }
      for (const a of apps) {
        if (next[a.id] !== undefined) continue
        next[a.id] = suggestion[a.id]?.market?.slug ? [suggestion[a.id].market.slug] : []
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
      .filter((m) => m.kind === 'chapter' && m.is_active && m.slug !== suggestion[a.id]?.market?.slug)
      .map((m) => ({ market: m, langs: marketLanguages(m).filter((l) => spoken.has(l.toLowerCase())) }))
      .filter((x) => x.langs.length > 0)
  }

  // WHICH LANGUAGE CHIPS GO ORANGE, AND WHY THE OLD ANSWER LOOKED BROKEN.
  //
  // Ethan, 16 Sep 2026: "for the languages sometimes it shows them grey and
  // sometimes in orange, it's weird, I don't understand why - like they speak
  // Spanish and Portuguese and live in Spain but the Portuguese is the language
  // highlighted."
  //
  // That is exactly what the code did, and it is indefensible from the outside.
  // The highlight was driven by `languageMatches`, which exists to answer a
  // narrow question - "does a language point at a market OTHER than the one we
  // are already suggesting" - and so it deliberately EXCLUDES the suggested
  // market. For a Spaniard who speaks both, Spain is the suggestion, so Spanish
  // was struck out of the list and Portuguese was the only thing left to light
  // up. The colour was answering a question nobody had asked, and it read as a
  // bug because it behaves like one.
  //
  // The rule is now the one a reader would guess: a chip is orange when that
  // language is spoken in ANY of our markets. It means "this language matters
  // here", which is a stable fact about the language rather than a side effect
  // of which market we happened to suggest, and the two of them can now be
  // orange together. English stays grey - it is the programme's working
  // language and the assumed baseline, so a highlight that fires for everybody
  // would tell an admin nothing.
  const marketLanguageSet = useMemo(() => {
    const set = new Set()
    for (const m of markets ?? []) {
      if (m.kind !== 'chapter' || !m.is_active) continue
      for (const l of marketLanguages(m)) set.add(l.toLowerCase())
    }
    return set
  }, [markets])

  // Which markets a given language is lived in, so the chip can say so.
  const marketsSpeaking = (lang) => (markets ?? [])
    .filter((m) => m.kind === 'chapter' && m.is_active
      && marketLanguages(m).some((l) => l.toLowerCase() === String(lang).toLowerCase()))
    .map((m) => m.name)

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

  // ---------------------------------------------------------------- in bulk
  //
  // Ethan, 16 Sep 2026: "I want to be able to copy the email from each one
  // easier, not having to click to see more, and I want actions at the very top
  // where I can do everything like copy all emails of the current applicants,
  // or accept all at once, just to speed things up."
  //
  // WHAT THE BAR ACTS ON. Nothing ticked means the bar acts on everything
  // CURRENTLY SHOWN - which is the list after the market chips and the search
  // box, so "copy all emails" while Spain is selected copies Spain's. Tick
  // anybody and it acts on the ticked ones instead. That rule is printed on the
  // bar rather than left to be discovered, because "all" is a dangerous word to
  // guess at next to a button that approves people.
  //
  // WHY THE BATCH IS SEQUENTIAL. `admin_approve_application` writes memberships
  // and a decision row per creator; firing fifteen at once is fifteen
  // concurrent transactions against the same two tables for no wall-clock gain
  // worth having on a list this size. One at a time also means a failure
  // half-way is legible - the ones before it are approved, the rest are not,
  // and the toast says how many.
  const targets = () => (picked.size ? shown.filter((a) => picked.has(a.id)) : shown)

  const toggleAll = () => {
    setPicked((prev) => (prev.size >= shown.length && shown.every((a) => prev.has(a.id))
      ? new Set()
      : new Set(shown.map((a) => a.id))))
  }
  const togglePick = (id) => setPicked((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  async function copyEmails(list) {
    const missing = list.filter((a) => !emails[a.id]).length
    const text = emailList(list.map((a) => emails[a.id]))
    if (!text) { flash('No email addresses to copy.'); return }
    const n = text.split(', ').length
    if (!await copyToClipboard(text)) { flash('Could not reach the clipboard.'); return }
    flash(`${n} ${n === 1 ? 'address' : 'addresses'} copied${missing ? `, ${missing} had none on file` : ''}.`)
  }

  async function approveMany(list) {
    if (!list.length) return
    // THE MARKETS HAVE TO HAVE LOADED FIRST. Each card's picker is seeded from
    // its suggestion in an effect that waits for `markets`, so approving before
    // that lands would put everybody into the worldwide community only - a
    // silent wrong answer on an irreversible action, which is the worst kind.
    if (!markets?.length) { flash('Still loading the markets - try again in a second.'); return }
    const names = list.length === 1 ? list[0].name : `${list.length} applications`
    if (!await confirm(
      `Approve ${names}? Each one goes into the market picked on its own card - ` +
      'the suggestion unless you changed it. This cannot be undone.',
    )) return
    let done = 0
    const failed = []
    for (const app of list) {
      setRunning({ verb: 'Approving', done, total: list.length })
      const { error } = await supabase.rpc('admin_approve_application', {
        target: app.id,
        p_market_slugs: placeIn[app.id] ?? [],
      })
      if (error) failed.push(app.name)
      else done++
    }
    setRunning(null)
    setApps((prev) => prev.filter((a) => !list.some((x) => x.id === a.id && !failed.includes(x.name))))
    setPicked(new Set())
    flash(failed.length
      ? `${done} approved, ${failed.length} failed (${failed.slice(0, 3).join(', ')}).`
      : `${done} ${done === 1 ? 'creator' : 'creators'} approved.`)
  }

  async function markManyFollowedUp(list, value) {
    const ids = list.filter((a) => (value ? !a.followed_up_at : !!a.followed_up_at)).map((a) => a.id)
    if (!ids.length) { flash(value ? 'They are all marked already.' : 'None of them are marked.'); return }
    const stamp = value ? new Date().toISOString() : null
    setRunning({ verb: 'Marking', done: 0, total: ids.length })
    const { error } = await supabase.from('profiles').update({ followed_up_at: stamp }).in('id', ids)
    setRunning(null)
    if (error) { flash(`Could not save that: ${error.message}`); return }
    setApps((prev) => prev.map((a) => (ids.includes(a.id) ? { ...a, followed_up_at: stamp } : a)))
    setPicked(new Set())
    flash(value ? `${ids.length} marked as followed up.` : `${ids.length} marks removed.`)
  }

  // NEWEST FIRST BY WHEN IT WAS SUBMITTED.
  //
  // The query orders by `created_at`, which is right for the "never finished"
  // bucket - nothing has been submitted there, so the signup IS the event - and
  // wrong for this one. Somebody who signed up last Tuesday and finished the
  // form this morning belongs at the top of the queue, and was landing six rows
  // down. Re-sorting here rather than in the query because one query fills both
  // buckets and they want different orders; the list is a page of applications,
  // not a table of thousands.
  const inThisBucket = useMemo(() => {
    const list = (apps ?? []).filter((a) => (bucket === 'applied' ? !!a.onboarded : !a.onboarded))
    if (bucket !== 'applied') return onlyUnfollowed ? list.filter((a) => !a.followed_up_at) : list
    return [...list].sort((a, b) => new Date(appliedAt(b)) - new Date(appliedAt(a)))
  }, [apps, bucket, onlyUnfollowed])

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

  // OFF `inThisBucket`, NOT OFF `apps`. It used to re-derive the bucket here,
  // which meant the submission-date ordering above applied to the tab COUNTS
  // and not to the list anybody actually reads.
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return inThisBucket.filter((a) => {
      if (market && marketLabel(a) !== market) return false
      if (!q) return true
      return `${a.name} ${a.country ?? ''} ${a.city ?? ''} ${(a.languages ?? []).join(' ')} ${emails[a.id] ?? ''}`
        .toLowerCase().includes(q)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inThisBucket, search, market, suggestion, emails])

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
              onClick={() => { setBucket(key); setMarket(''); setOpenId(null); setPicked(new Set()) }}
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

      {apps !== null && (shown.length > 0 || search || onlyUnfollowed) && (
        <div className="mb-6 space-y-3">
          {/* ON A PHONE, ONE LINE THAT SCROLLS SIDEWAYS (21 Sep 2026). Seven
              market chips wrapped into three ragged rows above everything
              else; Ethan: "all those different functions and filters look okay
              on desktop, but they're all crammed in on mobile." */}
          {bucket === 'applied' && tabs.length > 0 && (
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
              {[['', 'All', inThisBucket.length], ...tabs.map(([m, n]) => [m, m, n])].map(([key, label, count]) => {
                const on = market === key
                return (
                  <button
                    key={key || 'all'}
                    type="button"
                    onClick={() => { setMarket(key); setPicked(new Set()) }}
                    aria-pressed={on}
                    className={cx(
                      'inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200',
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

          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <input
              type="search"
              className="input sm:max-w-xs"
              placeholder={bucket === 'applied'
                ? 'Search name, country, language or email…'
                : 'Search name, country or email…'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search applications"
            />
            <div className="flex items-center justify-between gap-3 sm:contents">
            {bucket === 'incomplete' && (
              /* AFTER A ROUND OF FOLLOW-UPS, THE ONLY LIST THAT MATTERS IS THE
                 ONES WHO HAVE NOT HAD ONE. The mark was already recorded per
                 person and there was no way to see it as a list. */
              <button
                type="button"
                onClick={() => { setOnlyUnfollowed((v) => !v); setPicked(new Set()) }}
                aria-pressed={onlyUnfollowed}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200',
                  onlyUnfollowed
                    ? 'border-brand bg-brand text-white'
                    : 'border-gray-200 bg-white text-smoke hover:border-brand hover:text-brand',
                )}
              >
                {onlyUnfollowed && <Icon name="check" className="h-3 w-3" />}
                Not followed up yet
              </button>
            )}
            <span className="text-xs text-smoke">{shown.length} shown</span>
            </div>
          </div>

          {/* ------------------------------------------------- the bulk bar */}
          {shown.length > 0 && (
            <div className="sticky top-2 z-20 rounded-card border border-gray-100 bg-white/95 p-3 shadow-card backdrop-blur supports-[backdrop-filter]:bg-white/80">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                <div className="flex min-w-0 items-center gap-2 sm:mr-auto">
                {/* THE TICK-ALL IS THE FIRST THING IN THE BAR, because every
                    other control in it reads "the ticked ones, or everything
                    shown if nothing is ticked" and that sentence has to be
                    discoverable from the bar itself. */}
                <button
                  type="button"
                  onClick={toggleAll}
                  aria-pressed={picked.size > 0}
                  className={cx(
                    'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200',
                    picked.size
                      ? 'border-brand bg-brand-tint text-brand'
                      : 'border-gray-200 bg-white text-smoke hover:border-brand hover:text-brand',
                  )}
                >
                  <span className={cx(
                    'flex h-4 w-4 items-center justify-center rounded border',
                    picked.size ? 'border-brand bg-brand text-white' : 'border-gray-300',
                  )}>
                    {picked.size > 0 && <Icon name="check" className="h-2.5 w-2.5" />}
                  </span>
                  {picked.size ? `${picked.size} selected` : 'Select all'}
                </button>

                <span className="min-w-0 text-[11px] leading-tight text-gray-400">
                  {picked.size
                    ? 'Actions apply to the selected.'
                    : `Actions apply to all ${shown.length} shown.`}
                </span>
                </div>

                {running && (
                  <span className="inline-flex items-center gap-2 text-xs font-semibold text-brand">
                    <Spinner className="h-3.5 w-3.5" />
                    {running.verb} {running.done + 1} of {running.total}
                  </span>
                )}

                {/* A phone gets a two-column grid with the main action across
                    the full width under it; a desktop keeps the one row. */}
                <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                <button
                  type="button"
                  onClick={() => copyEmails(targets())}
                  disabled={!!running}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-smoke transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:text-brand disabled:opacity-50 sm:py-1.5"
                >
                  <Icon name="copy" className="h-3.5 w-3.5" />
                  Copy {picked.size ? `${picked.size}` : 'all'} email{(picked.size || shown.length) === 1 ? '' : 's'}
                </button>

                {bucket === 'applied' ? (
                  <button
                    type="button"
                    onClick={() => approveMany(targets())}
                    disabled={!!running || !markets?.length}
                    className="btn-primary inline-flex items-center justify-center gap-1.5 !py-2 text-xs disabled:opacity-50 sm:!py-1.5"
                  >
                    <Icon name="check" className="h-3.5 w-3.5" />
                    Approve {picked.size || shown.length}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => markManyFollowedUp(targets(), false)}
                      disabled={!!running}
                      className="inline-flex items-center justify-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-smoke transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:text-brand disabled:opacity-50 sm:py-1.5"
                    >
                      <Icon name="close" className="h-3.5 w-3.5" />
                      Unmark
                    </button>
                    <button
                      type="button"
                      onClick={() => markManyFollowedUp(targets(), true)}
                      disabled={!!running}
                      className="btn-primary col-span-2 inline-flex items-center justify-center gap-1.5 !py-2 text-xs disabled:opacity-50 sm:!py-1.5"
                    >
                      <Icon name="envelope" className="h-3.5 w-3.5" />
                      Mark {picked.size || shown.length} followed up
                    </button>
                  </>
                )}
                </div>
              </div>
            </div>
          )}
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
                marketLanguages={marketLanguageSet}
                marketsSpeaking={marketsSpeaking}
                markets={(markets ?? []).filter((m) => m.kind === 'chapter' && m.is_active)}
                placeIn={placeIn[a.id] ?? []}
                onPlaceIn={(slugs) => setPlaceIn((p) => ({ ...p, [a.id]: slugs }))}
                open={openId === a.id}
                onToggle={() => setOpenId((v) => (v === a.id ? null : a.id))}
                busy={busyId === a.id}
                onApprove={() => approve(a)}
                onDecline={() => decline(a)}
                onZoom={(e) => { if (!a.photo_url) return; zoomFrom.current = e?.currentTarget ?? null; setZoom({ src: a.photo_url, alt: a.name }) }}
                selected={picked.has(a.id)}
                onSelect={() => togglePick(a.id)}
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
                onZoom={(e) => { if (!a.photo_url) return; zoomFrom.current = e?.currentTarget ?? null; setZoom({ src: a.photo_url, alt: a.name }) }}
                selected={picked.has(a.id)}
                onSelect={() => togglePick(a.id)}
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
        <PhotoLightbox src={zoom.src} alt={zoom.alt} shape="circle" origin={zoomFrom} onClose={() => setZoom(null)} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------- card

// THE TICK, AND THE ADDRESS, ON THE FACE OF EVERY CARD.
//
// Two of Ethan's asks land on the same strip of card and they belong together:
// "I want to be able to copy the email from each one easier, not having to
// click to see more", and the bulk bar above needs somewhere to be ticked from.
//
// The address used to live only behind "Read the whole application", which is
// an expand, a scroll and a hunt for a row labelled Email - for the single most
// copied thing on the page. It is on the summary now, next to the copy button
// that copies it, which is the rule the rest of this file already follows.
function PickTick({ selected, onSelect, name }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      role="checkbox"
      aria-checked={!!selected}
      aria-label={`Select ${name || 'this application'}`}
      className={cx(
        'mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all duration-150',
        selected
          ? 'border-brand bg-brand text-white'
          : 'border-gray-300 bg-white hoverable:hover:border-brand',
      )}
    >
      {selected && <Icon name="check" className="h-3 w-3" />}
    </button>
  )
}

function EmailRow({ email }) {
  if (!email) {
    return <p className="mt-2 text-xs text-gray-300">No email on file</p>
  }
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <a
        href={`mailto:${email}`}
        className="min-w-0 truncate text-xs font-medium text-smoke underline decoration-gray-200 underline-offset-2 transition-colors hoverable:hover:text-brand hoverable:hover:decoration-brand"
      >
        {email}
      </a>
      <CopyButton value={email} label="Copy email address" className="!h-6 !w-6 shrink-0" />
    </div>
  )
}


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
  marketLanguages: marketLanguageSet, marketsSpeaking,
  placeIn, onPlaceIn, open, onToggle, busy, onApprove, onDecline, onZoom,
  selected, onSelect,
}) {
  // `profiles.dob` IS NULL ON EVERY ROW AND ALWAYS WILL BE - a BEFORE trigger
  // (mirror_dob_to_private) moves it into creator_private and derives
  // `profiles.age` from it. Reading dob here printed no age for anybody.
  const age = app.age ?? ageFromDob(app.dob)
  // Suggested first, the rest in their given order.
  // `suggested` is `{ market, why, langs }` since 8 Sep 2026 - see the note on
  // `suggestion`. Unwrapped once here so the rest of the card reads the same as
  // it did when it was a bare market.
  const suggestedMarket = suggested?.market ?? null
  const orderedMarkets = suggestedMarket
    ? [...markets].sort((a, b) => (a.slug === suggestedMarket.slug ? -1 : b.slug === suggestedMarket.slug ? 1 : 0))
    : markets
  const bucketList = (Array.isArray(app.bucket_list) ? app.bucket_list : [])
    .map((b) => (typeof b === 'string' ? b : [b?.city, b?.country].filter(Boolean).join(', ')))
    .filter(Boolean)

  return (
    <div className={cx(
      'card !p-0 overflow-hidden transition-all duration-200 hover:shadow-lift',
      selected && 'ring-2 ring-brand/40',
    )}>
      {/* ------------------------------------------------------- the summary */}
      {/* A GRID, SO THE WORDS GET THE WIDTH (22 Sep 2026).
          Ethan, on a phone: "each card is taking up so much space, this is
          mostly due to their bio display and each word being on a new line...
          all the UI seems squished and some almost overlapping." The summary
          was ONE flex row - tick, 80px face, the text, and the dates column -
          and the text was `flex-1` with a zero basis, so on a 375px screen it
          got what was left: about 100px. Every sentence of a bio became a
          column of single words.
          Now the face, the name and when they applied are a header row, and
          everything you READ (email, bio, links, languages) runs the full
          width of the card underneath it. From `sm` up the same grid puts
          them back under the name, with the dates on the right. */}
      <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-start gap-x-3 gap-y-3 p-4 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto] sm:gap-x-4 sm:gap-y-0 sm:p-6">
        <PickTick selected={selected} onSelect={onSelect} name={app.name} />
        {/* The face is a button when there is a photo to open, and a plain
            avatar when there is not - a control that does nothing when pressed
            is worse than no control. */}
        <div className="sm:row-span-2">
          {app.photo_url ? (
            <button
              type="button"
              onClick={onZoom}
              aria-label={`See ${app.name}'s photo full size`}
              className="shrink-0 rounded-full transition-transform duration-200 hoverable:hover:scale-105"
            >
              <Avatar src={app.photo_url} name={app.name} size="lg" className="!h-14 !w-14 sm:!h-20 sm:!w-20" />
            </button>
          ) : (
            <Avatar src={app.photo_url} name={app.name} size="lg" className="!h-14 !w-14 sm:!h-20 sm:!w-20" />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <h2 className="min-w-0 break-words text-base font-bold leading-snug sm:text-lg">{app.name}</h2>
            {age != null && <span className="text-sm text-smoke">{age}</span>}
            {app.referred_by && <Badge tone="brand">Referred</Badge>}
          </div>
          <p className="truncate text-sm text-smoke">
            {[app.city, app.country].filter(Boolean).join(', ') || 'No location given'}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-400 sm:hidden">Applied {timeAgo(appliedAt(app))}</p>
        </div>

        <div className="hidden shrink-0 text-right sm:row-span-2 sm:block">
          {/* WHEN THEY SUBMITTED, NOT WHEN THEY SIGNED UP. See `appliedAt` -
              those are two different days for anybody who started the form and
              came back to it, and this queue is about the day they finished. */}
          <p className="text-xs text-gray-400">Applied {timeAgo(appliedAt(app))}</p>
          <p className="text-[11px] text-gray-300">{formatDate(appliedAt(app))}</p>
          {gapDays(app) >= 1 && (
            <p className="mt-0.5 text-[11px] text-gray-300">
              Signed up {timeAgo(app.created_at)}
            </p>
          )}
        </div>

        <div className="col-span-3 min-w-0 sm:col-span-1 sm:col-start-3">
          <EmailRow email={email} />
          {app.bio && (
            <p className="mt-2 whitespace-normal break-words text-sm leading-relaxed text-ink line-clamp-4 sm:line-clamp-none">
              {String(app.bio).replace(/\s+/g, ' ').trim()}
            </p>
          )}

          {/* The platforms, as links in their own colours. What an approval
              turns on is the work, and the work is behind these. */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {links.length > 0 ? links.map((l) => {
              const brand = brandForUrl(l.url)
              return (
                <a
                  key={l.label + l.url}
                  href={/^https?:\/\//i.test(l.url) ? l.url : `https://${l.url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-2 rounded-full border border-gray-200 bg-white py-1 pl-1.5 pr-3 text-xs font-semibold text-ink transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand hoverable:hover:shadow-card"
                >
                  <SocialMark brand={brand} tile className="h-[18px] w-[18px] shrink-0" />
                  <span className="truncate">{l.label || brand}</span>
                </a>
              )
            }) : (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                No links to their work
              </span>
            )}
          </div>

          {/* LANGUAGES, PROMOTED. Orange = lived in one of our markets. */}
          {app.languages?.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Speaks</span>
              {app.languages.map((l) => {
                const where = marketsSpeaking?.(l) ?? []
                const hit = marketLanguageSet?.has(String(l).toLowerCase()) ?? false
                return (
                  <span
                    key={l}
                    title={hit ? `Spoken in ${where.join(' and ')}` : undefined}
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
      </div>

      {/* Their photographs. The single best evidence of whether somebody can
          shoot, and the one thing this page never showed. */}
      {photos.length > 0 && (
        <div className="-mt-1 flex gap-2 overflow-x-auto px-4 pb-4 sm:px-6">
          {photos.slice(0, 8).map((url) => (
            <img
              key={url}
              src={url}
              alt=""
              loading="lazy"
              className="h-16 w-16 shrink-0 rounded-xl object-cover sm:h-20 sm:w-20"
            />
          ))}
          {photos.length > 8 && (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-cloud text-xs font-semibold text-smoke sm:h-20 sm:w-20">
              +{photos.length - 8}
            </span>
          )}
        </div>
      )}

      {/* --------------------------------------------------- the whole thing */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 border-t border-gray-50 px-4 py-2.5 text-xs font-semibold text-smoke transition-colors hover:bg-cloud/50 hover:text-ink sm:px-6"
        aria-expanded={open}
      >
        {open ? 'Hide the details' : 'Read the whole application'}
        <Icon name={open ? 'chevronUp' : 'chevronDown'} className="h-4 w-4" />
      </button>

      {open && (
        <div className="space-y-4 border-t border-gray-50 bg-cloud/30 px-4 py-4 text-sm sm:px-6 sm:py-5">
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
      <div className="border-t border-gray-100 bg-white px-4 py-4 sm:px-6">
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
            const isSuggested = suggestedMarket?.slug === m.slug
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
        {/* WHY IT IS SUGGESTING WHAT IT IS SUGGESTING, ON ITS OWN LINE.
            Ethan: "then it should be like a little line below saying 'because
            they speak German'... it's just making it more clear, because it's
            easy to miss."

            It used to be the third sentence of one grey paragraph that also
            carried the home-market rule and the "would work too" list, so the
            single fact that justifies the highlighted chip was the hardest
            thing in the block to find. The reason is now its own line, in
            brand, directly under the chips it is about. */}
        {suggested && (
          <p className="mt-2.5 flex items-start gap-1.5 text-[11px] font-medium leading-relaxed text-brand">
            <Icon name={suggested.why === 'language' ? 'chat' : 'pin'} className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>
              {suggested.why === 'language'
                ? <>{suggestedMarket.name} suggested because they speak {suggested.langs.join(' and ')}{app.country ? `, and no market covers ${app.country}` : ''}.</>
                : <>{suggestedMarket.name} suggested because they are in {app.country}.</>}
            </span>
          </p>
        )}

        <p className="mt-2 text-[11px] leading-relaxed text-smoke">
          {placeIn.length === 0
            ? 'Nothing picked, so they join the worldwide community only.'
            : placeIn.length === 1
              ? `Their home market will be ${markets.find((m) => m.slug === placeIn[0])?.name ?? placeIn[0]}.`
              : `Home market: ${markets.find((m) => m.slug === placeIn[0])?.name ?? placeIn[0]}. They will also be in ${placeIn.length - 1} other${placeIn.length > 2 ? 's' : ''}.`}
          {!suggested && ` No market covers ${app.country || 'their country'}, and no language points at one either.`}
          {languageHints.length > 0 && (
            <> They also speak {languageHints.flatMap((h) => h.langs).join(' and ')}, so {languageHints.map((h) => h.market.name).join(' or ')} would work too.</>
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
        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
          <Link to={`/profile/${app.id}`} className="btn-secondary justify-center !py-2 text-xs">Full profile</Link>
          <button onClick={onDecline} disabled={busy} className="btn-danger justify-center !py-2 text-xs">Decline</button>
          <button onClick={onApprove} disabled={busy} className="btn-primary col-span-2 inline-flex items-center justify-center gap-1.5 !py-2 text-xs">
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
function UnfinishedCard({ app, email, phone, onFollowUp, onDecline, busy, onZoom, selected, onSelect }) {
  const progress = onboardingProgress(app, phone ? { phone } : null)
  return (
    <div className={cx(
      'card !p-0 overflow-hidden transition-all duration-200 hoverable:hover:shadow-lift',
      selected && 'ring-2 ring-brand/40',
    )}>
      {/* The same grid as ApplicationCard, for the same reason. */}
      <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-start gap-x-3 gap-y-3 p-4 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto] sm:gap-x-4 sm:gap-y-0 sm:p-6">
        <PickTick selected={selected} onSelect={onSelect} name={app.name} />
        <div className="sm:row-span-2">
          {app.photo_url ? (
            <button type="button" onClick={onZoom} aria-label={`See ${app.name}'s photo full size`}
              className="shrink-0 rounded-full transition-transform duration-200 hoverable:hover:scale-105">
              <Avatar src={app.photo_url} name={app.name} size="lg" className="!h-14 !w-14 sm:!h-20 sm:!w-20" />
            </button>
          ) : <Avatar src={app.photo_url} name={app.name} size="lg" className="!h-14 !w-14 sm:!h-20 sm:!w-20" />}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="min-w-0 break-words text-base font-bold leading-snug sm:text-lg">{app.name?.trim() || 'No name yet'}</h2>
            {app.followed_up_at
              ? <Badge tone="green">Followed up {timeAgo(app.followed_up_at)}</Badge>
              : <Badge tone="grey">Never finished</Badge>}
          </div>
          <p className="truncate text-sm text-smoke">
            {[app.city, app.country].filter(Boolean).join(', ') || 'No location given'}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-400 sm:hidden">
            <span className="font-bold text-brand">{progress.done}/{progress.total}</span> · Signed up {timeAgo(app.created_at)}
          </p>
        </div>

        <div className="hidden shrink-0 text-right sm:row-span-2 sm:block">
          <p className="text-sm font-bold tabular-nums text-brand">{progress.done}/{progress.total}</p>
          <p className="text-xs text-gray-400">Signed up {timeAgo(app.created_at)}</p>
          <p className="text-[11px] text-gray-300">{formatDate(app.created_at)}</p>
        </div>

        <div className="col-span-3 min-w-0 sm:col-span-1 sm:col-start-3">
          <EmailRow email={email} />
          <p className="mt-1.5 text-sm font-medium text-ink">{progress.summary}</p>

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
      </div>

      <div className="space-y-3 border-t border-gray-100 px-4 py-4 sm:px-6">
        {/* THE EMAIL MOVED UP to the summary, where it is reachable without
            reading the footer - see `EmailRow`. The phone stays here: it is far
            less often what somebody wants, and duplicating both would make the
            card twice as tall for no gain. */}
        {phone && (
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs text-smoke">{phone}</span>
            <CopyButton value={phone} label="Copy phone number" className="!h-6 !w-6 shrink-0" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pt-1 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
          <Link to={`/profile/${app.id}`} className="btn-secondary justify-center !py-2 text-xs">Full profile</Link>
          {/* DELETE, NOT "REMOVE". Ethan: "rather than the Remove, it should be
              a Delete button to actually delete the creator permanently."
              It always did delete permanently - `admin_decline_application`
              records the decision and then removes the account - so "Remove"
              was the softer of two words for the same irreversible thing. */}
          <button onClick={onDecline} disabled={busy} className="btn-danger justify-center !py-2 text-xs">Delete</button>
          {/* A MARK, NOT A SEND. There is no email automation - all outbound
              mail is paused - so a "Send" button would either lie or queue
              something nobody receives. A manager writes the mail from their
              own mailbox and ticks it here, and the next manager can see it has
              been done. Pressing it again un-ticks it. */}
          <button
            onClick={onFollowUp}
            disabled={busy}
            className={cx(
              'col-span-2 inline-flex items-center justify-center gap-1.5 !py-2 text-xs',
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
