import { describe, expect, it } from 'vitest'
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
})
