import Icon from '../Icon'
import { Skeleton } from '../ui'
import { TargetBar, VipVideoRow } from './parts'
import { money, perK, useKindT } from '../../lib/vip'

// THE THREE CARDS UNDER "THIS MONTH" (4 Oct 2026).
//
// Ethan, on the VIP page: the target card should say only "No target has been set yet. Ask your market lead if you would like
// one to aim for."; the "How you are paid" card should say how you are paid and nothing else - the rate per 1,000 views and
// that it is paid monthly - with both cards smaller; and a creator's own goal (set under Stats) should appear on the target
// card, next to whatever the team has set.

/** The team's target and the creator's own goal, side by side as bars. Says so, once, when there is neither. */
export function TargetCard({ member, stats, onSetGoal }) {
  const tr = useKindT()
  const teamVideos = Number(member.target_videos) || 0
  const teamViews = Number(member.target_views) || 0
  const own = Number(member.own_goal_views) || 0
  const none = !teamVideos && !teamViews && !own
  return (
    <section className="rounded-card border border-gray-100 bg-white p-4 shadow-card">
      <h2 className="mb-3 flex items-center gap-2 text-[13.5px] font-bold text-ink"><Icon name="flag" className="h-4 w-4 text-brand" />{tr('Your target this month')}</h2>
      {none ? (
        <div>
          <p className="text-sm leading-relaxed text-smoke">{tr('No target has been set yet. Ask your market lead if you would like one to aim for.')}</p>
          {/* A FULL-WIDTH BUTTON UNDER THE SENTENCE (4 Oct 2026). It sat in a thin column to the right of the text, which squeezed
              the sentence into a narrow strip. */}
          {onSetGoal && (
            <button type="button" onClick={onSetGoal} className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-xl border border-brand/25 bg-brand-tint/50 px-4 py-2.5 text-[13px] font-semibold text-brand transition-colors duration-200 hoverable:hover:bg-brand hoverable:hover:text-white">
              <Icon name="flag" className="h-4 w-4" />{tr('Set my own goal')}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3.5">
          {teamVideos ? <TargetBar label={tr('Videos posted')} value={stats.videos} target={teamVideos} /> : null}
          {teamViews ? <TargetBar label={tr('Views')} value={stats.views} target={teamViews} /> : null}
          {own ? <TargetBar label={teamVideos || teamViews ? tr('Your own goal') : tr('Your own goal, in views')} value={stats.views} target={own} done={tr('Goal reached')} /> : null}
        </div>
      )}
    </section>
  )
}

/** How a VIP is paid: the rate per 1,000 views, and that it is monthly. */
export function HowPaidCard({ stats, cur, member = null }) {
  const tr = useKindT()
  // A personal deal shows all of itself: the monthly fee and the cap sit beside the rate (11 Oct 2026).
  const fee = Number(member?.monthly_fee) || 0
  const cap = Number(member?.monthly_cap) || 0
  const tiles = [
    { icon: 'money', label: tr('Your rate'), value: perK(stats.effective_cpm, cur), hint: tr('per 1,000 views') },
    ...(fee ? [{ icon: 'badge', label: tr('Monthly fee'), value: money(fee, cur, { cents: false }), hint: member.fee_min_videos ? tr('with {n}+ videos', { n: member.fee_min_videos }) : tr('every month') }] : []),
    ...(cap ? [{ icon: 'shield', label: tr('Monthly cap'), value: money(cap, cur, { cents: false }), hint: tr('on views pay') }] : []),
    { icon: 'calendar', label: tr('Paid'), value: tr('Monthly'), hint: tr('after the month closes') },
  ]
  return (
    <section className="rounded-card border border-gray-100 bg-white p-4 shadow-card">
      <h2 className="mb-3 flex items-center gap-2 text-[13.5px] font-bold text-ink"><Icon name="money" className="h-4 w-4 text-brand" />{tr('How you are paid')}</h2>
      <dl className="grid grid-cols-2 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl bg-cloud/60 px-3 py-2.5">
            <dt className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400"><Icon name={t.icon} className="h-3 w-3 text-brand" />{t.label}</dt>
            <dd className="mt-0.5 truncate text-[17px] font-bold tabular-nums leading-tight text-ink">{t.value}</dd>
            <dd className="text-[11px] leading-snug text-smoke">{t.hint}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** The three newest videos, as the same cards as My videos. */
export function LatestVideos({ videos, cpm, currency, onSeeAll, onChanged }) {
  const tr = useKindT()
  const latest = (videos || []).filter((v) => v.status !== 'removed').slice(0, 3)
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-ink">{tr('Latest videos')}</h2>
        {(videos || []).length > 3 && <button type="button" onClick={onSeeAll} className="text-xs font-semibold text-brand hover:underline">{tr('See all')}</button>}
      </div>
      {videos === undefined ? <Skeleton className="h-28 w-full rounded-card" /> : latest.length === 0
        ? <p className="rounded-card border border-dashed border-gray-200 px-6 py-8 text-center text-sm text-smoke">{tr('No videos yet. Paste a link above and it starts counting.')}</p>
        : <ul className="space-y-3">{latest.map((v) => <VipVideoRow key={v.id} video={v} cpm={cpm} currency={currency} onRemoved={onChanged} />)}</ul>}
    </section>
  )
}
