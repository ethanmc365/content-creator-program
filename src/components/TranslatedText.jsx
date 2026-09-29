import { useContentTranslation } from '../lib/contentTranslate'
import { LOCALES, useT } from '../lib/i18n'
import Icon from './Icon'
import { cx } from '../lib/utils'

// A BRIEF, OR ANYTHING A PERSON WROTE, READ IN THE READER'S LANGUAGE.
//
// `children(text)` draws whatever it always drew (CollapsibleRich, a heading, a line);
// this only decides WHICH TEXT it gets and adds the switch between the translation and
// the author's own words. When the text is already in the reader's language, or no
// translation could be had, it draws exactly what it did before and nothing else.
//
// THE SWITCH IS AT THE TOP RIGHT (30 Sep 2026). Ethan: "improve the UI of the button and the
// placement, I would have the button on the top right, rather than the bottom." It was a line of
// small grey type under the text, which for a long brief is a screen away from the words it
// controls. It is now a two-part control - Translated | Original - above the text and to the
// right, so the state you are reading is always the highlighted half.
export function TranslateSwitch({ t, className }) {
  const tr = useT()
  if (!t.translated) return null
  const from = LOCALES.find((l) => l.code === t.srcLang)?.native
  const half = (on) => cx(
    'px-2.5 py-1 transition-colors duration-200',
    on ? 'bg-brand text-white' : 'text-smoke hoverable:hover:text-ink',
  )
  return (
    <div className={cx('flex justify-end', className)}>
      <div
        className="inline-flex items-center overflow-hidden rounded-full border border-brand/20 bg-white text-[11px] font-semibold shadow-sm"
        title={from ? tr('Translated automatically (original in {lang}).', { lang: from }) : tr('Translated automatically.')}
      >
        <span aria-hidden className="pl-2.5 pr-1 text-brand"><Icon name="globe" className="h-3.5 w-3.5" /></span>
        <button type="button" onClick={() => t.showOriginal && t.toggle()} aria-pressed={!t.showOriginal} className={half(!t.showOriginal)}>{tr('Translated')}</button>
        <button type="button" onClick={() => !t.showOriginal && t.toggle()} aria-pressed={t.showOriginal} className={half(t.showOriginal)}>{tr('Original')}</button>
      </div>
    </div>
  )
}

export default function TranslatedText({ text, children, note = true }) {
  const t = useContentTranslation(text)
  return (
    <>
      {note && <TranslateSwitch t={t} className="mb-2" />}
      {children(t.shown)}
    </>
  )
}

/** One short line of admin-written text, in the reader's language, no switch (the tick-box question on a submit form). */
export function TLine({ text }) {
  const t = useContentTranslation(text)
  return <>{t.shown}</>
}
