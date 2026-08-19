import { supabase } from './supabase'

// POST SOMETHING INTO THE ANNOUNCEMENTS ROOMS IT BELONGS TO.
//
// Ethan, about a "find a time": "I think as well as appearing on the calendar
// page, it should go into the announcements chat of the appropriate chat. If
// its a global 'find a time' then to the global announcements, if its a spanish
// one then to spanish announcements, if its a german and romanian one then to
// both their announcements, creators can access it quickly there."
//
// That is the right instinct and it generalises: anything scoped to a set of
// markets has an obvious set of rooms to be mentioned in, and a calendar page
// nobody has open is a bad place to put something time-sensitive. Posting into
// announcements also means it goes out as a notification, because posting there
// already broadcasts (see the trigger behind `notify_all`) - so this reuses the
// whole delivery path rather than adding a second one.
//
// THE CHANNEL KEY IS NAMESPACED FOR A CHAPTER AND BARE FOR THE NETWORK. Market
// rooms write `spain:announcements` precisely so they can never collide with
// legacy Chat.jsx's `.eq('channel', 'announcements')`; the worldwide room keeps
// the bare key and IS the one the legacy UK chat reads. Getting this backwards
// would put a Spanish poll in front of 43 UK creators.
//
// AN EMPTY MARKET LIST MEANS THE NETWORK, which is the same convention
// `events.community_ids` uses: nothing named means everybody.

/**
 * @param {object} opts
 * @param {string[]} opts.communityIds  markets to post into; empty = worldwide
 * @param {string} opts.body            the message
 * @param {string} opts.senderId
 * @returns {Promise<{posted: number, error: any}>}
 */
export async function announceToMarkets({ communityIds = [], body, senderId }) {
  if (!body?.trim() || !senderId) return { posted: 0, error: null }

  // One query for the rooms rather than one per market, and it carries the
  // community's slug and kind so the key can be built without a second lookup.
  let q = supabase
    .from('channels')
    .select('id, key, community_id, communities:community_id(slug, kind)')
    .eq('key', 'announcements')
  if (communityIds.length) q = q.in('community_id', communityIds)
  const { data: rooms, error } = await q
  if (error) return { posted: 0, error }

  const targets = communityIds.length
    ? (rooms ?? [])
    // Nothing named: the worldwide room only. Posting a global item into all
    // seven announcement rooms would arrive seven times for anybody in more
    // than one market.
    : (rooms ?? []).filter((r) => r.communities?.kind === 'network')

  if (!targets.length) return { posted: 0, error: null }

  const rows = targets.map((r) => ({
    channel: r.communities?.kind === 'network' ? 'announcements' : `${r.communities?.slug}:announcements`,
    channel_id: r.id,
    community_id: r.community_id,
    sender_id: senderId,
    body: body.trim(),
  }))
  const { error: insErr } = await supabase.from('messages').insert(rows)
  return { posted: insErr ? 0 : rows.length, error: insErr }
}
