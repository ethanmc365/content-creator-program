import { cx } from '../lib/utils'
import { useT } from '../lib/i18n'
import LanguagePicker from '../components/LanguagePicker'

// FIRST LOGIN: BUILDING A PROFILE THE TEAM CAN ACTUALLY REVIEW.
//
// WHAT WAS WRONG WITH THE OLD ONE
//
// Eight steps, but the weight was in completely the wrong places. Step two was
// a photo, a date of birth, a town, a country, a one-line bio, a paragraph, a
// quote and a phone number ON ONE SCREEN - nine controls, no grouping, and the
// only feedback was a single orange line at the bottom saying "fill in all
// required boxes", which does not say WHICH. Meanwhile the country was FREE
// TEXT, so somebody typing "England" produced a profile the market system could
// not route at all, and three screens later they were asked to pick a market
// from a list that, for them, was empty.
//
// And that market question was the strangest part of it: every market matches
// on a list of country codes, and those lists do not overlap, so the answer was
// already known the moment they said where they lived. Asking a question that
// has exactly one possible answer is not a choice, it is a form field.
//
// WHAT IT IS NOW
//
//   1  Welcome            nothing to fill in
//   2  Name and photo     who you are
//   3  Where you're based country, town, date of birth, phone
//                         -> THE MARKET IS RESOLVED AND SHOWN, HERE, LIVE
//   4  Where you post     your socials
//   5  Your story         bio, about, quote
//   6  Languages
//   7  Your travel map
//   8  Photos and plans   entirely optional and it says so
//   9  Review             everything, with the market confirmed, then submit
//
// Nine screens rather than eight, and it is considerably shorter to fill in,
// because each one asks for one kind of thing and every screen says whether it
// is required before you start typing rather than after you press Continue.
//
// WHAT IS REQUIRED, AND WHY EACH ONE EARNS IT
//
//   photo       an admin approves a person, and a directory of grey circles
//               is not a community
//   name        it is on everything
//   country     it decides the market; without it a creator lands nowhere
//   town        it is what puts them on the map and gives an honest local clock
//   birthday    age-gates the programme and it is what the birthday cards run on
//   phone       how the team reaches somebody about a payment or a shoot.
//               Private: it goes in creator_private, not in profiles
//   one social  the application is judged on the work
//   bio+about   this is the text an admin actually reads to decide
//   languages   collaboration matching runs on it
//   one country on the map, or the worldwide map has a hole where they are
//
// Everything else - the quote, other links, travel photos, the bucket list - is
// OPTIONAL and is marked optional on the screen it appears on. The rule is:
// required is anything the team needs to make a decision, plus anything a
// community feature would silently break without. Flavour is never required.

const PARTS = ['You', 'Your work', 'Your travel', 'Finish']

export function Progress({ step, total, barPct, current, onLeave, leaving, userId }) {
  const tr = useT()
  return (
    <div className="relative mb-8 flex w-full flex-col items-center gap-5">
      {/* THE LANGUAGE, WITHIN REACH ALL THE WAY THROUGH: somebody who picked it on the front page can change their mind
          on any screen, and the answer is kept on the device and on the profile. */}
      <div className="absolute right-0 top-0 z-10">
        <LanguagePicker userId={userId} />
      </div>
      {/* THE MARK IS THE BUTTON. It was an `img`, sitting decoratively above the bar while a squished copy of itself in
          the corner did the actual navigating. It is a `button` now - a real one, so it is reachable by keyboard and
          reads as a control to a screen reader, which an image never did - and the hover RAISES it, which is the whole
          of the team's "hovering over that button should raise it so it actually shows that it's a clickable button".
          The lift is the same -translate-y-0.5 and shadow-lift step every other pressable card in the product uses, so
          it is this platform's own gesture rather than a new one invented for one screen.

          `hoverable:` gates it on a device that genuinely has a pointer: on a phone a:hover state latches after a tap
          and stays applied, so the logo would sit lifted for the rest of the session.

          The label is on the button rather than the image, because what this
          control DOES is leave - "Tryp.com" as alt text would announce a
          picture on a button whose purpose is not the picture. */}
      <button
        type="button"
        onClick={onLeave}
        disabled={leaving}
        aria-label={tr('Back to Tryp.com')}
        title={tr('Back to Tryp.com')}
        className="rounded-xl shadow-card transition-all duration-200 hoverable:hover:-translate-y-1 hoverable:hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand disabled:opacity-60"
      >
        <img src="/brand/tryp-logo-360.png" alt="" className="h-11 rounded-xl" />
      </button>
      <div className="w-full max-w-md">
        {/* THE FOUR PARTS, SO NINE SCREENS READ AS A SHORT JOURNEY RATHER THAN A
            LONG FORM. A step counter alone answers "how far in am I"; the part
            answers "what am I doing", which is the question people actually ask
            themselves halfway through a sign-up. */}
        <div className="mb-2 flex items-center justify-between gap-2">
          {PARTS.map((p) => {
            const on = p === current.part
            const passed = PARTS.indexOf(p) < PARTS.indexOf(current.part)
            return (
              <span
                key={p}
                className={cx(
                  'text-[11px] font-semibold uppercase tracking-wide transition-colors duration-300',
                  on ? 'text-brand' : passed ? 'text-smoke' : 'text-gray-300',
                )}
              >
                {tr(p)}
              </span>
            )
          })}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white shadow-inner">
          <div
            className="onb-bar h-full rounded-full bg-brand transition-[width] duration-500 ease-out"
            style={{ width: `${barPct}%` }}
          />
        </div>
        <p className="mt-2 text-center text-xs text-smoke">{tr('Step {n} of {total}', { n: step + 1, total })}</p>
      </div>
    </div>
  )
}
