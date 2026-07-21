import { Fragment } from 'react'

// A tiny Notion-lite markdown renderer for admin notes. Block level:
//   # / ## / ###   headings
//   - / *          bullet list
//   1.             numbered list
//   - [ ] / - [x]  checklist
//   >              quote
//   ---            divider
// Inline: **bold**  *italic*  `code`  [text](url)
// Deliberately small and dependency-free; not a full CommonMark parser.

const INLINE_RE = /(\*\*([^*]+)\*\*|\*([^*\n]+)\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/

function inline(text, keyBase) {
  const out = []
  let rest = text
  let k = 0
  while (rest) {
    const m = rest.match(INLINE_RE)
    if (!m) { out.push(<Fragment key={`${keyBase}-${k}`}>{rest}</Fragment>); break }
    if (m.index > 0) out.push(<Fragment key={`${keyBase}-${k++}`}>{rest.slice(0, m.index)}</Fragment>)
    if (m[2]) out.push(<strong key={`${keyBase}-${k++}`}>{m[2]}</strong>)
    else if (m[3]) out.push(<em key={`${keyBase}-${k++}`}>{m[3]}</em>)
    else if (m[4]) out.push(<code key={`${keyBase}-${k++}`} className="rounded bg-cloud px-1.5 py-0.5 text-[0.85em] text-brand">{m[4]}</code>)
    else if (m[5]) out.push(<a key={`${keyBase}-${k++}`} href={m[6]} target="_blank" rel="noopener noreferrer" className="text-brand underline">{m[5]}</a>)
    rest = rest.slice(m.index + m[0].length)
  }
  return out
}

// Turn a note's markdown into an array of React block elements.
export function renderNote(md = '') {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let list = null
  const flush = () => { if (list) { blocks.push(list); list = null } }

  lines.forEach((line, i) => {
    if (/^\s*---\s*$/.test(line)) { flush(); blocks.push({ type: 'hr', key: i }); return }
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) { flush(); blocks.push({ type: 'h', level: h[1].length, text: h[2], key: i }); return }
    const q = line.match(/^>\s?(.*)$/)
    if (q) { flush(); blocks.push({ type: 'quote', text: q[1], key: i }); return }
    const chk = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/)
    if (chk) {
      if (!list || list.type !== 'check') { flush(); list = { type: 'check', items: [], key: i } }
      list.items.push({ checked: chk[1] !== ' ', text: chk[2] }); return
    }
    const ul = line.match(/^\s*[-*]\s+(.*)$/)
    if (ul) {
      if (!list || list.type !== 'ul') { flush(); list = { type: 'ul', items: [], key: i } }
      list.items.push({ text: ul[1] }); return
    }
    const ol = line.match(/^\s*\d+\.\s+(.*)$/)
    if (ol) {
      if (!list || list.type !== 'ol') { flush(); list = { type: 'ol', items: [], key: i } }
      list.items.push({ text: ol[1] }); return
    }
    if (!line.trim()) { flush(); return }
    flush(); blocks.push({ type: 'p', text: line, key: i })
  })
  flush()

  return blocks.map((b) => {
    if (b.type === 'hr') return <hr key={b.key} className="my-5 border-gray-200" />
    if (b.type === 'h') {
      if (b.level === 1) return <h2 key={b.key} className="mb-2 mt-5 text-2xl font-bold text-ink first:mt-0">{inline(b.text, `h${b.key}`)}</h2>
      if (b.level === 2) return <h3 key={b.key} className="mb-2 mt-4 text-xl font-bold text-ink first:mt-0">{inline(b.text, `h${b.key}`)}</h3>
      return <h4 key={b.key} className="mb-1.5 mt-3 text-lg font-semibold text-ink first:mt-0">{inline(b.text, `h${b.key}`)}</h4>
    }
    if (b.type === 'quote') return <blockquote key={b.key} className="my-2 border-l-2 border-brand pl-3 italic text-smoke">{inline(b.text, `q${b.key}`)}</blockquote>
    if (b.type === 'ul') return <ul key={b.key} className="my-2 list-disc space-y-1 pl-5 text-ink/90">{b.items.map((it, j) => <li key={j}>{inline(it.text, `ul${b.key}-${j}`)}</li>)}</ul>
    if (b.type === 'ol') return <ol key={b.key} className="my-2 list-decimal space-y-1 pl-5 text-ink/90">{b.items.map((it, j) => <li key={j}>{inline(it.text, `ol${b.key}-${j}`)}</li>)}</ol>
    if (b.type === 'check') return (
      <ul key={b.key} className="my-2 space-y-1.5">
        {b.items.map((it, j) => (
          <li key={j} className="flex items-start gap-2">
            <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${it.checked ? 'border-brand bg-brand text-white' : 'border-gray-300'}`}>
              {it.checked && <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4L19 6" /></svg>}
            </span>
            <span className={it.checked ? 'text-smoke line-through' : 'text-ink/90'}>{inline(it.text, `ck${b.key}-${j}`)}</span>
          </li>
        ))}
      </ul>
    )
    return <p key={b.key} className="my-2 leading-relaxed text-ink/90">{inline(b.text, `p${b.key}`)}</p>
  })
}

// A plain-text preview line for the note cards.
export function noteExcerpt(md = '', max = 150) {
  const plain = md
    .replace(/^\s*-{3,}\s*$/gm, '')
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/^\s*[-*]\s+\[[ xX]\]\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[>*_`#]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > max ? `${plain.slice(0, max)}…` : plain
}
