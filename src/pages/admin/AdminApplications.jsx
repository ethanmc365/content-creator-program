import { useEffect, useMemo, useRef, useState } from 'react'
import { confirm, promptText } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { useSearchParams } from 'react-router-dom'
import MarketRequests, { usePendingMarketRequests } from '../../components/admin/MarketRequests'
import { EmptyState, PageHeader, Skeleton, Spinner } from '../../components/ui'
import PhotoLightbox from '../../components/PhotoLightbox'
import Icon from '../../components/Icon'
import Reveal from '../../components/network/Reveal'
import { useMarkets, resolveMarketForCountryName } from '../../lib/markets'
import { cx } from '../../lib/utils'
import { copyToClipboard, emailList } from '../../lib/clipboard'
import { socialHref, linkHref } from '../../lib/socialLinks'
import { vipApi } from '../../api/vip'
import { moneyApi } from '../../api/money'
import { profilesApi } from '../../api/profiles'
import { teamApi } from '../../api/team'
import { appliedAt, marketLanguages } from './AdminApplicationsParts'
import { ApplicationCard } from './AdminApplicationsApplicationCard'
import { UnfinishedCard } from './AdminApplicationsUnfinishedCard'

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
  // A VIP APPLICANT IS APPROVED INTO A VIP MARKET: VIP Spain, VIP Romania, VIP Worldwide... not into a community market,
  // which is what "Approved in Germany" was. `vipOptions` is the list (migration 329) and `vipPick` is each applicant's
  // choice, seeded from their country.
  const [vipOptions, setVipOptions] = useState(null)
  const [vipPick, setVipPick] = useState({})
  // 'applied' - finished the form, waiting on a decision.
  // 'incomplete' - signed up and never finished. Nobody has anything to review
  //   here, so it is a separate list rather than a filter on the same one.
  // ?tab=markets is where a market request's notification lands (migration 378).
  const [params] = useSearchParams()
  const [bucket, setBucket] = useState(() => (params.get('tab') === 'markets' ? 'markets' : 'applied'))
  const [marketAsks, reloadMarketAsks] = usePendingMarketRequests()
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
  const [inviteLabels, setInviteLabels] = useState({})

  async function load() {
    // BOTH BUCKETS IN ONE QUERY. `status = 'pending'` is the whole queue;
    // `onboarded` is what splits it into "waiting on you" and "never finished".
    // Two queries would be two round trips for one list.
    const [{ data: profiles }, { data: emailRows }] = await Promise.all([
      profilesApi.profiles().select('*').eq('status', 'pending').is('deletion_requested_at', null)// NEWEST FIRST. The team: "it should be filtered by the most recent ones at the
      // top and the older ones at the bottom - that makes sense, not the other
      // way." It does: the queue is a to-do list, and somebody who applied this
      // morning is the one whose decision is still worth making quickly.
      .order('created_at', { ascending: false }),
      teamApi.adminListEmails(),
    ])
    const list = profiles ?? []
    // Team applicants first: they are the ones whose approval hands over the admin panel.
    // ...then VIP applicants, who came through the VIP link and are paid by views rather than entering challenges.
    const weight = (a) => Number(!!a.team_application) * 2 + Number(!!a.is_vip)
    list.sort((a, b) => weight(b) - weight(a))
    setApps(list)
    if (list.some((a) => a.team_invite_id)) {
      teamApi.teamInvites().select('id, label').then(({ data }) => setInviteLabels(Object.fromEntries((data ?? []).map((r) => [r.id, r.label]))))
    }
    setEmails(Object.fromEntries((emailRows ?? []).map((r) => [r.id, r.email])))

    // The two extra reads, batched over the whole queue rather than fired per
    // card: a page of fifteen applications must not open fifteen connections.
    const ids = list.map((a) => a.id)
    if (ids.length) {
      const [{ data: priv }, { data: pics }] = await Promise.all([
        moneyApi.creatorPrivate().select('id, phone, phone_country').in('id', ids),
        profilesApi.creatorPhotos().select('creator_id, photo_url').in('creator_id', ids).order('sort_order'),
      ])
      setPhones(Object.fromEntries((priv ?? []).map((r) => [r.id, [r.phone_country, r.phone].filter(Boolean).join(' ')])))
      const byCreator = {}
      for (const p of pics ?? []) (byCreator[p.creator_id] ||= []).push(p.photo_url)
      setPhotos(byCreator)
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (!apps?.some((a) => a.is_vip && !a.team_application) || vipOptions) return
    vipApi.programmeOptions().then(({ data }) => setVipOptions(data || []))
  }, [apps, vipOptions])
  const vipDefault = (a) => {
    const opts = vipOptions || []
    const code = String(a.country_code || '').toUpperCase()
    return (opts.find((o) => !o.worldwide && (o.country_codes || []).includes(code)) || opts.find((o) => o.is_default) || opts.find((o) => o.worldwide) || opts[0])?.id || null
  }
  const vipChoice = (a) => vipPick[a.id] ?? vipDefault(a)
  async function approveVip(a) {
    const opt = (vipOptions || []).find((o) => o.id === vipChoice(a))
    if (!opt) { flash('Pick a VIP market first.'); return false }
    const { error } = await vipApi.adminApproveVipApplication({ target: a.id, p_programme: opt.id })
    return error ? error.message : true
  }

  // ONE TOAST HOST FOR THE WHOLE APP, AND THIS PAGE HAD ITS OWN.
  //
  // They are describing a hand-rolled `fixed bottom-24` pill that predated `ToastHost` and never learned two things that
  // host already knows: the tab bar is ~56px PLUS `env(safe-area-inset-bottom)`, which on an iPhone puts its top edge at
  // about 90px and leaves a 96px offset overlapping it; and a `fixed` element inside a transformed ancestor is
  // positioned against that ancestor rather than the viewport, so the z-index was never the fix. Deleted rather than
  // nudged - the shared toast is above the bar, above the safe area, dismissible, and identical to every other
  // confirmation.
  const flash = (msg) => toastSuccess(msg)

  // NOBODY APPLIES TO A MARKET, SO THE PAGE HAS TO WORK IT OUT.
  //
  // A creator gives us a country, and every open market owns a set of country
  // codes that do not overlap - so their market is a strong SUGGESTION. It is
  // not a fact, which is the change: an admin can disagree with it, and the
  // most common reason to is the language they speak.
  //
  // AND WHEN THE COUNTRY POINTS AT NOTHING, THE LANGUAGE DOES.
  //
  // They are describing exactly the case the country test cannot see. Austria is not in the German market's country
  // codes and probably should not be, so `resolveMarketForCountryName` correctly returns nothing and the picker seeded
  // EMPTY - which means the default action for an Austrian applicant was "worldwide only", and the German market they
  // would obviously belong in was one unhighlighted chip among six. The information was on the page; it was in the last
  // clause of a grey paragraph under the chips, which is where a busy reviewer's eye does not go.
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

  // MARKETS THIS PERSON'S LANGUAGES POINT AT. The reason the languages screen exists, made visible on the screen the
  // decision is made on: somebody who speaks the language a market is lived in is worth a second look even when their
  // country says otherwise. A Portuguese speaker in London is the case the team is describing, and it is the case the
  // country alone cannot see.
  const languageMatches = (a) => {
    const spoken = new Set((a.languages ?? []).map((l) => String(l).toLowerCase()))
    return (markets ?? [])
      .filter((m) => m.kind === 'chapter' && m.is_active && m.slug !== suggestion[a.id]?.market?.slug)
      .map((m) => ({ market: m, langs: marketLanguages(m).filter((l) => spoken.has(l.toLowerCase())) }))
      .filter((x) => x.langs.length > 0)
  }


  // Which markets a given language is lived in, so the chip can say so.
  const marketsSpeaking = (lang) => (markets ?? [])
    .filter((m) => m.kind === 'chapter' && m.is_active
      && marketLanguages(m).some((l) => l.toLowerCase() === String(lang).toLowerCase()))
    .map((m) => m.name)

  async function approve(app) {
    if (app.is_vip && !app.team_application) {
      const opt = (vipOptions || []).find((o) => o.id === vipChoice(app))
      if (!await confirm(`Approve ${app.name} into ${opt?.name ?? 'their VIP market'}?`)) return
      setBusyId(app.id)
      const res = await approveVip(app)
      setBusyId(null)
      if (res !== true) { if (res) flash(`Something went wrong: ${res}`); return }
      flash(`${app.name} approved into ${opt.name}.`)
      setApps((prev) => prev.filter((a) => a.id !== app.id))
      return
    }
    const slugs = placeIn[app.id] ?? []
    const names = slugs.map((sl) => markets.find((m) => m.slug === sl)?.name ?? sl)
    const where = names.length
      ? names.slice(0, -1).concat(names.length > 1 ? [`and ${names[names.length - 1]}`] : names).join(names.length > 2 ? ', ' : ' ')
      : 'the worldwide community only'
    if (!await confirm(`Approve ${app.name} into ${where}?`)) return
    setBusyId(app.id)
    const { data, error } = await teamApi.adminApproveApplication({
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

  // APPROVING SOMEBODY ONTO THE TEAM IS A DIFFERENT DECISION.
  //
  // A team application arrived through an invite link, which grants nothing -
  // see migration 280. This is the one door in, and it is `approve_team_member`
  // rather than `admin_approve_application`: the second puts somebody in a
  // market as a creator, and this person is not one. The role title is offered
  // rather than assumed, because the invite's title is a suggestion made when
  // the link was created and this is the moment somebody decides.
  async function approveTeam(app) {
    const suggested = app.requested_role_title || ''
    const title = await promptText(
      `${app.name} applied through a team invite link. Approving gives them the admin panel; you can change their title any time on the Team page.`,
      {
        title: 'Add to the Tryp.com team',
        defaultValue: suggested,
        placeholder: 'e.g. Community lead, Spain',
        confirmLabel: 'Add them to the team',
      },
    )
    if (title === null) return
    setBusyId(app.id)
    const { error } = await teamApi.approveTeamMember({
      p_profile: app.id,
      p_role_title: title || suggested || null,
    })
    setBusyId(null)
    if (error) { flash(`Something went wrong: ${error.message}`); return }
    flash(`${app.name} is on the Tryp.com team.`)
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
    const { error } = await teamApi.adminDeclineApplication({ target: app.id })
    setBusyId(null)
    if (error) { flash(`Something went wrong: ${error.message}`); return }
    flash(`${who} deleted.`)
    setApps((prev) => prev.filter((a) => a.id !== app.id))
  }

  // MARKING A FOLLOW-UP, WHICH IS ALL WE CAN HONESTLY OFFER.
  //
  // It writes `profiles.followed_up_at` (migration 191), which is admin-only.
  // The row is updated in place rather than reloaded so the toggle is instant;
  // a rejected write puts it straight back, because a mark that silently did
  // not save is worse than no mark at all.
  async function toggleFollowUp(app) {
    const next = app.followed_up_at ? null : new Date().toISOString()
    setBusyId(app.id)
    setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, followed_up_at: next } : a)))
    const { error } = await profilesApi.profiles().update({ followed_up_at: next }).eq('id', app.id)
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
      const error = app.is_vip && !app.team_application
        ? ((await approveVip(app)) === true ? null : true)
        : (await teamApi.adminApproveApplication({ target: app.id, p_market_slugs: placeIn[app.id] ?? [] })).error
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
    const { error } = await profilesApi.profiles().update({ followed_up_at: stamp }).in('id', ids)
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
    const weight = (a) => Number(!!a.team_application) * 2 + Number(!!a.is_vip)
    return [...list].sort((a, b) => weight(b) - weight(a) || new Date(appliedAt(b)) - new Date(appliedAt(a)))
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
    { label: 'Instagram', url: socialHref(a.instagram_url, 'instagram') },
    { label: 'TikTok', url: socialHref(a.tiktok_url, 'tiktok') },
    { label: 'YouTube', url: socialHref(a.youtube_url, 'youtube') },
    { label: 'Facebook', url: socialHref(a.facebook_url, 'facebook') },
    { label: 'LinkedIn', url: socialHref(a.linkedin_url, 'linkedin') },
    ...(Array.isArray(a.other_links) ? a.other_links.map((l) => ({ ...l, url: linkHref(l?.url) })) : []),
  ].filter((s) => s.url)

  // THREE LISTS: a market request is a member asking for another market, not an application - its own tab, with a live
  // count in brand orange so it is never missed.
  const bucketSwitch = (apps !== null || marketAsks) ? (
    <div className="mb-6 flex gap-1.5 overflow-x-auto rounded-full bg-cloud p-1 scrollbar-none">
      {[
        ['applied', 'Waiting on you', counts.applied],
        ['incomplete', 'Never finished', counts.incomplete],
        ['markets', 'Market requests', marketAsks ?? 0],
      ].map(([key, label, n]) => (
        <button
          key={key}
          type="button"
          onClick={() => { setBucket(key); setMarket(''); setOpenId(null); setPicked(new Set()) }}
          aria-pressed={bucket === key}
          className={cx(
            'relative flex-1 whitespace-nowrap rounded-full px-3 py-2 text-[13px] font-semibold transition-colors duration-200 sm:px-4 sm:text-sm',
            bucket === key ? 'bg-white text-ink shadow-card' : 'text-smoke hover:text-ink',
          )}
        >
          {key === 'markets' && <Icon name="globe" className="mr-1.5 inline h-4 w-4 -translate-y-px text-brand" />}
          {label}
          {key === 'markets' && n > 0
            ? <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold tabular-nums text-white animate-pop-in">{n}</span>
            : <span className={cx('ml-1.5 tabular-nums', bucket === key ? 'text-brand' : 'text-gray-400')}>{n}</span>}
        </button>
      ))}
    </div>
  ) : null

  if (bucket === 'markets') {
    return (
      <div className="page max-w-4xl">
        <PageHeader back="/admin" title="Applications" />
        {bucketSwitch}
        <div key="markets" className="animate-tab-in"><MarketRequests onChanged={reloadMarketAsks} /></div>
      </div>
    )
  }

  return (
    <div className="page max-w-4xl">
      <PageHeader
        back="/admin"
        title="Applications"
        subtitle={counts.applied ? `${counts.applied} ${counts.applied === 1 ? 'person is' : 'people are'} waiting on a decision.` : undefined}
      />

      {/* TWO LISTS, NOT ONE LIST WITH A FILTER.

          They are two different jobs and they take two different actions.
          Somebody who finished the form is waiting on a DECISION; somebody who
          did not is waiting on nothing at all, and the only useful thing an
          admin can do is reach them. Approving or declining an unfinished
          application is not a thing that means anything, so those buttons are
          not on those cards. */}
      {bucketSwitch}

      {apps !== null && (shown.length > 0 || search || onlyUnfollowed) && (
        <div className="mb-6 space-y-3">
          {/* ON A PHONE, ONE LINE THAT SCROLLS SIDEWAYS. Seven market chips wrapped into three ragged rows above
              everything else; */}
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
                marketsSpeaking={marketsSpeaking}
                markets={(markets ?? []).filter((m) => m.kind === 'chapter' && m.is_active)}
                vipOptions={a.is_vip && !a.team_application ? vipOptions : null}
                vipPicked={vipChoice(a)}
                onVipPick={(id) => setVipPick((p) => ({ ...p, [a.id]: id }))}
                placeIn={placeIn[a.id] ?? []}
                onPlaceIn={(slugs) => setPlaceIn((p) => ({ ...p, [a.id]: slugs }))}
                open={openId === a.id}
                onToggle={() => setOpenId((v) => (v === a.id ? null : a.id))}
                busy={busyId === a.id}
                onApprove={() => approve(a)}
                onApproveTeam={() => approveTeam(a)}
                inviteLabel={inviteLabels[a.team_invite_id]}
                onDecline={() => decline(a)}
                onZoom={(e) => { if (!a.photo_url) return; zoomFrom.current = e?.currentTarget ?? null; setZoom({ src: a.photo_url, alt: a.name }) }}
                onZoomPhoto={(e, i) => { zoomFrom.current = e?.currentTarget ?? null; setZoom({ list: photos[a.id] ?? [], index: i, alt: a.name }) }}
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

      {/* THE FACE OPENS FULL SIZE. A profile photo is one of the two things an admin is actually judging on this page,
          and it was drawn at 56px with no way to see it bigger. PhotoLightbox is the app's own viewer - pinch, wheel,
          double-tap, drag - and it is already what a photograph opens into everywhere else. */}
      {zoom && !zoom.list && (
        <PhotoLightbox src={zoom.src} alt={zoom.alt} shape="circle" origin={zoomFrom} onClose={() => setZoom(null)} />
      )}
      {/* THE TRAVEL PHOTOS OPEN TOO. Same viewer, stepping through the set. */}
      {zoom?.list && (
        <PhotoLightbox
          src={zoom.list[zoom.index]}
          alt={zoom.alt}
          origin={zoomFrom}
          counter={zoom.list.length > 1 ? `${zoom.index + 1} / ${zoom.list.length}` : ''}
          onPrev={zoom.list.length > 1 ? () => { zoomFrom.current = null; setZoom((z) => ({ ...z, index: (z.index - 1 + z.list.length) % z.list.length })) } : null}
          onNext={zoom.list.length > 1 ? () => { zoomFrom.current = null; setZoom((z) => ({ ...z, index: (z.index + 1) % z.list.length })) } : null}
          onClose={() => setZoom(null)}
        />
      )}
    </div>
  )
}

export { ApplicationCard } from './AdminApplicationsApplicationCard'
