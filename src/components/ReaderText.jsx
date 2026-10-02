import { useContentTranslation } from '../lib/contentTranslate'

// A MARKET'S OWN LINES, IN THE READER'S LANGUAGE (2 Oct 2026).
//
// Ethan: "some text and titles for the communities are showing up in the market languages, but everything should be
// in English unless you chose Romanian or Spanish etc, then it should be translated." A market's tagline and a VIP
// programme's line are typed by whoever runs that market, often in its own language - the Portugal tagline is in
// Portuguese, Spain's was half Spanish. They are labels on the page, not something a person wrote to you, so unlike a
// brief or a chat message (which open in the original, with a switch) these are simply SHOWN in the reader's language:
// English for an English reader, Spanish for a Spanish one. Until the translation arrives, and if it never does, the
// original is shown - a translator that is down can never blank a heading.
export function useReaderText(text) {
  const t = useContentTranslation(text || '', { originalFirst: false })
  return text ? t.shown : text
}

export default function ReaderText({ text }) {
  return useReaderText(text) || null
}
