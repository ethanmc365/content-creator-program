import Icon from '../Icon'
import SocialMark from '../SocialMark'
import { PAGE_W, PAGE_H, compactViews, copyFor, platformsFrom, statsFrom } from '../../lib/portfolio'
import { fillTemplate, formatAwardDate, tierOf } from '../../lib/certificates'

// THE PAGES OF A MEDIA KIT, AT A4 LANDSCAPE.
//
// Ethan: "Perhaps it should show on the screen exactly how the pdf will look
// like you can scroll vertically down to see each new page. It will be a4 size
// landscape."
//
// EXACTLY HOW THE PDF WILL LOOK IS A CONSTRAINT, NOT A DESCRIPTION. It is only
// true if there is ONE layout, so these pages are a fixed 1123x794 - A4
// landscape at 96dpi - and are never responsive. The screen scales them with a
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

function Rule() {
  return <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 7, background: `linear-gradient(90deg, ${BRAND}, ${LIGHT})` }} />
}

// ------------------------------------------------------------------ cover ---
// Ethan: "The first page should be simple, Tryp.com logo, say Content Creator
// Community, and perhaps their name and profile pictures."
//
// SIMPLE IS THE BRIEF AND IT IS ALSO RIGHT. A cover has one job - say whose
// this is - and every extra element on it is competing with a person's name.
export function Cover({ creator, copy, total }) {
  return (
    <div style={page({ display: 'flex' })}>
      <div style={{ flex: '0 0 46%', position: 'relative', background: `linear-gradient(150deg, ${BRAND}0f 0%, #ffffff 60%)` }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {creator?.photo_url ? (
            <img
              src={creator.photo_url}
              alt=""
              crossOrigin="anonymous"
              style={{ width: 300, height: 300, borderRadius: '50%', objectFit: 'cover', boxShadow: '0 24px 60px rgba(0,0,0,0.14)' }}
            />
          ) : (
            <div style={{ width: 300, height: 300, borderRadius: '50%', background: `${BRAND}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 84, fontWeight: 800, color: BRAND }}>
              {(creator?.name || '?').slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, padding: '78px 68px 0 20px', display: 'flex', flexDirection: 'column' }}>
        <img src="/brand/tryp-logo.png" alt="Tryp.com" crossOrigin="anonymous" style={{ width: 92, height: 92, borderRadius: 18, objectFit: 'cover' }} />
        <p style={{ marginTop: 34, fontSize: 12, fontWeight: 700, letterSpacing: '0.34em', textTransform: 'uppercase', color: BRAND }}>
          {copyFor(copy, 'cover_kicker')}
        </p>
        <p style={{ marginTop: 22, fontSize: 60, fontWeight: 800, lineHeight: 1.02, letterSpacing: '-0.03em' }}>
          {creator?.name || 'Creator'}
        </p>
        <p style={{ marginTop: 16, fontSize: 21, fontWeight: 600, color: SMOKE }}>
          {copyFor(copy, 'cover_role')}
        </p>
        {(creator?.city || creator?.country) && (
          <p style={{ marginTop: 10, fontSize: 15, color: FAINT }}>
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
