import { useAuth } from '../context/AuthContext'
import { convert } from './programme'
import { formatMoney } from './utils'

// THE PROGRAMME SETTLES IN EUROS; A UK CREATOR THINKS IN POUNDS (19 Oct 2026).
//
// Ethan asked whether UK creators should convert to their own currency or simply see it. Seeing it, without a switch:
// every euro amount stays the real figure (that is what the voucher or invoice is worth), and beside it a quiet
// "about £19", ROUNDED TO WHOLE POUNDS so nobody reads cents off an exchange rate that moves daily. Only viewers whose
// home country uses a different currency get the line, and only for amounts in another currency.
const CURRENCY_OF = { GB: 'GBP', UK: 'GBP', GG: 'GBP', JE: 'GBP', IM: 'GBP' }

export function localCurrencyOf(profile) {
  const code = String(profile?.country_code || '').toUpperCase()
  if (CURRENCY_OF[code]) return CURRENCY_OF[code]
  return /united kingdom|england|scotland|wales|northern ireland|^uk$/i.test(String(profile?.country || '')) ? 'GBP' : null
}

/** "about £19", or null when there is nothing worth saying. */
export function localHint(amount, currency, local) {
  if (!local || !currency || currency === local || amount == null || !Number(amount)) return null
  const v = convert(Number(amount), currency, local)
  if (v == null || !Number.isFinite(v)) return null
  return `≈ ${formatMoney(Math.max(1, Math.round(v)), local)}`
}

/** The reader's own hint: `const hint = useLocalHint(); hint(22, 'EUR')`. */
export function useLocalHint() {
  const { profile } = useAuth()
  const local = localCurrencyOf(profile)
  return (amount, currency) => localHint(amount, currency, local)
}
