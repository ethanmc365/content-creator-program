import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { confirm, notice, promptText } from '../../lib/confirm'
import { toast } from '../../lib/toast'
import TeamInvites from '../../components/admin/TeamInvites'
import Icon from '../../components/Icon'
import PeoplePicker from '../../components/network/PeoplePicker'
import { Avatar, EmptyState, Modal, PageHeader, Skeleton, Spinner, Toggle } from '../../components/ui'
import { LEAD_TITLE_SHORT, TITLE_PRESETS, permissionLabel } from '../../lib/roles'
import { cx } from '../../lib/utils'

const MARKET_FLAG = { uk: '🇬🇧', spain: '🇪🇸', portugal: '🇵🇹', germany: '🇩🇪', romania: '🇷🇴', nordics: '🇸🇪' }

// Who runs Tryp.com, and what each of them is called.
//
// TWO SEPARATE QUESTIONS ON ONE PAGE
//
// "What can this person do" has three answers and lives in `platform_role`.
// "What is this person called" has infinite answers and lives in `role_title`.
// Keeping them visibly separate here is the whole point of the page: promoting
// somebody and naming them are different decisions, and a UI that fuses them
// (a dropdown of job titles that each secretly grant different powers) is how
// permission models rot.
//
// THE PROGRAMME LEAD
//
// Exactly one person, enforced by a unique index, not by this page remembering.
// Nobody else can demote, delete, retitle or unseat them - that is a trigger and
// two RPC guards in migration 084, so it holds whether the request comes from
// this page, the API or a stray script. What the lead CAN do is hand the role
// on, which is an action on the row of whoever would receive it.

function RoleRow({ person, isMe, viewerIsLead, onTitle, onDemote, onHandOver, busy, vip, onVip, allVip = 0 }) {
  const lead = person.platform_role === 'owner'
  return (
    <div className={cx(
      'flex flex-wrap items-center gap-3 rounded-card border bg-white px-5 py-4',
      'border-gray-100',
    )}>
      <Avatar src={person.photo_url} name={person.name} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <Link to={`/profile/${person.id}`} className="truncate font-semibold hover:text-brand">
            {person.name}
          </Link>
          {isMe && <span className="text-xs text-smoke">(you)</span>}
          {lead && <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-semibold text-brand">{LEAD_TITLE_SHORT}</span>}
          <VipChip lead={lead} vip={vip} all={allVip} />
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-smoke">
          <span className="font-medium text-ink">{person.role_title || permissionLabel(person.platform_role)}</span>
          <span aria-hidden>•</span>
          <span>{permissionLabel(person.platform_role)}</span>
          {person.markets?.length > 0 && (
            <>
              <span aria-hidden>•</span>
              <span className="truncate">Manages {person.markets.join(', ')}</span>
            </>
          )}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {viewerIsLead && !lead && onVip && (
          <button
            onClick={() => onVip(person)}
            disabled={busy}
            title="Let them into the VIP community and its tools"
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3.5 py-1.5 text-xs font-medium transition-transform duration-200 hover:scale-105 hover:border-brand hover:text-brand disabled:opacity-40"
          >
            <Icon name="star" className="h-3.5 w-3.5" /> VIP access
          </button>
        )}
        <button
          onClick={() => onTitle(person)}
          disabled={busy || (lead && !isMe)}
          title={lead && !isMe ? 'Only the programme lead can change this' : 'Set a custom title'}
          className="rounded-full border border-gray-200 px-3.5 py-1.5 text-xs font-medium transition-transform duration-200 hover:scale-105 hover:border-brand hover:text-brand disabled:opacity-40 disabled:hover:scale-100"
        >
          {person.role_title ? 'Change title' : 'Give a title'}
        </button>
        {/* The lead has no demote button at all, for anybody including
            themselves: handing over is the only way out of the role.
            Handing the programme on lives HERE, on the row of the person who
            would receive it, and only for the lead looking at an existing team
            member. It used to be a permanent section at the bottom of the page
            headed "one day somebody else will run this", which is a thing to
            think about once every few years sitting under a page you open every
            week. An action belongs next to its object. */}
        {!lead && !isMe && viewerIsLead && (
          <>
            <button
              onClick={() => onHandOver(person)}
              disabled={busy}
              title={`Make ${person.name} the programme lead`}
              className="rounded-full border border-gray-200 px-3.5 py-1.5 text-xs font-medium transition-transform duration-200 hover:scale-105 hover:border-brand hover:text-brand disabled:opacity-40"
            >
              Make lead
            </button>
            <button
              onClick={() => onDemote(person)}
              disabled={busy}
              className="rounded-full border border-gray-200 px-3.5 py-1.5 text-xs font-medium text-smoke transition-transform duration-200 hover:scale-105 hover:border-red-300 hover:text-red-600 disabled:opacity-40"
            >
              Remove from team
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// THE VIP COMMUNITY, FROM THE TEAM PAGE (2 Oct 2026). Ethan: "I don't seem to be able to change an admin's role so they
// can also see the VIP community, this should be doable on the Tryp.com team page." Being an admin does not open the VIP
// community (migration 296: it is the owner's to give, market by market). The owner's rows here show who has it and a
// "VIP access" button that switches it on or off per VIP market. Same write as the old Access tab (vip_add_manager).
function VipChip({ lead, vip, all = 0 }) {
  const chip = 'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-gray-900 px-2 py-0.5 text-[11px] font-semibold text-white'
  if (lead || (all > 1 && vip?.length >= all)) return <span className={chip}><Icon name="star" className="h-3 w-3" />VIP, every market</span>
  if (!vip?.length) return null
  return (
    <span className={cx(chip, 'animate-pop-in')} title={vip.map((v) => v.programme).join(', ')}>
      <Icon name="star" className="h-3 w-3" />VIP{vip.length > 1 ? ` · ${vip.length} markets` : ` · ${vip[0].programme.replace(/^VIP /, '')}`}
    </span>
  )
}

function VipAccessModal({ person, programmes, grants, onClose, onChanged }) {
  const [busy, setBusy] = useState('')
  if (!person) return null
  const has = (pid) => grants.some((g) => g.profile_id === person.id && g.programme_id === pid)
  async function flip(p) {
    setBusy(p.id)
    const on = has(p.id)
    const { error } = await supabase.rpc(on ? 'vip_remove_manager' : 'vip_add_manager', { p_profile: person.id, p_programme: p.id })
    setBusy('')
    if (error) { notice(error.message); return }
    toast(on ? `${person.name} no longer has ${p.name}.` : `${person.name} can now see and run ${p.name}.`)
    onChanged()
  }
  async function all(on) {
    setBusy('all')
    for (const p of programmes) {
      if (has(p.id) === on) continue
      const { error } = await supabase.rpc(on ? 'vip_add_manager' : 'vip_remove_manager', { p_profile: person.id, p_programme: p.id })
      if (error) { notice(error.message); break }
    }
    setBusy('')
    onChanged()
  }
  const count = programmes.filter((p) => has(p.id)).length
  return (
    <Modal open onClose={onClose} title={`VIP access for ${person.name}`}>
      <div className="space-y-4">
        <p className="text-sm text-smoke">
          With access to a VIP market they see that market's VIP page exactly as its creators do, its VIP rooms, and the VIP
          tools for its members, balances and month end. They do not become a VIP creator.
        </p>
        <ul className="divide-y divide-gray-50 rounded-card border border-gray-100">
          {programmes.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3 animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
              <Icon name="star" className="h-4 w-4 shrink-0 text-brand" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{p.name}{!p.active && <span className="ml-2 text-xs font-normal text-smoke">(not open)</span>}</span>
              {busy === p.id ? <Spinner className="h-4 w-4" /> : <Toggle on={has(p.id)} onChange={() => flip(p)} label={`Access to ${p.name}`} disabled={!!busy} />}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap justify-between gap-2">
          <button type="button" onClick={() => all(count < programmes.length)} disabled={!!busy} className="btn-secondary !py-2 text-xs">
            {busy === 'all' ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="star" className="h-3.5 w-3.5" />}
            {count < programmes.length ? 'Every VIP market' : 'Remove from every VIP market'}
          </button>
          <button type="button" onClick={onClose} className="btn-primary !py-2 text-xs">Done</button>
        </div>
      </div>
    </Modal>
  )
}

export default function AdminTeam() {
  const { profile, refreshProfile } = useAuth()
  const [team, setTeam] = useState(null)
  const [everyone, setEveryone] = useState([])
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  // SORTED BY MARKET (24 Sep 2026). Ethan: "can you sort it better? ... show
  // each market with the [people] inside it, so I can see it easily, and then
  // add [people] in a specific spot." One card per market with its managers
  // and its own Add button; `addingTo` is the market that button opened.
  const [markets, setMarkets] = useState([])
  const [memberIds, setMemberIds] = useState({}) // market id -> Set of member ids
  const [addingTo, setAddingTo] = useState(null)

  const viewerIsLead = profile?.platform_role === 'owner'
  const [vipProgrammes, setVipProgrammes] = useState([])
  const [vipGrants, setVipGrants] = useState([])
  const [vipFor, setVipFor] = useState(null)
  // Only the owner can read or change who has VIP access; for anybody else these stay empty and nothing is drawn.
  const loadVip = useCallback(async () => {
    if (!viewerIsLead) return
    const [{ data: progs }, { data: grants }] = await Promise.all([
      supabase.from('vip_programmes').select('id, name, active').order('name'),
      supabase.rpc('vip_managers_list'),
    ])
    setVipProgrammes(progs || [])
    setVipGrants(grants || [])
  }, [viewerIsLead])
  useEffect(() => { loadVip() }, [loadVip])
  const vipOf = (id) => vipGrants.filter((g) => g.profile_id === id)

  // THE TEAM FIRST, EVERYTHING ELSE AFTER (28 Sep 2026). Ethan: "the team
  // admin panel page is not loading at all ... It did load eventually." The
  // page waited for all four reads - including every active creator, only
  // needed once somebody presses Add - before drawing anything. The roster and
  // the markets draw the page; the people and the member counts fill in behind.
  const load = useCallback(async () => {
    const peopleP = supabase.from('profiles').select('id, name, photo_url, country_code, city, country')
      .eq('status', 'active').eq('is_test', false).order('name').limit(1000)
    const memP = supabase.from('community_members').select('community_id, profile_id').eq('status', 'active').limit(5000)
    const [{ data: roster, error }, { data: mk }] = await Promise.all([
      supabase.rpc('team_roster'),
      supabase.from('communities').select('id, name, slug, kind').eq('kind', 'chapter').is('retired_at', null).order('name'),
    ])
    if (error) { notice(`Could not load the team: ${error.message}`); setTeam([]); return }
    setTeam(roster || [])
    setMarkets(mk || [])
    const [{ data: people }, { data: mem }] = await Promise.all([peopleP, memP])
    setEveryone(people || [])
    const byMarket = {}
    for (const r of mem || []) (byMarket[r.community_id] ||= new Set()).add(r.profile_id)
    setMemberIds(byMarket)
  }, [])

  useEffect(() => { load() }, [load])

  async function setTitle(person) {
    const title = await promptText(
      `What is ${person.name.split(' ')[0]} called? For example "Spain Country Manager" or "Nordics Lead".`,
      {
        title: 'Role title',
        defaultValue: person.role_title || '',
        placeholder: TITLE_PRESETS[0],
        confirmLabel: 'Save title',
      },
    )
    if (title === null) return
    setBusy(true)
    const { error } = await supabase.rpc('set_team_member', {
      target: person.id,
      p_title: title || null,
      p_clear_title: !title,
    })
    setBusy(false)
    if (error) { notice(error.message); return }
    if (person.id === profile?.id) await refreshProfile()
    await load()
    toast(title ? `${person.name} is now "${title}".` : `Cleared ${person.name}'s title.`)
  }

  // PeoplePicker hands back an array of ids even when `multi` is false, so this
  // takes the first rather than assuming a bare id and silently doing nothing.
  async function promote(picked) {
    const personId = Array.isArray(picked) ? picked[0] : picked
    const person = everyone.find((p) => p.id === personId)
    if (!person) return
    const ok = await confirm(
      `${person.name} will get everything the Tryp.com team can do: every market, every challenge, every creator's details, and the admin panel.\n\n`
      + 'They will not be able to remove or demote you.',
      { title: `Add ${person.name} to the team?`, confirmLabel: 'Add to the team' },
    )
    if (!ok) return
    setBusy(true)
    const { error } = await supabase.rpc('set_team_member', { target: personId, p_admin: true })
    setBusy(false)
    if (error) { notice(error.message); return }
    await load()
    setAdding(false)
    toast(`${person.name} is on the Tryp.com team.`)
  }

  async function demote(person) {
    const ok = await confirm(
      `${person.name} goes back to being a creator. They keep their profile, their points and everything they have posted; they just lose the admin panel and every market they manage.`,
      { title: `Remove ${person.name} from the team?`, confirmLabel: 'Remove', danger: true },
    )
    if (!ok) return
    setBusy(true)
    const { error } = await supabase.rpc('set_team_member', {
      target: person.id, p_admin: false, p_clear_title: true,
    })
    setBusy(false)
    if (error) { notice(error.message); return }
    await load()
    toast(`${person.name} is a creator again.`)
  }

  // Handing the programme on. Two steps, and the second one is typing their
  // name: this is the single least reversible action on the platform, because
  // the moment it lands the person doing it can no longer undo it.
  async function handOver(target) {
    const ok = await confirm(
      `${target.name} becomes the ${LEAD_TITLE_SHORT}. You stay on the Tryp.com team with every admin power except this one.\n\n`
      + 'From then on only they can hand it back. You cannot undo this yourself.',
      { title: `Hand the programme to ${target.name}?`, confirmLabel: 'Hand it over', danger: true },
    )
    if (!ok) return
    const typed = await promptText(
      `Type ${target.name} to confirm.`,
      { title: 'This cannot be undone by you', placeholder: target.name, confirmLabel: 'Hand over the lead' },
    )
    if (!typed || typed.trim().toLowerCase() !== target.name.toLowerCase()) {
      if (typed) notice(`That did not match "${target.name}", so nothing has changed.`)
      return
    }

    setBusy(true)
    const { error } = await supabase.rpc('transfer_ownership', { target: target.id })
    setBusy(false)
    if (error) { notice(error.message); return }
    await refreshProfile()
    await load()
    toast(`${target.name} now leads the programme.`)
  }

  // MAKING SOMEBODY A MARKET'S MANAGER, FROM HERE. The same write
  // ManageChapter's "Make manager" does - the membership row's role - plus the
  // row itself when they were not in that market yet.
  async function addManager(market, picked) {
    const personId = Array.isArray(picked) ? picked[0] : picked
    const person = everyone.find((p) => p.id === personId)
    if (!person) return
    // A MANAGER IS ON THE TEAM (26 Sep 2026). Ethan: "it shows up: Maria will
    // be able to edit Germany, but this will not make them a TikTok admin.
    // Obviously, it should, and she already is an admin." Somebody who runs a
    // market needs the admin panel to run it, so a creator made a manager
    // joins the Tryp.com team in the same step - and the dialog says whichever
    // of the two is true instead of warning about something that is not.
    const isAdmin = (team || []).some((t) => t.id === personId)
    const ok = await confirm(
      isAdmin
        ? `${person.name} is already on the Tryp.com team. They will now run ${market.name}: its challenges, rules and roster, and show under ${market.name} on this page.`
        : `${person.name} will run ${market.name}: its challenges, rules and roster. They also join the Tryp.com team, so they get the admin panel they need to do it.`,
      { title: `Make ${person.name} a manager of ${market.name}?`, confirmLabel: 'Make manager' },
    )
    if (!ok) return
    setBusy(true)
    const already = memberIds[market.id]?.has(personId)
    const { error } = already
      ? await supabase.from('community_members').update({ role: 'manager' }).eq('community_id', market.id).eq('profile_id', personId)
      : await supabase.from('community_members').insert({ community_id: market.id, profile_id: personId, role: 'manager', status: 'active' })
    if (!error && !isAdmin) {
      const { error: adminErr } = await supabase.rpc('set_team_member', { target: personId, p_admin: true })
      if (adminErr) notice(`${person.name} manages ${market.name}, but could not be added to the team: ${adminErr.message}`)
    }
    setBusy(false)
    if (error) { notice(error.message); return }
    setAddingTo(null)
    await load()
    toast(`${person.name} now manages ${market.name}.`)
  }

  async function removeManager(market, person) {
    const ok = await confirm(
      `${person.name} stays a member of ${market.name}; they just stop managing it.`,
      { title: `Remove ${person.name} as manager of ${market.name}?`, confirmLabel: 'Remove', danger: true },
    )
    if (!ok) return
    setBusy(true)
    const { error } = await supabase.from('community_members').update({ role: 'creator' })
      .eq('community_id', market.id).eq('profile_id', person.id)
    setBusy(false)
    if (error) { notice(error.message); return }
    await load()
    toast(`${person.name} no longer manages ${market.name}.`)
  }

  // Test and sandbox accounts (the demo login) are on the roster but not on
  // the team anybody means; `everyone` is the real, non-test people.
  const real = new Set(everyone.map((p) => p.id))
  // Until the people arrive, trust the roster (it already leaves test accounts out).
  const people = (team || []).filter((t) => !everyone.length || real.has(t.id) || t.id === profile?.id)
  const lead = people.find((t) => t.platform_role === 'owner')
  // THE WORLDWIDE TEAM IS WHO RUNS NO ONE MARKET (26 Sep 2026). Ethan: "If
  // they're in a market ... then they shouldn't be showing up in the
  // worldwide team. Hannah won't be showing up under a market manager, but she
  // should still show up there. I can still show up there as well." The lead
  // is always here, whatever they manage.
  const admins = people.filter((t) => t.platform_role === 'global_admin' && !(t.market_slugs || []).length)
  const managersOf = (market) => people
    .filter((t) => (t.market_slugs || []).includes(market.slug))
    .sort((a, b) => (a.platform_role === 'owner') - (b.platform_role === 'owner') || a.name.localeCompare(b.name))

  return (
    <div className="page">
      <PageHeader
        back="/admin"
        title="Tryp.com team"
        subtitle="Who runs the programme worldwide, and who runs each market."
        action={
          <button onClick={() => setAdding((v) => !v)} className="btn-primary !py-2.5">
            <Icon name="plus" className="h-4 w-4" /> Add to worldwide team
          </button>
        }
      />

      <PeoplePicker
        open={adding}
        onClose={() => setAdding(false)}
        people={everyone.filter((p) => !(team || []).some((t) => t.id === p.id))}
        onConfirm={promote}
        title="Add somebody to the Tryp.com team"
        hint="Search any active creator. You can give them their title once they are on."
        confirmLabel="Add to the team"
        multi={false}
        busy={busy}
      />

      {team === null ? (
        <div className="space-y-3">
          <Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" />
        </div>
      ) : (
        <div className="space-y-10">
          {/* ---- A link that lets somebody APPLY to be on this page ---- */}
          <TeamInvites />

          {/* ---- Worldwide: the lead and the Tryp.com team ---- */}
          <section>
            <div className="mb-4 flex items-center gap-2.5">
              <Icon name="globe" className="h-6 w-6 shrink-0 text-brand" />
              <div>
                <h2 className="text-lg font-semibold leading-tight">Worldwide team</h2>
                <p className="text-xs text-smoke">Admins who cover every market rather than running one.</p>
              </div>
            </div>
            <div className="space-y-3">
              {lead ? (
                <RoleRow
                  person={lead}
                  isMe={lead.id === profile?.id}
                  viewerIsLead={viewerIsLead}
                  onTitle={setTitle}
                  onDemote={demote}
                  onHandOver={handOver}
                  busy={busy}
                  vip={vipOf(lead.id)}
                />
              ) : (
                <EmptyState icon={<Icon name="shield" className="h-6 w-6" />} title="Nobody leads the programme" />
              )}
              {admins.map((p) => (
                <RoleRow key={p.id} person={p} isMe={p.id === profile?.id}
                  viewerIsLead={viewerIsLead} onTitle={setTitle} onDemote={demote} onHandOver={handOver} busy={busy}
                  vip={vipOf(p.id)} allVip={vipProgrammes.length} onVip={vipProgrammes.length ? setVipFor : null} />
              ))}
            </div>
          </section>

          {/* ---- One card per market ---- */}
          <section>
            <div className="mb-4 flex items-center gap-2.5">
              <Icon name="flag" className="h-6 w-6 shrink-0 text-brand" />
              <div>
                <h2 className="text-lg font-semibold leading-tight">Markets</h2>
                <p className="text-xs text-smoke">Who runs each market. A manager's reach stops at the market they manage.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {markets.map((m, i) => {
                const mgrs = managersOf(m)
                return (
                  <div
                    key={m.id}
                    style={{ animationDelay: `${i * 50}ms` }}
                    className="animate-fade-up flex flex-col overflow-hidden rounded-card border border-gray-100 bg-white shadow-card"
                  >
                    <div className="flex items-center gap-3 px-5 py-4">
                      <span aria-hidden className="shrink-0 text-[2rem] leading-none drop-shadow-sm">
                        {MARKET_FLAG[m.slug] || '🌍'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold">{m.name}</p>
                        <p className="text-xs text-smoke">
                          {(memberIds[m.id]?.size ?? 0).toLocaleString()} members
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAddingTo(m)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-3.5 py-2 text-xs font-semibold text-white shadow-card transition-transform duration-200 hover:-translate-y-0.5"
                      >
                        <Icon name="plus" className="h-3.5 w-3.5" /> Add manager
                      </button>
                    </div>
                    {mgrs.length === 0 ? (
                      <p className="flex-1 border-t border-gray-100 px-5 py-4 text-sm text-smoke">
                        Nobody manages {m.name} yet. The worldwide team covers it until someone does.
                      </p>
                    ) : (
                      <ul className="flex-1 divide-y divide-gray-50 border-t border-gray-100">
                        {mgrs.map((p) => (
                          <li key={p.id} className="group flex items-center gap-3 px-5 py-3">
                            <Avatar src={p.photo_url} name={p.name} size="md" />
                            <div className="min-w-0 flex-1">
                              <Link to={`/profile/${p.id}`} className="flex items-center gap-2 truncate text-sm font-semibold hover:text-brand">
                                <span className="truncate">{p.name}</span>
                              </Link>
                              {/* The chip wraps under the title instead of running off the card's right edge (7 Oct 2026). */}
                              <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-smoke"><span className="min-w-0 truncate">{p.role_title || `${m.name} manager`}</span><VipChip lead={p.platform_role === 'owner'} vip={vipOf(p.id)} all={vipProgrammes.length} /></p>
                            </div>
                            {viewerIsLead && p.platform_role !== 'owner' && vipProgrammes.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setVipFor(p)}
                                aria-label={`VIP access for ${p.name}`}
                                title="VIP access"
                                className={cx('rounded-full p-1.5 transition-all hover:bg-brand-tint hover:text-brand', vipOf(p.id).length ? 'text-brand' : 'text-smoke opacity-60 hover:opacity-100')}
                              >
                                <Icon name="star" className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => removeManager(m, p)}
                              disabled={busy}
                              aria-label={`Remove ${p.name} as manager of ${m.name}`}
                              className="rounded-full p-1.5 text-smoke opacity-60 transition-all hover:bg-red-50 hover:text-red-600 hover:opacity-100 disabled:opacity-40"
                            >
                              <Icon name="close" className="h-4 w-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          <VipAccessModal
            person={vipFor}
            programmes={vipProgrammes}
            grants={vipGrants}
            onClose={() => setVipFor(null)}
            onChanged={loadVip}
          />

          <PeoplePicker
            open={!!addingTo}
            onClose={() => setAddingTo(null)}
            people={addingTo ? everyone.filter((p) => !managersOf(addingTo).some((t) => t.id === p.id)) : []}
            onConfirm={(picked) => addManager(addingTo, picked)}
            title={addingTo ? `Add a manager to ${addingTo.name}` : ''}
            hint="Search any active creator. If they are not in this market yet, they join it as its manager."
            confirmLabel="Make manager"
            multi={false}
            busy={busy}
          />
        </div>
      )}
    </div>
  )
}
