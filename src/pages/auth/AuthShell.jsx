import { Link } from 'react-router-dom'
import { useT } from '../../lib/i18n'
import LanguagePicker from '../../components/LanguagePicker'
import Icon from '../../components/Icon'
import { useAuth } from '../../context/AuthContext'

// THE FRAME FOR EVERY AUTH PAGE, AND THE FIRST SCREEN A CREATOR EVER MEETS.
//
// Ethan: "improve the signup page as I mentioned - use your initiative to
// redesign cards and add animations."
//
// It was a grey page with a white box on it. Nothing wrong, and nothing about
// it either: the landing page it comes from is bright, animated and orange, and
// stepping into a flat grey rectangle reads as leaving the product rather than
// entering it.
//
// THREE CHANGES, AND EACH IS THE SAME IDEA - carry the landing page through:
//
//   THE GROUND. A soft brand bloom behind the card rather than a flat grey
//   wash, so the page has the same warmth as the one before it. Bloom, not
//   gradient: the white space Ethan asked to keep is what makes the card read.
//
//   THE CARD ARRIVES. The logo, the card and the footer take their turn about
//   80ms apart on the same `animate-fade-up` the hero uses, so the two screens
//   are visibly the same product. Behind prefers-reduced-motion globally.
//
//   THE LOGO IS A LINK BACK AND SAYS SO. It always was one, silently. It now
//   sits with the wordmark and lifts on hover, because on a signup page the
//   only way back to the thing you were reading is worth being visible.
export default function AuthShell({ title, subtitle, children, footer }) {
  const tr = useT()
  const { user } = useAuth()
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-white px-5 pb-12 pt-24 sm:pt-28">
      {/* THE HEADING BAR, WITH THE LANGUAGE IN IT (2 Oct 2026). Ethan: a language picker "at the very top,
          we have that heading bar. They can switch the language there". Every auth page shares this shell,
          so log in, sign up, forgotten password and reset all get it, and the choice follows the person
          through the whole sign-up (it is kept on the device, and written to the profile once there is
          one). The back link is the same way out the logo always was, made visible. */}
      <div className="fixed inset-x-0 top-0 z-40 px-3 pt-[max(env(safe-area-inset-top),0.75rem)] sm:px-5 sm:pt-4">
        <div className="mx-auto flex h-12 max-w-5xl items-center justify-between sm:h-14">
          <Link to="/" className="group flex h-10 items-center gap-1.5 rounded-full bg-white/80 pl-3 pr-4 text-sm font-semibold text-smoke shadow-card ring-1 ring-black/5 backdrop-blur transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:text-ink">
            <Icon name="chevronLeft" className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" strokeWidth={2.2} />
            {tr('Back')}
          </Link>
          <LanguagePicker userId={user?.id || null} />
        </div>
      </div>

      {/* Two blooms, one warm and one faint, in the corners the card does not
          use. Fixed rather than absolute so a tall form scrolling past does not
          drag the light with it. */}
      <span aria-hidden className="pointer-events-none fixed -top-40 left-1/2 h-[34rem] w-[46rem] max-w-[150%] -translate-x-1/2 rounded-full bg-brand-tint/70 blur-3xl" />
      <span aria-hidden className="pointer-events-none fixed -bottom-48 -right-32 h-[28rem] w-[28rem] rounded-full bg-brand-tint/40 blur-3xl" />

      <Link
        to="/"
        className="animate-fade-up group relative mb-8 flex flex-col items-center gap-2"
      >
        <img
          src="/brand/tryp-logo-360.png"
          alt="Tryp.com"
          className="h-14 rounded-2xl shadow-card transition-transform duration-200 group-hover:-translate-y-0.5"
        />
        <span className="text-xs font-medium text-smoke transition-colors group-hover:text-brand">
          {tr('Creator Community')}
        </span>
      </Link>

      <div
        className="animate-fade-up relative w-full max-w-md rounded-card border border-gray-100 bg-white p-8 shadow-lift sm:p-10"
        style={{ animationDelay: '0.08s' }}
      >
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-sm leading-relaxed text-smoke">{subtitle}</p>}
        <div className="mt-8">{children}</div>
      </div>

      {footer && (
        <div
          className="animate-fade-up relative mt-6 text-sm text-smoke"
          style={{ animationDelay: '0.16s' }}
        >
          {footer}
        </div>
      )}
    </div>
  )
}

// THE CAPTCHA, WHEN NOBODY IS SIGNING UP.
//
// The auth pages are rendered live inside the admin Testing Centre so the
// public front door can be shown without leaving the app. A real Turnstile
// widget there would call Cloudflare on every render of a demonstration, and a
// solved token nobody submits is a token wasted. The demo swaps in this: same
// space, same position in the form, obviously inert.
export function DemoCaptcha() {
  const tr = useT()
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-gray-200 bg-cloud/60 px-4 py-3.5">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-[10px] font-bold text-smoke ring-1 ring-gray-200">CF</span>
      <span className="text-xs text-smoke">{tr("Cloudflare Turnstile sits here on the live pages.")}</span>
    </div>
  )
}

