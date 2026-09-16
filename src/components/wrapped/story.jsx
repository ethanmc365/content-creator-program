import { Card, Eyebrow, Hero, Line, Facts, Chips, Standing, formatViews, formatMoney, flagEmoji } from './cards'
import Icon from '../Icon'


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

/** Something human to compare a distance to. */
function distanceLine(t) {
  if (t.timesRoundEarth >= 1) {
    const n = t.timesRoundEarth
    return `That is ${n >= 2 ? `${n.toFixed(1)} times` : 'once'} around the world.`
  }
  if (t.londonSydneys >= 0.8) return `Near enough London to Sydney${t.londonSydneys >= 1.6 ? ' and most of the way back' : ''}.`
  if (t.distance >= 2000) return `About ${Math.round(t.distance / 344)} laps of the M25, if you insist on driving.`
  return 'Every one of them logged, down to the aircraft.'
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
        <Eyebrow palette="ember">{year} · Your year in review</Eyebrow>
        <div className="flex flex-1 flex-col justify-center gap-5 py-6">
          {me?.photo
            ? <img src={me.photo} alt="" className="h-24 w-24 rounded-full object-cover ring-4 ring-white/40" />
            : (
              <span className="flex h-24 w-24 items-center justify-center rounded-full bg-white/20 text-3xl font-extrabold">
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
            <Eyebrow palette="mint">The map got busier</Eyebrow>
            <div className="flex flex-1 flex-col justify-center gap-4">
              <Hero value={travel.countries} unit={travel.countries === 1 ? 'country' : 'countries'} palette="mint" />
              <div className="flex flex-wrap gap-1.5 text-3xl leading-none">
                {travel.countryList.slice(0, 18).map((c) => (
                  <span key={c} title={c}>{flagEmoji(c) || '🏳️'}</span>
                ))}
              </div>
              {travel.longest && (
                <Line palette="mint">
                  Your longest hop was {travel.longest.from.city} to {travel.longest.to.city},{' '}
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
    push({
      key: 'collab', palette: 'sand', hold: 4000,
      render: () => (
        <>
          <Eyebrow palette="sand">You put it on the board</Eyebrow>
          <div className="flex flex-1 flex-col justify-center gap-4">
            <Hero value={travel.collabTrips} unit={travel.collabTrips === 1 ? 'trip shared' : 'trips shared'} palette="sand" />
            <Line palette="sand">
              You told the community where you were going, so somebody could come with you.
            </Line>
            {travel.collabCities.length > 0 && <Chips palette="sand" items={travel.collabCities.slice(0, 8)} />}
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

    if (content.views > 0) {
      push({
        key: 'views', palette: 'ember', hold: 4600,
        render: () => (
          <>
            <Eyebrow palette="ember">And people watched</Eyebrow>
            <div className="flex flex-1 flex-col justify-center gap-4">
              <Hero value={nf(content.views)} unit="views" palette="ember" />
              <Line palette="ember">
                {content.views >= 90_000
                  ? `That is Wembley filled ${Math.max(1, Math.round(content.views / 90_000))} times over.`
                  : `That is a town the size of ${content.views >= 10_000 ? 'Salisbury' : 'a village'} watching you.`}
              </Line>
              <Standing standing={ranks.views} what="of the whole community" palette="ember" />
            </div>
            {content.best && (
              <div className="flex items-center gap-3 rounded-2xl bg-white/15 p-3">
                {content.best.thumbnail && (
                  <img src={content.best.thumbnail} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                )}
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold uppercase tracking-widest opacity-75">Your biggest</span>
                  <span className="block truncate text-sm font-bold">
                    {formatViews(content.best.views)} views
                    {content.best.challenge ? ` · ${content.best.challenge}` : ''}
                  </span>
                </span>
              </div>
            )}
          </>
        ),
      })
    }

    if (content.wins > 0 || content.cash > 0 || content.vouchers > 0) {
      push({
        key: 'prizes', palette: 'sand', hold: 4200,
        render: () => (
          <>
            <Eyebrow palette="sand">It paid off</Eyebrow>
            <div className="flex flex-1 flex-col justify-center gap-4">
              <Hero
                value={formatMoney(content.cash + content.vouchers, content.currency)}
                unit="won"
                palette="sand"
              />
              <Line palette="sand">
                {content.wins > 0
                  ? `${content.wins} ${content.wins === 1 ? 'first place' : 'first places'}${content.podiums > content.wins ? ` and ${content.podiums - content.wins} more on the podium` : ''}.`
                  : 'Prizes, vouchers and the odd bonus.'}
              </Line>
            </div>
            <Facts palette="sand" items={[
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
              {community.connections > 0
                ? `And ${community.connections} ${community.connections === 1 ? 'creator' : 'creators'} you had never met became connections.`
                : 'Posted into the rooms, where the community actually happens.'}
            </Line>
            <Standing standing={ranks.messages} what="for turning up" palette="dusk" />
          </div>
          <Facts palette="dusk" items={[
            community.connections > 0 ? { label: 'Connections', value: community.connections } : null,
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
              <div className="flex flex-col gap-2">
                {community.milestones.slice(0, 5).map((m) => (
                  <span key={m.title} className="flex items-center gap-2.5 rounded-2xl bg-white/15 px-3 py-2 text-sm font-bold">
                    <Icon name={m.icon || 'star'} className="h-4 w-4 shrink-0" />
                    {m.title}
                  </span>
                ))}
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
      key: 'month', palette: 'sand', hold: 3800,
      render: () => (
        <>
          <Eyebrow palette="sand">Your month</Eyebrow>
          <div className="flex flex-1 flex-col justify-center gap-4">
            <Hero value={busiest.name} palette="sand" />
            <Line palette="sand">
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
export function ShareCard({ data, className = '', style }) {
  const { me, year, travel, content, community, games, ranks } = data
  const stats = [
    content.views > 0 && { label: 'Views', value: formatViews(content.views) },
    travel.distance > 0 && { label: 'Km flown', value: nf(travel.distance) },
    travel.countries > 0 && { label: 'Countries', value: travel.countries },
    content.videos > 0 && { label: 'Videos', value: content.videos },
    games.played > 0 && { label: 'Puzzles', value: nf(games.played) },
    community.connections > 0 && { label: 'Connections', value: community.connections },
  ].filter(Boolean).slice(0, 6)

  const badge = [
    ranks.views?.top && `Top ${ranks.views.percentile}% for views`,
    ranks.distance?.top && `Top ${ranks.distance.percentile}% for distance`,
    ranks.games?.top && `Top ${ranks.games.percentile}% for puzzles`,
  ].filter(Boolean)[0]

  return (
    <Card palette="ember" footer={false} className={className} bodyClassName="justify-between" style={style}>
      <div className="flex items-center gap-3.5">
        {me?.photo
          ? <img src={me.photo} alt="" className="h-14 w-14 rounded-full object-cover ring-2 ring-white/50" />
          : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-xl font-extrabold">
              {(me?.name || '?').slice(0, 1)}
            </span>
          )}
        <span className="min-w-0">
          <span className="block truncate text-lg font-extrabold leading-tight">{me?.name}</span>
          {/* TIGHT TRACKING AND A SHORT LABEL, BECAUSE THIS LINE IS
              PHOTOGRAPHED. The embedded TTF `domSnapshot` draws with is a
              fraction wider than the woff2 the browser renders, so a line that
              exactly fits on screen wraps in the picture - which is what "2026
              IN REVIEW" did, into three ragged lines beside the avatar. There
              is room for the market and the year and nothing else. */}
          <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.1em] opacity-80">
            {me?.market ? `${me.market} · ` : ''}{year}
          </span>
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

      <div className="flex flex-col gap-3.5">
        {badge && (
          <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-white/20 px-3 py-1.5 text-xs font-bold">
            <Icon name="trophy" className="h-3.5 w-3.5" />
            {badge}
          </span>
        )}
        <span className="flex items-center justify-between border-t border-white/25 pt-3.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.18em] opacity-90">
            <Icon name="plane-tryp" className="h-4 w-4" />
            Tryp.com
          </span>
          <span className="text-[11px] font-semibold opacity-75">Creator Community</span>
        </span>
      </div>
    </Card>
  )
}
