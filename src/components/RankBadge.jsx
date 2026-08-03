import { cx } from '../lib/utils'

// Podium badges for the all-time leaderboard.
//
// The old top three were gold / silver / bronze gradient circles, which looked
// borrowed from another product. These are award rosettes drawn in the brand
// palette only, so the podium still reads at a glance while staying on-brand:
//
//   1st  solid brand orange, white ordinal
//   2nd  brand light, white ordinal
//   3rd  brand tint disc, brand outline and ordinal
//
// Fourth place and below get the plain grey number chip (see Leaderboard.jsx).
const TIERS = [
  { disc: '#d94407', tail: '#b03705', text: '#ffffff', ring: 'rgba(255,255,255,0.45)', ordinal: '1st' },
  { disc: '#f5853f', tail: '#d94407', text: '#ffffff', ring: 'rgba(255,255,255,0.45)', ordinal: '2nd' },
  { disc: '#fdf0e7', tail: '#f5853f', text: '#d94407', ring: '#f5853f', ordinal: '3rd' },
]

// place: 1, 2 or 3.
export default function RankBadge({ place, className }) {
  const tier = TIERS[place - 1]
  if (!tier) return null
  return (
    <svg
      viewBox="0 0 44 56"
      className={cx('shrink-0', className)}
      role="img"
      aria-label={`${tier.ordinal} place`}
    >
      {/* Ribbon tails first so the disc sits on top of them. */}
      <path d="M14 33L9 54l13-9z" fill={tier.tail} />
      <path d="M30 33l5 21-13-9z" fill={tier.tail} />
      <circle cx="22" cy="20" r="18" fill={tier.disc} />
      <circle cx="22" cy="20" r="14" fill="none" stroke={tier.ring} strokeWidth="1.5" />
      <text
        x="22"
        y="20"
        textAnchor="middle"
        dominantBaseline="central"
        fill={tier.text}
        fontSize="14"
        fontWeight="700"
        letterSpacing="-0.4"
      >
        {tier.ordinal}
      </text>
    </svg>
  )
}
