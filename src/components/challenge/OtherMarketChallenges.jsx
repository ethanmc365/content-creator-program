import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useT } from '../../lib/i18n'
import { flagFromIso } from '../../lib/flags'
import { cx, formatDate } from '../../lib/utils'
import Icon from '../Icon'
import { openJoinMarket } from '../network/JoinMarket'

// WHAT THE OTHER MARKETS ARE RUNNING (1 Oct 2026).
//
// Ethan: "for creators in the UK community they should be able to scroll down
// and above archived it should show the Portugal and Spanish challenge but
// greyed out, this is just to show that there are other challenges running.
// And clicking on it should show a popup ... to request to join a market and
// say why you would like to create content for that market and take part in
// that challenge. All admins, anyone on the Tryp.com team should be able to go
// in and view other challenges as they could learn from them."
//
// A creator cannot read another market's live challenge (RLS, rightly), so the
// window comes from `other_market_challenges()` (migration 308): title, market,
// dates and counts, nothing from the brief. The team can read every challenge
// already, so for them the rows are the page's own and each card opens it.
export default function OtherMarketChallenges({ staffRows = null, communities = [] }) {
  const tr = useT()
  const staff = Array.isArray(staffRows)
  const [rows, setRows] = useState(null)

  useEffect(() => {
    if (staff) return undefined
    let alive = true
    supabase.rpc('other_market_challenges').then(({ data, error }) => {
      if (alive) setRows(error ? [] : (data ?? []))
    })
    return () => { alive = false }
  }, [staff])

  const list = staff
    ? staffRows.map((c) => {
      const m = communities.find((x) => x.id === c.community_id)
      return {
        id: c.id, title: c.title, community_id: c.community_id, market_name: m?.name ?? '',
        country_codes: m?.country_codes ?? [], end_date: c.end_date, start_date: c.start_date,
        entries: c.submissions?.[0]?.count ?? 0,
      }
    })
    : (rows ?? [])
  if (list.length === 0) return null

  return (
    <section>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-smoke">{tr('Running in other markets')}</h2>
        <p className="mt-1 text-sm text-smoke">
          {staff
            ? tr('Every market\'s live challenge, so the team can see how each one is going.')
            : tr('Other Tryp.com markets are running these right now. Want to create for one of them? Ask to join.')}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {list.map((c) => {
          const flags = (c.country_codes || []).map(flagFromIso).join('')
          const body = (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-cloud px-2.5 py-1 text-xs font-semibold text-ink">
                  {flags && <span aria-hidden className="text-sm leading-none">{flags}</span>}
                  <span className="truncate">{c.market_name}</span>
                </span>
                <span className="shrink-0 text-xs text-smoke">{tr('Closes {date}', { date: formatDate(c.end_date) })}</span>
              </div>
              <h3 className="mt-3 line-clamp-2 text-lg font-semibold leading-snug text-ink">{c.title}</h3>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                <span className="text-smoke">
                  {Number(c.entries) === 1 ? tr('1 entry so far') : tr('{n} entries so far', { n: Number(c.entries) || 0 })}
                </span>
                {staff ? (
                  <span className="font-semibold text-brand">{tr('View challenge')} →</span>
                ) : c.join_state === 'pending' ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-smoke">
                    <Icon name="check" className="h-3.5 w-3.5" />{tr('Request sent')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-semibold text-brand">
                    <Icon name="lock" className="h-3.5 w-3.5" />{tr('Ask to join')}
                  </span>
                )}
              </div>
            </>
          )
          return staff ? (
            <Link
              key={c.id}
              to={`/challenges/${c.id}`}
              className="card block transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift"
            >
              {body}
            </Link>
          ) : (
            <button
              key={c.id}
              type="button"
              // ONE SHEET FOR EVERY REQUEST (12 Oct 2026): the same questions (language, ties, a real reason) wherever it is asked.
              onClick={() => openJoinMarket(c.community_id)}
              // GREYED, NOT HIDDEN: it is somebody else's challenge, shown so
              // you know it exists. Full colour comes back on hover/press so the
              // card still reads as something you can open.
              className={cx(
                'card block w-full text-left opacity-60 grayscale transition-all duration-200',
                'border-dashed hover:-translate-y-0.5 hover:opacity-100 hover:grayscale-0 hover:shadow-lift focus-visible:opacity-100 focus-visible:grayscale-0',
              )}
            >
              {body}
            </button>
          )
        })}
      </div>

    </section>
  )
}
