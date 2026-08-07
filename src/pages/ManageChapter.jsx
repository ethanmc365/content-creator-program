import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useCommunity } from '../context/CommunityContext'
import { confirm, notice, promptText } from '../lib/confirm'
import NetworkMotion from '../components/NetworkMotion'
import NetworkLayout from '../components/network/NetworkLayout'
import Icon from '../components/Icon'
import { Badge, EmptyState, PageHeader, Skeleton } from '../components/ui'
import { listContainer, listItem, pageFade } from '../lib/motion'

// The country manager's desk: everything one market owns, and nothing that
// belongs to another one.
//
// Every control here is gated by `manages(chapter.id)`, which is
// my_managed_scopes() in the database. A Spain manager opening /manage/uk gets
// a read-only page and, more importantly, every write they attempt is refused
// by RLS rather than by this component choosing to hide a button.

const CURRENCIES = ['GBP', 'EUR', 'USD', 'SEK', 'DKK', 'NOK', 'RON', 'PLN', 'CHF']

function Section({ icon, title, hint, children, action }) {
  return (
    <motion.section variants={listItem} className="card">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Icon name={icon} className="h-5 w-5 text-brand" /> {title}
          </h2>
          {hint && <p className="mt-1 text-sm text-smoke">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </motion.section>
  )
}

// One editable rule row. Kept dumb on purpose: the parent owns the list so a
// rule can be reordered or removed without this component knowing how.
function RuleRow({ rule, onChange, onRemove, disabled }) {
  const isThreshold = rule.kind === 'views_threshold'
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2.5">
      <Icon
        name={isThreshold ? 'chart' : rule.kind === 'bonus' ? 'star' : 'video'}
        className="h-4 w-4 shrink-0 text-brand"
      />
      <input
        className="input !w-auto min-w-0 flex-1 !py-1.5 !text-sm"
        value={rule.label}
        disabled={disabled}
        onChange={(e) => onChange({ ...rule, label: e.target.value })}
        aria-label="Rule name"
      />
      {isThreshold && (
        <label className="flex items-center gap-1.5 text-xs text-smoke">
          over
          <input
            type="number"
            className="input !w-24 !py-1.5 !text-sm"
            value={rule.threshold ?? ''}
            disabled={disabled}
            onChange={(e) => onChange({ ...rule, threshold: e.target.value === '' ? null : Number(e.target.value) })}
            aria-label="View threshold"
          />
          views
        </label>
      )}
      {rule.kind === 'per_post' && (
        <label className="flex items-center gap-1.5 text-xs text-smoke">
          max
          <input
            type="number"
            className="input !w-20 !py-1.5 !text-sm"
            value={rule.max_points ?? ''}
            disabled={disabled}
            onChange={(e) => onChange({ ...rule, max_points: e.target.value === '' ? null : Number(e.target.value) })}
            aria-label="Maximum points"
          />
        </label>
      )}
      <label className="flex items-center gap-1.5 text-xs font-semibold text-ink">
        <input
          type="number"
          step="0.5"
          className="input !w-20 !py-1.5 !text-sm"
          value={rule.points}
          disabled={disabled}
          onChange={(e) => onChange({ ...rule, points: Number(e.target.value) })}
          aria-label="Points"
        />
        pts
      </label>
      {!disabled && (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-lg p-1.5 text-smoke transition-colors hover:bg-red-50 hover:text-red-600"
          aria-label={`Remove ${rule.label}`}
        >
          <Icon name="trash" className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

export default function ManageChapter() {
  const { slug } = useParams()
  const { profile } = useAuth()
  const { bySlug, manages, reload, loading: ctxLoading } = useCommunity()
  const chapter = bySlug(slug)
  const canManage = chapter ? manages(chapter.id) : false

  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState(null)
  const [rules, setRules] = useState([])
  const [saving, setSaving] = useState('')

  const load = useCallback(async () => {
    if (!chapter) return
    setLoading(true)
    const [{ data: members }, { data: chans }, { data: challenges }, { data: tmpl }, { data: standings }] =
      await Promise.all([
        supabase.from('community_members')
          .select('profile_id, role, is_home, status, profiles!inner(id, name, photo_url, country_code, is_admin, is_test, status)')
          .eq('community_id', chapter.id).eq('status', 'active'),
        supabase.from('channels').select('id, key, label, hint, icon, visibility, post_policy, position')
          .eq('community_id', chapter.id).order('position'),
        supabase.from('challenges').select('id, title, status, scoring, end_date, threshold_mode')
          .eq('community_id', chapter.id).order('end_date', { ascending: false }),
        supabase.from('point_rules').select('*').eq('community_id', chapter.id).is('challenge_id', null).order('position'),
        supabase.from('community_standings').select('creator_id, points').eq('community_id', chapter.id),
      ])
    setD({
      members: members || [],
      channels: chans || [],
      challenges: challenges || [],
      standings: standings || [],
    })
    setRules(tmpl || [])
    setSettings({
      name: chapter.name,
      currency: chapter.currency,
      cpm_target: chapter.cpm_target,
      is_active: chapter.is_active,
    })
    setLoading(false)
  }, [chapter])

  useEffect(() => { load() }, [load])

  async function saveSettings() {
    setSaving('settings')
    const { error } = await supabase.from('communities').update({
      name: settings.name,
      currency: settings.currency,
      cpm_target: settings.cpm_target,
      is_active: settings.is_active,
    }).eq('id', chapter.id)
    setSaving('')
    if (error) { notice(`Could not save: ${error.message}`); return }
    await reload()
    notice('Market settings saved.')
  }

  // The whole rule set is replaced rather than diffed. A market has a handful of
  // rules, and replace-all removes an entire class of bug where a deleted row is
  // left behind because the diff missed it.
  async function saveRules() {
    setSaving('rules')
    const { error: delErr } = await supabase.from('point_rules')
      .delete().eq('community_id', chapter.id).is('challenge_id', null)
    if (delErr) { setSaving(''); notice(`Could not save: ${delErr.message}`); return }
    if (rules.length) {
      const { error } = await supabase.from('point_rules').insert(
        rules.map((r, i) => ({
          community_id: chapter.id,
          challenge_id: null,
          kind: r.kind,
          label: r.label,
          points: r.points,
          threshold: r.kind === 'views_threshold' ? r.threshold : null,
          max_points: r.kind === 'per_post' ? r.max_points : null,
          position: i,
          is_active: true,
        }))
      )
      if (error) { setSaving(''); notice(`Could not save: ${error.message}`); return }
    }
    setSaving('')
    await load()
    notice('Scoring rules saved. New challenges in this market will start with them.')
  }

  function addRule(kind) {
    setRules((r) => [...r, {
      id: `new-${r.length}-${kind}`,
      kind,
      label: kind === 'per_post' ? 'Video posted' : kind === 'views_threshold' ? 'Passed 10,000 views' : 'Bonus',
      points: kind === 'views_threshold' ? 5 : 1,
      threshold: kind === 'views_threshold' ? 10000 : null,
      max_points: kind === 'per_post' ? 10 : null,
    }])
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
    return <NetworkLayout><Skeleton className="h-64" /></NetworkLayout>
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

  return (
    <NetworkMotion>
      <NetworkLayout>
      <motion.div {...pageFade} className="page">
        <Link to={`/c/${slug}`} className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-smoke transition-colors hover:text-brand">
          <Icon name="chevronLeft" className="h-4 w-4" />
          {chapter.name}
        </Link>

        <PageHeader
          title={`Manage ${chapter.name}`}
          subtitle="Everything this market owns. Nothing here reaches another market."
          action={<Badge tone={chapter.is_active ? 'light' : 'grey'}>{chapter.is_active ? 'Open' : 'Closed'}</Badge>}
        />

        {loading || !settings ? (
          <div className="space-y-4"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
        ) : (
          <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-6">

            {/* ---------------- Settings ---------------- */}
            <Section icon="pencil" title="Market settings" hint="The basics every market carries."
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
                  <span className="mb-1.5 block text-sm font-medium">Currency</span>
                  <select className="input" value={settings.currency}
                    onChange={(e) => setSettings({ ...settings, currency: e.target.value })}>
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">CPM target</span>
                  <input type="number" step="0.01" className="input" value={settings.cpm_target}
                    onChange={(e) => setSettings({ ...settings, cpm_target: Number(e.target.value) })} />
                  <span className="mt-1 block text-xs text-smoke">
                    Each market sets its own. Lead with cost per accepted asset; CPM is the number a paid media team will ask for.
                  </span>
                </label>
                <label className="flex items-start gap-3 pt-7">
                  <input type="checkbox" checked={settings.is_active} className="mt-0.5 h-4 w-4 accent-[#d94407]"
                    onChange={(e) => setSettings({ ...settings, is_active: e.target.checked })} />
                  <span>
                    <span className="block text-sm font-medium">Open to creators</span>
                    <span className="block text-xs text-smoke">A closed market is invisible and unjoinable.</span>
                  </span>
                </label>
              </div>
            </Section>

            {/* ---------------- Scoring ---------------- */}
            <Section icon="trophy" title="Scoring rules"
              hint="The template every new challenge in this market starts with. Editing it never rescores a challenge already running."
              action={
                <button onClick={saveRules} disabled={saving === 'rules'} className="btn-primary !py-2 !px-5 !text-sm">
                  {saving === 'rules' ? 'Saving…' : 'Save rules'}
                </button>
              }>
              <div className="space-y-2">
                {rules.length === 0 && (
                  <p className="rounded-xl bg-cloud px-4 py-6 text-center text-sm text-smoke">
                    No scoring rules yet. Add one below and this market can run a points challenge.
                  </p>
                )}
                {rules.map((r, i) => (
                  <RuleRow key={r.id}
                    rule={r}
                    onChange={(next) => setRules((all) => all.map((x, j) => (j === i ? next : x)))}
                    onRemove={() => setRules((all) => all.filter((_, j) => j !== i))}
                  />
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => addRule('per_post')} className="btn-secondary !py-2 !px-4 !text-sm">
                  <Icon name="video" className="h-4 w-4" /> Per post
                </button>
                <button onClick={() => addRule('views_threshold')} className="btn-secondary !py-2 !px-4 !text-sm">
                  <Icon name="chart" className="h-4 w-4" /> View milestone
                </button>
                <button onClick={() => addRule('bonus')} className="btn-secondary !py-2 !px-4 !text-sm">
                  <Icon name="star" className="h-4 w-4" /> Bonus
                </button>
              </div>
            </Section>

            {/* ---------------- Challenges ---------------- */}
            <Section icon="flag" title="Challenges" hint="Everything this market has run.">
              {d.challenges.length === 0 ? (
                <p className="rounded-xl bg-cloud px-4 py-6 text-center text-sm text-smoke">No challenges yet.</p>
              ) : (
                <div className="space-y-2">
                  {d.challenges.map((c) => (
                    <Link key={c.id} to={`/challenges/${c.id}`}
                      className="flex items-center gap-3 rounded-xl border border-gray-100 px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card">
                      <span className="truncate font-medium">{c.title}</span>
                      <Badge tone={c.scoring === 'points' ? 'light' : 'grey'} className="ml-auto shrink-0">
                        {c.scoring === 'points' ? 'Points' : 'Prize'}
                      </Badge>
                      <Badge tone={c.status === 'active' ? 'green' : 'grey'} className="shrink-0">{c.status}</Badge>
                    </Link>
                  ))}
                </div>
              )}
            </Section>

            {/* ---------------- Rooms ---------------- */}
            <Section icon="chat" title="Rooms" hint="This market's own channels, alongside the worldwide ones.">
              <div className="grid gap-2 sm:grid-cols-2">
                {d.channels.map((ch) => (
                  <div key={ch.id} className="flex items-center gap-2 rounded-xl border border-gray-100 px-4 py-3">
                    <Icon name={ch.icon || 'chat'} className="h-4 w-4 shrink-0 text-brand" />
                    <span className="truncate text-sm font-medium">{ch.label}</span>
                    {ch.visibility === 'staff' && <Badge tone="grey" className="ml-auto shrink-0">Staff</Badge>}
                    {ch.post_policy === 'staff' && ch.visibility !== 'staff' && (
                      <Badge tone="grey" className="ml-auto shrink-0">Read only</Badge>
                    )}
                  </div>
                ))}
              </div>
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
                      <Link to={`/profile/${m.profile_id}`} className="truncate text-sm font-medium hover:text-brand">
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
                    </div>
                  ))}
              </div>
            </Section>
          </motion.div>
        )}
      </motion.div>
      </NetworkLayout>
    </NetworkMotion>
  )
}
