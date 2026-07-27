// Supabase Edge Function: broadcast-email  (RETIRED, Jul 27 2026)
//
// This function used to mail every active creator at once. It is deliberately
// dead: sending a run of near-identical messages from a shared mailbox is what
// got the platform flagged as a bulk sender, and Gmail began blocking the mail.
//
// It is kept as a stub rather than removed because the old version is already
// DEPLOYED. Deleting the directory would leave that live version reachable by
// anyone with an admin session and the URL, so it is overwritten instead. Once
// this stub has been deployed over it, the mass-send path is genuinely gone.
//
// What replaced it:
//   - welcome emails   -> the send-welcome function, one recipient at a time,
//                         after an admin approves it on /admin/email
//   - password resets  -> Supabase Auth over SMTP (see auth-gate)
//   - reaching everyone-> copy the address list from /admin/email and send from
//                         a real mailing tool
//
// Deploy: supabase functions deploy broadcast-email --no-verify-jwt
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  return new Response(
    JSON.stringify({
      error: 'Broadcast email has been retired. Copy the creator address list from the email page and send from a mailing tool instead.',
    }),
    { status: 410, headers: { ...cors, 'Content-Type': 'application/json' } },
  )
})
