import { COUNTRIES } from './countries'
import { DIAL_CODES } from './dialCodes'

// EVERY COUNTRY A PERSON CAN LIVE IN, FOR THE PICKERS (5 Oct 2026). `COUNTRIES` is the geography GAME's list (83, each with a continent
// and a currency for the quiz modes) and it had no Bulgaria - so a Bulgarian creator could not choose their own country on the sign-up
// screen. Adding game-less countries to the game would need continents, currencies and map names, so the pickers get this union instead:
// the game's list first (it carries aliases like "UK"), then every other country we have a dialling code for.
const known = new Set(COUNTRIES.map((c) => c.iso2))
export const ALL_COUNTRIES = [
  ...COUNTRIES,
  ...DIAL_CODES.filter((d) => !known.has(d.iso2)).map((d) => ({ name: d.name, iso2: d.iso2, extra: true })),
].sort((a, b) => a.name.localeCompare(b.name))
