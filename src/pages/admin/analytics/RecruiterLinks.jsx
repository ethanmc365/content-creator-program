import { useEffect, useMemo, useState } from 'react'
import { Avatar, Select, Skeleton } from '../../../components/ui'
import Icon from '../../../components/Icon'
import { teamApi } from '../../../api/team'
import { profilesApi } from '../../../api/profiles'
import { confirm, notice } from '../../../lib/confirm'
import { toastSuccess } from '../../../lib/toast'
import { cx, timeAgo } from '../../../lib/utils'

// RECRUITER LINKS (20 Oct 2026, migration 449). A permanent link per team member and audience, e.g. Paula's
// /r/paula (the general community) and /r/paula-vip (the VIP sign-up). Opening one counts a click and remembers the
// link on that device, so the sign-up that follows is credited to it here: clicks, sign-ups, finished onboarding,
// approved (community) or joined as a VIP. Links never expire; archiving one stops it counting new clicks.
const ORIGIN = 'https://trypcreators.vercel.app'
const KINDS = [{ value: 'community', label: 'General community' }, { value: 'vip', label: 'VIP' }]
const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30)

export default function RecruiterLinks() {
  const [links, setLinks] = useState(null)
  const [stats, setStats] = useState({})
  const [team, setTeam] = useState([])
  const [tick, setTick] = useState(0)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    Promise.all([
      teamApi.recruitLinks().select('*').is('archived_at', null).order('created_at'),
      teamApi.recruitLinkStats(),
      profilesApi.profiles().select('id, name, photo_url, role_title, is_test').eq('is_admin', true).order('name'),
    ]).then(([l, s, t]) => {
      if (!alive) return
      if (l.error) { setError(l.error.message); return }
      setLinks(l.data || [])
      setStats(Object.fromEntries((s.data || []).map((r) => [r.link_id, r])))
      setTeam((t.data || []).filter((p) => !p.is_test))
    })
    return () => { alive = false }
  }, [tick])

  const byId = useMemo(() => Object.fromEntries(team.map((p) => [p.id, p])), [team])

  async function copy(code) {
    try { await navigator.clipboard.writeText(`${ORIGIN}/r/${code}`); toastSuccess('Link copied') } catch { notice(`${ORIGIN}/r/${code}`, { title: 'The link' }) }
  }
  async function archive(l) {
    if (!(await confirm(`Archive /r/${l.code}? It stops counting new clicks, and anybody opening it lands on the normal sign-up. Its sign-ups so far stay counted.`, { confirmLabel: 'Archive' }))) return
    const { error: e } = await teamApi.recruitLinks().update({ archived_at: new Date().toISOString() }).eq('id', l.id)
    if (e) { notice(e.message?.includes('SANDBOX') ? 'The demo account cannot change links.' : e.message); return }
    setTick((n) => n + 1)
  }

  return (
    <section className="card animate-rise" style={{ animationDelay: '80ms' }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Recruiter links</h2>
          <p className="mt-1 text-xs text-smoke">Permanent links for team members who bring people in. Every click and sign-up through a link is counted here.</p>
        </div>
        <button type="button" onClick={() => setAdding((a) => !a)} aria-expanded={adding}
          className={cx('inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-all', adding ? 'bg-cloud text-ink' : 'bg-brand text-white shadow-card hoverable:hover:-translate-y-0.5')}>
          <Icon name={adding ? 'close' : 'plus'} className="h-4 w-4" />{adding ? 'Cancel' : 'New link'}
        </button>
      </div>

      {adding && <NewLink team={team} taken={new Set((links || []).map((l) => l.code))} onDone={() => { setAdding(false); setTick((n) => n + 1) }} />}

      {error && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {!links && !error && <Skeleton className="mt-4 h-28 w-full rounded-xl" />}
      {links && links.length === 0 && (
        <p className="mt-4 rounded-xl bg-cloud/60 px-4 py-8 text-center text-sm text-smoke">No recruiter links yet. Press New link to make one.</p>
      )}
      {links && links.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="text-left text-[13px] text-smoke">
                <th className="py-2 pr-3 font-semibold">Who</th>
                <th className="py-2 pr-3 font-semibold">Link</th>
                <th className="py-2 pr-3 text-right font-semibold">Clicks</th>
                <th className="py-2 pr-3 text-right font-semibold">Signed up</th>
                <th className="py-2 pr-3 text-right font-semibold">Finished</th>
                <th className="py-2 pr-3 text-right font-semibold">Approved / VIP</th>
                <th className="py-2 pr-3 font-semibold">Last sign-up</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {links.map((l) => {
                const p = byId[l.owner_id]
                const s = stats[l.id] || {}
                const vip = l.kind === 'vip'
                return (
                  <tr key={l.id} className="border-t border-gray-100">
                    <td className="py-3 pr-3">
                      <span className="flex items-center gap-2.5">
                        <Avatar src={p?.photo_url} name={p?.name || '?'} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-ink">{p?.name || 'Former team member'}</span>
                          <span className="block text-[13px] text-smoke">{l.label || p?.role_title || ''}</span>
                        </span>
                      </span>
                    </td>
                    <td className="py-3 pr-3">
                      <span className="flex items-center gap-2">
                        <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide', vip ? 'bg-ink text-white' : 'bg-brand-tint text-brand')}>{vip ? 'VIP' : 'Community'}</span>
                        <button type="button" onClick={() => copy(l.code)} title="Copy the link"
                          className="group inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 font-mono text-[13px] text-ink transition-colors hoverable:hover:bg-cloud">
                          /r/{l.code}<Icon name="copy" className="h-3.5 w-3.5 text-smoke group-hover:text-brand" />
                        </button>
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums">{l.clicks}</td>
                    <td className="py-3 pr-3 text-right font-semibold tabular-nums">{s.signups ?? 0}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{s.finished ?? 0}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{vip ? (s.vips ?? 0) : (s.approved ?? 0)}</td>
                    <td className="py-3 pr-3 text-[13px] text-smoke">{s.last_signup ? timeAgo(s.last_signup) : '-'}</td>
                    <td className="py-3 text-right">
                      <button type="button" onClick={() => archive(l)} aria-label={`Archive /r/${l.code}`} className="rounded-lg p-1.5 text-gray-400 transition-colors hoverable:hover:bg-cloud hoverable:hover:text-ink">
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[13px] text-smoke">
        A community link opens the normal sign-up; a VIP link opens the VIP sign-up. Sign-ups count from the moment a link exists,
        and the link someone opened last before signing up gets the credit.
      </p>
    </section>
  )
}

function NewLink({ team, taken, onDone }) {
  const [owner, setOwner] = useState('')
  const [kind, setKind] = useState('community')
  const [code, setCode] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const person = team.find((p) => p.id === owner)
  const suggested = person ? `${slug(person.name.split(' ')[0])}${kind === 'vip' ? '-vip' : ''}` : ''
  const value = touched ? code : suggested
  const valid = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(value)
  async function create() {
    if (!owner || !valid) return
    if (taken.has(value)) { notice(`/r/${value} is already a link. Pick another ending.`); return }
    setBusy(true)
    const { error } = await teamApi.recruitLinks().insert({ code: value, owner_id: owner, kind, label: `${person?.name?.split(' ')[0] || ''}, ${kind === 'vip' ? 'VIP' : 'community'}` })
    setBusy(false)
    if (error) { notice(error.message?.includes('SANDBOX') ? 'The demo account cannot make links.' : error.message); return }
    toastSuccess('Link created')
    onDone()
  }
  return (
    <div className="mt-4 grid animate-rise gap-3 rounded-2xl border border-gray-100 bg-cloud/40 p-4 sm:grid-cols-[1.2fr_1fr_1.2fr_auto] sm:items-end">
      <label className="block"><span className="mb-1 block text-[13px] font-semibold text-smoke">Team member</span>
        <Select variant="field" value={owner} onChange={setOwner} placeholder="Pick a person" options={team.map((p) => ({ value: p.id, label: p.name }))} ariaLabel="Team member" />
      </label>
      <label className="block"><span className="mb-1 block text-[13px] font-semibold text-smoke">For</span>
        <Select variant="field" value={kind} onChange={setKind} options={KINDS} search={false} ariaLabel="Audience" />
      </label>
      <label className="block"><span className="mb-1 block text-[13px] font-semibold text-smoke">Link</span>
        <span className="flex items-center rounded-xl border border-gray-200 bg-white pl-3 text-sm">
          <span className="text-smoke">/r/</span>
          <input value={value} onChange={(e) => { setTouched(true); setCode(slug(e.target.value)) }} placeholder="paula" className="min-w-0 flex-1 bg-transparent px-1 py-2 outline-none" />
        </span>
      </label>
      <button type="button" onClick={create} disabled={busy || !owner || !valid} className="btn-primary !py-2 disabled:opacity-50">{busy ? 'Creating…' : 'Create link'}</button>
    </div>
  )
}
