import { useState } from 'react'
import { supabase } from '../lib/supabase'

// LinkedIn-style connect control. `relation` is { relation, rowId } | null:
//   null                -> "Connect"        (sends a request -> pending_sent)
//   pending_sent        -> "Pending"        (tap to cancel the request)
//   pending_received    -> "Accept request" (tap to accept -> connected)
//   connected           -> "Connected"      (tap to disconnect)
// onChange(newRelationOrNull) lets the parent keep its list in sync.
export default function ConnectButton({ myId, targetId, relation, onChange, className = 'flex-1 !py-2 text-xs' }) {
  const [busy, setBusy] = useState(false)
  const rel = relation?.relation || 'none'

  async function act(e) {
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    if (rel === 'none') {
      const { data } = await supabase
        .from('connections')
        .insert({ creator_id: myId, connected_creator_id: targetId })
        .select('id')
        .single()
      if (data) onChange?.({ relation: 'pending_sent', rowId: data.id })
    } else if (rel === 'pending_received') {
      await supabase.from('connections').update({ status: 'accepted' }).eq('id', relation.rowId)
      onChange?.({ relation: 'connected', rowId: relation.rowId })
    } else {
      // pending_sent (cancel) or connected (disconnect)
      await supabase.from('connections').delete().eq('id', relation.rowId)
      onChange?.(null)
    }
    setBusy(false)
  }

  // THE COLOUR IS THE STATE.
  //
  // Ethan: "when you're connected with someone the button should be the green
  // colour saying connected, if it's pending it should be the lighter orange
  // and if you haven't connected it's the Tryp.com orange."
  //
  // It used to be `btn-primary` for the two you can act on and `btn-secondary`
  // for the two you cannot, which encodes "is this a call to action" rather
  // than "what is going on between us" - so Pending and Connected, two
  // completely different situations, were the same grey button. Three states,
  // three colours, and the fourth (a request waiting for YOU) stays full brand
  // because it is the only one of the four that actually wants a press.
  //
  // Green is the same green "answered" uses on the board and "played" uses on
  // the daily puzzles. It already means done in this product.
  const label = { none: 'Connect', pending_sent: 'Pending', pending_received: 'Accept request', connected: 'Connected' }[rel]
  const tone = {
    none: 'bg-brand text-white ring-1 ring-brand hover:shadow-card',
    pending_sent: 'bg-brand-light/25 text-brand ring-1 ring-brand-light/60 hover:bg-brand-light/40',
    pending_received: 'bg-brand text-white ring-1 ring-brand hover:shadow-card',
    connected: 'bg-green-50 text-green-700 ring-1 ring-green-500/40 hover:bg-green-100',
  }[rel]
  const title = rel === 'pending_sent' ? 'Cancel request' : rel === 'connected' ? 'Disconnect' : ''

  return (
    <button
      onClick={act}
      disabled={busy}
      title={title}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 ${tone} ${className}`}
    >
      {rel === 'connected' && (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 12l5 5L20 6" />
        </svg>
      )}
      {label}
    </button>
  )
}
