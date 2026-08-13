import { Component } from 'react'
import TrypPlaneScene from './TrypPlaneScene'
import { captureError } from '../lib/monitoring'

const SUPPORT_EMAIL = 'creators@tryp.com'

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
  return (
    <TrypPlaneScene
      title="Mayday, mayday"
      subtitle="Something on our side just went wrong. Air traffic control has been told and a fix is on its way. Try again in a moment, and radio us in if you need a hand."
    >
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onRetry || (() => window.location.reload())}
          className="btn-primary !px-6"
        >
          Try again
        </button>
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Something broke on the creator platform')}&body=${encodeURIComponent(
            `Hi team,\n\nI hit an error on the platform.\n\nWhat I was doing:\n\n\n---\nPage: ${typeof window !== 'undefined' ? window.location.href : ''}\n${detail ? `Detail: ${detail}\n` : ''}`,
          )}`}
          className="btn-secondary !px-6"
        >
          Radio us in
        </a>
      </div>
      {/* The detail is small, grey and last. Somebody forwarding this to us
          wants it; nobody else should have to read it to understand the page. */}
      {detail && (
        <p className="mt-5 max-w-md break-words px-4 text-center text-[11px] leading-relaxed text-gray-300">
          {detail}
        </p>
      )}
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
