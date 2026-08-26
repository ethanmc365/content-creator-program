import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { cx } from '../../lib/utils'

// READING AN ADMIN PAGE ONE MARKET AT A TIME.
//
// The same control on Analytics and on Rewards, and it has to be the same
// control: a country manager who learns it on one page should not meet a
// different shape on the other, and two implementations of "which market am I
// looking at" would disagree about retired markets within a month.
//
// IT LOADS ITS OWN LIST. Every page that needs the scope also needs the
// membership rows to apply it, but the list of markets is small, cached by the
// browser, and belongs to the control rather than to whichever page is hosting
// it. A new market therefore appears here the moment it is created, with
// nothing to update.
//
// THERE IS NO "READING:" LABEL. It had one, and a label in front of a row of
// market names is a word explaining a control that explains itself.
//
// IT IS AS WIDE AS ITS BUTTONS AND NO WIDER. It used to stretch the full width
// of whatever page hosted it, so on a two-column page it drew a bar over BOTH
// columns - implying it scoped the right-hand one too, which on Rewards it does
// not. `w-fit` makes the control the size of the thing it controls.

/** Loads the markets and the membership rows every scoped page needs. */
export function useMarkets() {
  const [markets, setMarkets] = useState([])
  const [memberRows, setMemberRows] = useState([])

  useEffect(() => {
    let alive = true
    Promise.all([
      supabase.from('communities').select('id, name, kind, currency, retired_at').order('name'),
      supabase.from('community_members').select('community_id, profile_id').eq('status', 'active'),
    ]).then(([{ data: c }, { data: m }]) => {
      if (!alive) return
      // Retired markets and the worldwide shell are not places you scope TO.
      // The shell is every creator, which is what "Worldwide" already means.
      setMarkets((c || []).filter((x) => x.kind !== 'network' && !x.retired_at))
      setMemberRows(m || [])
    })
    return () => { alive = false }
  }, [])

  return { markets, memberRows }
}

/**
 * @param {object}   props
 * @param {Array}    props.markets  from useMarkets
 * @param {string}   props.value    community id, or '' for the whole programme
 * @param {Function} props.onChange
 * @param {string}   [props.note]   a short line about what is in scope
 */
export default function MarketScope({ markets = [], value = '', onChange, note }) {
  if (!markets.length) return null
  return (
    <div className="mb-6 flex w-fit max-w-full flex-wrap items-center gap-1.5 rounded-card border border-gray-100 bg-white p-1.5 shadow-card">
      <button
        type="button"
        onClick={() => onChange('')}
        aria-pressed={!value}
        className={cx(
          'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
          !value ? 'bg-brand text-white' : 'text-smoke hover:bg-cloud hover:text-ink',
        )}
      >
        Worldwide
      </button>
      {markets.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          aria-pressed={value === m.id}
          className={cx(
            'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
            value === m.id ? 'bg-brand text-white' : 'text-smoke hover:bg-cloud hover:text-ink',
          )}
        >
          {m.name}
        </button>
      ))}
      {note && <span className="px-2 text-[11px] text-smoke">{note}</span>}
    </div>
  )
}
