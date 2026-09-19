import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildCards, ShareCard } from './story'
import { Card, Eyebrow, Line, TrypMark } from './cards'
import { snapshotNode, downloadBlob } from '../../lib/domSnapshot'
import { cx } from '../../lib/utils'

import Icon from '../Icon'

// THE RUNNER.
//
// Ethan: "It needs to be super interactive and shareable, research how Spotify
// make it dynamic and shareable."
//
// What Spotify actually does, stripped of the animation budget:
//
//   PROGRESSIVE DISCLOSURE. One fact per screen, revealed rather than listed.
//   The whole trick is that you cannot see the next number yet.
//   STORY BARS. Instagram's segmented progress strip, because everybody already
//   knows what it means and how to skip with it.
//   IT MOVES ON ITS OWN. A recap you have to click through is a slideshow; one
//   that plays is a thing you watch. Tapping still works, and it PAUSES on hold
//   so nobody loses a card they were reading.
//   THE SHARE IS DESIGNED, NOT BOLTED ON. The last screen is the artefact, and
//   it is photographed from the same component you were just looking at.
//
// WHAT IS DELIBERATELY NOT HERE: badges, confetti, and a score. Spotify's own
// lesson is that a recap celebrates what somebody ACTUALLY did rather than
// inventing goals to congratulate them for missing.

export default function YearInReview({ data, onExit, autoplay = true }) {
  const cards = useMemo(() => buildCards(data), [data])
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(!autoplay)
  const [finished, setFinished] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const shotRef = useRef(null)

  const total = cards.length + 1        // the share card closes the run
  const onShare = i >= cards.length
  const hold = onShare ? Infinity : (cards[i]?.hold ?? 4000)

  const go = useCallback((n) => {
    setI(() => {
      const next = Math.max(0, Math.min(total - 1, n))
      if (next >= total - 1) setFinished(true)
      return next
    })
  }, [total])

  // THE PROGRESS BAR IS A CSS ANIMATION, NOT REACT STATE.
  //
  // It started as an interval ticking every 50ms into `setElapsed`, which is a
  // re-render of the whole recap twenty times a second for the entire run. The
  // component survived that; the BROWSER did not - screenshotting the page
  // repeatedly captured a half-composited frame, which is the visible edge of a
  // main thread that never gets a quiet moment.
  //
  // A bar filling at a constant rate is exactly what a CSS animation is for.
  // The active segment animates its own width over the card's hold, the key on
  // it restarts that animation when the card changes, and `animationPlayState`
  // is what a hold-to-pause actually pauses - which the interval version could
  // only approximate. React is left with ONE timer per card, for the advance.
  //
  // `elapsedRef` is not needed: pausing pauses the CSS and the timeout is
  // rebuilt from the remaining time when it resumes.
  const startedRef = useRef(0)
  const leftRef = useRef(0)
  useEffect(() => {
    if (onShare) return undefined
    if (paused) {
      // Bank whatever is left of this card so resuming does not restart it.
      leftRef.current = Math.max(0, leftRef.current - (Date.now() - startedRef.current))
      return undefined
    }
    if (!leftRef.current) leftRef.current = hold
    startedRef.current = Date.now()
    const t = setTimeout(() => { leftRef.current = 0; go(i + 1) }, leftRef.current)
    return () => clearTimeout(t)
  }, [paused, hold, i, go, onShare])

  // A new card gets its full hold back.
  useEffect(() => { leftRef.current = 0 }, [i])

  // Arrow keys and space, because this is watched on a laptop as often as on a
  // phone and a story control that only works with a thumb is half a control.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1) }
      else if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p) }
      else if (e.key === 'Escape' && onExit) onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [i, go, onExit])

  async function saveCard() {
    if (!shotRef.current || saving) return
    setSaving(true)
    try {
      // THREE TIMES SIZE. A story card posted to Instagram is displayed at
      // about 1080 wide, and a 2x shot of a 360px card is 720 - visibly soft on
      // the one surface this picture exists for.
      const blob = await snapshotNode(shotRef.current, { scale: 3, background: '#d94407' })
      const name = (data?.me?.name || 'creator').toLowerCase().replace(/[^a-z0-9]+/g, '-')
      await downloadBlob(blob, `tryp-${data?.year}-in-review-${name}.png`)
      setSaved(true)
      setTimeout(() => setSaved(false), 2200)
    } finally {
      setSaving(false)
    }
  }

  const card = cards[i]

  return (
    <div className="mx-auto w-full max-w-[400px] select-none">
      {/* ------------------------------------------------------ story bars */}
      <div className="mb-3 flex gap-1" aria-hidden="true">
        {Array.from({ length: total }).map((_, n) => (
          <span key={n} className="h-1 flex-1 overflow-hidden rounded-full bg-black/10">
            <span
              // Keyed on the card so the animation restarts rather than
              // carrying on from wherever the last one had got to.
              key={n === i ? `on-${i}` : 'off'}
              className={cx('block h-full rounded-full bg-brand', n === i && !onShare && 'wr-bar')}
              style={n === i && !onShare
                ? { animationDuration: `${hold}ms`, animationPlayState: paused ? 'paused' : 'running' }
                : { width: n < i ? '100%' : '0%', transition: 'width 220ms ease-out' }}
            />
          </span>
        ))}
      </div>

      <div className="relative">
        {/* The card itself. `aspect-[9/16]` is the shape of the thing it will
            become the moment somebody screenshots it. */}
        <div
          key={onShare ? 'share' : card?.key}
          className="wr-in aspect-[9/16] w-full"
        >
          {onShare
            ? <ShareCard data={data} className="h-full" />
            : (
              <Card palette={card?.palette} className="h-full" name={data?.me?.name}>
                {card?.render()}
              </Card>
            )}
        </div>

        {/* TAP ZONES OVER THE CARD, NOT BUTTONS BESIDE IT. Left third goes
            back, right two thirds go on, holding anywhere pauses. It is the
            gesture language of every story on every phone, and it needs no
            explaining to anybody under fifty. */}
        {!onShare && (
          <>
            <button
              type="button" aria-label="Previous"
              className="absolute inset-y-0 left-0 w-1/3 cursor-default"
              onClick={() => go(i - 1)}
              onPointerDown={() => setPaused(true)}
              onPointerUp={() => setPaused(false)}
              onPointerCancel={() => setPaused(false)}
            />
            <button
              type="button" aria-label="Next"
              className="absolute inset-y-0 right-0 w-2/3 cursor-default"
              onClick={() => go(i + 1)}
              onPointerDown={() => setPaused(true)}
              onPointerUp={() => setPaused(false)}
              onPointerCancel={() => setPaused(false)}
            />
          </>
        )}
      </div>

      {/* ---------------------------------------------------------- controls */}
      <div className="mt-4 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => go(i - 1)}
          disabled={i === 0}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-smoke transition-all duration-200 hoverable:hover:border-brand hoverable:hover:text-brand disabled:opacity-30"
        >
          <Icon name="chevronLeft" className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          disabled={onShare}
          className="flex h-10 items-center gap-2 rounded-full border border-gray-200 px-4 text-sm font-semibold text-smoke transition-all duration-200 hoverable:hover:border-brand hoverable:hover:text-brand disabled:opacity-30"
        >
          <Icon name={paused ? 'plane-flight' : 'mute'} className="h-4 w-4" />
          {paused ? 'Play' : 'Pause'}
        </button>
        <button
          type="button"
          onClick={() => go(i + 1)}
          disabled={i >= total - 1}
          aria-label="Next"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-smoke transition-all duration-200 hoverable:hover:border-brand hoverable:hover:text-brand disabled:opacity-30"
        >
          <Icon name="chevronRight" className="h-4 w-4" />
        </button>
      </div>

      {/* THE SHARE IS OFFERED FROM THE MOMENT THEY HAVE SEEN IT ALL, not only
          on the last screen - somebody who watched to the end and scrolled back
          to their favourite card should not have to skip forward again. */}
      {(onShare || finished) && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={saveCard}
            disabled={saving}
            className="btn-primary inline-flex items-center gap-2 !py-2.5 text-sm disabled:opacity-60"
          >
            <Icon name={saved ? 'check' : 'download'} className="h-4 w-4" />
            {saving ? 'Drawing your card…' : saved ? 'Saved' : 'Save my card'}
          </button>
          <p className="text-[11px] text-smoke">A picture, ready for a story.</p>
        </div>
      )}

      {/* THE HIDDEN COPY THAT GETS PHOTOGRAPHED.
          Same component, rendered at a fixed 360x640 so the picture is a
          predictable size whatever the browser window is doing.

          IT CANNOT BE `display: none` - a hidden node has no layout, and
          `snapshotNode` measures the node before it draws it.

          AND IT CANNOT BE PARKED AT `left: -10000px` EITHER, which is where it
          started. A fixed box ten thousand pixels off the side still counts
          towards the page's scrollable area, and the symptom was bizarre: the
          page rendered correctly and screenshots of it came back BLANK the
          moment it was scrolled. Invisible-but-laid-out is the requirement, so
          it sits at the origin behind everything at zero opacity.

          THE OPACITY IS ON THE WRAPPER AND NOT ON `shotRef`. `snapshotNode`
          copies the computed styles of the node it is given onto the clone, so
          a transparent node photographs as a transparent picture. */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed', top: 0, left: 0, width: 360, height: 640,
          opacity: 0, zIndex: -1, pointerEvents: 'none', overflow: 'hidden',
        }}
      >
        <div ref={shotRef} style={{ width: 360, height: 640 }}>
          <ShareCard data={data} className="h-full" />
        </div>
      </div>

      <style>{`
        .wr-bar { width: 0%; animation: wr-bar linear forwards; }
        @keyframes wr-bar { from { width: 0%; } to { width: 100%; } }
        /* THE FILL MODE IS "forwards" AND NOT "both", AND THAT IS NOT A
           DETAIL. "both" also applies the first keyframe BEFORE the animation
           starts - so the resting state of a card that has not begun animating
           is opacity zero. A browser does not tick a newly started CSS
           animation while the document is hidden, which means a recap opened in
           a backgrounded tab renders as a run of blank coloured rectangles, and
           every one of these cards exists to be READ. With "forwards" the
           element is simply visible until the animation runs, and the animation
           only ever holds the finished state. */
        .wr-in { animation: wr-in 0.5s cubic-bezier(0.22,1,0.36,1) forwards; }
        @keyframes wr-in {
          from { opacity: 0; transform: translateY(14px) scale(0.985); }
          to { opacity: 1; transform: none; }
        }
        /* Every number and every line arrives a beat after the card it is on,
           which is what makes a screen feel revealed rather than switched. */
        .wr-in p, .wr-in > div > div > * { animation: wr-rise 0.55s cubic-bezier(0.22,1,0.36,1) forwards; }
        .wr-in p:nth-child(2), .wr-in > div > div > *:nth-child(2) { animation-delay: 0.08s; }
        .wr-in p:nth-child(3), .wr-in > div > div > *:nth-child(3) { animation-delay: 0.16s; }
        .wr-in p:nth-child(4), .wr-in > div > div > *:nth-child(4) { animation-delay: 0.24s; }
        @keyframes wr-rise {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .wr-in, .wr-in p, .wr-in > div > div > * { animation: none; }
          /* The bar keeps its animation - it is not decoration, it is the only
             thing saying how long is left before the card changes itself. */
        }
      `}</style>
    </div>
  )
}

/** What a creator sees before the recap is ready - kept here so the lab can
 *  show it too, since "what does the locked state look like" is half of what
 *  a December release has to be signed off on. */
export function YearInReviewLocked({ year, opensOn }) {
  return (
    <div className="mx-auto w-full max-w-[400px]">
      <Card palette="dusk" className="aspect-[9/16]" footer={false}>
        <Eyebrow palette="dusk">{year}</Eyebrow>
        <div className="flex flex-1 flex-col justify-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15">
            <Icon name="lock" className="h-7 w-7" />
          </span>
          <p className="text-[34px] font-extrabold leading-[1.05] tracking-tight">Your year<br />is still happening.</p>
          <Line palette="dusk">
            Your recap unlocks on {opensOn}. Every flight you log, every video you post and every
            puzzle you play between now and then is in it.
          </Line>
        </div>
        <div className="mt-6"><TrypMark tone="rgba(255,255,255,0.78)" /></div>
      </Card>
    </div>
  )
}
