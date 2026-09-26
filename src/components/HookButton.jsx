import { useState } from 'react'
import Icon from './Icon'
import { Modal, Spinner } from './ui'
import { supabase } from '../lib/supabase'
import { pickHook } from '../lib/hooks'
import { copyToClipboard } from '../lib/clipboard'
import { toastSuccess } from '../lib/toast'
import { useT } from '../lib/i18n'
import { cx } from '../lib/utils'
import DealFinder from './DealFinder'

// "HOOK ME UP" (24 Sep 2026).
//
// Ethan: "a button that should show up on every challenge... on the right side,
// just above where it shows the prizes... Whenever you click it, it should just
// pop up with a hook... Call it something cool... I don't want any filters or
// anything on the button, just really straightforward: click and give a
// random hook."
//
// The bank (table `hooks`, migration 261) is read once, on the first press,
// and kept for the session - it is ~1,500 short lines and most visits never
// press this at all. Which hook comes next is lib/hooks.pickHook: best first,
// random within a tier, never the same one twice until the ladder runs out.
// Nothing here says how often a hook was used or which formula it belongs to.

let bank = null // module cache for the session
const SEEN = 'tryp_hooks_seen'

function readSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN) || '[]')) } catch { return new Set() }
}
function writeSeen(set) {
  try { localStorage.setItem(SEEN, JSON.stringify([...set].slice(-2000))) } catch { /* private mode */ }
}

async function loadBank() {
  if (bank) return bank
  const { data, error } = await supabase.from('hooks').select('id, text, uses').eq('is_active', true)
  if (error) throw error
  bank = data || []
  return bank
}

export default function HookButton({ className }) {
  const tr = useT()
  const [open, setOpen] = useState(false)
  const [hook, setHook] = useState(null)
  const [busy, setBusy] = useState(false)
  const [turn, setTurn] = useState(0) // re-keys the quote so each one animates in
  const [failed, setFailed] = useState(false)

  async function next() {
    setBusy(true)
    setFailed(false)
    try {
      const hooks = await loadBank()
      let seen = readSeen()
      const { hook: h, reset } = pickHook(hooks, seen)
      if (reset) seen = new Set()
      if (h) { seen.add(h.id); writeSeen(seen) }
      setHook(h)
      setTurn((n) => n + 1)
    } catch {
      setFailed(true)
    }
    setBusy(false)
  }

  async function start() {
    setOpen(true)
    await next()
  }

  async function copy() {
    if (!hook) return
    const ok = await copyToClipboard(hook.text)
    if (ok !== false) toastSuccess(tr('Hook copied'))
  }

  return (
    <>
      {/* JUST THE BUTTON, AND IT ASKS TO BE PRESSED (26 Sep 2026).
          Ethan: "remove where it says 'Stuck on the first line' and the other
          icon ... All I would have here is the button, small. Maybe have it
          glow a bit. Make people want to click it ... the stars beside 'Hook
          Me Up' could be animating." A slow glow breathes behind it and the
          sparkles twinkle; both are decoration and stop under reduced motion. */}
      <section className={cx('relative rounded-card border border-gray-100 bg-white p-3 shadow-card', className)}>
        <div className="relative">
          <span aria-hidden className="absolute inset-0 -z-0 animate-cta-glow rounded-xl bg-brand/60 blur-md" />
          <button
            type="button"
            onClick={start}
            className="hook-cta relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-brand to-brand-light px-5 py-3 text-sm font-bold text-white shadow-card transition-transform duration-200 hoverable:hover:scale-[1.02] active:scale-[0.98]"
          >
            <span aria-hidden className="challenge-sheen pointer-events-none absolute inset-y-0" />
            <span className="hook-sparkles relative h-5 w-5" aria-hidden>
              <Icon name="sparkles" className="h-5 w-5" />
            </span>
            {tr('Hook me up')}
          </button>
        </div>
        {/* The other thing a creator needs before filming: a price to show. */}
        <DealFinder className="mt-2.5" />
      </section>

      <Modal open={open} onClose={() => setOpen(false)} title={tr('Your hook')}>
        <div className="space-y-5">
          {/* THE QUOTE MARK HAS ITS OWN ROW (26 Sep 2026). It was a huge glyph
              pinned to a corner, and a long hook ran straight over it. Now it
              sits above the words, so no length of hook can touch it. */}
          <div className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light px-5 pb-6 pt-4 text-white shadow-card sm:px-6">
            <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
            <span aria-hidden className="block select-none font-serif text-5xl font-bold leading-none text-white/35">&ldquo;</span>
            {busy && !hook ? (
              <div className="flex h-20 items-center justify-center"><Spinner /></div>
            ) : failed ? (
              <p className="relative text-sm font-medium">{tr('Could not load the hooks. Try again in a moment.')}</p>
            ) : hook ? (
              <p key={turn} className="animate-fade-up relative -mt-2 text-xl font-bold leading-snug tracking-[-0.01em] [overflow-wrap:anywhere] sm:text-2xl">
                {hook.text}
              </p>
            ) : (
              <p className="relative text-sm font-medium">{tr('No hooks yet.')}</p>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <button type="button" onClick={next} disabled={busy} className="btn-primary flex-1 justify-center disabled:opacity-60">
              {busy ? <Spinner /> : <><Icon name="refresh" className="h-4 w-4" /> {tr('Another one')}</>}
            </button>
            <button type="button" onClick={copy} disabled={!hook} className="btn-secondary flex-1 justify-center disabled:opacity-50">
              <Icon name="copy" className="h-4 w-4" /> {tr('Copy')}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
