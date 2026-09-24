import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildCards, ShareCard } from './story'
import { Card, Eyebrow, Line } from './cards'
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

// REUSED BY THE CHALLENGE RECAP (24 Sep 2026): `build` makes the cards and
// `Share` draws the closing card; both default to the year's.
export default function YearInReview({ data, onExit, autoplay = true, build = buildCards, Share = ShareCard, fileStem }) {
  const cards = useMemo(() => build(data), [data, build])
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(!autoplay)
  const [finished, setFinished] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [shotCard, setShotCard] = useState(null)   // which card the hidden node is holding
  const [savedCount, setSavedCount] = useState(0)
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

  const slug = (data?.me?.name || 'creator').toLowerCase().replace(/[^a-z0-9]+/g, '-')

  /**
   * Photograph ONE card and hand it over.
   *
   * `which` is a card object, or null for the closing share card.
   *
   * THE HIDDEN NODE HAS TO RE-RENDER BEFORE IT IS PHOTOGRAPHED. Setting
   * `shotCard` is a state change, so `snapshotNode` called in the same tick
   * would photograph whatever was in there before - which is how you get four
   * identical files named after four different cards. Two rAFs is the reliable
   * wait: one to let React commit, one to let the browser lay it out and settle
   * the gradients.
   */
  async function shoot(which) {
    setShotCard(which)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    if (!shotRef.current) return null
    // FOUR TIMES SIZE, from three. A story is displayed about 1080 wide and
    // Instagram re-compresses whatever it is given, so handing it 1440 rather
    // than 1080 is what keeps type crisp after their pass. 360x640 at 4x is
    // 1440x2560. Ethan: "it doesn't seem to download in that high quality."
    //
    // The background no longer has to match anything: the exported copy is
    // `flush`, so there are no corners to fill.
    return snapshotNode(shotRef.current, { scale: 4, background: '#000000' })
  }

  async function saveCard() {
    if (saving) return
    setSaving(true)
    try {
      const blob = await shoot(onShare ? null : cards[i])
      if (!blob) return
      const part = onShare ? 'card' : (cards[i]?.key || 'card')
      await downloadBlob(blob, `${fileStem || `tryp-${data?.year}-in-review`}-${slug}-${part}.png`)
      setSaved(true)
      setTimeout(() => setSaved(false), 2200)
    } finally {
      setShotCard(null)
      setSaving(false)
    }
  }

  /**
   * Every card, one file at a time.
   *
   * Ethan: "have the ability to save every card at once or save a specific
   * card." NOT a zip - that needs a library, and a browser handed a zip of PNGs
   * is a worse outcome on a phone than a run of images landing in the camera
   * roll, which is where these are going.
   *
   * Sequential on purpose. Each shot is a full-page clone with fonts embedded;
   * firing fifteen at once is how you get a tab killed on a phone.
   */
  async function saveAll() {
    if (saving) return
    setSaving(true)
    try {
      const all = [...cards.map((c) => c), null]
      for (let n = 0; n < all.length; n++) {
        setSavedCount(n + 1)
        const blob = await shoot(all[n])
        if (!blob) continue
        const part = all[n]?.key || 'card'
        await downloadBlob(blob, `${fileStem || `tryp-${data?.year}-in-review`}-${slug}-${String(n + 1).padStart(2, '0')}-${part}.png`)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2600)
    } finally {
      setShotCard(null)
      setSavedCount(0)
      setSaving(false)
    }
  }

  // THE PIECES OF A CARD ARRIVE ONE AFTER ANOTHER (21 Sep 2026).
  //
  // Ethan: "add in even more animations on the pages. Currently we have the
  // nice animation where it's going slide to slide. But you can also add in
  // animations like the text appearing in, or the image of the best video that
  // shows up, or the milestone... clean animations for all of that."
  //
  // The card primitives tag themselves (`data-anim` = rise / pop / zoom /
  // draw) and this plays them in document order, 85ms apart, with the Web
  // Animations API. It is written AGAINST the rule documented in the style
  // block below - an entrance that starts at opacity zero can leave a card
  // blank when the document is not being painted - and meets it three ways:
  //
  //   1. It never starts unless the page is VISIBLE, so a recap opened in a
  //      background tab simply appears whole.
  //   2. `fill: 'backwards'` holds the first frame only for the element's own
  //      delay, and a FINISH timer that runs whatever the tab is doing ends
  //      every animation at its last frame after 2.6s. A timer is throttled in
  //      a hidden tab; it is never skipped. Nothing can be left invisible.
  //   3. It only ever touches the on-screen card. The hidden copy that gets
  //      photographed is never animated, so a saved picture is always whole.
  //
  // Big whole numbers also count up. The DOM text is restored to the real
  // figure on finish and on cleanup, so React's own text is what stays.
  const stageRef = useRef(null)
  useEffect(() => {
    const root = stageRef.current
    if (!root || typeof root.animate !== 'function') return undefined
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined

    const ease = 'cubic-bezier(0.22, 1, 0.36, 1)'
    // THE INDIVIDUAL `translate` / `scale` PROPERTIES, NEVER `transform`
    // (21 Sep 2026). Ethan, on the milestone card: "the animation there is a
    // bit weird and glitchy. It appears one way then moves another way." Every
    // stop and label on that card is centred with `-translate-x-1/2
    // -translate-y-1/2`, which IS a `transform` - so an animation of
    // `transform` replaced the centring for its whole run: each stop popped in
    // half its own size down and to the right, then jumped into place when the
    // animation ended. The separate properties compose WITH `transform`
    // instead of overriding it, so anything positioned by a transform animates
    // where it actually sits.
    const FRAMES = {
      rise: [{ opacity: 0, translate: '0 16px' }, { opacity: 1, translate: '0 0' }],
      pop: [{ opacity: 0, scale: '0.8' }, { opacity: 1, scale: '1' }],
      zoom: [{ opacity: 0, translate: '0 24px', scale: '0.9' }, { opacity: 1, translate: '0 0', scale: '1' }],
      fade: [{ opacity: 0 }, { opacity: 1 }],
      draw: [{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }],
    }
    const anims = []
    root.querySelectorAll('[data-anim]').forEach((el, n) => {
      const kind = el.getAttribute('data-anim')
      const frames = FRAMES[kind]
      if (!frames) return
      // A stop centred with translate(-50%, -50%) scales about its box's
      // top-left corner, which that translate has moved onto its true centre -
      // so it grows from the middle and does not drift. (Measured: about its
      // default centre origin it wandered 4px while popping in.)
      if (kind === 'pop' || kind === 'zoom') {
        try { if (getComputedStyle(el).transform !== 'none') el.style.transformOrigin = '0 0' } catch { /* ignore */ }
      }
      try {
        anims.push(el.animate(frames, {
          duration: kind === 'draw' ? 1100 : kind === 'zoom' ? 720 : 520,
          delay: 140 + n * 85,
          easing: kind === 'draw' ? 'cubic-bezier(0.45, 0, 0.2, 1)' : ease,
          fill: 'backwards',
        }))
      } catch { /* an engine without WAAPI keyframes for this property: skip */ }
    })

    const counters = [...root.querySelectorAll('[data-count]')]
      .map((el) => ({ el, final: el.getAttribute('data-count'), target: Number(String(el.getAttribute('data-count')).replace(/,/g, '')) }))
      .filter((c) => Number.isFinite(c.target) && c.target >= 10)
    const t0 = Date.now()
    const tick = setInterval(() => {
      const k = Math.min(1, (Date.now() - t0 - 200) / 900)
      for (const c of counters) {
        if (k <= 0) { c.el.textContent = '0'; continue }
        const eased = 1 - (1 - k) ** 3
        c.el.textContent = k >= 1 ? c.final : Math.round(c.target * eased).toLocaleString('en-GB')
      }
      if (k >= 1) clearInterval(tick)
    }, 33)
    const restore = () => { for (const c of counters) c.el.textContent = c.final }

    const finish = setTimeout(() => {
      anims.forEach((a) => { try { a.finish() } catch { /* already done */ } })
      clearInterval(tick)
      restore()
    }, 2600)
    return () => {
      clearTimeout(finish)
      clearInterval(tick)
      anims.forEach((a) => { try { a.cancel() } catch { /* gone */ } })
      restore()
    }
  }, [i])

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
          ref={stageRef}
          key={onShare ? 'share' : card?.key}
          className="wr-in aspect-[9/16] w-full"
        >
          {/* NO `name` PROP ON THE CARD. Ethan: "showing their name, you don't
              need to show it in the bottom right again" - it is already the
              largest thing on the opening card, and the recap is only ever
              looked at by the person it is about. The Tryp mark stays. */}
          {onShare
            ? <Share data={data} className="h-full" />
            : (
              <Card palette={card?.palette} className="h-full">
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
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={saveCard}
              disabled={saving}
              className="btn-primary inline-flex items-center gap-2 !py-2.5 text-sm disabled:opacity-60"
            >
              <Icon name={saved ? 'check' : 'download'} className="h-4 w-4" />
              {saving && !savedCount ? 'Drawing…' : saved ? 'Saved' : onShare ? 'Save my card' : 'Save this card'}
            </button>
            {/* "Have the ability to save every card at once or save a specific
                card." The one above saves whichever card is on screen; this one
                walks the whole run. It counts up rather than spinning, because
                fifteen shots is long enough that a bare spinner looks stuck. */}
            <button
              type="button"
              onClick={saveAll}
              disabled={saving}
              className="btn-secondary inline-flex items-center gap-2 !py-2.5 text-sm disabled:opacity-60"
            >
              <Icon name="download" className="h-4 w-4" />
              {savedCount ? `Saving ${savedCount} of ${cards.length + 1}…` : 'Save all'}
            </button>
          </div>
          <p className="text-[11px] text-smoke">
            {onShare ? 'A picture, ready for a story.' : 'Pictures, ready for a story.'}
          </p>
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
          {shotCard === null
            ? <Share data={data} className="h-full" flush />
            : (
              <Card palette={shotCard?.palette} className="h-full" flush>
                {shotCard?.render()}
              </Card>
            )}
        </div>
      </div>

      <style>{`
        .wr-bar { width: 0%; animation: wr-bar linear forwards; }
        @keyframes wr-bar { from { width: 0%; } to { width: 100%; } }

        /* THE CARD CHANGE, AND WHY IT WAS JUDDERY.
           Ethan: "whenever it animates the next card, there's like a little
           weird animation. It does look good the way it pops up, but it's just
           something that's not that smooth."

           Three faults, and the third is the one that was actually visible:

           1. THE CARD WAS SCALING. scale(0.985) on a box whose background is a
              full-bleed gradient makes the browser resample that gradient every
              frame, and a resampled gradient banding its way back to 1.0 is
              exactly the shimmer he is describing. A gradient is the one thing
              you must not scale. Movement only now, and on the compositor.

           2. THE CHILDREN WERE ANIMATING TWICE. ".wr-in p" matched EVERY
              paragraph at any depth, including ones already covered by
              "> div > div > *", so those ran two copies of the same keyframes
              at two different delays.

           3. AND THE STAGGER FLASHED. Each child had a delay and fill-mode
              "forwards" - which does NOT apply the first keyframe before the
              animation starts. So a delayed element was drawn at full opacity,
              sat there for its delay, then JUMPED to invisible and rose. Four
              of those, 80ms apart, on every card change.

           The obvious repair is fill-mode "both", and it is a trap this file
           already documents one paragraph below: an element whose resting state
           is opacity zero is invisible for ever if the animation never starts,
           and a browser does not reliably tick a newly started CSS animation in
           a hidden tab. A recap that renders as blank coloured rectangles when
           somebody opens it in a background tab is a much worse bug than an
           unstaggered entrance. (Confirmed on the spot: with "both" the cards
           came back blank in a hidden preview pane.)

           So the stagger goes and the CARD is the only thing that moves. One
           transform, one opacity, one layer, nothing starting hidden, and
           nothing that can be left hidden. It reads as one card replacing
           another - which is what it is - and the thing Ethan liked about it,
           the pop, is the card's own rise. */
        .wr-in {
          animation: wr-in 0.42s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          will-change: transform;
        }
        /* NOTHING IN HERE TOUCHES OPACITY, AND THAT IS THE WHOLE POINT.
           This file already carried a warning about fill-mode "both" leaving a
           card at opacity zero for ever when the animation never starts, and
           the warning was half right: it blamed the fill mode. The real rule is
           harder and it was found by MEASURING rather than reasoning - a card
           in a hidden pane came back with computed opacity 0 under "forwards"
           as well, because once an animation has started (no delay) its first
           keyframe IS applied and simply never progresses while the document is
           not being painted.

           So the rule is not about fill modes. ANY entrance that begins at
           opacity zero can leave a card blank, and a recap that renders as a
           run of empty coloured rectangles is the worst failure this component
           has. A card that slides up 14px and never finishes is a card sitting
           14px low, which nobody will ever notice.

           Transform only. It is also the smoother animation: a compositor-only
           property, one layer, no repaint, and no crossfade to go muddy over a
           gradient. */
        @keyframes wr-in {
          from { transform: translate3d(0, 14px, 0); }
          to { transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .wr-in { animation: none; }
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
      {/* TRYP ORANGE, NOT THE PURPLE (21 Sep 2026). Ethan: "improve how it
          looks before it opens... I would make this like the Tryp.com orangey
          thing rather than the purpley color." It is the first thing anybody
          sees of the recap, and it should look like the brand. */}
      <Card palette="ember" className="aspect-[9/16]" footer={false}>
        <Eyebrow palette="ember">{year}</Eyebrow>
        <div className="flex flex-1 flex-col justify-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/30">
            <Icon name="lock" className="h-7 w-7" />
          </span>
          <p className="text-[34px] font-extrabold leading-[1.05] tracking-tight">Your year<br />is still happening.</p>
          <Line palette="ember">
            Your recap unlocks on {opensOn}. Every flight you log, every video you post and every
            puzzle you play between now and then is in it.
          </Line>
        </div>
        <div className="mt-6">
          <img src="/brand/tryp-wordmark-white.svg" alt="Tryp.com" className="h-6 w-auto opacity-90" />
        </div>
      </Card>
    </div>
  )
}
