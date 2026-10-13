import Icon from './Icon'
import { Spinner } from './ui'
import { useT } from '../lib/i18n'

// THE ONE SCREEN A CREATOR SEES AFTER THEY APPLY.
//
// THERE WERE TWO SCREENS AND THEY WERE BOTH PLANES. Onboarding drew a flying
// plane while the save was in flight; the save landed, the router moved to
// /home, and ProtectedRoute drew its own flying plane with nearly the same
// sentence. Two full-screen animations and a navigation, for one press.
//
// Both render this now, so there is one card. `state` is the only difference
// between "sending" and "sent" - a spinner instead of a tick, and a heading
// that has not happened yet - which means the moment the save lands nothing
// moves on screen except those two things. That is what makes it read as one
// screen finishing rather than two screens taking turns.
//
// NO MARKET ON IT. Their market is a suggestion until a person reads the
// application and can move them (AdminApplications does exactly that), so
// "assigned to UK & Ireland" would be a promise the product has not made.
//
// NO EMAIL PROMISE IT CANNOT KEEP, EITHER. Outbound mail is paused (see
// lib/compose), and welcomes go out by hand from a real mailbox - so this says
// they will hear back, not that a machine will write to them tonight.
export default function SubmittedCard({ pending, state = 'sent', onSignOut, demoNote = false }) {
  const tr = useT()
  const sending = state === 'sending'

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-cloud/50 px-5 py-12">
      {onSignOut && !sending && (
        <button
          onClick={onSignOut}
          className="absolute right-4 top-4 rounded-full px-3 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:text-ink"
        >
          {tr('Log out')}
        </button>
      )}
      <div className="card w-full max-w-md text-center !p-10">
        <span
          className={
            sending
              ? 'mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-brand'
              : 'mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-green-600'
          }
        >
          {sending ? <Spinner className="h-6 w-6" /> : <Icon name="check" className="h-7 w-7" />}
        </span>

        <h1 className="mt-4 text-2xl font-bold">
          {sending
            ? (pending ? tr('Sending your application…') : tr('Setting up your profile…'))
            : (pending ? tr('Application submitted') : tr('Profile complete'))}
        </h1>

        <p className="mt-2 text-sm leading-relaxed text-smoke">
          {demoNote
            ? tr('Nothing was written, because this is the Testing Centre.')
            : sending
              ? tr('One moment.')
              : pending
                ? tr('The Tryp.com team has been notified and will review it. A person reads every application, and we will get back to you by email.')
                : tr('You are all set. Your profile is live.')}
        </p>

        {/* NO LOG OUT ON THIS CARD.

            they are right on both counts. It was the only control on the card, so it read as the thing to do next - and
            the thing to do next is nothing, because a person is reading their application. Somebody who logs out here
            has to find their password again to come back to a screen that says the same sentence.

            It moves to the corner, where a sign-out has always lived, drawn
            quietly. See the `onSignOut` header below. */}
      </div>
    </div>
  )
}
