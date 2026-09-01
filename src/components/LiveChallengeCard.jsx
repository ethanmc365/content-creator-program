import { Link } from 'react-router-dom'
import CountdownTimer from './CountdownTimer'
import Icon from './Icon'
import { Avatar } from './ui'
import ParticipationBar from './network/ParticipationBar'
import { cx, formatDate, formatViews } from '../lib/utils'

// THE CARD FOR A CHALLENGE THAT IS ACTUALLY RUNNING.
//
// One component, two weights. A market brief and a global brief are the same
// object with the same controls, and giving them two hand-written cards is how
// the countdown ends up in a different place on each of them within a month.
// What differs is the WEIGHT, and it differs in three deliberate ways only:
// the ground it is painted on, one line of framing copy, and the meridians.
//
// WHY THE GLOBAL ONE LOOKS DIFFERENT AT ALL. Everybody is a member of
// Worldwide, so a global brief is the one thing on this page that every creator
// in every country can enter. Painted in the same orange as a UK brief and
// stacked in date order, it read as one more local challenge that happened to
// be written in English. It is the bigger thing, so it is the darker, wider,
// heavier card, and it always leads.
//
// NO framer-motion in here. /challenges is an eagerly routed page, so importing
// the animation runtime for one card would put it in the bundle every creator
// downloads on first paint. Everything that moves here is CSS (see the
// `orbit`/`sheen` keyframes in index.css) and every bit of it is behind
// prefers-reduced-motion.

// A faint globe: three meridians and two parallels, drawn once and turned very
// slowly. Purely decorative, so it is aria-hidden and it never animates for
// anyone who has asked the OS for less motion.
function Meridians() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 200"
      className="challenge-orbit pointer-events-none absolute -right-12 -top-16 h-[22rem] w-[22rem] text-white/[0.13] sm:-right-4 sm:h-[26rem] sm:w-[26rem]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    >
      <circle cx="100" cy="100" r="78" />
      <ellipse cx="100" cy="100" rx="30" ry="78" />
      <ellipse cx="100" cy="100" rx="56" ry="78" />
      <line x1="22" y1="100" x2="178" y2="100" />
      <ellipse cx="100" cy="100" rx="78" ry="30" />
      <ellipse cx="100" cy="100" rx="78" ry="56" />
    </svg>
  )
}

// A PLACE IS A NUMBER, EVEN WHEN IT IS STORED AS A WORD.
//
// `prize_structure` is a jsonb array of `{ place, prize }` written by the admin
// form, and `place` comes out as the STRING "1st" on every row in production.
// The chips this replaces did `ordinal(p.place ?? i + 1)` against an ordinal
// helper that compares with `===` against 1, 2 and 3 - so a real prize row
// rendered as "1stth". It never showed because the only challenge with a prize
// structure is archived, which is exactly how a bug like this waits.
const placeNumber = (v, fallback) => {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}
const ordinal = (n) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`)

/** The prize attached to a place, from the structure, or '' if there is none. */
function prizeForPlace(prizes, place) {
  const rows = Array.isArray(prizes) ? prizes : []
  const hit = rows.find((p, i) => placeNumber(p?.place, i + 1) === place)
  return hit?.prize || ''
}

// THE LEADERBOARD, AND IT IS ALWAYS THREE PLACES.
//
// This was two things in two places: a row of prize chips under the title, and
// a "Leading right now" panel that only appeared once somebody had entered. So
// the card that exists to get people to enter said nothing about the prizes
// until you opened the brief, and nothing at all about the race until it was
// already a race you were losing.
//
// Ethan: "it should just say leaderboard, not leading right now, and it should
// show the top three. And even if there is no one entered it, it should still
// show first, second, third, and the prize associated with it... show the
// creator, the profile photo and the views. If no one has got the place, then
// it can just show that it's free, and that might encourage people even more."
//
// So it is ONE block with THREE rows, always. A taken place shows the face, the
// first name and the views; an empty one shows a dashed ring and says the place
// is unclaimed. Either way the row carries the prize, which is the fact that
// makes the whole card worth reading - and which is why the separate chips are
// gone rather than kept: printing the prizes twice is how a card gets bigger,
// and this one was explicitly not to.
//
// IT SITS TOP RIGHT. There was a column of empty gradient there the width of
// the card's own bloom; the leaderboard was underneath the description, pushing
// the countdown down. Ethan drew a box in that space.
//
// Desktop only, as before. The phone's card was cut to a title, a clock and a
// button on purpose and this would put most of it back.
function Leaderboard({ leaders, prizes, className }) {
  const rows = [1, 2, 3].map((place, i) => ({
    place,
    leader: leaders?.[i] || null,
    prize: prizeForPlace(prizes, place),
  }))
  return (
    <div className={cx('rounded-2xl bg-white/[0.14] p-4 ring-1 ring-inset ring-white/15 backdrop-blur-[2px]', className)}>
      <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-white/75">
        <Icon name="trophy" className="h-3.5 w-3.5" />
        Leaderboard
      </p>
      <div className="space-y-2.5">
        {rows.map(({ place, leader, prize }) => (
          <div key={place} className="flex items-center gap-2.5">
            <span className="w-6 shrink-0 text-[11px] font-bold tabular-nums text-white/70">{ordinal(place)}</span>
            {leader ? (
              <Avatar src={leader.photo_url} name={leader.name} size="xs" />
            ) : (
              // A DASHED RING, NOT A GREY DISC. An empty place has to read as
              // "nobody has taken this" and not as "somebody whose photo failed
              // to load", and an outline says vacant in a way a fill cannot.
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-white/45 text-white/50"
              >
                <Icon name="user" className="h-3.5 w-3.5" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className={cx('block truncate text-sm', leader ? 'font-medium' : 'font-medium text-white/60')}>
                {leader ? leader.name?.split(' ')[0] : 'Up for grabs'}
              </span>
              {prize && (
                <span className="block truncate text-[11px] text-white/65">{prize}</span>
              )}
            </span>
            {leader && (
              <span className="shrink-0 text-sm font-bold tabular-nums">{formatViews(leader.views)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function LiveChallengeCard({ challenge: c, global: isGlobal, entries, participation, leaders }) {
  return (
    <div>
      <div
        className={cx(
          'challenge-card relative block overflow-hidden rounded-card text-white shadow-lift',
          // The global card is physically bigger as well as darker. Half of
          // "this is the important one" is the room it takes up.
          // MUCH TIGHTER ON A PHONE. This card was 44px of padding round a
          // 30px title, a paragraph, a row of prize chips, a hero countdown and
          // two buttons - well over a screen on a 375px display for one
          // challenge. Ethan: "when you click on challenges the current card is
          // super big, can you change the UI of it, make it smaller, simpler,
          // easier to read." The desktop card is untouched.
          isGlobal
            ? 'bg-gradient-to-br from-[#8f2a04] via-brand to-brand-light p-5 sm:p-11'
            : 'bg-gradient-to-br from-brand to-brand-light p-5 sm:p-10',
        )}
      >
        {/* Soft light bloom for depth, matching the home hero. */}
        <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        {/* THE DARK BLOOM IS DESKTOP-ONLY NOW, AND IT IS WHY THE PHONE'S CARD
            HAD A GREY BOX IN THE CORNER. Ethan: "on the challenges page on
            mobile there's like a square grey outline, especially in the bottom
            left corner of the challenge card."
            It is a 288px black-10% circle behind a 40px blur, and the card is
            `overflow-hidden` - so on a 375px screen most of the bottom-left
            quadrant is covered by it and the clip turns its soft edge into the
            card's own straight edges. At desktop widths the same circle is a
            small weight in the corner of a much larger card, which is what it
            was drawn to be. */}
        <div className="pointer-events-none absolute -bottom-24 -left-10 hidden h-72 w-72 rounded-full bg-black/10 blur-2xl sm:block" />
        {isGlobal && <Meridians />}
        {/* One slow pass of light across the card when it arrives. It reads as
            the card being lit rather than as a thing that moves, which is the
            only kind of decoration a page you open weekly can carry. */}
        <div aria-hidden className="challenge-sheen pointer-events-none absolute inset-0" />

        {/* TWO COLUMNS FROM `lg`, ONE STACK BELOW IT.
            The leaderboard goes in the top right and the buttons sit under it,
            which is the shape of the card Ethan drew a box on: the words and
            the clock down the left, who is winning and how to join down the
            right. A grid rather than nested flexes because the two rows have to
            line up ACROSS the columns - the countdown and the buttons share a
            baseline at the foot of the card, and no amount of `items-end` on
            two separate columns will keep them there when one of them grows.
            On a phone none of it applies: the parts fall back into the source
            order, which is the order the phone's card already had. */}
        <div className="relative lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-x-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 lg:col-start-1 lg:row-start-1">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/80" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
              </span>
              Live now
            </span>
            {isGlobal && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-brand">
                <Icon name="globe" className="h-3.5 w-3.5" />
                Global challenge
              </span>
            )}
            <span className="text-xs text-white/75">
              {formatDate(c.start_date)} → {formatDate(c.end_date)}
            </span>
          </div>

          {/* The title grows slightly on hover rather than underlining. An
              underline reads as "this is a link in a paragraph"; a heading that
              swells reads as "this whole thing is the target", which is what it
              actually is. origin-left keeps it anchored to the text's start. */}
          <Link to={`/challenges/${c.id}`} className="group block lg:col-start-1 lg:row-start-2">
            <h2
              className={cx(
                'mt-3 inline-block origin-left font-bold leading-[1.15] tracking-[-0.02em] transition-transform duration-200 ease-out sm:mt-4 group-hover:scale-[1.03]',
                isGlobal ? 'text-[22px] sm:text-[40px]' : 'text-xl sm:text-3xl',
              )}
            >
              {c.title}
            </h2>
            {/* Only the global card carries the framing line, because it is the
                only one whose scope is not obvious from the page you are on. */}
            {isGlobal && (
              <p className="mt-2 text-sm font-medium text-white/90">
                Every market, every creator. One brief, one leaderboard.
              </p>
            )}
            {/* The blurb is desktop-only. On a phone the whole card is a link
                to the brief, which is the same words with room to read them. */}
            <p className="mt-2 hidden max-w-2xl leading-relaxed text-white/85 line-clamp-2 sm:block">{c.description}</p>
          </Link>

          <Leaderboard
            leaders={leaders}
            prizes={c.prize_structure}
            className="hidden lg:col-start-2 lg:row-start-1 lg:row-end-3 lg:block lg:self-start"
          />

          <div className="mt-5 sm:mt-8 lg:col-start-1 lg:row-start-3 lg:mt-7 lg:self-end">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/75 sm:mb-3 sm:text-xs">Closes in</p>
            {/* The hero clock is four big tiles. On a phone that is most of
                what is left of the card, so it gets the compact row instead
                and the card gets its height back. */}
            <span className="hidden sm:block"><CountdownTimer endDate={c.end_date} hero /></span>
            <span className="block sm:hidden"><CountdownTimer endDate={c.end_date} compact onDark /></span>
          </div>

          <div className="mt-5 flex flex-col gap-2.5 sm:mt-7 lg:col-start-2 lg:row-start-3 lg:mt-7 lg:items-end lg:self-end">
            {/* ONE BUTTON ON A PHONE, and it is the one you came for. "Read
                the brief" is what the rest of the card already does. */}
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <Link to={`/challenges/${c.id}`} className="btn hidden border border-white/40 text-white hover:bg-white/10 sm:inline-flex">
                Read the brief →
              </Link>
              <Link to={`/challenges/${c.id}?submit=1`} className="btn w-full justify-center bg-white !text-brand hover:bg-white/90 sm:w-auto">
                Submit your video
              </Link>
            </div>
            <p className="text-[13px] text-white/80 sm:text-sm">
              {entries} {entries === 1 ? 'entry' : 'entries'} so far
            </p>
          </div>
        </div>
      </div>

      {/* Participation pace: nudges the quiet majority, names no one. The
          shared component, not a fourth hand-rolled copy of it. */}
      {participation && <ParticipationBar participation={participation} where="" className="mt-4" />}
    </div>
  )
}
