import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { sendConnectionRequest } from '../lib/connections'
import { Modal } from './ui'

// LinkedIn-style connect control. `relation` is { relation, rowId } | null:
//   null                -> "Connect"        (sends a request -> pending_sent)
//   pending_sent        -> "Pending"        (tap to cancel the request)
//   pending_received    -> "Accept request" (tap to accept -> connected)
//   connected           -> "Connected"      (tap to disconnect)
// onChange(newRelationOrNull) lets the parent keep its list in sync.
export default function ConnectButton({
  myId, targetId, relation, onChange,
  className = 'flex-1 !py-2 text-xs',
  // The dialog needs a name to write "Say hello to Maddie". A caller that has
  // one passes it; without it the copy falls back to something that reads fine
  // with nothing in the slot.
  targetName = '',
}) {
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')
  const rel = relation?.relation || 'none'

  useEffect(() => { if (asking) setNote('') }, [asking])

  // WHY CONNECTING IS TWO TAPS NOW.
  //
  // Ethan: "say why you want to connect, an optional note whenever you request
  // to connect with someone. Maybe you say you love their travel photos or you
  // want to learn more about the country they've been to. You can just write in
  // the box or you can skip it, it's optional, just connect with them."
  //
  // The cost is one extra tap on a control that used to be instant, and it buys
  // the thing that makes a request land: a stranger's connection request with
  // nothing attached is a notification you deal with, and one that says "I loved
  // your Lisbon video" is a conversation. SKIPPING IS ONE TAP AND IS NOT
  // BURIED - "Just connect" sits next to "Send", same size, no penalty.
  //
  // The note is private to the two of you and lives in its own table; see
  // lib/connections and migration 107 for why it cannot be a column here.
  async function confirmSend(withNote) {
    if (busy) return
    setBusy(true)
    const id = await sendConnectionRequest(myId, targetId, withNote ? note : '')
    setBusy(false)
    setAsking(false)
    if (id) onChange?.({ relation: 'pending_sent', rowId: id })
  }

  async function act(e) {
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    if (rel === 'none') {
      // NOT SENT YET. Opening the note dialog IS the action; sending happens in
      // `confirmSend` below. See the note above the dialog for why this became
      // two steps instead of one.
      setBusy(false)
      setAsking(true)
      return
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

  const first = (targetName || '').trim().split(' ')[0]

  return (
    <>
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

    {/* Stopping propagation on the wrapper: this control is routinely rendered
        inside a card that is itself a link to the profile, and a click landing
        on the dialog must not also navigate away from it. */}
    <span onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
      <Modal open={asking} onClose={() => setAsking(false)} title={first ? `Connect with ${first}` : 'Send a connection request'}>
        <div className="space-y-5">
          <p className="text-sm text-smoke">
            Add a line about why, if you like. It is the difference between a
            request somebody accepts and one they think about.
          </p>
          <div>
            <label htmlFor="connect-note" className="label">
              Your note <span className="font-normal text-smoke">(optional)</span>
            </label>
            <textarea
              id="connect-note"
              rows={3}
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={first
                ? `I loved your video from Lisbon, ${first}. I am heading there in March.`
                : 'I loved your last video. I am heading there in March.'}
              className="input w-full resize-none"
              autoFocus
            />
            <p className="mt-1 text-right text-[11px] text-smoke tabular-nums">{note.length}/300</p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => confirmSend(false)} disabled={busy}
              className="btn-ghost w-full justify-center sm:w-auto">
              Just connect
            </button>
            <button type="button" onClick={() => confirmSend(true)} disabled={busy || !note.trim()}
              className="btn-primary w-full justify-center disabled:opacity-50 sm:w-auto">
              {busy ? 'Sending…' : 'Send with note'}
            </button>
          </div>
        </div>
      </Modal>
    </span>
    </>
  )
}
