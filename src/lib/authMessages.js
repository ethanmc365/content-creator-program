// Sign-in, sign-up and password-reset messages come from the server (auth-gate and Supabase Auth) in English. They are
// translated here, in the reader's language (audit M12). A message with a number, an address or a domain in it is
// matched by shape so its sentence can be translated; anything else goes through tr() as it is, which returns the
// English unchanged when there is no translation yet.
import { t as tr } from './i18n'

const SHAPES = [
  [/^Too many attempts\. Please wait (\d+) minutes and try again\.$/, (m) => tr('Too many attempts. Please wait {n} minutes and try again.', { n: m[1] })],
  [/^Did you mean (\S+@\S+)\? Check the address and try again\.$/, (m) => tr('Did you mean {email}? Check the address and try again.', { email: m[1] })],
  [/^We cannot find a mail server for "([^"]+)"\. Check the spelling and try again\.$/, (m) => tr('We cannot find a mail server for "{domain}". Check the spelling and try again.', { domain: m[1] })],
]

// The fixed sentences, listed so the translation tools can find them.
const KNOWN = {
  'That does not look like an email address.': () => tr('That does not look like an email address.'),
  'Please use a permanent email address. Prizes, invoices and password resets all go to it.': () => tr('Please use a permanent email address. Prizes, invoices and password resets all go to it.'),
  'Something went wrong on our side. Please try again.': () => tr('Something went wrong on our side. Please try again.'),
  'Something went wrong. Please try again.': () => tr('Something went wrong. Please try again.'),
  'Email and password are required.': () => tr('Email and password are required.'),
  'Email is required.': () => tr('Email is required.'),
  'Could not sign up': () => tr('Could not sign up'),
  'Network error. Please check your connection and try again.': () => tr('Network error. Please check your connection and try again.'),
  'Email not confirmed': () => tr('Email not confirmed'),
}

export function authMessage(message) {
  const msg = String(message ?? '').trim()
  if (!msg) return msg
  for (const [re, fn] of SHAPES) { const m = msg.match(re); if (m) return fn(m) }
  return KNOWN[msg] ? KNOWN[msg]() : tr(msg)
}
