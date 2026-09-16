// ONE WAY TO PUT SOMETHING ON THE CLIPBOARD.
//
// This lived inside `CopyButton` with its fallback, which was fine while a copy
// was always a small button next to one value. It is not any more: the
// applications queue copies a whole column of email addresses from a toolbar,
// and duplicating the fallback there would mean two copies of the one piece of
// this code that only fails on the machines hardest to test on.
//
// THE FALLBACK IS NOT SUPERSTITION. `navigator.clipboard` is undefined outside a
// secure context and throws when the document is not focused, both of which
// happen in a browser tab that has just been returned to. The textarea trick is
// deprecated and still works everywhere.

/** Copy `text`, returning whether it landed. Never throws. */
export async function copyToClipboard(text) {
  const value = String(text ?? '')
  if (!value) return false
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = value
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch {
      return false
    }
  }
}

/**
 * A list of addresses as one pasteable string.
 *
 * COMMA AND SPACE, BECAUSE THE DESTINATION IS A TO: FIELD. Gmail, Outlook and
 * Apple Mail all split a pasted comma-separated list into separate recipient
 * chips; newlines are handled by some of them and pasted as one broken address
 * by others. Blank and duplicate entries are dropped, because a mail client
 * will happily accept "undefined" as a recipient.
 */
export function emailList(addresses) {
  return [...new Set((addresses ?? []).map((e) => String(e ?? '').trim()).filter(Boolean))].join(', ')
}
