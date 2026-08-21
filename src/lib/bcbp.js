// READING A BOARDING PASS.
//
// Every boarding pass issued anywhere in the world carries the same barcode:
// IATA Resolution 792, "Bar Coded Boarding Pass", BCBP. A PDF417 on a printed
// pass, an Aztec on some airlines, and the same payload inside the Apple Wallet
// pass on a phone. It is fixed-width ASCII, not JSON, and it has not changed in
// fifteen years.
//
// So a creator can photograph the pass and the form fills itself in. The owner:
// "the barcode on a boarding pass encodes origin, destination, flight number,
// seat and date. One photo fills the whole form."
//
// WHAT IS ACTUALLY IN IT, and it is exactly the five fields that are tedious to
// type:
//
//   M1SMITH/JOHN          EABC123 DUBCDGEI 0122 195Y012A0034 100
//   ^^                    ^       ^^^ ^^^ ^^  ^^^^ ^^^ ^^^^
//   |                     |       |   |   |   |    |   seat
//   |                     |       |   |   |   |    day of year + cabin
//   |                     |       |   |   |   flight number
//   |                     |       |   |   airline
//   |                     |       |   to
//   |                     |       from
//   |                     PNR
//   format code + legs
//
// THE DATE IS A DAY OF THE YEAR AND NOT A YEAR. This is the one genuinely awkward
// field: `195` is the 195th day, and the pass does not say which year, because a
// boarding pass is not a historical document. So the year is inferred - the most
// recent occurrence of that day that is not more than a few weeks in the future,
// because you scan a pass either just before you fly or just after. That is a
// guess, it is right almost always, and the form shows the resulting date for
// the person to correct. Never silently.
//
// WHAT THIS DOES NOT DO: verify anything. A boarding pass barcode has an
// optional security block and we ignore it. This is a typing shortcut, not a
// proof of travel, and nothing downstream treats a scanned flight differently
// from a typed one.

import { airlineByCode } from './airlines'
import { airport } from './airports'

/** Trim the fixed-width padding IATA uses (spaces) and normalise case. */
const f = (s) => (s || '').trim().toUpperCase()

/**
 * Decode a BCBP string.
 *
 * TWO PASSES, BECAUSE THE FIXED OFFSETS ARE A LIE ON PAPER TICKETS.
 *
 * Resolution 792 says the mandatory block is 60 characters at known offsets,
 * and for an app-issued pass it is. Ethan's Aer Lingus pass out of Oslo is
 * printed with "PAPER TKT" on it, and on a paper ticket the electronic-ticket
 * indicator at offset 22 is a SPACE rather than an `E`. Read at fixed offsets
 * that shifts the entire leg block one character left: the PNR field eats the
 * space plus six characters of the real PNR, the origin lands one short, and
 * `[A-Z]{3}` fails against " OS". The parser returned null and the scanner said
 * "no boarding pass found" about a barcode it had decoded perfectly.
 *
 * Same failure for a leading newline, which some decoders hand back.
 *
 * So: try the canonical layout first, because when it works it is
 * unambiguous. If it does not, SEARCH for the leg block by its own shape. The
 * field WIDTHS are still fixed - that is what makes BCBP readable at all - it
 * is only the offset that floats.
 *
 * THE SEARCH NEEDS A GUARD OR IT WILL FIND NONSENSE. Six letters in a row look
 * like two airport codes, and a passenger called MCCANDLESSGIBBON contains
 * several. So a candidate is only accepted if BOTH codes resolve to real
 * airports in lib/airports and the day of year is in range. That is a much
 * stronger test than any regex, and the table is already loaded.
 *
 * @returns {null | {from, to, airline, flightNumber, seat, dayOfYear, name, pnr, legs}}
 */
export function parseBoardingPass(raw) {
  if (!raw) return null
  const s = String(raw).replace(/\r?\n/g, '').trimStart()
  // `M` is a boarding pass, the digit after it is how many legs it holds.
  // Anything else is some other barcode that happened to be in the photo.
  if (!/^M[1-9]/.test(s)) return null
  const legCount = Number(s[1])
  // 60 characters is the mandatory unique+repeated block for one leg; a pass
  // shorter than that is truncated and not worth guessing at.
  if (s.length < 60) return null

  // FROM(3) TO(3) CARRIER(3) FLIGHT(5) DAY(3) CABIN(1) SEAT(4). Widths fixed,
  // position not.
  const LEG = /^([A-Z]{3})([A-Z]{3})([A-Z0-9 ]{3})([A-Z0-9 ]{5})(\d{3})([A-Z ])([A-Z0-9 ]{4})/

  const build = (m, pnr) => {
    const [, from, to, carrier, flight, day, cabin, seat] = m
    const dayOfYear = Number(day)
    if (!(dayOfYear >= 1 && dayOfYear <= 366)) return null
    return {
      name: s.slice(2, 22).trim(),
      pnr: f(pnr),
      from: f(from),
      to: f(to),
      airline: f(carrier),
      // Flight numbers are zero-padded to 5 in the barcode and nobody writes
      // them that way: `00122` is flight 122.
      flightNumber: `${f(carrier)}${f(flight).replace(/^0+/, '')}`.trim(),
      cabin: f(cabin) || null,
      seat: f(seat).replace(/^0+/, '') || null,
      dayOfYear,
      legs: legCount,
    }
  }

  // ---- Pass one: the layout as specified. -----------------------------------
  const rest = s.slice(22)
  const canonical = rest.match(new RegExp(`^[E>]?([A-Z0-9 ]{7})${LEG.source.slice(1)}`))
  if (canonical) {
    const [, pnr, ...leg] = canonical
    const out = build([null, ...leg], pnr)
    if (out) return out
  }

  // ---- Pass two: find the block. -------------------------------------------
  // Start at 15 rather than 0: the name field is 20 characters and searching
  // inside it is exactly how a passenger's initials get read as an airport.
  for (let i = 15; i < Math.min(s.length - 19, 64); i += 1) {
    const m = s.slice(i).match(LEG)
    if (!m) continue
    const out = build(m, s.slice(Math.max(0, i - 7), i))
    // THE GUARD. Both ends have to be places, or this is a name.
    if (out && airport(out.from) && airport(out.to)) return out
  }
  return null
}

/**
 * Day-of-year to a real date. See the note above: the barcode has no year, so
 * the nearest plausible one is chosen and the caller must show it for
 * confirmation.
 * @param {number} dayOfYear
 * @param {Date} now  passed in - this repo's lint bans a clock call in render
 */
export function dateFromDayOfYear(dayOfYear, now) {
  if (!dayOfYear || !now) return ''
  const year = now.getFullYear()
  const build = (y) => {
    const d = new Date(y, 0, 1)
    d.setDate(dayOfYear)
    return d
  }
  // This year, unless that lands more than five weeks ahead - in which case the
  // pass is from last year and the day has already come round again.
  let d = build(year)
  const FIVE_WEEKS = 35 * 86400000
  if (d.getTime() - now.getTime() > FIVE_WEEKS) d = build(year - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Everything the log form wants, from one barcode.
 *
 * THE AIRLINE WAS BEING READ AND THROWN AWAY.
 *
 * `parseBoardingPass` has pulled the operating carrier out of the flight
 * designator since the day it was written - it has to, because the flight
 * number is the carrier code plus the digits - and this function then built a
 * form without it. So a scan filled in four fields, and the fifth, which is the
 * only REQUIRED one it could have filled, was left for the reader to pick by
 * hand off a list. Ethan, after scanning an Aer Lingus pass: "should I not be
 * able to automatically select the airline? It's not filled in. It literally
 * says Aer Lingus on the top of the screenshot I gave."
 *
 * The barcode says `EI`; the form wants `Aer Lingus`, because that is what the
 * picker's chips are keyed on. `airlineByCode` is the table that already maps
 * one to the other, and an airline that is not in it (a small regional carrier,
 * a charter) simply leaves the field blank rather than writing a two-letter
 * code into a field that displays airline names.
 *
 * THE AIRCRAFT CANNOT BE FILLED IN AND THAT IS NOT AN OVERSIGHT. Ethan asked
 * for it in the same breath. BCBP has no aircraft field - Resolution 792 defines
 * the passenger, the itinerary and the sequence number, and the tail that turns
 * up on the day is not known when the pass is issued. What DOES help is that
 * filling the airline in narrows the aircraft shortlist from "everything with
 * the range" to that airline's own fleet, which is the next best thing and
 * happens automatically.
 */
export function boardingPassToForm(raw, now) {
  const p = parseBoardingPass(raw)
  if (!p) return null
  const carrier = airlineByCode(p.airline)
  return {
    parsed: p,
    form: {
      from_iata: p.from,
      to_iata: p.to,
      airline: carrier?.name || '',
      flight_number: p.flightNumber,
      seat: p.seat || '',
      flown_on: dateFromDayOfYear(p.dayOfYear, now),
    },
  }
}
