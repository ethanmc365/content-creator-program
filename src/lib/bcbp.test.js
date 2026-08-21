import { describe, it, expect } from 'vitest'
import { parseBoardingPass, dateFromDayOfYear, boardingPassToForm } from './bcbp'

// Real-shaped BCBP strings. The format is fixed-width, so the tests are mostly
// about the places a field is padded, zero-filled or simply absent - which is
// where a hand-rolled parser goes wrong.
const AER_LINGUS = 'M1SMITH/JOHN          EABC123 DUBCDGEI 0122 195Y012A0034 100'

describe('parseBoardingPass', () => {
  it('reads the five fields that are tedious to type', () => {
    const p = parseBoardingPass(AER_LINGUS)
    expect(p.from).toBe('DUB')
    expect(p.to).toBe('CDG')
    expect(p.airline).toBe('EI')
    expect(p.flightNumber).toBe('EI122')      // 0122 is flight 122
    expect(p.seat).toBe('12A')                // 012A is seat 12A
    expect(p.dayOfYear).toBe(195)
    expect(p.name).toBe('SMITH/JOHN')
  })

  it('refuses anything that is not a boarding pass', () => {
    // A QR code that happened to be in the photo, a URL, a loyalty card.
    expect(parseBoardingPass('https://example.com/whatever')).toBeNull()
    expect(parseBoardingPass('')).toBeNull()
    expect(parseBoardingPass(null)).toBeNull()
    // Right prefix, truncated payload: guessing at half a pass is worse than
    // telling somebody the scan failed.
    expect(parseBoardingPass('M1SMITH/JOHN E')).toBeNull()
  })

  it('rejects an impossible day of the year rather than inventing a date', () => {
    expect(parseBoardingPass(AER_LINGUS.replace('195Y', '000Y'))).toBeNull()
  })
})

describe('dateFromDayOfYear', () => {
  it('resolves to this year when the day has been or is close', () => {
    // 195th day of 2026 is 14 July.
    expect(dateFromDayOfYear(195, new Date(2026, 7, 20))).toBe('2026-07-14')
  })

  it('falls back a year when this year would be far in the future', () => {
    // Scanning on 20 January, a day-195 pass is last July, not next.
    expect(dateFromDayOfYear(195, new Date(2026, 0, 20))).toBe('2025-07-14')
  })

  it('keeps a pass for a flight a fortnight away in the current year', () => {
    expect(dateFromDayOfYear(195, new Date(2026, 6, 1))).toBe('2026-07-14')
  })
})

describe('boardingPassToForm', () => {
  it('hands the log form exactly the fields it fills', () => {
    const { form } = boardingPassToForm(AER_LINGUS, new Date(2026, 7, 20))
    expect(form).toEqual({
      from_iata: 'DUB', to_iata: 'CDG', airline: 'Aer Lingus', flight_number: 'EI122',
      seat: '12A', flown_on: '2026-07-14',
    })
  })
  // The airline is the field the scan was silently dropping, and it is the one
  // the log form REQUIRES - so it gets its own assertion rather than riding on
  // the shape test above. It is a NAME, not the barcode's two-letter code,
  // because that is what the picker's chips are keyed on.
  it('turns the carrier code into the name the form expects', () => {
    expect(boardingPassToForm(AER_LINGUS, new Date(2026, 7, 20)).form.airline).toBe('Aer Lingus')
  })
  // An airline outside the table leaves the field EMPTY rather than writing a
  // code into a field that displays names. A chip reading "ZZ" would be worse
  // than a blank the reader fills in.
  it('leaves the airline blank for a carrier it does not know', () => {
    const unknown = AER_LINGUS.replace('EI 0122', 'ZZ 0122').replace('DUBCDGEI', 'DUBCDGZZ')
    const out = boardingPassToForm(unknown, new Date(2026, 7, 20))
    expect(out && out.form.airline).toBe('')
  })
  it('returns null rather than a half-filled form', () => {
    expect(boardingPassToForm('not a pass', new Date())).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// THE TWO PASSES THAT DID NOT WORK, 21 Aug 2026.
//
// Ethan photographed both: an Aer Lingus paper pass OSL->DUB (EI627, 18 Aug,
// seat 10C, seq 0036) and the Apple Wallet pass for the outbound DUB->OSL
// (EI0626, 11 Aug, seat 10C, seq 28). The digital one half worked. The paper
// one produced "no boarding pass found" every time, and the barcode was fine -
// the parser was reading at fixed offsets, and a PAPER ticket carries a SPACE
// where an e-ticket carries `E`, which shifts the whole leg block one left.
//
// Built by FIELD rather than typed as a literal, because hand-counting a
// 60-character fixed-width string is how the first version of this test was
// wrong in a way that hid the bug.
const pad = (v, n) => String(v).padEnd(n, ' ').slice(0, n)
function bcbp({ name, ind = 'E', pnr = 'ABC123', from, to, carrier, flight, day, cabin = 'Y', seat, seq }) {
  return 'M1' + pad(name, 20) + pad(ind, 1) + pad(pnr, 7) + pad(from, 3) + pad(to, 3)
    + pad(carrier, 3) + pad(flight, 5) + pad(day, 3) + pad(cabin, 1) + pad(seat, 4)
    + pad(seq, 5) + '1' + '00'
}
const PAPER = { name: 'MCCANDLESSGIBBON/E', from: 'OSL', to: 'DUB', carrier: 'EI', flight: '0627', day: '230', seat: '010C', seq: '0036' }

describe('the passes that failed in the wild', () => {
  it('reads a PAPER ticket, where the e-ticket indicator is a space', () => {
    const o = parseBoardingPass(bcbp({ ...PAPER, ind: ' ' }))
    expect(o).toMatchObject({ from: 'OSL', to: 'DUB', flightNumber: 'EI627', seat: '10C', dayOfYear: 230 })
  })

  it('still reads the ordinary electronic pass at its canonical offsets', () => {
    const o = parseBoardingPass(bcbp(PAPER))
    expect(o).toMatchObject({ from: 'OSL', to: 'DUB', flightNumber: 'EI627', seat: '10C' })
  })

  it('survives a leading newline from the decoder', () => {
    expect(parseBoardingPass('\n' + bcbp(PAPER))).toMatchObject({ from: 'OSL', to: 'DUB' })
  })

  it('survives an empty PNR and trailing conditional data', () => {
    expect(parseBoardingPass(bcbp({ ...PAPER, pnr: '' }) + '^164ABCDEF')).toMatchObject({ from: 'OSL', to: 'DUB' })
  })

  // THE GUARD ON THE SEARCH PASS. Six letters in a row look like two airport
  // codes, and this passenger's name contains several runs that could pass a
  // regex. Only a pair that resolves to REAL airports is accepted, so a
  // corrupted barcode returns null instead of inventing a route.
  it('refuses to read a passenger name as a route', () => {
    const junk = 'M1MCCANDLESSGIBBON/E ' + 'X'.repeat(48)
    expect(parseBoardingPass(junk)).toBeNull()
  })

  it('refuses a leg block whose airports are not real', () => {
    expect(parseBoardingPass(bcbp({ ...PAPER, ind: ' ', from: 'QQQ', to: 'ZZZ' }))).toBeNull()
  })
})
