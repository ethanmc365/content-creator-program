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

/** Trim the fixed-width padding IATA uses (spaces) and normalise case. */
const f = (s) => (s || '').trim().toUpperCase()

/**
 * Decode a BCBP string.
 * @returns {null | {from, to, airline, flightNumber, seat, dayOfYear, name, pnr, legs}}
 */
export function parseBoardingPass(raw) {
  if (!raw) return null
  const s = String(raw).replace(/\r?\n/g, '')
  // `M` is a boarding pass, the digit after it is how many legs it holds.
  // Anything else is some other barcode that happened to be in the photo.
  if (!/^M[1-9]/.test(s)) return null
  const legCount = Number(s[1])
  // 60 characters is the mandatory unique+repeated block for one leg; a pass
  // shorter than that is truncated and not worth guessing at.
  if (s.length < 60) return null

  // Name is 20 characters from position 2, "SURNAME/FIRST".
  const name = s.slice(2, 22).trim()
  const rest = s.slice(22)
  // The repeated leg block: E or > then PNR(7) FROM(3) TO(3) CARRIER(3)
  // FLIGHT(5) DAY(3) CABIN(1) SEAT(4) SEQUENCE(5) ...
  const m = rest.match(/^[E>]?([A-Z0-9 ]{7})([A-Z]{3})([A-Z]{3})([A-Z0-9 ]{3})([A-Z0-9 ]{5})(\d{3})([A-Z ])([A-Z0-9 ]{4})/)
  if (!m) return null
  const [, pnr, from, to, carrier, flight, day, cabin, seat] = m

  const dayOfYear = Number(day)
  if (!(dayOfYear >= 1 && dayOfYear <= 366)) return null

  return {
    name,
    pnr: f(pnr),
    from: f(from),
    to: f(to),
    airline: f(carrier),
    // Flight numbers are zero-padded to 5 in the barcode and nobody writes them
    // that way: `00122` is flight 122.
    flightNumber: `${f(carrier)}${f(flight).replace(/^0+/, '')}`.trim(),
    cabin: f(cabin) || null,
    seat: f(seat).replace(/^0+/, '') || null,
    dayOfYear,
    legs: legCount,
  }
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

/** Everything the log form wants, from one barcode. */
export function boardingPassToForm(raw, now) {
  const p = parseBoardingPass(raw)
  if (!p) return null
  return {
    parsed: p,
    form: {
      from_iata: p.from,
      to_iata: p.to,
      flight_number: p.flightNumber,
      seat: p.seat || '',
      flown_on: dateFromDayOfYear(p.dayOfYear, now),
    },
  }
}
