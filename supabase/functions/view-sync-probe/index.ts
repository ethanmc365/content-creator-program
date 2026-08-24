// RETIRED. A throwaway probe used on 24 Aug 2026 to answer one question before
// `view-sync` was designed around the answer: can Deno Deploy's egress IPs reach
// TikTok at all, or does it only work from a residential connection? They can.
//
// Stubbed rather than deleted, for the same reason as social-sync and
// broadcast-email: removing the function from the repo leaves the previous
// version reachable by anyone with the URL. Delete properly from the Supabase
// dashboard when convenient.
Deno.serve(() =>
  new Response(JSON.stringify({ error: 'gone', detail: 'One-off connectivity probe. See supabase/functions/view-sync.' }), {
    status: 410,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
)
