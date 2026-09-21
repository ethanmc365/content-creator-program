// THE OPENING OF A BRIEF, AS PLAIN WORDS (21 Sep 2026).
//
// Ethan, of the challenge cards: "it's showing all the text, and it's showing
// the text incorrectly. Some of it is a title, and some of it is bold, but
// rather than actually showing that, it's just showing hashtags and stars...
// Maybe just show the first paragraph."
//
// A brief is markdown (lib/richEditor). A card has room for a few lines, not
// for headings and lists, so this takes the FIRST PARAGRAPH of prose - skipping
// the headings above it - and strips the inline marks so "**bold**" reads as
// "bold". Anything longer than `max` is cut on a word with an ellipsis.

const stripInline = (s) => s
  .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .replace(/__([^_]+)__/g, '$1')
  .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
  .replace(/(^|[^_\w])_([^_\n]+)_/g, '$1$2')
  .replace(/~~([^~]+)~~/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/[*_]{2,}/g, '')
  .replace(/\s+/g, ' ')
  .trim()

/** { text, more } - the first paragraph as plain text, and whether the brief goes on past it. */
export function briefExcerpt(md = '', max = 240) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n')
  const para = []
  let i = 0
  for (; i < lines.length; i += 1) {
    const t = lines[i].trim()
    const structural = !t || /^#{1,6}\s/.test(t) || /^-{3,}$/.test(t)
    if (structural) {
      if (para.length) break
      continue
    }
    para.push(t.replace(/^[-*]\s+(\[[ xX]\]\s+)?|^\d+\.\s+|^>\s?/, ''))
  }
  let text = stripInline(para.join(' '))
  let cut = false
  if (text.length > max) {
    const at = text.lastIndexOf(' ', max)
    text = `${text.slice(0, at > max * 0.6 ? at : max).replace(/[\s,;:.-]+$/, '')}…`
    cut = true
  }
  const rest = lines.slice(i).some((l) => l.trim())
  return { text, more: cut || rest }
}
