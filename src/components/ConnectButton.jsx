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

  const label = { none: 'Connect', pending_sent: 'Pending', pending_received: 'Accept request', connected: '✓ Connected' }[rel]
  const primary = rel === 'none' || rel === 'pending_received'
  const title = rel === 'pending_sent' ? 'Cancel request' : rel === 'connected' ? 'Disconnect' : ''

  return (
    <button onClick={act} disabled={busy} title={title} className={`${primary ? 'btn-primary' : 'btn-secondary'} ${className}`}>
      {label}
    </button>
  )
}
