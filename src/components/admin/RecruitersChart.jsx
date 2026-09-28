import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Avatar, Skeleton } from '../ui'
import Icon from '../Icon'
import { cx } from '../../lib/utils'
import { periodLabel, periodRange } from '../../lib/kpiTracker'
import { useT } from '../../lib/i18n'

// WHO BROUGHT THEM IN.
//
// "Creators recruited" is one of the four standard KPIs and the page could only
// ever say how many. That is the number a target is set against, and it is the
// least useful half of the fact: a quarter where thirty creators arrived
// because two members kept bringing friends is a completely different market
// from one where thirty arrived off an advert, and the KPI card reads the same
// for both.
//
// Ethan asked for this above the year overview, which is the right place for
// it: the cards above are "are we on track for this quarter", the year below is
// "is this market going anywhere", and this is the one chart that explains
// either of them. It follows the same market and period as everything else on
// the page.
//
// A REFERRAL HERE IS NOT THE VOUCHER'S REFERRAL. `lib/referrals` only counts
// one once the referred creator has posted to a challenge, because that is what
// a voucher is paid for. This chart is about RECRUITING, so it counts everybody
// who arrived through somebody - and says separately how many of them have gone
// on to post, because a recruiter who brings in ten people who never film is a
// different fact again.

export default function RecruitersChart({ scope, period }) {
  const tr = useT()
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!scope) return undefined
    let alive = true
    setData(null)
    ;(async () => {
      const { start, end } = periodRange(period)
      // Everybody who joined THIS market inside the period - the same rule the
      // `creators_recruited` KPI counts by, so the two numbers always agree.
      const { data: members } = await supabase
        .from('community_members')
        .select('profile_id')
        .eq('community_id', scope)
        .gte('joined_at', start.toISOString())
        .lt('joined_at', end.toISOString())
      const ids = (members || []).map((m) => m.profile_id)
      if (!ids.length) { if (alive) setData({ recruiters: [], alone: 0, total: 0 }); return }

      const { data: people } = await supabase
        .from('profiles')
        .select('id, referred_by, is_test')
        .in('id', ids)
      const real = (people || []).filter((p) => !p.is_test)

      const byRecruiter = new Map()
      let alone = 0
      for (const p of real) {
        if (!p.referred_by) { alone += 1; continue }
        if (!byRecruiter.has(p.referred_by)) byRecruiter.set(p.referred_by, [])
        byRecruiter.get(p.referred_by).push(p.id)
      }

      // Who they are, and which of the people they brought have actually filmed.
      const recruiterIds = [...byRecruiter.keys()]
      const broughtIds = [...byRecruiter.values()].flat()
      const [{ data: names }, { data: posted }] = await Promise.all([
        recruiterIds.length
          ? supabase.from('profiles').select('id, name, photo_url').in('id', recruiterIds)
          : Promise.resolve({ data: [] }),
        broughtIds.length
          ? supabase.from('submissions').select('creator_id').in('creator_id', broughtIds)
          : Promise.resolve({ data: [] }),
      ])
      const filmed = new Set((posted || []).map((s) => s.creator_id))
      const nameOf = new Map((names || []).map((p) => [p.id, p]))

      const recruiters = recruiterIds
        .map((id) => {
          const brought = byRecruiter.get(id)
          return {
            id,
            name: nameOf.get(id)?.name || tr('A creator who has left'),
            photo: nameOf.get(id)?.photo_url || null,
            count: brought.length,
            filmed: brought.filter((b) => filmed.has(b)).length,
          }
        })
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

      if (alive) setData({ recruiters, alone, total: real.length })
    })()
    return () => { alive = false }
  }, [scope, period, tr])

  const top = useMemo(() => (data ? data.recruiters.slice(0, 8) : []), [data])
  const max = top.length ? top[0].count : 0

  return (
    <div className="mt-8">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">
        {tr('Who brought them in · {p}', { p: periodLabel(period) })}
      </p>

      {!data ? (
        <Skeleton className="h-40 w-full rounded-card" />
      ) : data.total === 0 ? (
        <div className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">
          {tr('Nobody joined this market in {p}.', { p: periodLabel(period) })}
        </div>
      ) : (
        <div className="animate-fade-up overflow-hidden rounded-card border border-gray-100 bg-white p-4 shadow-card sm:p-5">
          {top.length === 0 ? (
            <p className="py-6 text-center text-sm text-smoke">
              {tr('All {n} creators who joined in {p} found the programme on their own - nobody was referred.', {
                n: data.total, p: periodLabel(period),
              })}
            </p>
          ) : (
            <>
              <ul className="space-y-2.5">
                {top.map((r, i) => (
                  <li key={r.id} className="flex items-center gap-3 animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
                    <Avatar src={r.photo} name={r.name} size="xs" />
                    <span className="w-28 shrink-0 truncate text-[13px] font-semibold text-ink sm:w-40">{r.name}</span>
                    <span className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-cloud">
                      {/* The filled part is the people who have actually
                          filmed; the rest of the bar is everybody they brought.
                          One bar, two facts, and the darker part is the one
                          that turned into work. */}
                      <span
                        className="flex h-full rounded-full bg-brand-tint"
                        style={{ width: `${Math.max(6, Math.round((r.count / max) * 100))}%` }}
                      >
                        <span
                          className="h-full rounded-full bg-brand transition-[width] duration-700 ease-out"
                          style={{ width: `${r.count ? Math.round((r.filmed / r.count) * 100) : 0}%` }}
                        />
                      </span>
                    </span>
                    <span className="w-24 shrink-0 text-right text-[11px] tabular-nums text-smoke">
                      <strong className="text-sm font-bold text-ink">{r.count}</strong>
                      {' '}
                      {r.filmed > 0 ? tr('({n} filmed)', { n: r.filmed }) : tr('(none filmed)')}
                    </span>
                  </li>
                ))}
              </ul>
              <p className={cx('mt-4 flex items-center gap-2 border-t border-gray-100 pt-3 text-[11px] text-gray-400')}>
                <Icon name="users" className="h-3.5 w-3.5" />
                {data.alone > 0
                  ? tr('{r} of the {t} who joined were referred; the other {a} found the programme on their own.', {
                    r: data.total - data.alone, t: data.total, a: data.alone,
                  })
                  : tr('Every one of the {t} who joined was referred by somebody.', { t: data.total })}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
