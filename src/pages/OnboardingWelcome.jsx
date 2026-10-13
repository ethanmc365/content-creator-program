import Icon from '../components/Icon'
import TrypPlane from '../components/network/TrypPlane'
import { useT } from '../lib/i18n'

export function Welcome({ name, pending, vip }) {
  const tr = useT()
  return (
    <div className="space-y-5 text-center">
      {/* NO ICON, AND NO SECOND SENTENCE. And on the line under the heading: remove "You are joining the Tryp.com
          Content Creator Community." A heart in a tinted square is decoration on the one screen whose job is to be got
          through, and the sentence was the public page's pitch repeated to somebody who has already applied. The three
          rows below now carry the whole screen: what happens, how long, and who reads it.

          "TEAM", NOT "CREW". */}
      <h1 className="text-3xl font-bold">
        {vip
          ? (name ? tr('Welcome to the VIP creators, {name}!', { name: name.split(' ')[0] }) : tr('Welcome to the VIP creators!'))
          : (name ? tr('Welcome to the team, {name}!', { name: name.split(' ')[0] }) : tr('Welcome to the team!'))}
      </h1>
      {/* THE PLANE, BETWEEN THE GREETING AND THE THREE ROWS.

          The colour is the whole argument. Everything else on this screen is
          ink and grey on white by design - the icon that used to sit above the
          heading was removed on exactly that ground ("a heart in a tinted
          square is decoration on the one screen whose job is to be got
          through"). What makes this different is that it is not decoration in
          the same place: it is not competing with the heading for the top of
          the screen, it is the one thing between the welcome and the work, and
          the plane is the product's own mark rather than a stock glyph.

          IT IS THE SAME DRAWING AS THE HOME CARD NOW.

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
      {/* TWO ROWS, AND BOTH OF THEM ARE ABOUT THEM. There were four., and "two screens are optional - this doesn't make
          sense", and "your market is worked out for you - again, this doesn't make sense." they are right about all
          three, and they fail the same way: they are
          NOTES ABOUT THE FORM rather than facts about joining. Counting the screens invites you to dread them;
          announcing that two are optional before you have seen one is an instruction with no referent; and "your market
          is worked out for you" answers a question nobody has yet thought to ask. What survives is the length, said
          plainly, and the one row */}
      {/* NO EXTRA TOP PADDING. `space-y-5` on the column already puts 20px between the plane and this list, and the 8px
          on top of it was the other half of the uneven gap the team reported - the first half being the 44% of empty sky
          that used to be inside the plane's own box (see `TIGHT` in TrypPlane). */}
      <div className="mx-auto max-w-sm space-y-2.5 text-left">
        {/* THE TITLES ONLY. Both sub-lines were reassurance about a form nobody has seen yet, and the rows read faster
            without them - which is the point of a screen whose job is to get out of the way. */}
        {/* THREE ROWS, AND THE FIRST ONE SAYS WHAT THIS SCREEN IS FOR. It reads as a sequence now - the task, the cost,
            the outcome - rather than as two facts about a form that has not been named. */}
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
