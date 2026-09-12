// WHAT THE PERSON WAS DOING WHEN IT BROKE.
//
// Ethan, of the error monitoring panel: "I'm not sure what these errors are,
// the information provided doesn't really help me... can you provide more info
// for these and in future so I can really understand exactly what the issue is."
//
// He is right, and the reason a row is unreadable is not that too little is
// stored - it is that what IS stored is the wrong thing. A production stack
// trace reads `Fa@.../ui-BaIenqY-.js:4:29678`, and the React component stack
// reads `Fa / button / div / md / div / Nd`. Both are minified, both name
// nothing, and neither can be de-minified without source maps uploaded to
// Sentry with an auth token this build does not have.
//
// So this stores the thing that does not minify: THE ROUTE THE PERSON WAS ON,
// WHAT THEY PRESSED, AND IN WHAT ORDER. "Opened /onboarding, pressed Continue,
// pressed Add a photo, crashed" is a reproduction. `Fa@ui:4:29678` is not, and
// no amount of it ever becomes one.
//
// WHAT IT MUST NEVER RECORD. Nothing a person typed. The label of a control is
// written by us and is safe; the VALUE of a field is a phone number, a date of
// birth, a bank account or a message to somebody. This reads `aria-label`,
// `data-tour`, `name`, and the element's own short text - never `value`, never
// `textContent` of a form field, and never anything from an `<input>`,
// `<textarea>` or a contenteditable beyond the fact that it was focused. The
// community includes people as young as 16 and this data leaves the device.
//
// It is a ring buffer in memory. It is not persisted, not sent anywhere on its
// own, and exists only to be attached to a crash report that is already being
// sent.

const MAX = 14
const trail = []

// Anything that holds what somebody typed. We record that one was used and
// nothing about what is in it.
const SECRET_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/** Add one step. Kept deliberately dumb: no timers, no async, no allocation. */
export function breadcrumb(kind, label) {
  const text = String(label || '').replace(/\s+/g, ' ').trim().slice(0, 80)
  if (!text) return
  const last = trail[trail.length - 1]
  // A repeated step is a count, not fourteen identical lines. Somebody pressing
  // the same button four times would otherwise flush the whole trail.
  if (last && last.kind === kind && last.label === text) { last.n += 1; return }
  trail.push({ kind, label: text, n: 1, at: Date.now() })
  if (trail.length > MAX) trail.shift()
}

/** The trail, oldest first, as short readable lines. */
export function readTrail() {
  return trail.map((s) => `${s.kind}: ${s.label}${s.n > 1 ? ` (x${s.n})` : ''}`)
}

/** Test seam. */
export function clearTrail() { trail.length = 0 }

/**
 * The best safe name for something that was pressed.
 *
 * In order of how much it tells you: the walkthrough anchor (a name WE chose
 * for that exact control), the accessible label, the button's own text, then
 * the tag. A field contributes its label or its `name` attribute and never its
 * contents.
 */
export function describeTarget(el) {
  if (!el || typeof el.closest !== 'function') return null
  const node = el.closest('button, a, [role="button"], [role="tab"], input, textarea, select, summary') || el
  const tag = node.tagName
  const tour = node.getAttribute?.('data-tour')
  if (tour) return `${tag.toLowerCase()}[${tour}]`
  const aria = node.getAttribute?.('aria-label')
  if (aria) return `${tag.toLowerCase()} "${aria}"`
  if (SECRET_TAGS.has(tag)) {
    // The NAME of the field, never its value. A field called `phone` being
    // focused just before a crash is a useful fact; the phone number is not
    // ours to send anywhere.
    const named = node.getAttribute?.('name') || node.getAttribute?.('type') || 'field'
    return `${tag.toLowerCase()}[${named}]`
  }
  const text = (node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48)
  if (text) return `${tag.toLowerCase()} "${text}"`
  const href = node.getAttribute?.('href')
  if (href) return `${tag.toLowerCase()} → ${String(href).split('?')[0]}`
  return tag.toLowerCase()
}

/**
 * Start listening. One delegated capture-phase listener for the whole app, the
 * same shape `installLinkPrefetch` uses, because a listener per component is a
 * listener per component to leak.
 *
 * CAPTURE PHASE, so a press is recorded even when the handler it is heading for
 * is the thing that throws. A bubble-phase listener runs after the handler and
 * would miss exactly the click that matters.
 */
export function installBreadcrumbs() {
  if (typeof document === 'undefined') return () => {}
  const onPress = (e) => {
    try { breadcrumb('pressed', describeTarget(e.target)) } catch { /* never break a click */ }
  }
  document.addEventListener('pointerdown', onPress, true)
  return () => document.removeEventListener('pointerdown', onPress, true)
}
