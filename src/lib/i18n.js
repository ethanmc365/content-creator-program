import { useMemo, useSyncExternalStore } from 'react'

// THE PLATFORM, IN MORE THAN ONE LANGUAGE.
//
// Ethan: "create the full Spanish translation for the entire platform... this
// needs to be toggleable in settings. Maybe just a new languages page would
// work best. Ensure you translate everything correctly, use proper tools, and
// don't do any weird Spanish things that wouldn't make sense to a Spanish
// person."
//
// THE KEY IS THE ENGLISH SENTENCE. There are no `settings.account.title` keys
// anywhere in this codebase and there never will be, because a key like that
// has to be invented, agreed, and then kept in step with the words it stands
// for - and the failure mode when it drifts is a screen showing
// `settings.account.title` to a creator. Keying on the English source means:
//
//   * a string nobody has translated yet renders in ENGLISH, which is a
//     perfectly usable screen, rather than as a missing key or an empty box;
//   * the code still reads as the sentence it prints, so a reviewer can see
//     what a screen says without opening a second file;
//   * adding a language is adding one file, and nothing else changes.
//
// The cost is that changing an English word silently un-translates that string.
// That is the right trade for a product where the English is the source of
// truth and is edited constantly - and `npm run i18n:report` (scripts/) lists
// every string the app asked for and did not find.
//
// WHAT IS NEVER TRANSLATED, and this matters more than it sounds: anything a
// person wrote. Message bodies, captions, creator names, market names,
// challenge briefs, room names, prize descriptions. A dictionary lookup on
// user content would silently rewrite somebody's words, and there is no
// version of that which is acceptable. `t()` is only ever called on literals
// that live in this repository.

export const LOCALES = [
  { code: 'en', label: 'English', native: 'English', flag: '🇬🇧' },
  { code: 'es', label: 'Spanish', native: 'Español', flag: '🇪🇸' },
]

export const DEFAULT_LOCALE = 'en'

// THE DICTIONARY IS FETCHED, NOT BUNDLED.
//
// A static `import es from '../locales/es'` puts 49kB of Spanish into the shell
// that EVERY creator downloads, including the forty-odd who read the app in
// English and always will. It is a dynamic import instead, and `main.jsx`
// awaits it before React mounts - so by the time anything renders, the language
// the reader has chosen is already in memory and `t()` stays synchronous.
// Nothing in the app has to deal with a half-loaded language.
//
// English is not a dictionary at all. It is the source, so `t()` returning its
// argument IS English, and there is nothing to fetch.
const LOADERS = { es: () => import('../locales/es') }
const DICTS = {}
const pending = {}

// THE OVERRIDE LAYER (migration 168).
//
// `public.translations` is the same key space as the bundled dictionaries - the
// English sentence - and it wins over them. It exists so a market manager can
// fix a word in their own language without a developer, a commit and a deploy,
// which for a typo in somebody else's language is three of the wrong things.
//
// IT IS A SEPARATE MAP, MERGED AT LOOKUP, not merged into `DICTS`. Two reasons:
// the bundled file has to stay recoverable (deleting an override falls back to
// it rather than to nothing), and the editor needs to show the manager which of
// the two they are looking at.
const OVERRIDES = {}
let overridesLoaded = false

/**
 * Install the runtime overrides for one language.
 * Called once from main.jsx with whatever the database holds; safe to call
 * again after an edit so the editor can show its own change immediately.
 */
export function setOverrides(code, rows) {
  OVERRIDES[code] = rows || {}
  overridesLoaded = true
  for (const fn of [...subs]) fn()
}

/** What is currently overridden in one language, for the editor. */
export function getOverrides(code) {
  return OVERRIDES[code] || {}
}

/** Has the override layer been fetched yet? Nothing waits on this - it is for
 *  the editor, which must not offer to "reset" a string it has not seen. */
export function overridesReady() {
  return overridesLoaded
}

/** The bundled dictionary for a language, or null if it is not loaded yet.
 *  The editor lists every string the product HAS, which is this file's keys. */
export function bundledDict(code) {
  return DICTS[code] || null
}

/**
 * Make sure a language's dictionary is in memory. Safe to call repeatedly - the
 * promise is cached, so two callers racing (the boot and a profile arriving)
 * share one fetch.
 *
 * A FAILED FETCH IS ENGLISH, NOT A BROKEN APP. A creator on a bad connection
 * gets a screen they can use rather than an error, and the next visit tries
 * again.
 */
export function loadLocale(code) {
  if (code === DEFAULT_LOCALE || DICTS[code]) return Promise.resolve()
  if (!LOADERS[code]) return Promise.resolve()
  if (!pending[code]) {
    pending[code] = LOADERS[code]()
      .then((m) => { DICTS[code] = m.default })
      .catch(() => { /* English is a usable answer */ })
  }
  return pending[code]
}

const KEY = 'tryp-locale'

function isKnown(code) {
  return LOCALES.some((l) => l.code === code)
}

// The browser's own preference is the first guess for somebody who has never
// chosen. `navigator.language` is 'es-ES', 'es-419', 'es' - the region is not
// something this product distinguishes, so only the primary tag is read.
function fromBrowser() {
  try {
    for (const tag of navigator.languages || [navigator.language]) {
      const primary = String(tag || '').split('-')[0].toLowerCase()
      if (isKnown(primary)) return primary
    }
  } catch { /* no navigator, or it threw */ }
  return DEFAULT_LOCALE
}

function read() {
  try {
    const saved = localStorage.getItem(KEY)
    if (isKnown(saved)) return saved
  } catch { /* private browsing can throw on read */ }
  return fromBrowser()
}

let locale = typeof window === 'undefined' ? DEFAULT_LOCALE : read()
const subs = new Set()

if (typeof document !== 'undefined') document.documentElement.lang = locale

export function getLocale() {
  return locale
}

/**
 * Change the language for this browser. The caller is responsible for writing
 * it to the profile as well (see Settings) - this is the local half, and it is
 * deliberately synchronous so the screen changes on the same frame as the tap
 * rather than after a round trip.
 */
export function setLocale(code) {
  const next = isKnown(code) ? code : DEFAULT_LOCALE
  if (next === locale) return next
  // The caller is expected to have awaited `loadLocale` - see Settings. If it
  // has not, this still works: the screen stays English until the dictionary
  // lands, and the load notifies subscribers when it does.
  loadLocale(next).then(() => { for (const fn of [...subs]) fn() })
  locale = next
  try { localStorage.setItem(KEY, next) } catch { /* nothing to do if storage is blocked */ }
  // `lang` is not decoration: it is what tells a screen reader which voice to
  // use, and what makes the browser hyphenate and quote correctly.
  if (typeof document !== 'undefined') document.documentElement.lang = next
  for (const fn of [...subs]) fn()
  return next
}

/**
 * Adopt the language stored on the profile, unless this device has already been
 * told otherwise.
 *
 * WHICH ONE WINS. A device that has an explicit choice in localStorage keeps
 * it: somebody who has just switched to Spanish on a shared laptop should not
 * have it switched back a second later when their profile loads. Everything
 * else follows the account, which is what makes the choice travel between a
 * phone and a laptop at all.
 */
export function adoptProfileLocale(code) {
  if (!isKnown(code)) return
  try {
    if (isKnown(localStorage.getItem(KEY))) return
  } catch { /* storage blocked: the profile is the only answer we have */ }
  loadLocale(code).then(() => setLocale(code))
}

function subscribe(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}

/** Re-renders the component whenever the language changes. */
export function useLocale() {
  return useSyncExternalStore(subscribe, getLocale, () => DEFAULT_LOCALE)
}

// Strings the app asked for and the dictionary did not have. Development only -
// it is what `scripts/i18n-report.mjs` reads to say what is left to translate,
// and it costs nothing in production because the branch is compiled out.
export const missing = new Set()

/**
 * Translate one English string.
 *
 * @param en    the English source, verbatim - this IS the key
 * @param vars  values for `{placeholders}` in the string
 *
 * PLACEHOLDERS RATHER THAN CONCATENATION. "You have " + n + " photos" cannot be
 * translated: Spanish puts the words in a different order and a language with
 * cases would need a different form of the noun. `t('You have {n} photos', {n})`
 * hands the translator the whole sentence and lets them move the number.
 */
export function t(en, vars) {
  const dict = DICTS[locale]
  const over = OVERRIDES[locale]
  // The override wins, then the bundled file, then the English source. A blank
  // override is not an override: an empty string in the table would silently
  // erase a label, and the recovery would be invisible.
  let out = (over && over[en]) || (dict && dict[en]) || en
  if (import.meta.env.DEV && dict && !dict[en]) missing.add(en)
  if (vars) {
    for (const k of Object.keys(vars)) {
      out = out.split(`{${k}}`).join(String(vars[k] ?? ''))
    }
  }
  return out
}

/**
 * ONE OR MANY, WHICH IS TWO SENTENCES AND NOT A SUFFIX.
 *
 * English gets away with `${n} photo${n === 1 ? '' : 's'}`; nothing else does,
 * and even English breaks on "1 entry / 2 entries". Both forms are written out
 * in full so the translator sees two real sentences.
 *
 * Spanish pluralises on the same rule as English (one vs not-one), so this
 * needs no per-language plural function today. A language that does not - Welsh,
 * Polish, Arabic - would need one, and this is the single place it would go.
 */
export function plural(n, one, many, vars) {
  return t(n === 1 ? one : many, { n, ...vars })
}

/**
 * The hook form: a `t` bound to the current language that re-renders its
 * component when the language changes. That subscription is the whole reason to
 * use this rather than importing `t` directly - `t` reads a module variable, so
 * a component that only imported it would keep showing the old language until
 * something else happened to re-render it.
 *
 * NOTHING IS HUNG OFF THE RETURNED FUNCTION. `t.plural = ...` reads nicely and
 * is a mutation of a value React hands back, which the compiler treats as
 * immutable - and it is genuinely wrong as well, because the identity would be
 * stable while the property was rewritten underneath it. `usePlural` is its own
 * hook, subscribed the same way, so a component that only counts things is
 * still re-rendered when the language changes.
 */
export function useT() {
  // `current` is the DEPENDENCY ON PURPOSE even though the closure does not
  // read it: `t` reads a module variable, so the identity of this function has
  // to change when the language does, or a memoised child holding it would go
  // on rendering the old language. The lint cannot see that and is wrong here.
  const current = useLocale()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (en, vars) => t(en, vars), [current])
}

/** `plural`, bound to the current language. See `useT`. */
export function usePlural() {
  const current = useLocale()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (n, one, many, vars) => plural(n, one, many, vars), [current])
}
