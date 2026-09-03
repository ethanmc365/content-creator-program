// SENDING EMAIL IS A THING ETHAN DOES, NOT A THING THE PLATFORM DOES.
//
// 3 Sep 2026. Ethan: "for now, all email automations will be paused. Email will
// be done manually, because we're gonna set up the DNS record at a later time.
// Obviously we still want the email admin panel thing so I have the ability to
// copy all emails - but the welcome email etc, that should be abolished.
// Although I'll still have the option to copy all the emails and then send a
// custom welcome email myself."
//
// And for a prize invoice: "the auto 'send to email' isn't gonna be there any
// more. Pretty much just gonna download it and click compose in Gmail. It
// should automatically create the message and download the file for you to then
// send."
//
// So every "send" in the product becomes a HAND-OFF: the app writes the
// message, opens the composer with it already filled in, and the human presses
// send from their own mailbox. Nothing leaves the platform.
//
// WHY THAT IS ALSO THE RIGHT ANSWER TO THE SPAM QUESTION. Ethan asked whether
// mailing a hundred creators this way would get marked as spam. Sent one at a
// time from a real, warmed, human mailbox that people have corresponded with,
// no - that is ordinary mail, and it is the opposite of what got the platform
// blocked before (a run of near-identical messages out of a shared sender with
// no authenticated domain). The two things that would break it are BCCing a
// hundred addresses into one message and sending a hundred byte-identical
// bodies in a burst. `gmailComposeUrl` is deliberately one recipient at a time,
// and the bodies it builds are per-person.
//
// GMAIL, WITH A MAILTO FALLBACK. Ethan works in Gmail, and `?view=cm` opens a
// real compose window with the fields filled - a `mailto:` would hand off to
// whatever the OS thinks the mail client is, which on a Mac is often Mail.app
// and a dead end. `mailto:` stays as the fallback for anybody who is not.

const GMAIL = 'https://mail.google.com/mail/?view=cm&fs=1'

/**
 * A Gmail compose window with everything already in it.
 *
 * @param {object} o
 * @param {string} [o.to]       one address. NOT a list - see the note above.
 * @param {string} [o.subject]
 * @param {string} [o.body]     plain text; newlines survive
 * @param {string} [o.bcc]
 */
export function gmailComposeUrl({ to = '', subject = '', body = '', bcc = '' } = {}) {
  const q = new URLSearchParams()
  if (to) q.set('to', to)
  if (bcc) q.set('bcc', bcc)
  if (subject) q.set('su', subject)
  if (body) q.set('body', body)
  return `${GMAIL}&${q.toString()}`
}

/** The same message as a `mailto:`, for anyone not in Gmail. */
export function mailtoUrl({ to = '', subject = '', body = '', bcc = '' } = {}) {
  const q = new URLSearchParams()
  if (bcc) q.set('bcc', bcc)
  if (subject) q.set('subject', subject)
  if (body) q.set('body', body)
  return `mailto:${encodeURIComponent(to)}?${q.toString()}`
}

/**
 * Open the composer.
 *
 * `noopener` because this is a cross-origin window and there is no reason for
 * it to hold a handle on ours. A blocked popup returns null, which callers
 * surface rather than swallow - a button that silently does nothing is how
 * somebody concludes the invoice was sent.
 *
 * @returns {boolean} whether a window actually opened
 */
export function openCompose(opts) {
  const w = window.open(gmailComposeUrl(opts), '_blank', 'noopener,noreferrer')
  return !!w
}
