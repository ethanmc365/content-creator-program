import Icon from '../components/Icon'
import SocialMark, { brandForUrl, BRAND_COLOR } from '../components/SocialMark'
import { cx } from '../lib/utils'
import { useT } from '../lib/i18n'

/**
 * ANYWHERE ELSE YOUR WORK LIVES.
 *
 * It opened as a heading, a sentence and a button reading "Add a link" - so the
 * screen offered no place to put a link, only a control that would eventually
 * produce one. That is one press of pure ceremony in front of the actual field,
 * and it is why this section read as optional in the sense of "not for you"
 * rather than "you can skip it".
 *
 * There is always ONE EMPTY ROW waiting. Typing in it is the whole interaction;
 * the button below only appears once that row is used, and only to add a
 * SECOND. Nothing is saved from an empty row (finish() filters on `url`), so an
 * untouched section costs nothing.
 *
 * AND THE ROW RECOGNISES WHAT YOU PASTE. `brandForUrl` reads the HOST, so a
 * portfolio comes out as a chain link and a Pinterest page comes out as
 * Pinterest, in its own colour, the moment the address is complete. It is a
 * small thing and it is the difference between a form that is taking your
 * answer and one that is storing it.
 */
export function OtherLinks({ links = [], onChange }) {
  const tr = useT()
  // The blank row lives in the DATA, so typing into it is an ordinary edit
  // rather than a special case, and `finish()` drops it if it stays empty.
  const rows = links.length ? links : [{ label: '', url: '' }]
  const set = (i, patch) => {
    const next = rows.map((l, j) => (j === i ? { ...l, ...patch } : l))
    onChange(next)
  }
  const lastUsed = rows.some((l) => l.url?.trim())

  return (
    <div>
      {/* "Other Links", plainly. A label is a name for a box, not a sentence about it. */}
      <p className="label">{tr("Other links")}</p>
      <p className="mb-3 text-xs text-smoke">
        {tr("Optional. A website, a portfolio, a newsletter, another account.")}
      </p>
      <div className="space-y-2">
        {rows.map((l, i) => {
          const url = l.url?.trim()
          const brand = url ? brandForUrl(url) : 'link'
          const tint = BRAND_COLOR[brand]
          return (
            <div
              key={i}
              className={cx(
                'field-shell flex items-center gap-2.5 rounded-card border px-3 py-2.5 transition-colors duration-200',
                url ? 'border-gray-200 bg-white' : 'border-dashed border-gray-200 bg-cloud/30',
              )}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-smoke"
                style={{ background: url && tint !== 'currentColor' ? `${tint}14` : undefined }}
                aria-hidden
              >
                <SocialMark brand={brand} colored={!!url} className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 space-y-1">
                <input
                  className="no-ios-zoom w-full border-0 bg-transparent p-0 text-sm font-medium text-ink outline-none placeholder:text-gray-300"
                  placeholder={tr("Your website")}
                  value={l.label || ''}
                  aria-label={`Link ${i + 1} label`}
                  onChange={(e) => set(i, { label: e.target.value })}
                />
                <input
                  className="no-ios-zoom w-full border-0 bg-transparent p-0 text-xs text-smoke outline-none placeholder:text-gray-300"
                  placeholder="https://"
                  inputMode="url"
                  value={l.url || ''}
                  aria-label={`Link ${i + 1} address`}
                  onChange={(e) => set(i, { url: e.target.value })}
                />
              </span>
              {rows.length > 1 && (
                <button
                  type="button"
                  aria-label={tr("Remove link")}
                  className="shrink-0 rounded-full p-1.5 text-gray-300 transition-colors hover:bg-cloud hover:text-ink"
                  onClick={() => onChange(rows.filter((_, j) => j !== i))}
                >
                  <Icon name="close" className="h-4 w-4" />
                </button>
              )}
            </div>
          )
        })}
      </div>
      {lastUsed && rows.length < 5 && (
        <button
          type="button"
          className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-brand transition-transform duration-200 hover:translate-x-0.5"
          onClick={() => onChange([...rows, { label: '', url: '' }])}
        >
          <Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.4} />
          {tr("Add another link")}
        </button>
      )}
    </div>
  )
}
