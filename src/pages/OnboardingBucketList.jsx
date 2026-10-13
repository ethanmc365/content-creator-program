import { isoForCountryName } from '../lib/markets'
import { flagFromIso } from '../lib/flags'
import Icon from '../components/Icon'
import { cx } from '../lib/utils'
import { useT } from '../lib/i18n'

/**
 * THE BUCKET LIST, CALLED THE BUCKET LIST.
 *
 * Ethan: "I don't get the 'where you are headed next' thing below this. Is this
 * for the calendar? I don't think it is. Is this just, like, the bucket list?
 * You need to rename it or make it more clear because I don't even understand
 * what it is."
 *
 * He wrote the brief and he could not tell what the field was for, which is
 * about as clear a verdict as a label can get. "Where you are headed next"
 * describes a TRIP - something with dates, something the calendar and the
 * collab board deal in - and this is neither: it writes `profiles.bucket_list`,
 * it has no dates, and the profile has always drawn it under the heading
 * "Bucket list". Three surfaces, one column, two names.
 *
 * So it is the bucket list here too, and the sentence under it says what
 * happens to the answer AND, just as importantly, what does not: nobody is
 * being asked to commit to a trip.
 *
 * The rows are cards rather than two bare inputs and a cross, and the second
 * field is a CITY, which is what it always wrote - it was labelled "Town
 * (optional)" beside a Country box with no indication the pair made one place.
 */
export function BucketList({ rows = [], onChange }) {
  const tr = useT()
  const list = rows.length ? rows : [{ country: '', city: '' }]
  const set = (i, patch) => onChange(list.map((b, j) => (j === i ? { ...b, ...patch } : b)))
  const lastUsed = list.some((b) => b.country?.trim())

  return (
    <div>
      <p className="label">{tr("Your bucket list")}</p>
      <p className="mb-3 text-xs text-smoke">{tr("Optional.")}</p>
      <div className="space-y-2">
        {list.map((b, i) => (
          <div
            key={i}
            className={cx(
              'field-shell flex items-center gap-2.5 rounded-card border px-3 py-2.5 transition-colors duration-200',
              b.country?.trim() ? 'border-gray-200 bg-white' : 'border-dashed border-gray-200 bg-cloud/30',
            )}
          >
            {/* THE FLAG, ONCE THERE IS A COUNTRY (4 Sep 2026). Ethan: "when
                they type in the country, like on the profile, it should show
                the country flag as the icon rather than the pin."
                The profile already draws bucket-list entries with a flag, so a
                pin here was the same data in two different clothes. It falls
                back to the pin while the box is empty or the name does not
                resolve - a blank square would read as a broken image. */}
            <span className="flex h-9 w-9 shrink-0 items-center justify-center text-xl leading-none text-brand" aria-hidden>
              {flagFromIso(isoForCountryName(b.country)) || <Icon name="pin" className="h-5 w-5" />}
            </span>
            <span className="grid min-w-0 flex-1 gap-1 sm:grid-cols-2 sm:gap-3">
              <input
                className="no-ios-zoom w-full border-0 bg-transparent p-0 text-sm font-medium text-ink outline-none placeholder:text-gray-300"
                placeholder={tr("Country")}
                value={b.country || ''}
                aria-label={`Destination ${i + 1} country`}
                onChange={(e) => set(i, { country: e.target.value })}
              />
              <input
                className="no-ios-zoom w-full border-0 bg-transparent p-0 text-sm text-smoke outline-none placeholder:text-gray-300"
                placeholder={tr("City")}
                value={b.city || ''}
                aria-label={`Destination ${i + 1} city`}
                onChange={(e) => set(i, { city: e.target.value })}
              />
            </span>
            {list.length > 1 && (
              <button
                type="button"
                aria-label={tr("Remove destination")}
                className="shrink-0 rounded-full p-1.5 text-gray-300 transition-colors hover:bg-cloud hover:text-ink"
                onClick={() => onChange(list.filter((_, j) => j !== i))}
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      {lastUsed && list.length < 6 && (
        <button
          type="button"
          className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-brand transition-transform duration-200 hover:translate-x-0.5"
          onClick={() => onChange([...list, { country: '', city: '' }])}
        >
          <Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.4} />
          {tr("Add another place")}
        </button>
      )}
    </div>
  )
}
