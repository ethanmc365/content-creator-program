import { Link } from 'react-router-dom'
import { BROADCASTS, isBroadcastName } from './broadcastMentions'

// Rendering for chat message bodies:
//  * @mentions of known members become links to their profile,
//  * URLs become links,
//  * for admin-authored messages, lightweight markdown: **bold**, *italic*,
//    and lines starting with "# " / "## " become headings.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function renderInline(text, { rich, mentionRe, nameToId, onDark }, keyPrefix) {
  if (!text) return null
  // On the orange "own message" bubble the text is white, so links must be too.
  const mentionCls = onDark ? 'font-semibold text-white underline decoration-white/60 hover:decoration-white' : 'font-semibold text-brand hover:underline'
  const urlCls = onDark ? 'break-all font-medium text-white underline decoration-white/50 hover:decoration-white' : 'break-all font-medium text-brand underline decoration-brand/40 hover:decoration-brand'
  const parts = []
  if (mentionRe) parts.push(`(?<mention>${mentionRe})`)
  parts.push(`(?<url>https?:\\/\\/[^\\s]+)`)
  if (rich) {
    parts.push(`(?<bold>\\*\\*[^*\\n]+\\*\\*)`)
    parts.push(`(?<italic>\\*[^*\\n]+\\*|_[^_\\n]+_)`)
  }
  const re = new RegExp(parts.join('|'), 'g')
  const nodes = []
  let last = 0, m, k = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const g = m.groups
    if (g.mention) {
      const handle = g.mention.slice(1)
      const id = nameToId.get(handle)
      // @everyone / @here are not people, so they get no profile link. They are
      // drawn as a badge instead: a room-wide ping should look different from
      // "Anna", because it means something different.
      if (isBroadcastName(handle)) {
        nodes.push(
          <span
            key={`${keyPrefix}m${k}`}
            className={onDark
              ? 'rounded-md bg-white/25 px-1 py-0.5 font-semibold text-white'
              : 'rounded-md bg-brand/10 px-1 py-0.5 font-semibold text-brand'}
          >
            {g.mention}
          </span>,
        )
      } else {
        nodes.push(id
          ? <Link key={`${keyPrefix}m${k}`} to={`/profile/${id}`} className={mentionCls}>{g.mention}</Link>
          : g.mention)
      }
    } else if (g.url) {
      nodes.push(<a key={`${keyPrefix}u${k}`} href={g.url} target="_blank" rel="noopener noreferrer" className={urlCls}>{g.url}</a>)
    } else if (g.bold) {
      nodes.push(<strong key={`${keyPrefix}b${k}`} className="font-bold">{g.bold.slice(2, -2)}</strong>)
    } else if (g.italic) {
      nodes.push(<em key={`${keyPrefix}i${k}`}>{g.italic.slice(1, -1)}</em>)
    }
    last = m.index + m[0].length
    k++
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

// AN INLINE RUN THAT SPANS A LINE BREAK, HEALED AT READ TIME.
//
// The composer no longer writes these (see `wrapInline` in richEditor.js), but
// messages already sent carry them, and a message is forever. `**a\nb**` is
// re-cut into `**a**\n**b**`, which is the same claim in a form the per-line
// patterns below can actually see, and a leftover `****` on a line of its own
// disappears entirely.
//
// DOUBLE ASTERISKS ONLY, AND THAT RESTRICTION IS THE WHOLE SAFETY ARGUMENT.
// Nobody types `**` meaning two asterisks, so pairing them across a newline is
// safe. A single `*` is a different animal: "2 * 3 = 6\nand 4 * 5 = 20" pairs
// into italics under exactly the same rule and turns arithmetic into emphasis.
// Underscores are out for the same reason - they travel inside URLs
// (`.../my_trip\n.../your_photo`) and pairing those invents emphasis out of two
// unrelated links.
//
// A run with no newline inside it is returned untouched, so ordinary bold is
// never rewritten and the common path costs one `indexOf`.
function healInlineRuns(body) {
  if (!body.includes('**')) return body
  return body.replace(/\*\*([\s\S]*?)\*\*/g, (full, inner) => {
    if (!inner.includes('\n')) return full
    return inner
      .split('\n')
      .map((line) => (line.trim() ? `**${line.trim()}**` : ''))
      .join('\n')
  })
}

export function renderMessageBody(body, { rich = false, members = [], onDark = false } = {}) {
  if (!body) return null
  if (rich) body = healInlineRuns(body)
  const nameToId = new Map()
  const names = []
  for (const mem of members) {
    if (mem?.name && mem.name.length > 1) { nameToId.set(mem.name, mem.id); names.push(mem.name) }
  }
  // The two broadcast handles are always recognised. Not gated on the READER
  // being an admin: whether @here is drawn as a badge is a fact about the
  // message, and a creator seeing a plain "@here" where their team-mate sees a
  // badge would just look like it had not worked.
  for (const b of BROADCASTS) names.push(b.name)
  names.sort((a, b) => b.length - a.length) // longest first so "@Anna" beats "@Ann"
  const mentionRe = names.length ? names.map((n) => '@' + escapeRe(n)).join('|') : null
  const opts = { rich, mentionRe, nameToId, onDark }

  if (!rich) return renderInline(body, opts, 'x')

  // Rich: heading lines get their own styled block; everything else is inline.
  return body.split('\n').map((line, i) => {
    // THREE LEVELS, NOT TWO. The composer emits <h1>, <h2> and <h3>, which
    // serialize to #, ## and ### - so a message written with the third level
    // arrived at the reader as a line beginning with three literal hashes.
    // That is half of the reported "it shows hashtags and stars".
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) {
      const level = h[1].length
      // A HEADING HAS TO LOOK LIKE A HEADING.
      //
      // Body copy in a message is 14px. This ladder used to be 16 / 14 / 14 -
      // so an H2 was the SAME SIZE as the paragraph under it and differed only
      // in weight, and an H3 differed only in weight by one step. Ethan:
      // "there's barely a difference in me pressing a heading and just body
      // text." He is right, and a heading that has to be looked for is not
      // doing the one job a heading has.
      //
      // 20 / 17 / 15 against a 14px body. Each step is visible on its own, and
      // the top margin is what actually separates a section from the paragraph
      // before it - size alone reads as emphasis, size plus space reads as a
      // new section. `first:mt-0` so a message that OPENS with a heading does
      // not start with a gap.
      const cls = level === 1
        ? 'mt-3 block text-xl font-bold leading-tight tracking-[-0.01em] first:mt-0'
        : level === 2
          ? 'mt-2.5 block text-[17px] font-bold leading-snug first:mt-0'
          : 'mt-2 block text-[15px] font-bold leading-snug first:mt-0'
      return <span key={`h${i}`} className={cls}>{renderInline(h[2], opts, `h${i}`)}</span>
    }
    return <span key={`l${i}`} className="block">{renderInline(line, opts, `l${i}`) ?? ' '}</span>
  })
}

// Plain text for previews and notifications: drop markdown markers, keep @names.
export function stripMarkup(body) {
  if (!body) return ''
  return healInlineRuns(body)
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
}
