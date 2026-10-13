// Supabase Edge Function: notify-dispatch
// Triggered by a Database Webhook on INSERT into public.notifications.
// Sends a Web Push to every device the recipient registered. This is what makes
// notifications arrive when the PWA is fully closed.
//
// THIS FUNCTION NO LONGER SENDS EMAIL (rebuild, Jul 27 2026).
//
// It used to email the "important" categories and park broadcasts in an
// approval queue. Sending a run of near-identical messages from a shared
// mailbox got the platform flagged as a bulk sender and Gmail began blocking
// the mail outright, so automatic email is off across the board. The platform
// now sends exactly two kinds of email, neither of them from here:
//
//   - password resets, sent by Supabase Auth over SMTP (see auth-gate)
//   - a welcome email per accepted creator, queued by a database trigger and
//     written by an admin from their own mailbox via /admin/email
//
// Notifications themselves are unaffected: the in-app bell row is always
// written by notify_user/notify_all, and push still goes out instantly below.
//
// Deploy:  supabase functions deploy notify-dispatch --no-verify-jwt
// Secrets: supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...
// Webhook: Database → Webhooks → on INSERT public.notifications → POST this function URL.
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!

webpush.setVapidDetails('mailto:hello@tryp.com', VAPID_PUBLIC, VAPID_PRIVATE)

const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')

Deno.serve(async (req) => {
  // Only the database webhook (which knows the shared secret) may call this.
  //
  // IT FAILS CLOSED (2 Sep 2026). The check used to be
  // `if (WEBHOOK_SECRET && header !== WEBHOOK_SECRET)`, so an UNSET secret
  // skipped the whole check and left an unauthenticated push-notification
  // sender - attacker-chosen title, body and LINK, delivered to the phone of
  // whichever creator id was named - open to the internet. The secret is set in
  // production today, which is the only reason that was latent rather than
  // live; a rotation that briefly cleared it would have opened it. A function
  // whose safety depends on an environment variable being present must refuse
  // to run when it is not. media-cleanup already gets this right.
  if (!WEBHOOK_SECRET || req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('unauthorized', { status: 401 })
  }

  try {
    const payload = await req.json().catch(() => ({}))
    // ONE CALL PER INSERT STATEMENT, NOT PER ROW (migration 391, 12 Oct 2026).
    // A message in a big room inserts ~200 notification rows in one statement.
    // The old row trigger fired this function 200 times at once, each making
    // 3-4 REST calls: ~800 requests in ten seconds, the PostgREST pool (20)
    // saturated and Supabase warned that the database was running out of
    // connections. The statement trigger now posts `records` in chunks, and the
    // lookups below are one query per chunk. A single `record` still works.
    const list: any[] = (Array.isArray(payload.records) ? payload.records : [payload.record ?? payload])
      .filter((n: any) => n?.recipient_id)
    if (!list.length) return new Response('no recipient', { status: 200 })

    const ids = [...new Set(list.map((n) => n.recipient_id))]

    // notif_prefs gates device push per notification type. The in-app row
    // already exists either way, because the bell is the always-on inbox.
    //
    // EXCEPT FOR ANNOUNCEMENTS, WHICH NOBODY CAN TURN OFF (12 Sep 2026).
    // Ethan: "never for announcements or anything from the Tryp.com". The
    // settings screen no longer draws a switch for it and the database ignores
    // a mute on an announcements room, and this is the third place the rule
    // lives - deliberately, because a `notif_prefs.announcement: false` already
    // saved by the old screen would otherwise keep suppressing them for ever.
    const LOCKED_TYPES = ['announcement']
    const [{ data: profiles }, { data: allSubs }] = await Promise.all([
      supabase.from('profiles').select('id, notif_prefs').in('id', ids),
      supabase.from('push_subscriptions').select('*').in('user_id', ids),
    ])
    const prefsOf = new Map((profiles ?? []).map((p: any) => [p.id, p.notif_prefs]))
    const subsOf = new Map<string, any[]>()
    for (const s of allSubs ?? []) subsOf.set(s.user_id, [...(subsOf.get(s.user_id) ?? []), s])

    // EVERY OUTCOME IS COUNTED AND EVERY FAILURE IS LOGGED (21 Sep 2026).
    // A failure that was not a 404/410 used to vanish into an empty catch, so
    // Apple refusing a push and a push being delivered looked identical from
    // here: the function answered 200 and nobody's phone buzzed. Ethan: "I
    // haven't been getting notifications recently." The log line carries the
    // push service's own status and reason, and the host rather than the
    // endpoint, which is a capability URL.
    const tally = { sent: 0, failed: 0, removed: 0, muted: 0 }
    // THE LEDGER (migration 283): every outcome is a row, so "was it sent to everyone with push
    // on" is a query. Rows are collected and written in ONE insert at the end; a ledger write
    // can never fail the push itself.
    const rows: any[] = []
    const ledger = (n: any, event: string, host?: string, e?: any) => rows.push({
      notification_id: n.id ?? null, recipient_id: n.recipient_id, type: n.type, event,
      host: host ?? null, status_code: e?.statusCode ?? null,
      detail: e ? String(e?.body ?? e?.message ?? e).slice(0, 300) : null,
    })
    const gone: string[] = []

    const one = async (n: any) => {
      if (!LOCKED_TYPES.includes(n.type) && prefsOf.get(n.recipient_id)?.[n.type] === false) {
        tally.muted += 1
        ledger(n, 'muted')
        return
      }
      const subs = subsOf.get(n.recipient_id) ?? []
      if (!subs.length) { ledger(n, 'no_device'); return }
      const body = JSON.stringify({
        title: n.title, body: n.body ?? '', link: n.link || '/notifications', tag: n.id,
      })
      await Promise.all(subs.map(async (s) => {
        const host = (() => { try { return new URL(s.endpoint).host } catch { return '?' } })()
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body,
            // High urgency so a phone in low-power mode still wakes for it; a
            // push nobody could deliver within three days is noise by then.
            { urgency: 'high', TTL: 60 * 60 * 24 * 3 },
          )
          tally.sent += 1
          ledger(n, 'sent', host)
        } catch (err) {
          const e = err as { statusCode?: number; body?: unknown; message?: string }
          // 404/410 mean the browser threw the subscription away (uninstalled the
          // PWA, cleared site data). Drop it so we stop retrying forever. The app
          // re-registers the device the next time it is opened (lib/push).
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            gone.push(s.endpoint)
            tally.removed += 1
            ledger(n, 'removed', host, e)
          } else {
            tally.failed += 1
            ledger(n, 'failed', host, e)
          }
          console.error('push failed', JSON.stringify({
            host, status: e?.statusCode ?? null, reason: String(e?.body ?? e?.message ?? e).slice(0, 300),
            type: n.type, recipient: n.recipient_id,
          }))
        }
      }))
    }

    // Pushes go to Apple/Google, not the database, but keep them in waves of 25
    // so one huge batch cannot open hundreds of sockets at once.
    for (let i = 0; i < list.length; i += 25) await Promise.all(list.slice(i, i + 25).map(one))

    try {
      if (gone.length) await supabase.from('push_subscriptions').delete().in('endpoint', gone)
      if (rows.length) await supabase.from('push_events').insert(rows)
    } catch (_e) { /* the push matters more than its receipt */ }

    return new Response(JSON.stringify({ ...tally, notifications: list.length }), { status: 200, headers: { 'content-type': 'application/json' } })
  } catch (e) {
    // A webhook that 500s gets retried; log the reason and answer 200 so a bad
    // payload cannot wedge the queue.
    console.error('notify-dispatch failed', e)
    return new Response('error', { status: 200 })
  }
})
