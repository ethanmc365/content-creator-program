import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Skeleton, Spinner } from '../ui'
import Icon from '../Icon'
import { confirm, notice } from '../../lib/confirm'
import { copyToClipboard } from '../../lib/clipboard'
import { useT } from '../../lib/i18n'

// ONE LINK, ONE CARD, FOR PEOPLE WHO SHOULD JOIN THE TRYP.COM TEAM.
//
// Ethan (30 Sep 2026): "we don't need expiring or multiple links, it's safe anyways as we have
// the approval function. I also don't want 2 cards for it, just use the card at the top with the
// orange gradient, fit everything into that, the link to copy etc, also it says 1 person has
// applied but it was the test account I made so it shouldn't show, also any declined application
// shouldn't show, not even approved because they'll obviously show on the team ... Also it
// shouldn't just say market manager as it's not just market managers signing up."
//
// So there is exactly one live link and it never expires. The count is people WAITING for a
// decision - not test accounts, not declined, not approved (an approved person is on the team
// below). Making a fresh link is there for the day one leaks; it switches the old one off.
//
// THE LINK GRANTS NOTHING. It opens a shorter sign-up that arrives in the applications queue
// marked as a team applicant. `is_admin` is set by one function, `approve_team_member`, which
// refuses anybody who is not already a platform admin. A leaked link can put a stranger in a
// queue and nothing more.
export default function TeamInvites() {
  const tr = useT()
  const { profile } = useAuth()
  const [invite, setInvite] = useState(undefined) // undefined = loading, null = none yet
  const [waiting, setWaiting] = useState(0)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('team_invites').select('*').is('revoked_at', null)
      .order('created_at', { ascending: false }).limit(1)
    const row = data?.[0] ?? null
    setInvite(row)
    if (row) {
      const { count } = await supabase.from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('team_invite_id', row.id).eq('status', 'pending')
        .not('is_test', 'is', true).is('deletion_requested_at', null)
      setWaiting(count ?? 0)
    } else setWaiting(0)
  }, [])
  useEffect(() => { load() }, [load])

  const linkFor = (token) => `${window.location.origin}/signup?team=${token}`

  async function make() {
    if (busy) return
    setBusy(true)
    // 18 random bytes = 144 bits, far past guessing; the prefix only makes the link recognisable
    // in a chat window.
    const bytes = new Uint8Array(18)
    crypto.getRandomValues(bytes)
    const token = `tryp-team-${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`
    const { error } = await supabase.from('team_invites').insert({ token, created_by: profile?.id ?? null, expires_at: null })
    setBusy(false)
    if (error) { notice(error.message, { title: 'Could not make the link' }); return }
    await load()
  }

  async function refresh() {
    const ok = await confirm({
      title: 'Make a fresh link?',
      body: 'The current link stops working straight away, for anybody who still has it. People who already applied through it are not affected.',
      confirmLabel: 'Make a fresh one',
      danger: true,
    })
    if (!ok || !invite) return
    await supabase.from('team_invites').update({ revoked_at: new Date().toISOString() }).eq('id', invite.id)
    await make()
  }

  async function copy(message) {
    const link = linkFor(invite.token)
    await copyToClipboard(message
      ? `Hi! Here is the link to join the Tryp.com team on the Content Creator Community platform. Make your account, add a short profile, and we will approve you:\n\n${link}`
      : link)
    const key = message ? 'msg' : 'link'
    setCopied(key)
    setTimeout(() => setCopied((c) => (c === key ? '' : c)), 1600)
  }

  return (
    <section className="animate-fade-up">
      <div className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-5 text-white shadow-card sm:p-6">
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-wrap items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
            <Icon name="link" className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold leading-tight">{tr('Invite somebody to join the team')}</h2>
            <p className="mt-0.5 text-sm text-white/85">
              {tr('They sign up through this link with a short profile and land in your applications queue. Nobody becomes an admin until you approve them.')}
            </p>
          </div>
          {invite && (
            <Link to="/admin/applications" className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/20 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hoverable:hover:bg-white/30">
              {waiting > 0 ? (
                <>
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold tabular-nums text-brand">{waiting}</span>
                  {waiting === 1 ? tr('waiting for approval') : tr('waiting for approval')}
                </>
              ) : tr('Nobody waiting')}
              <Icon name="chevronRight" className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        <div className="relative mt-5">
          {invite === undefined ? (
            <Skeleton className="h-11 w-full !bg-white/20" />
          ) : invite === null ? (
            <button type="button" onClick={make} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-brand shadow-card transition-transform duration-200 hoverable:hover:scale-105 disabled:opacity-60">
              {busy ? <Spinner className="h-4 w-4" /> : <Icon name="plus" className="h-4 w-4" />} {tr('Make the team link')}
            </button>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-xl bg-white/15 px-3.5 py-2.5 ring-1 ring-white/25">
                <Icon name="link" className="h-4 w-4 shrink-0 text-white/80" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-white">{linkFor(invite.token)}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => copy(false)} className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand shadow-card transition-transform duration-200 hoverable:hover:scale-105">
                  <Icon name={copied === 'link' ? 'check' : 'copy'} className="h-4 w-4" />
                  {copied === 'link' ? tr('Copied') : tr('Copy link')}
                </button>
                <button type="button" onClick={() => copy(true)} className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-4 py-2 text-sm font-semibold text-white transition-colors hoverable:hover:bg-white/30">
                  <Icon name={copied === 'msg' ? 'check' : 'chat'} className="h-4 w-4" />
                  {copied === 'msg' ? tr('Copied') : tr('Copy as a message')}
                </button>
                <button type="button" onClick={refresh} className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-white/80 transition-colors hoverable:hover:bg-white/15 hoverable:hover:text-white">
                  <Icon name="refresh" className="h-3.5 w-3.5" />
                  {tr('Make a fresh link')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
