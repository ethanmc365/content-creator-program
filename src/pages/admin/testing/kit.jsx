// SHARED PARTS FOR THE TESTING CENTRE.
//
// Every lab is built out of these, so thirteen very different demonstrations
// still read as one place. Nothing in here talks to the network.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../../components/Icon'
import { Badge } from '../../../components/ui'
import { cx } from '../../../lib/utils'

/** A clock captured ONCE, outside render. The lint rules here ban Date.now()
 *  in a render body, and a lab that re-reads the clock every frame would also
 *  make its own timeline jump around while you are reading it. */
export function useNow() {
  const [now] = useState(() => Date.now())
  return now
}

// --------------------------------------------------------------- chrome ----

/** The frame every lab page sits in: back door, title, and the sandbox line
 *  that has to be visible in every screenshot anybody takes of this. */
export function LabPage({ title, subtitle, icon = 'bulb', children, aside, sandbox = true }) {
  return (
    <div className="page mx-auto max-w-6xl px-5 py-8 sm:py-10">
      <Link
        to="/admin/testing"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-smoke transition-colors hover:text-brand"
      >
        <Icon name="chevronLeft" className="h-4 w-4" />
        Testing Centre
      </Link>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-tint text-brand">
            <Icon name={icon} className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            {subtitle && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-smoke">{subtitle}</p>}
          </div>
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
      {sandbox && <SandboxLine />}
      <div className={cx('space-y-8', sandbox && 'mt-8')}>{children}</div>
    </div>
  )
}

/** Said once per page, plainly. The person watching a demo needs to know the
 *  numbers on screen are invented, and the person running it needs to know
 *  nothing they press here can reach a real creator. */
export function SandboxLine({ className = '' }) {
  return (
    <div className={cx('flex items-start gap-3 rounded-card border border-brand/20 bg-brand-tint/30 px-4 py-3', className)}>
      <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
      <p className="text-xs leading-relaxed text-smoke">
        <span className="font-semibold text-ink">Sandbox.</span> Everyone on this page is invented and every
        figure is made up. Nothing here writes to the database, sends an email, or notifies a creator.
      </p>
    </div>
  )
}

/** A titled block. `tone="quiet"` drops the card border for a nested section. */
export function Panel({ title, hint, action, children, className = '', tone = 'card', i = 0 }) {
  return (
    <section
      className={cx('lab-in', tone === 'card' ? 'card !p-6 sm:!p-7' : '', className)}
      style={{ '--lab-i': Math.min(i, 3) }}
    >
      {(title || action) && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
            {hint && <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-smoke">{hint}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/** A short explanation of why something behaves the way it does. Used for the
 *  lines a CEO demo actually turns on: "this is the bit that stops it". */
export function Note({ children, icon = 'bulb', tone = 'plain', className = '' }) {
  const tones = {
    plain: 'border-gray-100 bg-cloud/60 text-smoke',
    warn: 'border-amber-200 bg-amber-50 text-amber-800',
    good: 'border-green-200 bg-green-50 text-green-800',
  }
  return (
    <div className={cx('flex items-start gap-3 rounded-card border px-4 py-3 text-xs leading-relaxed', tones[tone], className)}>
      <Icon name={icon} className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
      <div className="min-w-0 space-y-1.5">{children}</div>
    </div>
  )
}

/** Label / value rows, right aligned values, tabular numbers. */
export function KeyVal({ rows, className = '' }) {
  return (
    <dl className={cx('divide-y divide-gray-100', className)}>
      {rows.filter(Boolean).map(([k, v, hint]) => (
        <div key={k} className="flex items-baseline justify-between gap-6 py-2.5">
          <dt className="text-xs text-smoke">
            {k}
            {hint && <span className="mt-0.5 block text-[11px] opacity-70">{hint}</span>}
          </dt>
          <dd className="shrink-0 text-sm font-semibold tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The app's segmented control, local to the testing centre so a lab can use
 *  it without dragging the network shell's motion library into the bundle. */
export function Choice({ options, value, onChange, size = 'md', className = '' }) {
  return (
    <div className={cx('inline-flex flex-wrap gap-1 rounded-full bg-cloud p-1', className)}>
      {options.map((o) => {
        const v = o.value ?? o
        const label = o.label ?? o
        const on = v === value
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={on}
            className={cx(
              'rounded-full font-medium transition-all duration-200',
              size === 'sm' ? 'px-3 py-1 text-[11px]' : 'px-4 py-1.5 text-xs',
              on ? 'bg-white text-brand shadow-card' : 'text-smoke hover:text-ink',
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

/** A labelled field. Children are the control, so it works for inputs,
 *  selects and anything a lab invents. */
export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={cx('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-smoke">{hint}</span>}
    </label>
  )
}

/** Monospace output. Used for the payloads and SQL a lab is claiming to run,
 *  because "trust me, it writes a row" is not a demonstration. */
export function Code({ children, className = '' }) {
  return (
    <pre className={cx('overflow-x-auto rounded-card bg-ink/[0.03] p-4 text-[11px] leading-relaxed text-smoke ring-1 ring-gray-100', className)}>
      <code>{children}</code>
    </pre>
  )
}

// ---------------------------------------------------------------- stage ----

const DEVICES = [
  { value: 'phone', label: 'Phone', width: 390, height: 844 },
  { value: 'tablet', label: 'Tablet', width: 834, height: 1112 },
  { value: 'desktop', label: 'Desktop', width: 1440, height: 900 },
]

/**
 * A REAL SCREEN AT A REAL WIDTH.
 *
 * This used to render the page INLINE inside the admin page, inside a box of a
 * fixed width. It looked convincing and it was wrong, because a CSS media query
 * reads the BROWSER VIEWPORT and not the width of whatever box its element is
 * sitting in. A 390px "phone" preview on a 1440px screen still had every `sm:`
 * and `lg:` rule applied to it, so what you were shown was the desktop layout
 * squashed into a narrow column - which is precisely what a phone layout is
 * not. The desktop preview had the same problem in reverse and was the one that
 * gave the game away: it did not look like a desktop because it was not one.
 *
 * A same-origin iframe has its own viewport, so at 390px the breakpoints really
 * are the phone's. The page inside is the real route with `?demo=1` on it, and
 * that flag only does anything for an admin. See lib/demoMode.
 *
 * The scaling is still a transform, and a transform does not change layout, so
 * the wrapper is given `height x scale` explicitly or the scroller reserves the
 * frame's full unscaled height and leaves a screen of white underneath.
 */
export function Stage({
  src, device = 'phone', onDevice, zoom = 'fit', onZoom, label, frameRef,
  onLoad, height, toolbar,
}) {
  const [boxEl, setBoxEl] = useState(null)
  const [boxWidth, setBoxWidth] = useState(0)

  useEffect(() => {
    if (!boxEl) return undefined
    const ro = new ResizeObserver(([e]) => setBoxWidth(e.contentRect.width))
    ro.observe(boxEl)
    return () => ro.disconnect()
  }, [boxEl])

  const d = DEVICES.find((x) => x.value === device) ?? DEVICES[0]
  const fit = boxWidth > 0 ? Math.min(1, boxWidth / d.width) : 1
  const scale = zoom === 'fit' ? fit : Number(zoom)
  const frameH = height ?? d.height

  return (
    <div className="overflow-hidden rounded-card border border-gray-100 bg-cloud/60 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-white px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium text-smoke">
          <Icon name="device" className="h-4 w-4 text-brand" />
          {label || 'Live screen'}
          <span className="hidden tabular-nums text-gray-400 sm:inline">{d.width}px</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {toolbar}
          {onDevice && <Choice size="sm" options={DEVICES} value={device} onChange={onDevice} />}
          {onZoom && (
            <Choice
              size="sm" value={zoom} onChange={onZoom}
              options={[
                { value: 'fit', label: 'Fit' },
                { value: '1', label: '100%' },
                { value: '0.75', label: '75%' },
                { value: '0.5', label: '50%' },
              ]}
            />
          )}
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-cloud px-3 py-1 text-[11px] font-medium text-smoke transition-colors hover:text-brand"
          >
            Open in a tab
          </a>
        </div>
      </div>
      <div ref={setBoxEl} className="overflow-x-auto p-4">
        <div className="mx-auto" style={{ width: d.width * scale, height: frameH * scale }}>
          <iframe
            ref={frameRef}
            src={src}
            title={label || 'Preview'}
            onLoad={onLoad}
            className="rounded-card bg-white shadow-lift ring-1 ring-gray-200"
            style={{
              width: d.width,
              height: frameH,
              border: 0,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          />
        </div>
      </div>
    </div>
  )
}

/** Device + zoom state for a Stage, so a lab does not repeat four useStates. */
export function useStage(initial = 'phone') {
  const [device, setDevice] = useState(initial)
  const [zoom, setZoom] = useState('fit')
  return { device, onDevice: setDevice, zoom, onZoom: setZoom }
}

// -------------------------------------------------------------- runner ----

const ACTORS = {
  creator: { label: 'Creator', icon: 'users', tone: 'light' },
  admin: { label: 'Admin', icon: 'shield', tone: 'brand' },
  system: { label: 'Platform', icon: 'sparkles', tone: 'grey' },
  cron: { label: 'Scheduled job', icon: 'clock', tone: 'grey' },
  db: { label: 'Database', icon: 'chartPie', tone: 'grey' },
  email: { label: 'Email', icon: 'envelope', tone: 'grey' },
  push: { label: 'Notification', icon: 'bell', tone: 'grey' },
  guard: { label: 'Guard', icon: 'ban', tone: 'amber' },
}

/**
 * THE AUTOMATION RUNNER.
 *
 * An automation is a sequence of things that happen without anybody watching,
 * which makes it the hardest part of this platform to show off: there is
 * nothing to point at. So each lab describes its automation as a list of steps,
 * and this plays them one at a time - who acted, what the platform did in
 * response, and, where there is one, the artefact that came out (an invoice, a
 * notification row, an email).
 *
 * `steps` is an array of:
 *   { key, actor, title, detail, tech?, output?, blocked? }
 * `blocked` marks a step that is REFUSED - the self-approval rule, an unpaid
 * invoice that cannot be sent. Those are the most interesting steps in a demo
 * to a chief executive, so they are styled to stand out rather than hidden.
 */
export function Runner({ steps, autoMs = 900, onIndexChange }) {
  const [at, setAt] = useState(0) // number of steps completed
  const [playing, setPlaying] = useState(false)
  const timer = useRef(null)

  const stop = useCallback(() => {
    setPlaying(false)
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
  }, [])

  useEffect(() => {
    if (!playing) return undefined
    if (at >= steps.length) { setPlaying(false); return undefined }
    timer.current = setTimeout(() => setAt((n) => n + 1), autoMs)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [playing, at, steps.length, autoMs])

  // Reset if the lab swaps the scenario underneath us.
  const sig = steps.map((s) => s.key).join('|')
  useEffect(() => { setAt(0); setPlaying(false) }, [sig])

  useEffect(() => { onIndexChange?.(at) }, [at, onIndexChange])

  const done = at >= steps.length

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => (playing ? stop() : (done ? (setAt(0), setPlaying(true)) : setPlaying(true)))}
          className="btn-primary text-sm"
        >
          {playing ? 'Pause' : done ? 'Run it again' : at === 0 ? 'Run the automation' : 'Resume'}
        </button>
        <button
          type="button"
          onClick={() => { stop(); setAt((n) => Math.min(steps.length, n + 1)) }}
          disabled={done}
          className="btn-secondary text-sm disabled:opacity-40"
        >
          Step
        </button>
        <button
          type="button"
          onClick={() => { stop(); setAt(0) }}
          disabled={at === 0}
          className="btn-ghost text-sm disabled:opacity-40"
        >
          Reset
        </button>
        <span className="ml-auto text-xs tabular-nums text-smoke">{Math.min(at, steps.length)} of {steps.length}</span>
      </div>

      <ol className="space-y-0">
        {steps.map((s, i) => {
          const state = i < at ? 'done' : i === at && playing ? 'running' : 'idle'
          return <RunnerStep key={s.key} step={s} state={state} last={i === steps.length - 1} n={i + 1} />
        })}
      </ol>
    </div>
  )
}

function RunnerStep({ step, state, last, n }) {
  const actor = ACTORS[step.actor] || ACTORS.system
  const on = state !== 'idle'
  const blocked = step.blocked && state === 'done'
  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {!last && (
        <span
          aria-hidden
          className={cx(
            'absolute left-[15px] top-9 bottom-0 w-px transition-colors duration-500',
            on ? 'bg-brand/30' : 'bg-gray-200',
          )}
        />
      )}
      <span
        className={cx(
          'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-300',
          blocked ? 'bg-amber-100 text-amber-700 ring-4 ring-amber-50'
            : on ? 'bg-brand text-white ring-4 ring-brand-tint'
              : 'bg-white text-gray-300 ring-1 ring-gray-200',
        )}
      >
        {blocked ? <Icon name="ban" className="h-4 w-4" /> : on ? <Icon name="check" className="h-4 w-4" /> : n}
      </span>
      <div className={cx('min-w-0 flex-1 transition-opacity duration-300', on ? 'opacity-100' : 'opacity-45')}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={blocked ? 'amber' : actor.tone}>
            <Icon name={actor.icon} className="h-3 w-3" />
            {actor.label}
          </Badge>
          <p className="text-sm font-semibold">{step.title}</p>
          {state === 'running' && <span className="text-[11px] font-medium text-brand">running</span>}
        </div>
        {step.detail && <p className="mt-1.5 text-xs leading-relaxed text-smoke">{step.detail}</p>}
        {step.tech && on && <Code className="mt-3">{step.tech}</Code>}
        {step.output && on && <div className="mt-3">{step.output}</div>}
      </div>
    </li>
  )
}

// ------------------------------------------------------------ small bits ----

/** A grid of cards that lift on hover. The one layout used by the hub and by
 *  any lab listing several things to choose between. */
export function CardGrid({ children, cols = 3, className = '' }) {
  const map = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }
  return <div className={cx('grid grid-cols-1 gap-4', map[cols], className)}>{children}</div>
}

/** A person, as the app draws one. */
export function PersonRow({ creator, right, sub }) {
  const initials = creator.name.split(' ').map((w) => w[0]).slice(0, 2).join('')
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-tint text-xs font-semibold text-brand">
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{creator.name}</p>
        <p className="truncate text-xs text-smoke">{sub ?? `${creator.city}, ${creator.country}`}</p>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

/** Turn a list into "a, b and c" without an Oxford comma or an em dash. */
export function useJoined(list) {
  return useMemo(() => {
    if (list.length <= 1) return list.join('')
    return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
  }, [list])
}

// ------------------------------------------------------- information ------

/**
 * FACTS, DRAWN SO THEY DO NOT LOOK PRESSABLE.
 *
 * The "what stops this going wrong" block used the same white card with a
 * border and a shadow that every navigable tile on this platform uses, and it
 * read as four buttons that did nothing when you pressed them. A card is a
 * promise of a destination. These are notes, so they get the shape of notes:
 * one flat tinted panel, hairline dividers between the rows, an icon in the
 * margin, no border of their own, no shadow, and nothing that lifts on hover.
 */
export function InfoList({ items, title, hint, columns = 2 }) {
  return (
    <div>
      {(title || hint) && (
        <div className="mb-3">
          {title && <p className="text-xs font-bold uppercase tracking-[0.14em] text-smoke">{title}</p>}
          {hint && <p className="mt-1.5 text-xs leading-relaxed text-smoke">{hint}</p>}
        </div>
      )}
      <div
        className={cx(
          'overflow-hidden rounded-card bg-cloud/60',
          columns === 2 ? 'sm:grid sm:grid-cols-2' : '',
        )}
      >
        {items.map((it, i) => (
          <div
            key={it.t}
            className={cx(
              'flex items-start gap-3 px-4 py-3.5',
              // Hairlines between rows, and between columns on a wide screen.
              i > 0 && 'border-t border-white/70',
              columns === 2 && i === 1 && 'sm:border-t-0',
              columns === 2 && i % 2 === 1 && 'sm:border-l sm:border-white/70',
            )}
          >
            <Icon name={it.icon || 'bulb'} className="mt-0.5 h-4 w-4 shrink-0 text-brand/70" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{it.t}</p>
              <p className="mt-1 text-xs leading-relaxed text-smoke">{it.d}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------- animation ----

/**
 * FLIP: FIRST, LAST, INVERT, PLAY.
 *
 * When the scoring mode changes, the leaderboard reorders - and a list that
 * simply re-renders in a new order shows you the AFTER and never the change.
 * Which row overtook which is the entire point of that panel, and it was the
 * one thing the panel did not show.
 *
 * So: measure where every row is (First), let React put them where they now go
 * (Last), work out the difference and put each row visually back where it was
 * (Invert), then animate the offset away (Play). Because it animates a
 * transform, nothing re-lays out and the whole thing runs on the compositor.
 *
 * `keys` is the order as a string. Rows are found by `data-flip-key`.
 */
export function useFlip(containerRef, keys) {
  const prev = useRef(new Map())

  useLayoutEffect(() => {
    const root = containerRef.current
    if (!root) return
    const nodes = root.querySelectorAll('[data-flip-key]')
    const now = new Map()

    for (const node of nodes) {
      const key = node.getAttribute('data-flip-key')
      const box = node.getBoundingClientRect()
      now.set(key, box.top)
      const before = prev.current.get(key)
      if (before == null || Math.abs(before - box.top) < 1) continue
      node.animate(
        [{ transform: `translateY(${before - box.top}px)` }, { transform: 'translateY(0)' }],
        // Long enough to follow with your eye, short enough that pressing the
        // three modes in a row does not feel like waiting. Standard ease-out:
        // it leaves fast and settles, which is what "moved" looks like.
        { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      )
    }
    prev.current = now
  }, [containerRef, keys])
}

/**
 * A number that counts to its new value instead of jumping.
 *
 * Deliberately LINEAR. The readout is an integer, so what the eye actually sees
 * is frames per whole number, and any curve with zero slope at its ends varies
 * that wildly - which reads as the counter pausing on some numbers and not
 * others. A constant rate gives every integer the same dwell. Same reasoning as
 * CountUp in the main app; this is the small local copy so the Testing Centre
 * does not pull the eagerly-loaded one in.
 */
export function useCountTo(target, ms = 600) {
  const [shown, setShown] = useState(target)
  const from = useRef(target)

  useEffect(() => {
    const start = from.current
    const delta = target - start
    if (delta === 0) return undefined
    let raf = 0
    let t0 = null
    const tick = (t) => {
      if (t0 === null) t0 = t
      const p = Math.min(1, (t - t0) / ms)
      setShown(Math.round(start + delta * p))
      if (p < 1) raf = requestAnimationFrame(tick)
      else from.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])

  return shown
}

