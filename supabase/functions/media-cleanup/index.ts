// media-cleanup: permanently removes storage objects for deleted content.
// Called by DB triggers (via pg_net) whenever a chat message is moderated
// away, a DM / gallery photo / feedback report is deleted, so media never
// lingers in storage after its row is gone. Secured by the same
// x-webhook-secret as notify-dispatch; deletes run with the service role.
import { createClient } from 'npm:@supabase/supabase-js@2'

const ALLOWED = new Set(['chat-media', 'dm-media', 'gallery', 'avatars'])

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  if (req.headers.get('x-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) {
    return new Response('unauthorized', { status: 401 })
  }

  let urls: unknown
  try {
    ;({ urls } = await req.json())
  } catch {
    return new Response('bad json', { status: 400 })
  }
  if (!Array.isArray(urls)) return new Response('bad body', { status: 400 })

  // Accepts full public/signed/render URLs and bare dm-media storage paths
  // ("<uid>/dm-....mp4"). Videos also queue their legacy poster .jpg sibling.
  const byBucket = new Map<string, Set<string>>()
  const add = (bucket: string, path: string) => {
    if (!ALLOWED.has(bucket) || !path || path.includes('..')) return
    const set = byBucket.get(bucket) ?? new Set<string>()
    set.add(path)
    if (/\.(mp4|mov|m4v|webm)$/i.test(path)) set.add(path.replace(/\.[^.]+$/, '.jpg'))
    byBucket.set(bucket, set)
  }
  for (const raw of urls) {
    if (typeof raw !== 'string' || !raw) continue
    const m = raw.match(/\/storage\/v1\/(?:object|render\/image)\/(?:public|sign|authenticated)\/([^/]+)\/([^?]+)/)
    if (m) add(m[1], decodeURIComponent(m[2]))
    else if (!raw.includes('://')) add('dm-media', raw.split('?')[0])
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const results: Record<string, unknown> = {}
  for (const [bucket, paths] of byBucket) {
    const { data, error } = await supabase.storage.from(bucket).remove([...paths])
    results[bucket] = error ? { error: error.message } : { removed: (data ?? []).length }
  }
  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json' },
  })
})
