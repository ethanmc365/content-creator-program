import { Component, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import TrypPlaneScene from './TrypPlaneScene'
import Icon from './Icon'
import { Avatar, Modal, CopyButton } from './ui'
import { captureError } from '../lib/monitoring'

// WHO TO ASK. One person, by name, with an address you can copy.
//
// THE BUG THIS FIXES. "Radio us in" was a `mailto:` link, and a mailto link is
// a coin toss: on a desktop with no mail client configured it opens nothing at
// all, and on one with a client that is never used it launches an app the
// reader has no intention of sending from and then does, as Ethan put it,
// "nothing". Either way the person who hit an error is now looking at a second
// broken thing. A card they can read and copy from cannot fail in any of those
// ways, and it also answers the question a support address does not: who is
// this, and are they actually going to read it.
const HELP = {
  name: 'Ethan',
  role: 'Content Creator Community Lead',
  email: 'ethantryp.com@gmail.com',
  // A REAL FACE, AND A STATIC ONE.
  //
  // This was `<Avatar name>` with no src, so the card offered help from a grey
  // circle with an "E" in it. Ethan: "it should show my profile picture from
  // the platform, not just E."
  //
  // It is a FILE in public/ rather than the live `profiles.photo_url` on
  // purpose: this screen is what renders when the app has already failed, and
  // half the time it renders there is no session to query with. An error screen
  // that needs the thing that just broke is not an error screen. Copied from
  // his own avatar; re-run the copy if he changes it.
  photo: '/team/ethan.jpg',
}

function ContactCard({ open, onClose }) {
  return (
    // `sheet={false}` - this is an invitation, not a form. A full-height bottom
    // sheet for four lines of contact details reads as another page you have
    // been sent to, which is the last thing to do to somebody already stuck.
    <Modal open={open} onClose={onClose} title="Get a hand" sheet={false}>
      <div className="flex items-center gap-4">
        <Avatar src={HELP.photo} name={HELP.name} size="lg" />
        <div className="min-w-0">
          <p className="text-lg font-semibold">{HELP.name}</p>
          <p className="text-sm text-smoke">{HELP.role}</p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3 rounded-xl border border-gray-100 bg-cloud/40 p-4">
        <Icon name="envelope" className="h-5 w-5 shrink-0 text-brand" />
        {/* SELECTABLE TEXT, NOT A LINK. Tapping it should never hand the reader
            off to an app they did not ask for; the copy button is the action. */}
        <span className="min-w-0 flex-1 select-all break-all text-sm font-medium text-ink">{HELP.email}</span>
        <CopyButton value={HELP.email} label="Copy email address" />
      </div>

      <p className="mt-4 text-xs leading-relaxed text-smoke">
        Copy the email address and send me a message. Try to explain what you were doing or what you
        clicked when the error happened. I'll get back to you as soon as possible.
      </p>

      <div className="mt-5 flex justify-end">
        <button type="button" onClick={onClose} className="btn-secondary !py-2.5 text-sm">Close</button>
      </div>
    </Modal>
  )
}

// The small grey line at the bottom of both screens: the error message, or the
// address that was not found. Somebody forwarding this to us wants it; nobody
// else should have to read it to understand the page.
function Footnote({ children }) {
  if (!children) return null
  return (
    <p className="mt-5 max-w-md break-words px-4 text-center text-[11px] leading-relaxed text-gray-400">
      {children}
    </p>
  )
}

// WHEN SOMETHING BREAKS, SAY SO IN THE BRAND'S OWN VOICE.
//
// Until now an unhandled render error meant a WHITE SCREEN. React unmounts the
// whole tree when a component throws and nothing catches it, so the creator got
// no message, no way back, and no way to tell us - and we got no report either,
// because the only person who saw it was them.
//
// This is the offline screen's twin on purpose. The plane and the clouds are
// already the shape this product uses to say "hold on a moment", and a second
// visual language for "hold on a moment, but worse" would be a new thing to
// learn at the moment somebody is least willing to learn one.
//
// The copy is Ethan's: a mayday that admits the problem, says help is already
// on the way, and gives a radio to call in on. Light, because a stack trace is
// not the reader's fault and a stern error page implies it might be.
export function ErrorScreen({ onRetry, detail }) {
  const [help, setHelp] = useState(false)
  return (
    // BELOW THE MODAL LAYER (z-50), not above it. The scene used to claim
    // z-[100], which was fine while the only thing on it was a mailto link and
    // fatal the moment it had a dialog: Modal portals to the body and the
    // contact card would have opened *behind* the clouds.
    <TrypPlaneScene
      z="z-40"
      title="Mayday, mayday"
      subtitle="Something on our side just went wrong. Air traffic control has been notified and a fix is on its way. Try again in a moment, and radio us in if you need more help."
    >
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onRetry || (() => window.location.reload())}
          className="btn-primary !px-6"
        >
          Try again
        </button>
        <button type="button" onClick={() => setHelp(true)} className="btn-secondary !px-6">
          Radio us in
        </button>
        {/* A REAL RELOAD, not a router link. Whatever threw is still mounted in
            this document; the only guaranteed way out of a tree that keeps
            throwing is a fresh one. */}
        <a href="/" className="btn-ghost !px-6">Back to home</a>
      </div>
      <Footnote>{detail}</Footnote>
      <ContactCard open={help} onClose={() => setHelp(false)} />
    </TrypPlaneScene>
  )
}

// THE ADDRESS THAT DOES NOT EXIST.
//
// This used to be `<Navigate to="/" replace />`: type one character wrong and
// you were silently teleported to the marketing page, with nothing to say your
// link was wrong and no way back to where you meant to be. Silence is not a
// kindness here - somebody who followed a stale link needs to know the link is
// stale, not to be quietly relocated.
//
// Calm on purpose, and a different message from the mayday above, because a
// typo in a URL is not an outage and should not sound like one. Three ways out:
// forwards to home, backwards to whatever they were reading, and a person.
export function NotFoundScreen() {
  const [help, setHelp] = useState(false)
  const { pathname } = useLocation()
  return (
    <TrypPlaneScene
      z="z-40"
      title="Off the flight path"
      subtitle="There is no page at this address. It may have moved since the link was made, or there may be a typo in it. Here are three ways back."
    >
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link to="/" className="btn-primary !px-6">Back to home</Link>
        {/* `history.back()` rather than navigate(-1) so it also works when this
            page is the first thing in the session and there is nothing to pop:
            the browser simply does nothing, which is the honest outcome. */}
        <button type="button" onClick={() => window.history.back()} className="btn-secondary !px-6">
          Go back
        </button>
        <button type="button" onClick={() => setHelp(true)} className="btn-ghost !px-6">
          Get help
        </button>
      </div>
      <Footnote>{pathname}</Footnote>
      <ContactCard open={help} onClose={() => setHelp(false)} />
    </TrypPlaneScene>
  )
}

// The boundary itself.
//
// Class component because that is still the only way to catch a render error in
// React - there is no hook for `componentDidCatch`, by design.
//
// `resetKey` is the route. Without it, one broken page poisons the whole session:
// the boundary stays in its error state, so navigating away shows the error
// screen for a page that is perfectly fine. Changing the key clears it, which
// makes "go somewhere else" a real way out and not just a suggestion.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // We are the only ones who will ever see this: the creator gets a friendly
    // screen, and without a report the bug is invisible to us.
    captureError(error, { componentStack: info?.componentStack })
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorScreen
          detail={this.state.error?.message}
          onRetry={() => this.setState({ error: null })}
        />
      )
    }
    return this.props.children
  }
}
