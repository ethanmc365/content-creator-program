import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Avatar, Skeleton, Spinner } from '../ui'
import Icon from '../Icon'
import { notice } from '../../lib/confirm'
import { cx } from '../../lib/utils'
import { vipRpc } from '../../lib/vip'
import { useT } from '../../lib/i18n'

// SEE IT AS A VIP (3 Oct 2026).
//
// Ethan: "give me the function to view all the pages as a VIP again, because that seems to be gone. I guess on the VIP
// tools, there should be some place to do that." Two doors, because they answer two different questions:
//
//   * THE WHOLE PLATFORM AS A VIP. Signs into the sandbox VIP (the `impersonate` edge function, target 'vip') so the
//     Worldwide page, Rooms, the Calendar and every other page are drawn exactly as a VIP gets them. Read only: the
//     sandbox cannot post, pay or change anything, and the Exit pill brings you straight back.
//   * ONE VIP'S PAGE. The VIP page of a real member of this market, through `vip_preview` (their own database functions,
//     run as them, read only). A market with nobody in it yet offers a new VIP's first day instead - as a card, never as
//     a dropdown with one choice in it.
export function VipPreviewTab({ programme }) {
  const tr = useT()
  const navigate = useNavigate()
  const [, setParams] = useSearchParams()
  const { enterCreatorPreview } = useAuth()
  const [people, setPeople] = useState(undefined)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    setPeople(undefined)
    vipRpc('vip_preview_people', { p_programme: programme.id })
      .then((rows) => { if (alive) setPeople(rows || []) })
      .catch(() => { if (alive) setPeople([]) })
    return () => { alive = false }
  }, [programme.id])

  async function walk() {
    setBusy(true)
    const { error } = await enterCreatorPreview('vip')
    setBusy(false)
    if (error) { notice(error); return }
    navigate('/global')
  }
  const open = (id) => setParams(id ? { mode: 'as', who: id } : { mode: 'as' }, { replace: false })

  const real = people || []
  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-5 text-white shadow-card animate-rise sm:p-6">
        <span aria-hidden className="pointer-events-none absolute -right-12 -top-16 h-52 w-52 rounded-full bg-white/15 blur-2xl" />
        <div className="relative flex flex-wrap items-center gap-5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20"><Icon name="globe" className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold">{tr('Walk the whole platform as a VIP')}</h2>
            <p className="mt-1 max-w-xl text-sm text-white/90">{tr('Opens Worldwide, Rooms, the Calendar and every other page exactly as a VIP sees them, using the test VIP account. Nothing can be posted or paid from it. Press Exit at the top to come back.')}</p>
          </div>
          <button type="button" onClick={walk} disabled={busy} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-brand shadow-card transition-transform duration-200 hoverable:hover:scale-105 disabled:opacity-70">
            {busy ? <Spinner className="h-4 w-4" /> : <Icon name="eye" className="h-4 w-4" />}{tr('See it as a VIP')}
          </button>
        </div>
      </section>

      <section className="rounded-card border border-gray-100 bg-white p-4 shadow-card animate-rise [animation-delay:70ms] sm:p-5">
        <h2 className="text-[15px] font-bold text-ink">{tr('Open one VIP\'s page')}</h2>
        <p className="mb-4 mt-0.5 text-sm text-smoke">{tr('Their VIP page in {m}, read only, with their own numbers, videos and payouts.', { m: programme.name })}</p>
        {people === undefined ? <Skeleton className="h-24 w-full rounded-xl" /> : (
          <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {real.map((p, i) => (
              <li key={p.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 9) * 35}ms` }}>
                <button type="button" onClick={() => open(p.id)} className="group flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 text-left transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/30 hoverable:hover:shadow-card">
                  <Avatar src={p.photo} name={p.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-ink"><span className="truncate">{p.name}</span>{p.test && <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-px text-[9.5px] font-bold uppercase text-smoke">{tr('Test')}</span>}</span>
                    <span className={cx('block text-[11px]', p.status === 'active' ? 'text-emerald-600' : 'text-smoke')}>{p.status === 'active' ? tr('Active') : p.status === 'paused' ? tr('Paused') : tr('Left')}</span>
                  </span>
                  <Icon name="chevronRight" className="h-4 w-4 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                </button>
              </li>
            ))}
            <li className="animate-rise" style={{ animationDelay: `${Math.min(real.length, 9) * 35}ms` }}>
              <button type="button" onClick={() => open(null)} className="group flex w-full items-center gap-3 rounded-xl border border-dashed border-gray-200 bg-cloud/40 p-3 text-left transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/40">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-brand shadow-card"><Icon name="sparkles" className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{tr('A new VIP, day one')}</span>
                  <span className="block text-[11px] text-smoke">{tr('Nothing posted yet')}</span>
                </span>
                <Icon name="chevronRight" className="h-4 w-4 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
              </button>
            </li>
          </ul>
        )}
        {people && real.length === 0 && <p className="mt-3 text-xs text-smoke">{tr('No VIPs in {m} yet, so a first day is what there is to see.', { m: programme.name })}</p>}
      </section>
    </div>
  )
}
