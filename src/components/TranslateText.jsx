import { useTranslateOnDemand } from '../lib/quickTranslate'
import { useT } from '../lib/i18n'
import Icon from './Icon'
import { cx } from '../lib/utils'

// SOMEBODY ELSE'S WORDS ON A PROFILE, WITH A TRANSLATE BUTTON (6 Oct 2026).
//
// Ethan: "if a creator wrote their bio in Spanish, to be able to translate it to English, or if they wrote it in English
// and I'm on the Spanish language then translate it to Spanish." What a creator wrote is shown exactly as written; the
// button asks for it in the READER's language (English for an English reader, Spanish for a Spanish one, and so on)
// and `Show original` puts it back. It works both ways because the button is offered whenever the text is not
// already known to be in the reader's language: always for a reader on another language, and for a reader on English
// only when the words do not look English. A text that turns out to be in the reader's language already says so.
export function TranslateButton({ t, className, align = 'start' }) {
  const tr = useT()
  if (!t.available) return null
  if (t.same) return <p className={cx('mt-2 text-[11px] text-smoke', align === 'center' && 'text-center', className)}>{tr('Already in your language')}</p>
  return (
    <div className={cx('mt-2 flex', align === 'center' ? 'justify-center' : 'justify-start', className)}>
      <button
        type="button"
        onClick={t.toggle}
        disabled={t.busy}
        aria-pressed={t.on}
        className="group inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-smoke transition-all duration-200 hoverable:hover:-translate-y-px hoverable:hover:border-brand/40 hoverable:hover:text-brand disabled:opacity-70"
      >
        {t.busy
          ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-hidden />
          : <Icon name="language" className="h-3.5 w-3.5 text-brand" />}
        {t.on ? tr('Show original') : tr('Translate')}
      </button>
      {t.failed && <span className="ml-2 self-center text-[11px] text-smoke">{tr("This can't be translated right now.")}</span>}
    </div>
  )
}

/**
 * Draws `text` (through `render(shown)`, so the caller keeps its own heading, quote marks and classes) with the
 * translate button under it. Nothing extra is drawn when there is nothing to translate.
 */
export default function TranslateText({ text, render, align, className }) {
  const t = useTranslateOnDemand(text || '')
  if (!text || !text.trim()) return null
  return (
    <>
      {render(t.shown)}
      <TranslateButton t={t} align={align} className={className} />
    </>
  )
}
