import { useState } from 'react'
import Icon from './Icon'
import { Modal, Spinner } from './ui'
import { supabase } from '../lib/supabase'
import { pickHook } from '../lib/hooks'
import { copyToClipboard } from '../lib/clipboard'
import { toast } from '../lib/toast'
import { useT } from '../lib/i18n'
import { cx } from '../lib/utils'

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
    if (ok !== false) toast(tr('Hook copied'))
  }

  return (
    <>
      <section className={cx('relative overflow-hidden rounded-card border border-gray-100 bg-white p-5 shadow-card', className)}>
        <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-brand/10 blur-2xl" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-card">
            <Icon name="bulb" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-ink">{tr('Stuck on the first line?')}</p>
            <p className="text-xs leading-snug text-smoke">{tr('Get an opener that has worked for other Tryp.com creators.')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={start}
          className="btn-primary relative mt-4 w-full justify-center transition-transform duration-200 hoverable:hover:scale-[1.02]"
        >
          <Icon name="sparkles" className="h-4 w-4" />
          {tr('Hook me up')}
        </button>
      </section>

      <Modal open={open} onClose={() => setOpen(false)} title={tr('Your hook')}>
        <div className="space-y-5">
          <div className="relative min-h-[8.5rem] overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light px-5 py-6 text-white shadow-card">
            <span aria-hidden className="pointer-events-none absolute bottom-[-2.25rem] right-3 select-none font-serif text-[8rem] font-bold leading-none text-white/15">&rdquo;</span>
            {busy && !hook ? (
              <div className="flex h-20 items-center justify-center"><Spinner /></div>
            ) : failed ? (
              <p className="relative text-sm font-medium">{tr('Could not load the hooks. Try again in a moment.')}</p>
            ) : hook ? (
              <p key={turn} className="animate-fade-up relative text-xl font-bold leading-snug tracking-[-0.01em] [overflow-wrap:anywhere] sm:text-2xl">
                {hook.text}
              </p>
            ) : (
              <p className="relative text-sm font-medium">{tr('No hooks yet.')}</p>
            )}
          </div>
          <p className="text-xs leading-relaxed text-smoke">
            {tr('Make it yours: swap in your city, your price, your destination. Keep the shape.')}
          </p>
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
