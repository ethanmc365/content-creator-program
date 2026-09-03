import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Modal } from './ui'
import Icon from './Icon'
import { payeeFromPrivate, payeeComplete } from '../lib/invoice'
import { useT } from '../lib/i18n'

// "ADD YOUR BANK DETAILS" - ASKED EVERY TIME, ENFORCED NEVER.
//
// Ethan: "I didn't see it enforce putting bank details yet. Maybe it shouldn't
// enforce it - you can click to add them later, but then every time you open
// the app/website there should be a visual pop up asking you to put in your
// bank details. If you've entered them then it shouldn't ask."
//
// That is the right shape and it is worth saying why, because the tour tried to
// enforce it and could not. Bank details are the one thing a creator genuinely
// may not have to hand - they are on a card in another room, or the account is
// their mum's, or they want to think about which currency. A hard gate there
// does not produce bank details, it produces somebody who closes the app.
//
// But it is also the thing that silently costs them money later:
// `raise_invoice_for_reward` returns null with no payee, so a prize is awarded,
// no invoice is raised, and nobody finds out until they ask why they have not
// been paid. (That is a real production case - see migration 184.)
//
// So: ask on every open, take "later" for an answer, and never ask again once
// there is something to ask about.
//
// ONCE PER APP OPEN, NOT ONCE PER NAVIGATION. `sessionStorage` is exactly the
// right lifetime: it survives moving between tabs and dies when the app is
// closed, which is the definition of "every time you open it". A modal that
// reappeared on every route change would be the most annoying thing on the
// platform within a day.
const ASKED_KEY = 'tryp_bank_prompt_seen'

export default function BankDetailsPrompt() {
  const tr = useT()
  const { user, profile } = useAuth()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Admins are not paid through this, and a pending applicant has no prizes
    // to be paid for yet - asking either of them is noise.
    if (!user?.id || !profile || profile.is_admin || profile.status !== 'active') return undefined
    try {
      if (sessionStorage.getItem(ASKED_KEY)) return undefined
    } catch { /* private mode: ask once per mount, which is close enough */ }

    let alive = true
    supabase
      .from('creator_private')
      .select('pay_currency, pay_name, pay_bank, pay_sort_code, pay_account_number, pay_iban, pay_bic, pay_address')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return
        // THE SAME COMPLETENESS TEST THE INVOICE USES. Asking on a different
        // definition from the one that decides whether a prize can be paid is
        // how somebody gets nagged for details they have already given, or
        // worse, is left alone while their prize sits unpayable.
        if (payeeComplete(payeeFromPrivate(data))) return
        setOpen(true)
      })
    return () => { alive = false }
  }, [user?.id, profile])

  function dismiss() {
    try { sessionStorage.setItem(ASKED_KEY, '1') } catch { /* private mode */ }
    setOpen(false)
  }

  if (!open) return null

  return (
    <Modal open onClose={dismiss} title={tr('Add your bank details')}>
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-card bg-brand-tint/50 px-4 py-3.5">
          <Icon name="wallet" className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          <p className="text-sm leading-relaxed text-ink">
            {tr('Prizes are paid by bank transfer, and we can only raise an invoice once we know where to send it. It takes about a minute and you only do it once.')}
          </p>
        </div>
        <p className="text-sm leading-relaxed text-smoke">
          {tr('You can do it later — we will remind you next time you open the app.')}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Link to="/settings?section=payment" onClick={dismiss} className="btn-primary flex-1 justify-center">
            {tr('Add them now')}
          </Link>
          <button type="button" onClick={dismiss} className="btn-ghost flex-1 justify-center">
            {tr('Later')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
