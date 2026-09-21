import { Card, Eyebrow, Hero, Line, Facts, Chips, Standing, formatViews, flagEmoji, roughMoney, wholeMoney } from './cards'
import { useId } from 'react'
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

// ONE STEP BIGGER THAN IT WAS (21 Sep 2026). Ethan: "it looks a little bit
// small, so I would make it a bit bigger." A handful of flags now fill the
// card at 60px and forty still fit at 24px.
export function flagScale(n) {
  if (n <= 3) return 'text-6xl'
  if (n <= 6) return 'text-5xl'
  if (n <= 12) return 'text-4xl'
  if (n <= 22) return 'text-3xl'
  if (n <= 40) return 'text-2xl'
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
        {/* CENTRED ON THE YEAR, NOT SAT ON ITS BASELINE (21 Sep 2026). Ethan:
            "the your year in review should be aligned with the center of the
            2026 rather than at the bottom of it." A 13px line on a 40px
            number's baseline hangs off the bottom of it; `items-center` puts
            the phrase on the number's middle, where it reads as one title. */}
        <div data-anim="rise" className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[34px] font-extrabold leading-none tracking-tight sm:text-[40px]">{year}</span>
          <span className="text-[13px] font-bold uppercase leading-none tracking-[0.14em] opacity-80 sm:text-sm">
            Your year in review
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-4 py-4">
          {/* "The profile picture in the beginning that says hello, their name
              can be improved. So you can make that bigger." */}
          {me?.photo
            // Sized off the SCREEN, not a step: a 320px phone gives a 288px
            // card, and a 128px photo plus the quiet-year sentence ran into
            // the footer there.
            ? <img data-anim="pop" src={me.photo} alt="" className="h-[clamp(88px,30vw,144px)] w-[clamp(88px,30vw,144px)] rounded-full object-cover ring-4 ring-white/50 shadow-2xl" />
            : (
              <span data-anim="pop" className="flex h-[clamp(88px,30vw,144px)] w-[clamp(88px,30vw,144px)] items-center justify-center rounded-full bg-white/20 text-5xl font-extrabold ring-4 ring-white/50">
                {(me?.name || '?').slice(0, 1)}
              </span>
            )}
          <div>
            {/* A long first name steps down rather than running off the card:
                "Maximiliana" at 48px is wider than a 300px card. */}
            <p
              data-anim="rise"
              className={cx(
                'break-words font-extrabold leading-[1.02] tracking-tight',
                firstName.length > 9 ? 'text-[clamp(26px,8vw,36px)]' : firstName.length > 6 ? 'text-[clamp(30px,9.5vw,42px)]' : 'text-[clamp(32px,11vw,48px)]',
              )}
            >
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
              <div data-anim="rise" className={cx('flex flex-wrap justify-start gap-2 leading-none', flagScale(travel.countries))}>
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
              /* BIGGER (21 Sep 2026). Ethan: "it shows the flag and the country
                 or the city they've been to, but it looks a little bit small."
                 A 12px chip with a 14px flag was a caption; these are the
                 places themselves. */
              /* AND IT STEPS DOWN WITH THE COUNT, like the flags do: four big
                 chips, or up to six smaller ones, then "and N more" - eleven
                 at full size ran off the bottom of the card. */
              <div data-anim="rise" className={cx('flex flex-wrap', travel.collabPlaces.length > 4 ? 'gap-1.5' : 'gap-2')}>
                {travel.collabPlaces.slice(0, travel.collabPlaces.length > 4 ? 6 : 4).map((place) => (
                  <span
                    key={place.city}
                    className={cx(
                      'inline-flex items-center rounded-full bg-white/20 font-bold ring-1 ring-white/25',
                      travel.collabPlaces.length > 4
                        ? 'gap-1.5 py-1.5 pl-2 pr-3 text-[13px] [&>span:first-child]:text-[20px]'
                        : 'gap-2.5 py-2 pl-2.5 pr-4 text-[15px]',
                    )}
                  >
                    {/* `place.iso`, NOT `place.country`. `flagEmoji` maps every
                        letter it is given to a regional-indicator symbol, so
                        "Botswana" comes out as eight boxed letters rather than
                        a flag - which is exactly what this card did the first
                        time it was drawn. See `isoOf` in lib/yearInReview. */}
                    {place.iso && <span className="text-[28px] leading-none">{flagEmoji(place.iso)}</span>}
                    {place.city}
                  </span>
                ))}
                {travel.collabPlaces.length > (travel.collabPlaces.length > 4 ? 6 : 4) && (
                  <span className="self-center text-sm font-semibold opacity-80">
                    and {travel.collabPlaces.length - (travel.collabPlaces.length > 4 ? 6 : 4)} more
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
            {/* BIGGER, AND IT SAYS WHAT IT WAS FOR ON THE FRAME (21 Sep 2026).
                Ethan: "improve this preview of the video even more, make it
                even bigger, take up more space. Show the views. You can even
                put made for Tryp.com Creative Challenge on top of it."
                The poster is sized off the card's HEIGHT now (h-[64%] with a
                9:16 aspect), so it is as big as the card allows on every phone
                rather than a fixed 168px, and the challenge rides on the frame
                as a label instead of a sentence underneath it. */}
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
              {content.best.thumbnail ? (
                <div data-anim="zoom" className="relative aspect-[9/16] h-[88%] max-h-[500px] max-w-full shrink-0 overflow-hidden rounded-[22px] shadow-2xl ring-2 ring-white/25">
                  <img src={content.best.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0 h-1/3"
                    style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), rgba(0,0,0,0))' }}
                  />
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-2/5"
                    style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.82), rgba(0,0,0,0))' }}
                  />
                  {content.best.challenge && (
                    <span className="absolute inset-x-3 top-3 block">
                      <span className="block text-[9px] font-bold uppercase tracking-[0.18em] text-white/75">Made for</span>
                      <span className="mt-0.5 block text-[13px] font-extrabold leading-tight text-white">{content.best.challenge}</span>
                    </span>
                  )}
                  <span className="absolute inset-x-3 bottom-3 block">
                    <span className="block text-[34px] font-extrabold leading-none tracking-tight text-white">
                      {nf(content.best.views)}
                    </span>
                    <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-white/80">views</span>
                  </span>
                </div>
              ) : (
                <div className="w-full">
                  <Hero value={nf(content.best.views)} unit="views" palette="night" />
                  {content.best.challenge && <Line palette="night" className="mt-3">Made for {content.best.challenge}.</Line>}
                </div>
              )}
              <span className="self-center"><Standing standing={ranks.bestVideo} what="for one video" palette="night" /></span>
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
                value={wholeMoney(content.cash + content.vouchers, content.currency)}
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
              content.cash > 0 ? { label: 'Cash', value: wholeMoney(content.cash, content.currency) } : null,
              content.vouchers > 0 ? { label: 'Travel credit', value: wholeMoney(content.vouchers, content.currency) } : null,
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
            <div className="flex min-h-0 flex-1 flex-col justify-center gap-4">
              <Hero value={community.milestones.length} unit={community.milestones.length === 1 ? 'milestone' : 'milestones'} palette="mint" />
              <MilestoneRoute
                milestones={community.milestones}
                next={community.nextMilestone}
                me={me}
              />
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
      key: 'month', palette: 'mint', hold: 3800,
      render: () => (
        <>
          <Eyebrow palette="mint">Your month</Eyebrow>
          <div className="flex flex-1 flex-col justify-center gap-4">
            <Hero value={busiest.name} palette="mint" />
            <Line palette="mint">
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
    // TRYP ORANGE (21 Sep 2026). Ethan: "for this views together one, I would
    // put it on a Tryp.com orange one and maybe put the best month one as the
    // green card." The whole community's number is the brand's number.
    key: 'everyone', palette: 'ember', hold: 5000,
    render: () => (
      <>
        <Eyebrow palette="ember">And you were not alone</Eyebrow>
        <div className="flex flex-1 flex-col justify-center gap-5">
          <Hero value={formatViews(everyone.views)} unit="views, together" palette="ember" />
          <Line palette="ember">
            {everyone.creators} creators across {everyone.markets} markets, all posting in the same year.
          </Line>
          <Facts palette="ember" items={[
            { label: 'Videos', value: nf(everyone.videos) },
            everyone.flights ? { label: 'Flights logged', value: nf(everyone.flights) } : null,
            everyone.countries ? { label: 'Countries', value: everyone.countries } : null,
            // "Just give it roughly to the 1,000": €8,845 is "€8,000+".
            everyone.prize ? { label: 'In prizes', value: roughMoney(everyone.prize, everyone.currency) } : null,
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

  // THE LAST PAGE ARRIVES LIKE THE OTHERS (21 Sep 2026). Ethan: "add in
  // animations for the last page. There seem to be no animations there." The
  // photo pops, the name and place rise, the numbers land one by one and the
  // whole numbers count up. The off-screen copy that gets photographed is never
  // animated (see YearInReview), so a saved card is always whole.
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
      {/* THE NAME GETS THE WHOLE WIDTH (21 Sep 2026). Beside an 80px photo
          and the year chip it had about 150px, so "Maximiliana
          Fernández-Oliveira" broke into single letters down the card - and
          the export font, a hair wider than the screen's, made even a short
          name lose its end ("Jacob P..."). Photo and year on one row, the
          person on the next, wrapping by word. */}
      <div>
        <div className="flex items-start justify-between gap-3">
          {me?.photo
            ? <img data-anim="pop" src={me.photo} alt="" className="h-20 w-20 shrink-0 rounded-full object-cover ring-[3px] ring-white/55" />
            : (
              <span data-anim="pop" className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-white/20 text-3xl font-extrabold ring-[3px] ring-white/55">
                {(me?.name || '?').slice(0, 1)}
              </span>
            )}
          <span data-anim="fade" className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-[12px] font-extrabold tabular-nums">
            {year}
          </span>
        </div>
        <p data-anim="rise" className="mt-4 line-clamp-2 break-words text-[26px] font-extrabold leading-[1.05] tracking-tight">{me?.name}</p>
        {(me?.country || me?.city || me?.market) && (
          <p data-anim="rise" className="mt-1.5 flex items-start gap-1.5 text-[13px] font-semibold leading-snug opacity-85">
            <Icon name="pin" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 break-words">{me.country || me.city || me.market}</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-5 py-3">
        {stats.map((s) => (
          <span key={s.label} data-anim="zoom" className="min-w-0">
            <span
              className="block text-[30px] font-extrabold leading-none tracking-tight"
              {...(typeof s.value === 'number' ? { 'data-count': String(s.value) } : {})}
            >
              {s.value}
            </span>
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
      <div data-anim="rise" className="flex items-center gap-3 border-t border-white/25 pt-4">
        {/* NO WHITE PLATE (21 Sep 2026). Ethan: "you have the logo at the
            bottom, but there's like a white background around it. I wouldn't
            have that." The plate was there because the only logo file had a
            white square baked in; `tryp-wordmark-white.svg` is the same
            lettering cut out of that square and set in white, so it sits
            straight on the orange. */}
        <img
          src="/brand/tryp-wordmark-white.svg"
          alt="Tryp.com"
          crossOrigin="anonymous"
          className="h-7 w-auto shrink-0"
        />
        <span className="min-w-0 text-[12px] font-bold leading-tight">
          Tryp.com Content<br />Creator Community
        </span>
      </div>
    </Card>
  )
}

/**
 * THE MILESTONE CARD AS A ROUTE, THE SAME DRAWING AS THE MILESTONES PAGE.
 *
 * Ethan: "it shows a line with a little circle and heart on it, maybe show an
 * airplane there instead or their profile picture, because currently it's
 * misaligned... maybe show how it actually looks like the way we have that
 * design, it's like a curve, so they can see where they actually are on the
 * milestone track."
 *
 * The old card was a rail with an icon dot per row, and the dot was placed by
 * a negative left margin that only lined up at one font size. This is the
 * MilestonePath idea in miniature: stops alternate left and right, a curve that
 * leaves and enters every stop vertically joins them, the part they have flown
 * is solid and the rest is dashed, and the creator's OWN PHOTO sits on the last
 * stop they reached - the page already taught them that the face is "you".
 *
 * Everything is positioned in one coordinate space (W x H units) and placed in
 * percentages, so the SVG line and the HTML stops cannot drift apart at any
 * card width - which is exactly how the old one came to be misaligned.
 */
const ROUTE_W = 300
const ROUTE_ROW = 112
const ROUTE_PAD = 34
const ROUTE_LEFT = 34
const ROUTE_RIGHT = 266
// Clearance between a stop and its label, in route units. The stop you are AT
// is a 48px photo, not a 28px dot, so it needs more.
const GAP_DOT = 30
const GAP_HERE = 42

export function routeStops(milestones = [], next = null) {
  const done = milestones.slice(-3).map((m) => ({ ...m, done: true }))
  return next ? [...done, { ...next, done: false }] : done
}

export function MilestoneRoute({ milestones = [], next = null, me }) {
  const maskId = `route-mask-${useId().replace(/:/g, '')}`
  const stops = routeStops(milestones, next)
  if (!stops.length) return null
  const H = ROUTE_PAD * 2 + (stops.length - 1) * ROUTE_ROW
  const pt = (i) => ({ x: i % 2 === 0 ? ROUTE_LEFT : ROUTE_RIGHT, y: ROUTE_PAD + i * ROUTE_ROW })
  const legs = []
  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = pt(i)
    const b = pt(i + 1)
    legs.push(`C ${a.x} ${a.y + ROUTE_ROW * 0.6}, ${b.x} ${b.y - ROUTE_ROW * 0.6}, ${b.x} ${b.y}`)
  }
  const doneCount = stops.filter((s) => s.done).length
  const start = `M ${pt(0).x} ${pt(0).y}`
  const whole = `${start} ${legs.join(' ')}`
  const flown = doneCount > 1 ? `${start} ${legs.slice(0, doneCount - 1).join(' ')}` : null
  const here = doneCount - 1
  const pct = (v, of) => `${(v / of) * 100}%`

  return (
    <div className="relative w-full" style={{ aspectRatio: `${ROUTE_W} / ${H}` }}>
      <svg viewBox={`0 0 ${ROUTE_W} ${H}`} className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        {/* THE LINE STOPS AT EACH STOP'S EDGE (21 Sep 2026). The next stop is
            a hollow dashed ring, so the route used to run straight through its
            middle - Ethan: "the dotted line should stop once it reaches it, not
            actually go through the centre of it." A mask punches a hole the
            size of each stop (a touch bigger than the drawn circle, so there is
            a hair of air) out of both the dashed and the flown line. Units are
            px-ish because the card is ~300px wide: the dot is 28px, the face
            48px. The id is per instance so two recaps on a page do not share. */}
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="-20" y="-20" width={ROUTE_W + 40} height={H + 40}>
            <rect x="-20" y="-20" width={ROUTE_W + 40} height={H + 40} fill="#fff" />
            {stops.map((_, i) => {
              const p = pt(i)
              return <circle key={i} cx={p.x} cy={p.y} r={(i === here ? 24 : 14) + 3} fill="#000" />
            })}
          </mask>
        </defs>
        <g mask={`url(#${maskId})`}>
          <path d={whole} fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2.5" strokeDasharray="2 7" strokeLinecap="round" />
          {flown && (
            <path data-anim="draw" d={flown} pathLength="1" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" />
          )}
        </g>
      </svg>

      {stops.map((m, i) => {
        const p = pt(i)
        const onLeft = i % 2 === 0
        const isHere = i === here
        return (
          <div key={`${m.title}-${i}`}>
            {/* The stop. The one they are at carries their face instead. */}
            {!isHere && (
              <span
                data-anim="pop"
                className={cx(
                  'absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full',
                  m.done ? 'bg-white text-[#0d6b57] shadow-lg' : 'border-2 border-dashed border-white/70 text-white',
                )}
                style={{ left: pct(p.x, ROUTE_W), top: pct(p.y, H) }}
              >
                <Icon name={m.icon || 'star'} className="h-3.5 w-3.5" />
              </span>
            )}
            {isHere && (
              <span
                data-anim="pop"
                className="absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full bg-white/25 shadow-xl ring-[3px] ring-white"
                style={{ left: pct(p.x, ROUTE_W), top: pct(p.y, H) }}
              >
                {me?.photo
                  ? <img src={me.photo} alt="" className="h-full w-full object-cover" />
                  : <span className="flex h-full w-full items-center justify-center text-lg font-extrabold">{(me?.name || '?').slice(0, 1)}</span>}
              </span>
            )}

            {/* The label, on the open side of the stop. */}
            <span
              data-anim="rise"
              className={cx('absolute block -translate-y-1/2', onLeft ? 'text-left' : 'text-right')}
              style={onLeft
                ? { left: pct(ROUTE_LEFT + (isHere ? GAP_HERE : GAP_DOT), ROUTE_W), right: 0, top: pct(p.y, H) }
                : { left: 0, right: pct(ROUTE_W - ROUTE_RIGHT + (isHere ? GAP_HERE : GAP_DOT), ROUTE_W), top: pct(p.y, H) }}
            >
              <span className="block text-[10px] font-bold uppercase tracking-[0.14em] opacity-75">
                {m.done ? (isHere ? `You are here${m.reached_at ? ` · ${monthShort(m.reached_at)}` : ''}` : monthShort(m.reached_at) || 'Reached') : 'Next stop'}
              </span>
              <span className="block truncate text-[15px] font-extrabold leading-tight">{m.title}</span>
              {m.reward && <span className="line-clamp-2 block text-[12px] font-medium leading-snug opacity-80">{m.reward}</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
}
