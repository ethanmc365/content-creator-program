// AN INVOICE IN THE CURRENCY THE CREATOR IS PAID IN, whichever way round it is.
//
// A prize is decided in ONE currency - the challenge's - and paid in whatever
// currency the creator's bank details are in. When those differ the figure has
// to be converted, and the invoice has to say so; when they are the same there
// is nothing to convert and nothing to say.
//
// TWO THINGS WERE WRONG, and they are opposite halves of the same missing idea:
// nothing ever recorded which currency the prize was DECIDED in.
//
//  1. THE NOTE APPEARED WHEN IT SHOULD NOT. Ethan: "when I click on GBP, it
//     shows £20 in the invoice, which is correct, but then it shows 'converted
//     from €23 at today's European Central Bank rate'. That doesn't really make
//     sense. It shouldn't be showing up."
//
//     He is right, and the reason it did is that the composer only knew what the
//     figure was a moment ago, not what it started as. A £20 prize opens as €23
//     (converted - worth saying), and pressing GBP takes it back to £20, which
//     is the prize itself. Nothing has been converted; the round trip has been
//     undone. The note was describing the last button press rather than the
//     document.
//
//  2. IT ONLY EVER CONVERTED ONE WAY. Ethan: "if a creator with euro details
//     wins a UK prize then they receive euro at the conversion rate but we also
//     need to build it the other way - if a creator with UK details wins a euro
//     prize, it should be converted to pounds for them."
//
//     The composer assumed every prize was sterling: it took a reward's amount
//     as pounds and converted to euros or left it alone. A euro prize won by a
//     creator banking in pounds came out as a pound sign in front of a euro
//     figure, which is not a conversion error so much as a wrong invoice.
//
// So a conversion is stated as a SOURCE - what the prize was awarded as - and
// everything else is derived from it. Going back to the source currency
// restores the original figure exactly rather than dividing back through the
// rate, which is what stops £20 -> €23 -> £19.99.
//
// THE RATE IS ALWAYS GBP->EUR, because that is the one the ECB feed is asked
// for; the other direction is its reciprocal. Keeping one number and dividing
// where needed means there is only ever one rate on the document, and it is the
// one that was actually fetched.

/** The symbol an amount is written with. */
export const symbolFor = (currency) => (currency === 'EUR' ? '€' : '£')

/**
 * Convert between the only two currencies this programme settles in.
 *
 * @param {number} amount
 * @param {'GBP'|'EUR'} from
 * @param {'GBP'|'EUR'} to
 * @param {number} gbpToEur today's ECB rate, as £1 = €`gbpToEur`
 * @returns {number|null} null when there is no usable rate, so the caller can
 *          leave the figure alone and say why rather than writing a zero.
 */
export function convertAmount(amount, from, to, gbpToEur) {
  // An EMPTY box is not zero. `Number('')` is 0, so without this an invoice
  // with nothing typed in it converts happily to 0.00 in the other currency
  // and looks like a decision somebody made.
  if (amount === '' || amount == null) return null
  const n = Number(amount)
  if (!isFinite(n)) return null
  if (from === to) return n
  if (!(gbpToEur > 0)) return null
  return to === 'EUR' ? n * gbpToEur : n / gbpToEur
}

/** The same, rounded to the pennies/cents an invoice is actually written in. */
export function convertForInvoice(amount, from, to, gbpToEur) {
  const v = convertAmount(amount, from, to, gbpToEur)
  return v == null ? null : Number(v.toFixed(2))
}

/**
 * The rate as it should be READ on an invoice going out in `currency`.
 *
 * An invoice in euros is explained by "£1 = €1.15"; one in pounds by
 * "€1 = £0.87". Quoting the sterling rate on a euro conversion is technically
 * complete and practically backwards - the reader is checking the number in
 * front of them, not doing the reciprocal in their head.
 */
export function rateLine(from, to, gbpToEur) {
  if (!(gbpToEur > 0) || from === to) return null
  return to === 'EUR'
    ? `£1 = €${round4(gbpToEur)}`
    : `€1 = £${round4(1 / gbpToEur)}`
}

function round4(n) {
  return Number(n.toFixed(4)).toString()
}

/**
 * What the invoice should say under the amount, if anything.
 *
 * `source` is the prize as it was AWARDED - `{ amount, currency }` - and
 * `currency` is what the invoice is being written in. They are the same on
 * most invoices, and then this returns null: there is nothing to explain.
 *
 * @returns {{ text: string } | null}
 */
export function conversionNote(source, currency, gbpToEur) {
  if (!source || !source.currency || source.currency === currency) return null
  const rate = rateLine(source.currency, currency, gbpToEur)
  if (!rate) return null
  const was = `${symbolFor(source.currency)}${Number(source.amount).toFixed(2)}`
  return {
    text: `Converted from ${was}, the prize as awarded, at today’s European Central Bank rate (${rate}). Overtype it if you need a different figure.`,
  }
}
