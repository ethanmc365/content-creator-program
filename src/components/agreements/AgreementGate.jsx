import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { onResume } from '../../lib/resume'
import AgreementSheet from './AgreementSheet'

// Every published agreement this person has not accepted yet, one after another, the first time the app opens after
// it is published (and again on resume, so a version published while the app sat in the background is still asked
// for). It cannot be dismissed: carrying on means accepting, which is what "they'll have to reaccept them" means.
//
// The team is not asked: the documents are between Tryp.com and its creators, and the team are Tryp.com. They read
// and preview them on /admin/agreements. The sign-up and onboarding screens are left alone; the sheet waits until the
// person is in the app.
export default function AgreementGate() {
  const { user, profile } = useAuth()
  const { pathname } = useLocation()
  const [queue, setQueue] = useState([])
  const [accepted, setAccepted] = useState(() => new Set())
  const staff = profile?.platform_role === 'owner' || profile?.platform_role === 'global_admin'
  const skip = !user?.id || !profile || staff || profile.is_test || !profile.onboarded || /^\/(login|signup|onboarding|auth|vip\/join|terms|privacy)/.test(pathname)

  const load = useCallback(async () => {
    if (skip) return
    const { data, error } = await supabase.rpc('my_pending_agreements')
    if (error) return
    // Was an earlier version of the same document accepted? Then this one is an UPDATE, and the sheet says so.
    const rows = data || []
    if (!rows.length) { setQueue([]); return }
    const { data: had } = await supabase.rpc('my_agreements')
    const seenAudiences = new Set((had || []).map((h) => h.audience))
    setQueue(rows.map((d) => ({ ...d, updated: seenAudiences.has(d.audience) })))
  }, [skip])

  useEffect(() => { load() }, [load])
  useEffect(() => onResume(load), [load])

  const pending = queue.filter((d) => !accepted.has(d.id))
  const doc = pending[0]
  if (skip || !doc) return null
  const step = queue.length > 1 ? `${queue.length - pending.length + 1} / ${queue.length}` : null
  return (
    <AgreementSheet
      doc={doc}
      updated={doc.updated}
      step={step}
      onAccepted={() => setAccepted((s) => new Set([...s, doc.id]))}
    />
  )
}
