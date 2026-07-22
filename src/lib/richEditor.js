// Markdown <-> HTML for the app's WYSIWYG surfaces (admin Notes + admin chat
// composer). We store the small, portable markdown the rest of the app already
// understands (renderNote / renderMessageBody), but let admins EDIT it on a
// clean contentEditable surface where the markers (# ** * > -) are hidden and
// headings/bold/lists just look like themselves.
//
// Deliberately tiny and dependency-free - it only supports the block/inline set
// the app uses: # ## ### headings, **bold**, *italic*, `code`, - / 1. lists,
// - [ ] checklists, > quotes, --- dividers, [text](url) links and @mentions.

const escapeHtml = (s = '') =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ---------------------------------------------------------------- inline md->html
// Runs on a single already-html-escaped line. Order matters: links and bold are
// resolved before italics so a lone * inside **..** is never mistaken for emphasis.
function inlineToHtml(text, { mentionNames } = {}) {
  let html = escapeHtml(text)
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
  html = html.replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?])/g, '$1<em>$2</em>')
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>')
  if (mentionNames?.length) {
    const re = new RegExp('@(' + mentionNames.map(escapeRe).join('|') + ')', 'g')
    html = html.replace(re, '<span class="rt-mention" data-mention="$1" contenteditable="false">@$1</span>')
  }
  return html || '<br>'
}

// ---------------------------------------------------------------- block md->html
// Turn stored markdown into an HTML string ready to drop into a contentEditable.
// `inlineOnly` (chat) skips block structure and just returns formatted lines.
export function mdToHtml(md = '', opts = {}) {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  if (opts.inlineOnly) {
    return lines
      .map((l) => {
        const h = l.match(/^(#{1,3})\s+(.*)$/)
        const body = inlineToHtml(h ? h[2] : l, opts)
        // Real heading tags so the toolbar's block formatting and the CSS both
        // treat them like everywhere else; plain lines are simple <div>s.
        return h ? `<h${h[1].length}>${body}</h${h[1].length}>` : `<div>${body}</div>`
      })
      .join('')
  }

  const out = []
  let list = null // { type, html }
  const flush = () => { if (list) { out.push(list.html + `</${list.type}>`); list = null } }

  lines.forEach((line) => {
    if (/^\s*---\s*$/.test(line)) { flush(); out.push('<hr>'); return }
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) { flush(); out.push(`<h${h[1].length}>${inlineToHtml(h[2], opts)}</h${h[1].length}>`); return }
    const q = line.match(/^>\s?(.*)$/)
    if (q) { flush(); out.push(`<blockquote>${inlineToHtml(q[1], opts)}</blockquote>`); return }
    const chk = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/)
    if (chk) {
      if (!list || list.type !== 'ul' || !list.check) { flush(); list = { type: 'ul', check: true, html: '<ul data-check="1">' } }
      const done = chk[1] !== ' '
      list.html += `<li data-checked="${done ? '1' : '0'}">${inlineToHtml(chk[2], opts)}</li>`
      return
    }
    const ul = line.match(/^\s*[-*]\s+(.*)$/)
    if (ul) {
      if (!list || list.type !== 'ul' || list.check) { flush(); list = { type: 'ul', check: false, html: '<ul>' } }
      list.html += `<li>${inlineToHtml(ul[1], opts)}</li>`
      return
    }
    const ol = line.match(/^\s*\d+\.\s+(.*)$/)
    if (ol) {
      if (!list || list.type !== 'ol') { flush(); list = { type: 'ol', html: '<ol>' } }
      list.html += `<li>${inlineToHtml(ol[1], opts)}</li>`
      return
    }
    if (!line.trim()) { flush(); return }
    flush(); out.push(`<p>${inlineToHtml(line, opts)}</p>`)
  })
  flush()
  return out.join('') || '<p><br></p>'
}

// ---------------------------------------------------------------- html->md
const BLOCK = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'hr', 'ul', 'ol', 'li'])
// nbsp -> space, and drop the zero-width caret anchors the editor uses when
// toggling bold/italic off (they must never reach the stored markdown).
const clean = (s = '') => s.replace(/\u00A0/g, ' ').replace(/[\u200B\u200C\uFEFF]/g, '')

// Serialize a SINGLE node (with its own inline wrapper) to markdown. Defensive:
// a block element nested inside inline content (execCommand can do this) drops a
// newline rather than concatenating two logical lines together.
function inlineNode(n) {
  if (n.nodeType === 3) return n.nodeValue
  if (n.nodeType !== 1) return ''
  const tag = n.tagName.toLowerCase()
  if (n.dataset?.mention) return '@' + n.dataset.mention
  if (tag === 'br') return '\n'
  if (tag === 'strong' || tag === 'b') return `**${inlineToMd(n)}**`
  if (tag === 'em' || tag === 'i') return `*${inlineToMd(n)}*`
  if (tag === 'code') return `\`${inlineToMd(n)}\``
  if (tag === 'a') {
    const href = n.getAttribute('href') || ''
    const txt = inlineToMd(n)
    return href ? `[${txt}](${href})` : txt
  }
  if (BLOCK.has(tag)) return '\n' + inlineToMd(n) + '\n'
  return inlineToMd(n)
}

// Serialize the inline CONTENT (children) of a node to markdown.
function inlineToMd(node) {
  let md = ''
  node.childNodes.forEach((n) => { md += inlineNode(n) })
  return md
}

// Flatten a heading / list-item to a single clean line (nested blocks collapse to
// spaces so a heading never swallows a following paragraph as run-on text).
const oneLine = (el) => clean(inlineToMd(el)).replace(/\s*\n\s*/g, ' ').trim()

// Walk a container into an ordered list of block descriptors. Recurses into
// p/div so nested structures (whatever the browser's execCommand produced) still
// serialize with real line breaks instead of a concatenated blob.
function blocksOf(container) {
  const blocks = []
  let pending = ''
  const flushPending = () => {
    clean(pending).split('\n').forEach((l) => { if (l.trim() !== '') blocks.push({ type: 'p', text: l.trim() }) })
    pending = ''
  }
  container.childNodes.forEach((n) => {
    if (n.nodeType === 3) { pending += n.nodeValue; return }
    if (n.nodeType !== 1) return
    const tag = n.tagName.toLowerCase()
    if (tag === 'br') { pending += '\n'; return }
    if (!BLOCK.has(tag)) { pending += inlineNode(n); return }
    flushPending()
    if (tag === 'hr') { blocks.push({ type: 'hr' }); return }
    if (/^h[1-6]$/.test(tag)) { blocks.push({ type: 'h', level: Math.min(3, +tag[1]), text: oneLine(n) }); return }
    if (tag === 'blockquote') { blocks.push({ type: 'quote', text: oneLine(n) }); return }
    if (tag === 'ul') {
      const check = n.dataset?.check === '1'
      const items = []
      n.querySelectorAll(':scope > li').forEach((li) => items.push({ text: oneLine(li), checked: check ? li.dataset?.checked === '1' : null }))
      if (items.length) blocks.push({ type: 'ul', check, items })
      return
    }
    if (tag === 'ol') {
      const items = []
      n.querySelectorAll(':scope > li').forEach((li) => items.push({ text: oneLine(li) }))
      if (items.length) blocks.push({ type: 'ol', items })
      return
    }
    // p / div / pre: recurse so nested blocks become their own lines.
    const sub = blocksOf(n)
    if (sub.length) blocks.push(...sub)
    else blocks.push({ type: 'empty' })
  })
  flushPending()
  return blocks
}

// Turn one block descriptor into its markdown string (may be multi-line).
function blockToMd(b) {
  switch (b.type) {
    case 'hr': return '---'
    case 'h': return '#'.repeat(b.level) + ' ' + b.text
    case 'quote': return b.text.split('\n').map((l) => '> ' + l).join('\n')
    case 'ul': return b.items.map((i) => '- ' + (i.checked === null ? '' : i.checked ? '[x] ' : '[ ] ') + i.text).join('\n')
    case 'ol': return b.items.map((i, k) => `${k + 1}. ` + i.text).join('\n')
    case 'empty': return ''
    default: return b.text
  }
}

// Serialize a whole contentEditable root back to stored markdown.
//  * block mode (notes): blocks are separated by a blank line for readable,
//    portable markdown.
//  * inlineOnly (chat): top-level lines are soft breaks joined with a single
//    newline so a two-line message doesn't grow blank lines.
export function htmlToMd(root, { inlineOnly = false } = {}) {
  if (!root) return ''
  const blocks = blocksOf(root)
  if (inlineOnly) {
    const md = blocks.map(blockToMd).join('\n').replace(/[ \t]+$/gm, '')
    return md.replace(/^\n+|\n+$/g, '')
  }
  const md = blocks.filter((b) => b.type !== 'empty').map(blockToMd).join('\n\n')
  return md.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
}

// ---------------------------------------------------------------- caret helpers
// The text immediately before the caret within its own text node - used by the
// chat composer to detect an in-progress @mention without a textarea.
export function textBeforeCaret() {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return ''
  const range = sel.getRangeAt(0)
  const node = range.startContainer
  if (node.nodeType !== 3) return ''
  return node.nodeValue.slice(0, range.startOffset)
}
