import { useContentTranslation } from '../lib/contentTranslate'
import { LOCALES, useT } from '../lib/i18n'
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
// SQUARE, NO GLOBE, ON THE TITLE'S LINE (1 Oct 2026). Ethan: the button "has gone to another line
// rather than just being even with the title, but to the right side ... There's a worldwide icon,
// which isn't necessary ... make it more squared out rather than curved." It is a small squared
// segmented control now, and `TranslatedText` can draw the heading itself so the two share a row.
export function TranslateSwitch({ t, className }) {
  const tr = useT()
  if (!t.translated) return null
  const from = LOCALES.find((l) => l.code === t.srcLang)?.native
  const half = (on) => cx(
    'h-7 rounded-md px-2.5 transition-all duration-200',
    on ? 'bg-brand text-white shadow-card' : 'text-smoke hoverable:hover:text-ink',
  )
  return (
    <div className={cx('flex justify-end', className)}>
      <div
        className="inline-flex items-center gap-0.5 rounded-lg bg-cloud p-0.5 text-[11px] font-semibold"
        title={from ? tr('Translated automatically (original in {lang}).', { lang: from }) : tr('Translated automatically.')}
      >
        <button type="button" onClick={() => !t.showOriginal && t.toggle()} aria-pressed={t.showOriginal} className={half(t.showOriginal)}>{tr('Original')}</button>
        <button type="button" onClick={() => t.showOriginal && t.toggle()} aria-pressed={!t.showOriginal} className={half(!t.showOriginal)}>{tr('Translated')}</button>
      </div>
    </div>
  )
}

export default function TranslatedText({ text, children, note = true, heading = null }) {
  const t = useContentTranslation(text)
  if (heading) {
    return (
      <>
        <div className="mb-4 flex items-center justify-between gap-3">
          {heading}
          {note && <TranslateSwitch t={t} className="shrink-0" />}
        </div>
        {children(t.shown)}
      </>
    )
  }
  return (
    <>
      {note && <TranslateSwitch t={t} className="mb-2" />}
      {children(t.shown)}
    </>
  )
}

/** One short line of admin-written text, in the reader's language, no switch (the tick-box question on a submit form). */
export function TLine({ text }) {
  const t = useContentTranslation(text, { originalFirst: false })
  return <>{t.shown}</>
}

// THE SAME SWITCH, BUT IT STARTS ON THE ORIGINAL AND ONLY TRANSLATES WHEN PRESSED (2 Oct 2026).
// For things that are somebody's own words in the moment - a chat message, a hook - where Ethan
// wants the original first "and just have the ability to translate". `t` is useTranslateOnDemand.
// Drawn only for a reader on a language other than English.
export function OnDemandSwitch({ t, className, compact = false }) {
  const tr = useT()
  if (!t.available) return null
  const half = (active) => cx(
    'inline-flex items-center gap-1 rounded-md transition-all duration-200',
    compact ? 'h-6 px-2' : 'h-7 px-2.5',
    active ? 'bg-brand text-white shadow-card' : 'text-smoke hoverable:hover:text-ink',
  )
  return (
    <div className={cx('inline-flex items-center gap-0.5 rounded-lg bg-cloud p-0.5 font-semibold', compact ? 'text-[10.5px]' : 'text-[11px]', className)}>
      <button type="button" onClick={() => t.on && t.toggle()} aria-pressed={!t.on} className={half(!t.on)}>{tr('Original')}</button>
      <button type="button" onClick={() => !t.on && t.toggle()} aria-pressed={t.on} disabled={t.busy} className={half(t.on)}>
        {t.busy ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : null}
        {tr('Translate')}
      </button>
      {t.failed && <span className="px-1.5 font-medium text-smoke">{tr("This message can't be translated right now.")}</span>}
    </div>
  )
}
