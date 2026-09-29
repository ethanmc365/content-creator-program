import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Skeleton, Spinner } from '../ui'
import Icon from '../Icon'
import { cx } from '../../lib/utils'
import { confirm, notice } from '../../lib/confirm'
import { copyToClipboard } from '../../lib/clipboard'

// A LINK YOU CAN SEND THE TRYP.COM TEAM.
//
// Ethan: "a shareable link for the Tryp.com team to apply for admin access,
// with your approval still required, a shortened signup (name, photo, bio,
// tutorial; no bank details or socials) and a settable role title."
//
// THE LINK GRANTS NOTHING, and that is worth repeating here as well as in the
// migration, because it is the whole reason this can exist as a URL at all.
// Following it lets somebody fill in a SHORTER form and arrive in the
// applications queue marked as having applied for the team. `is_admin` is set
// by one function, `approve_team_member`, which refuses anybody who is not
// already a platform admin. The worst a leaked link can do is put a stranger in
// a queue, and Revoke turns it off in one press.
//
// WHY A TITLE ON THE INVITE. Somebody following a link should not have to guess
// what they are applying to be, and the person approving should not have to
// remember. It is a SUGGESTION - the approver can change it - which is why the
// granted title is an argument to the approval rather than copied blindly.
export default function TeamInvites() {
  const { profile } = useAuth()
  const [rows, setRows] = useState(null)
  const [creating, setCreating] = useState(false)
  const [label, setLabel] = useState('')
  const [roleTitle, setRoleTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('team_invites')
      .select('*')
      .order('created_at', { ascending: false })
    setRows(data ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const linkFor = (token) => `${window.location.origin}/signup?team=${token}`

  async function create() {
    if (busy) return
    setBusy(true)
    // The token is made in the browser from `crypto.getRandomValues`, which is
    // the same generator the platform's other secrets use. 18 bytes is 144 bits
    // - far past guessing - and the prefix is only so a link is recognisable in
    // a chat window as something from here.
    const bytes = new Uint8Array(18)
    crypto.getRandomValues(bytes)
    const token = `tryp-team-${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`
    const { error } = await supabase.from('team_invites').insert({
      token,
      label: label.trim() || null,
      role_title: roleTitle.trim() || null,
      created_by: profile?.id ?? null,
      // A LINK THAT LIVES FOREVER IS A LINK NOBODY REMEMBERS SENDING. Thirty
      // days is long enough to get somebody through a hiring conversation and
      // short enough that an old screenshot in a group chat stops working.
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    setBusy(false)
    if (error) { notice(error.message, { title: 'Could not make the link' }); return }
    setLabel(''); setRoleTitle(''); setCreating(false)
    await load()
  }

  async function revoke(row) {
    const ok = await confirm({
      title: 'Revoke this link?',
      body: 'Anybody who still has it will not be able to use it. People who have already applied through it are not affected.',
      confirmLabel: 'Revoke it',
      danger: true,
    })
    if (!ok) return
    await supabase.from('team_invites').update({ revoked_at: new Date().toISOString() }).eq('id', row.id)
    await load()
  }

  async function copy(row) {
    await copyToClipboard(linkFor(row.token))
    setCopied(row.id)
    setTimeout(() => setCopied((c) => (c === row.id ? null : c)), 1600)
  }

  const state = (r) => {
    if (r.revoked_at) return { label: 'Revoked', tone: 'bg-cloud text-gray-500' }
    if (r.expires_at && new Date(r.expires_at) < new Date()) return { label: 'Expired', tone: 'bg-cloud text-gray-500' }
    return { label: 'Live', tone: 'bg-green-50 text-green-700' }
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <Icon name="link" className="h-6 w-6 shrink-0 text-brand" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-tight">Invite somebody to apply</h2>
          <p className="text-xs text-smoke">
            A link that lets somebody fill in a short signup and land in your applications queue. It does not make
            anybody an admin — you still approve them.
          </p>
        </div>
        <button type="button" onClick={() => setCreating((v) => !v)} className="btn-secondary !py-2 text-xs">
          <Icon name="plus" className="h-4 w-4" /> New link
        </button>
      </div>

      {creating && (
        <div className="mb-4 rounded-card border border-gray-100 bg-white p-4 shadow-card">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="ti-label" className="label">What is it for</label>
              <input
                id="ti-label" className="input mt-1.5" placeholder="Spain hiring round"
                value={label} onChange={(e) => setLabel(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-gray-400">Only you see this. It is how you tell two links apart.</p>
            </div>
            <div>
              <label htmlFor="ti-role" className="label">Role title (optional)</label>
              <input
                id="ti-role" className="input mt-1.5" placeholder="Market manager, Spain"
                value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Shown to whoever follows the link, and suggested to you when you approve them. You can change it then.
              </p>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setCreating(false)} className="btn-ghost !py-2 text-xs">Cancel</button>
            <button type="button" onClick={create} disabled={busy} className="btn-primary !py-2 text-xs disabled:opacity-50">
              {busy ? <Spinner className="h-4 w-4" /> : <Icon name="link" className="h-4 w-4" />} Make the link
            </button>
          </div>
        </div>
      )}

      {rows === null ? (
        <Skeleton className="h-24 w-full rounded-card" />
      ) : rows.length === 0 ? (
        <p className="rounded-card border border-dashed border-gray-200 px-5 py-8 text-center text-sm text-smoke">
          No invite links yet. Make one and send it to whoever you want on the team.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
          {rows.map((r) => {
            const s = state(r)
            const live = s.label === 'Live'
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-3 border-b border-gray-50 px-4 py-3.5 last:border-0 sm:px-5">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-ink">{r.label || 'Team invite'}</span>
                    <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', s.tone)}>{s.label}</span>
                    {r.role_title && (
                      <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-semibold text-brand">{r.role_title}</span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-[11px] text-gray-400">{linkFor(r.token)}</span>
                  <span className="mt-0.5 block text-[11px] text-smoke">
                    {r.uses === 1 ? '1 person has applied through it' : `${r.uses} people have applied through it`}
                    {r.expires_at && ` · ${live ? 'expires' : 'expired'} ${new Date(r.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button" onClick={() => copy(r)}
                    className="btn-secondary !py-1.5 text-xs"
                  >
                    <Icon name={copied === r.id ? 'check' : 'copy'} className="h-3.5 w-3.5" />
                    {copied === r.id ? 'Copied' : 'Copy'}
                  </button>
                  {live && (
                    <button
                      type="button" onClick={() => revoke(r)} aria-label="Revoke this link"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-smoke transition-colors hover:bg-red-50 hover:text-red-500"
                    >
                      <Icon name="ban" className="h-4 w-4" />
                    </button>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
