// RETIRED. Automatic TikTok view syncing was dropped before it ever went live.
//
// Deployed as a stub OVER the real implementation rather than deleted: removing
// the function from the repo would leave the previous working version reachable
// by anyone with the URL, and its backing tables no longer exist. Same reasoning
// as broadcast-email. Delete properly from the Supabase dashboard when convenient.
Deno.serve(() =>
  new Response(JSON.stringify({ error: 'gone', detail: 'Automatic view syncing was removed.' }), {
    status: 410,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
)
