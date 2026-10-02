import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { looksNonEnglish } from './quickTranslate'

// The button for an English reader appears on messages that do not look English, whatever the language.
describe('looksNonEnglish', () => {
  it('flags other languages and other scripts', () => {
    expect(looksNonEnglish('Hola, ¿cómo estáis todos?')).toBe(true)
    expect(looksNonEnglish('hola como estas hoy')).toBe(true)
    expect(looksNonEnglish('你好，大家好')).toBe(true)
    expect(looksNonEnglish('Привет всем')).toBe(true)
    expect(looksNonEnglish('Obrigada pela ajuda com o vídeo')).toBe(true)
    expect(looksNonEnglish('Mulțumesc pentru ajutor')).toBe(true)
  })
  it('leaves English alone', () => {
    expect(looksNonEnglish('Thanks for the help with the video')).toBe(false)
    expect(looksNonEnglish('see you tomorrow')).toBe(false)
    expect(looksNonEnglish('ok')).toBe(false)
    expect(looksNonEnglish('Can we post it today? 🎉')).toBe(false)
    expect(looksNonEnglish('')).toBe(false)
  })
  it('leaves the English hook bank alone (it showed Translate on 141 of them)', () => {
    const sql = fs.readFileSync('supabase/seeds/hooks_bank.sql', 'utf8')
    const texts = [...sql.matchAll(/\('((?:[^']|'')*)'/g)].map((x) => x[1].replace(/''/g, "'"))
    const flagged = texts.filter((t) => looksNonEnglish(t))
    expect(texts.length).toBeGreaterThan(1000)
    expect(flagged.length / texts.length).toBeLessThan(0.01)
  })
  it('still catches a Spanish hook with English-looking words in it', () => {
    expect(looksNonEnglish('Viaje barato con vuelo + hotel por 200€')).toBe(true)
    expect(looksNonEnglish('5 días en Marrakech con vuelos y hotel')).toBe(true)
    expect(looksNonEnglish('But Cátia, how are you always traveling? Are you rich? 😭😭')).toBe(false)
  })
})
