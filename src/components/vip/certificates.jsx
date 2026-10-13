import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Skeleton, Spinner, Toggle } from '../ui'
import Icon from '../Icon'
import { notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { cx } from '../../lib/utils'
import { sampleFacts } from '../../lib/certificates'
import CertificateCard from '../certificate/CertificateCard'
import { FitCard } from '../certificate/CertificateWall'
import { certificatesApi } from '../../api/certificates'

// CERTIFICATES FOR VIP AND OFFICIAL CREATORS (migration 384).
//
// So this is the community's own designs, each with one switch: VIP and official creators get it too. For them "first
// video" means their first VIP video and a podium is a top place in a ranked monthly bonus (migration 385); community
// milestones never reach them, so those are shown but cannot be switched on. The designs themselves are edited in the
// certificate studio, once, for everybody.
const WHEN = {
  challenge_entry: 'Their first video',
  creator_joined: 'When they join',
  challenge_rank: 'Top three in a monthly VIP challenge',
  milestone: 'Reaching a community milestone',
  manual: 'Given by hand',
}
// 385: a podium certificate reaches a VIP through a ranked monthly bonus (top_n), awarded when the month is approved.
const FOR_VIP = new Set(['challenge_entry', 'creator_joined', 'manual', 'challenge_rank'])

export function VipCertificatesTab() {
  const { isAdmin, profile } = useAuth()
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(null)
  const load = useCallback(async () => {
    const { data } = await certificatesApi.certificateDesigns().select('*').order('created_at')
    setRows(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  async function setFor(d, on) {
    // Community-only designs become "both"; switching off goes back to the community alone.
    const audience = on ? 'all' : 'community'
    setBusy(d.id)
    const { error } = await certificatesApi.certificateDesigns().update({ audience }).eq('id', d.id)
    if (error) { setBusy(null); notice(error.message); return }
    let given = 0
    if (on && d.is_active && d.award_on !== 'manual') {
      const { data, error: e2 } = await certificatesApi.backfillCertificateDesign({ p_design: d.id })
      if (!e2) given = data || 0
    }
    setBusy(null)
    toastSuccess(on ? (given ? `On for VIP and official creators. ${given} given to those who already qualify.` : 'On for VIP and official creators.') : 'Community only again. Ones already given are kept.')
    load()
  }

  if (rows === null) return <div className="grid grid-cols-1 gap-4 md:grid-cols-2"><Skeleton className="h-64 rounded-card" /><Skeleton className="h-64 rounded-card" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-card border border-gray-100 bg-white px-4 py-3.5 shadow-card">
        <Icon name="badge" className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
        <p className="text-sm leading-relaxed text-ink">
          <strong>The community's certificates, for your creators too.</strong>{' '}
          <span className="text-smoke">Switch one on and every VIP and official creator who qualifies gets it, now and from then on. The design is shared, so edit it once in the certificate studio.</span>
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {rows.map((d, i) => {
          const on = d.audience === 'all' || d.audience === 'vip'
          const can = FOR_VIP.has(d.award_on)
          return (
            <article key={d.id} className="animate-rise overflow-hidden rounded-card border border-gray-100 bg-white shadow-card" style={{ animationDelay: `${Math.min(i, 6) * 50}ms` }}>
              <div className={cx('p-3', !d.is_active && 'opacity-60')}>
                {/* EXACTLY THE COMMUNITY'S PREVIEW. This drew the bare sample (no face, the sample's name and code)
                    where the community preview on /rewards draws your own name and photo; both now use the same facts. */}
                <FitCard><CertificateCard design={d} facts={{ ...sampleFacts(d), name: profile?.name || sampleFacts(d).name, photo: profile?.photo_url || '', serial: 'TRYP-PREVIEW' }} /></FitCard>
              </div>
              <div className="flex items-center gap-3 border-t border-gray-50 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-bold text-ink">
                    <span className="truncate">{d.name || d.title}</span>
                    {!d.is_active && <span className="shrink-0 rounded-md bg-cloud px-1.5 py-0.5 text-[10px] font-bold uppercase text-smoke">Draft</span>}
                  </span>
                  <span className="block truncate text-xs text-smoke">{can ? WHEN[d.award_on] : `${WHEN[d.award_on]}: community only`}</span>
                </span>
                {busy === d.id ? <Spinner className="h-5 w-5" /> : (
                  <Toggle on={on} disabled={!isAdmin || !can} onChange={(v) => setFor(d, v)} label={`VIP and official creators get ${d.name || d.title}`} />
                )}
              </div>
            </article>
          )
        })}
      </div>
      {isAdmin && (
        <Link to="/admin/creator-kit?tab=certificates" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
          Open the certificate studio<Icon name="chevronRight" className="h-4 w-4" />
        </Link>
      )}
    </div>
  )
}
