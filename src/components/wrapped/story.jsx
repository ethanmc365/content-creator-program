import { Card, Eyebrow, Hero, Line, Facts, Chips, Standing, formatViews, formatMoney, flagEmoji } from './cards'
import Icon from '../Icon'
import Flame from '../games/Flame'
import { cx } from '../../lib/utils'


// EVERY SCREEN OF THE RECAP, IN ORDER, AS DATA.
//
// A card is `{ key, palette, render }` and the runner knows nothing about any
// of them - which is what makes "drop the cards with nothing behind them" one
// line rather than fourteen conditionals inside a component. Somebody who joined
// in August and has flown nowhere gets a shorter, TRUE recap instead of a
// longer one with four zeros in it.
//
// THE ORDER IS A STORY AND NOT A SCHEMA. It opens on them, travels, then works,
// then belongs, then plays, then widens out to everybody, then hands them
// something to post. Views - the number the programme is actually about - sits
// at the emotional peak, two thirds through, not first.

const nf = (n) => Number(n || 0).toLocaleString('en-GB')
const MODE_NAME = {
  pinpoint: 'Guess the Country', zip: 'Flight Path', languages: 'Guess the language',
  flags: 'Guess the flag', map: 'Find it on the map', airports: 'Airport codes', currencies: 'What do they spend?',
}

/**
 * How big a flag can be when there are N of them on one card. Six fill a card
 * at 48px; forty need 20px to stay on it. Anything past 60 is rare enough that
 * the smallest step can just hold.
 */
/**
 * "2026-03-14" -> "Mar". Undated milestones show nothing.
 *
 * THE NULL CHECK IS NOT BELT AND BRACES. `new Date(null)` is the epoch - a
 * perfectly valid date - so a milestone with no `reached_at` would have been
 * stamped "Jan" rather than left blank, which is a wrong fact rather than a
 * missing one. Caught by the test, not by reading it.
 */
export function monthShort(value) {
  if (value == null || value === '') return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]
}

export function flagScale(n) {
  if (n <= 4) return 'text-5xl'
  if (n <= 10) return 'text-4xl'
  if (n <= 20) return 'text-3xl'
  if (n <= 34) return 'text-2xl'
  if (n <= 60) return 'text-xl'
  return 'text-base'
}

/**
 * A distance, always as a share of the way round the Earth.
 *
 * Ethan: "rather than saying it near enough to London or Sydney or whatever
 * other phrases you add, I would rather you say what percentage of the, around
 * the earth it is or how many times around the earth."
 *
 * It used to pick between three different yardsticks depending on how far you
 * had flown - laps of the world, then London-Sydney, then laps of the M25 -
 * so two creators' recaps were not comparable and the third one was a joke
 * about a motorway. One yardstick, every time.
 *
 * Under a tenth of a percent there is no honest figure to print (it rounds to
 * nothing), so that case keeps a line about the logging instead.
 */
export function distanceLine(t) {
  const laps = t.timesRoundEarth
  if (laps >= 1) {
    // 1.04 laps is "once" - "1.0 times around the world" reads like a rounding
    // error rather than a fact.
    return `That is ${laps >= 1.05 ? `${laps.toFixed(1)} times` : 'once'} around the world.`
  }
  const pct = laps * 100
  if (pct < 0.1) return 'Every one of them logged, down to the aircraft.'
  return `That is ${pct >= 10 ? Math.round(pct) : Number(pct.toFixed(1))}% of the way around the world.`
}

export function buildCards(data) {
  const { me, year, travel, content, community, games, ranks, busiest, everyone } = data
  const cards = []
  const push = (c) => { if (c) cards.push(c) }
  const firstName = (me?.name || 'there').split(' ')[0]
  // NOTHING TO SHOW IS A REAL OUTCOME AND IT NEEDS ITS OWN WORDS.
  // "Here is what you did with it" is a fine opening line for somebody who did
  // something and a small cruelty for somebody who joined in August and has not
  // started yet. The cards below are already dropped when they are empty; this
  // is the sentence that would otherwise have stayed.
  const quiet = !travel.has && !content.has && !community.has && !games.has

  // ------------------------------------------------------------------- open
  push({
    key: 'open', palette: 'ember', hold: 3800,
    render: () => (
      <>
        {/* THE YEAR IS A TITLE, NOT A KICKER. Ethan: "the 2026 year in review,
            that font at the top, I don't really like it." It was the same 11px
            all-caps 0.22em eyebrow every other card uses - fine as a label on
            card nine, wrong as the first thing anybody sees, where it made the
            cover look like a slide with a breadcrumb on it. The year is set big
            and the words sit under it. */}
        {/* ONE LINE, NOT A STACK. Ethan: "the 2026 looks good at the top, but
            the 'year in review' looks like it's fallen below it. Maybe put it
            directly below it or to the right of it and say your year in review
            in one line."

            It was `Your year<br />in review` set beside the year, so two small
            lines hung off a big number and the second one looked like it had
            slipped. The words now run along the baseline as one phrase. */}
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="text-[34px] font-extrabold leading-none tracking-tight sm:text-[40px]">{year}</span>
          <span className="text-[13px] font-bold uppercase leading-none tracking-[0.14em] opacity-80 sm:text-sm">
            Your year in review
          </span>
        </div>
        <div className="flex flex-1 flex-col justify-center gap-5 py-6">
          {/* "The profile picture in the beginning that says hello, their name
              can be improved. So you can make that bigger." */}
          {me?.photo
            ? <img src={me.photo} alt="" className="h-32 w-32 rounded-full object-cover ring-4 ring-white/50 shadow-2xl sm:h-36 sm:w-36" />
            : (
              <span className="flex h-32 w-32 items-center justify-center rounded-full bg-white/20 text-5xl font-extrabold ring-4 ring-white/50 sm:h-36 sm:w-36">
                {(me?.name || '?').slice(0, 1)}
              </span>
            )}
          <div>
            <p className="text-[40px] font-extrabold leading-[1.02] tracking-tight sm:text-5xl">
              Hello,<br />{firstName}.
            </p>
            <Line palette="ember" className="mt-3">
              {quiet
                ? `You joined the Tryp.com creator community${me?.market ? ` in ${me.market}` : ''} this year. Your story here is only just starting.`
                : me?.joinedThisYear
                  ? `You joined the Tryp.com creator community this year${me?.market ? ` in ${me.market}` : ''}. Here is what you did with it.`
                  : `Here is your ${year} with the Tryp.com creator community${me?.market ? `, ${me.market}` : ''}.`}
            </Line>
          </div>
        </div>
      </>
    ),
  })

  // ----------------------------------------------------------------- travel
  if (travel.has && travel.flights > 0) {
    push({
      key: 'distance', palette: 'sky', hold: 4200,
      render: () => (
        <>
          <Eyebrow palette="sky">You went places</Eyebrow>
          <div className="flex flex-1 flex-col justify-center gap-4">
            <Hero value={nf(travel.distance)} unit="km flown" palette="sky" />
            <Line palette="sky">{distanceLine(travel)}</Line>
            <Standing standing={ranks.distance} what="for distance" palette="sky" />
          </div>
          <Facts palette="sky" items={[
            { label: 'Flights', value: travel.flights },
            travel.hours ? { label: 'In the air', value: `${travel.hours}h` } : null,
            travel.airports ? { label: 'Airports', value: travel.airports } : null,
          ]} />
        </>
      ),
    })

    if (travel.countries > 0) {
      push({
        key: 'countries', palette: 'mint', hold: 4200,
        render: () => (
          <>
            <Eyebrow palette="mint">Where you landed</Eyebrow>
            <div className="flex flex-1 flex-col justify-center gap-4">
              <Hero value={travel.countries} unit={travel.countries === 1 ? 'country' : 'countries'} palette="mint" />
              {/* EVERY FLAG, AT A SIZE THAT FITS HOWEVER MANY THERE ARE.
                  Ethan: "ensure you have the capability so that it works no
                  matter how few or how many they have... let's say they travel
                  to 40 countries this year, make sure you have that capability
                  to fit it nicely on the card or even if they just did one."
                  It was a fixed text-3xl and a hard `.slice(0, 18)`, so a
                  well-travelled creator had countries silently deleted from
                  their own recap - the worst way to be wrong on a card whose
                  whole point is the number above it. The size steps down
                  instead, and nothing is dropped. */}
              {/* THEY START AT THE LEFT AND RUN RIGHT. Ethan: "the country flags
                  are always in the middle, but I think they should always start
                  from the left side and then go towards the right, ensuring
                  that you have space for a lot of countries."

                  `justify-center` centres the LAST row as well as the first, so
                  seven flags came out as four over three-in-the-middle - which
                  reads as a decoration rather than as a list. Left-aligned, the
                  block has one straight edge and every row starts under the
                  one above it. The size still steps down with the count, so
                  forty still fit. */}
              <div className={cx('flex flex-wrap justify-start gap-1.5 leading-none', flagScale(travel.countries))}>
                {travel.countryList.map((c) => (
                  <span key={c} title={c}>{flagEmoji(c) || '🏳️'}</span>
                ))}
              </div>
              {travel.longest && (
                <Line palette="mint">
                  Your longest flight was {travel.longest.from.city} to {travel.longest.to.city},{' '}
                  {nf(Math.round(travel.longest.dist))} km.
                </Line>
              )}
            </div>
          </>
        ),
      })
    }

    if (travel.aircraftTypes > 0) {
      push({
        key: 'fleet', palette: 'night', hold: 4200,
        render: () => (
          <>
            <Eyebrow palette="night">Your fleet</Eyebrow>
            <div className="flex flex-1 flex-col justify-center gap-4">
              <Hero value={travel.aircraftTypes} unit={travel.aircraftTypes === 1 ? 'aircraft type' : 'aircraft types'} palette="night" />
              <Chips palette="night" items={travel.fleet.map((a) => `${a.name} ×${a.flights}`)} />
              {travel.topAirline && (
                <Line palette="night">
                  You flew {travel.topAirline.name} most — {travel.topAirline.flights}{' '}
                  {travel.topAirline.flights === 1 ? 'time' : 'times'}.
                </Line>
              )}
            </div>
          </>
        ),
      })
    }
  }

  if (travel.collabTrips > 0) {
    // NOT `sand`. Ethan: "I don't really like the color of this one." Sand is
    // the one near-white palette in the set, so a card about going somewhere
    // came out paler than every card around it and read as a gap in the run.
    // `sky` is the travel palette this recap already uses for the distance
    // card, which also makes the two trip cards belong to each other.
    push({
      key: 'collab', palette: 'sky', hold: 4000,
      render: () => (
        <>
          <Eyebrow palette="sky">You put it on the board</Eyebrow>
          <div className="flex flex-1 flex-col justify-center gap-4">
            <Hero value={travel.collabTrips} unit={travel.collabTrips === 1 ? 'trip shared' : 'trips shared'} palette="sky" />
            <Line palette="sky">
              You told the community where you were going, so somebody could come with you.
            </Line>
            {/* FLAGS, NOT CHIPS. Ethan: "you show Botswana, Zimbabwe, Istanbul,
                etc. I would also show the flags here. I think it adds a nice
                bit of color." A city knows its country in `collab_posts`; the
                card just never asked for it. A place with no country still
                shows - as the city on its own - because dropping somebody's
                trip to tidy a row is the wrong trade. */}
            {travel.collabPlaces?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {travel.collabPlaces.slice(0, 8).map((place) => (
                  <span
                    key={place.city}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/16 px-2.5 py-1 text-xs font-semibold"
                  >
                    {/* `place.iso`, NOT `place.country`. `flagEmoji` maps every
                        letter it is given to a regional-indicator symbol, so
                        "Botswana" comes out as eight boxed letters rather than
                        a flag - which is exactly what this card did the first
                        time it was drawn. See `isoOf` in lib/yearInReview. */}
                    {place.iso && <span className="text-sm leading-none">{flagEmoji(place.iso)}</span>}
                    {place.city}
                  </span>
                ))}
                {travel.collabPlaces.length > 8 && (
                  <span className="self-center text-xs font-semibold opacity-75">
                    and {travel.collabPlaces.length - 8} more
                  </span>
                )}
              </div>
            )}
          </div>
        </>
      ),
    })
  }

  // ---------------------------------------------------------------- content
  if (content.has) {
    push({
      key: 'videos', palette: 'dusk', hold: 4000,
      render: () => (
        <>
          <Eyebrow palette="dusk">You made things</Eyebrow>
          <div className="flex flex-1 flex-col justify-center gap-4">
            <Hero value={content.videos} unit={content.videos === 1 ? 'video' : 'videos'} palette="dusk" />
            <Line palette="dusk">
              Across {content.challenges} {content.challenges === 1 ? 'challenge' : 'challenges'}
              {content.platforms.length ? ` on ${content.platforms.join(' and ')}` : ''}.
            </Line>
            <Standing standing={ranks.videos} what="for videos posted" palette="dusk" />
          </div>
        </>
      ),
    })

    // TWO CARDS, BECAUSE THEY ANSWER TWO DIFFERENT QUESTIONS.
    //
    // Ethan: "I would do one that shows your total views, so cumulative views
    // and what percent in the community you place there. Also on best video
    // showing like top 3%, top 50% for most views for one video and for the
    // cumulative views."
    //
    // "Did you post a lot that did well" and "did you make ONE that went off"
    // are not the same achievement, and a creator with three steady videos and
    // a creator with one that took off can sit in the same total-views
    // percentile. The best video used to be a 56px thumbnail strip stapled to
    // the bottom of the totals card - the smallest thing on a screen about the
    // biggest thing they made.
    if (content.views > 0) {
      push({
        key: 'views', palette: 'ember', hold: 4600,
        render: () => (
          <>
            <Eyebrow palette="ember">And people watched</Eyebrow>
            <div className="flex flex-1 flex-col justify-center gap-4">
              <Hero value={nf(content.views)} unit="views" palette="ember" />
              <Line palette="ember">
                Everything you posted for Tryp.com this year, added up.
              </Line>
              <Standing standing={ranks.views} what="for total views" palette="ember" />
            </div>
            <Facts palette="ember" items={[
              content.videos > 0 ? { label: 'Videos', value: content.videos } : null,
              content.videos > 0 ? { label: 'Average', value: formatViews(Math.round(content.views / content.videos)) } : null,
            ]} />
          </>
        ),
      })
    }

    if (content.best && content.best.views > 0) {
      push({
        key: 'best-video', palette: 'night', hold: 4600,
        render: () => (
          <>
            <Eyebrow palette="night">Your biggest video</Eyebrow>
            {/* THE FRAME IS THE CARD, NOT A STAMP ON IT. Ethan: "for that
                preview card that shows the video thing, I would improve the
                design - it currently looks small and crammed in just above it."

                It was a 112x160 thumbnail floated above the number: the
                smallest thing on a screen about the biggest thing they made.
                It is a proper 9:16 poster now with the count sitting ON it,
                which is the same shape the portfolio work tiles use - one idea,
                two places.

                `object-cover` inside an aspect box, never a bare `<img>`: this
                card is a fixed 9:16 and a thumbnail of unknown shape must be
                cropped INTO its slot rather than allowed to set the height, or
                a landscape frame pushes the standing off the bottom. */}
            <div className="flex min-h-0 flex-1 flex-col justify-center gap-4">
              {content.best.thumbnail ? (
                <div className="relative mx-auto aspect-[9/16] w-full max-w-[168px] shrink overflow-hidden rounded-[20px] shadow-2xl ring-1 ring-white/20">
                  <img src={content.best.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-2/5"
                    style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.78), rgba(0,0,0,0))' }}
                  />
                  <span className="absolute inset-x-3 bottom-3 block">
                    <span className="block text-[26px] font-extrabold leading-none tracking-tight text-white">
                      {nf(content.best.views)}
                    </span>
                    <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-white/75">views</span>
                  </span>
                </div>
              ) : (
                <Hero value={nf(content.best.views)} unit="views" palette="night" />
              )}
              {content.best.challenge && (
                <Line palette="night">Made for {content.best.challenge}.</Line>
              )}
              <Standing standing={ranks.bestVideo} what="for one video" palette="night" />
            </div>
          </>
        ),
      })
    }

    if (content.wins > 0 || content.cash > 0 || content.vouchers > 0) {
      // `mint` RATHER THAN `sand`. Ethan: "maybe also improve the design of that
      // card. I don't really like the light color." Sand is the one pale
      // palette in the set and it had landed on the card about being PAID,
      // which should be the most confident screen in the run rather than the
      // faintest.
      push({
        key: 'prizes', palette: 'mint', hold: 4200,
        render: () => (
          <>
            <Eyebrow palette="mint">It paid off</Eyebrow>
            <div className="flex flex-1 flex-col justify-center gap-4">
              <Hero
                value={formatMoney(content.cash + content.vouchers, content.currency)}
                unit="won"
                palette="mint"
              />
              <Line palette="mint">
                {/* "I wouldn't say 'and the odd bonus', that doesn't really
                    make sense. I would remove that line, maybe add something
                    different there." It was the no-wins fallback, and it
                    shrugged at somebody who had just been paid. */}
                {content.wins > 0
                  ? `${content.wins} ${content.wins === 1 ? 'first place' : 'first places'}${content.podiums > content.wins ? ` and ${content.podiums - content.wins} more on the podium` : ''}.`
                  : content.podiums > 0
                    ? `${content.podiums} ${content.podiums === 1 ? 'finish' : 'finishes'} on the podium.`
                    // "Rather than say 'earned from the briefs you entered this
                    // year', say 'earned from the challenges you entered this
                    // year'." The product says CHALLENGE everywhere a creator
                    // can see it - the nav, the page title, the notifications -
                    // and "brief" is what the team calls them internally.
                    : 'Earned from the challenges you entered this year.'}
              </Line>
            </div>
            <Facts palette="mint" items={[
              content.cash > 0 ? { label: 'Cash', value: formatMoney(content.cash, content.currency) } : null,
              content.vouchers > 0 ? { label: 'Travel credit', value: formatMoney(content.vouchers, content.currency) } : null,
              content.podiums > 0 ? { label: 'Podiums', value: content.podiums } : null,
            ]} />
          </>
        ),
      })
    }
  }

  // -------------------------------------------------------------- community
  if (community.has) {
    push({
      key: 'community', palette: 'dusk', hold: 4200,
      render: () => (
        <>
          <Eyebrow palette="dusk">You were around</Eyebrow>
          <div className="flex flex-1 flex-col justify-center gap-4">
            <Hero value={nf(community.messages)} unit={community.messages === 1 ? 'message' : 'messages'} palette="dusk" />
            <Line palette="dusk">
              {/* The old line was "And 9 creators you had never met became
                  connections", which Ethan wanted rewritten - it read like a
                  stat sheet and it asserted something the data does not know
                  (whether they had met). This says what the number is. */}
              {community.dms > 0 && community.roomMessages > 0
                ? `${nf(community.roomMessages)} in the rooms and ${nf(community.dms)} in your DMs.`
                : community.dms > 0
                  ? 'Nearly all of it one to one, in your DMs.'
                  : 'Posted into the rooms, where the community happens in public.'}
            </Line>
            <Standing standing={ranks.messages} what="for turning up" palette="dusk" />
          </div>
          <Facts palette="dusk" items={[
            community.connections > 0
              ? { label: community.connections === 1 ? 'New connection' : 'New connections', value: community.connections }
              : null,
            community.reactions > 0 ? { label: 'Reactions given', value: community.reactions } : null,
            community.markets.length ? { label: 'Markets', value: community.markets.length } : null,
          ]} />
        </>
      ),
    })

    if (community.milestones.length > 0) {
      push({
        key: 'milestones', palette: 'mint', hold: 4000,
        render: () => (
          <>
            <Eyebrow palette="mint">You levelled up</Eyebrow>
            <div className="flex flex-1 flex-col justify-center gap-4">
              <Hero value={community.milestones.length} unit={community.milestones.length === 1 ? 'milestone' : 'milestones'} palette="mint" />
              {/* WHAT THE MILESTONE WAS, NOT JUST THAT THERE WAS ONE. Ethan,
                  twice: "I would maybe show some more key details there.
                  Really, it looks quite plain or boring", and then "this UI
                  should be improved, it should show more about what the
                  milestone actually is."

                  A row reading "On a roll · Sep" is a badge with a date on it,
                  and a badge nobody can read the meaning of is decoration. The
                  ladder's own `reward` line is what a milestone actually IS -
                  "€30 Tryp.com voucher", "Tryp.com Senior Creator" - and it
                  was sitting unused in the table.

                  The rows are also drawn as a TIMELINE: a rail down the left
                  with a dot per milestone, oldest at the top. That is the one
                  arrangement that says "this happened over a year" rather than
                  "here are four things", which is the difference the card was
                  missing. Three at full detail rather than five compressed -
                  most creators have one or two, and a card that can hold three
                  properly beats one that lists five badly. */}
              <div className="relative flex flex-col gap-2.5 pl-6">
                <span aria-hidden="true" className="absolute bottom-2 left-[7px] top-2 w-px bg-white/25" />
                {community.milestones.slice(0, 3).map((m) => (
                  <span key={m.title} className="relative block rounded-2xl bg-white/15 px-3.5 py-2.5">
                    <span
                      aria-hidden="true"
                      className="absolute -left-[21px] top-4 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white/90"
                    >
                      <Icon name={m.icon || 'star'} className="h-2.5 w-2.5 text-[#0d6b57]" />
                    </span>
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-extrabold">{m.title}</span>
                      {m.reached_at && (
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] opacity-70">
                          {monthShort(m.reached_at)}
                        </span>
                      )}
                    </span>
                    {m.reward && (
                      <span className="mt-0.5 block truncate text-[12px] font-medium opacity-80">{m.reward}</span>
                    )}
                  </span>
                ))}
                {community.milestones.length > 3 && (
                  <span className="text-[12px] font-semibold opacity-70">
                    and {community.milestones.length - 3} more
                  </span>
                )}
              </div>
            </div>
          </>
        ),
      })
    }
  }

  // ------------------------------------------------------------------ games
  if (games.has) {
    push({
      key: 'games', palette: 'night', hold: 4200,
      render: () => (
        <>
          <Eyebrow palette="night">Every morning, a puzzle</Eyebrow>
          <div className="flex flex-1 flex-col justify-center gap-4">
            {/* THE STREAK GETS THE FLAME. Ethan: "showing the streak. I would
                maybe show the streak icon on this card as well, I think it
                could be nice." It was a number in the small facts row at the
                bottom; a run of days without missing one is the thing a player
                is actually proud of, so it goes above the fold with the mark
                the rest of the platform uses for it. */}
            {games.bestStreak > 1 && (
              <span className="inline-flex items-center gap-2 self-start rounded-full bg-white/15 px-3.5 py-2 text-base font-extrabold">
                {/* The platform's OWN streak mark, not a generic icon. `Flame`
                    is the four-temperature fire that sits next to "36 days in a
                    row" on the games hub - using anything else here would make
                    the recap look like it was built by somebody who had not
                    seen the rest of the product. */}
                <Flame className="h-5 w-5" sparks={games.bestStreak >= 7} />
                {games.bestStreak} day streak
              </span>
            )}
            <Hero value={nf(games.played)} unit={games.played === 1 ? 'round played' : 'rounds played'} palette="night" />
            <Line palette="night">
              {games.bestStreak > 1
                ? `Your best run was ${games.bestStreak} days without missing one.`
                : 'One a day keeps the streak alive.'}
              {games.favourite ? ` ${MODE_NAME[games.favourite.mode] || games.favourite.mode} was your favourite.` : ''}
            </Line>
            <Standing standing={ranks.games} what="of all the players" palette="night" />
          </div>
          <Facts palette="night" items={[
            { label: 'Days played', value: games.days },
            games.bestStreak > 0 ? { label: 'Best streak', value: `${games.bestStreak}d` } : null,
            games.modes.length > 1 ? { label: 'Games tried', value: games.modes.length } : null,
          ]} />
        </>
      ),
    })
  }

  // ------------------------------------------------------------ your month
  if (busiest) {
    push({
      // `ember`, the brand palette, and the third move away from `sand`. Ethan:
      // "this color card, I just don't really love it. But I like that you're
      // showing the best month." The month is a headline WORD rather than a
      // figure, and a word set at 92px wants the strongest ground in the set
      // behind it, not the palest.
      key: 'month', palette: 'ember', hold: 3800,
      render: () => (
        <>
          <Eyebrow palette="ember">Your month</Eyebrow>
          <div className="flex flex-1 flex-col justify-center gap-4">
            <Hero value={busiest.name} palette="ember" />
            <Line palette="ember">
              More flights, more posts and more of you than any other month of {year}.
            </Line>
          </div>
        </>
      ),
    })
  }

  // A YEAR WITH NOTHING IN IT STILL GETS A MIDDLE, and it is the only card in
  // the whole run that is about what has not happened yet. Written as an
  // invitation rather than an absence: there is no version of "you posted
  // nothing" that anybody wants to be sent.
  if (quiet) {
    push({
      key: 'ahead', palette: 'sky', hold: 4600,
      render: () => (
        <>
          <Eyebrow palette="sky">What is waiting</Eyebrow>
          <div className="flex flex-1 flex-col justify-center gap-4">
            <Hero value={everyone.creators} unit="creators to meet" palette="sky" />
            <Line palette="sky">
              Every challenge, every flight in the log and every puzzle from here is in next
              year's. That page is blank and it is yours.
            </Line>
          </div>
        </>
      ),
    })
  }

  // ------------------------------------------------------------- everybody
  push({
    key: 'everyone', palette: 'mint', hold: 5000,
    render: () => (
      <>
        <Eyebrow palette="mint">And you were not alone</Eyebrow>
        <div className="flex flex-1 flex-col justify-center gap-5">
          <Hero value={formatViews(everyone.views)} unit="views, together" palette="mint" />
          <Line palette="mint">
            {everyone.creators} creators across {everyone.markets} markets, all posting in the same year.
          </Line>
          <Facts palette="mint" items={[
            { label: 'Videos', value: nf(everyone.videos) },
            everyone.flights ? { label: 'Flights logged', value: nf(everyone.flights) } : null,
            everyone.countries ? { label: 'Countries', value: everyone.countries } : null,
            everyone.prize ? { label: 'In prizes', value: formatMoney(everyone.prize, everyone.currency) } : null,
          ]} />
        </div>
      </>
    ),
  })

  return cards
}

/**
 * THE LAST CARD, AND THE ONLY ONE ANYBODY ELSE WILL EVER SEE.
 *
 * Kept out of `buildCards` because it is not a story beat - it is the artefact.
 * It is rendered twice: once at the end of the run, and once off-screen at
 * three times the size for `snapshotNode` to photograph. Same component both
 * times, so what somebody posts is exactly what they were looking at.
 */
export function ShareCard({ data, className = '', style, flush = false }) {
  const { me, year, travel, content, community, games } = data
  const stats = [
    content.views > 0 && { label: 'Views', value: formatViews(content.views) },
    travel.distance > 0 && { label: 'Km flown', value: nf(travel.distance) },
    travel.countries > 0 && { label: 'Countries', value: travel.countries },
    content.videos > 0 && { label: 'Videos', value: content.videos },
    games.played > 0 && { label: 'Puzzles', value: nf(games.played) },
    community.connections > 0 && { label: 'Connections', value: community.connections },
  ].filter(Boolean).slice(0, 6)

  // THE STANDING BADGE IS GONE FROM THIS CARD.
  //
  // Ethan: "rather than saying top 3% for puzzles, I don't think you should
  // show that here."
  //
  // He is right and it took two passes to see why. The badge was picked as the
  // person's STRONGEST standing, which sounds like the right rule and produces
  // the wrong sentence: the strongest standing for most creators is the puzzle
  // one, because the puzzles are the easiest thing in the product to be good
  // at. So the card built to be posted - the one that is supposed to say "I am
  // a Tryp.com creator and here is my year" - ended on a line about a daily
  // word game. The percentiles still appear on the cards they belong to, where
  // they are in context. This card carries the year's own numbers and the
  // programme's name, and nothing else has to compete with them.

  return (
    <Card palette="ember" footer={false} flush={flush} className={className} bodyClassName="justify-between" style={style}>
      {/* THE PERSON IS THE HEADLINE. Ethan: "for that final card, you can
          improve it. So perhaps make the profile picture and their name bigger
          and the country they're in."

          It was a 56px avatar and an 18px name in a header strip - the same
          weight as a row in a list - on the one card in the whole run that
          somebody actually posts. The photo is 80px now, the name is set at
          the size it deserves, and the place goes UNDER it with a pin rather
          than being folded into a tracking-heavy label beside the year.

          THE LINE IS STILL SHORT, BECAUSE THIS IS PHOTOGRAPHED. The embedded
          TTF `domSnapshot` draws with is a fraction wider than the woff2 the
          browser renders, so a line that exactly fits on screen wraps in the
          picture - which is what "2026 IN REVIEW" did, into three ragged lines
          beside the avatar. `truncate` on both, and the year has its own
          corner. */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4">
          {me?.photo
            ? <img src={me.photo} alt="" className="h-20 w-20 shrink-0 rounded-full object-cover ring-[3px] ring-white/55" />
            : (
              <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-white/20 text-3xl font-extrabold ring-[3px] ring-white/55">
                {(me?.name || '?').slice(0, 1)}
              </span>
            )}
          <span className="min-w-0">
            <span className="block truncate text-[26px] font-extrabold leading-[1.05] tracking-tight">{me?.name}</span>
            {(me?.country || me?.city || me?.market) && (
              <span className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold opacity-85">
                <Icon name="pin" className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{me.country || me.city || me.market}</span>
              </span>
            )}
          </span>
        </div>
        <span className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-[12px] font-extrabold tabular-nums">
          {year}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-6 py-4">
        {stats.map((s) => (
          <span key={s.label} className="min-w-0">
            <span className="block text-[30px] font-extrabold leading-none tracking-tight">{s.value}</span>
            <span className="mt-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] opacity-80">{s.label}</span>
          </span>
        ))}
      </div>

      {/* THE REAL LOGO, AND ONE SENTENCE UNDER IT. Ethan: "I think you can say
          Tryp.com content creator community at the bottom, and have the actual
          Tryp.com logo on this final page somewhere."

          It was the drawn plane mark and two half-sentences at opposite ends
          of a rule - "Tryp.com" on the left, "Creator Community" on the right -
          which is the programme's name torn in half by a layout. One lockup,
          one line, left aligned.

          THE ASSET HAS A WHITE GROUND BAKED IN, so on this orange card it sits
          on a white plate rather than being inverted - the same treatment the
          certificate uses on a dark paper, for the same reason. `crossOrigin`
          because `domSnapshot` has to read its pixels back out. */}
      <div className="flex items-center gap-3 border-t border-white/25 pt-4">
        <img
          src="/brand/tryp-logo.png"
          alt="Tryp.com"
          crossOrigin="anonymous"
          className="h-8 w-auto shrink-0 rounded-md bg-white p-1"
        />
        <span className="min-w-0 text-[12px] font-bold leading-tight">
          Tryp.com Content<br />Creator Community
        </span>
      </div>
    </Card>
  )
}
