// Small, reusable UI building blocks. Keeping them in one file makes the
// design system easy to scan - every visual primitive lives here.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { cx } from '../../lib/utils'
import { lockScroll } from '../../lib/scrollLock'
import Icon from '../Icon'
import Flame from '../games/Flame'

/** Circular profile photo with an initials fallback. */
export function Avatar({ src, name = '', size = 'md', className = '' }) {
  const sizes = { xs: 'h-7 w-7 text-[10px]', sm: 'h-9 w-9 text-xs', md: 'h-12 w-12 text-sm', lg: 'h-20 w-20 text-xl', xl: 'h-28 w-28 text-3xl' }
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return src ? (
    <img src={src} alt={name} className={cx('shrink-0 rounded-full object-cover ring-2 ring-white', sizes[size], className)} />
  ) : (
    <div
      aria-label={name}
      className={cx('flex shrink-0 items-center justify-center rounded-full bg-brand-tint font-semibold text-brand ring-2 ring-white', sizes[size], className)}
    >
      {initials || '?'}
    </div>
  )
}

/** Pill badge - tone: brand | light | grey | green | amber | red */
export function Badge({ tone = 'grey', children, className = '', ...rest }) {
  const tones = {
    brand: 'bg-brand text-white',
    light: 'bg-brand-tint text-brand',
    grey: 'bg-cloud text-smoke',
    green: 'bg-green-50 text-green-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-600',
  }
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium', tones[tone], className)} {...rest}>
      {children}
    </span>
  )
}

/** Spinner for in-flight actions (buttons etc.). */
export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={cx('animate-spin text-current', className)} viewBox="0 0 24 24" fill="none" aria-label="Loading">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

/** Airplane loader - used for full-page / route loading instead of a plain circle. */
export function PlaneLoader({ label = 'Loading…', className = '' }) {
  return (
    <div className={cx('flex flex-col items-center gap-4', className)}>
      {/* The plane is a flex child so it stays vertically centred; the keyframe
          only moves it across (with a gentle bob) and never fights a static
          translate, which is what made it look off-centre before. */}
      <div className="relative flex h-8 w-28 items-center overflow-hidden">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-2 border-dashed border-brand/25" />
        <svg className="relative h-6 w-6 animate-fly text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
        </svg>
      </div>
      {label && <span className="text-sm font-medium text-smoke">{label}</span>}
    </div>
  )
}

/** Grey shimmer block - compose these into loading skeletons, never blank screens. */
export function Skeleton({ className = '', style }) {
  // `style` is here for the one case a class cannot cover: the community
  // board's placeholders are deliberately DIFFERENT heights, because the notes
  // they stand in for are, and a column of identical grey rectangles promises a
  // grid that is about to arrive and then does not.
  return <div className={cx('skeleton', className)} style={style} />
}

/** A standard card-shaped loading skeleton used by list pages. */
export function SkeletonCards({ count = 3 }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card space-y-4">
          <Skeleton className="h-14 w-14 rounded-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}

/** Friendly branded empty state. Pass `icon` (an <Icon/> element) to use a
 *  custom icon instead of an emoji. */
export function EmptyState({ emoji = '🌍', icon, title, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-gray-200 bg-white px-8 py-16 text-center">
      {icon
        ? <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-tint text-brand" aria-hidden>{icon}</div>
        : <div className="text-4xl" aria-hidden>{emoji}</div>}
      <h3 className="text-lg font-semibold">{title}</h3>
      {hint && <p className="max-w-sm text-sm text-smoke">{hint}</p>}
      {action}
    </div>
  )
}

/** Page heading with consistent generous spacing. */
// `back` puts a way out in the top left of any page that is a step inside
// something else. Every admin page is a step inside the admin panel, and until
// now the only route back was the browser button or the nav - which on a phone,
// where the admin panel is not in the tab bar, meant two taps and a guess.
//
// It sits ABOVE the title rather than beside it, because a back link belongs to
// the page's position in a hierarchy, not to the page's content, and putting it
// on the title row makes the title jump left on pages that have one.
// `inlineAction` KEEPS THE ACTION ON THE TITLE'S ROW AT EVERY WIDTH.
//
// The default stacks it underneath on a phone, which is right for the actions
// most pages pass - "Submit your video", "Ask a question" - full-width primary
// buttons you are meant to reach for. It is wrong for a small secondary control
// like the admin panel's Arrange, which stacked into a wide pill of its own on
// a line of its own, under a 30px heading, for a thing you press once. Ethan:
// "Arrange button smaller, to the right of the heading." So the page says which
// kind of action it is handing over; PageHeader does not guess.
export function PageHeader({ title, subtitle, action, back, inlineAction = false }) {
  const backTo = typeof back === 'string' ? back : back?.to
  const backLabel = (typeof back === 'object' && back?.label) || 'Admin'
  return (
    <div className="mb-8 sm:mb-10">
      {backTo && (
        <Link
          to={backTo}
          className="group -ml-1 mb-3 inline-flex items-center gap-1 rounded-lg px-1 py-0.5 text-sm font-medium text-smoke transition-colors hover:text-brand"
        >
          <Icon name="chevronLeft" className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
          {backLabel}
        </Link>
      )}
      <div className={cx(
        'flex gap-4 sm:flex-row sm:items-end sm:justify-between',
        inlineAction ? 'flex-row items-center justify-between gap-3' : 'flex-col',
      )}>
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
          {subtitle && <p className="mt-2 max-w-xl text-smoke">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  )
}

/** Simple stat tile used on dashboards. Pass `onClick` to make it a button
 *  that lifts on hover (same motion language as the app's buttons). */
export function StatCard({ label, value, hint, accent = false, onClick }) {
  const className = cx(
    'card',
    accent && 'border-brand-tint bg-brand-tint/40',
    onClick && 'w-full cursor-pointer text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.99]',
  )
  const inner = (
    <>
      <p className="text-sm font-medium text-smoke">{label}</p>
      <p className={cx('mt-2 text-3xl font-bold tracking-tight', accent && 'text-brand')}>{value}</p>
      {hint && <p className="mt-1 text-xs text-smoke">{hint}</p>}
    </>
  )
  if (onClick) return <button type="button" onClick={onClick} className={className}>{inner}</button>
  return <div className={className}>{inner}</div>
}

/** Accessible modal dialog. Closes on Escape and backdrop click. */
/**
 * `sheet` (the default) is the bottom-sheet-on-mobile dialog every form here
 * uses. `sheet={false}` is the CARD variant: a floating panel with air round it
 * on a phone as well as on a desktop, for an invitation rather than a task. A
 * bottom sheet running edge to edge and 90vh tall reads as a full screen you
 * have been sent to, which is exactly the complaint about the intro prompt.
 */
export function Modal({ open, onClose, title, children, wide = false, sheet = true }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    // `document.body.style.overflow = 'hidden'` was here, and it does nothing at
    // all to touch scrolling on iOS. See lib/scrollLock for the whole story and
    // for why the release has to restore the scroll position by hand.
    const release = lockScroll()
    return () => {
      document.removeEventListener('keydown', onKey)
      release()
    }
  }, [open, onClose])

  if (!open) return null
  // PORTALLED TO THE BODY, AND IT HAS TO BE.
  //
  // `position: fixed` is measured against the nearest ancestor with a
  // transform, not against the viewport - and the mobile chat, the DM thread
  // and the market rooms are all fixed overlays that carry a `translateY` to
  // track the visual viewport. A modal opened from inside one of them therefore
  // laid itself out inside THAT box: `inset-0` meant the chat area, `max-h-90vh`
  // was taller than the box it was now trapped in, and the dialog's own title
  // was clipped off the top by an ancestor it never knew it had. Anything
  // claiming the whole screen has to be a child of the body to get it.
  return createPortal(
    <div
      className={cx('fixed inset-0 z-50 flex justify-center', sheet ? 'items-end sm:items-center' : 'items-center p-4')}
      role="dialog" aria-modal="true" aria-label={title}
    >
      <button aria-label="Close" className="absolute inset-0 bg-ink/40" onClick={onClose} />
      {/* On mobile the sheet variant runs to the edge of the screen, where the
          tab bar sits over it - so the last control inside gets the tab bar's
          height (plus the home-indicator safe area) as padding, or a tall
          modal's submit button ends up unreachable underneath it. The card
          variant floats clear of both and needs neither. */}
      {/* `overscroll-contain` is the OTHER half of the fix, and it is not the
          same half. Locking the body stops the page moving when the gesture
          starts outside the card; this stops the card handing its own leftover
          scroll to the page once it reaches its end. Both were needed. */}
      <div className={cx(
        'relative overflow-y-auto overscroll-contain bg-white shadow-lift animate-fade-up',
        sheet
          ? 'max-h-[90vh] w-full rounded-t-card p-6 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:rounded-card sm:p-8 sm:pb-8'
          : 'max-h-[min(85vh,44rem)] w-full rounded-card p-5 sm:p-7',
        wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
      )}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-full p-2 text-smoke hover:bg-cloud hover:text-ink" aria-label="Close dialog">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

/** Lightweight confetti celebration (pure CSS, respects reduced motion). */
export function Confetti({ count = 40 }) {
  const colors = ['#d94407', '#f5853f', '#fdf0e7', '#1A1A1A', '#fbbf24']
  // Randomise each piece once (in state) so re-renders don't reshuffle them.
  const [pieces] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      left: `${Math.random() * 100}%`,
      backgroundColor: colors[i % colors.length],
      animationDelay: `${Math.random() * 1.2}s`,
      animationDuration: `${2.2 + Math.random() * 1.5}s`,
    }))
  )
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden>
      {pieces.map((style, i) => (
        <span key={i} className="absolute top-0 block h-2.5 w-2.5 rounded-sm animate-confetti" style={style} />
      ))}
    </div>
  )
}

// A small flame chip showing a daily-game streak ("3 days"). Hidden at 0.
export function StreakChip({ n, title }) {
  if (!n) return null
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-bold leading-none text-brand"
      title={title || `${n}-day streak`}
      aria-label={`${n} day streak`}
    >
      {/* THE SAME FIRE AS EVERY OTHER SURFACE. This was a third inline copy -
          a flat orange path with a yellow blob on it, and STATIC, so the one
          flame a creator sees most often was the only one not alight. See
          components/games/Flame. */}
      <Flame className="h-4 w-4" />
      {n} day{n === 1 ? '' : 's'}
    </span>
  )
}

/** An on/off switch. Controlled: pass `on` and an `onChange(next)` handler. */
export function Toggle({ on, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cx(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50',
        on ? 'bg-brand' : 'bg-gray-300'
      )}
    >
      <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', on ? 'left-[22px]' : 'left-0.5')} />
    </button>
  )
}

/**
 * A compact "copy to clipboard" button. Shows a clipboard icon that swaps to a
 * check for ~1.5s after a successful copy. `value` is what gets copied; `label`
 * is the accessible name (e.g. "Copy email"). Sizing/styling is inherited from
 * the surrounding text via currentColor so it blends into lists and cards.
 */
export function CopyButton({ value, label = 'Copy', className = '' }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  async function copy(e) {
    e.preventDefault()
    e.stopPropagation()
    if (!value) return
    try {
      await navigator.clipboard.writeText(String(value))
    } catch {
      // Fallback for older/insecure contexts where the async clipboard API is
      // unavailable: use a hidden textarea + execCommand.
      try {
        const ta = document.createElement('textarea')
        ta.value = String(value)
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      } catch { return }
    }
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
      className={cx(
        'inline-grid h-7 w-7 shrink-0 place-items-center rounded-lg text-smoke transition hover:-translate-y-px hover:bg-brand-tint hover:text-brand',
        copied && 'text-green-600 hover:text-green-600',
        className
      )}
    >
      <Icon name={copied ? 'check' : 'copy'} className="h-4 w-4" />
    </button>
  )
}


/**
 * A select that is ours.
 *
 * The native `<select>` opens the operating system's own menu, which on a Mac is
 * a grey rounded panel with a blue highlight and a system typeface. Next to a
 * white, spacious, orange-accented page it reads as a piece of a different
 * application, which is exactly what it is. This is a listbox instead: same
 * keyboard behaviour, our type and our colour.
 *
 * The menu is absolutely positioned and opens DOWNWARD unless there is genuinely
 * no room, in which case it opens up. It never measures-and-flips on every open
 * (see the modal-menu note in the design rules) because the list is short and a
 * jumping menu is worse than one that occasionally sits above the control.
 */
// ONE dropdown for the whole platform. A native <select> opens the operating
// system's own menu - grey panel, blue highlight, system font - which Ethan
// flagged as "that weird apple menu" every time one turned up. This is a
// listbox with the same keyboard behaviour and our own type and colour, and it
// is the only dropdown that should ever be used. Do not add a native select.
//
// TWO SHAPES, because a dropdown does two different jobs. `pill` is a filter or
// a sort control that sits beside a search box and is sized to its own label.
// `field` is a form input: full width, square-ish, and matched to `.input` so a
// row of fields lines up. Getting this wrong is what made the currency picker
// on the challenge form look pasted in from another page.
export function Select({
  value, onChange, options, className = '', ariaLabel,
  variant = 'pill', placeholder = 'Choose', disabled = false, id,
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(() => options.findIndex((o) => o.value === value))
  const [up, setUp] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef(null)
  const btnRef = useRef(null)
  const searchRef = useRef(null)

  const selected = options.find((o) => o.value === value)

  // A NATIVE SELECT HAS TYPE-AHEAD AND THIS HAS TO EARN IT BACK.
  //
  // Typing "ire" in an OS menu jumps to Ireland. Replacing that with a plain
  // listbox is an improvement for a four-item sort control and a real loss for
  // the two hundred dialling codes, where it turns a keystroke into a scroll.
  // So anything long enough to scroll gets a search box. Eight is where a menu
  // stops fitting on screen in one look.
  const searchable = options.length > 8
  const q = query.trim().toLowerCase()
  // Matches the label OR the hint, so typing "353" finds Ireland by its dial
  // code and not only by its name.
  const shown = q
    ? options.filter((o) => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(q))
    : options

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function openMenu() {
    const box = btnRef.current?.getBoundingClientRect()
    // 44px a row plus padding, capped the same way the menu itself is.
    const needed = Math.min(options.length * 44 + 12, 280)
    setUp(!!box && box.bottom + needed > window.innerHeight && box.top > needed)
    setQuery('')
    setActive(options.findIndex((o) => o.value === value))
    setOpen(true)
    if (searchable) requestAnimationFrame(() => searchRef.current?.focus())
  }

  // Indexes are into the FILTERED list, because that is the list on screen.
  function choose(i) {
    const opt = shown[i]
    if (!opt) return
    onChange(opt.value)
    setOpen(false)
    setQuery('')
    btnRef.current?.focus()
  }

  function onKeyDown(e) {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); openMenu() }
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btnRef.current?.focus() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, shown.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(shown.length - 1) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(active) }
    // Space types a space when there is a search box to type it into.
    else if (e.key === ' ' && !searchable) { e.preventDefault(); choose(active) }
  }

  return (
    <div ref={wrapRef} className={cx('relative', className)}>
      <button
        ref={btnRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={cx(
          'flex w-full items-center justify-between gap-2 border bg-white transition-all disabled:cursor-not-allowed disabled:opacity-60',
          variant === 'field'
            // Matched to `.input`: same radius, same padding, and 16px on mobile
            // so iOS does not zoom the page when it is focused.
            ? 'rounded-xl px-4 py-3 text-base sm:text-sm'
            : 'rounded-full px-4 py-2 text-sm font-medium',
          open ? 'border-brand text-ink shadow-card' : 'border-gray-200 text-ink hover:border-brand hover:shadow-card',
        )}
      >
        <span className={cx('truncate', !selected && 'text-gray-400')}>{selected?.label ?? placeholder}</span>
        <Icon
          name="chevronRight"
          className={cx('h-4 w-4 shrink-0 text-smoke transition-transform', open ? '-rotate-90' : 'rotate-90')}
        />
      </button>

      {open && (
        // THE SEARCH BOX IS NOT IN THE SCROLLING LIST.
        //
        // It was: a `sticky top-0` <li> inside the scrolling <ul>, pulled up
        // with a negative margin to cover the list's own padding. Sticky offsets
        // resolve against the scrollport, so the 6px of padding above it stayed
        // visible - and options scrolled UP THROUGH that strip, which is Ethan's
        // "I can see part of the name scrolling up just above the search bar".
        //
        // A header that does not scroll should not live inside the thing that
        // scrolls. The menu is a column now: a fixed search row, then the list.
        // It is better ARIA too - a listbox should not contain a textbox.
        <div
          className={cx(
            'absolute z-40 flex w-full min-w-max flex-col overflow-hidden rounded-card border border-gray-100 bg-white shadow-lift',
            up ? 'bottom-full mb-2' : 'top-full mt-2',
          )}
        >
          {/* The search row is the menu's HEADER, so it is flush with the menu's
              own edges rather than a bordered field floating inside a padded
              strip - which read as a second, smaller popup sitting on top of the
              list. The magnifier is what says "type here"; a box around it as
              well is one affordance too many. */}
          {searchable && (
            <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-3.5 py-2.5">
              <Icon name="magnifier" className="h-4 w-4 shrink-0 text-gray-300" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                placeholder="Search"
                aria-label="Search options"
                onChange={(e) => { setQuery(e.target.value); setActive(0) }}
                onKeyDown={onKeyDown}
                className="w-full border-0 bg-transparent p-0 text-sm placeholder:text-gray-400 focus:outline-none"
              />
            </div>
          )}
          <ul
            role="listbox"
            aria-label={ariaLabel}
            className="max-h-[280px] overflow-auto p-1.5"
          >
          {shown.length === 0 && (
            <li className="px-3.5 py-3 text-sm text-smoke">Nothing matches “{query}”.</li>
          )}
          {shown.map((o, i) => {
            const isSelected = o.value === value
            return (
              // KEYED BY POSITION, NOT BY VALUE. Two options may legitimately
              // share a value - "+1" is the United States and Canada - and a
              // duplicate React key makes the list reuse the wrong DOM node, so
              // filtering to "ireland" left "United States" sitting underneath
              // it. The rendered list is rebuilt from scratch every render
              // anyway, so the index is the honest identity here.
              <li key={`${o.value}-${i}`} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onClick={() => choose(i)}
                  onMouseEnter={() => setActive(i)}
                  className={cx(
                    'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                    i === active ? 'bg-brand-tint text-brand' : 'text-ink',
                    isSelected && i !== active && 'text-brand',
                  )}
                >
                  {/* A LEADING GLYPH GETS ITS OWN COLUMN.
                      Concatenating a flag into the label - `${flag} ${name}` -
                      renders as one run of text, and an emoji's own side
                      bearings swallow the space, so it came out as
                      "🇬🇧United Kingdom". A fixed column also means the names
                      line up down the list instead of starting wherever the
                      previous flag happened to end. */}
                  {o.icon && (
                    <span aria-hidden className="w-5 shrink-0 text-center text-base leading-none">{o.icon}</span>
                  )}
                  <span className="min-w-0 flex-1 whitespace-nowrap">{o.label}</span>
                  {/* A secondary value, right-aligned and tabular so a column of
                      dial codes reads as a column. */}
                  {o.hint && (
                    <span className={cx('shrink-0 tabular-nums', i === active || isSelected ? 'text-brand/70' : 'text-smoke')}>
                      {o.hint}
                    </span>
                  )}
                  {isSelected && <Icon name="check" className="h-4 w-4 shrink-0" />}
                </button>
              </li>
            )
          })}
          </ul>
        </div>
      )}
    </div>
  )
}
