// RETIRED. A throwaway diagnostic used on 24 Aug 2026 to answer two questions
// that could not be answered from a laptop:
//
//   1. Can Deno Deploy's egress IPs reach TikTok and YouTube? TikTok yes,
//      YouTube no - it bot-blocks datacenter ranges, which is why the sync uses
//      the YouTube Data API instead of reading the watch page.
//   2. Which cookies does Instagram's media endpoint actually want? sessionid
//      alone gets a 302 to itself; sessionid + ds_user_id + csrftoken + ig_did
//      + mid returns the media. That answer is now igCookie() in view-sync.
//
// Stubbed rather than deleted, for the same reason as social-sync and
// broadcast-email: removing the function from the repo leaves the previous
// version reachable by anyone with the URL. Delete properly from the Supabase
// dashboard when convenient.
Deno.serve(() =>
  new Response(JSON.stringify({ error: 'gone', detail: 'One-off diagnostic. See supabase/functions/view-sync.' }), {
    status: 410,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
)
