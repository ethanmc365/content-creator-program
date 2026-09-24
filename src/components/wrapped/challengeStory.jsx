import { Card, Eyebrow, Hero, Line, Facts, wholeMoney, roughMoney, formatViews } from './cards'
import Icon from '../Icon'
import { ordinalFor } from '../../lib/podiumTiers'

// THE END-OF-CHALLENGE RECAP: THE CARDS (24 Sep 2026).
//
// The Year in Review's primitives, palettes and runner, told about ONE
// challenge: the cover, where you placed (only when it is worth saying - see
// lib/challengeRecap), your totals, your three best videos with their frames,
// what you won, and what everybody made together. The share card closes it.
// Every card is dropped when it has nothing true to say.

const nf = (n) => Number(n || 0).toLocaleString('en-GB')

function Poster({ video, rank, big = false }) {
  return (
    <div
      data-anim="zoom"
      className={`relative aspect-[9/16] shrink-0 overflow-hidden rounded-[18px] shadow-2xl ring-2 ring-white/25 ${big ? 'h-full max-h-[330px]' : 'h-full'}`}
    >
      {video.thumbnail
        ? <img src={video.thumbnail} alt="" crossOrigin="anonymous" className="absolute inset-0 h-full w-full object-cover" />
        : (
          <span className="absolute inset-0 flex items-center justify-center bg-white/10">
            <Icon name="video" className="h-8 w-8 opacity-70" />
          </span>
        )}
      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/2" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0))' }} />
      <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-[11px] font-extrabold text-ink">
        {rank}
      </span>
      <span className="absolute inset-x-2 bottom-2 block">
        <span className={`block font-extrabold leading-none tracking-tight text-white ${big ? 'text-[26px]' : 'text-[17px]'}`}>
          {formatViews(video.views)}
        </span>
        <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-[0.14em] text-white/80">views</span>
      </span>
    </div>
  )
}

export function buildChallengeCards(data) {
  const { me, challenge, placing, totals, top, won, wonTotal, community, points } = data
  const cards = []
  const push = (c) => { if (c) cards.push(c) }
  const firstName = (me?.name || 'there').split(' ')[0]

  // ------------------------------------------------------------------ cover
  push({
    key: 'open', palette: 'ember', hold: 3600,
    render: () => (
      <>
        <Eyebrow palette="ember">Challenge recap</Eyebrow>
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-4 py-4">
          {me?.photo
            ? <img data-anim="pop" src={me.photo} alt="" crossOrigin="anonymous" className="h-[clamp(88px,30vw,132px)] w-[clamp(88px,30vw,132px)] rounded-full object-cover ring-4 ring-white/50 shadow-2xl" />
            : (
              <span data-anim="pop" className="flex h-[clamp(88px,30vw,132px)] w-[clamp(88px,30vw,132px)] items-center justify-center rounded-full bg-white/20 text-5xl font-extrabold ring-4 ring-white/50">
                {(me?.name || '?').slice(0, 1)}
              </span>
            )}
          <p data-anim="rise" className="text-[clamp(30px,9vw,40px)] font-extrabold leading-[1.02] tracking-tight">
            {firstName}, that was<br />{challenge.title}.
          </p>
          <Line palette="ember">
            {challenge.days ? `${challenge.days} days, ${nf(community.creators)} creators, one leaderboard. Here is how yours went.` : 'Here is how yours went.'}
          </Line>
        </div>
      </>
    ),
  })

  // ---------------------------------------------------------------- placing
  if (placing) {
    const podium = placing.kind === 'podium'
    push({
      key: 'place', palette: 'dusk', hold: 4200,
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
              <span data-anim="pop" className="inline-flex items-center gap-1.5 self-start rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold">
                <Icon name="trophy" className="h-3.5 w-3.5" /> {nf(points)} points
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
      key: 'totals', palette: 'sky', hold: 4200,
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
              <Line palette="sky">On {totals.platforms.join(', ').replace(/, ([^,]*)$/, ' and $1')}.</Line>
            )}
          </div>
        </>
      ),
    })
  }

  // ------------------------------------------------------------- top videos
  if (top.length > 0 && top[0].views > 0) {
    push({
      key: 'top-videos', palette: 'night', hold: 5000,
      render: () => (
        <>
          <Eyebrow palette="night">{top.length === 1 ? 'Your best video' : `Your top ${top.length}`}</Eyebrow>
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-3 py-2">
            {top.length === 1 ? (
              <div className="flex h-[62%] justify-center"><Poster video={top[0]} rank={1} big /></div>
            ) : (
              <>
                <div className="flex h-[48%] justify-center"><Poster video={top[0]} rank={1} big /></div>
                <div className="flex h-[30%] justify-center gap-3">
                  {top.slice(1).map((v, n) => <Poster key={v.id} video={v} rank={n + 2} />)}
                </div>
              </>
            )}
          </div>
        </>
      ),
    })
  }

  // ----------------------------------------------------------------- prizes
  if (won.length > 0) {
    push({
      key: 'won', palette: 'mint', hold: 4200,
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
    push({
      key: 'together', palette: 'ember', hold: 4200,
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
                challenge.pot > 0 && { label: 'Prize pot', value: roughMoney(challenge.pot, challenge.currency) },
              ]}
            />
            <Line palette="ember">{`${challenge.title}, in one number.`}</Line>
          </div>
        </>
      ),
    })
  }

  return cards
}

export function ChallengeShareCard({ data, className = '', style, flush = false }) {
  const { me, challenge, placing, totals, top } = data
  const stats = [
    totals.views > 0 && { label: 'Views', value: formatViews(totals.views) },
    totals.videos > 0 && { label: totals.videos === 1 ? 'Video' : 'Videos', value: totals.videos },
    placing?.kind === 'podium' && { label: 'Place', value: ordinalFor(placing.rank) },
    placing?.kind === 'top' && { label: 'Finished', value: `Top ${placing.pct}%` },
    top[0]?.views > 0 && !placing && { label: 'Best video', value: formatViews(top[0].views) },
  ].filter(Boolean).slice(0, 4)

  return (
    <Card palette="ember" footer={false} flush={flush} className={className} bodyClassName="justify-between" style={style}>
      <div>
        <div className="flex items-start justify-between gap-3">
          {me?.photo
            ? <img data-anim="pop" src={me.photo} alt="" crossOrigin="anonymous" className="h-20 w-20 shrink-0 rounded-full object-cover ring-[3px] ring-white/55" />
            : (
              <span data-anim="pop" className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-white/20 text-3xl font-extrabold ring-[3px] ring-white/55">
                {(me?.name || '?').slice(0, 1)}
              </span>
            )}
          {top[0]?.thumbnail && (
            <span data-anim="zoom" className="relative aspect-[9/16] h-24 shrink-0 overflow-hidden rounded-xl ring-2 ring-white/40">
              <img src={top[0].thumbnail} alt="" crossOrigin="anonymous" className="absolute inset-0 h-full w-full object-cover" />
            </span>
          )}
        </div>
        <p data-anim="rise" className="mt-4 line-clamp-2 break-words text-[26px] font-extrabold leading-[1.05] tracking-tight">{me?.name}</p>
        <p data-anim="rise" className="mt-1.5 flex items-start gap-1.5 text-[13px] font-semibold leading-snug opacity-85">
          <Icon name="flag" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 break-words">{challenge.title}</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-5 py-3">
        {stats.map((s) => (
          <span key={s.label} data-anim="zoom" className="min-w-0">
            <span className="block text-[30px] font-extrabold leading-none tracking-tight">{s.value}</span>
            <span className="mt-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] opacity-80">{s.label}</span>
          </span>
        ))}
      </div>

      <div data-anim="rise" className="flex items-center gap-3 border-t border-white/25 pt-4">
        <img src="/brand/tryp-wordmark-white.svg" alt="Tryp.com" crossOrigin="anonymous" className="h-7 w-auto shrink-0" />
        <span className="min-w-0 text-[12px] font-bold leading-tight">
          Tryp.com Content<br />Creator Community
        </span>
      </div>
    </Card>
  )
}
