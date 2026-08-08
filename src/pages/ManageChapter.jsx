import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useCommunity } from '../context/CommunityContext'
import { confirm, notice, promptText } from '../lib/confirm'
import NetworkMotion from '../components/NetworkMotion'
import NetworkLayout, { flagFromIso } from '../components/network/NetworkLayout'
import { BigToggle } from './GlobalSettings'
import Segmented from '../components/network/Segmented'
import PeoplePicker from '../components/network/PeoplePicker'
import { MarketHeaderSkeleton, CardGridSkeleton } from '../components/network/Skeletons'
import { toast } from '../lib/toast'
import Icon from '../components/Icon'
import { Avatar, Badge, EmptyState, PageHeader } from '../components/ui'
import { scoringMode } from '../lib/scoring'
import { COUNTRIES } from '../lib/countries'
import { clearScopeCache } from '../lib/scope'
import { cx } from '../lib/utils'
import { listContainer, listItem, pageFade } from '../lib/motion'

// The country manager's desk: everything one market owns, and nothing that
// belongs to another one.
//
// Every control here is gated by `manages(chapter.id)`, which is
// my_managed_scopes() in the database. A Spain manager opening /manage/uk gets a
// read-only page and, more importantly, every write they attempt is refused by
// RLS rather than by this component choosing to hide a button.
//
// WHAT LEFT THIS PAGE
//
// Scoring rules. They used to live here as "the template every new challenge in
// this market starts with", which sounds tidy and was wrong: a market runs a
// points challenge one month and a best-video challenge the next, so a
// market-level rule set has no meaning half the time, and editing it silently
// changed the value of a challenge people were already competing in. Rules are
// written on the challenge that uses them.

const CURRENCIES = ['GBP', 'EUR', 'USD', 'SEK', 'DKK', 'NOK', 'RON', 'PLN', 'CHF']

const JOIN_POLICIES = [
  { value: 'country', label: 'Creators based here', icon: 'pin', hint: 'Country must match this market' },
  { value: 'open', label: 'Any creator', icon: 'globe', hint: 'Anyone in the network' },
  { value: 'invite', label: 'Invite only', icon: 'key', hint: 'A manager adds each person' },
]

const ADDABLE_ROOMS = [
  { key: 'meetups', label: 'Meetups', hint: 'Who is filming where, and when.', icon: 'calendar' },
  { key: 'introductions', label: 'Introductions', hint: 'New here? Say hello.', icon: 'users' },
  { key: 'feedback', label: 'Feedback', hint: 'Tell the team what would help.', icon: 'bulb' },
  { key: 'gear', label: 'Gear', hint: 'Kit, apps and what you shoot on.', icon: 'video' },
  { key: 'wins', label: 'Wins', hint: 'Post a result you are proud of.', icon: 'trophy' },
]

function Section({ icon, title, hint, children, action }) {
  return (
    <motion.section variants={listItem} className="card">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Icon name={icon} className="h-5 w-5 text-brand" /> {title}
          </h2>
          {hint && <p className="mt-1 max-w-xl text-sm text-smoke">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </motion.section>
  )
}

export default function ManageChapter() {
  const { slug } = useParams()
  const { profile } = useAuth()
  const { bySlug, manages, isGlobalAdmin, reload, loading: ctxLoading } = useCommunity()
  const chapter = bySlug(slug)
  const canManage = chapter ? manages(chapter.id) : false

  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState(null)
  const [saving, setSaving] = useState('')
  const [countryQuery, setCountryQuery] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    if (!chapter) return
    setLoading(true)
    const [{ data: members }, { data: chans }, { data: challenges }, { data: standings }, { data: everyone }] =
      await Promise.all([
        supabase.from('community_members')
          .select('profile_id, role, is_home, status, profiles!inner(id, name, photo_url, country_code, is_admin, is_test, status)')
          .eq('community_id', chapter.id).eq('status', 'active'),
        supabase.from('channels').select('id, key, label, hint, icon, visibility, post_policy, position')
          .eq('community_id', chapter.id).order('position'),
        supabase.from('challenges').select('id, title, status, scoring, end_date')
          .eq('community_id', chapter.id).order('end_date', { ascending: false }),
        supabase.from('community_standings').select('creator_id, points').eq('community_id', chapter.id),
        // For adding a creator by hand, which is the only way in when the
        // market is invite only.
        // city/country too: the picker searches on them, because "which Sam"
        // is answered by a face and a city, not by a surname.
        supabase.from('profiles').select('id, name, photo_url, country_code, city, country')
          .eq('status', 'active').eq('is_test', false).order('name').limit(500),
      ])
    setD({
      members: members || [],
      channels: chans || [],
      challenges: challenges || [],
      standings: standings || [],
      everyone: everyone || [],
    })
    setSettings({
      name: chapter.name,
      tagline: chapter.tagline || '',
      currency: chapter.currency,
      timezone: chapter.timezone || 'UTC',
      cpm_target: chapter.cpm_target,
      is_active: chapter.is_active,
      join_policy: chapter.join_policy || 'country',
      country_codes: chapter.country_codes || [],
      welcome: chapter.settings?.welcome || '',
      show_standings: chapter.settings?.show_standings !== false,
    })
    setLoading(false)
  }, [chapter])

  useEffect(() => { load() }, [load])

  const memberIds = useMemo(() => new Set((d?.members || []).map((m) => m.profile_id)), [d])
  const countryHits = useMemo(() => {
    const q = countryQuery.trim().toLowerCase()
    if (!q) return []
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.iso2.toLowerCase() === q,
    ).slice(0, 6)
  }, [countryQuery])

  async function saveSettings() {
    setSaving('settings')
    const { error } = await supabase.from('communities').update({
      name: settings.name,
      tagline: settings.tagline.trim() || null,
      currency: settings.currency,
      timezone: settings.timezone,
      cpm_target: settings.cpm_target,
      is_active: settings.is_active,
      join_policy: settings.join_policy,
      country_codes: settings.country_codes,
      settings: {
        ...(chapter.settings || {}),
        welcome: settings.welcome.trim() || null,
        show_standings: settings.show_standings,
      },
    }).eq('id', chapter.id)
    setSaving('')
    if (error) { notice(`Could not save: ${error.message}`); return }
    await reload()
    notice('Market settings saved.')
  }

  // ------------------------------------------------------------------ rooms
  async function addRoom(room) {
    const nextPos = Math.max(0, ...(d.channels.map((c) => c.position) || [0])) + 1
    const { error } = await supabase.from('channels').insert({
      community_id: chapter.id,
      key: room.key,
      label: room.label,
      hint: room.hint,
      icon: room.icon,
      post_policy: 'all',
      visibility: 'scope',
      position: nextPos,
    })
    if (error) { notice(`Could not add the room: ${error.message}`); return }
    await load()
  }

  async function renameRoom(ch) {
    const label = await promptText(`Rename ${ch.label}`, { defaultValue: ch.label, confirmLabel: 'Rename' })
    if (!label) return
    const { error } = await supabase.from('channels').update({ label }).eq('id', ch.id)
    if (error) { notice(error.message); return }
    await load()
  }

  async function removeRoom(ch) {
    // General and Announcements are structural: a market with no main room and
    // no way for the team to reach it is not a market.
    if (ch.key === 'general' || ch.key === 'announcements') {
      notice(`${ch.label} is part of every market and cannot be removed.`)
      return
    }
    const { count } = await supabase.from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('channel', `${chapter.slug}:${ch.key}`).eq('deleted', false)
    const ok = await confirm(
      count
        ? `${ch.label} has ${count} ${count === 1 ? 'message' : 'messages'} in it. Removing the room hides the conversation for good. Continue?`
        : `Remove ${ch.label}? It is empty, so nothing is lost.`,
    )
    if (!ok) return
    const { error } = await supabase.from('channels').delete().eq('id', ch.id)
    if (error) { notice(error.message); return }
    await load()
  }

  // Set, not toggle. A toggle cannot express "leave it as it is", which is what
  // a manager pressing the button that already describes the current state
  // almost always means.
  async function setRoomPolicy(ch, next) {
    if (next === ch.post_policy) return
    // Optimistic: the segmented control's highlight should move under the
    // finger, not after a round trip. Rolled back if the write fails.
    setD((cur) => ({
      ...cur,
      channels: cur.channels.map((c) => (c.id === ch.id ? { ...c, post_policy: next } : c)),
    }))
    const { error } = await supabase.from('channels').update({ post_policy: next }).eq('id', ch.id)
    if (error) {
      setD((cur) => ({
        ...cur,
        channels: cur.channels.map((c) => (c.id === ch.id ? { ...c, post_policy: ch.post_policy } : c)),
      }))
      notice(`Could not change who posts in ${ch.label}: ${error.message}`)
      return
    }
    toast(next === 'all' ? `Everyone can post in ${ch.label}` : `Only the team posts in ${ch.label}`)
  }

  // ---------------------------------------------------------------- people
  // Many at once. Adding creators to a market one native-select pick at a time
  // is the tedious version of the same job, and the native list cannot show a
  // face, which is what people actually recognise each other by.
  async function addMembers(ids) {
    if (!ids.length) return
    setAdding(true)
    const { error } = await supabase.from('community_members').insert(
      ids.map((profile_id) => ({
        community_id: chapter.id, profile_id, role: 'creator', is_home: false, status: 'active',
      })),
    )
    setAdding(false)
    if (error) { notice(`Could not add: ${error.message}`); return }
    clearScopeCache()
    setPickerOpen(false)
    await load()
    toast(`Added ${ids.length} ${ids.length === 1 ? 'creator' : 'creators'} to ${chapter.name}`, { tone: 'success' })
  }

  async function removeMember(member) {
    const ok = await confirm(
      `Remove ${member.profiles.name} from ${chapter.name}? They keep every point they earned here, and every connection they made stays.`,
    )
    if (!ok) return
    const { error } = await supabase.from('community_members').delete()
      .eq('community_id', chapter.id).eq('profile_id', member.profile_id)
    if (error) { notice(error.message); return }
    clearScopeCache()
    await load()
  }

  // Manual points. Every award lands in the same ledger the automatic ones do,
  // flagged is_auto=false so a recalculation never wipes a human decision.
  async function awardPoints(member) {
    const raw = await promptText(`How many points for ${member.profiles.name}?`, { placeholder: 'e.g. 2' })
    if (raw === null) return
    const pts = Number(raw)
    if (!Number.isFinite(pts) || pts === 0) { notice('Enter a number other than zero.'); return }
    // promptText returns null for BOTH cancel and an empty field, so a reason is
    // required rather than optional. Treating empty as "no reason given" would
    // make cancelling the dialog silently award the points.
    const reason = await promptText('What is this for? (required, it shows in their ledger)', {
      placeholder: 'e.g. Used the hook of the week',
    })
    if (reason === null) return
    const live = d.challenges.find((c) => c.status === 'active' && c.scoring === 'points')
    const { error } = await supabase.from('point_awards').insert({
      community_id: chapter.id,
      challenge_id: live?.id ?? null,
      creator_id: member.profile_id,
      points: pts,
      reason: reason || 'Awarded by the team',
      is_auto: false,
      awarded_by: profile?.id ?? null,
    })
    if (error) { notice(`Could not award: ${error.message}`); return }
    await load()
    notice(`${pts > 0 ? 'Awarded' : 'Deducted'} ${Math.abs(pts)} points.`)
  }

  async function setRole(member, role) {
    const ok = await confirm(
      role === 'manager'
        ? `Make ${member.profiles.name} a manager of ${chapter.name}? They will be able to edit this market, its rules and its roster.`
        : `Remove manager rights from ${member.profiles.name}?`
    )
    if (!ok) return
    const { error } = await supabase.from('community_members').update({ role })
      .eq('community_id', chapter.id).eq('profile_id', member.profile_id)
    if (error) { notice(`Could not change role: ${error.message}`); return }
    await load()
  }

  if (ctxLoading && !chapter) {
    return <NetworkLayout><MarketHeaderSkeleton /></NetworkLayout>
  }

  if (!chapter) {
    return (
      <NetworkLayout>
        <EmptyState icon={<Icon name="pin" className="h-6 w-6" />} title="No such market"
          hint={`Nothing here is called "${slug}".`}
          action={<Link to="/global" className="btn-secondary">Back to Worldwide</Link>} />
      </NetworkLayout>
    )
  }

  if (!canManage) {
    return (
      <NetworkLayout>
        <EmptyState icon={<Icon name="shield" className="h-6 w-6" />} title="Not your market"
          hint={`You do not manage ${chapter.name}. Managers are set per market, so running one gives you no access to another.`}
          action={<Link to={`/c/${slug}`} className="btn-secondary">View the market</Link>} />
      </NetworkLayout>
    )
  }

  const standingsBy = new Map((d?.standings || []).map((s) => [s.creator_id, Number(s.points)]))
  const realMembers = (d?.members || []).filter((m) => !m.profiles.is_test)
  const roomsToAdd = ADDABLE_ROOMS.filter((r) => !(d?.channels || []).some((c) => c.key === r.key))

  return (
    <NetworkMotion>
      <NetworkLayout>
      <motion.div {...pageFade}>
        <Link to={`/c/${slug}`} className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-smoke transition-colors hover:text-brand">
          <Icon name="chevronLeft" className="h-4 w-4" />
          {chapter.name}
        </Link>

        <PageHeader
          title={`Manage ${chapter.name}`}
          subtitle="Everything this market owns. Nothing here reaches another market."
          action={<Badge tone={chapter.is_active ? 'green' : 'grey'}>{chapter.is_active ? 'Open' : 'Closed'}</Badge>}
        />

        {loading || !settings ? (
          <div className="space-y-6"><CardGridSkeleton count={1} cols="grid-cols-1" height="h-56" /><CardGridSkeleton count={1} cols="grid-cols-1" height="h-72" /></div>
        ) : (
          <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-6">

            {/* ---------------- Visibility ---------------- */}
            {/* First, and its own card, because it is the setting with the
                largest blast radius and it used to be a 16px checkbox tucked
                into the corner of a grid. */}
            <Section icon="eye" title="Visibility"
              hint="A closed market is invisible to creators: it does not appear in the market list, its challenges are unreadable and nobody can join it.">
              <BigToggle
                on={settings.is_active}
                onChange={(v) => setSettings({ ...settings, is_active: v })}
                title={`${chapter.name} is ${settings.is_active ? 'open to creators' : 'closed'}`}
                hint={settings.is_active
                  ? 'Creators can find it, join it and enter its challenges.'
                  : 'Only you and its managers can see it. Turn it on when the first brief is ready.'}
                onLabel="Open"
                offLabel="Closed"
              />
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium">Who can join</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {JOIN_POLICIES.map((p) => (
                    <button key={p.value} type="button"
                      onClick={() => setSettings({ ...settings, join_policy: p.value })}
                      aria-pressed={settings.join_policy === p.value}
                      className={cx(
                        'flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left transition-all duration-200 hover:-translate-y-0.5',
                        settings.join_policy === p.value
                          ? 'border-brand bg-brand-tint/40'
                          : 'border-gray-200 bg-white hover:border-brand/40',
                      )}>
                      <Icon name={p.icon} className={cx('h-4 w-4 shrink-0', settings.join_policy === p.value ? 'text-brand' : 'text-smoke')} />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{p.label}</span>
                        <span className="block text-xs text-smoke">{p.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-5 flex justify-end">
                <button onClick={saveSettings} disabled={saving === 'settings'} className="btn-primary !py-2 !px-5 !text-sm">
                  {saving === 'settings' ? 'Saving…' : 'Save'}
                </button>
              </div>
            </Section>

            {/* ---------------- Identity ---------------- */}
            <Section icon="pencil" title="Identity" hint="How this market introduces itself."
              action={
                <button onClick={saveSettings} disabled={saving === 'settings'} className="btn-primary !py-2 !px-5 !text-sm">
                  {saving === 'settings' ? 'Saving…' : 'Save'}
                </button>
              }>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Name</span>
                  <input className="input" value={settings.name}
                    onChange={(e) => setSettings({ ...settings, name: e.target.value })} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Tagline</span>
                  <input className="input" value={settings.tagline} maxLength={120}
                    placeholder={`Challenges, briefs and rooms for ${chapter.name}.`}
                    onChange={(e) => setSettings({ ...settings, tagline: e.target.value })} />
                  <span className="mt-1 block text-xs text-smoke">One line, shown under the market name.</span>
                </label>
              </div>

              <label className="mt-4 block">
                <span className="mb-1.5 block text-sm font-medium">Welcome message</span>
                <textarea className="input" rows={3} value={settings.welcome} maxLength={600}
                  placeholder="Shown to a creator the first time they open this market. What is it for, what is expected, what is coming up."
                  onChange={(e) => setSettings({ ...settings, welcome: e.target.value })} />
              </label>

              <div className="mt-4">
                <p className="mb-1.5 text-sm font-medium">Countries</p>
                <p className="mb-2 text-xs text-smoke">
                  Who is suggested this market at signup, and under the default rule, who may join it.
                </p>
                <div className="mb-2 flex flex-wrap gap-2">
                  {settings.country_codes.map((c) => (
                    <button key={c} type="button"
                      onClick={() => setSettings({ ...settings, country_codes: settings.country_codes.filter((x) => x !== c) })}
                      className="flex items-center gap-1.5 rounded-full border border-brand bg-brand-tint px-3 py-1.5 text-sm font-medium text-brand transition-transform duration-200 hover:scale-105">
                      {flagFromIso(c)} {COUNTRIES.find((x) => x.iso2 === c)?.name || c}
                      <Icon name="close" className="h-3 w-3" />
                    </button>
                  ))}
                  {settings.country_codes.length === 0 && <span className="text-xs text-smoke">None.</span>}
                </div>
                <input className="input" value={countryQuery} placeholder="Search a country to add…"
                  onChange={(e) => setCountryQuery(e.target.value)} />
                {countryHits.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {countryHits.map((c) => (
                      <button key={c.iso2} type="button" disabled={settings.country_codes.includes(c.iso2)}
                        onClick={() => { setSettings({ ...settings, country_codes: [...settings.country_codes, c.iso2] }); setCountryQuery('') }}
                        className="rounded-full border border-gray-200 px-3 py-1.5 text-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:text-brand disabled:opacity-40">
                        {flagFromIso(c.iso2)} {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Section>

            {/* ---------------- Operating ---------------- */}
            <Section icon="wallet" title="Money and time" hint="Never shown to a creator."
              action={
                <button onClick={saveSettings} disabled={saving === 'settings'} className="btn-primary !py-2 !px-5 !text-sm">
                  {saving === 'settings' ? 'Saving…' : 'Save'}
                </button>
              }>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Currency</span>
                  <select className="input" value={settings.currency}
                    onChange={(e) => setSettings({ ...settings, currency: e.target.value })}>
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Timezone</span>
                  <input className="input" value={settings.timezone}
                    onChange={(e) => setSettings({ ...settings, timezone: e.target.value })} />
                  <span className="mt-1 block text-xs text-smoke">Deadlines land at local midnight here.</span>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">CPM target</span>
                  <input type="number" step="0.01" className="input" value={settings.cpm_target}
                    onChange={(e) => setSettings({ ...settings, cpm_target: Number(e.target.value) })} />
                  <span className="mt-1 block text-xs text-smoke">
                    Each market sets its own. Cost per 1,000 views to beat.
                  </span>
                </label>
              </div>
              <div className="mt-4">
                <BigToggle
                  on={settings.show_standings}
                  onChange={(v) => setSettings({ ...settings, show_standings: v })}
                  title="Show a standings table in this market"
                  hint="Turn off for a market where ranking creators against each other would do more harm than good."
                  onLabel="Shown"
                  offLabel="Hidden"
                />
              </div>
            </Section>

            {/* ---------------- Rooms ---------------- */}
            <Section icon="chat" title="Rooms"
              hint="This market's own channels. General and Announcements are part of every market; the rest are yours to choose.">
              {/* Each room is a small editor, not a row of same-looking pills.
                  The old version had a button whose LABEL WAS ITS STATE
                  ("Everyone posts"), so you could not tell whether it described
                  the room or offered to change it, and one click silently made
                  a market's main room staff-only with nothing to undo it. */}
              <div className="space-y-2.5">
                {d.channels.map((ch) => (
                  <div key={ch.id} className="rounded-xl border border-gray-100 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Icon name={ch.icon || 'chat'} className="h-4 w-4 shrink-0 text-brand" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{ch.label}</span>
                      {ch.key === 'general' && <Badge tone="light">Main room</Badge>}
                      {ch.visibility === 'staff' && <Badge tone="grey">Staff only</Badge>}
                      <button onClick={() => renameRoom(ch)}
                        className="shrink-0 rounded-full border border-gray-200 px-3 py-1 text-xs font-medium transition-transform duration-200 hover:scale-105 hover:border-brand hover:text-brand">
                        Rename
                      </button>
                      {ch.key !== 'general' && ch.key !== 'announcements' && (
                        <button onClick={() => removeRoom(ch)} aria-label={`Remove ${ch.label}`}
                          className="shrink-0 rounded-lg p-1.5 text-smoke transition-colors hover:bg-red-50 hover:text-red-600">
                          <Icon name="trash" className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <span className="text-xs font-medium text-smoke">Who can post</span>
                      <Segmented
                        size="sm"
                        id={`post-${ch.id}`}
                        label={`Who can post in ${ch.label}`}
                        value={ch.post_policy}
                        onChange={(v) => setRoomPolicy(ch, v)}
                        options={[
                          { value: 'all', label: 'Everyone' },
                          { value: 'staff', label: 'Team only' },
                        ]}
                      />
                      {ch.key === 'announcements' && ch.post_policy === 'all' && (
                        <span className="text-xs text-amber-700">
                          Announcements is usually team only.
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {roomsToAdd.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-smoke">Add a room</p>
                  <div className="flex flex-wrap gap-2">
                    {roomsToAdd.map((r) => (
                      <button key={r.key} onClick={() => addRoom(r)} className="btn-secondary !py-2 !px-4 !text-sm">
                        <Icon name={r.icon} className="h-4 w-4" /> {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Section>

            {/* ---------------- Challenges ---------------- */}
            <Section icon="flag" title="Challenges" hint="Everything this market has run. Scoring is set on each challenge."
              action={
                <Link to={`/admin/challenges/new?market=${chapter.slug}`} className="btn-primary !py-2 !px-5 !text-sm">
                  + New
                </Link>
              }>
              {d.challenges.length === 0 ? (
                <p className="rounded-xl bg-cloud px-4 py-6 text-center text-sm text-smoke">No challenges yet.</p>
              ) : (
                <div className="space-y-2">
                  {d.challenges.map((c) => {
                    const mode = scoringMode(c.scoring)
                    return (
                      <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 px-4 py-3">
                        <Link to={`/challenges/${c.id}`}
                          className="min-w-0 flex-1 truncate font-medium transition-colors hover:text-brand">
                          {c.title}
                        </Link>
                        <Badge tone="light" className="shrink-0">
                          <Icon name={mode.icon} className="h-3 w-3" /> {mode.short}
                        </Badge>
                        <Badge tone={c.status === 'active' ? 'green' : 'grey'} className="shrink-0">{c.status}</Badge>
                        <Link to={`/admin/challenges/${c.id}`}
                          className="shrink-0 rounded-full border border-gray-200 px-3 py-1 text-xs font-medium transition-transform duration-200 hover:scale-105 hover:border-brand hover:text-brand">
                          Edit
                        </Link>
                      </div>
                    )
                  })}
                </div>
              )}
            </Section>

            {/* ---------------- Roster ---------------- */}
            <Section icon="users" title={`Creators (${realMembers.length})`}
              hint="Everyone in this market. Points shown are their total here.">
              <div className="space-y-1.5">
                {realMembers.length === 0 && (
                  <p className="rounded-xl bg-cloud px-4 py-6 text-center text-sm text-smoke">
                    Nobody has joined this market yet.
                  </p>
                )}
                {realMembers
                  .slice()
                  .sort((a, b) => (standingsBy.get(b.profile_id) || 0) - (standingsBy.get(a.profile_id) || 0))
                  .map((m) => (
                    <div key={m.profile_id} className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 px-4 py-2.5">
                      <Avatar src={m.profiles.photo_url} name={m.profiles.name} size="xs" />
                      <Link to={`/profile/${m.profile_id}`} className="min-w-0 truncate text-sm font-medium hover:text-brand">
                        {m.profiles.name}
                      </Link>
                      {m.role === 'manager' && <Badge tone="light">Manager</Badge>}
                      {m.profiles.is_admin && <Badge tone="grey">Team</Badge>}
                      <span className="ml-auto shrink-0 text-sm font-semibold text-brand">
                        {standingsBy.get(m.profile_id) ?? 0} pts
                      </span>
                      <button onClick={() => awardPoints(m)}
                        className="shrink-0 rounded-full border border-gray-200 px-3 py-1 text-xs font-medium transition-transform duration-200 hover:scale-105 hover:border-brand hover:text-brand">
                        Award
                      </button>
                      <button onClick={() => setRole(m, m.role === 'manager' ? 'creator' : 'manager')}
                        className="shrink-0 rounded-full border border-gray-200 px-3 py-1 text-xs font-medium transition-transform duration-200 hover:scale-105 hover:border-brand hover:text-brand">
                        {m.role === 'manager' ? 'Demote' : 'Make manager'}
                      </button>
                      <button onClick={() => removeMember(m)} aria-label={`Remove ${m.profiles.name}`}
                        className="shrink-0 rounded-lg p-1.5 text-smoke transition-colors hover:bg-red-50 hover:text-red-600">
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
              </div>

              {/* Adding by hand. The only route in for an invite-only market,
                  and the fix for a creator whose profile country is wrong. */}
              <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl bg-cloud/60 p-4">
                <button onClick={() => setPickerOpen(true)} className="btn-primary !py-2.5">
                  <Icon name="users" className="h-4 w-4" /> Add creators
                </button>
                <p className="min-w-0 flex-1 text-xs text-smoke">
                  Adding someone here bypasses the join rule. It does not change their home market.
                </p>
              </div>
            </Section>

            {isGlobalAdmin && (
              <Section icon="shield" title="Platform" hint="Global admin only.">
                <Link to="/global/settings" className="btn-secondary !py-2.5">
                  <Icon name="globe" className="h-4 w-4" /> Network settings
                </Link>
              </Section>
            )}
          </motion.div>
        )}
      </motion.div>

      <PeoplePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        people={(d?.everyone || []).filter((p) => !memberIds.has(p.id))}
        onConfirm={addMembers}
        busy={adding}
        title={`Add creators to ${chapter.name}`}
        hint="Search by name or city. Pick as many as you like."
        confirmLabel="Add"
      />
      </NetworkLayout>
    </NetworkMotion>
  )
}
