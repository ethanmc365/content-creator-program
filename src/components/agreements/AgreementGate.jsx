import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { onResume } from '../../lib/resume'
import { setAgreementHold } from '../../lib/appNag'
import AgreementSheet from './AgreementSheet'
import DobSheet from './DobSheet'
import { useLocale } from '../../lib/i18n'
import { moneyApi } from '../../api/money'
import { agreementsApi } from '../../api/agreements'

// Every published agreement this person has not accepted yet, one after another, the first time the app opens after
// it is published (and again on resume, so a version published while the app sat in the background is still asked
// for). It cannot be dismissed: carrying on means accepting, which is what "they'll have to reaccept them" means.
//
// IT GOES FIRST. While this is asking the database, and for as long as anything is waiting, it holds every other pop-up
// and the walkthrough back (`setAgreementHold`, lib/appNag). Once the last one is accepted the hold drops and the next
// prompt in the queue (home screen, notifications, bank details, a boost, a survey) opens.
//
// The team is not asked: the documents are between Tryp.com and its creators, and the team are Tryp.com. They read
// and preview them on /admin/agreements. The sign-up and onboarding screens are left alone; the sheet waits until the
// person is in the app.
export default function AgreementGate() {
  const { user, profile } = useAuth()
  const { pathname } = useLocation()
  const locale = useLocale()
  const [queue, setQueue] = useState(null)
  const [accepted, setAccepted] = useState(() => new Set())
  const staff = profile?.platform_role === 'owner' || profile?.platform_role === 'global_admin'
  const outside = /^\/(login|signup|onboarding|auth|vip\/join|terms|privacy)/.test(pathname)
  const skip = !user?.id || !profile || staff || profile.is_test || !profile.onboarded || outside

  // NO DATE OF BIRTH AT ALL: asked first, before the terms. Only looked up when the profile has no age either, so nobody
  // else pays a request for it. null = not known yet.
  const [needsDob, setNeedsDob] = useState(null)
  const ageKnown = profile?.age != null
  useEffect(() => {
    if (skip || ageKnown || profile?.status !== 'active') { setNeedsDob(false); return undefined }
    let alive = true
    moneyApi.creatorPrivate().select('dob').eq('id', user.id).maybeSingle()
      .then(({ data, error }) => { if (alive) setNeedsDob(!error && !data?.dob) }, () => { if (alive) setNeedsDob(false) })
    return () => { alive = false }
  }, [skip, ageKnown, profile?.status, user?.id])

  const pending = (queue || []).filter((d) => !accepted.has(d.id))
  // Up while we do not know yet, and while anything is waiting. RAISED during render on purpose (see appNag), LOWERED
  // in an effect, because lowering it wakes the other prompts and they set state.
  const holding = !skip && (queue === null || pending.length > 0 || needsDob !== false)
  if (holding) setAgreementHold(true)
  useEffect(() => { if (!holding) setAgreementHold(false) }, [holding])

  const load = useCallback(async () => {
    if (skip) return
    // The text in the reader's language where it has been translated; accept_agreement records exactly that (388).
    const { data, error } = await agreementsApi.myPendingAgreements({ p_locale: locale })
    if (error) { setQueue((q) => q ?? []); return }
    // Was an earlier version of the same document accepted? Then this one is an UPDATE, and the sheet says so.
    const rows = data || []
    if (!rows.length) { setQueue([]); return }
    const { data: had } = await agreementsApi.myAgreements()
    const seenAudiences = new Set((had || []).map((h) => h.audience))
    // The community terms before the VIP agreement: the one everybody has, then the one only VIPs have.
    rows.sort((a, b) => (a.audience === 'creator' ? 0 : 1) - (b.audience === 'creator' ? 0 : 1))
    setQueue(rows.map((d) => ({ ...d, updated: seenAudiences.has(d.audience) })))
  }, [skip, locale])

  useEffect(() => { load() }, [load])
  useEffect(() => onResume(load), [load])
  // Never hold the app hostage to a request that does not come back.
  useEffect(() => {
    if (skip || queue !== null) return undefined
    const t = setTimeout(() => setQueue((q) => q ?? []), 8000)
    return () => clearTimeout(t)
  }, [skip, queue])
  useEffect(() => () => setAgreementHold(false), [])

  if (!skip && needsDob) return <DobSheet onSaved={() => setNeedsDob(false)} />
  const doc = pending[0]
  if (skip || !doc) return null
  const step = queue.length > 1 ? `${queue.length - pending.length + 1} / ${queue.length}` : null
  return (
    <AgreementSheet
      key={doc.id}
      doc={doc}
      updated={doc.updated}
      step={step}
      onAccepted={() => setAccepted((s) => new Set([...s, doc.id]))}
    />
  )
}
