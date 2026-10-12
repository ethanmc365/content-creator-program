import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Icon from '../Icon'
import { cx } from '../../lib/utils'
import { useT } from '../../lib/i18n'

// THE PARENT OR GUARDIAN STEP, FOR THE TWO MEMBERS WHO STILL NEED IT (rebuilt 12 Oct 2026).
//
// It used to hand the creator a link to send their parent themselves (migration 367). Ethan: "rather than them having
// to copy the link and send it to their parents, once they manually submit their parents emails and details, I will
// send the email to their parents with the link". So the creator only sees what happens next and, later, that it is
// done; the team copies the link and an email from Admin > Agreements > Register. The parent still confirms on
// /guardian/<token> with no account.
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

/** Straight after accepting: the details went to the team, who email the parent. */
export function GuardianSent({ row }) {
  const tr = useT()
  if (!row) return null
  return (
    <div className="animate-rise rounded-[22px] border border-brand/25 bg-white p-4 shadow-card">
      <p className="flex items-center gap-2 text-sm font-bold text-ink">
        <Icon name="check" className="h-4 w-4 text-brand" />{tr('Thanks, that is everything from you')}
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-smoke">
        {row.guardian_email
          ? tr('The Tryp.com team will email {n} at {e} with a link to read the terms and confirm. You do not need to send anything.', { n: row.guardian_name, e: row.guardian_email })
          : tr('The Tryp.com team will email {n} with a link to read the terms and confirm. You do not need to send anything.', { n: row.guardian_name })}
      </p>
    </div>
  )
}

/** Settings > Agreements: waiting for the parent, or confirmed. */
export default function GuardianShare({ row, compact = false }) {
  const tr = useT()
  if (!row) return null
  const confirmed = !!row.confirmed_at
  return (
    <div className={cx('animate-rise rounded-[22px] border bg-white', confirmed ? 'border-gray-100' : 'border-brand/30 shadow-card', compact ? 'p-4' : 'p-5')}>
      <p className="flex items-center gap-2 text-sm font-bold text-ink">
        <Icon name={confirmed ? 'check' : 'users'} className="h-4 w-4 text-brand" />
        {confirmed
          ? tr('{n} confirmed the {t}', { n: row.guardian_name, t: row.title })
          : tr('Waiting for {n} to confirm', { n: row.guardian_name || tr('your parent or guardian') })}
      </p>
      {!confirmed && (
        <p className="mt-1 text-[13px] leading-relaxed text-smoke">
          {tr('The Tryp.com team emails them a link to read the {t} and confirm. Ask them to look out for it, and to check their spam folder.', { t: row.title })}
        </p>
      )}
    </div>
  )
}
