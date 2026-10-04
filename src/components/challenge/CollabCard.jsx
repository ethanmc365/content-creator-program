import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Avatar, Skeleton } from '../ui'
import Icon from '../Icon'
import { useT } from '../../lib/i18n'

// THE COLLAB BONUS: BOTH CREATORS ENTER THE POST (rebuilt 5 Oct 2026, migration 337).
//
// Ethan: "I think it would be better if they both submit it rather than just one. You can tell if both of them submit it and verify it that way
// ... if it's a collab post, you only count the views once." So there is nothing to ask or confirm any more. Two creators publish ONE Instagram
// collab post; each enters its link as an entry. When the second one goes in, the database sees it is the same post, links the two entries,
// records the pair, and both earn the collab points. The views count once (on the first entry), and a post can only have one partner.
// This card explains it, and lists the posts that have been matched for the viewer.
export default function CollabCard({ challenge, rule, meId }) {
  const tr = useT()
  const [rows, setRows] = useState(undefined)
  const [names, setNames] = useState({})
  const points = Number(rule.points) || 0

  useEffect(() => {
    let alive = true
    supabase.from('challenge_collabs').select('*').eq('challenge_id', challenge.id).eq('status', 'confirmed')
      .then(async ({ data }) => {
        const mine = (data || []).filter((c) => c.requester_id === meId || c.partner_id === meId)
        if (!alive) return
        setRows(mine)
        const ids = [...new Set(mine.map((c) => (c.requester_id === meId ? c.partner_id : c.requester_id)))]
        if (ids.length) {
          const { data: ps } = await supabase.from('profiles').select('id, name, photo_url').in('id', ids)
          if (alive) setNames(Object.fromEntries((ps || []).map((p) => [p.id, p])))
        }
      })
    return () => { alive = false }
  }, [challenge.id, meId])

  return (
    <section className="rounded-card border border-gray-100 bg-white p-4 shadow-card">
      <div className="flex items-start gap-3">
        <Icon name="users" className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-ink">{tr('Instagram collab bonus')}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-smoke">{tr('Post one Instagram collab post with another creator. You each enter its link, and you both earn +{n} points.', { n: points })}</p>
        </div>
        <span className="shrink-0 text-base font-extrabold tabular-nums text-brand">+{points}</span>
      </div>
      <ol className="mt-3 space-y-1.5 text-xs text-smoke">
        {[tr('Publish one Instagram collab post together, so it shows on both profiles.'), tr('Each of you enters that same post link as an entry.'), tr('We match them by themselves. Its views count once, and you both get the points.')].map((t, i) => (
          <li key={t} className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cloud text-[10px] font-bold text-ink">{i + 1}</span><span className="pt-0.5">{t}</span></li>
        ))}
      </ol>
      {rows === undefined ? <Skeleton className="mt-3 h-10 w-full rounded-xl" /> : rows.length > 0 && (
        <ul className="mt-3 divide-y divide-gray-50 rounded-xl border border-gray-100">
          {rows.map((c) => {
            const p = names[c.requester_id === meId ? c.partner_id : c.requester_id]
            return (
              <li key={c.id} className="flex items-center gap-2.5 px-3 py-2">
                <Avatar src={p?.photo_url} name={p?.name || '?'} size="xs" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{tr('With {n}', { n: p?.name || tr('a creator') })}</span>
                <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-brand"><Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.6} />+{points}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
