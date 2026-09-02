import Icon from '../Icon'
import { cx } from '../../lib/utils'
import { useT } from '../../lib/i18n'

// THE HEADER THE DAILY PUZZLES SHARE (2 Sep 2026).
//
// Ethan: "the Guess the Country timer bar at the top and the back button is
// different from Flight Path, and I really like the one on Flight Path. Build
// those two designs the same, and build it into Guess the Country too, because
// Guess the Country is currently different."
//
// They were two hand-written rows that had drifted the way every duplicated
// piece of chrome in this codebase has drifted: Flight Path had a panel, two
// big readouts and a gradient progress bar across its foot; Guess the Country
// had a bare flex row with 14px numbers, no panel and no bar. Same three facts,
// two products.
//
// This is Flight Path's, extracted, and both puzzles render it. It is a
// separate component from `GameChrome` on purpose - that one belongs to the
// QUIZ modes, which have a question count, a correct count and a Quit that
// abandons a round. A daily puzzle has a progress figure, a clock and a way
// back to the menu, and pretending the two are one component would mean a
// header full of props that are null half the time.
//
// WHAT MAKES IT WORK ON A PHONE: it STACKS at `sm` rather than wrapping. A
// wrapping row breaks in a different place depending on how long the badge's
// text is, so the header came out a different shape on each puzzle at exactly
// the width where there was least room to spare.
//
// @param chips     the badges on the left (title, difficulty, streak)
// @param stats     [{ label, value, mono }] - the two readouts, right-aligned
// @param progress  0..100, drawn as the bar across the foot
// @param onExit    back to the games menu
export default function PuzzleChrome({ chips, stats = [], progress = 0, onExit }) {
  const tr = useT()
  const pct = Math.max(0, Math.min(100, Math.round(progress)))
  return (
    <div className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
      <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-4">
        <span className="flex min-w-0 flex-wrap items-center gap-2">{chips}</span>
        <div className="flex shrink-0 items-center gap-4 sm:gap-5">
          {stats.map((s) => (
            <div key={s.label} className="leading-tight">
              <span className="block text-[10px] font-medium uppercase tracking-widest text-smoke">{s.label}</span>
              <span className={cx(
                'block text-base font-bold tabular-nums text-ink sm:text-lg',
                s.mono && 'font-mono',
              )}>
                {s.value}
              </span>
            </div>
          ))}
          <button
            onClick={onExit}
            className="ml-auto flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-smoke transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:text-brand sm:ml-0"
          >
            <Icon name="chevronLeft" className="h-3.5 w-3.5" />
            {tr("Games")}
          </button>
        </div>
      </div>
      {/* Zero-width fills still paint their padding, so at 0% there is no bar
          at all - just the track. */}
      <div className="h-1.5 w-full bg-cloud">
        {pct > 0 && (
          <div
            className="h-full rounded-r-full bg-gradient-to-r from-brand to-brand-light transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  )
}
