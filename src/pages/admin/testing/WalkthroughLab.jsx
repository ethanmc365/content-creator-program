import { useEffect, useMemo, useState } from 'react'
import { Select } from '../../../components/ui'
import { LabPage, Panel, Note } from './kit'
import Icon from '../../../components/Icon'
import { startTour } from '../../../components/tour/TourGate'
import { setTourPreviewWho, stepsFor, tourPreviewWho } from '../../../lib/tour'
import { notice } from '../../../lib/confirm'
import { cx } from '../../../lib/utils'
import { profilesApi } from '../../../api/profiles'

// THE TWO WALKTHROUGHS, ONE PRESS EACH.
//
// Each card starts the REAL walkthrough over the real app, from its first step, exactly as a new creator or a new VIP
// gets it - the same overlay, the same spotlight, the same pages. For the VIP walk the VIP page is shown as a new VIP's
// first day (VipHub `mode=as`), because the team are not VIPs themselves. Nothing is saved: finishing a walk started
// here does not mark anybody's own walkthrough as done, and it can be closed at any point.
const WALKS = [
  {
    key: 'community',
    title: 'Community walkthrough',
    icon: 'users',
    blurb: 'What every newly approved creator is walked through: the challenges, the rooms, payment details and notifications.',
  },
  {
    key: 'vip',
    title: 'VIP walkthrough',
    icon: 'star',
    blurb: 'What a new VIP is walked through instead: this month’s earnings, adding a video, payouts, the VIP rooms, then payment details and notifications.',
  },
]

export default function WalkthroughLab() {
  const lists = useMemo(() => ({ community: stepsFor({ network: true }), vip: stepsFor({ network: true, vip: true }) }), [])
  // WALK IT AS A REAL VIP. Pick one of the VIPs and the walk shows their own page (their month, their videos, their
  // payouts), read only, the way they see it. "A new VIP" is a first day with nothing in it yet.
  const [vips, setVips] = useState([])
  const [who, setWho] = useState(() => tourPreviewWho() || '')
  useEffect(() => {
    profilesApi.profiles().select('id, name').eq('is_vip', true).eq('status', 'active').eq('is_test', false).order('name')
      .then(({ data }) => setVips(data || []))
  }, [])
  const run = (key) => {
    if (key === 'vip') setTourPreviewWho(who || null)
    if (!startTour(key)) notice('Open the app first, then try again.')
  }

  return (
    <LabPage
      title="Walkthroughs"
      icon="sparkles"
      sandbox={false}
      subtitle="The guided tour a creator gets on their first open, in its two versions. Press one to run it over the app now, from the first step."
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {WALKS.map((w, i) => (
          <Panel key={w.key} i={i} title={w.title} hint={w.blurb}>
            <ol className="relative space-y-2.5 pl-1">
              {lists[w.key].map((s, j) => (
                <li key={s.key} className="flex items-start gap-3 animate-rise" style={{ animationDelay: `${120 + j * 45}ms` }}>
                  <span className={cx('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black tabular-nums',
                    s.required ? 'bg-brand text-white' : 'bg-cloud text-brand')}>{j + 1}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{s.title}</span>
                    <span className="block text-xs text-smoke">{s.do || (s.goal?.kind === 'end' ? 'Finish' : 'Start')}{s.required ? ' · required' : ''}</span>
                  </span>
                </li>
              ))}
            </ol>
            {w.key === 'vip' && (
              <div className="mt-5">
                <p className="label">Walk it as</p>
                <Select variant="field" className="w-full" ariaLabel="Walk it as" value={who} onChange={setWho}
                  options={[{ value: '', label: 'A new VIP, first day' }, ...vips.map((v) => ({ value: v.id, label: v.name }))]} />
                <p className="mt-1.5 text-xs text-smoke">Their real page, read only: adding a video is shown but not sent.</p>
              </div>
            )}
            <button type="button" onClick={() => run(w.key)} className="btn-primary mt-5 w-full justify-center">
              <Icon name={w.icon} className="h-4 w-4" />Run the {w.key === 'vip' ? 'VIP' : 'community'} walkthrough
            </button>
          </Panel>
        ))}
      </div>
      <Note className="mt-5">Close a walk with the X at any time. Steps that ask you to do something (add payment details, turn notifications on) work for real, so on your own account they complete straight away if they are already done.</Note>
    </LabPage>
  )
}
