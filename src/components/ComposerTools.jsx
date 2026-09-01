import Icon from './Icon'
import { cx } from '../lib/utils'
import { useT } from '../lib/i18n'

// The row above every composer, as ONE component.
//
// WHY IT IS SHARED. The legacy chat, the market rooms and the DMs each grew
// their own copy of this row, so the same three formatting buttons existed in
// three slightly different sizes, the DMs had none at all, and the "Create a
// poll" button was a `btn-secondary` sitting beside two bordered pills - taller,
// a different radius, a different weight of text. That is the reported "the
// poll button looks different to the bold and resource buttons". One component
// means one answer, and a fourth surface built next year inherits it.
//
// `onMouseDown={preventDefault}` on every button here is load-bearing: without
// it, pressing a toolbar button blurs the composer, the browser drops the
// selection, and the format lands on nothing.

const stop = (e) => e.preventDefault()

/** One tool in the row: an icon, a label that hides on small screens. */
export function ToolButton({ icon, label, onClick, title, active = false, disabled = false }) {
  return (
    <button
      type="button"
      onMouseDown={stop}
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      aria-label={label}
      className={cx(
        'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
        active
          ? 'border-brand bg-brand-tint text-brand'
          : 'border-gray-200 text-smoke hover:bg-cloud hover:text-ink',
      )}
    >
      <Icon name={icon} className="h-4 w-4 shrink-0" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

/** Heading / bold / italic, grouped in one bordered segment. */
export function FormatButtons({ onFormat }) {
  const tr = useT()
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 p-0.5" role="group" aria-label={tr("Text formatting")}>
      <button type="button" onMouseDown={stop} onClick={() => onFormat('heading')}
        title={tr("Heading")} aria-label={tr("Heading")}
        className="rounded px-2.5 py-1 text-xs font-bold text-smoke transition-colors hover:bg-cloud hover:text-ink">H</button>
      <button type="button" onMouseDown={stop} onClick={() => onFormat('bold')}
        title={tr("Bold")} aria-label={tr("Bold")}
        className="rounded px-2.5 py-1 text-sm font-bold text-smoke transition-colors hover:bg-cloud hover:text-ink">B</button>
      <button type="button" onMouseDown={stop} onClick={() => onFormat('italic')}
        title={tr("Italic")} aria-label={tr("Italic")}
        className="rounded px-2.5 py-1 text-sm italic text-smoke transition-colors hover:bg-cloud hover:text-ink">I</button>
    </div>
  )
}

/**
 * The whole row: formatting for everybody, and the admin tools for admins.
 *
 * ADMIN TOOLS BELONG IN EVERY ROOM. Posting a game, sharing a resource and
 * running a poll were scattered - the poll was locked to #announcements, the
 * other two were legacy-chat only, and the market rooms had none of the three.
 * There is no room where a poll is the wrong idea; if the team can post in a
 * room at all, they can post these in it.
 */
export function ComposerToolbar({
  onFormat,
  isAdmin = false,
  onGame,
  onResource,
  onPoll,
  onSchedule,
  open = true,
  className,
}) {
  const tr = useT()
  return (
    <div className={cx('mb-2 flex-wrap items-center gap-2', open ? 'flex' : 'hidden sm:flex', className)}>
      <FormatButtons onFormat={onFormat} />
      {isAdmin && (
        <>
          {onGame && <ToolButton icon="joystick" label={tr("Game")} title={tr("Post a game challenge")} onClick={onGame} />}
          {onResource && <ToolButton icon="book" label={tr("Resource")} title={tr("Share a resource")} onClick={onResource} />}
          {onPoll && <ToolButton icon="poll" label={tr("Poll")} title={tr("Create a poll")} onClick={onPoll} />}
          {onSchedule && <ToolButton icon="clock" label={tr("Schedule")} title={tr("Write now, post later")} onClick={onSchedule} />}
        </>
      )}
    </div>
  )
}
