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

// The top two or three places, as chips. The prize is the reason anybody reads
// past the title, and it used to be entirely absent from this card: you had to
// open the brief to find out whether it was worth ten pounds or two hundred.
//
// `prize_structure` is a jsonb array of { place, prize } and the prize is
// already a formatted string ("£105 cash"), because prizes are not always
// money. Three at most: a five-place structure turns the row into a paragraph.
function PrizeChips({ prizes }) {
  const rows = (Array.isArray(prizes) ? prizes : [])
    .filter((p) => p?.prize)
    .slice(0, 3)
  if (rows.length === 0) return null
  const ordinal = (n) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`)
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <Icon name="trophy" className="h-4 w-4 shrink-0 text-white/70" />
      {rows.map((p, i) => (
        <span
          key={p.place ?? i}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/15 py-1 pl-2 pr-3 text-xs font-medium text-white backdrop-blur-[2px]"
        >
          <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
            {ordinal(p.place ?? i + 1)}
          </span>
          {p.prize}
        </span>
      ))}
    </div>
  )
}

// WHO IS AHEAD, RIGHT NOW.
//
// A live challenge card said what the brief was and when it closed, and nothing
// at all about how it was going - so the one card on the platform whose whole
// job is to get somebody to enter had no reason in it. Ethan: "perhaps on the
// actual card under challenges show something about the prizes, or a top 3
// leaderboard, as we have automatic view tracking this could work, I just think
// it needs a better design to encourage people to participate."
//
// View counts are read off every entry's link automatically, so this costs one
// query and is never stale by more than a sync. It is deliberately SMALL: three
// rows, first names, no ranks beyond the position itself. A leaderboard that
// dominates the card would tell the ninety percent not in the top three that
// they have already lost, which is the opposite of the point - what it is for
// is showing that entering is a thing people are doing.
//
// Desktop only. The phone's card was cut to a title, a clock and a button on
// purpose, and this would put most of it back.
function Leaders({ leaders }) {
  if (!leaders?.length) return null
  const place = ['1st', '2nd', '3rd']
  return (
    <div className="mt-6 hidden rounded-2xl bg-white/12 p-4 backdrop-blur-[2px] lg:block">
      <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-white/75">
        Leading right now
      </p>
      <div className="space-y-1.5">
        {leaders.slice(0, 3).map((l, i) => (
          <div key={l.creator_id} className="flex items-center gap-2.5">
            <span className="w-7 shrink-0 text-[11px] font-bold tabular-nums text-white/70">{place[i]}</span>
            <Avatar src={l.photo_url} name={l.name} size="xs" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.name?.split(' ')[0]}</span>
            <span className="shrink-0 text-sm font-bold tabular-nums">{formatViews(l.views)}</span>
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
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-black/10 blur-2xl" />
        {isGlobal && <Meridians />}
        {/* One slow pass of light across the card when it arrives. It reads as
            the card being lit rather than as a thing that moves, which is the
            only kind of decoration a page you open weekly can carry. */}
        <div aria-hidden className="challenge-sheen pointer-events-none absolute inset-0" />

        <div className="relative">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
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
          <Link to={`/challenges/${c.id}`} className="group block">
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

          <PrizeChips prizes={c.prize_structure} />

          <Leaders leaders={leaders} />

          <div className="mt-5 flex flex-col gap-5 sm:mt-8 sm:gap-7 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/75 sm:mb-3 sm:text-xs">Closes in</p>
              {/* The hero clock is four big tiles. On a phone that is most of
                  what is left of the card, so it gets the compact row instead
                  and the card gets its height back. */}
              <span className="hidden sm:block"><CountdownTimer endDate={c.end_date} hero /></span>
              <span className="block sm:hidden"><CountdownTimer endDate={c.end_date} compact onDark /></span>
            </div>
            <div className="flex flex-col gap-2.5 lg:items-end">
              {/* ONE BUTTON ON A PHONE, and it is the one you came for. "Read
                  the brief" is what the rest of the card already does. */}
              <div className="flex flex-wrap gap-3">
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
      </div>

      {/* Participation pace: nudges the quiet majority, names no one. The
          shared component, not a fourth hand-rolled copy of it. */}
      {participation && <ParticipationBar participation={participation} where="" className="mt-4" />}
    </div>
  )
}
