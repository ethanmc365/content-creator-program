import Icon from '../components/Icon'
import TrypPlane from '../components/network/TrypPlane'
import { useT } from '../lib/i18n'

export function Welcome({ name, pending, vip }) {
  const tr = useT()
  return (
    <div className="space-y-5 text-center">
      {/* NO ICON, AND NO SECOND SENTENCE (4 Sep 2026).
          Ethan: "at the top there's an icon with a heart and a weird orange
          background - I would remove it, just have it plain with the text."
          And on the line under the heading: remove "You are joining the
          Tryp.com Content Creator Community." A heart in a tinted square is
          decoration on the one screen whose job is to be got through, and the
          sentence was the public page's pitch repeated to somebody who has
          already applied. The three rows below now carry the whole screen:
          what happens, how long, and who reads it.

          "TEAM", NOT "CREW" (3 Sep 2026). Ethan: "I like the welcome to the
          crew - I would say welcome to the team rather than crew." */}
      <h1 className="text-3xl font-bold">
        {vip
          ? (name ? tr('Welcome to the VIP creators, {name}!', { name: name.split(' ')[0] }) : tr('Welcome to the VIP creators!'))
          : (name ? tr('Welcome to the team, {name}!', { name: name.split(' ')[0] }) : tr('Welcome to the team!'))}
      </h1>
      {/* THE PLANE, BETWEEN THE GREETING AND THE THREE ROWS (9 Sep 2026).
          Ethan: "below the title and above those three cards, we can add in the
          Tryp.com animated plane with the little contrails coming out the back
          of it. I think it would add some colour, really improve it, make sure
          it looks good on both desktop and mobile."

          The colour is the whole argument. Everything else on this screen is
          ink and grey on white by design - the icon that used to sit above the
          heading was removed on exactly that ground ("a heart in a tinted
          square is decoration on the one screen whose job is to be got
          through"). What makes this different is that it is not decoration in
          the same place: it is not competing with the heading for the top of
          the screen, it is the one thing between the welcome and the work, and
          the plane is the product's own mark rather than a stock glyph.

          IT IS THE SAME DRAWING AS THE HOME CARD NOW (10 Sep 2026). Ethan:
          "the contrails coming out of it doesn't look good. I want you to
          replicate the contrails that you have on the worldwide page, the
          Tryp.com Content Creator Community card on desktop - you have the
          automated plane with the contrails coming out nicely there. Replicate
          those exact contrails, same styles, same plane-in animation."

          `TrypPlaneBanner` was a second, parallel implementation of one mark:
          a 2px solid bar scaled out of the tailcone on a 2.4s loop, against
          `TrypPlane`'s dashed line under a `userSpaceOnUse` fade with the
          dashes marching away from the tail. Two drawings of the same aircraft
          that do not agree is worse than either of them, and the one the rest
          of the product uses is the one that stays. `variant="inline"` is
          exactly this case - the plane, centred, on nothing - and it carries
          `text-brand`, so the trail is orange here and white on the orange
          card without either being told about the other. The banner file is
          deleted; it had no other caller.

          `animate-fade-up` on the wrapper so the band ARRIVES rather than being
          there, and the aircraft's own cruise then runs inside it: the card
          rises into place and the plane is already flying, which is the same
          layered arrival the landing page hero uses. */}
      <div className="animate-fade-up" style={{ animationDelay: '0.12s' }}>
        <TrypPlane variant="inline" id="onboarding" className="mx-auto" />
      </div>
      {/* TWO ROWS, AND BOTH OF THEM ARE ABOUT THEM.
          There were four. Ethan on the other two: "about three minutes, nine
          short screens, one thing each - don't like that, doesn't really make
          sense. Just say the time is short", and "two screens are optional -
          this doesn't make sense", and "your market is worked out for you -
          again, this doesn't make sense."
          He is right about all three, and they fail the same way: they are
          NOTES ABOUT THE FORM rather than facts about joining. Counting the
          screens invites you to dread them; announcing that two are optional
          before you have seen one is an instruction with no referent; and "your
          market is worked out for you" answers a question nobody has yet
          thought to ask.
          What survives is the length, said plainly, and the one row Ethan
          singled out to keep: "then the team reviews it, a person reads every
          application. This is good, I would keep this in." */}
      {/* NO EXTRA TOP PADDING. `space-y-5` on the column already puts 20px
          between the plane and this list, and the 8px on top of it was the
          other half of the uneven gap Ethan reported - the first half being the
          44% of empty sky that used to be inside the plane's own box (see
          `TIGHT` in TrypPlane). */}
      <div className="mx-auto max-w-sm space-y-2.5 text-left">
        {/* THE TITLES ONLY (4 Sep 2026). Ethan: "remove 'Short screens, and you
            can come back to it' and remove 'A person reads every application'.
            I just want the titles."
            Both sub-lines were reassurance about a form nobody has seen yet,
            and the rows read faster without them - which is the point of a
            screen whose job is to get out of the way. */}
        {/* THREE ROWS, AND THE FIRST ONE SAYS WHAT THIS SCREEN IS FOR (4 Sep
            2026). Ethan: "rather than just say it only takes a few minutes,
            maybe have one above it that says let's complete your profile, and
            then the card next says it only takes a few minutes, and then it
            says then the team reviews it."
            It reads as a sequence now - the task, the cost, the outcome -
            rather than as two facts about a form that has not been named. */}
        {[
          ['pencil', tr("Let's complete your profile")],
          ['clock', tr('It only takes a few minutes')],
          ['shield', pending ? tr('Then the team reviews it') : tr('Then you are in')],
        ].map(([icon, t]) => (
          <div key={t} className="flex items-center gap-3 rounded-xl bg-cloud/70 px-4 py-3">
            <Icon name={icon} className="h-4 w-4 shrink-0 text-brand" />
            <span className="min-w-0 text-sm font-semibold">{t}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
