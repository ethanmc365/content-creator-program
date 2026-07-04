import { Link } from 'react-router-dom'

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
      const id = nameToId.get(g.mention.slice(1))
      nodes.push(id
        ? <Link key={`${keyPrefix}m${k}`} to={`/profile/${id}`} className={mentionCls}>{g.mention}</Link>
        : g.mention)
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

export function renderMessageBody(body, { rich = false, members = [], onDark = false } = {}) {
  if (!body) return null
  const nameToId = new Map()
  const names = []
  for (const mem of members) {
    if (mem?.name && mem.name.length > 1) { nameToId.set(mem.name, mem.id); names.push(mem.name) }
  }
  names.sort((a, b) => b.length - a.length) // longest first so "@Anna" beats "@Ann"
  const mentionRe = names.length ? names.map((n) => '@' + escapeRe(n)).join('|') : null
  const opts = { rich, mentionRe, nameToId, onDark }

  if (!rich) return renderInline(body, opts, 'x')

  // Rich: heading lines get their own styled block; everything else is inline.
  return body.split('\n').map((line, i) => {
    const h = line.match(/^(#{1,2})\s+(.*)$/)
    if (h) {
      return <span key={`h${i}`} className={h[1].length === 1 ? 'block text-base font-bold' : 'block text-sm font-semibold'}>{renderInline(h[2], opts, `h${i}`)}</span>
    }
    return <span key={`l${i}`} className="block">{renderInline(line, opts, `l${i}`) ?? ' '}</span>
  })
}

// Plain text for previews and notifications: drop markdown markers, keep @names.
export function stripMarkup(body) {
  if (!body) return ''
  return body
    .replace(/^#{1,2}\s+/gm, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
}
