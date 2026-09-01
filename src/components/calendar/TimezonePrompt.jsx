import { Modal } from '../ui'
import Icon from '../Icon'
import { zoneCity, zoneOffsetLabel, hoursBetween } from '../../lib/timezone'
import { useT } from '../../lib/i18n'

// "YOU ARE SOMEWHERE ELSE NOW."
//
// Shown once, on the calendar, the first time the device reports a zone the
// creator has not acknowledged. See lib/timezone for why this exists at all and
// why it is a prompt rather than a permanent second clock on every card.
//
// WHY THE CHANGE BUTTON IS THE LOUD ONE. The owner: "the highlighted button
// should be change obviously, but they can choose to keep." He is right, and
// the reason is that the app already knows the answer: the device moved because
// the person moved, and 99 times in 100 they want the times on the clock they
// are actually reading. Keeping the old zone is the deliberate minority case -
// somebody on a short trip who is still planning against home - so it is
// offered, plainly, and it is not the default.
//
// IT NAMES BOTH PLACES AND THE DIFFERENCE. "Change timezone?" with two buttons
// is a question nobody can answer without doing arithmetic. "Oslo is 1 hour
// ahead of Dublin" is the whole decision.
export default function TimezonePrompt({ open, device, previous, onChange, onKeep }) {
  const tr = useT()
  const shift = hoursBetween(device, previous)
  const there = zoneCity(device)
  const home = zoneCity(previous)

  return (
    <Modal open={open} onClose={onKeep} title={tr("Looks like you have moved")}>
      <div className="space-y-5">
        <div className="flex items-center gap-4 rounded-card border border-brand/25 bg-brand-tint/40 p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand text-white">
            <Icon name="globe" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">
              Your device says you are in {there}
            </p>
            <p className="text-xs text-smoke">
              {shift == null || !home
                ? `Times are currently shown in ${home || 'your old timezone'}.`
                : shift === 0
                  ? `Same clock as ${home}, so nothing would move.`
                  : `${there} is ${Math.abs(shift)} hour${Math.abs(shift) === 1 ? '' : 's'} ${shift > 0 ? 'ahead of' : 'behind'} ${home}.`}
            </p>
          </div>
        </div>

        {/* The two readings, side by side, because the whole question is which
            of these two numbers you want on your cards. */}
        <div className="grid grid-cols-2 gap-3">
          <ZoneTile label={there} zone={device} highlight />
          <ZoneTile label={home || 'Before'} zone={previous} />
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button onClick={onKeep} className="btn-ghost w-full justify-center sm:w-auto">
            Keep {home || 'the old one'}
          </button>
          <button onClick={onChange} className="btn-primary w-full justify-center sm:w-auto">
            Show {there} time
          </button>
        </div>

        <p className="text-center text-[11px] text-smoke">
          {tr("You can set this permanently in Settings.")}
        </p>
      </div>
    </Modal>
  )
}

function ZoneTile({ label, zone, highlight = false }) {
  let now
  try {
    now = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date())
  } catch { now = '' }
  return (
    <div className={highlight
      ? 'rounded-card border border-brand bg-white p-3 text-center shadow-card'
      : 'rounded-card border border-gray-100 bg-white p-3 text-center'}>
      <p className="truncate text-[10px] font-bold uppercase tracking-widest text-smoke">{label}</p>
      <p className={highlight ? 'text-xl font-bold tabular-nums text-brand' : 'text-xl font-bold tabular-nums text-ink'}>
        {now || '—'}
      </p>
      <p className="text-[10px] text-smoke">{zoneOffsetLabel(zone)}</p>
    </div>
  )
}
