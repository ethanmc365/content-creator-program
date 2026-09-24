import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { confirm, notice, promptText } from '../../lib/confirm'
import { toast } from '../../lib/toast'
import Icon from '../../components/Icon'
import PeoplePicker from '../../components/network/PeoplePicker'
import { Avatar, Badge, EmptyState, PageHeader, Skeleton } from '../../components/ui'
import { LEAD_TITLE_SHORT, TITLE_PRESETS, permissionLabel } from '../../lib/roles'
import { cx } from '../../lib/utils'

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

function RoleRow({ person, isMe, viewerIsLead, onTitle, onDemote, onHandOver, busy }) {
  const lead = person.platform_role === 'owner'
  return (
    <div className={cx(
      'flex flex-wrap items-center gap-3 rounded-card border bg-white px-5 py-4',
      lead ? 'border-brand/30 bg-brand-tint/20' : 'border-gray-100',
    )}>
      <Avatar src={person.photo_url} name={person.name} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <Link to={`/profile/${person.id}`} className="truncate font-semibold hover:text-brand">
            {person.name}
          </Link>
          {isMe && <span className="text-xs text-smoke">(you)</span>}
          {lead && <Badge tone="brand">{LEAD_TITLE_SHORT}</Badge>}
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

  const load = useCallback(async () => {
    const [{ data: roster, error }, { data: people }, { data: mk }, { data: mem }] = await Promise.all([
      supabase.rpc('team_roster'),
      supabase.from('profiles').select('id, name, photo_url, country_code, city, country')
        .eq('status', 'active').eq('is_test', false).order('name').limit(1000),
      supabase.from('communities').select('id, name, slug, kind').eq('kind', 'chapter').is('retired_at', null).order('name'),
      supabase.from('community_members').select('community_id, profile_id').eq('status', 'active').limit(5000),
    ])
    if (error) { notice(`Could not load the team: ${error.message}`); setTeam([]); return }
    setTeam(roster || [])
    setEveryone(people || [])
    setMarkets(mk || [])
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
    const ok = await confirm(
      `${person.name} will be able to edit ${market.name}, its rules and its roster. It does not make them a Tryp.com admin.`,
      { title: `Make ${person.name} a manager of ${market.name}?`, confirmLabel: 'Make manager' },
    )
    if (!ok) return
    setBusy(true)
    const already = memberIds[market.id]?.has(personId)
    const { error } = already
      ? await supabase.from('community_members').update({ role: 'manager' }).eq('community_id', market.id).eq('profile_id', personId)
      : await supabase.from('community_members').insert({ community_id: market.id, profile_id: personId, role: 'manager', status: 'active' })
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

  const lead = (team || []).find((t) => t.platform_role === 'owner')
  const admins = (team || []).filter((t) => t.platform_role === 'global_admin')
  const managersOf = (market) => (team || []).filter((t) => (t.market_slugs || []).includes(market.slug))

  return (
    <div className="page">
      <PageHeader
        back="/admin"
        title="Tryp.com team"
        subtitle="The worldwide team, then every market and who runs it."
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
          {/* ---- Worldwide: the lead and the Tryp.com team ---- */}
          <section>
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white">
                <Icon name="globe" className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-lg font-semibold leading-tight">Worldwide team</h2>
                <p className="text-xs text-smoke">Admins across every market.</p>
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
                />
              ) : (
                <EmptyState icon={<Icon name="shield" className="h-6 w-6" />} title="Nobody leads the programme" />
              )}
              {admins.map((p) => (
                <RoleRow key={p.id} person={p} isMe={p.id === profile?.id}
                  viewerIsLead={viewerIsLead} onTitle={setTitle} onDemote={demote} onHandOver={handOver} busy={busy} />
              ))}
            </div>
          </section>

          {/* ---- One card per market ---- */}
          <section>
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cloud text-brand">
                <Icon name="flag" className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-lg font-semibold leading-tight">Markets</h2>
                <p className="text-xs text-smoke">Who runs each market. A manager's reach stops at the market they manage.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {markets.map((m) => {
                const mgrs = managersOf(m)
                return (
                  <div key={m.id} className="flex flex-col rounded-card border border-gray-100 bg-white shadow-card">
                    <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3.5">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{m.name}</p>
                        <p className="text-xs text-smoke">
                          {(memberIds[m.id]?.size ?? 0).toLocaleString()} members · {mgrs.length === 0 ? 'no manager yet' : `${mgrs.length} manager${mgrs.length === 1 ? '' : 's'}`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAddingTo(m)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold transition-transform duration-200 hover:scale-105 hover:border-brand hover:text-brand"
                      >
                        <Icon name="plus" className="h-3.5 w-3.5" /> Add manager
                      </button>
                    </div>
                    {mgrs.length === 0 ? (
                      <p className="flex-1 px-5 py-4 text-sm text-smoke">
                        Nobody manages {m.name} yet. The worldwide team covers it until someone does.
                      </p>
                    ) : (
                      <ul className="flex-1 divide-y divide-gray-50">
                        {mgrs.map((p) => (
                          <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                            <Avatar src={p.photo_url} name={p.name} size="sm" />
                            <div className="min-w-0 flex-1">
                              <Link to={`/profile/${p.id}`} className="block truncate text-sm font-semibold hover:text-brand">{p.name}</Link>
                              <p className="truncate text-xs text-smoke">{p.role_title || (p.is_admin ? permissionLabel(p.platform_role) : 'Market manager')}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeManager(m, p)}
                              disabled={busy}
                              aria-label={`Remove ${p.name} as manager of ${m.name}`}
                              className="rounded-full p-1.5 text-smoke transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
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
