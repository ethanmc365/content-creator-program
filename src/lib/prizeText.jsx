import { DEFAULT_LOCALE, tIn, useLocale } from './i18n'

// PRIZE WORDING IN THE READER'S LANGUAGE (2 Oct 2026).
//
// Ethan: "translate, for example, words like €100 cash, €150 cash, and the Trip.com participation
// voucher. Ensure everything is translated if we can." A prize is a line an admin typed into the
// prize table, so it is not in the dictionary - but it is always built from the same handful of
// words around an amount. Those words are swapped here, instantly and without a network call; the
// amount and any brand name are left exactly as written. A whole line that a lead has translated in
// the Languages editor wins over this.

const TERMS = {
  es: [
    [/\b(?:Tryp|Trip)\.com participation voucher\b/gi, 'Vale de participación de Tryp.com'],
    [/\bparticipation voucher\b/gi, 'vale de participación'],
    [/\b(?:Tryp|Trip)\.com voucher\b/gi, 'vale de Tryp.com'],
    [/\btravel voucher\b/gi, 'vale de viaje'],
    [/\bgift card\b/gi, 'tarjeta regalo'],
    [/\bvouchers\b/gi, 'vales'],
    [/\bvoucher\b/gi, 'vale'],
    [/\bin cash\b/gi, 'en efectivo'],
    [/\bcash prize\b/gi, 'premio en efectivo'],
    [/\bcash\b/gi, 'en efectivo'],
    [/\beach\b/gi, 'cada uno'],
  ],
  pt: [
    [/\b(?:Tryp|Trip)\.com participation voucher\b/gi, 'Vale de participação Tryp.com'],
    [/\bparticipation voucher\b/gi, 'vale de participação'],
    [/\b(?:Tryp|Trip)\.com voucher\b/gi, 'vale Tryp.com'],
    [/\btravel voucher\b/gi, 'vale de viagem'],
    [/\bgift card\b/gi, 'cartão-oferta'],
    [/\bvouchers\b/gi, 'vales'],
    [/\bvoucher\b/gi, 'vale'],
    [/\bin cash\b/gi, 'em dinheiro'],
    [/\bcash prize\b/gi, 'prémio em dinheiro'],
    [/\bcash\b/gi, 'em dinheiro'],
    [/\beach\b/gi, 'cada'],
  ],
  de: [
    [/\b(?:Tryp|Trip)\.com participation voucher\b/gi, 'Tryp.com-Teilnahmegutschein'],
    [/\bparticipation voucher\b/gi, 'Teilnahmegutschein'],
    [/\b(?:Tryp|Trip)\.com voucher\b/gi, 'Tryp.com-Gutschein'],
    [/\btravel voucher\b/gi, 'Reisegutschein'],
    [/\bgift card\b/gi, 'Geschenkkarte'],
    [/\bvouchers\b/gi, 'Gutscheine'],
    [/\bvoucher\b/gi, 'Gutschein'],
    [/\bin cash\b/gi, 'in bar'],
    [/\bcash prize\b/gi, 'Geldpreis'],
    [/\bcash\b/gi, 'in bar'],
    [/\beach\b/gi, 'je'],
  ],
  ro: [
    [/\b(?:Tryp|Trip)\.com participation voucher\b/gi, 'Voucher de participare Tryp.com'],
    [/\bparticipation voucher\b/gi, 'voucher de participare'],
    [/\b(?:Tryp|Trip)\.com voucher\b/gi, 'voucher Tryp.com'],
    [/\btravel voucher\b/gi, 'voucher de călătorie'],
    [/\bgift card\b/gi, 'card cadou'],
    [/\bvouchers\b/gi, 'vouchere'],
    [/\bvoucher\b/gi, 'voucher'],
    [/\bin cash\b/gi, 'în numerar'],
    [/\bcash prize\b/gi, 'premiu în bani'],
    [/\bcash\b/gi, 'în numerar'],
    [/\beach\b/gi, 'fiecare'],
  ],
}

/** A prize line in `code`. Unknown words, amounts and names pass through untouched. */
export function localizePrize(text, code) {
  if (!text || !code || code === DEFAULT_LOCALE) return text
  const whole = tIn(code, text)
  if (whole !== text) return whole
  const rules = TERMS[code]
  if (!rules) return text
  let out = String(text)
  for (const [re, to] of rules) out = out.replace(re, to)
  // A sentence that now starts lower-case ("vale de participación") keeps a capital.
  return out.charAt(0).toUpperCase() + out.slice(1)
}

/** `<PrizeText text="€100 cash" />` - the prize line, in the reader's language. */
export function PrizeText({ text }) {
  const code = useLocale()
  return localizePrize(text, code)
}
