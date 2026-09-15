// SURVIVING A BROWSER THAT REWRITES THE PAGE UNDER REACT.
//
// THE BUG. Three creators, three separate people, could not finish signing up
// (`client_errors` fingerprint 1e8c37d2, 11-15 Sep 2026): the onboarding form
// went white part-way through. Safari's own words for it are "The object can
// not be found here.", which is `NotFoundError` from `Node.insertBefore` - the
// reference node it was handed is not a child of the parent it was handed.
// Every frame above it is React reconciling.
//
// WHAT THEY WERE ACTUALLY DOING, because it decides the fix. The breadcrumb
// trail on the row has this in it:
//
//     pressed: font "Busca arriba, o toca el mapa - usa + / - para ac"
//     pressed: p    "Busca arriba, o toca el mapa - usa + / - para ac"
//
// The SAME sentence, once as a `<p>` and once as a `<font>`. Nothing in this
// repository has emitted a `<font>` element since before any of us were
// writing HTML; it is what a page translator leaves behind when it swaps a
// text node for its own translated copy. The trail also has the reader
// pressing "Vamos" and "Continuar", and those two buttons are hard-coded
// English in `Onboarding.jsx` - the platform renders "Let's go" and "Continue"
// there whatever language you pick. So the words on their screen did not come
// from `lib/i18n`. They came from the browser.
//
// So the answer to "did they translate it themselves or did our Spanish do
// this" is: THEY TRANSLATED IT THEMSELVES, and our Spanish is why they had to
// - see the untranslated strings this repo still ships. Both halves are worth
// fixing and they are different jobs. This file is the first half.
//
// WHY IT CRASHES. React keeps direct references to the DOM nodes it created.
// A translator REPLACES text nodes - it wraps them in `<font>`, it merges
// adjacent ones, it reparents them. React's references then point at nodes
// that have a different parent, or no parent at all. The next update calls
// `parent.insertBefore(new, ref)` with a `ref` that is no longer `parent`'s
// child, the DOM throws, the error boundary catches it, and the creator gets a
// white screen in the middle of an application form. This is React issue
// #11538, it has been open since 2017, and the fix below is the one the React
// team themselves recommend in it.
//
// WHY NOT JUST TURN TRANSLATION OFF. `<meta name="google" content="notranslate">`
// would end this in one line and it is the wrong answer here, which is worth
// writing down so nobody "simplifies" it later. This platform has SEVEN
// markets - worldwide, UK & Ireland, Spain, Portugal, Germany, Romania, the
// Nordics - and `lib/i18n` has TWO languages in it. A creator in Porto or
// Bucharest has no Tryp.com Portuguese and no Tryp.com Romanian, and the
// browser's translator is the only thing standing between them and a form they
// cannot read. Blocking it would break the people it is load-bearing for in
// order to protect the people we already serve. So: let it run, and make React
// able to live with it.
//
// WHAT THIS COSTS. Under a translator, a node that would have been inserted at
// a precise position is appended to the end of its parent instead. That can
// reorder siblings in a list the translator has already been rearranging
// anyway. That is a cosmetic wrong on a page somebody is machine-translating,
// against a white screen on a signup form. It is not a close call.
//
// It costs NOTHING when no translator is running, because in that case the
// guard's condition is never true: React only ever passes a reference node
// that really is a child, so every call goes straight through to the original.

let installed = false

/** True once something has rewritten the DOM in a way only a translator does. */
let translated = false

// The two marks a translator leaves that are safe to look for. Neither is
// proof on its own, and together they are only ever used to ANNOTATE a crash
// report - nothing in the app behaves differently because of them, so a false
// positive costs a misleading word in a debug field and nothing else.
//
//  * `<font>` has not been valid markup since HTML 4 and this repo emits none.
//    Google Translate wraps every replaced text node in one.
//  * Google Translate also stamps `translated-ltr` / `translated-rtl` on
//    `<html>`; Safari's own translator sets no class, which is why the `<font>`
//    sniff is the one that actually fires on iOS.
function sniff() {
  try {
    if (document.documentElement.className.includes('translated-')) return true
    return !!document.querySelector('font')
  } catch { return false }
}

/**
 * Has a page translator been seen rewriting this document?
 *
 * Read by `lib/monitoring`'s `errorContext`, so every crash row from here on
 * says whether the DOM was under a translator when it happened. That one field
 * is the difference between this investigation and the next one: the only
 * reason we know what broke these three signups is that the breadcrumb trail
 * happened to catch somebody pressing a `<font>`.
 */
export function translationDetected() {
  return translated || sniff()
}

/**
 * Make `removeChild` and `insertBefore` non-fatal when the node they were given
 * is no longer where React last saw it.
 *
 * Installed from `main.jsx` BEFORE React mounts. It has to be before: a
 * translator can get to the first painted frame, and patching afterwards would
 * leave the boot window unguarded.
 */
export function installTranslationGuard() {
  if (installed) return
  if (typeof Node !== 'function' || !Node.prototype) return
  installed = true

  const nativeRemoveChild = Node.prototype.removeChild
  const nativeInsertBefore = Node.prototype.insertBefore

  Node.prototype.removeChild = function removeChild(child) {
    // The node moved. Honour what the caller MEANT - take it out of the
    // document - rather than what it said, which was "take it out of this
    // parent" and is no longer a thing that can happen.
    if (child && child.parentNode !== this) {
      translated = true
      if (child.parentNode) nativeRemoveChild.call(child.parentNode, child)
      return child
    }
    return nativeRemoveChild.apply(this, arguments)
  }

  Node.prototype.insertBefore = function insertBefore(node, reference) {
    // A null reference already means "append", and is the normal path.
    if (reference && reference.parentNode !== this) {
      translated = true
      return this.appendChild(node)
    }
    return nativeInsertBefore.apply(this, arguments)
  }
}
