import Icon from '../Icon'
import SocialMark from '../SocialMark'
import { PAGE_W, PAGE_H, compactViews, copyFor, platformsFrom, statsFrom } from '../../lib/portfolio'
import { fillTemplate, formatAwardDate, tierOf } from '../../lib/certificates'

// THE PAGES OF A MEDIA KIT, AT 16:9.
//
// Ethan: "Perhaps it should show on the screen exactly how the pdf will look
// like you can scroll vertically down to see each new page."
//
// These were A4 landscape until 20 Sep 2026 and are now 1280x720 - see the note
// on PAGE_W in lib/portfolio for why root-2 read as "a weird shape... more
// square shaped" and why the PDF page moved with it.
//
// EXACTLY HOW THE PDF WILL LOOK IS A CONSTRAINT, NOT A DESCRIPTION. It is only
// true if there is ONE layout, so these pages are a fixed size and are never
// responsive. The screen scales them with a
// transform and the export photographs them at 2x. A responsive page would mean
// the preview and the PDF were two different documents and the preview would be
// a lie, which is the exact bug `lib/domSnapshot` was written to end.
//
// EVERYTHING IS INLINE STYLE AND NOT TAILWIND, and that is deliberate here in a
// codebase that is Tailwind everywhere else. These nodes get cloned by
// `snapshotNode`, which writes every COMPUTED style onto the clone - so classes
// do resolve. But they resolve to whatever the app's stylesheet says TODAY,
// including dark mode, which remaps colour utilities: a creator with dark mode
// on would export a black portfolio. A printed page has no theme. Inline styles
// are the page saying what it is regardless of the app around it.

const INK = '#1c1c1c'
const SMOKE = '#6b6b6b'
const FAINT = '#9a9a9a'
const BRAND = '#d94407'
const LIGHT = '#f5853f'
const HAIR = '#ececec'

const page = (extra = {}) => ({
  width: PAGE_W, height: PAGE_H, position: 'relative', overflow: 'hidden',
  background: '#ffffff', fontFamily: 'Poppins, system-ui, sans-serif',
  color: INK, ...extra,
})

/** The orange rule every page carries, so a stack of them reads as one document. */
function Footer({ name, n, total }) {
  return (
    <div style={{ position: 'absolute', left: 64, right: 64, bottom: 34, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: FAINT }}>
        {name}
      </span>
      <span style={{ fontSize: 11, letterSpacing: '0.16em', color: FAINT }}>
        {n} / {total}
      </span>
    </div>
  )
}

// THE BAND ALONG THE BOTTOM. Ethan: "there's like a little tiny orange bar at
// the bottom that's gradient, I think it's tiny and doesn't look good." It was
// 7px of a two-stop gradient, which at 1280 wide reads as a hairline somebody
// forgot to remove rather than as a deliberate edge. 16px and a three-stop ramp
// that returns to the brand colour gives it weight and stops it looking like it
// is fading out at one end.
function Rule() {
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, height: 16,
      background: `linear-gradient(90deg, ${BRAND} 0%, ${LIGHT} 48%, ${BRAND} 100%)`,
    }} />
  )
}

// ------------------------------------------------------------------ cover ---
// Ethan: "The first page should be simple, Tryp.com logo, say Content Creator
// Community, and perhaps their name and profile pictures."
//
// SIMPLE IS THE BRIEF AND IT IS ALSO RIGHT. A cover has one job - say whose
// this is - and every extra element on it is competing with a person's name.
export function Cover({ creator, copy, total }) {
  // THE COVER PHOTO IS OVERRIDABLE. Ethan: "it currently uses their profile
  // picture, which I think is great, but they should also have the option to
  // change that to a different photo if they'd like." It lives in the `copy`
  // jsonb rather than a column of its own because that needs no migration, and
  // DDL is currently blocked. Empty/absent falls back to the profile picture,
  // so the default behaviour is unchanged.
  const chosen = typeof copy?.cover_photo === 'string' ? copy.cover_photo.trim() : ''
  const photo = chosen || creator?.photo_url
  return (
    // ONE BACKGROUND ACROSS THE WHOLE PAGE.
    //
    // Ethan: "the colour scheme doesn't really work, like it looks like a
    // gradient but then it's split on the right, like there's only a gradient
    // on the left". Exactly what it was: the 46% photo panel carried
    // `linear-gradient(150deg, BRAND0f, #fff 60%)` and the text half was flat
    // white, so the two met in a hard vertical seam down the middle of the
    // cover. The gradient now belongs to the PAGE and the panels are
    // transparent, so it crosses the whole slide and there is no seam to see.
    <div style={page({
      display: 'flex',
      background: `linear-gradient(112deg, ${BRAND}1f 0%, ${BRAND}0a 34%, #ffffff 68%)`,
    })}>
      <div style={{ flex: '0 0 42%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {photo ? (
          <img
            src={photo}
            alt=""
            crossOrigin="anonymous"
            style={{ width: 316, height: 316, borderRadius: '50%', objectFit: 'cover', boxShadow: '0 28px 70px rgba(0,0,0,0.16)', border: '6px solid #ffffff' }}
          />
        ) : (
          <div style={{ width: 316, height: 316, borderRadius: '50%', background: `${BRAND}1a`, border: '6px solid #ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 92, fontWeight: 800, color: BRAND }}>
            {(creator?.name || '?').slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>

      <div style={{ flex: 1, padding: '96px 78px 0 12px', display: 'flex', flexDirection: 'column' }}>
        {/* THE LOGO AT ITS OWN SHAPE. It was `width: 92, height: 92,
            objectFit: 'cover'` - and the asset is a 1200x630 card, so a square
            box with `cover` threw away nearly half its width and squeezed what
            was left. Ethan: "it's like really crammed into that square". The
            app header has always drawn it correctly (`h-9`, natural width), so
            this now does the same thing: fix the HEIGHT, let the width follow. */}
        <img
          src="/brand/tryp-logo.png"
          alt="Tryp.com"
          crossOrigin="anonymous"
          style={{ height: 58, width: 'auto', borderRadius: 12, objectFit: 'contain', alignSelf: 'flex-start' }}
        />

        {/* 0.34em of tracking on 12px is about four pixels between every
            letter, which is what made this line read as "weirdly spaced out".
            0.14em still reads as a kicker and still reads as words. */}
        <p style={{ marginTop: 32, fontSize: 13, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: BRAND }}>
          {copyFor(copy, 'cover_kicker')}
        </p>

        <p style={{ marginTop: 20, fontSize: 66, fontWeight: 800, lineHeight: 1.02, letterSpacing: '-0.035em' }}>
          {creator?.name || 'Creator'}
        </p>

        <p style={{ marginTop: 18, fontSize: 22, fontWeight: 600, color: SMOKE }}>
          {copyFor(copy, 'cover_role')}
        </p>

        {(creator?.city || creator?.country) && (
          <p style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 7, fontSize: 15, color: FAINT }}>
            <Icon name="pin" className="h-4 w-4" />
            {[creator.city, creator.country].filter(Boolean).join(', ')}
          </p>
        )}
      </div>
      <Footer name={creator?.name || ''} n={1} total={total} />
      <Rule />
    </div>
  )
}

// ------------------------------------------------------------------ about ---
// The proof page. Numbers first and large, because a brand decides whether to
// keep reading on this page and a paragraph is not a reason to.
export function About({ creator, copy, videos, extraPlatforms, tools, n, total }) {
  const stats = statsFrom(videos)
  const platforms = platformsFrom(videos, extraPlatforms)
  // THE LABEL AGREES WITH THE NUMBER. "1 Videos made" on a document somebody
  // is sending to a brand is the kind of small wrongness that makes the whole
  // page look automated, and a new creator's kit is exactly the one where every
  // count is 1.
  const one = (n, singular, plural) => (n === 1 ? singular : plural)
  const cells = [
    { label: 'Total views', value: compactViews(stats.views) },
    { label: one(stats.videos, 'Video made', 'Videos made'), value: stats.videos },
    { label: one(stats.challenges, 'Brief entered', 'Briefs entered'), value: stats.challenges },
    { label: one(stats.markets || 1, 'Market', 'Markets'), value: stats.markets || 1 },
  ]
  return (
    <div style={page({ padding: '64px 64px 0' })}>
      <SlideTitle>{copyFor(copy, 'about_title')}</SlideTitle>

      <div style={{ display: 'flex', gap: 54, marginTop: 30 }}>
        <div style={{ flex: '1 1 52%' }}>
          <p style={{ fontSize: 16, lineHeight: 1.72, color: SMOKE, whiteSpace: 'pre-line' }}>
            {copyFor(copy, 'about_body')}
          </p>

          {tools?.length > 0 && (
            <div style={{ marginTop: 34 }}>
              <Label>What I shoot and edit with</Label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {tools.map((t) => (
                  <span key={t} style={{ borderRadius: 999, background: '#f6f6f7', padding: '6px 13px', fontSize: 13, fontWeight: 600, color: SMOKE }}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: '1 1 48%' }}>
          <Label>{copyFor(copy, 'stats_title')}</Label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            {cells.map((c) => (
              <div key={c.label} style={{ borderRadius: 16, border: `1px solid ${HAIR}`, padding: '18px 20px' }}>
                <p style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>{c.value}</p>
                <p style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: FAINT }}>{c.label}</p>
              </div>
            ))}
          </div>

          {platforms.length > 0 && (
            <div style={{ marginTop: 26 }}>
              <Label>Where I post</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {platforms.slice(0, 4).map((p) => (
                  <div key={p.platform} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <SocialMark brand={String(p.platform).toLowerCase()} className="h-5 w-5" />
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{p.platform}</span>
                    {p.handle && <span style={{ fontSize: 13, color: FAINT }}>{p.handle}</span>}
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: FAINT }}>
                      {p.followers ? `${compactViews(p.followers)} followers` : p.entries ? `${p.entries} entered` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Footer name={creator?.name || ''} n={n} total={total} />
      <Rule />
    </div>
  )
}

// ------------------------------------------------------------------- work ---
// THE PAGE THE KIT EXISTS FOR. Six to a page in two rows of three: a 9:16
// thumbnail at that size is about 150px wide on A4, which is large enough to
// tell two videos apart and small enough that six of them read as a body of
// work rather than as six separate things.
export function Work({ creator, copy, videos, n, total }) {
  return (
    <div style={page({ padding: '58px 64px 0' })}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20 }}>
        <SlideTitle>{copyFor(copy, 'work_title')}</SlideTitle>
        <span style={{ fontSize: 12, color: FAINT }}>Most viewed first</span>
      </div>
      <p style={{ marginTop: 8, maxWidth: 640, fontSize: 14, lineHeight: 1.6, color: SMOKE }}>
        {copyFor(copy, 'work_body')}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginTop: 24 }}>
        {videos.map((v) => <VideoTile key={v.id} video={v} />)}
      </div>

      <Footer name={creator?.name || ''} n={n} total={total} />
      <Rule />
    </div>
  )
}

function VideoTile({ video }) {
  return (
    <div style={{ display: 'flex', gap: 13, alignItems: 'flex-start' }}>
      <div style={{
        flex: '0 0 84px', height: 150, borderRadius: 12, overflow: 'hidden',
        background: '#f0f0f1', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {video.thumbnail_url ? (
          <img src={video.thumbnail_url} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <Icon name="video" className="h-6 w-6" />
        )}
      </div>
      <div style={{ minWidth: 0, flex: 1, paddingTop: 2 }}>
        <p style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
          {compactViews(video.views ?? video.logged_views)}
        </p>
        <p style={{ fontSize: 11, fontWeight: 600, color: FAINT, marginTop: 2 }}>views</p>
        <p style={{ marginTop: 9, fontSize: 12, fontWeight: 700, color: SMOKE, textTransform: 'capitalize' }}>
          {video.platform}
        </p>
        {video.market && <p style={{ fontSize: 11, color: FAINT, marginTop: 1 }}>{video.market}</p>}
        {video.challenge && (
          // Two lines exactly. `line-clamp` stops the ellipsis, not the paint,
          // so the box gets an exact multiple of the line height or a sliver of
          // line three shows through as a row of chopped letter-tops.
          <p style={{
            marginTop: 7, fontSize: 11, lineHeight: '15px', height: 30, overflow: 'hidden',
            color: FAINT, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {video.challenge}
          </p>
        )}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------- awards ---
export function Awards({ creator, copy, certificates, n, total }) {
  return (
    <div style={page({ padding: '64px 64px 0' })}>
      <SlideTitle>{copyFor(copy, 'awards_title')}</SlideTitle>
      <p style={{ marginTop: 8, maxWidth: 640, fontSize: 14, lineHeight: 1.6, color: SMOKE }}>
        {copyFor(copy, 'awards_body')}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginTop: 26 }}>
        {certificates.slice(0, 6).map((c, i) => {
          const accent = c.accent || c.design?.accent || tierOf(c.tier || c.design?.tier).accent
          const title = c.title || c.design?.title || 'Certificate'
          const facts = c.facts || {}
          const line = fillTemplate(c.body || c.design?.body || '', facts).split('\n')[0]
          return (
            <div key={c.serial || i} style={{ display: 'flex', gap: 14, alignItems: 'center', borderRadius: 16, border: `1px solid ${HAIR}`, padding: '16px 18px' }}>
              <span style={{ flex: '0 0 44px', height: 44, borderRadius: '50%', background: accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={c.emblem || c.design?.emblem || 'trophy'} className="h-5 w-5" />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em' }}>{title}</p>
                {line && <p style={{ fontSize: 12, color: SMOKE, marginTop: 1 }}>{line}</p>}
                <p style={{ fontSize: 10, color: FAINT, marginTop: 4, letterSpacing: '0.1em' }}>
                  {[c.serial, c.awarded_at ? formatAwardDate(c.awarded_at) : null].filter(Boolean).join('  ·  ')}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <Footer name={creator?.name || ''} n={n} total={total} />
      <Rule />
    </div>
  )
}

// ---------------------------------------------------------------- contact ---
export function Contact({ creator, copy, videos, extraPlatforms, n, total }) {
  const platforms = platformsFrom(videos, extraPlatforms)
  const links = creator?.links || {}
  const rows = [
    links.instagram && { icon: 'instagram', label: 'Instagram', value: handleFrom(links.instagram) },
    links.tiktok && { icon: 'tiktok', label: 'TikTok', value: handleFrom(links.tiktok) },
    links.youtube && { icon: 'youtube', label: 'YouTube', value: handleFrom(links.youtube) },
    links.linkedin && { icon: 'linkedin', label: 'LinkedIn', value: handleFrom(links.linkedin) },
  ].filter(Boolean)
  const typed = platforms.filter((p) => p.handle && !rows.some((r) => r.label.toLowerCase() === p.platform.toLowerCase()))

  return (
    <div style={page({ padding: '74px 64px 0', display: 'flex', flexDirection: 'column' })}>
      <SlideTitle>{copyFor(copy, 'contact_title')}</SlideTitle>
      <p style={{ marginTop: 12, maxWidth: 620, fontSize: 16, lineHeight: 1.7, color: SMOKE }}>
        {copyFor(copy, 'contact_body')}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginTop: 34, maxWidth: 760 }}>
        {[...rows, ...typed.map((p) => ({ icon: String(p.platform).toLowerCase(), label: p.platform, value: p.handle }))].map((r) => (
          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 13, borderRadius: 14, border: `1px solid ${HAIR}`, padding: '14px 18px' }}>
            <SocialMark brand={r.icon} className="h-5 w-5" />
            <span style={{ fontSize: 13, fontWeight: 700 }}>{r.label}</span>
            <span style={{ marginLeft: 'auto', fontSize: 13, color: SMOKE }}>{r.value}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 'auto', marginBottom: 84, display: 'flex', alignItems: 'center', gap: 16 }}>
        <img src="/brand/tryp-logo.png" alt="" crossOrigin="anonymous" style={{ width: 52, height: 52, borderRadius: 12, objectFit: 'cover' }} />
        <div>
          <p style={{ fontSize: 13, fontWeight: 700 }}>Tryp.com Content Creator Community</p>
          <p style={{ fontSize: 12, color: FAINT }}>Creators making travel content across Europe</p>
        </div>
      </div>

      <Footer name={creator?.name || ''} n={n} total={total} />
      <Rule />
    </div>
  )
}

/** "https://instagram.com/sam/" -> "@sam". A kit prints handles, not URLs. */
function handleFrom(url) {
  try {
    const path = new URL(url).pathname.replace(/^\/+|\/+$/g, '').split('/')[0]
    return path ? (path.startsWith('@') ? path : `@${path}`) : url
  } catch { return url }
}

function SlideTitle({ children }) {
  return (
    <h2 style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.05, margin: 0 }}>
      {children}
    </h2>
  )
}

function Label({ children }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: FAINT, margin: 0 }}>
      {children}
    </p>
  )
}
