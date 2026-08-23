import { Link } from 'react-router-dom'
import Icon from '../../components/Icon'

// THE FRONT DOOR.
//
// WHAT IT WAS: a logo, a white box in the middle of a grey page, and the form.
// That is the shape of every admin login on the internet, and it is the wrong
// shape for this one, because signing up here is not an administrative act - it
// is somebody deciding whether to join a programme they have probably heard
// about from another creator thirty seconds ago. The page had nothing on it
// that answered "what is this and why would I".
//
// WHAT IT IS NOW: a split. The left half is the pitch - what the programme
// gives you, in four short lines that are true and specific - and the right
// half is the form. On a phone there is no room for a split, so the pitch
// collapses to a strip above the card and the form gets the screen.
//
// THE COLOUR IS ON THE LEFT AND NOWHERE ELSE. One saturated panel against a
// white form is the whole composition; putting brand colour on both halves
// would leave the eye with nothing to land on.

const PITCH = [
  ['flag', 'Briefs with real money on them', 'A challenge goes up, you film it, the best entries get paid. No pitching, no invoicing chases.'],
  ['users', 'A network you can actually reach', 'Hundreds of travel creators across six markets, on a map, one message away.'],
  ['plane', 'Trips, gear and the boring answers', 'Visas, rates, kit, which airline actually pays out - somebody here has already done it.'],
  ['trophy', 'A ladder with something on every rung', 'Milestones you can see coming, and rewards that are worth reaching.'],
]

export default function AuthShell({ title, subtitle, children, footer, wide = false }) {
  return (
    <div className="auth-shell">
      {/* ---------- the pitch ---------- */}
      <aside className="auth-pitch">
        {/* Two big soft blooms and a very slow drift. The panel is a flat
            gradient otherwise, and a flat gradient the size of half a screen
            reads as a placeholder for an image that failed to load. */}
        <span className="auth-bloom auth-bloom--a" aria-hidden />
        <span className="auth-bloom auth-bloom--b" aria-hidden />

        <div className="auth-pitch-inner">
          <Link to="/" className="auth-mark">
            <img src="/brand/tryp-logo.png" alt="Tryp.com" className="h-11 w-11 rounded-xl object-cover" />
            <span>
              <span className="block text-sm font-semibold leading-tight">Tryp.com</span>
              <span className="block text-xs leading-tight text-white/70">Content Creator Program</span>
            </span>
          </Link>

          <div className="auth-pitch-body">
            <h2 className="auth-pitch-head">
              Get paid to make the videos you were going to make anyway.
            </h2>
            <ul className="auth-pitch-list">
              {PITCH.map(([icon, head, line], i) => (
                <li key={head} style={{ '--i': i }}>
                  <span className="auth-pitch-icon"><Icon name={icon} className="h-4 w-4" /></span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{head}</span>
                    <span className="block text-[13px] leading-relaxed text-white/70">{line}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="auth-pitch-foot">
            Free to join. Every application is read by a person, not a filter.
          </p>
        </div>
      </aside>

      {/* ---------- the form ---------- */}
      <main className="auth-form-side">
        <div className={wide ? 'auth-form auth-form--wide' : 'auth-form'}>
          <Link to="/" className="auth-mark auth-mark--mobile">
            <img src="/brand/tryp-logo.png" alt="Tryp.com" className="h-10 w-10 rounded-xl object-cover" />
            <span className="text-sm font-semibold">Tryp.com Creator Program</span>
          </Link>

          <h1 className="auth-title">{title}</h1>
          {subtitle && <p className="auth-sub">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="auth-foot">{footer}</div>}
        </div>
      </main>
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
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-gray-200 bg-cloud/60 px-4 py-3.5">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-[10px] font-bold text-smoke ring-1 ring-gray-200">CF</span>
      <span className="text-xs text-smoke">Cloudflare Turnstile sits here on the live pages.</span>
    </div>
  )
}
