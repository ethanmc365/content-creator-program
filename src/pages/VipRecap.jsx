import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import YearInReview from '../components/wrapped/YearInReview'
import { buildVipCards, VipShareCard } from '../components/wrapped/vipStory'
import { Card, Eyebrow, Line } from '../components/wrapped/cards'
import Icon from '../components/Icon'
import BackLink from '../components/BackLink'
import { Spinner } from '../components/ui'
import { monthLabel, vipRpc } from '../lib/vip'
import { useT } from '../lib/i18n'

// THE VIP MONTH RECAP PAGE (30 Sep 2026, migration 299 `vip_my_recap`). The same story runner as the Year in Review
// and the challenge recap, told about a month of views. `?m=2026-08` picks a month; with none, the latest closed
// month they were paid for, or this one so far.
export default function VipRecap() {
  const tr = useT()
  const { profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const m = params.get('m')
  const [state, setState] = useState({ status: 'loading' })
  const [months, setMonths] = useState([])

  useEffect(() => {
    let alive = true
    supabase.from('vip_months').select('year, month, status').order('year', { ascending: false }).order('month', { ascending: false }).limit(12)
      .then(({ data }) => { if (alive) setMonths(data || []) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    let alive = true
    setState({ status: 'loading' })
    const [y, mo] = m && /^\d{4}-\d{1,2}$/.test(m) ? m.split('-').map(Number) : [null, null]
    vipRpc('vip_my_recap', { p_year: y, p_month: mo })
      .then((recap) => { if (alive) setState(recap ? { status: 'ready', recap } : { status: 'none' }) })
      .catch(() => { if (alive) setState({ status: 'none' }) })
    return () => { alive = false }
  }, [m])

  const data = state.status === 'ready' ? { me: { name: profile?.name, photo: profile?.photo_url }, recap: state.recap } : null
  const current = state.status === 'ready' ? `${state.recap.month.year}-${state.recap.month.month}` : ''

  return (
    <div className="page max-w-3xl">
      <BackLink to="/vip" label={tr('Back to VIP')} />
      {months.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label={tr('Month')}>
          {months.map((mm) => {
            const key = `${mm.year}-${mm.month}`
            return (
              <button key={key} type="button" role="tab" aria-selected={current === key} onClick={() => setParams({ m: key }, { replace: true })}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200 ${current === key ? 'bg-brand text-white' : 'bg-cloud text-smoke hoverable:hover:text-ink'}`}>
                {monthLabel(mm.year, mm.month, { short: true })}
              </button>
            )
          })}
        </div>
      )}
      {state.status === 'loading' && <div className="flex h-[60vh] items-center justify-center"><Spinner /></div>}
      {state.status === 'ready' && (
        <YearInReview
          key={current}
          data={data}
          build={buildVipCards}
          Share={VipShareCard}
          fileStem={`tryp-vip-${current}`}
        />
      )}
      {state.status === 'none' && (
        <div className="mx-auto w-full max-w-[400px]">
          <Card palette="ember" className="aspect-[9/16]" footer={false}>
            <Eyebrow palette="ember">{tr('VIP recap')}</Eyebrow>
            <div className="flex flex-1 flex-col justify-center gap-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/30"><Icon name="video" className="h-7 w-7" /></span>
              <p className="text-[32px] font-extrabold leading-[1.05] tracking-tight">{tr('Nothing to show yet.')}</p>
              <Line palette="ember">{tr('Your recap is made from the videos you add to your VIP page. Add one and it starts counting.')}</Line>
            </div>
            <Link to="/vip" className="mt-6 inline-flex items-center gap-2 self-start rounded-full bg-white px-4 py-2 text-sm font-bold text-brand">{tr('Go to my VIP page')}</Link>
          </Card>
        </div>
      )}
    </div>
  )
}
