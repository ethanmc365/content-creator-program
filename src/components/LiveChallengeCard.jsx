import { Link } from 'react-router-dom'
import CountdownTimer from './CountdownTimer'
import Icon from './Icon'
import { Avatar } from './ui'
import ParticipationBar from './network/ParticipationBar'
import { cx, formatDate, formatViews } from '../lib/utils'
import { ordinalFor, rankInk } from '../lib/podiumTiers'
import { useT } from '../lib/i18n'
import { briefExcerpt } from '../lib/briefExcerpt'
import SpinningEarth from './SpinningEarth'
import GlowRing from './network/GlowRing'

// THE CARD FOR A CHALLENGE THAT IS ACTUALLY RUNNING.
//
// One component, two weights. A market brief and a global brief are the same
// object with the same controls, and giving them two hand-written cards is how
// the countdown ends up in a different place on each of them within a month.
// What differs is the WEIGHT, and it differs in three deliberate ways only:
// the ground it is painted on, one line of framing copy, and the turning Earth
// (SpinningEarth).
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

const placeNumber = (v, fallback) => {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

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
// IT IS A WHITE CARD, NOT A TINT OF THE ORANGE IT SITS ON.
//
// Ethan: "on the main challenge card for desktop, I would make the leaderboard
// stand out more. Currently it seems like it's quite transparent or hidden
// there. I would just make it a bit more clear somehow." He is describing
// `bg-white/[0.14]` over a gradient: fourteen percent of white over orange is
// orange, so the panel had no edge of its own and every row of it was white
// text on the same ground as the paragraph beside it. Nothing said "this is a
// leaderboard" except the word.
//
// A SOLID WHITE SURFACE IS THE ANSWER THE REST OF THE CARD ALREADY USES - the
// countdown tiles on the same card are white, and so is the primary button.
// White on brand is this platform's contrast, and it costs nothing: the panel
// reads as a thing lying ON the card rather than a hole cut in it, the faces
// sit on their own ground, and a prize in grey under a name in black is finally
// legible at the size it is printed.
// THE TOP FIVE PAID PLACES, AND A COUNT OF THE REST (21 Sep 2026). Ethan: "If
// we have space, it should show the top 5 prizes at least there, rather than
// just the top 3. It should show '+5 more prizes' if there are +5 more prizes,
// or not if there isn't."
const BOARD_ROWS = 5
function Leaderboard({ leaders, prizes, className, scoring }) {
  const tr = useT()
  const paid = (Array.isArray(prizes) ? prizes : []).filter((p) => p?.prize && placeNumber(p?.place, null) != null).length
  const depth = Math.max(3, Math.min(BOARD_ROWS, Math.max(paid, leaders?.length || 0)))
  const moreGiven = Math.max(0, paid - depth)
  const rows = Array.from({ length: depth }, (_, i) => i + 1).map((place, i) => ({
    place,
    leader: leaders?.[i] || null,
    prize: prizeForPlace(prizes, place),
  }))
  return (
    <div className={cx('rounded-2xl bg-white p-4 shadow-[0_12px_34px_rgba(0,0,0,0.20)]', className)}>
      <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-brand">
        <Icon name="trophy" className="h-3.5 w-3.5" />
        {tr('Leaderboard')}
      </p>
      <div className="space-y-1">
        {rows.map(({ place, leader, prize }) => (
          <div
            key={place}
            // EVERY ROW ARRIVES, NOT JUST THE PODIUM (22 Sep 2026).
            style={{ animationDelay: `${0.3 + place * 0.07}s` }}
            className={cx(
              'wipe-item flex items-center gap-2.5 rounded-xl px-2 py-1.5',
              // FIRST PLACE IS THE ONE PEOPLE ARE PLAYING FOR, so it carries a
              // tint. Two and three are plain, or the panel is three highlights
              // and no hierarchy.
              place === 1 ? 'bg-brand-tint/70' : '',
            )}
          >
            {/* The same orange ladder as the podium and every leaderboard on
                the platform (lib/podiumTiers), so a place looks like that place
                wherever you meet it. */}
            <span className={cx('w-6 shrink-0 text-[11px] font-bold tabular-nums', rankInk(place))}>
              {ordinalFor(place)}
            </span>
            {leader ? (
              <Avatar src={leader.photo_url} name={leader.name} size="xs" />
            ) : (
              // A DASHED RING, NOT A GREY DISC. An empty place has to read as
              // "nobody has taken this" and not as "somebody whose photo failed
              // to load", and an outline says vacant in a way a fill cannot.
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-gray-300 text-gray-400"
              >
                <Icon name="user" className="h-3.5 w-3.5" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className={cx('block truncate text-sm font-semibold', leader ? 'text-ink' : 'text-gray-400')}>
                {/* A name is theirs and never translated; the empty state
                    is ours. */}
                {leader ? leader.name?.split(' ')[0] : tr('Up for grabs')}
              </span>
              {prize && (
                <span className="block truncate text-[11px] text-smoke">{prize}</span>
              )}
            </span>
            {/* THE SCORE, AND ON A POINTS BOARD THE REACH UNDER IT (3 Sep 2026).

                Ethan: "on the podium as well as the points, it should still show
                the views beside it as well because that's also important."

                This cell used to print `formatViews(leader.views)` whatever the
                challenge was scored on, which on a points challenge is not the
                number the row is ordered by - so the card showed three people in
                an order its own figures did not explain. `score` is what ranks
                (points, or views); `views` is always the reach. */}
            {leader && (
              <span className="shrink-0 text-right">
                <span className="block text-sm font-bold tabular-nums text-ink">
                  {scoring === 'points'
                    ? tr('{n} pts', { n: Number(leader.score || 0).toLocaleString() })
                    : formatViews(leader.score)}
                </span>
                {scoring === 'points' && leader.views > 0 && (
                  <span className="block text-[10px] font-medium tabular-nums text-smoke">
                    {formatViews(leader.views)} {tr('views')}
                  </span>
                )}
              </span>
            )}
          </div>
        ))}
      </div>
      {moreGiven > 0 && (
        <p className="mt-2 border-t border-gray-100 pt-2 text-center text-xs font-semibold text-brand">
          {moreGiven === 1 ? tr('+1 more prize') : tr('+{n} more prizes', { n: moreGiven })}
        </p>
      )}
    </div>
  )
}

export default function LiveChallengeCard({ challenge: c, global: isGlobal, entries, participation, leaders }) {
  const tr = useT()
  const excerpt = briefExcerpt(c.description || '')
  return (
    <div>
      {/* THE ROTATING GLOW, AND AN ARRIVAL ON MOBILE TOO (23 Sep 2026). Ethan:
          "on the challenges page for desktop, I think we can definitely have
          that same rotated glow effect going around the edge of the card...
          it's on a white background, so it needs to stand out, and it can be
          white... for the mobile one, we can add that glow effect around it
          too, and also the animation. Mobile's animation is not clean."
          `global-glow` (not `-mobile`) because this card, unlike the hub's
          "Live now" row, IS the orange ground - a white ring against it is the
          same contrast GlobalChallengeStrip already uses, on both screen
          sizes. `animate-card-wipe` gives the card its own arrival: it used to
          have none, only the leaderboard's rows did, and that panel is
          `hidden` below `lg` - so a phone got the light-sweep sheen and
          nothing else. Pure CSS, both of them, safe on this eagerly-routed
          page. */}
      {/* ORANGE, NOT WHITE (24 Sep 2026). Ethan: "that big global challenge
          card should have the orange glow effect around it because it's on a
          white background." The ring sits OUTSIDE the card, on the page. */}
      <div className="global-glow">
      <GlowRing tone="onLight" />
      <div
        className={cx(
          'challenge-card relative block animate-card-wipe overflow-hidden rounded-card text-white shadow-lift',
          // The global card is physically bigger as well as darker. Half of
          // "this is the important one" is the room it takes up.
          // MUCH TIGHTER ON A PHONE. This card was 44px of padding round a
          // 30px title, a paragraph, a row of prize chips, a hero countdown and
          // two buttons - well over a screen on a 375px display for one
          // challenge. Ethan: "when you click on challenges the current card is
          // super big, can you change the UI of it, make it smaller, simpler,
          // easier to read." The desktop card is untouched.
          isGlobal
            ? 'bg-gradient-to-br from-[#8f2a04] via-brand to-brand-light p-4 sm:p-11'
            : 'bg-gradient-to-br from-brand to-brand-light p-4 sm:p-10',
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
        {/* THE REAL EARTH, TURNING (21 Sep 2026). It replaces a wireframe of
            six ellipses that sat in the top-right corner - exactly where the
            leaderboard goes on a desktop, so most of it was hidden. On a
            desktop it is bigger and stands left of the board, behind the title;
            on a phone it keeps the top-right corner, which Ethan liked there. */}
        {isGlobal && (
          // THE WHOLE EARTH ON A DESKTOP (22 Sep 2026). Ethan: "I wouldn't cut
          // so much of it off on desktop as we have the space to show all of it
          // in the middle." It was 36rem pushed 7rem above a card about 27rem
          // tall, so a third of it was always off the card. From `lg` it is
          // sized to the card's own height and centred in it, between the
          // words and the leaderboard. The phone keeps its corner.
          <SpinningEarth className="absolute -right-20 -top-24 h-[19rem] w-[19rem] opacity-90 sm:-right-10 sm:h-[26rem] sm:w-[26rem] lg:left-[54%] lg:right-auto lg:top-1/2 lg:h-[94%] lg:w-auto lg:-translate-x-1/2 lg:-translate-y-1/2" />
        )}
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
              {/* JUST THE DOT, NO RING (23 Sep 2026) - see `LiveDot` in
                  network/Motion.jsx. */}
              <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-white" />
              {tr('Live now')}
            </span>
            {isGlobal && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-brand">
                <Icon name="globe" className="h-3.5 w-3.5" />
                {tr("Global challenge")}
              </span>
            )}
            {/* THE DATE RANGE IS DESKTOP-ONLY IN THIS ROW (1 Sep 2026).
                Ethan, of the phone card: "everything just seems jumbled and not
                right". At 375px "Live now" + "Global challenge" + "12 Sep -> 30
                Sep" is three unlike things competing for one line, and they
                wrap into a ragged two-and-a-half rows of mixed weights before
                the title has even started. Two pills is a row; a sentence of
                dates is not a pill. It reappears under the title below. */}
            <span className="hidden text-xs text-white/75 sm:inline">
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
                {tr('Every market, every creator. One brief, one leaderboard.')}
              </p>
            )}
            {/* Where the dates went on a phone: their own quiet line, with the
                glyph doing the labelling, under the thing they are about. */}
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-white/75 sm:hidden">
              <Icon name="calendar" className="h-3.5 w-3.5 shrink-0" />
              {formatDate(c.start_date)} → {formatDate(c.end_date)}
            </p>
            {/* The blurb is desktop-only. On a phone the whole card is a link
                to the brief, which is the same words with room to read them. */}
            {/* THE FIRST PARAGRAPH, AS WORDS (21 Sep 2026). This printed the
                raw brief - "#" for every heading and "**" round every bold run -
                and the whole of it, clamped. Now it is the opening paragraph
                with the marks gone, and the brief itself is one tap away. */}
            {excerpt.text && (
              <p className="mt-3 hidden max-w-2xl leading-relaxed text-white/90 line-clamp-3 sm:block">
                {/* No "Read all" (22 Sep 2026): the whole card opens the brief. */}
                {excerpt.text}
              </p>
            )}
          </Link>

          <Leaderboard
            leaders={leaders}
            prizes={c.prize_structure}
            scoring={c.scoring}
            className="hidden lg:col-start-2 lg:row-start-1 lg:row-end-3 lg:block lg:self-start"
          />

          <div className="mt-4 sm:mt-8 lg:col-start-1 lg:row-start-3 lg:mt-7 lg:self-end">
            {/* THE PHONE CARD LOST ITS DIVIDER AND ITS ENTRY COUNT (2 Sep 2026).

                Ethan: "the '0 entries so far' is really squeezed in on the
                right and it doesn't make sense - you could remove it
                altogether, it's not necessary. Also remove the line that goes
                through the middle, and make it slightly more compact."

                The count shared a baseline with "Closes in" at 11px, so on a
                375px screen it was a number crushed against the right edge
                answering a question nobody had asked yet - and on a brief that
                has just opened the honest answer is "0", which is the least
                useful thing that corner could hold. It survives on desktop
                under the buttons, where there is room for it to be a sentence.

                The rule above it was separating the clock from the title on a
                card that already separates them with space. */}
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/75 sm:mb-3 sm:text-xs">{tr('Closes in')}</p>
            {/* The hero clock is four big tiles. On a phone that is most of
                what is left of the card, so it gets the compact row instead
                and the card gets its height back. */}
            <span className="hidden sm:block"><CountdownTimer endDate={c.end_date} hero /></span>
            <span className="block sm:hidden"><CountdownTimer endDate={c.end_date} compact onDark /></span>
          </div>

          <div className="mt-3.5 flex flex-col gap-2.5 sm:mt-7 lg:col-start-2 lg:row-start-3 lg:mt-7 lg:items-end lg:self-end">
            {/* ONE BUTTON ON A PHONE, and it is the one you came for. "Read
                the brief" is what the rest of the card already does. */}
            {/* THE TWO BUTTONS ARE ONE WIDTH (22 Sep 2026). Ethan: "I want them
                to be the same length, currently read your brief is shorter." A
                two-column grid gives both the width of the wider one, and the
                entry count sits centred under the pair. */}
            <div className="grid gap-3 sm:grid-cols-2 lg:w-full lg:grid-cols-1">
              {/* ONE SIZE, NO ARROW (21 Sep 2026). The outline button had a
                  border the solid one did not, so it stood 2px taller, and an
                  arrow its twin lacked. Both carry a 1px border now. */}
              <Link to={`/challenges/${c.id}`} className="btn hidden justify-center whitespace-nowrap border border-white/50 text-white hover:bg-white/10 sm:inline-flex">
                {tr('Read the brief')}
              </Link>
              <Link to={`/challenges/${c.id}?submit=1`} className="btn w-full justify-center whitespace-nowrap border border-white bg-white !text-brand hover:bg-white/90">
                {tr('Submit your video')}
              </Link>
            </div>
            <p className="hidden text-center text-[13px] text-white/80 sm:block sm:text-sm lg:w-full">
              {entries === 1 ? tr('1 entry so far') : tr('{n} entries so far', { n: entries })}
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
