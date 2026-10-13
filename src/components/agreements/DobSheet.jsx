import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import { DobField } from '../ProfileFields'
import Icon from '../Icon'
import { Spinner } from '../ui'
import { lockScroll } from '../../lib/scrollLock'
import { notice } from '../../lib/confirm'
import { useT } from '../../lib/i18n'
import { ageFromDob, cx, MIN_AGE } from '../../lib/utils'
import { profilesApi } from '../../api/profiles'

// THE DATE OF BIRTH WE NEVER ASKED FOR.
//
// Nine active creators joined on 21-22 June 2026, before the date of birth was a required question, and have no date and
// no age saved. It is the first thing they see (before the terms, which ask them to confirm they are 18 or over) and it
// cannot be dismissed. The database refuses an under-18 date for anybody not already excepted (trg_zz_adults_only), so a
// date that is refused is said in words, not as an error.
export default function DobSheet({ onSaved }) {
  const tr = useT()
  const { user, refreshProfile } = useAuth()
  const [dob, setDob] = useState(null)
  const [busy, setBusy] = useState(false)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => lockScroll(), [])

  const age = ageFromDob(dob)
  const tooYoung = age != null && age < MIN_AGE

  async function save() {
    if (!dob || busy) return
    if (tooYoung) {
      await notice(tr('If you think this is a mistake, email ethan@tryp.com.'), { title: tr('This community is only for creators aged 18 or over') })
      return
    }
    setBusy(true)
    const { error } = await profilesApi.profiles().update({ dob }).eq('id', user.id)
    setBusy(false)
    if (error) {
      await notice(/18/.test(error.message) ? tr('If you think this is a mistake, email ethan@tryp.com.') : error.message,
        { title: /18/.test(error.message) ? tr('This community is only for creators aged 18 or over') : tr('That did not save') })
      return
    }
    setLeaving(true)
    refreshProfile?.()
    setTimeout(() => onSaved?.(), 380)
  }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={tr('Add your date of birth')} className={cx('agreement-root fixed inset-0 z-[95] flex items-end justify-center sm:items-center sm:p-6', leaving && 'is-leaving')}>
      <div className="agreement-scrim absolute inset-0 bg-ink/55 backdrop-blur-[3px]" />
      <div className="agreement-sheet relative w-full max-w-md overflow-hidden rounded-t-[28px] bg-white shadow-lift sm:rounded-[28px]">
        <div className="faq-hero relative overflow-hidden px-6 pb-6 pt-7 text-white">
          <span aria-hidden className="ideas-orb ideas-orb-a !h-48 !w-48 opacity-60" />
          <p className="relative flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/85">
            <Icon name="shield" className="h-4 w-4" />{tr('One quick thing')}
          </p>
          <h2 className="relative mt-2 text-[24px] font-extrabold leading-tight tracking-tight">{tr('Add your date of birth')}</h2>
          <p className="relative mt-2 text-sm leading-relaxed text-white/90">
            {tr('This is to make sure everyone in the community is over 18. Only your age is ever shown, never your date of birth.')}
          </p>
        </div>
        <div className="px-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5">
          <DobField value={dob} onChange={setDob} required />
          <button type="button" onClick={save} disabled={!dob || busy}
            className={cx('agreement-cta mt-5 flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[15px] font-bold text-white shadow-card transition-all duration-300 disabled:cursor-not-allowed',
              dob ? 'bg-brand hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift' : 'bg-brand/45')}>
            {busy ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />}{tr('Save and continue')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
