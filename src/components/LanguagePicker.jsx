import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'
import { LOCALES, loadLocale, setLocale, useLocale } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { loadOverrides } from '../lib/translations'
import { cx } from '../lib/utils'

// THE LANGUAGE, PICKED BEFORE YOU HAVE AN ACCOUNT (2 Oct 2026).
//
// Ethan: "We also want a language picker on the public page where creators can sign up ... at the very
// top, we have that heading bar. They can switch the language there ... This will also be for the whole
// sign-up process ... so that they can sign up in their own language."
//
// It is the same choice Settings offers, and it works the same way: the dictionary is awaited before the
// language flips so the page redraws once, the choice is written to THIS DEVICE (that is what makes it
// instant, and what a stranger has - there is no profile yet) and, when somebody is signed in, to the
// profile so it follows them. Each option is named in its OWN language first ("Español"), because the
// person choosing may not be able to read the English name.
//
// The list floats over the page in a portal: the landing header is a sticky pill with `backdrop-blur`,
// which makes it a containing block for anything `fixed` inside it, and the auth card clips overflow.
export default function LanguagePicker({ className, tone = 'soft', align = 'right', userId = null, onChosen }) {
  const code = useLocale()
  const current = LOCALES.find((l) => l.code === code) || LOCALES[0]
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(null)
  const [pos, setPos] = useState(null)
  const btn = useRef(null)
  const list = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const place = () => {
      const r = btn.current?.getBoundingClientRect()
      if (!r) return
      const width = 224
      const left = align === 'right' ? Math.max(8, Math.min(window.innerWidth - width - 8, r.right - width)) : Math.max(8, Math.min(window.innerWidth - width - 8, r.left))
      setPos({ top: r.bottom + 8, left, width })
    }
    place()
    const off = (e) => {
      if (btn.current?.contains(e.target) || list.current?.contains(e.target)) return
      setOpen(false)
    }
    const esc = (e) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus() } }
    document.addEventListener('pointerdown', off)
    document.addEventListener('keydown', esc)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      document.removeEventListener('pointerdown', off)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, align])

  async function choose(next) {
    if (next === code) { setOpen(false); return }
    setBusy(next)
    // Awaited, so the screen changes in ONE step rather than once in English and once in Spanish.
    await Promise.all([loadLocale(next), loadOverrides(next).catch(() => {})])
    setLocale(next)
    setBusy(null)
    setOpen(false)
    onChosen?.(next)
    if (userId) supabase.from('profiles').update({ locale: next }).eq('id', userId).then(() => {})
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${current.label}. Language`}
        className={cx(
          'inline-flex h-10 items-center gap-2 rounded-full pl-3 pr-2.5 text-sm font-semibold transition-all duration-200 active:scale-[0.97]',
          tone === 'soft'
            ? 'bg-white/80 text-ink shadow-card ring-1 ring-black/5 backdrop-blur hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift'
            : 'text-smoke hoverable:hover:bg-cloud hoverable:hover:text-ink',
          className,
        )}
      >
        <span aria-hidden className="text-[17px] leading-none">{current.flag}</span>
        <span className="hidden sm:inline">{current.native}</span>
        <Icon name="chevronDown" className={cx('h-3.5 w-3.5 text-smoke transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && pos && createPortal(
        <ul
          ref={list}
          role="listbox"
          aria-label="Language"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
          className="z-[70] origin-top overflow-hidden rounded-2xl border border-gray-100 bg-white p-1.5 shadow-lift animate-menu-in"
        >
          {LOCALES.map((l) => {
            const on = l.code === code
            return (
              <li key={l.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => choose(l.code)}
                  className={cx(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150',
                    on ? 'bg-brand text-white' : 'text-ink hoverable:hover:bg-cloud',
                  )}
                >
                  <span aria-hidden className="text-xl leading-none">{l.flag}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-tight">{l.native}</span>
                    {l.label !== l.native && <span className={cx('block text-[11px] leading-tight', on ? 'text-white/80' : 'text-smoke')}>{l.label}</span>}
                  </span>
                  {busy === l.code ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : on && <Icon name="check" className="h-4 w-4 shrink-0" strokeWidth={2.4} />}
                </button>
              </li>
            )
          })}
        </ul>,
        document.body,
      )}
    </>
  )
}
