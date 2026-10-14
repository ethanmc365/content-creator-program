// EVERY NAV LABEL FITS ON ONE LINE IN EVERY LANGUAGE. Romanian's "La nivel mondial" for Worldwide wrapped the whole top
// bar onto two lines (14 Oct). The bars truncate now, but a label this test rejects would still read as "La niv…".
import { describe, expect, it } from 'vitest'
import es from '../../locales/es.js'
import pt from '../../locales/pt.js'
import de from '../../locales/de.js'
import ro from '../../locales/ro.js'

const NAV = ['Worldwide', 'Challenges', 'Rooms', 'DMs', 'Calendar', 'VIP', 'Official', 'Overview', 'Creators']
const MAX = 13 // "Challenge-uri" (Romanian keeps the English word, per its glossary) is the longest and was measured to fit at 375px

describe('nav labels', () => {
  for (const [lang, dict] of Object.entries({ es, pt, de, ro })) {
    it(`${lang}: every tab label is short`, () => {
      for (const k of NAV) {
        const v = dict[k] ?? k
        expect(v.length, `${lang} "${k}" -> "${v}"`).toBeLessThanOrEqual(MAX)
      }
    })
  }
})
