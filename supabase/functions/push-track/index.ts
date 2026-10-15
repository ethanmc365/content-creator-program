// Supabase Edge Function: push-track
//
// The phone tells us two things the server cannot know: that a push was SHOWN (`delivered`) and
// that it was TAPPED (`clicked`). public/sw.js posts them here.
//
// A service worker has no user session, so this is unauthenticated (`--no-verify-jwt`) and is
// therefore built to be harmless: it only ever INSERTS one analytics row, only for a notification
// id that exists (a random UUID nobody can guess), only for the two events above, and it ignores a
// repeat of the same event for the same notification. The worst a stranger can do is add a
// "clicked" to a notification they already know the id of.
//
// Deploy:  supabase functions deploy push-track --no-verify-jwt --use-api

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(req) })
  const ok = () => new Response('ok', { status: 200, headers: corsHeaders(req) })
  try {
    // text/plain on purpose: a service worker's no-cors fetch can send nothing else.
    const body = JSON.parse(await req.text())
    const id = String(body?.n || '')
    const event = String(body?.e || '')
    if (!UUID.test(id) || !['delivered', 'clicked'].includes(event)) return ok()
    const { data: n } = await supabase.from('notifications').select('id, recipient_id, type').eq('id', id).maybeSingle()
    if (!n) return ok()
    // ONE STATEMENT, NOT CHECK-THEN-INSERT (15 Oct 2026). A phone reports the same event twice at once (the service
    // worker and the page), both checks found nothing, and the second insert hit `push_events_one_per_event`: 21
    // unique-violation errors a day in the database log. The index already says "once"; this just lets it.
    await supabase.from('push_events').upsert(
      { notification_id: n.id, recipient_id: n.recipient_id, type: n.type, event },
      { onConflict: 'notification_id,event', ignoreDuplicates: true },
    )
  } catch (e) {
    console.error('push-track', String(e))
  }
  return ok()
})
