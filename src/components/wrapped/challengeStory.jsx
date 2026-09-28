import { Card, Eyebrow, Hero, Line, Facts, TrypMark, wholeMoney, roughMoney, formatViews } from './cards'
import Icon from '../Icon'
import SocialMark from '../SocialMark'
import { ordinalFor, podiumTier } from '../../lib/podiumTiers'
import { formatDate } from '../../lib/utils'

// THE END-OF-CHALLENGE RECAP: THE CARDS (24 Sep 2026, rewritten 28 Sep 2026).
//
// The Year in Review's primitives, palettes and runner, told about ONE
// challenge. Every card is dropped when it has nothing true to say.
//
// THE 28 SEP PASS, from Ethan's notes on the Testing Centre preview:
//   - The cover read "Jacob, that was Global Challenge." The challenge is the
//     headline now, and the person is who it is for.
//   - "20 days, 29 creators. Here is how yours went." is a stat strip that
//     counts up, and one line that says what comes next.
//   - "For the top three, have them come up big, one by one ... long enough so
//     you can see it. Then, together." A card each, counting down 3, 2, 1,
//     then the three side by side.
//   - "For the prize pool, it should also include any Tryp.com vouchers."
//   - "It says 'Global Challenge' on one number, which obviously isn't one
//     number." The line under the community card says what the numbers are.
//   - The last card "looks a bit weird": the name broke into letters, the
//     best video was a thumbnail the size of an icon, and the footer was the
//     programme's name in two lines. Rebuilt with the best video as a proper
//     poster beside the numbers, more facts, and the logo on its own.

const nf = (n) => Number(n || 0).toLocaleString('en-GB')
const SOCIAL = { Instagram: 'instagram', TikTok: 'tiktok', YouTube: 'youtube', Facebook: 'facebook' }
const listOf = (xs) => xs.join(', ').replace(/, ([^,]*)$/, ' and $1')

function Poster({ video, rank, size = 'md', anim = 'zoom', delay, fit = 'height' }) {
  const big = size === 'xl' || size === 'lg'
  return (
    <div
      data-anim={anim}
      {...(delay != null ? { 'data-delay': String(delay) } : {})}
      className={`relative aspect-[9/16] shrink-0 overflow-hidden rounded-[20px] shadow-2xl ring-2 ring-white/30 ${fit === 'width' ? 'w-full' : 'h-full'}`}
    >
      {video.thumbnail
        ? <img src={video.thumbnail} alt="" crossOrigin="anonymous" className="absolute inset-0 h-full w-full object-cover" />
        : (
          <span className="absolute inset-0 flex items-center justify-center bg-white/10">
            <Icon name="video" className="h-8 w-8 opacity-70" />
          </span>
        )}
      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/2" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0))' }} />
      {/* A PLACE BADGE, NOT A BARE NUMBER (28 Sep 2026, evening). Ethan: "it
          shows 1 through 3, which looks a bit odd ... use an actual badge
          showing 2nd, 3rd, to make it easier to understand." The ordinal, in
          the podium's own tones: Tryp.com orange, light orange, peach. */}
      {rank != null && (
        <span
          className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded-full font-extrabold shadow-lg ${big ? 'px-2.5 py-1 text-[13px]' : 'px-1.5 py-0.5 text-[10px]'}`}
          style={{ background: podiumTier(rank).disc, color: podiumTier(rank).ink }}
        >
          <Icon name="trophy" className={big ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5'} />
          {ordinalFor(rank)}
        </span>
      )}
      {/* THE PLATFORM, SMALL (28 Sep 2026): "we don't necessarily need it to
          be that big." Its own colours, in the corner. */}
      {video.platform && SOCIAL[video.platform] && (
        <span className={`absolute right-2 top-2 block overflow-hidden rounded-md shadow ${big ? 'h-5 w-5' : 'h-4 w-4'}`}>
          <SocialMark brand={SOCIAL[video.platform]} tile className="h-full w-full" />
        </span>
      )}
      <span className="absolute inset-x-3 bottom-3 block">
        <span className={`block font-extrabold leading-none tracking-tight text-white ${size === 'xl' ? 'text-[34px]' : big ? 'text-[26px]' : 'text-[16px]'}`}>
          {formatViews(video.views)}
        </span>
        <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-[0.14em] text-white/80">views</span>
      </span>
    </div>
  )
}

export function buildChallengeCards(data) {
  const { me, challenge, placing, totals, top, won, wonTotal, community, points, prizes } = data
  const cards = []
  const push = (c) => { if (c) cards.push(c) }
  const firstName = (me?.name || 'there').split(' ')[0]

  // ------------------------------------------------------------------ cover
  push({
    key: 'open', palette: 'ember', hold: 4200,
    render: () => (
      <>
        <Eyebrow palette="ember">Challenge recap</Eyebrow>
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-5 py-4">
          <div className="flex items-center gap-3">
            {me?.photo
              ? <img data-anim="pop" src={me.photo} alt="" crossOrigin="anonymous" className="h-16 w-16 rounded-full object-cover ring-4 ring-white/50 shadow-2xl" />
              : (
                <span data-anim="pop" className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 text-3xl font-extrabold ring-4 ring-white/50">
                  {(me?.name || '?').slice(0, 1)}
                </span>
              )}
            <p data-anim="rise" className="text-lg font-bold leading-tight">
              It&rsquo;s a wrap,<br />{firstName}.
            </p>
          </div>
          <p data-anim="spot" className="break-words text-[clamp(34px,10vw,46px)] font-extrabold leading-[1.0] tracking-tight">
            {challenge.title}
          </p>
          {(challenge.days || community.creators) && (
            <div data-anim="rise" className="flex flex-wrap gap-2">
              {challenge.days && (
                <span className="rounded-full px-3 py-1.5 text-xs font-bold" style={{ background: 'rgba(255,255,255,0.18)' }}>
                  <span data-count={String(challenge.days)}>{challenge.days}</span> days
                </span>
              )}
              <span className="rounded-full px-3 py-1.5 text-xs font-bold" style={{ background: 'rgba(255,255,255,0.18)' }}>
                {nf(community.creators)} creators
              </span>
              <span className="rounded-full px-3 py-1.5 text-xs font-bold" style={{ background: 'rgba(255,255,255,0.18)' }}>
                {nf(community.videos)} videos
              </span>
            </div>
          )}
          <Line palette="ember">Tap through to see your stats.</Line>
        </div>
      </>
    ),
  })

  // ---------------------------------------------------------------- placing
  if (placing) {
    const podium = placing.kind === 'podium'
    push({
      key: 'place', palette: 'dusk', hold: 4600,
      render: () => (
        <>
          <Eyebrow palette="dusk">Where you finished</Eyebrow>
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-4">
            {podium
              ? <Hero value={ordinalFor(placing.rank)} unit="place" palette="dusk" />
              : <Hero value={`Top ${placing.pct}%`} palette="dusk" />}
            <Line palette="dusk">
              {podium
                ? `On the podium, out of ${nf(placing.field)} creators.`
                : `${ordinalFor(placing.rank)} of ${nf(placing.field)} creators. Ahead of ${nf(placing.field - placing.rank)} of them.`}
            </Line>
            {points != null && points > 0 && (
              <span data-anim="pop" className="inline-flex items-center gap-1.5 self-start rounded-full bg-white/15 px-3.5 py-2 text-sm font-bold">
                <Icon name="trophy" className="h-4 w-4" /> <span data-count={String(points)}>{nf(points)}</span> points
              </span>
            )}
          </div>
        </>
      ),
    })
  }

  // ----------------------------------------------------------------- totals
  if (totals.videos > 0) {
    push({
      key: 'totals', palette: 'sky', hold: 4600,
      render: () => (
        <>
          <Eyebrow palette="sky">What you made</Eyebrow>
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-5">
            <Hero value={nf(totals.views)} unit="views" palette="sky" />
            <Facts
              palette="sky"
              items={[
                { label: totals.videos === 1 ? 'Video' : 'Videos', value: nf(totals.videos) },
                totals.platforms.length > 0 && { label: totals.platforms.length === 1 ? 'Platform' : 'Platforms', value: totals.platforms.length },
                totals.share != null && totals.share >= 1 && { label: 'Of all views', value: `${totals.share}%` },
              ]}
            />
            {totals.platforms.length > 0 && (
              <div data-anim="rise" className="flex flex-wrap items-center gap-2">
                {totals.platforms.map((p) => (
                  <span key={p} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 py-1 pl-1 pr-3 text-xs font-bold">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-ink">
                      {SOCIAL[p] ? <SocialMark brand={SOCIAL[p]} className="h-3.5 w-3.5" /> : <Icon name="video" className="h-3.5 w-3.5" />}
                    </span>
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>
        </>
      ),
    })
  }

  // ------------------------------------------------------------- top videos
  // ONE AT A TIME, COUNTING DOWN, THEN TOGETHER. Each has the whole card and
  // long enough to be looked at; the last card lines them up.
  const ranked = top.filter((v) => v.views > 0)
  if (ranked.length > 0) {
    const order = ranked.map((v, n) => ({ v, rank: n + 1 })).reverse()
    for (const { v, rank } of order) {
      push({
        key: `top-${rank}`, palette: 'night', hold: 3400,
        render: () => (
          <>
            <Eyebrow palette="night">
              {ranked.length === 1 ? 'Your best video' : rank === 1 ? 'And your number one' : `Your number ${rank}`}
            </Eyebrow>
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 py-2">
              <div className="flex h-[70%] min-h-0 justify-center">
                <Poster video={v} rank={ranked.length > 1 ? rank : null} size="xl" anim="spot" delay={200} />
              </div>
              <p data-anim="rise" data-delay="700" className="text-center text-sm font-semibold text-white/80">
                {rank === 1 && totals.bestBeatPct != null
                  ? (totals.bestBeatPct === 100 ? 'The most-watched video in the whole challenge.' : `More views than ${totals.bestBeatPct}% of every video in the challenge.`)
                  : v.platform ? `On ${v.platform}.` : ''}
              </p>
            </div>
          </>
        ),
      })
    }
    if (ranked.length > 1) {
      push({
        key: 'top-all', palette: 'night', hold: 4200,
        render: () => (
          <>
            <Eyebrow palette="night">{`Your top ${ranked.length}, together`}</Eyebrow>
            <div className="flex min-h-0 flex-1 flex-col justify-center gap-4 py-2">
              <div className="flex w-full items-end justify-center gap-2.5">
                {/* The podium shape: number one in the middle and biggest.
                    Sized by WIDTH so three always fit across the card. */}
                {(ranked.length === 3 ? [ranked[1], ranked[0], ranked[2]] : ranked).map((v) => {
                  const rank = ranked.indexOf(v) + 1
                  return (
                    <div key={v.id} className={rank === 1 ? 'w-[38%]' : 'w-[29%]'}>
                      <Poster video={v} rank={rank} size={rank === 1 ? 'lg' : 'md'} anim="zoom" delay={150 + (3 - rank) * 220} fit="width" />
                    </div>
                  )
                })}
              </div>
              {/* TWO EQUAL CELLS ON ONE LINE (28 Sep 2026, evening). Ethan: the
                  "189.5k across these" and "20.9k average video" pair was
                  "misaligned" - a wrapping flex row puts each figure wherever
                  its own width lands it. A two-column grid, centred, with a
                  hairline between, lines them up whatever the digits. */}
              <div data-anim="rise" data-delay="700" className="mx-auto grid w-full max-w-[18rem] grid-cols-2 overflow-hidden rounded-2xl text-center" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <span className="px-3 py-3">
                  <span className="block text-2xl font-extrabold tabular-nums leading-none">{formatViews(ranked.reduce((n, v) => n + v.views, 0))}</span>
                  <span className="mt-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">{`Your top ${ranked.length}`}</span>
                </span>
                <span className="border-l border-white/15 px-3 py-3">
                  <span className="block text-2xl font-extrabold tabular-nums leading-none">{formatViews(totals.avg > 0 ? totals.avg : 0)}</span>
                  <span className="mt-1.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">Per video</span>
                </span>
              </div>
            </div>
          </>
        ),
      })
    }
  }

  // ----------------------------------------------------------------- facts
  // THE NUMBERS BEHIND IT (28 Sep 2026, evening). Ethan: "I don't like where it
  // says 'Good to know', and also I don't like the background of this colour
  // ... I'd redesign this card and make it look better." So: no heading
  // phrase, the dusk palette instead of sand, and each fact led by its own
  // number in large type, with the sentence as its caption.
  const times = totals.avg > 0 && community.avg > 0 ? totals.avg / community.avg : 0
  const facts = [
    totals.firstDay && {
      big: totals.firstDay === 1 ? 'Day 1' : `Day ${totals.firstDay}`,
      text: totals.firstDay === 1 ? 'You posted on the very first day.' : 'When your first video landed.',
    },
    times >= 1.1 && {
      big: `${times >= 10 ? Math.round(times) : times.toFixed(1)}×`,
      text: `Your average video (${formatViews(totals.avg)}) against the challenge average of ${formatViews(community.avg)}.`,
    },
    totals.share != null && totals.share >= 1 && {
      big: `${totals.share}%`,
      text: 'Of every view in the challenge was yours.',
    },
    totals.bestPlatform && totals.platforms.length > 1 && {
      big: formatViews(totals.bestPlatform.views),
      text: `From ${totals.bestPlatform.name}, your strongest platform.`,
    },
  ].filter(Boolean)
  if (facts.length >= 2) {
    push({
      key: 'facts', palette: 'dusk', hold: 5200,
      render: () => (
        <>
          <Eyebrow palette="dusk">Your challenge in numbers</Eyebrow>
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-3">
            {facts.slice(0, 4).map((f, n) => (
              <div
                key={f.text}
                data-anim="rise"
                data-delay={String(150 + n * 160)}
                className="flex items-center gap-4 rounded-2xl px-4 py-3.5"
                style={{ background: 'rgba(255,255,255,0.10)' }}
              >
                <span className="w-[5.5rem] shrink-0 text-[30px] font-extrabold leading-none tracking-tight tabular-nums text-[#ffb37a]">
                  {f.big}
                </span>
                <span className="min-w-0 text-[14px] font-semibold leading-snug text-white/90">{f.text}</span>
              </div>
            ))}
          </div>
        </>
      ),
    })
  }

  // ----------------------------------------------------------------- prizes
  if (won.length > 0) {
    push({
      key: 'won', palette: 'mint', hold: 4400,
      render: () => (
        <>
          <Eyebrow palette="mint">What you won</Eyebrow>
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-4">
            <Hero value={wholeMoney(wonTotal, won[0].currency)} palette="mint" />
            <div data-anim="rise" className="flex flex-wrap gap-1.5">
              {won.map((w, n) => (
                <span key={n} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold">
                  <Icon name={w.kind === 'voucher' ? 'ticket' : 'cash'} className="h-3.5 w-3.5" />
                  {wholeMoney(w.amount, w.currency)} {w.kind === 'voucher' ? 'Tryp.com voucher' : 'cash'}
                </span>
              ))}
            </div>
            <Line palette="mint">It lands on your Rewards page.</Line>
          </div>
        </>
      ),
    })
  }

  // -------------------------------------------------------------- everybody
  if (community.views > 0) {
    const pool = prizes?.total || challenge.pot
    push({
      key: 'together', palette: 'ember', hold: 5000,
      render: () => (
        <>
          <Eyebrow palette="ember">Everybody, together</Eyebrow>
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-5">
            <Hero value={formatViews(community.views)} unit="views" palette="ember" />
            <Facts
              palette="ember"
              items={[
                { label: 'Creators', value: nf(community.creators) },
                { label: 'Videos', value: nf(community.videos) },
                pool > 0 && { label: 'Prize pool', value: roughMoney(pool, challenge.currency) },
              ]}
            />
            {prizes?.vouchers > 0 && (
              <span data-anim="pop" className="inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-xs font-bold" style={{ background: 'rgba(255,255,255,0.18)' }}>
                <Icon name="ticket" className="h-3.5 w-3.5" />
                Including {wholeMoney(prizes.vouchers, challenge.currency)} in Tryp.com vouchers
              </span>
            )}
            {/* Just the one line (28 Sep 2026): "Don't say, 'The biggest single
                video reached 143k.' Just keep that first line." */}
            <Line palette="ember">{`What ${nf(community.creators)} creators made together.`}</Line>
          </div>
        </>
      ),
    })
  }

  return cards
}

/**
 * THE CARD PEOPLE POST.
 *
 * Challenge first, then the person, then the best video as a real poster beside
 * the numbers, then one line worth quoting. The logo alone closes it.
 * `line-clamp`/`break-words` on names, never `break-all`: a long surname wraps
 * by word, it is never split into letters.
 */
export function ChallengeShareCard({ data, className = '', style, flush = false }) {
  const { me, challenge, placing, totals, top, points, community } = data
  const best = top[0]?.views > 0 ? top[0] : null
  // THE PLACE IS A BADGE BY THE NAME; THE NUMBERS DO NOT REPEAT IT (28 Sep
  // 2026, evening). Ethan: "for the 3rd, 2nd, and 1st, maybe have it in a
  // different colour or use an actual badge", and "you're kind of repeating
  // some information." The place was a stat AND the footer line restated a
  // ranking; now it is said once, as a badge in the podium's own tone, and the
  // grid holds only numbers said nowhere else on the card.
  const stats = [
    points != null && points > 0 && { label: 'Points', value: nf(points) },
    totals.views > 0 && { label: 'Views', value: formatViews(totals.views) },
    totals.videos > 0 && { label: totals.videos === 1 ? 'Video' : 'Videos', value: String(totals.videos) },
    totals.share != null && totals.share >= 1 && { label: 'Of all views', value: `${totals.share}%` },
    totals.avg > 0 && totals.videos > 1 && { label: 'Per video', value: formatViews(totals.avg) },
  ].filter(Boolean).slice(0, 4)
  const badge = placing?.kind === 'podium'
    ? { text: `${ordinalFor(placing.rank)} place`, tier: podiumTier(placing.rank) }
    : placing?.kind === 'top' ? { text: `Top ${placing.pct}%`, tier: null } : null
  // HOW THEY DID OVERALL, IN WORDS (28 Sep 2026). "Rather than saying 'Best
  // video, top 1% of the challenge', just say overall what they were like."
  const times = totals.avg > 0 && community?.avg > 0 ? totals.avg / community.avg : 0
  const quote = placing
    ? `${placing.kind === 'podium' ? `${ordinalFor(placing.rank)} of ${nf(placing.field)}` : `Top ${placing.pct}% of ${nf(placing.field)}`} creators overall${times >= 1.1 ? `, ${times >= 10 ? Math.round(times) : times.toFixed(1)}× the average video` : ''}.`
    : times >= 1.1
      ? `${times >= 10 ? Math.round(times) : times.toFixed(1)}× the challenge's average video.`
      : totals.platforms.length > 1
        ? `Posted on ${listOf(totals.platforms)}.`
        : null

  return (
    <Card palette="ember" footer={false} flush={flush} className={className} bodyClassName="justify-between gap-4" style={style}>
      <div>
        <p data-anim="rise" className="text-[11px] font-bold uppercase tracking-[0.22em] opacity-85">Challenge recap</p>
        <p data-anim="rise" className="mt-1.5 line-clamp-2 break-words text-[24px] font-extrabold leading-[1.05] tracking-tight">{challenge.title}</p>
        {challenge.start && challenge.end && (
          <p data-anim="fade" className="mt-1 text-[12px] font-semibold opacity-80">{formatDate(challenge.start)} – {formatDate(challenge.end)}</p>
        )}
      </div>

      <div data-anim="rise" className="flex items-center gap-3 rounded-2xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.16)' }}>
        {me?.photo
          ? <img src={me.photo} alt="" crossOrigin="anonymous" className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-white/60" />
          : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/25 text-xl font-extrabold ring-2 ring-white/60">
              {(me?.name || '?').slice(0, 1)}
            </span>
          )}
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 break-words text-[18px] font-extrabold leading-tight">{me?.name}</span>
        </span>
        {badge && (
          <span
            data-anim="pop"
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-extrabold shadow-lg"
            style={badge.tier ? { background: badge.tier.disc === '#d94407' ? '#ffffff' : badge.tier.disc, color: badge.tier.disc === '#d94407' ? '#d94407' : badge.tier.ink } : { background: '#ffffff', color: '#d94407' }}
          >
            <Icon name="trophy" className="h-3.5 w-3.5" />
            {badge.text}
          </span>
        )}
      </div>

      <div className="flex min-h-0 items-stretch gap-4">
        {best && (
          <div className="w-[40%] shrink-0">
            <Poster video={best} rank={null} size="lg" anim="zoom" fit="width" />
          </div>
        )}
        <div className={`grid min-w-0 flex-1 content-center gap-y-4 ${best ? 'grid-cols-1' : 'grid-cols-2 gap-x-5'}`}>
          {stats.map((s) => (
            <span key={s.label} data-anim="zoom" className="min-w-0">
              <span className="block text-[28px] font-extrabold leading-none tracking-tight">{s.value}</span>
              <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.14em] opacity-80">{s.label}</span>
            </span>
          ))}
        </div>
      </div>

      <div data-anim="rise" className="flex items-center justify-between gap-3 border-t border-white/25 pt-3.5">
        <TrypMark className="!h-6 !opacity-100" />
        {quote && <span className="min-w-0 text-right text-[11px] font-semibold leading-snug opacity-90">{quote}</span>}
      </div>
    </Card>
  )
}
