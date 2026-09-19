// RETIRED. A throwaway diagnostic used on 24 Aug 2026 to answer two questions
// that could not be answered from a laptop:
//
//   1. Can Deno Deploy's egress IPs reach TikTok and YouTube? TikTok yes,
//      YouTube no - it bot-blocks datacenter ranges, which is why the sync uses
//      the YouTube Data API instead of reading the watch page.
//   2. Which cookies does Instagram's media endpoint actually want? sessionid
//      alone gets a 302 to itself; sessionid + ds_user_id + csrftoken + ig_did
//      + mid returns the media.
//
// That second answer is now HISTORY, not code (note corrected 18 Sep 2026: it
// used to say "that answer is now igCookie() in view-sync", and no such
// function has existed since 25 Aug 2026). Instagram warned the Tryp.com UK
// account for automated behaviour, so the session cookie was deleted outright
// and view-sync reads the PUBLIC reels tab with no credential at all.
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
