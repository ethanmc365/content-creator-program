import Icon from '../Icon'
import SocialMark from '../SocialMark'
import { PAGE_W, PAGE_H, compactViews, contactEmail, copyFor, platformsFrom, statsFrom } from '../../lib/portfolio'
import { alpha, fillTemplate, formatAwardDate, readableOn, shift, tierOf } from '../../lib/certificates'

// THE PAGES OF A MEDIA KIT, AT 16:9.
//
// One fixed 1280x720 layout, scaled on screen and photographed for the PDF, so
// the preview and the file are the same document. Everything is INLINE STYLE,
// deliberately: `snapshotNode` copies computed styles, and a Tailwind colour
// class would follow the app into dark mode and export a black portfolio.
//
// ---------------------------------------------------------------------------
// THE 21 SEP REDESIGN: THE PLATFORM'S OWN LOOK, NOT A TEMPLATE'S
//
// Ethan: "I don't like the color you've done - a really dark gradient. The
// fonts again really bad, weird fonts. I want it to match the style of the
// platform and the Tryp.com brand, using the correct fonts and styles."
//
// So every page is now built from the three things the product itself is made
// of, and nothing else:
//
//   POPPINS, and only Poppins. Instrument Serif is gone from the deck. It was
//   chosen to make the kit look less like a slide deck, and it made it look
//   like somebody else's brand instead.
//
//   THE HUB'S GRADIENT. `from-brand to-brand-light` - #d94407 to #f5853f,
//   top-left to bottom-right, with two soft white glows - is the card every
//   creator sees first on the Worldwide hub. The cover and the "Work with me"
//   page use exactly that panel. The old cover darkened the accent towards
//   near-black; this one LIGHTENS it, which is the whole difference between
//   "dark gradient" and the brand.
//
//   THE ROUTE. A dotted flight path and the Tryp plane, as on the milestone
//   route and the plane over the hub card. It replaces both small orange bars
//   Ethan did not get - the stub under each title and the band along the foot.
// ---------------------------------------------------------------------------

const INK = '#1A1A1A'
const SMOKE = '#5E6068'
const FAINT = '#9A9CA4'
const BRAND = '#d94407'
const BRAND_LIGHT = '#f5853f'
const HAIR = '#ececee'

const SANS = 'Poppins, system-ui, sans-serif'

/**
 * THE KIT'S OWN ACCENT, and the gradient built from it.
 *
 * Tryp orange by default; a creator can pick any of the certificate palette's
 * accents (stored in `copy.accent`). The gradient always goes from the accent
 * to a LIGHTER tone of it - for the brand colour that is exactly the hub's
 * `brand -> brand-light` - never towards black.
 */
export function theme(copy) {
  const raw = typeof copy?.accent === 'string' ? copy.accent.trim() : ''
  const accent = /^#[0-9a-f]{6}$/i.test(raw) ? raw : BRAND
  const light = accent.toLowerCase() === BRAND ? BRAND_LIGHT : shift(accent, 0.3)
  // A BRIGHT ACCENT (yellow, lime, sky) is fine as a gradient and unreadable
  // as 11px text on white, so text gets a darker tone of the same colour.
  const ink = readableOn(accent) === '#141414' ? shift(accent, -0.32) : accent
  return {
    accent,
    ink,
    light,
    grad: `linear-gradient(135deg, ${accent} 0%, ${light} 100%)`,
    tint: alpha(accent, 0.07),
    line: alpha(accent, 0.16),
    peach: `linear-gradient(160deg, ${alpha(accent, 0.05)} 0%, ${alpha(accent, 0.13)} 100%)`,
  }
}

const page = (extra = {}) => ({
  width: PAGE_W, height: PAGE_H, position: 'relative', overflow: 'hidden',
  background: '#ffffff', fontFamily: SANS, color: INK, ...extra,
})

/** The hub card: the brand gradient with two soft glows, rounded. */
function GradientPanel({ t, style, children }) {
  return (
    <div style={{
      position: 'absolute', borderRadius: 30, overflow: 'hidden', background: t.grad, ...style,
    }}>
      <div style={{
        position: 'absolute', right: -120, top: -140, width: 420, height: 420, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0) 68%)',
      }} />
      <div style={{
        position: 'absolute', left: -140, bottom: -160, width: 440, height: 440, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 68%)',
      }} />
      {children}
    </div>
  )
}

// The cover's route, in the 520 x 722 panel's own px. The portrait is centred
// at (260, 383) with a 158px radius; the two curls sit clear of it.
const COVER_ROUTE = [
  'M -30 700',
  'C 30 660, 70 630, 112 616',
  'C 176 596, 178 520, 124 522',
  'C 78 524, 84 604, 150 598',
  'C 214 592, 236 500, 250 420',
  'C 262 330, 320 250, 392 238',
  'C 452 228, 470 160, 430 146',
  'C 388 132, 380 196, 438 196',
  'C 488 196, 520 110, 560 -40',
].join(' ')

/** A dotted route, drawn over whatever it sits on. `d` is in the box's own px. */
function Route({ d, width, height, color = '#ffffff', opacity = 0.75, style }) {
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      style={{ position: 'absolute', overflow: 'visible', ...style }} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeOpacity={opacity} strokeWidth="3"
        strokeDasharray="1 11" strokeLinecap="round" />
    </svg>
  )
}

/**
 * The real livery, from the hub. It faces LEFT and is never mirrored - a
 * mirrored plane reads "moc.PYRT" down its side - so every route on these
 * pages is drawn to arrive at its TAIL, on the right, as a trail would.
 */
function Plane({ width = 200, style, flip = false }) {
  return (
    <img
      src="/brand/tryp-plane-cutout.png"
      alt=""
      crossOrigin="anonymous"
      style={{
        position: 'absolute', width, height: 'auto',
        transform: `${flip ? 'scaleX(-1) ' : ''}${style?.transform || ''}`,
        filter: 'drop-shadow(0 14px 18px rgba(0,0,0,0.18))',
        ...style,
      }}
    />
  )
}

/** Kicker: a small plane and a tracked label, in the accent. */
function Kicker({ children, color, size = 11.5 }) {
  return (
    <p style={{
      margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: size, fontWeight: size > 12 ? 800 : 700,
      letterSpacing: '0.14em', textTransform: 'uppercase', color,
    }}>
      <span style={{ display: 'inline-flex', color, transform: 'rotate(45deg)' }}>
        <Icon name="plane-flight" className="h-4 w-4" />
      </span>
      {children}
    </p>
  )
}

function SlideTitle({ children, size = 42, color = INK }) {
  return (
    <h2 style={{
      fontFamily: SANS, fontWeight: 700, fontSize: size, letterSpacing: '-0.02em',
      lineHeight: 1.08, margin: '10px 0 0', color,
    }}>
      {children}
    </h2>
  )
}

function Label({ children, color = FAINT }) {
  return (
    <p style={{
      fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em',
      textTransform: 'uppercase', color, margin: 0,
    }}>
      {children}
    </p>
  )
}

/** Wordmark bottom-left on every page. No page numbers (Ethan: "not necessary"). */
// eslint-disable-next-line no-unused-vars
function Footer({ name, n, total, t }) {
  return (
    <div style={{
      position: 'absolute', left: 64, right: 64, bottom: 28,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <img src="/brand/tryp-wordmark.svg" alt="Tryp.com" crossOrigin="anonymous" style={{ height: 15, width: 'auto' }} />
        <span style={{ width: 1, height: 14, background: HAIR }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: FAINT }}>{name}</span>
      </span>
    </div>
  )
}

// ------------------------------------------------------------------ cover ---
export function Cover({ creator, copy, videos, extraPlatforms }) {
  const chosen = typeof copy?.cover_photo === 'string' ? copy.cover_photo.trim() : ''
  const photo = chosen || creator?.photo_url
  const links = socialRows(creator, videos, extraPlatforms).slice(0, 5)
  const t = theme(copy)

  return (
    <div style={page()}>
      {/* THE HUB CARD, AS THE LEFT OF THE COVER. Inset and rounded like the
          card on the Worldwide page, so it reads as the platform's object
          rather than a filled half-page. */}
      <GradientPanel t={t} style={{ left: 36, top: 36, bottom: 36, width: 520 }}>
        <img src="/brand/tryp-wordmark-white.svg" alt="Tryp.com" crossOrigin="anonymous"
          style={{ position: 'absolute', top: 40, left: 44, height: 26, width: 'auto' }} />
        {/* A ROUTE THE WHOLE WAY THROUGH, CORNER TO CORNER (21 Sep 2026).
            Ethan: "remove that Trip.com plane [on the first slide] and instead
            have the dotted line going up the other corner, just like going the
            whole way through." In at the bottom left, round under the portrait,
            out through the top right. */}
        {/* AND IT CURLS (21 Sep 2026). Ethan: "It doesn't look good the way it
            currently is, so maybe more curls, just behind the profile picture."
            Two loops - one low on the left as it comes in, one high on the
            right as it leaves - and the middle of the route runs BEHIND the
            portrait (it is drawn first), so the photo sits on the flight. */}
        <Route width={520} height={722} d={COVER_ROUTE} />
        <div style={{
          position: 'absolute', left: '50%', top: '53%', transform: 'translate(-50%, -50%)',
          width: 300, height: 300, borderRadius: '50%', border: '8px solid #ffffff',
          boxShadow: '0 26px 60px rgba(0,0,0,0.20)', overflow: 'hidden',
          background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {photo
            ? <img src={photo} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 120, fontWeight: 700, color: '#ffffff' }}>{(creator?.name || '?').slice(0, 1).toUpperCase()}</span>}
        </div>
      </GradientPanel>

      <div style={{
        position: 'absolute', left: 620, right: 72, top: 0, bottom: 0,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
      }}>
        {/* "Slightly more bold or slightly bigger" - it is the line that says
            whose community this is. */}
        <Kicker color={t.ink} size={14.5}>{copyFor(copy, 'cover_kicker')}</Kicker>
        <p style={{
          margin: '22px 0 0', fontWeight: 700, fontSize: nameSize(creator?.name),
          lineHeight: 1.04, letterSpacing: '-0.025em',
        }}>
          {creator?.name || 'Creator'}
        </p>
        <p style={{ margin: '18px 0 0', fontSize: 22, fontWeight: 600, color: SMOKE }}>
          {copyFor(copy, 'cover_role')}
        </p>
        {(creator?.city || creator?.country) && (
          <p style={{ margin: '10px 0 0', display: 'flex', alignItems: 'center', gap: 7, fontSize: 15, fontWeight: 500, color: FAINT }}>
            <span style={{ color: t.ink, display: 'inline-flex' }}><Icon name="pin" className="h-4 w-4" /></span>
            {[creator.city, creator.country].filter(Boolean).join(', ')}
          </p>
        )}
        {links.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 34 }}>
            {links.map((r) => (
              <SocialMark key={r.brand + r.label} brand={r.brand} className="h-8 w-8" tile />
            ))}
          </div>
        )}
      </div>

    </div>
  )
}

/** The name is the loudest thing on the cover, and it must still fit. */
function nameSize(name) {
  const n = String(name || '').length
  if (n <= 12) return 74
  if (n <= 18) return 62
  if (n <= 26) return 50
  if (n <= 34) return 42
  return 34
}

// ------------------------------------------------------------------ about ---
export function About({ creator, copy, videos, extraPlatforms, tools, n, total }) {
  const stats = statsFrom(videos)
  const t = theme(copy)
  const platforms = socialRows(creator, videos, extraPlatforms)
  const one = (count, singular, plural) => (count === 1 ? singular : plural)
  const cells = [
    { label: 'Views on Tryp.com work', value: compactViews(stats.views), lead: true },
    { label: 'Best video', value: compactViews(stats.best) },
    { label: one(stats.videos, 'Video made', 'Videos made'), value: stats.videos },
    { label: 'Average views', value: compactViews(stats.average) },
    { label: one(stats.challenges, 'Challenge entered', 'Challenges entered'), value: stats.challenges },
    stats.platforms > 1
      ? { label: 'Platforms', value: stats.platforms }
      : { label: one(stats.markets || 1, 'Market', 'Markets'), value: stats.markets || 1 },
  ]
  return (
    <div style={page({ padding: '56px 64px 0' })}>
      <Kicker color={t.ink}>Who I am</Kicker>
      <SlideTitle>{copyFor(copy, 'about_title')}</SlideTitle>

      <div style={{ display: 'flex', gap: 56, marginTop: 30 }}>
        <div style={{ flex: '1 1 48%', minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 17, lineHeight: 1.8, color: SMOKE, whiteSpace: 'pre-line' }}>
            {copyFor(copy, 'about_body')}
          </p>
          {tools?.length > 0 && (
            <div style={{ marginTop: 30 }}>
              <Label>What I shoot and edit with</Label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {tools.map((tool) => (
                  <span key={tool} style={{
                    borderRadius: 999, background: t.tint, padding: '7px 14px',
                    fontSize: 12.5, fontWeight: 600, color: INK,
                  }}>
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: '1 1 52%', minWidth: 0 }}>
          <Label>{copyFor(copy, 'stats_title')}</Label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 14 }}>
            {cells.map((c) => (
              c.lead ? (
                <div key={c.label} style={{
                  position: 'relative', overflow: 'hidden', borderRadius: 20, background: t.grad,
                  padding: '18px 18px 16px', gridColumn: 'span 1',
                }}>
                  <div style={{
                    position: 'absolute', right: -40, top: -50, width: 140, height: 140, borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 70%)',
                  }} />
                  <p style={{ position: 'relative', margin: 0, fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, color: '#ffffff' }}>
                    {c.value}
                  </p>
                  <p style={{ position: 'relative', margin: '10px 0 0', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.9)' }}>
                    {c.label}
                  </p>
                </div>
              ) : (
                <div key={c.label} style={{
                  borderRadius: 20, background: '#ffffff', border: `1px solid ${HAIR}`,
                  boxShadow: '0 4px 14px rgba(26,26,26,0.04)', padding: '18px 18px 16px',
                }}>
                  <p style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, color: INK }}>
                    {c.value}
                  </p>
                  <p style={{ margin: '10px 0 0', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: FAINT }}>
                    {c.label}
                  </p>
                </div>
              )
            ))}
          </div>

          {platforms.length > 0 && (
            <div style={{ marginTop: 26 }}>
              <Label>Where I post</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                {platforms.slice(0, 4).map((p) => (
                  <PlatformRow key={p.brand + p.label} row={p} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Footer name={creator?.name || ''} n={n} total={total} t={t} />
    </div>
  )
}

/** One platform, as a link on screen (inert in the PDF, which is a picture). */
function PlatformRow({ row }) {
  const inner = (
    <>
      <SocialMark brand={row.brand} className="h-6 w-6" tile />
      <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{row.label}</span>
      {row.handle && (
        <span style={{ fontSize: 12.5, color: FAINT, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.handle}
        </span>
      )}
      {row.meta && (
        <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 600, color: SMOKE, whiteSpace: 'nowrap' }}>
          {row.meta}
        </span>
      )}
    </>
  )
  const style = {
    display: 'flex', alignItems: 'center', gap: 11, textDecoration: 'none',
    borderRadius: 14, border: `1px solid ${HAIR}`, padding: '9px 13px', background: '#ffffff',
  }
  if (!row.url) return <div style={style}>{inner}</div>
  return <a href={row.url} target="_blank" rel="noopener noreferrer" style={style}>{inner}</a>
}

// ------------------------------------------------------------------- work ---
// Ethan liked this page's cards and callout and asked for better copy and
// finish. The tiles keep their shape (four true 9:16 frames a page) and gain a
// RANK - "#1" is the first thing a brand wants to know about a list sorted by
// views - and the header says what the list is instead of a grey chip.
export function Work({ creator, copy, videos, n, total, offset = 0, totalVideos }) {
  const t = theme(copy)
  const from = offset + 1
  const to = offset + videos.length
  return (
    <div style={page({ padding: '48px 64px 0' })}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
        <div style={{ minWidth: 0 }}>
          <Kicker color={t.ink}>{offset === 0 ? 'Most viewed first' : 'Continued'}</Kicker>
          <SlideTitle size={38}>{copyFor(copy, 'work_title')}</SlideTitle>
          <p style={{ margin: '8px 0 0', maxWidth: 720, fontSize: 13.5, lineHeight: 1.6, color: SMOKE }}>
            {copyFor(copy, 'work_body')}
          </p>
        </div>
        {videos.length > 0 && (
          <span style={{
            flexShrink: 0, borderRadius: 999, background: t.grad, color: '#ffffff',
            padding: '8px 16px', fontSize: 12, fontWeight: 700, letterSpacing: '0.02em',
            boxShadow: `0 8px 20px ${alpha(t.accent, 0.25)}`,
          }}>
            {totalVideos && totalVideos > 1 ? `Videos ${from}–${to} of ${totalVideos}` : `${videos.length} video${videos.length === 1 ? '' : 's'}`}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 32, marginTop: 22 }}>
        {videos.map((v, i) => <VideoTile key={v.id} video={v} rank={offset + i + 1} t={t} />)}
        {videos.length === 0 && (
          <div style={{
            position: 'relative', flex: 1, height: 460, borderRadius: 24, background: t.peach,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
            overflow: 'hidden',
          }}>
            <Route width={1152} height={460} color={t.accent} opacity={0.35}
              d="M 40 400 C 260 380, 360 120, 620 180 S 980 320, 1110 60" />
            <span style={{ color: t.accent, display: 'inline-flex', transform: 'rotate(45deg)' }}>
              <Icon name="plane-flight" className="h-8 w-8" />
            </span>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: INK }}>The first video lands here.</p>
            <p style={{ margin: 0, fontSize: 13, color: SMOKE }}>Enter a Tryp.com challenge and your work fills this page.</p>
          </div>
        )}
      </div>

      <Footer name={creator?.name || ''} n={n} total={total} t={t} />
    </div>
  )
}

/** One video: the frame, a rank, and a white card with the number on it. */
function VideoTile({ video, rank, t }) {
  return (
    <div style={{
      flex: '0 0 264px', width: 264, height: 468, position: 'relative',
      borderRadius: 22, overflow: 'hidden', background: '#f1f1f3',
      boxShadow: '0 12px 30px rgba(26,26,26,0.10)',
    }}>
      {video.thumbnail_url ? (
        <img
          src={video.thumbnail_url}
          alt=""
          crossOrigin="anonymous"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: FAINT }}>
          <Icon name="video" className="h-8 w-8" />
        </div>
      )}

      <span style={{
        position: 'absolute', top: 12, left: 12, display: 'flex', alignItems: 'center',
        gap: 6, borderRadius: 999, background: 'rgba(255,255,255,0.95)', padding: '5px 10px 5px 6px',
      }}>
        <SocialMark brand={String(video.platform || '').toLowerCase()} className="h-4 w-4" tile />
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'capitalize', color: INK }}>
          {video.platform}
        </span>
      </span>

      <span style={{
        position: 'absolute', top: 12, right: 12, minWidth: 34, height: 34, borderRadius: 999,
        background: t.grad, color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 700, padding: '0 9px', boxShadow: '0 6px 14px rgba(0,0,0,0.18)',
      }}>
        #{rank}
      </span>

      {/* EVERY CARD THE SAME SIZE (21 Sep 2026). Ethan: "the cards for the
          selected work... are different sizes. Some of them show UK Ireland on
          it, and some of them don't. I would remove UK Ireland from it
          altogether and just show [the challenge] and the views." A fixed
          height, the views, and the challenge on two clamped lines. */}
      <div style={{
        position: 'absolute', left: 12, right: 12, bottom: 12, height: 84, boxSizing: 'border-box',
        borderRadius: 16, background: '#ffffff', padding: '12px 14px',
        boxShadow: '0 8px 22px rgba(26,26,26,0.18)',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
          <span style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em' }}>
            {compactViews(video.views ?? video.logged_views)}
          </span>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.ink }}>
            views
          </span>
        </div>
        <p style={{
          margin: '8px 0 0', fontSize: 11, lineHeight: '15px', height: 30, overflow: 'hidden',
          color: SMOKE, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {video.challenge || 'Tryp.com challenge'}
        </p>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------- awards ---
export function Awards({ creator, copy, certificates, n, total }) {
  const t = theme(copy)
  return (
    <div style={page({ padding: '56px 64px 0' })}>
      <Kicker color={t.ink}>Recognised by Tryp.com</Kicker>
      <SlideTitle>{copyFor(copy, 'awards_title')}</SlideTitle>
      <p style={{ margin: '12px 0 0', maxWidth: 700, fontSize: 14.5, lineHeight: 1.65, color: SMOKE }}>
        {copyFor(copy, 'awards_body')}
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: certificates.length > 2 ? 'repeat(2, 1fr)' : '1fr',
        gap: 16, marginTop: 26, maxWidth: certificates.length > 2 ? undefined : 720,
      }}>
        {certificates.slice(0, 6).map((c, i) => {
          const accent = c.accent || c.design?.accent || tierOf(c.tier || c.design?.tier).accent
          const title = c.title || c.design?.title || 'Certificate'
          const facts = c.facts || {}
          const line = fillTemplate(c.body || c.design?.body || '', facts).split('\n')[0]
          return (
            <div key={c.serial || i} style={{
              display: 'flex', gap: 16, alignItems: 'center', borderRadius: 20,
              border: `1px solid ${HAIR}`, padding: '16px 18px', background: '#ffffff',
              boxShadow: '0 4px 14px rgba(26,26,26,0.04)',
            }}>
              <span style={{
                flexShrink: 0, width: 48, height: 48, borderRadius: 14, color: '#ffffff',
                background: `linear-gradient(135deg, ${accent} 0%, ${shift(accent, 0.3)} 100%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name="trophy" className="h-6 w-6" />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ margin: 0, fontSize: 17, fontWeight: 700, lineHeight: 1.2 }}>{title}</p>
                {line && <p style={{ margin: '3px 0 0', fontSize: 12.5, color: SMOKE }}>{line}</p>}
                <p style={{ margin: '6px 0 0', fontSize: 9.5, fontWeight: 600, color: FAINT, letterSpacing: '0.1em' }}>
                  {[c.serial, c.awarded_at ? formatAwardDate(c.awarded_at) : null].filter(Boolean).join('  ·  ')}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <Footer name={creator?.name || ''} n={n} total={total} t={t} />
    </div>
  )
}

// ---------------------------------------------------------------- contact ---
// Ethan: "a little small orange bar at the bottom, I don't get the way it
// looks. It should be bigger or just a new design. You can add some curves,
// some airplane style dotted line features and an airplane icon, just really
// make it flow nicely."
//
// So the last page ends on the hub card: a tall gradient panel on the right
// with a dotted route sweeping up through it to the Tryp plane, a few stops
// along the way, and the programme's name at its foot - the page closes on
// the brand rather than on a 10px line.
export function Contact({ creator, copy, videos, extraPlatforms }) {
  const rows = socialRows(creator, videos, extraPlatforms)
  const email = contactEmail(copy, creator)
  const t = theme(copy)
  // The email card leads, then the platforms: an email is how a brand makes an
  // offer, a profile link is how it checks you out.
  const cards = [
    ...(email ? [{ brand: 'email', label: 'Email', handle: email, url: `mailto:${email}` }] : []),
    ...rows,
  ].slice(0, 6)
  return (
    <div style={page()}>
      <div style={{ position: 'absolute', left: 64, top: 60, width: 640 }}>
        <Kicker color={t.ink}>{"Let's create together"}</Kicker>
        <SlideTitle size={46}>{copyFor(copy, 'contact_title')}</SlideTitle>
        <p style={{ margin: '16px 0 0', fontSize: 16.5, lineHeight: 1.75, color: SMOKE }}>
          {copyFor(copy, 'contact_body')}
        </p>

        <div style={{
          display: 'grid', gridTemplateColumns: cards.length > 2 ? 'repeat(2, 1fr)' : '1fr',
          gap: 12, marginTop: 28,
        }}>
          {cards.map((r) => (
            <ContactCard key={r.brand + r.label} row={r} t={t} wide={r.brand === 'email' && cards.length > 2} />
          ))}
          {cards.length === 0 && (
            <p style={{ margin: 0, fontSize: 14, color: FAINT }}>
              Add your links on your profile and they appear here.
            </p>
          )}
        </div>
      </div>

      {/* THE CLOSING PANEL (21 Sep 2026). Ethan: "round it more to the left on
          the top and have the plane look like the dotted line is coming out of
          the plane... it should be coming out the back, more realistic." The
          plane faces LEFT, so its tail is on its right: the trail leaves the
          tail, loops round to the right and sweeps down and away to the left. */}
      <GradientPanel t={t} style={{ right: 36, top: 36, bottom: 36, width: 440 }}>
        {/* LEVEL, AND THE TRAIL LEAVES THE TAIL ITSELF (21 Sep 2026). Ethan:
            "The aeroplane is too tilted down. The aeroplane should be
            horizontal and level, and the dotted line should be coming right
            out of the back tail of it. Currently, it's a bit far away." The
            livery photo's fuselage already climbs ~5 degrees towards the tail,
            so +5 is what makes it level; at -8 it pointed nose-down. The tail
            cone ends at (1150, 237) of the 1200 x 471 image, which at 196px
            wide and 5 degrees about the centre is (242, 117) in the panel -
            the route starts there and leaves along the fuselage's own line. */}
        <Plane width={196} style={{ left: 54, top: 70, transform: 'rotate(5deg)' }} />
        <Route width={440} height={648} d="M 242 117 C 318 117, 402 150, 396 232 S 300 330, 214 350 S 60 400, -20 470" />
        {[[396, 232], [214, 350]].map(([x, y]) => (
          <span key={`${x}-${y}`} style={{
            position: 'absolute', left: x - 8, top: y - 8, width: 16, height: 16, borderRadius: '50%',
            background: '#ffffff', boxShadow: '0 0 0 6px rgba(255,255,255,0.22)',
          }} />
        ))}
        <div style={{ position: 'absolute', left: 40, right: 40, bottom: 40 }}>
          <img src="/brand/tryp-wordmark-white.svg" alt="Tryp.com" crossOrigin="anonymous" style={{ height: 30, width: 'auto' }} />
          <p style={{ margin: '14px 0 0', fontSize: 17, fontWeight: 700, color: '#ffffff', lineHeight: 1.3 }}>
            Tryp.com Content Creator Community
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, fontWeight: 500, color: 'rgba(255,255,255,0.88)' }}>
            Creators making travel content across the world
          </p>
        </div>
      </GradientPanel>

      <div style={{ position: 'absolute', left: 64, bottom: 28, display: 'flex', alignItems: 'center', gap: 12 }}>
        <img src="/brand/tryp-wordmark.svg" alt="Tryp.com" crossOrigin="anonymous" style={{ height: 15, width: 'auto' }} />
        <span style={{ width: 1, height: 14, background: HAIR }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: FAINT, whiteSpace: 'nowrap' }}>{creator?.name || ''}</span>
      </div>
    </div>
  )
}

function ContactCard({ row, t, wide = false }) {
  const inner = (
    <>
      {row.brand === 'email' ? (
        <span style={{
          flexShrink: 0, width: 36, height: 36, borderRadius: 10, background: t.grad, color: '#ffffff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="envelope" className="h-5 w-5" />
        </span>
      ) : (
        <SocialMark brand={row.brand} className="h-9 w-9" tile />
      )}
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: INK }}>{row.label}</span>
        <span style={{
          display: 'block', marginTop: 1, fontSize: 12.5, color: SMOKE,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {row.handle || row.meta || ''}
        </span>
      </span>
      <span style={{
        flexShrink: 0, width: 28, height: 28, borderRadius: 999, background: t.tint, color: t.ink,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name={row.brand === 'email' ? 'envelope' : 'link'} className="h-3.5 w-3.5" />
      </span>
    </>
  )
  const style = {
    display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none',
    borderRadius: 18, border: `1px solid ${HAIR}`, padding: '14px 16px', background: '#ffffff',
    boxShadow: '0 4px 14px rgba(26,26,26,0.04)', gridColumn: wide ? '1 / -1' : undefined,
  }
  if (!row.url) return <div style={style}>{inner}</div>
  return <a href={row.url} target="_blank" rel="noopener noreferrer" style={style}>{inner}</a>
}

/**
 * EVERY PLACE THIS CREATOR POSTS, AS ONE LIST, WITH THE LINK ON IT.
 *
 * Ethan: "remember, you can take a lot of this data from their profile and add
 * it on here."
 *
 * Three sources, in order of how much they are worth:
 *
 *   1. THE PROFILE LINKS they gave at signup. These are the only ones that
 *      carry a real URL, so they are the only ones that can be clicked - which
 *      is exactly what was missing.
 *   2. PLATFORMS THEY TYPED into the portfolio editor, with a handle and a
 *      follower count.
 *   3. PLATFORMS THEIR ENTRIES PROVE. No link and no handle, but "eleven
 *      entries from TikTok" is a fact worth printing.
 *
 * A platform found in more than one keeps the best of each - the URL from the
 * profile, the handle and followers from what they typed, the entry count from
 * their work - rather than appearing twice saying two different things.
 */
export function socialRows(creator, videos = [], extraPlatforms = []) {
  const links = creator?.links || {}
  const out = []
  const find = (brand) => out.find((r) => r.brand === brand)
  const add = (row) => {
    const at = find(row.brand)
    if (at) Object.assign(at, { ...row, ...Object.fromEntries(Object.entries(at).filter(([, v]) => v != null && v !== '')) })
    else out.push(row)
  }

  for (const [brand, label] of [
    ['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'],
    ['facebook', 'Facebook'], ['linkedin', 'LinkedIn'],
  ]) {
    const url = links[brand]
    if (url) out.push({ brand, label, url, handle: handleFrom(url) })
  }

  for (const row of platformsFrom(videos, extraPlatforms)) {
    const brand = String(row.platform || '').toLowerCase()
    const meta = row.followers
      ? `${compactViews(row.followers)} followers`
      : row.entries
        ? `${row.entries} ${row.entries === 1 ? 'entry' : 'entries'}`
        : ''
    add({
      brand,
      label: row.platform,
      url: row.url || null,
      handle: row.handle || null,
      meta,
    })
  }

  // Free-form links they added to their profile ("other_links"), which are
  // usually a blog or a press kit and are worth carrying.
  for (const extra of creator?.other_links || []) {
    const url = typeof extra === 'string' ? extra : extra?.url
    if (!url || out.some((r) => r.url === url)) continue
    out.push({ brand: 'link', label: (typeof extra === 'object' && extra?.label) || hostFrom(url), url, handle: null })
  }

  return out
}

/** "https://instagram.com/sam/" -> "@sam". A kit prints handles, not URLs. */
function handleFrom(url) {
  try {
    const path = new URL(url).pathname.replace(/^\/+|\/+$/g, '').split('/')[0]
    return path ? (path.startsWith('@') ? path : `@${path}`) : hostFrom(url)
  } catch { return url }
}

function hostFrom(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}
