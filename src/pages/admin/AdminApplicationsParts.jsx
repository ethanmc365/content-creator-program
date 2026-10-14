import { CopyButton } from '../../components/ui'
import Icon from '../../components/Icon'
import { cx } from '../../lib/utils'

// SIGNUP REVIEW, REBUILT 4 SEP 2026.
//
// New creators sign up, complete their profile, and wait here as `pending`
// until an admin approves or declines them.
//
// WHAT CHANGED AND WHY
//
//  1  THE MARKET IS A DECISION ON THE CARD, NOT A LABEL ON IT. It used to be a
//     grey badge reading whatever the country resolved to, with no way to
//     disagree - and there are two ordinary cases where the country is the
//     wrong answer. A Portuguese speaker living in London is more use to
//     Portugal than to UK & Ireland; somebody in France, which no market
//     covers, might belong in Spain rather than in the worldwide pool by
//     default. Both of those turn on the LANGUAGES they speak, which is why
//     The team wants that section to count for something here. The card now
//     suggests, says why it is suggesting, flags any market whose own language
//     this applicant speaks, and lets the admin pick a different one before
//     approving. Approval places them in whatever is picked - see the
//     `admin_approve_application` RPC, which does both halves as one unit so
//     "approved but in no market" is not a state that can be left behind.
//
//  2  EVERYTHING THE DECISION TURNS ON, WITHOUT LEAVING THE PAGE. Their words
//     in full rather than clamped, their platforms as real links in their own
//     colours, their languages as chips (they are now load-bearing), their
//     travel photographs as a strip - a creator's photos are the single most
//     useful thing to look at when deciding whether they can shoot, and they
//     were the one thing this page never showed. Plus the phone number, which
//     an admin previously had to open the full profile to find, and which is
//     the fastest way to reach somebody about a shoot.
//
//  3  THE PAGE ADMITS WHAT IS MISSING. An application with no social links, no
//     photo or a bio of four words is a different decision from a complete one,
//     and it looked identical. Gaps are marked.
//
// A card is COLLAPSED to its summary by default and opens in place. Fifteen
// applications each three screens tall is a page nobody reads to the end.

// THE LANGUAGE A MARKET IS ACTUALLY SPOKEN IN.
//
// The obvious source is `communities.language`, and it is the wrong one: that
// column is the market's INTERFACE language, and five of the six markets are on
// 'en' because the platform has only been translated into Spanish so far. Using
// it lit up "English" as a market signal on every applicant, which is worse
// than no signal - almost everybody who applies speaks English, so a hint that
// fires for all of them tells an admin nothing and trains them to ignore the
// one that matters.
//
// What is worth flagging is somebody who speaks the language a market is LIVED
// in, which is a property of its countries. Keyed by country code so a market
// covering several (Nordics, UK & Ireland) contributes all of them.
//
// ENGLISH IS DELIBERATELY NOT A SIGNAL. It is the programme's working language
// and the assumed baseline; "speaks English" is not a reason to move anybody.
// THE LANGUAGE COLOURS ARE GONE.
//
// They are right, and the reason is worth keeping: the ONE colour that carries meaning on that row is the brand
// highlight on a language pointing at another market. Six tinted chips compete with the single signal the section exists
// for, which is the opposite of standing out.

// THE LANGUAGE A MARKET IS ACTUALLY SPOKEN IN.
//
// The obvious source is `communities.language`, and it is the wrong one: that
// column is the market's INTERFACE language, and five of the six markets are on
// 'en' because the platform has only been translated into Spanish so far. Using
// it lit up "English" as a market signal on every applicant, which is worse
// than no signal - almost everybody who applies speaks English, so a hint that
// fires for all of them tells an admin nothing and trains them to ignore the
// one that matters.
//
// What is worth flagging is somebody who speaks the language a market is LIVED
// in, which is a property of its countries. Keyed by country code so a market
// covering several (Nordics, UK & Ireland) contributes all of them.
//
// ENGLISH IS DELIBERATELY NOT A SIGNAL. It is the programme's working language
// and the assumed baseline; "speaks English" is not a reason to move anybody.
// A COLOUR PER LANGUAGE, SO A ROW OF THEM IS SCANNABLE.
//
// Six identical grey chips is a list you have to READ; six coloured ones is a
// list you can compare across a page of applications, which is the actual job
// here now that languages help decide the market. The colour is derived from
// the language's own name rather than assigned, so a language nobody has
// listed yet still gets a stable one and this never needs maintaining.
//
// STAYS INSIDE A QUIET RANGE ON PURPOSE. These are `hsl` at low saturation and
// high lightness - tinted paper, not paint - because the house palette is
// white, ink and one orange, and a genuinely multicoloured row would fight
// everything else on the card. What varies is HUE, which is all the eye needs
// to tell two chips apart.
export const LOCAL_LANGUAGE = {
  ES: 'Spanish', PT: 'Portuguese', DE: 'German', RO: 'Romanian',
  SE: 'Swedish', NO: 'Norwegian', DK: 'Danish', FI: 'Finnish',
  FR: 'French', IT: 'Italian', NL: 'Dutch', PL: 'Polish',
}

// WHEN AN APPLICATION ARRIVED, WHICH IS NOT WHEN ITS ACCOUNT WAS MADE.
//
// `created_at` is the moment somebody pressed Sign up; `submitted_at`
// (migration 218) is the moment they finished the form. For anybody who started
// and came back those are different days, and this queue is sorted and labelled
// by the wrong one - so an application that landed twenty minutes ago sat at
// the bottom of a newest-first list under "Applied 6 days ago".
//
// THE COALESCE IS NOT DEFENSIVE PADDING, IT IS THE BACKFILL. Every row that had
// already finished when 218 ran has no honest submission time - the moment was
// never recorded anywhere - so it keeps its signup date and renders through the
// same path. It is also what makes this file correct on an origin where 218 has
// not been applied yet.
export const appliedAt = (app) => app?.submitted_at || app?.created_at

/** The non-English languages a market is spoken in, from its countries. */
export function marketLanguages(m) {
  return [...new Set((m?.country_codes ?? []).map((c) => LOCAL_LANGUAGE[c]).filter(Boolean))]
}

// ---------------------------------------------------------------------- card

// THE TICK, AND THE ADDRESS, ON THE FACE OF EVERY CARD.
//
// Two of, and the bulk bar above needs somewhere to be ticked from.
//
// The address used to live only behind "Read the whole application", which is
// an expand, a scroll and a hunt for a row labelled Email - for the single most
// copied thing on the page. It is on the summary now, next to the copy button
// that copies it, which is the rule the rest of this file already follows.
export function PickTick({ selected, onSelect, name }) {
  // A BIG HIT AREA AROUND A SMALL BOX (15 Oct 2026): "clicking near the box should also activate it". The button is 40px
  // of invisible padding around the 20px box, pulled back by negative margins so the layout does not move.
  return (
    <button
      type="button"
      onClick={onSelect}
      role="checkbox"
      aria-checked={!!selected}
      aria-label={`Select ${name || 'this application'}`}
      className="group -m-2.5 flex shrink-0 items-start justify-center rounded-xl p-2.5 pt-3.5"
    >
      <span className={cx(
        'flex h-5 w-5 items-center justify-center rounded border transition-all duration-150',
        selected
          ? 'border-brand bg-brand text-white'
          : 'border-gray-300 bg-white group-hover:border-brand',
      )}>
        {selected && <Icon name="check" className="h-3 w-3" />}
      </span>
    </button>
  )
}

export function EmailRow({ email }) {
  if (!email) {
    return <p className="mt-2 text-xs text-gray-300">No email on file</p>
  }
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <a
        href={`mailto:${email}`}
        className="min-w-0 truncate text-xs font-medium text-smoke underline decoration-gray-200 underline-offset-2 transition-colors hoverable:hover:text-brand hoverable:hover:decoration-brand"
      >
        {email}
      </a>
      <CopyButton value={email} label="Copy email address" className="!h-6 !w-6 shrink-0" />
    </div>
  )
}

// `copy` puts a copy control on the row - and ONLY the two rows that carry
// something worth copying get one, so the icon always means the thing next to
// it. That is the whole difference from the unlabelled button that used to sit
// in the actions row meaning "the email", which nobody could have guessed.
export function Fact({ label, value, copy = false }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className={cx('min-w-0 flex-1 truncate text-xs', value ? 'select-all text-ink' : 'text-gray-300')}>
        {value || 'Not given'}
      </dd>
      {copy && value && (
        <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} className="!h-5 !w-5 shrink-0" />
      )}
    </div>
  )
}
