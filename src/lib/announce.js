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
//
// THE UK EXCEPTION IS GONE. While the UK was on the legacy single-conversation
// chat, its announcements had to be written with the BARE key, because that
// chat filtered on `channel = 'announcements'` with no namespace and a tidy
// `uk:announcements` would have posted into a room no UK creator could open.
// The UK is on the network shell now, so it namespaces like every other market
// and the bare keys belong to Worldwide alone, which is where the whole
// pre-network conversation lives.
/** The channel string a room's messages must carry. */
function channelKeyFor(community, base = 'announcements') {
  if (community?.kind === 'network') return base
  return `${community?.slug}:${base}`
}

// WHAT EACH ROOM MEANS WHEN YOU POST INTO IT, keyed by the room's own `key`.
//
// The dialog that shares a leaderboard asks the DATABASE which rooms a market
// actually has (a market that never opened `content_tips` was previously still
// offered it, and the share then silently posted nothing), and looks the
// consequence up here. A key that is not on this list is a room nothing is
// broadcast into - the list is the allow-list as well as the labels.
export const ROOM_LABELS = {
  announcements: { label: 'Announcements', hint: 'Notifies everyone in the market' },
  general: { label: 'General chat', hint: 'Posts without a notification' },
  content_tips: { label: 'Content Tips', hint: 'For anything creators can learn from' },
}

/**
 * @param {object} opts
 * @param {string[]} opts.communityIds  markets to post into; empty = worldwide
 * @param {string} opts.body            the message
 * @param {string} opts.senderId
 * @param {object} [opts.extra]        extra message columns (e.g. a card ref)
 * @returns {Promise<{posted: number, error: any}>}
 */
export async function announceToMarkets({ communityIds = [], body, senderId, extra = {} }) {
  return postToRooms({ communityIds, base: 'announcements', body, senderId, extra })
}

/**
 * The same delivery, into whichever room was chosen. `announceToMarkets` is this
 * with `announcements` hard-coded, kept because most callers only ever want that.
 *
 * @param {string} opts.base  'announcements' | 'general' | 'content_tips'
 */
export async function postToRooms({ communityIds = [], base = 'announcements', body, senderId, extra = {} }) {
  // A card-only post (a leaderboard, a poll) carries no prose, so an empty body
  // is legitimate as long as SOMETHING is being said. Requiring text here is
  // what stopped the winners card from being shareable at all.
  const hasCard = Object.keys(extra).length > 0
  if ((!body?.trim() && !hasCard) || !senderId) return { posted: 0, error: null }

  // One query for the rooms rather than one per market, and it carries the
  // community's slug and kind so the key can be built without a second lookup.
  let q = supabase
    .from('channels')
    .select('id, key, community_id, communities:community_id(slug, kind)')
    .eq('key', base)
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
    channel: channelKeyFor(r.communities, base),
    channel_id: r.id,
    community_id: r.community_id,
    sender_id: senderId,
    body: (body ?? '').trim(),
    ...extra,
  }))
  const { error: insErr } = await supabase.from('messages').insert(rows)
  return { posted: insErr ? 0 : rows.length, error: insErr }
}
