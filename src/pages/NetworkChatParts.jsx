import { motion } from 'motion/react'
import { scopedChannel } from '../context/UnreadContext'
import PollCard from '../components/PollCard'
import GameEventCard from '../components/GameEventCard'
import ResourceCard from '../components/ResourceCard'
import LiveLeaderboardCard from '../components/LiveLeaderboardCard'
import { cx } from '../lib/utils'
import { SOFT_SPRING } from '../lib/motion'

// Per-market chat. Spain's General, the UK's General and the Worldwide General
// are three separate rooms that happen to share a layout.
//
// HOW THEY ARE KEPT APART, AND WHY IT MATTERS
//
// The live Chat.jsx that 43 creators use every day selects with
// `.eq('channel', 'general')` on a TEXT column. If a Spanish message were
// written with channel='general' it would appear in the UK creators' chat. So
// every chapter room writes a NAMESPACED key, `<slug>:<key>`, which that query
// can never match. Rooms cannot merge by construction, not by care.
//
// Worldwide is the exception and deliberately so: its General IS the existing
// conversation (111 of the platform's 128 messages), so it keeps the bare key
// and shows the real thread rather than an empty room pretending to be it.
//
// MOBILE
//
// This page used to be a plain card with `h-[min(70vh,640px)]`, which on a
// phone means: the room header floats somewhere in the middle of the screen,
// the software keyboard covers the last few messages, and the tab bar sits on
// top of the composer. Chat.jsx solved all of that a while ago with a fixed
// overlay pinned to the visual viewport, and the geometry there is hard-won
// (see the notes in useKeyboardInset). This uses the same geometry rather than
// inventing a second answer that will drift from it.

// Imported rather than redefined: the read watermark is written under this
// string and the unread dot is looked up under it, so a second copy of the rule
// is a second chance for the two to disagree. See context/UnreadContext.
export const scopedKey = scopedChannel

// What the rooms already read this session: channel lists by community, the sidebar, and messages by room. Module
// level, so it outlives the page unmounting when somebody opens a profile and comes back.
export const ROOM_CACHE = { user: null, channels: new Map(), sidebar: null, messages: new Map() }

export function roomCacheFor(userId) {
  if (ROOM_CACHE.user !== (userId || null)) {
    ROOM_CACHE.user = userId || null
    ROOM_CACHE.channels.clear()
    ROOM_CACHE.sidebar = null
    ROOM_CACHE.messages.clear()
  }
  return ROOM_CACHE
}

// The reader's own order for the market cards in the sidebar. Per device, like
// every other reorderable list here: it is a preference about a layout, not a
// fact about the person, and a round trip to store it would be the tail wagging
// the dog.
export const ROOM_ORDER_KEY = 'rooms-market-order'

export const loadRoomOrder = () => {
  try { return JSON.parse(localStorage.getItem(ROOM_ORDER_KEY)) || [] } catch { return [] }
}

// MESSAGES THAT ARE A CARD AND NOT A SENTENCE.
//
// THE BUG THIS FIXES. The legacy chat can post a poll, a game event or a
// resource as a message with `body: ''` and an id in `poll_id` /
// `game_event_id` / `resource_id` - the card IS the message, so there is
// deliberately no text. This page only ever rendered body, image and video, so
// every one of those arrived as a row containing an avatar, a name, a timestamp
// and NOTHING: the reported "blank messages from me". And because a blank row
// still gets its reaction affordance, two of them in a row read as "double
// emoji reaction places below the last few messages" - the doubled circles were
// the blank messages, not a duplicated control.
//
// AND THEY ARE THE REAL THING, NOT A REFERENCE TO IT. This used to draw a strip saying which card it was, linking to
// `/chat` - which redirects to `/rooms`, so the only control on it sent you back where you already were. See
// <AttachedCard>. This list is now only "does this message carry a card, and which one"; the cards themselves load what
// they draw.
export const CARD_KINDS = [
  { idKey: 'poll_id' },
  { idKey: 'game_event_id' },
  { idKey: 'resource_id' },
  { idKey: 'leaderboard_challenge_id' },
]

// Anything that would make a message worth drawing. A row with none of these is
// not a quiet message, it is a data artefact, and drawing it as an empty bubble
// with a reaction button under it helps nobody.
export const hasContent = (m) =>
  !!(m.body?.trim() || m.image_url || m.video_url || m.poll_id || m.game_event_id || m.resource_id || m.leaderboard_challenge_id)

// A POLL IS VOTED ON WHERE IT IS POSTED.
//
// THE ROOMS DREW A LINK, NOT A CARD. Every poll, game and resource posted into
// a market room rendered as a tappable strip whose destination was `/chat` -
// and `/chat` redirects to `/rooms`, so the one control on the card sent you
// back to the room you were already standing in. There was no way to vote from
// a room at all. The real components (`PollCard`, `GameEventCard`,
// `ResourceCard`) existed the whole time and only the LEGACY `Chat.jsx`
// rendered them, which is why the feature looked half-built rather than broken.
//
// They render here now, the same three components the old surface uses, so
// there is one poll in the codebase rather than a poll and a picture of a poll.
// Every existing room and every room a market opens later gets this for free -
// nothing about it is per-room.
//
// NOT INSIDE A BRAND BUBBLE. `PollCard` and friends are white cards with their
// own borders, tap targets and result bars, and your own messages are drawn on
// brand orange. Nesting one in the other put a white card inside an orange
// bubble with the bubble's padding around it, which reads as a rendering
// mistake. A card-only message has no text to bubble anyway - `hasContent`
// already treats the card AS the message - so it breaks out and sits on the
// thread's own ground at full width.
/** A card with nothing else said: it stands on its own, with no bubble around it. */
export const cardOnly = (m) => !m.body?.trim() && !m.image_url && !m.video_url && !m.reply_to && !m.leaderboard_challenge_id && CARD_KINDS.some((c) => m[c.idKey])

/* A live leaderboard with words: one white bubble holding both. */
export const boardBubble = (m) => !!m.leaderboard_challenge_id && !m.image_url && !m.video_url

/**
 * A POLL IS A MESSAGE TOO. The team: pressing a poll anywhere but its options should bring up react and reply, "and
 * there should still be the orange bubble around it, as in I actually sent the message". So a poll gets the same framed
 * bubble as a shared leaderboard: the sender's colour round the white card, and the frame opens the bar.
 */
export const pollBubble = (m) => !!m.poll_id && !m.image_url && !m.video_url && !m.leaderboard_challenge_id

export const framed = (m) => boardBubble(m) || pollBubble(m)

export function AttachedCard({ message }) {
  const spec = CARD_KINDS.find((c) => message[c.idKey])
  if (!spec) return null
  return (
    // `text-ink` here as well as on each card. Belt and braces on purpose: this
    // wrapper sits inside a bubble that may be `text-white`, and the next card
    // somebody adds to CARD_KINDS will inherit the right colour whether or not
    // they remember to set it. See the note in PollCard for the day every label
    // in a poll went white on white.
    <div className="mt-1 w-full text-ink">
      {message.poll_id && <PollCard pollId={message.poll_id} />}
      {message.game_event_id && <GameEventCard eventId={message.game_event_id} />}
      {message.resource_id && <ResourceCard resourceId={message.resource_id} />}
      {message.leaderboard_challenge_id && (
        <LiveLeaderboardCard challengeId={message.leaderboard_challenge_id} groupId={message.leaderboard_group_id} view={message.leaderboard_view || 'board'} />
      )}
    </div>
  )
}

// THE SELECTED ROOM, EVERYWHERE. The team: the room you are in should wear the VIP rooms' orange gradient, not a flat
// orange wash - on every room, desktop and phone. The phone sheet (chat/RoomSwitcherSheet) uses the same classes.
// SMOOTH BETWEEN ROOMS. The row used to ease its label from ink to white (`transition-all`) while the gradient - a
// background-image, which cannot be transitioned - snapped in, so dark text sat on white for a beat. Now the label flips
// at once and ONE gradient (a shared layoutId) slides from the old room to the new one underneath it, behind the content
// (-z-10 inside the row's own stacking context), the same trick as the filter chips and Segmented.
export function RoomOnBg() {
  return <motion.span layoutId="room-on" transition={SOFT_SPRING} className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-r from-brand to-brand-light shadow-card" />
}

// The small "VIP" mark on a VIP room: a dark pill on a white card, a light one on the dark VIP material.
export function VipChip({ dark = false }) {
  return (
    <span className={cx(
      'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
      dark ? 'bg-white/15 text-white' : 'bg-ink text-white',
    )}>VIP</span>
  )
}
