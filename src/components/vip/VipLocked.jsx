import { Link } from 'react-router-dom'
import Icon from '../Icon'
import { useT } from '../../lib/i18n'
import { cx } from '../../lib/utils'

// THE VIP COMMUNITY, SEEN FROM OUTSIDE (7 Oct 2026).
//
// Ethan: "I want the general community to be aware that we have this VIP community that shows a really cool animated
// lock thing (kind of like how we have that recap card with the current locked animation) ... Should we have specific
// instructions for them to get there? Maybe not specific instructions because it's kind of up to us: performing well
// in the challenges, participating, being engaged in the community."
//
// So it never promises a threshold. It says what VIPs get, and what the team looks at when it invites somebody, and
// points at the two things that move it: challenges and ideas. The lock is drawn, not an icon: the shackle lifts a
// little and settles, a light sweeps the body, and stars drift round it.

export function AnimatedLock({ size = 120, className }) {
  return (
    <span className={cx('vip-lock relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }} aria-hidden>
      <span className="vip-lock-halo absolute inset-0 rounded-full" />
      {[0, 1, 2, 3, 4].map((i) => <span key={i} className={`vip-lock-star vip-lock-star-${i}`} />)}
      <svg viewBox="0 0 120 120" className="relative h-full w-full drop-shadow-[0_14px_24px_rgba(0,0,0,0.35)]">
        <defs>
          <linearGradient id="vipLockBody" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffb36b" />
            <stop offset="0.55" stopColor="#f5853f" />
            <stop offset="1" stopColor="#d94407" />
          </linearGradient>
          <clipPath id="vipLockClip"><rect x="28" y="52" width="64" height="50" rx="14" /></clipPath>
        </defs>
        <g className="vip-lock-shackle">
          <path d="M42 54 V40 a18 18 0 0 1 36 0 V54" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" opacity="0.95" />
        </g>
        <rect x="28" y="52" width="64" height="50" rx="14" fill="url(#vipLockBody)" />
        <g clipPath="url(#vipLockClip)"><rect className="vip-lock-sweep" x="-40" y="40" width="26" height="80" fill="rgba(255,255,255,0.45)" transform="skewX(-18)" /></g>
        <path d="M60 68 l3.1 6.3 6.9 1 -5 4.9 1.2 6.9 -6.2 -3.3 -6.2 3.3 1.2 -6.9 -5 -4.9 6.9 -1z" fill="#fff" />
      </svg>
    </span>
  )
}

const PERKS = [
  { icon: 'cash', title: 'Paid for every view', body: 'VIP creators earn for the views their Tryp.com videos bring, every month.' },
  { icon: 'wallet', title: 'Monthly payouts', body: 'A balance that builds up, paid as cash or a Tryp.com voucher.' },
  { icon: 'star', title: 'A room with the team', body: 'Private VIP rooms, briefs before anyone else, and direct feedback.' },
  { icon: 'plane', title: 'Perks as you grow', body: 'Rewards that unlock the further your videos travel.' },
]

const LOOK_FOR = [
  { icon: 'trophy', title: 'You show up in the challenges', body: 'Taking part, and doing well, is the clearest signal there is.' },
  { icon: 'video', title: 'You post consistently', body: 'Regular videos with good hooks, not one lucky hit.' },
  { icon: 'chat', title: 'You are part of the community', body: 'Helping others, sharing what works, being around.' },
  { icon: 'sparkles', title: 'Your videos feel like Tryp.com', body: 'Clear, honest and fun, with the deal front and centre.' },
]

export function VipLockedPage() {
  const tr = useT()
  return (
    <div className="page max-w-4xl">
      <section className="vip-locked-hero relative overflow-hidden rounded-[32px] px-6 pb-10 pt-10 text-center text-white shadow-lift sm:px-12 sm:pt-14">
        <span aria-hidden className="ideas-orb ideas-orb-a" />
        <span aria-hidden className="ideas-orb ideas-orb-b" />
        <div className="relative flex flex-col items-center">
          <AnimatedLock size={128} />
          <p className="mt-6 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-brand-light"><Icon name="lock" className="h-3.5 w-3.5" />{tr('Invite only')}</p>
          <h1 className="mt-2 max-w-xl text-[32px] font-extrabold leading-[1.05] tracking-tight sm:text-[44px]">{tr('The VIP community')}</h1>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-white/75">
            {tr('A small group of creators who are paid by the views their Tryp.com videos bring. Places are by invitation from the team.')}
          </p>
        </div>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        {PERKS.map((p, i) => (
          <div key={p.title} className="vip-perk relative overflow-hidden rounded-card border border-gray-100 bg-white p-5 shadow-card animate-rise" style={{ animationDelay: `${120 + i * 80}ms` }}>
            <Icon name={p.icon} className="h-6 w-6 text-brand" />
            <p className="mt-3 font-bold text-ink">{tr(p.title)}</p>
            <p className="mt-1 text-sm leading-relaxed text-smoke">{tr(p.body)}</p>
            <span aria-hidden className="absolute right-4 top-4 text-gray-200"><Icon name="lock" className="h-4 w-4" /></span>
          </div>
        ))}
      </section>

      <section className="mt-6 rounded-[28px] bg-gradient-to-br from-brand to-brand-light p-6 text-white shadow-card animate-rise sm:p-8" style={{ animationDelay: '460ms' }}>
        <h2 className="text-xl font-extrabold">{tr('What the team looks for')}</h2>
        <p className="mt-1 max-w-xl text-sm text-white/85">{tr('There is no form and no fixed number. The team looks at the whole picture and invites creators who stand out.')}</p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {LOOK_FOR.map((l) => (
            <li key={l.title} className="flex items-start gap-3 rounded-2xl bg-white/10 p-4 ring-1 ring-white/20 backdrop-blur-sm">
              <Icon name={l.icon} className="mt-0.5 h-5 w-5 shrink-0" />
              <span>
                <span className="block text-sm font-bold">{tr(l.title)}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-white/85">{tr(l.body)}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link to="/challenges" className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-brand shadow-card transition-transform duration-200 hoverable:hover:-translate-y-0.5">
            {tr('See the challenges')}<Icon name="chevronRight" className="h-4 w-4" />
          </Link>
          <Link to="/ideas" className="inline-flex items-center justify-center gap-2 rounded-full bg-white/15 px-5 py-3 text-sm font-bold text-white ring-1 ring-white/30 transition-transform duration-200 hoverable:hover:-translate-y-0.5">
            <Icon name="bulb" className="h-4 w-4" />{tr('Get video ideas')}
          </Link>
        </div>
      </section>
    </div>
  )
}

/** The same idea as a card, for pages a creator already visits (Milestones). */
export function VipTeaserCard({ className }) {
  const tr = useT()
  return (
    <Link to="/vip" className={cx('vip-locked-hero group relative flex items-center gap-4 overflow-hidden rounded-card p-5 text-white shadow-card transition-all duration-300 hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift', className)}>
      <span aria-hidden className="ideas-orb ideas-orb-a !h-40 !w-40" />
      <AnimatedLock size={64} className="shrink-0" />
      <span className="relative min-w-0 flex-1">
        <span className="block text-[10.5px] font-bold uppercase tracking-[0.18em] text-brand-light">{tr('Invite only')}</span>
        <span className="mt-0.5 block text-lg font-extrabold leading-tight">{tr('The VIP community')}</span>
        <span className="mt-1 block text-[13px] leading-snug text-white/75">{tr('Creators paid for every view. See what it takes to be invited.')}</span>
      </span>
      <Icon name="chevronRight" className="relative h-5 w-5 shrink-0 text-brand-light transition-transform duration-200 group-hover:translate-x-1" />
    </Link>
  )
}
