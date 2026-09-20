import Icon from '../Icon'
import SocialMark, { BRAND_COLOR } from '../SocialMark'
import { PAGE_W, PAGE_H, compactViews, copyFor, platformsFrom, statsFrom } from '../../lib/portfolio'
import { alpha, fillTemplate, formatAwardDate, shift, tierOf } from '../../lib/certificates'

// THE PAGES OF A MEDIA KIT, AT 16:9.
//
// EXACTLY HOW THE PDF WILL LOOK IS A CONSTRAINT, NOT A DESCRIPTION. It is only
// true if there is ONE layout, so these pages are a fixed 1280x720 and are
// never responsive. The screen scales them with a transform and the export
// photographs them at 2x. A responsive page would mean the preview and the PDF
// were two different documents and the preview would be a lie, which is the
// exact bug `lib/domSnapshot` was written to end.
//
// EVERYTHING IS INLINE STYLE AND NOT TAILWIND, deliberately, in a codebase that
// is Tailwind everywhere else. These nodes get cloned by `snapshotNode`, which
// writes every COMPUTED style onto the clone - so classes do resolve. But they
// resolve to whatever the app's stylesheet says TODAY, including dark mode,
// which remaps colour utilities: a creator with dark mode on would export a
// black portfolio. A printed page has no theme. (Tailwind SIZE classes are
// safe and are still used on `Icon`, which takes className only.)
//
// ---------------------------------------------------------------------------
// THE REDESIGN (20 Sep 2026)
//
// Ethan: "the actual slide deck gets improved. I don't really like the
// background color for it, like that weird gradient again. Fix it. I want it
// completely redesigned, improved, better fonts, better spacing, better design,
// better colors, maybe more features."
//
// WHAT THE GRADIENT WAS. The cover was `linear-gradient(112deg, BRAND1f, BRAND0a
// 34%, #fff 68%)` across the whole page - a pale orange wash fading out
// diagonally. It was put there to fix a worse bug (the wash used to be on the
// photo panel only, so the two halves met in a hard seam down the middle) and
// it fixed that and kept the thing underneath: a page whose ground is a weak
// tint of the brand colour looks like a template with a colour picker on it.
//
// What replaced it is a DECISION rather than a wash: the left third of the
// cover is a solid brand panel and the rest is white. Same colour, same brand,
// but it now reads as a designed block instead of a stain - and it is the same
// idea as the certificate's Rail layout, so a creator's kit and their
// certificate look like they came from one place.
//
// THE FONT. Instrument Serif for the creator's name and every slide title,
// Poppins for everything scanned rather than read. This is the single change
// that does the most: a deck set entirely in a geometric sans is a slide deck,
// and a media kit that looks like a slide deck looks like it was made in ten
// minutes. It is self-hosted and embedded by `domSnapshot`, so the PDF and the
// screen are the same face - see index.css.
//
// THE WORK PAGE. "Rather than having the small cards, I would have the preview
// cards bigger on the page and then maybe the views and details over the image
// on like a separate card showing it." Four true 9:16 tiles across, each with a
// white card sitting ON the image carrying the number. Four per page and not
// six: 264px wide is exactly a quarter of the content width, and 9:16 at 264 is
// the shape the video actually is.
// ---------------------------------------------------------------------------

const INK = '#16171C'
const SMOKE = '#5E6068'
const FAINT = '#9A9CA4'
const BRAND = '#d94407'
const HAIR = '#ececee'

const SANS = 'Poppins, system-ui, sans-serif'
const SERIF = '"Instrument Serif", Georgia, "Times New Roman", serif'

/**
 * THE KIT'S OWN ACCENT.
 *
 * Ethan asked for "more customization features" and, about the certificates,
 * "a lot of different colors". A media kit is the one document in this product
 * that is the CREATOR'S rather than the programme's - it goes out under their
 * name, to their brands - so the colour of it is the most obvious thing to let
 * them choose, and the least risky: every layout below is white with one accent
 * in it, so changing that one value changes the whole deck coherently and
 * cannot produce something unreadable.
 *
 * It is the SAME ten-colour palette the certificate studio uses (ACCENTS in
 * lib/certificates), which is the point - a creator's kit and the certificate
 * on page four then look like they came from one place.
 *
 * Stored in the `copy` jsonb, so no migration, and anything that is not a plain
 * six-digit hex falls back to Tryp orange rather than being trusted into a
 * style attribute.
 */
export function theme(copy) {
  const raw = typeof copy?.accent === 'string' ? copy.accent.trim() : ''
  const accent = /^#[0-9a-f]{6}$/i.test(raw) ? raw : BRAND
  return {
    accent,
    deep: shift(accent, -0.3),
    tint: alpha(accent, 0.07),
    line: alpha(accent, 0.16),
  }
}

const page = (extra = {}) => ({
  width: PAGE_W, height: PAGE_H, position: 'relative', overflow: 'hidden',
  background: '#ffffff', fontFamily: SANS, color: INK, ...extra,
})

/** The name and the page number, on every page, so a stack reads as one document. */
function Footer({ name, n, total, tone = FAINT }) {
  return (
    <div style={{
      position: 'absolute', left: 64, right: 64, bottom: 30,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: tone }}>
        {name}
      </span>
      <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.16em', color: tone }}>
        {n} / {total}
      </span>
    </div>
  )
}

// THE BAND ALONG THE BOTTOM, AND IT IS SOLID NOW.
//
// It was a three-stop brand-to-light-to-brand ramp. On a page where the word
// "gradient" has now been the complaint twice, a decorative one along the foot
// of every slide is the easiest thing to stop defending: a solid 10px brand
// edge does the same job - it closes the page and ties the five together - and
// there is nothing in it to dislike.
function Rule({ accent = BRAND }) {
  return <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 10, background: accent }} />
}

function SlideTitle({ children, size = 46, color = INK }) {
  return (
    <h2 style={{
      fontFamily: SERIF, fontWeight: 400, fontSize: size, letterSpacing: '-0.005em',
      lineHeight: 1.04, margin: 0, color,
    }}>
      {children}
    </h2>
  )
}

function Label({ children, color = FAINT }) {
  return (
    <p style={{
      fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.16em',
      textTransform: 'uppercase', color, margin: 0,
    }}>
      {children}
    </p>
  )
}

/** The short accent rule that sits under a title on every interior page. */
function TitleRule({ accent = BRAND, width = 72 }) {
  return <div style={{ width, height: 4, borderRadius: 4, background: accent, marginTop: 16 }} />
}

// ------------------------------------------------------------------ cover ---
// Ethan: "The first page should be simple, Tryp.com logo, say Content Creator
// Community, and perhaps their name and profile pictures."
//
// SIMPLE IS THE BRIEF AND IT IS ALSO RIGHT. A cover has one job - say whose
// this is - and every extra element on it competes with a person's name.
export function Cover({ creator, copy, videos, extraPlatforms, total }) {
  // THE COVER PHOTO IS OVERRIDABLE. Ethan: "it currently uses their profile
  // picture, which I think is great, but they should also have the option to
  // change that to a different photo." It lives in the `copy` jsonb rather than
  // a column of its own because that needed no migration. Empty falls back to
  // the profile picture, so the default behaviour is unchanged.
  const chosen = typeof copy?.cover_photo === 'string' ? copy.cover_photo.trim() : ''
  const photo = chosen || creator?.photo_url
  const links = socialRows(creator, videos, extraPlatforms).slice(0, 5)
  const t = theme(copy)
  const PANEL = 492

  return (
    <div style={page({ display: 'flex' })}>
      {/* A SOLID PANEL, NOT A WASH ACROSS THE PAGE. See the note at the top of
          this file - the diagonal tint is what "that weird gradient" was. The
          vertical shade inside the panel is the same two-tone the certificate
          rail uses, which is what stops a 492px block of flat orange looking
          like a colour swatch. */}
      <div style={{
        flex: `0 0 ${PANEL}px`, position: 'relative',
        background: `linear-gradient(170deg, ${t.accent} 0%, ${t.deep} 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <img
          src="/brand/tryp-logo.png"
          alt="Tryp.com"
          crossOrigin="anonymous"
          style={{
            position: 'absolute', top: 44, left: 52, height: 40, width: 'auto',
            objectFit: 'contain', borderRadius: 8, background: '#ffffff', padding: 6,
          }}
        />
        {photo ? (
          <img
            src={photo}
            alt=""
            crossOrigin="anonymous"
            style={{
              width: 306, height: 306, borderRadius: '50%', objectFit: 'cover',
              border: '7px solid #ffffff', boxShadow: '0 26px 60px rgba(0,0,0,0.22)',
            }}
          />
        ) : (
          <div style={{
            width: 306, height: 306, borderRadius: '50%', background: 'rgba(255,255,255,0.16)',
            border: '7px solid #ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: SERIF, fontSize: 118, color: '#ffffff',
          }}>
            {(creator?.name || '?').slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>

      <div style={{
        flex: 1, minWidth: 0, padding: '0 76px', display: 'flex',
        flexDirection: 'column', justifyContent: 'center',
      }}>
        {/* 0.34em of tracking on 12px is four pixels between every letter, which
            is what made this line read as "weirdly spaced out". */}
        <p style={{
          margin: 0, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.16em',
          textTransform: 'uppercase', color: t.accent,
        }}>
          {copyFor(copy, 'cover_kicker')}
        </p>

        <p style={{
          margin: '22px 0 0', fontFamily: SERIF, fontWeight: 400,
          fontSize: nameSize(creator?.name), lineHeight: 1.02, letterSpacing: '-0.012em',
        }}>
          {creator?.name || 'Creator'}
        </p>

        <div style={{ width: 84, height: 4, borderRadius: 4, background: t.accent, margin: '26px 0 22px' }} />

        <p style={{ margin: 0, fontSize: 21, fontWeight: 500, color: SMOKE }}>
          {copyFor(copy, 'cover_role')}
        </p>

        {(creator?.city || creator?.country) && (
          <p style={{ margin: '12px 0 0', display: 'flex', alignItems: 'center', gap: 7, fontSize: 14.5, color: FAINT }}>
            <Icon name="pin" className="h-4 w-4" />
            {[creator.city, creator.country].filter(Boolean).join(', ')}
          </p>
        )}

        {/* THE PLATFORMS, ON THE COVER. One extra fact and it is the one a
            brand looks for first after the name - and the marks carry their own
            colours, so it is four shapes rather than four words. */}
        {links.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 34 }}>
            {links.map((r) => (
              <SocialMark key={r.brand + r.label} brand={r.brand} className="h-7 w-7" tile />
            ))}
          </div>
        )}
      </div>

      <Footer name={creator?.name || ''} n={1} total={total} />
      <Rule accent={t.accent} />
    </div>
  )
}

/** The name is the loudest thing on the cover, and it must still fit. */
function nameSize(name) {
  const n = String(name || '').length
  if (n <= 12) return 82
  if (n <= 18) return 68
  if (n <= 26) return 54
  if (n <= 34) return 44
  return 36
}

// ------------------------------------------------------------------ about ---
// The proof page. Numbers first and large, because a brand decides whether to
// keep reading on this page and a paragraph is not a reason to.
export function About({ creator, copy, videos, extraPlatforms, tools, n, total }) {
  const stats = statsFrom(videos)
  const t = theme(copy)
  const platforms = socialRows(creator, videos, extraPlatforms)
  // THE LABEL AGREES WITH THE NUMBER. "1 Videos made" on a document somebody is
  // sending to a brand is the kind of small wrongness that makes a whole page
  // look automated, and a new creator's kit is the one where every count is 1.
  const one = (count, singular, plural) => (count === 1 ? singular : plural)
  const cells = [
    { label: 'Total views', value: compactViews(stats.views), lead: true },
    { label: 'Best video', value: compactViews(stats.best) },
    { label: one(stats.videos, 'Video made', 'Videos made'), value: stats.videos },
    { label: 'Average views', value: compactViews(stats.average) },
    { label: one(stats.challenges, 'Brief entered', 'Briefs entered'), value: stats.challenges },
    stats.platforms > 1
      ? { label: 'Platforms', value: stats.platforms }
      : { label: one(stats.markets || 1, 'Market', 'Markets'), value: stats.markets || 1 },
  ]
  return (
    <div style={page({ padding: '58px 64px 0' })}>
      <SlideTitle>{copyFor(copy, 'about_title')}</SlideTitle>
      <TitleRule accent={t.accent} />

      <div style={{ display: 'flex', gap: 56, marginTop: 34 }}>
        <div style={{ flex: '1 1 50%', minWidth: 0 }}>
          {/* 17/1.8 rather than 16/1.72. Ethan: "if this everything looks like
              cram, then that's spaced out nicely." A media kit paragraph is
              read once, slowly, by somebody deciding something - it can afford
              the leading, and the cap on this field was raised to match the
              room it actually has. */}
          <p style={{ margin: 0, fontSize: 17, lineHeight: 1.8, color: SMOKE, whiteSpace: 'pre-line' }}>
            {copyFor(copy, 'about_body')}
          </p>

          {tools?.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <Label>What I shoot and edit with</Label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {tools.map((tool) => (
                  <span key={tool} style={{
                    borderRadius: 999, background: t.tint, border: `1px solid ${t.line}`,
                    padding: '7px 14px', fontSize: 12.5, fontWeight: 600, color: SMOKE,
                  }}>
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: '1 1 50%', minWidth: 0 }}>
          <Label>{copyFor(copy, 'stats_title')}</Label>
          {/* THE LEAD FIGURE CARRIES THE BRAND AND THE REST SIT ON A TINT, so
              the eye lands on total views and then reads the supporting five.
              Six outlined white boxes with black numerals was the least
              emphatic thing on a page that exists to make a case. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 11, marginTop: 14 }}>
            {cells.map((c) => (
              <div
                key={c.label}
                style={{
                  borderRadius: 16,
                  background: c.lead ? t.accent : t.tint,
                  border: c.lead ? 'none' : `1px solid ${t.line}`,
                  padding: '16px 16px 14px',
                }}
              >
                <p style={{
                  margin: 0, fontFamily: SERIF, fontSize: c.lead ? 38 : 33, fontWeight: 400,
                  letterSpacing: '-0.01em', lineHeight: 1, color: c.lead ? '#ffffff' : INK,
                }}>
                  {c.value}
                </p>
                <p style={{
                  margin: '9px 0 0', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em',
                  textTransform: 'uppercase', color: c.lead ? 'rgba(255,255,255,0.88)' : FAINT,
                }}>
                  {c.label}
                </p>
              </div>
            ))}
          </div>

          {platforms.length > 0 && (
            <div style={{ marginTop: 30 }}>
              <Label>Where I post</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 12 }}>
                {platforms.slice(0, 4).map((p) => (
                  <PlatformRow key={p.brand + p.label} row={p} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Footer name={creator?.name || ''} n={n} total={total} />
      <Rule accent={t.accent} />
    </div>
  )
}

/**
 * One platform, as a LINK.
 *
 * Ethan: "we have where I post here, which would show their socials, which is
 * good. I think they should also be clickable links because you already have
 * the links to their socials that they put on whenever they're signing up."
 *
 * An anchor inside a PNG is a rectangle that does nothing, so this is inert in
 * the exported PDF - but the deck is real DOM on `/portfolio`, on the profile
 * embed and on the public `/p/` page, and on all three of those this is the
 * thing somebody wants to click. Costing nothing in the export and working on
 * every screen is the whole argument.
 *
 * `rel="noopener noreferrer"` because these are creator-supplied URLs.
 */
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
    borderRadius: 12, border: `1px solid ${HAIR}`, padding: '9px 13px', background: '#ffffff',
  }
  if (!row.url) return <div style={style}>{inner}</div>
  return <a href={row.url} target="_blank" rel="noopener noreferrer" style={style}>{inner}</a>
}

// ------------------------------------------------------------------- work ---
// THE PAGE THE KIT EXISTS FOR.
export function Work({ creator, copy, videos, n, total }) {
  const t = theme(copy)
  return (
    <div style={page({ padding: '52px 64px 0' })}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
        <div style={{ minWidth: 0 }}>
          <SlideTitle size={40}>{copyFor(copy, 'work_title')}</SlideTitle>
          <p style={{ margin: '10px 0 0', maxWidth: 700, fontSize: 13.5, lineHeight: 1.6, color: SMOKE }}>
            {copyFor(copy, 'work_body')}
          </p>
        </div>
        <span style={{
          flexShrink: 0, borderRadius: 999, background: t.tint, border: `1px solid ${t.line}`,
          padding: '6px 13px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
          textTransform: 'uppercase', color: t.accent,
        }}>
          Most viewed first
        </span>
      </div>

      {/* FOUR ACROSS, AT EXACTLY THE SHAPE A VERTICAL VIDEO IS. 264px is a
          quarter of the 1152px content width and 264x470 is 9:16 to the pixel,
          so a phone-shot frame fills the tile with no crop at all. It was six
          84x150 thumbnails with the numbers BESIDE them in a column of text,
          which is a spreadsheet of videos rather than a body of work. */}
      <div style={{ display: 'flex', gap: 32, marginTop: 24 }}>
        {videos.map((v) => <VideoTile key={v.id} video={v} />)}
        {videos.length === 0 && (
          <div style={{
            flex: 1, height: 470, borderRadius: 20, border: `1px dashed ${HAIR}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, color: FAINT,
          }}>
            The work goes here once the first brief is entered.
          </div>
        )}
      </div>

      <Footer name={creator?.name || ''} n={n} total={total} />
      <Rule accent={t.accent} />
    </div>
  )
}

/**
 * One video: the frame, with the number on a card SITTING ON IT.
 *
 * Ethan: "rather than having the small cards, I would have the preview cards
 * bigger on the page and then maybe the views and details over the image on
 * like a separate card showing it."
 *
 * The card is opaque white rather than a translucent scrim, for the reason
 * every overlaid caption eventually learns: a scrim is legible over a dark
 * frame and illegible over a bright sky, and a media kit cannot choose its
 * creator's thumbnails. A solid card is legible over anything.
 */
function VideoTile({ video }) {
  return (
    <div style={{
      flex: '0 0 264px', width: 264, height: 470, position: 'relative',
      borderRadius: 20, overflow: 'hidden', background: '#f1f1f3',
      boxShadow: '0 10px 30px rgba(22,23,28,0.10)',
    }}>
      {video.thumbnail_url ? (
        <img
          src={video.thumbnail_url}
          alt=""
          crossOrigin="anonymous"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: FAINT,
        }}>
          <Icon name="video" className="h-8 w-8" />
        </div>
      )}

      {/* The platform, top-left, on its own mark. One glyph says what this is
          without spending a line of the card on the word. */}
      <span style={{
        position: 'absolute', top: 12, left: 12, display: 'flex', alignItems: 'center',
        gap: 6, borderRadius: 999, background: 'rgba(255,255,255,0.95)', padding: '5px 10px 5px 6px',
      }}>
        <SocialMark brand={String(video.platform || '').toLowerCase()} className="h-4 w-4" tile />
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'capitalize', color: INK }}>
          {video.platform}
        </span>
      </span>

      <div style={{
        position: 'absolute', left: 12, right: 12, bottom: 12,
        borderRadius: 14, background: '#ffffff', padding: '12px 14px',
        boxShadow: '0 8px 22px rgba(22,23,28,0.18)',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
          <span style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.01em' }}>
            {compactViews(video.views ?? video.logged_views)}
          </span>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: FAINT }}>
            views
          </span>
        </div>
        {video.challenge && (
          // Two lines exactly. `line-clamp` stops the ellipsis, not the paint,
          // so the box needs an exact multiple of the line height or a sliver
          // of line three shows through as a row of chopped letter-tops.
          <p style={{
            margin: '8px 0 0', fontSize: 11, lineHeight: '15px', height: 30, overflow: 'hidden',
            color: SMOKE, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {video.challenge}
          </p>
        )}
        {video.market && (
          <p style={{ margin: '5px 0 0', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: FAINT }}>
            {video.market}
          </p>
        )}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------- awards ---
export function Awards({ creator, copy, certificates, n, total }) {
  const t = theme(copy)
  return (
    <div style={page({ padding: '58px 64px 0' })}>
      <SlideTitle>{copyFor(copy, 'awards_title')}</SlideTitle>
      <TitleRule accent={t.accent} />
      <p style={{ margin: '18px 0 0', maxWidth: 700, fontSize: 14, lineHeight: 1.65, color: SMOKE }}>
        {copyFor(copy, 'awards_body')}
      </p>

      {/* ONE COLUMN WHEN THERE ARE ONE OR TWO. A two-column grid holding a
          single card is a card and a hole, and most creators have one or two
          certificates for a long time before they have six. */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: certificates.length > 2 ? 'repeat(2, 1fr)' : '1fr',
        gap: 16, marginTop: 28,
      }}>
        {certificates.slice(0, 6).map((c, i) => {
          const accent = c.accent || c.design?.accent || tierOf(c.tier || c.design?.tier).accent
          const title = c.title || c.design?.title || 'Certificate'
          const facts = c.facts || {}
          const line = fillTemplate(c.body || c.design?.body || '', facts).split('\n')[0]
          return (
            // A LEFT EDGE IN THE CERTIFICATE'S OWN ACCENT, not a coloured disc
            // with an icon in it. The certificate itself stopped drawing an
            // emblem when it was redesigned; a card here showing a trophy the
            // real object does not have is advertising the wrong thing. The
            // accent is the one property a creator would recognise from the
            // certificate they are holding.
            <div key={c.serial || i} style={{
              display: 'flex', gap: 16, alignItems: 'center', borderRadius: 16,
              border: `1px solid ${HAIR}`, borderLeft: `5px solid ${accent}`, padding: '16px 20px',
            }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ margin: 0, fontFamily: SERIF, fontSize: 21, fontWeight: 400, lineHeight: 1.15 }}>{title}</p>
                {line && <p style={{ margin: '4px 0 0', fontSize: 12.5, color: SMOKE }}>{line}</p>}
                <p style={{ margin: '8px 0 0', fontSize: 9.5, fontWeight: 600, color: FAINT, letterSpacing: '0.1em' }}>
                  {[c.serial, c.awarded_at ? formatAwardDate(c.awarded_at) : null].filter(Boolean).join('  ·  ')}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <Footer name={creator?.name || ''} n={n} total={total} />
      <Rule accent={t.accent} />
    </div>
  )
}

// ---------------------------------------------------------------- contact ---
export function Contact({ creator, copy, videos, extraPlatforms, n, total }) {
  const rows = socialRows(creator, videos, extraPlatforms)
  const t = theme(copy)
  return (
    <div style={page({ padding: '62px 64px 0', display: 'flex', flexDirection: 'column' })}>
      <SlideTitle>{copyFor(copy, 'contact_title')}</SlideTitle>
      <TitleRule accent={t.accent} />
      <p style={{ margin: '20px 0 0', maxWidth: 660, fontSize: 16, lineHeight: 1.75, color: SMOKE }}>
        {copyFor(copy, 'contact_body')}
      </p>

      {/* THE TILES CARRY THE PLATFORM'S OWN COLOUR. Ethan: "the work with me, I
          think we can have the custom colored social media icons... but just
          ensure they're clickable links." Both: `tile` draws the real brand
          colour with the glyph knocked out in white, and every card is an
          anchor. */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: rows.length > 2 ? 'repeat(2, 1fr)' : '1fr',
        gap: 14, marginTop: 30, maxWidth: rows.length > 2 ? 820 : 480,
      }}>
        {rows.map((r) => <ContactCard key={r.brand + r.label} row={r} fallback={t.accent} />)}
        {rows.length === 0 && (
          <p style={{ margin: 0, fontSize: 14, color: FAINT }}>
            Add your links on your profile and they appear here.
          </p>
        )}
      </div>

      <div style={{
        marginTop: 'auto', marginBottom: 76, display: 'flex', alignItems: 'center', gap: 16,
        borderTop: `1px solid ${HAIR}`, paddingTop: 22,
      }}>
        {/* THE LOGO AT ITS OWN SHAPE, ON THIS PAGE TOO. Ethan: "I still notice
            errors with the tryp.com logo. You fixed it for the first slide, but
            not the last slide on the portfolio." Exactly right - this one was
            still `width: 52, height: 52, objectFit: 'cover'` on a 1200x630
            asset, which throws away more than half its width. Fix the HEIGHT,
            let the width follow; `contain`, never `cover`. */}
        <img
          src="/brand/tryp-logo.png"
          alt="Tryp.com"
          crossOrigin="anonymous"
          style={{ height: 40, width: 'auto', objectFit: 'contain', borderRadius: 8 }}
        />
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>Tryp.com Content Creator Community</p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: FAINT }}>
            Creators making travel content across Europe
          </p>
        </div>
      </div>

      <Footer name={creator?.name || ''} n={n} total={total} />
      <Rule accent={t.accent} />
    </div>
  )
}

function ContactCard({ row, fallback = BRAND }) {
  const tint = BRAND_COLOR[row.brand] && BRAND_COLOR[row.brand] !== 'currentColor'
    ? BRAND_COLOR[row.brand]
    : fallback
  const inner = (
    <>
      <SocialMark brand={row.brand} className="h-9 w-9" tile />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: INK }}>{row.label}</span>
        <span style={{
          display: 'block', marginTop: 1, fontSize: 12.5, color: SMOKE,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {row.handle || row.meta || ''}
        </span>
      </span>
      <Icon name="link" className="h-4 w-4" />
    </>
  )
  const style = {
    display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', color: FAINT,
    borderRadius: 16, border: `1px solid ${HAIR}`, borderBottom: `3px solid ${tint}1f`,
    padding: '15px 18px', background: '#ffffff',
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
