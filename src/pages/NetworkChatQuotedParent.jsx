import Icon from '../components/Icon'
import { stripMarkup } from '../lib/richText'
import { cx } from '../lib/utils'
import { useT } from '../lib/i18n'

// WHAT A REPLY IS ANSWERING.
//
// One line, in the message it belongs to, and it is a button: pressing it
// scrolls the original into view and flashes it, which is what makes a thread
// walkable backwards rather than just labelled.
//
// A room holds 200 messages, so the parent of an old reply may genuinely not be
// in memory. That says "message no longer here" rather than drawing an empty
// bar, because a blank quote looks like a bug and a missing one is a fact.
// `parent` can be handed in directly (a memoised chat row does, so it is not redrawn whenever any message changes).
export function QuotedParent({ id, lookup, parent: given, onDark = false }) {
  const tr = useT()
  const parent = given !== undefined ? given : lookup?.get(id)

  const jump = () => {
    const el = document.getElementById(`msg-${id}`)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    // A class rather than an inline style, so the flash is one CSS animation
    // that cleans up after itself instead of a timer holding a ref.
    el.classList.remove('msg-flash')
    // Reading offsetWidth forces a reflow, which is what makes removing and
    // re-adding the class restart the animation. Without it, flashing the same
    // message twice in a row does nothing the second time.
    void el.offsetWidth
    el.classList.add('msg-flash')
  }

  if (!parent) {
    return (
      <p className={cx(
        'mb-1.5 flex items-center gap-1.5 rounded-lg border-l-2 px-2.5 py-1 text-[11px] italic',
        onDark ? 'border-white/60 bg-white/15 text-white/75' : 'border-gray-200 bg-black/[0.04] text-gray-400',
      )}>
        <Icon name="reply" className="h-3 w-3 shrink-0" />
        {tr("The message this replies to is no longer here")}
      </p>
    )
  }

  // PLAIN TEXT. The raw body put the markers in the quote - a reply to a
  // heading read "## Content tips" - and `stripMarkup` is the one place that
  // knows how to take them out while leaving @names alone.
  const preview = stripMarkup((parent.body || '')).replace(/\s+/g, ' ').trim()
    || (parent.image_url ? 'Photo' : parent.video_url ? 'Video' : 'Message')

  return (
    <button
      type="button"
      onClick={jump}
      className={cx(
        'mb-1.5 block w-full max-w-full overflow-hidden rounded-lg border-l-2 px-2.5 py-1 text-left transition-colors',
        onDark ? 'border-white/70 bg-white/15 hover:bg-white/25' : 'border-brand/60 bg-black/[0.04] hover:bg-black/[0.07]',
      )}
    >
      <span className={cx('block truncate text-[11px] font-semibold', onDark ? 'text-white' : 'text-brand')}>
        {parent.profiles?.name || 'Someone'}
      </span>
      {/* line-clamp, NOT truncate: nowrap made this preview's min-content width
          the whole quoted line, and a shrink-to-fit bubble grew to match, so
          replying to a long message ran off the screen. */}
      <span className={cx('line-clamp-1 text-[11px] [overflow-wrap:anywhere]', onDark ? 'text-white/80' : 'text-smoke')}>
        {preview}
      </span>
    </button>
  )
}
