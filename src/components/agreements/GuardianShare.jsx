import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Icon from '../Icon'
import { copyToClipboard } from '../../lib/clipboard'
import { toastSuccess } from '../../lib/toast'
import { cx } from '../../lib/utils'
import { useT } from '../../lib/i18n'

// THE LINK A CREATOR UNDER 18 SENDS THEIR PARENT (8 Oct 2026, migration 367).
//
// Accepting the terms opens a guardian confirmation; the parent confirms it on /guardian/<token> with no account. The
// platform cannot email outside addresses until mail.tryp.com is verified, so the creator sends the link themselves -
// the share sheet on a phone (WhatsApp, Messages, mail), a copy button everywhere else. Once confirmed it says so.
export const guardianUrl = (token) => `${window.location.origin}/guardian/${token}`

export function useGuardianLinks(refreshKey = 0) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let alive = true
    supabase.rpc('my_guardian_links').then(({ data, error }) => { if (alive) setRows(error ? [] : data || []) })
    return () => { alive = false }
  }, [refreshKey])
  return rows
}

export default function GuardianShare({ row, compact = false }) {
  const tr = useT()
  const [copied, setCopied] = useState(false)
  if (!row) return null
  const url = guardianUrl(row.token)
  const confirmed = !!row.confirmed_at
  const text = tr('Hi! I joined the Tryp.com Creator Community. As I am under 18, could you read the terms and confirm them for me? {u}', { u: url })
  async function share() {
    if (navigator.share) {
      try { await navigator.share({ title: tr('Tryp.com Creator Community'), text }); return } catch { /* cancelled: fall through to copy */ }
    }
    if (await copyToClipboard(url)) { setCopied(true); toastSuccess(tr('Link copied')); setTimeout(() => setCopied(false), 1800) }
  }
  return (
    <div className={cx('animate-rise rounded-[22px] border bg-white', confirmed ? 'border-gray-100' : 'border-brand/30 shadow-card', compact ? 'p-4' : 'p-5')}>
      <p className="flex items-center gap-2 text-sm font-bold text-ink">
        <Icon name={confirmed ? 'check' : 'users'} className="h-4 w-4 text-brand" />
        {confirmed ? tr('{n} confirmed the {t}', { n: row.guardian_name, t: row.title }) : tr('Send this to {n}', { n: row.guardian_name || tr('your parent or guardian') })}
      </p>
      {!confirmed && (
        <>
          <p className="mt-1 text-[13px] leading-relaxed text-smoke">{tr('As you are under 18, your parent or guardian confirms the terms too. Send them this link; they read the terms and confirm in a minute, no account needed.')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={share} className="btn-primary !py-2.5 text-sm transition-transform duration-200 hoverable:hover:scale-[1.03]">
              <Icon name={copied ? 'check' : 'share'} className="h-4 w-4" />{copied ? tr('Copied') : tr('Send the link')}
            </button>
            <button type="button" onClick={async () => { if (await copyToClipboard(url)) toastSuccess(tr('Link copied')) }} className="btn-secondary !py-2.5 text-sm">
              <Icon name="copy" className="h-4 w-4" />{tr('Copy')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
