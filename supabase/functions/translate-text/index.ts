// Supabase Edge Function: translate-text
//
// TRANSLATES WHAT A PERSON WROTE - a challenge brief, its rules - into the reader's
// language, ONCE, and remembers the answer.
//
// The rule the platform keeps everywhere else is that anything a person wrote stays
// exactly as they wrote it, and that is still true: the original is never touched and
// is always one press away. A translation is a second, labelled, cached layer keyed on
// a hash of the exact source text and the target language (`content_translations`,
// migration 281). Edit the source and the hash changes, so an old translation can never
// be shown beside words it was not made from. A market lead can correct any of them,
// and a corrected one (auto = false) is never overwritten.
//
// WHO MAY CALL IT: a signed-in user. WHAT IT WILL DO: translate text into one of the
// platform's four languages, at most 8 items of 6,000 characters. It fetches nothing the
// caller names, so it is not a proxy.
//
// THE ENGINE. If a secret `ANTHROPIC_API_KEY` is set, Claude does the translating (it
// keeps markdown, tone and travel vocabulary far better). Without it the function falls
// back to a free machine-translation endpoint, so the feature works today and gets better
// the day somebody adds the key. Either way the row records `src_lang`, so text that was
// already in the reader's language is stored as `same` and shown untouched.
//
// Deploy:  supabase functions deploy translate-text --no-verify-jwt --use-api

import { createClient } from 'npm:@supabase/supabase-js@2'
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''

const LANGS: Record<string, string> = { en: 'English', es: 'Spanish', pt: 'European Portuguese', de: 'German', ro: 'Romanian' }

const json = (req: Request, obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })

const JWKS = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`))
async function verifyUser(jwt: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(jwt, JWKS, { issuer: `${SUPABASE_URL}/auth/v1`, audience: 'authenticated' })
    return payload.sub ? String(payload.sub) : null
  } catch {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${jwt}` } })
      if (!res.ok) return null
      const user = await res.json()
      return user?.id ?? null
    } catch {
      return null
    }
  }
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

type Result = { value: string; src: string | null }

// ---- engine 1: Claude, when a key is configured ---------------------------------
async function withClaude(text: string, target: string): Promise<Result> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      system:
        `You translate text for a travel-creator community platform into ${LANGS[target]}. ` +
        'Keep every markdown mark (**bold**, lists, line breaks, links, hashtags, emoji, numbers, prices, dates) exactly where it is. ' +
        'Keep brand and product names (Tryp.com, TikTok, Instagram) unchanged. Use natural, friendly, native phrasing, not word-for-word. ' +
        'If the text is ALREADY in the target language, return it unchanged. ' +
        'Reply with ONLY a JSON object: {"src":"<ISO 639-1 code of the original language>","text":"<the translation>"}.',
      messages: [{ role: 'user', content: text }],
    }),
    signal: AbortSignal.timeout(45000),
  })
  if (!res.ok) throw new Error(`claude ${res.status}`)
  const body = await res.json()
  const raw = String(body?.content?.[0]?.text ?? '')
  const m = raw.match(/\{[\s\S]*\}/)
  const parsed = JSON.parse(m ? m[0] : raw)
  return { value: String(parsed.text ?? ''), src: parsed.src ? String(parsed.src).toLowerCase().slice(0, 2) : null }
}

// One chunk through a free engine. Google's endpoint first (best quality), and MyMemory when it
// refuses: Supabase's shared egress addresses are rate-limited by Google (429), and a second free
// door keeps the feature working. MyMemory takes at most 500 characters, so a long chunk is
// re-cut small for it.
async function freeChunk(chunk: string, target: string): Promise<{ text: string; src: string | null }> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(chunk)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Mozilla/5.0' } })
    if (!res.ok) throw new Error(`mt ${res.status}`)
    const data = await res.json()
    return {
      text: (data[0] as unknown[][]).map((p) => String(p[0] ?? '')).join(''),
      src: typeof data[2] === 'string' ? data[2].toLowerCase().slice(0, 2) : null,
    }
  } catch (_e) {
    const parts = chunk.match(/[\s\S]{1,450}(?:\s|$)/g) || [chunk]
    let src: string | null = null
    const texts: string[] = []
    for (const part of parts) {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(part)}&langpair=${encodeURIComponent(`Autodetect|${target}`)}`
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) throw new Error(`mm ${res.status}`)
      const data = await res.json()
      if (data?.responseStatus && Number(data.responseStatus) !== 200) throw new Error(`mm ${data.responseStatus}`)
      texts.push(String(data?.responseData?.translatedText ?? part))
      const d = data?.responseData?.detectedLanguage
      if (!src && typeof d === 'string' && d) src = d.toLowerCase().slice(0, 2)
    }
    return { text: texts.join(''), src }
  }
}

// ---- engine 2: a free machine-translation endpoint --------------------------------
// Paragraph by paragraph (the endpoint has a length limit and paragraph breaks are
// the one piece of layout worth keeping), each sentence-safe under ~1,800 characters.
async function withFree(text: string, target: string): Promise<Result> {
  const paras = text.split(/\n/)
  let src: string | null = null
  const out: string[] = []
  for (const para of paras) {
    if (!para.trim()) { out.push(para); continue }
    const chunks: string[] = []
    let cur = ''
    for (const sentence of para.split(/(?<=[.!?])\s+/)) {
      if ((cur + ' ' + sentence).length > 1800 && cur) { chunks.push(cur); cur = sentence } else { cur = cur ? `${cur} ${sentence}` : sentence }
    }
    if (cur) chunks.push(cur)
    const pieces: string[] = []
    for (const chunk of chunks) {
      const r = await freeChunk(chunk, target)
      pieces.push(r.text)
      if (!src && r.src) src = r.src
    }
    out.push(pieces.join(' '))
  }
  // The free engine likes to put spaces inside markdown marks ("** bold **").
  const value = out.join('\n').replace(/\*\*\s*([^*\n]+?)\s*\*\*/g, '**$1**').replace(/\[\s+([^\]]+?)\s+\]\(/g, '[$1](')
  return { value, src }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'POST only' }, 405)

  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const userId = jwt ? await verifyUser(jwt) : null
  if (!userId) return json(req, { error: 'Sign in first.' }, 401)

  let body: { items?: { text: string }[]; target?: string; ephemeral?: boolean }
  try { body = await req.json() } catch { return json(req, { error: 'Bad request.' }, 400) }
  const target = String(body.target || '')
  if (!LANGS[target]) return json(req, { error: 'Unknown language.' }, 400)
  const items = (body.items || []).slice(0, 8).map((i) => String(i?.text ?? '')).filter((t) => t.trim().length > 0 && t.length <= 6000)
  if (items.length === 0) return json(req, { results: [] })

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
  const results: { text: string; value: string; same: boolean; src_lang: string | null; auto: boolean }[] = []

  for (const text of items) {
    const hash = await sha256(`${target}\n${text}`)
    // EPHEMERAL = a draft for the language editor: an interface sentence being suggested to a
    // translator, who may change it. Nothing is read from or written to the cache, so those
    // suggestions never appear among the translated briefs.
    if (body.ephemeral) {
      try {
        const r = ANTHROPIC_KEY ? await withClaude(text, target) : await withFree(text, target)
        results.push({ text, value: r.value, same: false, src_lang: r.src, auto: true })
      } catch (e) {
        console.error('draft failed', String(e))
        results.push({ text, value: '', same: true, src_lang: null, auto: true })
      }
      continue
    }
    // Somebody may have translated it (or a lead corrected it) since the client looked.
    const { data: existing } = await admin.from('content_translations').select('value, same, src_lang, auto').eq('source_hash', hash).eq('locale', target).maybeSingle()
    if (existing) { results.push({ text, value: existing.value, same: existing.same, src_lang: existing.src_lang, auto: existing.auto }); continue }
    try {
      const r = ANTHROPIC_KEY ? await withClaude(text, target) : await withFree(text, target)
      const same = r.src === target || r.value.trim() === text.trim()
      await admin.from('content_translations').upsert({
        source_hash: hash, locale: target, source: text, value: same ? text : r.value, src_lang: r.src, same, auto: true,
      }, { onConflict: 'source_hash,locale', ignoreDuplicates: true })
      results.push({ text, value: same ? text : r.value, same, src_lang: r.src, auto: true })
    } catch (e) {
      // A failed translation is the ORIGINAL text, unmarked. The next reader tries again.
      console.error('translate failed', String(e))
      results.push({ text, value: text, same: true, src_lang: null, auto: true })
    }
  }
  return json(req, { results })
})
