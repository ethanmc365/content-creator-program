import { useContentTranslation } from '../lib/contentTranslate'
import { LOCALES, useT } from '../lib/i18n'
import Icon from './Icon'

// A BRIEF, OR ANYTHING A PERSON WROTE, READ IN THE READER'S LANGUAGE.
//
// `children(text)` draws whatever it always drew (CollapsibleRich, a heading, a line);
// this only decides WHICH TEXT it gets and adds one quiet line saying so, with the way
// back to the author's own words. When the text is already in the reader's language, or
// no translation could be had, it draws exactly what it did before and nothing else.
export default function TranslatedText({ text, children, note = true }) {
  const tr = useT()
  const t = useContentTranslation(text)
  const from = LOCALES.find((l) => l.code === t.srcLang)?.native
  return (
    <>
      {children(t.shown)}
      {note && t.translated && (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-smoke">
          <Icon name="globe" className="h-3.5 w-3.5 shrink-0" />
          <span>{from ? tr('Translated automatically (original in {lang}).', { lang: from }) : tr('Translated automatically.')}</span>
          <button type="button" onClick={t.toggle} className="font-semibold text-brand underline-offset-2 hover:underline">
            {t.showOriginal ? tr('Show the translation') : tr('Show the original')}
          </button>
        </p>
      )}
    </>
  )
}
