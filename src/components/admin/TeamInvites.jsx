import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Skeleton, Spinner } from '../ui'
import Icon from '../Icon'
import { cx } from '../../lib/utils'
import { confirm, notice } from '../../lib/confirm'
import { copyToClipboard } from '../../lib/clipboard'
import { useT } from '../../lib/i18n'

// A LINK YOU CAN SEND PEOPLE WHO SHOULD JOIN THE TRYP.COM TEAM.
//
// Ethan: "a shareable link for the Tryp.com team to apply for admin access, with your
// approval still required, a shortened signup (name, photo, bio, tutorial; no bank
// details or socials) and a settable role title." And, on 29 Sep: "improve the sign up
// for team link and improve the UI of that card."
//
// THE LINK GRANTS NOTHING, and that is worth repeating here as well as in the
// migration, because it is the whole reason this can exist as a URL at all. Following
// it lets somebody fill in a SHORTER form and arrive in the applications queue marked
// as having applied to join the team. `is_admin` is set by one function,
// `approve_team_member`, which refuses anybody who is not already a platform admin. The
// worst a leaked link can do is put a stranger in a queue, and Revoke turns it off in
// one press.
//
// WHY A TITLE ON THE INVITE, AND WHY THE APPLICANT NEVER SEES IT. It is a note to
// whoever approves ("Market manager, Spain"), suggested when they press Add to the
// team. The person following the link is only told they are signing up to join the
// team - they may not be a market manager at all.
const EXPIRIES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 0, label: 'No expiry' },
]

export default function TeamInvites() {
  const tr = useT()
  const { profile } = useAuth()
  const [rows, setRows] = useState(null)
  const [creating, setCreating] = useState(false)
  const [label, setLabel] = useState('')
  const [roleTitle, setRoleTitle] = useState('')
  const [days, setDays] = useState(30)
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
    // The token is made in the browser from `crypto.getRandomValues`, which is the same
    // generator the platform's other secrets use. 18 bytes is 144 bits - far past
    // guessing - and the prefix is only so a link is recognisable in a chat window as
    // something from here.
    const bytes = new Uint8Array(18)
    crypto.getRandomValues(bytes)
    const token = `tryp-team-${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`
    const { error } = await supabase.from('team_invites').insert({
      token,
      label: label.trim() || null,
      role_title: roleTitle.trim() || null,
      created_by: profile?.id ?? null,
      // A LINK THAT LIVES FOR EVER IS A LINK NOBODY REMEMBERS SENDING. Thirty days is
      // the default: long enough to get somebody through a hiring conversation and
      // short enough that an old screenshot in a group chat stops working.
      expires_at: days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : null,
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

  async function copy(row, message = false) {
    const link = linkFor(row.token)
    await copyToClipboard(message
      ? `Hi! Here is the link to join the Tryp.com team on the Content Creator Community platform. Make your account, add a short profile, and we will approve you:\n\n${link}`
      : link)
    const key = `${row.id}:${message ? 'msg' : 'link'}`
    setCopied(key)
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600)
  }

  const state = (r) => {
    if (r.revoked_at) return { key: 'revoked', label: 'Revoked', tone: 'bg-cloud text-gray-500' }
    if (r.expires_at && new Date(r.expires_at) < new Date()) return { key: 'expired', label: 'Expired', tone: 'bg-cloud text-gray-500' }
    if (r.max_uses != null && r.uses >= r.max_uses) return { key: 'full', label: 'Used up', tone: 'bg-cloud text-gray-500' }
    return { key: 'live', label: 'Live', tone: 'bg-emerald-50 text-emerald-700' }
  }

  const live = (rows ?? []).filter((r) => state(r).key === 'live')
  const past = (rows ?? []).filter((r) => state(r).key !== 'live')

  return (
    <section className="animate-fade-up">
      {/* THE HEADER IS THE CARD (29 Sep 2026): what it does, in one line a person can
          repeat, and the one button. It sits above the list rather than being a
          paragraph nobody reads. */}
      <div className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-5 text-white shadow-card sm:p-6">
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
            <Icon name="link" className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold leading-tight">{tr('Invite somebody to join the team')}</h2>
            <p className="mt-0.5 text-sm text-white/85">
              {tr('They sign up through your link with a short profile, and land in your applications queue. Nobody becomes an admin until you approve them.')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            aria-expanded={creating}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand shadow-card transition-transform duration-200 hoverable:hover:scale-105"
          >
            <Icon name={creating ? 'close' : 'plus'} className="h-4 w-4" />
            {creating ? tr('Cancel') : tr('New link')}
          </button>
        </div>
      </div>

      <div className={cx('grid transition-[grid-template-rows] duration-300 ease-out', creating ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden">
          <div className="mt-3 rounded-card border border-gray-100 bg-white p-4 shadow-card sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="ti-label" className="label">{tr('What is it for')}</label>
                <input
                  id="ti-label" className="input mt-1.5" placeholder={tr('Spain hiring round')}
                  value={label} onChange={(e) => setLabel(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-gray-400">{tr('Only you see this. It is how you tell two links apart.')}</p>
              </div>
              <div>
                <label htmlFor="ti-role" className="label">{tr('Role to suggest (optional)')}</label>
                <input
                  id="ti-role" className="input mt-1.5" placeholder={tr('Market manager, Spain')}
                  value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-gray-400">
                  {tr('A note for you. Applicants never see it - it is suggested when you approve them, and you can change it then.')}
                </p>
              </div>
            </div>
            <div className="mt-4">
              <span className="label">{tr('The link works for')}</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {EXPIRIES.map((o) => (
                  <button
                    key={o.days}
                    type="button"
                    onClick={() => setDays(o.days)}
                    aria-pressed={days === o.days}
                    className={cx(
                      'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
                      days === o.days ? 'border-brand bg-brand text-white' : 'border-gray-200 bg-white text-smoke hoverable:hover:border-brand hoverable:hover:text-brand',
                    )}
                  >
                    {tr(o.label)}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={create} disabled={busy} className="btn-primary !py-2 text-sm disabled:opacity-50">
                {busy ? <Spinner className="h-4 w-4" /> : <Icon name="link" className="h-4 w-4" />} {tr('Make the link')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        {rows === null ? (
          <Skeleton className="h-28 w-full rounded-card" />
        ) : rows.length === 0 ? (
          <p className="rounded-card border border-dashed border-gray-200 px-5 py-8 text-center text-sm text-smoke">
            {tr('No invite links yet. Make one and send it to whoever you want on the team.')}
          </p>
        ) : (
          <div className="space-y-3">
            {[...live, ...past].map((r) => (
              <InviteCard
                key={r.id}
                r={r}
                s={state(r)}
                link={linkFor(r.token)}
                copied={copied}
                onCopy={(msg) => copy(r, msg)}
                onRevoke={() => revoke(r)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function InviteCard({ r, s, link, copied, onCopy, onRevoke }) {
  const tr = useT()
  const isLive = s.key === 'live'
  return (
    <article className={cx('overflow-hidden rounded-card border bg-white shadow-card transition-opacity', isLive ? 'border-gray-100' : 'border-gray-100 opacity-70')}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 pt-4 sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-ink">{r.label || tr('Team invite')}</span>
            <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', s.tone)}>{tr(s.label)}</span>
            {r.role_title && (
              <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-semibold text-brand" title={tr('Suggested when you approve. Applicants never see it.')}>{r.role_title}</span>
            )}
          </p>
          <p className="mt-1 text-xs text-smoke">
            {r.uses === 1 ? tr('1 person has applied') : tr('{n} people have applied', { n: r.uses })}
            {r.expires_at && ` · ${isLive ? tr('expires') : tr('expired')} ${new Date(r.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
            {!r.expires_at && isLive && ` · ${tr('never expires')}`}
          </p>
        </div>
        {r.uses > 0 && (
          <Link to="/admin/applications" className="shrink-0 text-xs font-semibold text-brand hover:underline">
            {tr('See who applied')} →
          </Link>
        )}
      </div>

      <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl bg-cloud px-3 py-2 sm:mx-5">
        <Icon name="link" className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-smoke">{link}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 pb-4 pt-3 sm:px-5">
        {isLive ? (
          <>
            <button type="button" onClick={() => onCopy(false)} className="btn-primary !py-1.5 text-xs">
              <Icon name={copied === `${r.id}:link` ? 'check' : 'copy'} className="h-3.5 w-3.5" />
              {copied === `${r.id}:link` ? tr('Copied') : tr('Copy link')}
            </button>
            <button type="button" onClick={() => onCopy(true)} className="btn-secondary !py-1.5 text-xs">
              <Icon name={copied === `${r.id}:msg` ? 'check' : 'chat'} className="h-3.5 w-3.5" />
              {copied === `${r.id}:msg` ? tr('Copied') : tr('Copy as a message')}
            </button>
            <button
              type="button" onClick={onRevoke} aria-label={tr('Revoke this link')}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-smoke transition-colors hover:bg-red-50 hover:text-red-500"
            >
              <Icon name="ban" className="h-3.5 w-3.5" />
              {tr('Revoke')}
            </button>
          </>
        ) : (
          <p className="text-xs text-gray-400">{tr('This link no longer works.')}</p>
        )}
      </div>
    </article>
  )
}
