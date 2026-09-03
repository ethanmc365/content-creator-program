import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import PendingLabel from '../components/PendingLabel'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { supabase } from '../lib/supabase'
import { confirm, notice } from '../lib/confirm'
import { useAuth } from '../context/AuthContext'
import { useCommunity } from '../context/CommunityContext'
import { flagFromIso } from '../components/network/PlaceSwitcher'
import NetworkMotion from '../components/NetworkMotion'
import { useProfileNames, useReactions, RoomSearch, Highlight, MentionMenu } from '../components/network/ChatExtras'
import { registerChatSearch } from '../lib/chatSearch'
import { setChatChromeHidden } from '../lib/chatChrome'
import { ChatSkeleton } from '../components/network/Skeletons'
import Icon from '../components/Icon'
import ChatMedia from '../components/ChatMedia'
import PhotoLightbox from '../components/PhotoLightbox'
import { saveFile, fileNameFromUrl } from '../lib/media'
import { uploadChatImage, uploadChatVideo } from '../lib/chatMedia'
import { pinToBottom, isPinning } from '../lib/chatScroll'
import { renderMessageBody, stripMarkup } from '../lib/richText'
import { broadcastNames } from '../lib/broadcastMentions'
import Reorderable from '../components/network/Reorderable'
import ChatAdminTools from '../components/ChatAdminTools'
import ChatComposer from '../components/ChatComposer'
import MessageEditor from '../components/MessageEditor'
import ReportMessage from '../components/ReportMessage'
import { useNowTick, withinEditWindow } from '../lib/messageActions'
import { playSend, playSendFail, playInbound } from '../lib/appSounds'
import IntroInvite from '../components/network/IntroPrompt'
import { textBeforeCaret } from '../lib/richEditor'
import { loadDraft, saveDraft, clearDraft } from '../lib/drafts'
import SeenBy from '../components/SeenBy'
import { Avatar, EmptyState } from '../components/ui'
import { useVisualViewport, useIsMobile } from '../lib/useKeyboardInset'
import { cx, formatMessageTime, messageTimeTitle } from '../lib/utils'
import { SOFT_SPRING } from '../lib/motion'
import MessageActions from '../components/chat/MessageActions'
import OutboxNotice from '../components/OutboxNotice'
import { enqueueMessage, queuedFor, subscribeOutbox, onOutboxSent, onOutboxBlocked, retryQueued, dropQueued } from '../lib/outbox'
import { useT } from '../lib/i18n'
import { testFlags } from '../lib/testData'

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

const scopedKey = (community, key) =>
  community?.kind === 'network' ? key : `${community.slug}:${key}`

// The reader's own order for the market cards in the sidebar. Per device, like
// every other reorderable list here: it is a preference about a layout, not a
// fact about the person, and a round trip to store it would be the tail wagging
// the dog.
const ROOM_ORDER_KEY = 'rooms-market-order'
const loadRoomOrder = () => {
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
// They are rendered as what they are now: a card that says which thing it is
// and goes there. The legacy chat owns voting and playing; this is a reference
// to something that lives somewhere else, and a reference should say so rather
// than pretend to be the thing.
const CARD_KINDS = [
  { idKey: 'poll_id', table: 'polls', select: 'id, question', label: (r) => r?.question, kind: 'Poll', icon: 'chart', to: () => '/chat' },
  { idKey: 'game_event_id', table: 'game_events', select: 'id, title', label: (r) => r?.title, kind: 'Game', icon: 'joystick', to: () => '/game' },
  { idKey: 'resource_id', table: 'resources', select: 'id, title', label: (r) => r?.title, kind: 'From the library', icon: 'book', to: () => '/resources' },
]

// Anything that would make a message worth drawing. A row with none of these is
// not a quiet message, it is a data artefact, and drawing it as an empty bubble
// with a reaction button under it helps nobody.
const hasContent = (m) =>
  !!(m.body?.trim() || m.image_url || m.video_url || m.poll_id || m.game_event_id || m.resource_id)

// WHAT A REPLY IS ANSWERING.
//
// One line, in the message it belongs to, and it is a button: pressing it
// scrolls the original into view and flashes it, which is what makes a thread
// walkable backwards rather than just labelled.
//
// A room holds 200 messages, so the parent of an old reply may genuinely not be
// in memory. That says "message no longer here" rather than drawing an empty
// bar, because a blank quote looks like a bug and a missing one is a fact.
function QuotedParent({ id, lookup, onDark = false }) {
  const tr = useT()
  const parent = lookup.get(id)

  const jump = () => {
    const el = document.getElementById(`msg-${id}`)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    // A class rather than an inline style, so the flash is one CSS animation
    // that cleans up after itself instead of a timer holding a ref.
    el.classList.remove('msg-flash')
    // Reading offsetWidth forces a reflow, which is what makes removing and
    // re-adding the class restart the animation. Without it, flashing the same
    // message twice in a row does nothing the second time.
    void el.offsetWidth
    el.classList.add('msg-flash')
  }

  if (!parent) {
    return (
      <p className={cx(
        'mb-1.5 flex items-center gap-1.5 rounded-lg border-l-2 px-2.5 py-1 text-[11px] italic',
        onDark ? 'border-white/60 bg-white/15 text-white/75' : 'border-gray-200 bg-black/[0.04] text-gray-400',
      )}>
        <Icon name="reply" className="h-3 w-3 shrink-0" />
        {tr("The message this replies to is no longer here")}
      </p>
    )
  }

  // PLAIN TEXT. The raw body put the markers in the quote - a reply to a
  // heading read "## Content tips" - and `stripMarkup` is the one place that
  // knows how to take them out while leaving @names alone.
  const preview = stripMarkup((parent.body || '')).replace(/\s+/g, ' ').trim()
    || (parent.image_url ? 'Photo' : parent.video_url ? 'Video' : 'Message')

  return (
    <button
      type="button"
      onClick={jump}
      className={cx(
        'mb-1.5 block w-full max-w-full overflow-hidden rounded-lg border-l-2 px-2.5 py-1 text-left transition-colors',
        onDark ? 'border-white/70 bg-white/15 hover:bg-white/25' : 'border-brand/60 bg-black/[0.04] hover:bg-black/[0.07]',
      )}
    >
      <span className={cx('block truncate text-[11px] font-semibold', onDark ? 'text-white' : 'text-brand')}>
        {parent.profiles?.name || 'Someone'}
      </span>
      {/* line-clamp, NOT truncate: nowrap made this preview's min-content width
          the whole quoted line, and a shrink-to-fit bubble grew to match, so
          replying to a long message ran off the screen. */}
      <span className={cx('line-clamp-1 text-[11px] [overflow-wrap:anywhere]', onDark ? 'text-white/80' : 'text-smoke')}>
        {preview}
      </span>
    </button>
  )
}

function AttachedCard({ message, titles, onDark = false }) {
  const spec = CARD_KINDS.find((c) => message[c.idKey])
  if (!spec) return null
  const title = titles.get(`${spec.table}:${message[spec.idKey]}`)
  return (
    <Link
      to={spec.to()}
      className={cx(
        'mt-1 flex items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors',
        onDark
          ? 'border-white/25 bg-white/10 hover:bg-white/20'
          : 'border-gray-200 bg-white hover:border-brand/40 hover:bg-brand-tint/20',
      )}
    >
      <span className={cx(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
        onDark ? 'bg-white/20 text-white' : 'bg-brand-tint text-brand',
      )}>
        <Icon name={spec.icon} className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx('block text-[10px] font-semibold uppercase tracking-wider', onDark ? 'text-white/70' : 'text-smoke')}>{spec.kind}</span>
        <span className={cx('block truncate text-sm font-medium', onDark && 'text-white')}>{title || 'Open it'}</span>
      </span>
      <Icon name="chevronRight" className={cx('h-4 w-4 shrink-0', onDark ? 'text-white/50' : 'text-gray-300')} />
    </Link>
  )
}

export default function NetworkChat() {
  const tr = useT()
  const { slug, channelKey } = useParams()
  const navigate = useNavigate()
  const { user, profile, isAdmin } = useAuth()
  const { bySlug, network, manages, myCommunities, loading: ctxLoading } = useCommunity()

  const community = slug ? bySlug(slug) : network
  const [channels, setChannels] = useState([])
  const [sidebarRooms, setSidebarRooms] = useState([])
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const [members, setMembers] = useState([])
  const [mention, setMention] = useState(null) // { query, start } while typing @…
  const [roomOrder, setRoomOrder] = useState(loadRoomOrder)
  const [attachError, setAttachError] = useState('')
  // Titles for poll / game / resource cards, keyed `table:id`.
  const [cardTitles, setCardTitles] = useState(new Map())
  // Which message has its actions revealed by a TAP. On a phone there is no
  // hover, so `group-hover` alone meant the reaction button was permanently
  // invisible and market rooms simply had no reactions on mobile.
  const [actionsFor, setActionsFor] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [reporting, setReporting] = useState(null)

  // WHICH ATTACHMENT IS OPEN FULL SCREEN, AND IT IS THE PAGE'S BUSINESS.
  // ChatMedia used to own a lightbox each, which is one layer per message in
  // the thread and a picture component that had to know about saving files. The
  // page holds one layer; the message's own action bar opens it.
  const [viewing, setViewing] = useState(null)

  // Saving goes through the SHARE SHEET on a phone, which is the only route to
  // the iOS camera roll - a bare URL share offers "Copy link" and nothing else.
  // Same helper the resource library and the photo layer already use.
  const saveMedia = useCallback((url) => {
    if (!url) return
    saveFile(url, fileNameFromUrl(url)).catch(() => {})
  }, [])

  // The message the composer is answering, or null. Held as the whole row
  // rather than an id so the strip above the composer can show the author and
  // a line of the body without a second lookup - and so it keeps working if
  // the original scrolls out of the 200 this room holds.
  const [replyTo, setReplyTo] = useState(null)
  const nowTick = useNowTick()
  // Who has read how far in this room: profile id -> last_read_at. Same
  // `channel_reads` table the legacy chat uses, keyed by the same namespaced
  // channel string these messages are written with, so a market room's receipts
  // can no more mix with another market's than its messages can.
  const [reads, setReads] = useState(new Map())
  // Which admin tool (poll / game / resource) is open, if any.
  const [adminTool, setAdminTool] = useState(null)
  const scrollerRef = useRef(null)
  const composerRef = useRef(null)
  // How many characters of the in-progress "@query" to replace with the chip.
  const mentionLenRef = useRef(0)
  const atBottomRef = useRef(true)

  const { height: vpHeight, offsetTop: vpOffset, keyboardOpen: kbOpen } = useVisualViewport()
  const isMobile = useIsMobile()

  // Same geometry as Chat.jsx, for the same reasons. Closed keyboard: leave the
  // header (4rem) and the tab bar (4.5rem + safe area) alone. Open: take the
  // whole visible viewport, because the header has scrolled away and the tab bar
  // has hidden itself. offsetTop is clamped to >= 0 because iOS reports a
  // negative one during a rubber-band pull, which would ride the overlay up over
  // the header.
  // HIDING THE APP HEADER WHILE YOU READ.
  //
  // The rules, and they are deliberately blunt because a header that argues
  // with you is worse than one that never moves:
  //   * scrolling the conversation at all hides it
  //   * so does putting the caret in the composer
  //   * a press anywhere in the top strip - the tabs, or the sliver beside
  //     them - brings it back
  //   * so does reaching the very top of the conversation, because that is
  //     where you have run out of messages and are looking for something else
  //   * and it is always released on the way out of the room
  const [chromeHidden, setChromeHidden] = useState(false)

  // THE HEADER AND THE OVERLAY MOVE ON THE SAME FRAME.
  //
  // THE BUG: "I really like how the header disappears when you click into a
  // room, although it's slightly delayed and there isn't a clean animation - I
  // want a much cleaner animation of the whole thing actually moving up."
  //
  // The delay was a whole React commit. `setChatChromeHidden` was called from
  // an EFFECT keyed on `chromeHidden`, so the sequence was: state changes, the
  // overlay re-renders and starts growing, the effect runs after that paint,
  // the shell re-renders, and only THEN does the header start sliding. Two
  // animations one commit apart do not read as one movement; they read as a lag.
  // The channel is a plain module-level setter with no React in it, so there is
  // nothing stopping it being called in the same handler as the setState -
  // React 18 batches the two into one commit and both start together.
  //
  // The effect is still here for the two cases a handler cannot cover: the
  // width changing under a hidden header, and leaving the room.
  const setChrome = useCallback((hidden) => {
    setChromeHidden(hidden)
    setChatChromeHidden(isMobile && hidden)
  }, [isMobile])
  useEffect(() => { setChatChromeHidden(isMobile && chromeHidden) }, [isMobile, chromeHidden])
  useEffect(() => () => setChatChromeHidden(false), [])
  const showChrome = useCallback(() => setChrome(false), [setChrome])

  // THE OPEN ROOM'S TAB IS BROUGHT INTO VIEW.
  //
  // THE BUG: "let's say I'm on the worldwide room and I click into Content
  // tips - at the top it still shows General, Introductions and Announcements.
  // It should automatically be scrolled over so Content tips is highlighted."
  // The strip is a horizontal scroller and the highlighted tab can easily be
  // off the right-hand end of it, so the one thing the strip is for - saying
  // which room you are in - was invisible in exactly the case where you had
  // just changed rooms.
  //
  // It scrolls the STRIP by hand rather than calling `scrollIntoView`, which
  // would also scroll every ancestor - including the fixed overlay and the
  // document behind it - to satisfy the block axis it was never asked about.
  const tabStripRef = useRef(null)
  const [stripSearch, setStripSearch] = useState(false)
  useEffect(() => {
    // RECTANGLES, NOT `offsetLeft`. The tab's offset parent is the fixed chat
    // OVERLAY, not the strip - so `offsetLeft` is measured from the left of the
    // screen and includes the magnifier button beside the strip. Measured: 449
    // for a tab sitting 401px into a 319px-wide strip. Rects are relative to
    // the viewport and already account for the current scroll, so the delta
    // between the two is the only reliable answer.
    //
    // AND `scrollLeft`, NOT `scrollTo({behavior:'smooth'})`. Measured in this
    // overlay: a smooth `scrollTo` is silently dropped and the strip does not
    // move at all, while an assignment lands. The element inherits
    // `scroll-behavior: smooth` from `html` anyway, so the assignment animates
    // where the browser supports it and jumps where it does not - and a jump is
    // still correct, which is more than can be said for not moving.
    //
    // One frame's delay so the new tab has been laid out before it is measured.
    const raf = requestAnimationFrame(() => {
      const strip = tabStripRef.current
      const tab = strip?.querySelector('[aria-selected="true"]')
      if (!strip || !tab) return
      const s = strip.getBoundingClientRect()
      const t = tab.getBoundingClientRect()
      strip.scrollLeft = Math.max(0, strip.scrollLeft + (t.left - s.left) - (s.width - t.width) / 2)
    })
    return () => cancelAnimationFrame(raf)
  }, [channelKey, channels.length, stripSearch])

  // Closing the strip's search when you change room, so a filter typed in
  // General is not silently still applied in Announcements.
  useEffect(() => { setStripSearch(false) }, [channelKey])
  const hideChrome = useCallback(() => { if (isMobile) setChrome(true) }, [isMobile, setChrome])

  // A ROOM OPENS WITH THE HEADER ALREADY AWAY.
  //
  // THE BUG: "clicking on introductions, it seems to still keep the header,
  // which it shouldn't - it should be away from everything."
  // Introductions is the emptiest room, and that is the whole explanation: the
  // header hid on SCROLL, and a room whose messages do not fill the screen
  // cannot be scrolled, so it never hid there and hid everywhere else. Opening
  // a room is the moment you have decided to read it, so that is when the
  // chrome goes - and the rules that bring it back (a press on the strip, or
  // reaching the top of a thread that does scroll) are unchanged.
  useEffect(() => {
    if (isMobile) setChrome(true)
    // Re-runs when you move between rooms, which is correct: each one opens the
    // same way.
  }, [isMobile, channelKey, setChrome])

  // THE OVERLAY GROWS INTO THE HEADER'S SPACE WHEN THE HEADER LEAVES.
  // `chromeHidden` and `kbOpen` do the same thing to the top edge for different
  // reasons - one because the header slid away, one because the keyboard
  // replaced everything - so they share a branch.
  const topGone = kbOpen || chromeHidden
  const mobileStyle = isMobile
    ? {
        top: topGone ? 0 : '4rem',
        height: kbOpen
          ? `${vpHeight}px`
          : `calc(${vpHeight}px - ${chromeHidden ? '0rem' : '4rem'} - 4.5rem - env(safe-area-inset-bottom))`,
        transform: `translateY(${Math.max(0, vpOffset)}px)`,
        // THE OVERLAY SNAPS. ONLY THE HEADER ANIMATES. (1 Sep 2026.)
        //
        // Ethan: "on the rooms, please make the header disappearing animation
        // even more smooth, its still a bit juddery."
        //
        // This box used to animate `top` and `height` over the same 280ms as
        // the header's slide, so that the two read as one movement. They are
        // LAYOUT properties: every frame of that animation relaid out the
        // overlay, its flex column, the scroller and every message row in it -
        // sixty times a second, on a phone, on the frame the user is already
        // scrolling. That is the judder, and no amount of easing fixes an
        // animation whose cost is a full reflow.
        //
        // So the box changes INSTANTLY and the only thing that moves is the
        // header's own `transform`, which is compositor-only and cannot jank.
        // It still reads as one movement, because the header is z-40 and this
        // overlay is z-20: the tab strip snaps to its new position UNDER the
        // header, and the header then slides up to reveal it. What you see is a
        // wipe, not a jump - and coming back, the header slides down over a
        // strip that is already empty.
        //
        // THE SAFE-AREA INSET IS A CHILD, NOT PADDING ON THIS BOX, so it can
        // carry its own background rather than leaving a transparent gap while
        // the header is away.
      }
    : undefined

  useEffect(() => {
    if (!isMobile) return
    document.documentElement.classList.add('overlay-lock')
    return () => document.documentElement.classList.remove('overlay-lock')
  }, [isMobile])

  const active = useMemo(
    () => channels.find((c) => c.key === channelKey) || channels[0] || null,
    [channels, channelKey],
  )

  // THE HEADER'S SEARCH BUTTON SEARCHES THIS ROOM WHILE IT IS OPEN.
  // See lib/chatSearch for why this is a module-level channel rather than a
  // prop threaded through the shell.
  useEffect(
    () => registerChatSearch({ label: active?.label || 'this room', value: search, onChange: setSearch }),
    [active?.label, search],
  )

  // WHO CAN POST HERE. Two rules and no third.
  //
  // THE THIRD RULE WAS THE BUG. There used to be an `isLiveWorldwide` guard
  // that made Worldwide's General, Announcements and Content tips READ ONLY,
  // with a panel explaining that "this is a room every creator is already in
  // today, so it is read only here in case a test message reaches all of them".
  // That was correct while the network was an admin-only preview sitting
  // underneath a live UK chat. The network IS the app now, those three rooms
  // are the main conversation, and the guard was locking everybody out of the
  // busiest rooms on the platform. Ethan: "I'm unable to actually post in the
  // worldwide rooms."
  //
  // What is left is the room's own `post_policy`: 'all' means everybody,
  // 'staff' means the people who manage this community. Announcements is
  // 'staff' everywhere, which is exactly the "only admins post announcements,
  // everyone can read them" rule. Reading is enforced separately and for real
  // by RLS - see migration 149.
  const canPost = !!active && (active.post_policy === 'all' || manages(community.id))

  useEffect(() => {
    if (!community) return
    let cancelled = false
    supabase.from('channels')
      .select('id, key, label, hint, icon, visibility, post_policy, position')
      .eq('community_id', community.id).order('position')
      .then(({ data }) => { if (!cancelled) setChannels(data || []) })
    return () => { cancelled = true }
  }, [community])

  // Every room in EVERY place the viewer belongs to, including the one they are
  // standing in.
  //
  // IT INCLUDES THE CURRENT PLACE ON PURPOSE, AND THAT IS THE WHOLE FIX.
  //
  // THE BUG THIS FIXES. The sidebar used to be two things: a card for where you
  // ARE, pinned at the top, and a reorderable list of everywhere else under it.
  // So opening Portugal's General re-sorted the entire column - Portugal leapt
  // to the top and whatever you had been reading dropped into the list below.
  // Ethan: "when I click on for example General in Portugal, it then jumps to
  // the top, I want the rooms sidebar to always remain as it is set."
  //
  // A navigation whose order depends on where the navigation has taken you is
  // not a navigation, it is a moving target: the muscle memory you build on
  // Monday is wrong the moment you use it. So there is ONE list, in the
  // reader's own saved order, and opening a room only ever changes which row is
  // highlighted.
  //
  // One query for all of them rather than one per market: the sidebar needs the
  // whole set before it can draw anything, and five sequential round trips to
  // build a nav that is 200px wide is the kind of thing that makes a page feel
  // slow for no reason a user could name.
  //
  // RLS already scopes `channels` to communities you can see, so this cannot
  // leak a market's room list to somebody outside it; the `in` filter is about
  // asking for less, not about permission.
  const sidebarIds = useMemo(
    () => {
      const ids = myCommunities.map((c) => c.id)
      // The place you are in may be one you can READ without belonging to (a
      // global admin looking at a market they never joined), and the sidebar
      // still has to draw it or the room you are reading is not in the list.
      if (community?.id && !ids.includes(community.id)) ids.push(community.id)
      return ids
    },
    [myCommunities, community],
  )

  useEffect(() => {
    if (!sidebarIds.length) { setSidebarRooms([]); return undefined }
    let cancelled = false
    supabase.from('channels')
      .select('id, key, label, icon, visibility, position, community_id')
      .in('community_id', sidebarIds).order('position')
      .then(({ data }) => { if (!cancelled) setSidebarRooms(data || []) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarIds.join(',')])

  const load = useCallback(async () => {
    if (!community || !active) return
    setLoading(true)
    const { data } = await supabase
      .from('messages')
      .select('*, profiles:sender_id(id, name, photo_url, is_admin)')
      .eq('channel', scopedKey(community, active.key))
      .eq('deleted', false)
      .order('created_at', { ascending: true })
      .limit(200)
    setMessages(data || [])
    setLoading(false)
  }, [community, active])

  useEffect(() => { load() }, [load])

  // Room members, for @-autocomplete. Scoped to THIS community: @-ing somebody
  // who cannot read the room is a mention that goes nowhere.
  useEffect(() => {
    if (!community) return
    let alive = true
    supabase.from('community_members')
      .select('profile_id, profiles!inner(id, name, photo_url, status, is_test)')
      .eq('community_id', community.id).eq('status', 'active')
      .eq('profiles.status', 'active').in('profiles.is_test', testFlags())
      .then(({ data }) => {
        if (alive) setMembers((data || []).map((r) => r.profiles))
      })
    return () => { alive = false }
  }, [community])

  // Realtime, filtered on the same namespaced key the reads use so a Spanish
  // message can never arrive in a UK subscriber's stream.
  useEffect(() => {
    if (!community || !active) return
    const key = scopedKey(community, active.key)
    const ch = supabase
      .channel(`net-chat-${key}`)
      // EDITS AND DELETES PROPAGATE TOO.
      //
      // This listened for INSERT only, so a message somebody edited kept its
      // old text on every other screen until a reload, and one they deleted
      // stayed readable in the room it had been removed from. A soft delete IS
      // an update, so without this the delete button appeared to work for the
      // person pressing it and for nobody else.
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `channel=eq.${key}` },
        (payload) => {
          const row = payload.new
          if (!row?.id) return
          if (row.deleted) { setMessages((prev) => prev.filter((m) => m.id !== row.id)); return }
          // Merge rather than replace: the payload is the raw row and carries
          // no embedded `profiles`, so replacing would strip the author off
          // every message anybody edits.
          setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...row, profiles: m.profiles } : m)))
        })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel=eq.${key}` },
        async (payload) => {
          // Somebody else's message, in the room you have open, with the tab in
          // front. Your own already made the send whoosh, and a background tab
          // is a notification's job.
          if (payload.new.sender_id !== user?.id && !document.hidden) playInbound()
          const { data } = await supabase
            .from('messages')
            .select('*, profiles:sender_id(id, name, photo_url, is_admin)')
            .eq('id', payload.new.id).single()
          if (data) setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]))
        })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [community, active, user?.id])

  // Landing on the newest message, reliably.
  //
  // Setting scrollTop directly beats scrollIntoView on a sentinel inside a flex
  // column, and the re-pins across rAF and timers exist because a room's images
  // and link previews land after the first paint and each one changes the
  // scroll height. The capture-phase listener catches every descendant image,
  // including ones inserted seconds later.
  const pin = useCallback(() => {
    const el = scrollerRef.current
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight
  }, [])

  // A ROOM DOES NOT OPEN HALFWAY UP ITSELF AND THEN CORRECT ITSELF.
  //
  // Ethan, twice: "it'll show up the messages in like a different layer or
  // scrolled up, and then suddenly load or fix itself and jump to the bottom",
  // and later "it flashes, glitches and then shows the current chats, sometimes
  // it's scrolled up a bit, its inconsistent, sometimes it jutters more."
  //
  // The corrections were on a FIXED SCHEDULE - 60, 200, 500 and 1200ms - which
  // is a guess at when a thread stops growing, and a guess is wrong in both
  // directions: it was still yanking a settled thread at 1.2 seconds and had
  // given up on a slow one at 1.3. `pinToBottom` watches the scroll height
  // instead and stops as soon as it has been stable for two frames, so the
  // number of corrections is however many the thread actually needs and the
  // reveal happens the moment there are no more.
  //
  // The upstream half of this fix is migration 163: an attachment records its
  // own shape now, so a photograph reserves its box before it decodes and most
  // threads have nothing left to settle at all.
  //
  // `settled` gates OPACITY only - the messages are laid out and measured the
  // whole time, which is what the pinning needs - so this costs no geometry.
  const [settled, setSettled] = useState(false)

  useLayoutEffect(() => {
    atBottomRef.current = true
    setSettled(false)
    // NOTHING TO PIN WHILE THE ROOM IS STILL LOADING. This effect used to run
    // against the SKELETON: a skeleton has no images and a stable height, so
    // the loop declared it settled within two frames, revealed it, and then
    // re-ran on the real messages and hid the thread again. Skeleton, flash,
    // skeleton, thread. The skeleton is drawn by the `loading` branch below and
    // needs no pinning of its own.
    if (loading) return undefined
    pin()
    return pinToBottom(
      () => scrollerRef.current,
      () => atBottomRef.current,
      () => setSettled(true),
    )
  }, [loading, active?.key, community?.id, pin])

  useEffect(() => { pin() }, [messages.length, pin])
  // Reflow when the keyboard opens: the scroller just got shorter, so the
  // message the user was reading has to stay at the bottom.
  useEffect(() => { pin() }, [kbOpen, vpHeight, pin])

  // The titles behind any poll / game / resource cards in this room. One query
  // per kind, only for the kinds actually present, and only when the set of ids
  // changes - a room with no cards in it issues nothing.
  const cardKey = useMemo(
    () => CARD_KINDS.map((c) => messages.map((m) => m[c.idKey]).filter(Boolean).join(',')).join('|'),
    [messages],
  )
  useEffect(() => {
    const groups = CARD_KINDS
      .map((c) => ({ spec: c, ids: [...new Set(messages.map((m) => m[c.idKey]).filter(Boolean))] }))
      .filter((g) => g.ids.length)
    if (!groups.length) return undefined
    let alive = true
    Promise.all(groups.map((g) =>
      supabase.from(g.spec.table).select(g.spec.select).in('id', g.ids)
        .then(({ data }) => (data || []).map((r) => [`${g.spec.table}:${r.id}`, g.spec.label(r)])),
    )).then((pairs) => {
      if (alive) setCardTitles(new Map(pairs.flat()))
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey])

  const messageIds = useMemo(() => messages.map((m) => m.id), [messages])
  const { byMessage: reactionsByMessage, toggle: toggleReaction } = useReactions(messageIds, user?.id)
  // WHO REACTED. `reactions` rows carry a creator_id and nothing else, so the
  // names for a chip's tooltip come from the room's member list. Somebody who
  // has since left the market is not in it; "Someone" is the honest answer
  // there and still better than a bare number.
  const nameById = useMemo(
    () => new Map((members || []).filter(Boolean).map((p) => [p.id, p.name])),
    [members],
  )
  // Whoever the member list cannot name gets looked up. `members` filters out
  // test profiles and anybody who has left the market, and those were exactly
  // the reactions whose tooltip read "Someone".
  const reactorIds = useMemo(() => {
    const ids = new Set()
    for (const rows of reactionsByMessage.values()) for (const r of rows) ids.add(r.creator_id)
    return [...ids].filter((id) => id && id !== user?.id && !nameById.has(id))
  }, [reactionsByMessage, nameById, user?.id])
  const fetchedNames = useProfileNames(reactorIds)
  const nameFor = useCallback(
    (id) => nameById.get(id) || fetchedNames.get(id) || 'Someone',
    [nameById, fetchedNames],
  )
  // id -> message, for drawing what a reply is answering without a second read.
  // A reply whose parent has scrolled out of the 200 this room holds resolves
  // to nothing, and QuotedParent says so rather than rendering an empty bar.
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages])

  // ---- Read receipts ----------------------------------------------------
  //
  // Load the room's existing watermarks, keep them live, and write our own the
  // moment the room is on screen. The write is throttled: a room you scroll
  // through for a minute should not be a minute of upserts.
  const roomKey = community && active ? scopedKey(community, active.key) : null
  // Per-room draft, so a half-written message in Spain's General is still there
  // when you come back from the UK's.
  const draftKey = `net-chat-${roomKey || 'none'}`

  // ---- The outbox -------------------------------------------------------
  //
  // THE MARKET ROOMS HAD NO OPTIMISTIC SEND AT ALL. `postMessage` awaited the
  // insert and only then put the row on screen, so a message sent on a bad
  // connection sat behind a spinner and a message sent on no connection played
  // a fail sound and evaporated - the words were gone from the composer, which
  // had already been cleared. Both are fixed by the same thing: the queue is
  // where the message lives from the instant you press send, and this is a view
  // of it. See `src/lib/outbox.js`.
  const outboxScope = `net:${roomKey || 'none'}`
  const [queued, setQueued] = useState(() => queuedFor(outboxScope))
  useEffect(() => {
    setQueued(queuedFor(outboxScope))
    return subscribeOutbox(() => setQueued(queuedFor(outboxScope)))
  }, [outboxScope])

  // A queued message landing anywhere tells every surface; this room takes its
  // own, exactly as the outbox drops the item, so the pending bubble is
  // replaced rather than joined by the real one.

  // Refused because this is the "View as creator" sandbox. Say so plainly - the
  // most likely reader is an admin who has forgotten which account they are in.
  useEffect(() => onOutboxBlocked(() => {
    notice('You are viewing as a creator, so this was not sent.\n\nExit the preview to post as yourself.')
  }), [])
  useEffect(() => onOutboxSent((item, row) => {
    if (item.scope !== outboxScope || !row) return
    setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]))
  }), [outboxScope])

  // The fail sound belongs on giving up, not on the first missed request. A
  // missed request is now just a tunnel, and a tunnel is not news.
  const gaveUpRef = useRef(new Set())
  useEffect(() => {
    for (const item of queued) {
      if (item.failed && !gaveUpRef.current.has(item.id)) { gaveUpRef.current.add(item.id); playSendFail() }
      if (!item.failed) gaveUpRef.current.delete(item.id)
    }
  }, [queued])
  // Names the composer turns into @chips as you type. Admins also get the two
  // broadcast handles, @everyone and @here.
  const mentionNames = useMemo(() => {
    const names = members.map((m) => m.name).filter((n) => n && n.length > 1)
    names.push(...broadcastNames(isAdmin))
    return names.sort((a, b) => b.length - a.length)
  }, [members, isAdmin])

  useEffect(() => {
    if (!roomKey) return undefined
    let alive = true
    supabase.from('channel_reads').select('user_id, last_read_at').eq('channel', roomKey)
      .then(({ data }) => { if (alive) setReads(new Map((data || []).map((r) => [r.user_id, r.last_read_at]))) })
    const ch = supabase.channel(`net-reads-${roomKey}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'channel_reads', filter: `channel=eq.${roomKey}` },
        (payload) => {
          const row = payload.new
          if (row?.user_id) setReads((prev) => new Map(prev).set(row.user_id, row.last_read_at))
        })
      .subscribe()
    return () => { alive = false; supabase.removeChannel(ch) }
  }, [roomKey])

  const lastReadRef = useRef(0)
  useEffect(() => {
    if (!roomKey || !user?.id || loading || messages.length === 0) return
    const now = Date.now()
    if (now - lastReadRef.current < 2500) return
    lastReadRef.current = now
    const iso = new Date(now).toISOString()
    setReads((prev) => new Map(prev).set(user.id, iso))
    supabase.from('channel_reads')
      .upsert({ channel: roomKey, user_id: user.id, last_read_at: iso }, { onConflict: 'channel,user_id' })
      .then(() => {}, () => {})
  }, [roomKey, user?.id, loading, messages.length])

  // Everyone whose watermark is at or past this message, minus me and the
  // sender. `members` is the room's own roster, so a reader who left the market
  // does not linger in the count.
  const seenBy = useCallback((msg) => {
    if (!msg) return []
    const t = new Date(msg.created_at).getTime()
    return members.filter((mem) => {
      if (mem.id === user?.id || mem.id === msg.sender_id) return false
      const r = reads.get(mem.id)
      return !!r && new Date(r).getTime() >= t
    })
  }, [members, reads, user?.id])

  // Search filters what is already in memory. A room holds 200 messages; a
  // server round trip for this would be slower and would not work offline.
  const visible = useMemo(() => {
    // Rows with nothing in them at all never reach the screen. See `hasContent`.
    const real = messages.filter(hasContent)
    // Anything still in the outbox goes on the end. The dedupe is for the beat
    // between realtime delivering the row and the insert's own reply getting
    // back here: for that beat, without it, you see your message twice.
    const pending = queued
      .filter((i) => !real.some((m) => m.id === i.id
        || (m.sender_id === user?.id && (m.body || '') === (i.display.body || '') && !!m.image_url === !!i.display.image_url)))
      .map((i) => ({ ...i.display, pending: !i.failed, failed: i.failed, queuedId: i.id, tries: i.tries }))
    const q = search.trim().toLowerCase()
    if (!q) return [...real, ...pending]
    return real.filter(
      (m) => m.body?.toLowerCase().includes(q) || m.profiles?.name?.toLowerCase().includes(q),
    )
  }, [messages, search, queued, user?.id])

  // Typing "@" opens the picker; a space or a match closes it.
  // The composer serialises to markdown on every keystroke, so `body` stays
  // exactly what it always was and send/drafts/search are untouched.
  function onComposerChange(md) {
    setBody(md)
    saveDraft(draftKey, md)
  }

  // An in-progress @mention, read from the caret's own text node rather than
  // from a selectionStart a contentEditable does not have.
  function onComposerInput() {
    const before = textBeforeCaret()
    const m = /(?:^|\s)@([^\s@]{0,30})$/.exec(before)
    if (m) { mentionLenRef.current = m[1].length; setMention({ query: m[1] }) }
    else setMention(null)
  }

  function pickMention(person) {
    composerRef.current?.insertMention(person.name, mentionLenRef.current + 1)
    setMention(null)
  }

  function onScroll(e) {
    const el = e.currentTarget
    // WHILE A PIN IS IN FLIGHT, THIS EVENT IS NOT THE READER (3 Sep 2026).
    // See lib/chatScroll's 3 Sep note: a scroll event fired by the pin itself,
    // or by content growing under it, was being read as "they scrolled up" and
    // it switched the pin off for the rest of the room's life. The thread is at
    // opacity-0 for the whole of that window - there is nothing on screen for
    // anybody to have scrolled.
    if (!isPinning(el)) {
      atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }
    // Reading hides the chrome; running out of messages at the top brings it
    // back, because that is the moment you are looking for something else.
    if (el.scrollTop < 12) showChrome()
    else hideChrome()
  }

  // DELETE, WHICH THE ROOMS SIMPLY DID NOT HAVE.
  //
  // Your own at any time, anybody's if you are an admin - the RPC (migration
  // 147) decides, not this. A soft delete, so the reactions, the replies
  // pointing at it and any report attached to it survive for a moderator to
  // read; `deleted = false` is already in this page's read filter, so it
  // disappears everywhere on the next load and immediately here.
  //
  // The row is removed from state BEFORE the round trip and put back if the
  // call fails. A delete that appears to do nothing for two seconds gets
  // pressed again.
  async function removeMessage(m) {
    if (!await confirm(
      m.sender_id === user?.id
        ? 'Delete this message? It disappears for everyone in the room.'
        : `Delete ${m.profiles?.name || 'this creator'}'s message? It disappears for everyone in the room.`,
      { confirmLabel: 'Delete', danger: true },
    )) return
    setActionsFor(null)
    const snapshot = messages
    setMessages((cur) => cur.filter((x) => x.id !== m.id))
    const { error } = await supabase.rpc('delete_message', { p_id: m.id })
    if (error) {
      setMessages(snapshot)
      await notice(`Could not delete that message: ${error.message}`)
    }
  }

  // Post a row into this room. Nothing here awaits the network any more: the
  // message is queued, drawn, and sent by the outbox, which is the only part of
  // the app that has to care whether there is any signal.
  function postMessage(fields) {
    playSend()
    enqueueMessage({
      scope: outboxScope,
      table: 'messages',
      row: {
        channel: scopedKey(community, active.key),
        channel_id: active.id,
        community_id: community.id,
        sender_id: user.id,
        ...fields,
      },
      select: '*, profiles:sender_id(id, name, photo_url, is_admin)',
      display: {
        channel: scopedKey(community, active.key),
        channel_id: active.id,
        community_id: community.id,
        sender_id: user.id,
        body: '',
        image_url: null,
        video_url: null,
        reply_to: null,
        created_at: new Date().toISOString(),
        profiles: { id: user.id, name: profile?.name, photo_url: profile?.photo_url, is_admin: isAdmin },
        ...fields,
      },
    })
  }

  function send(e) {
    e?.preventDefault?.()
    const text = body.trim()
    if (!text || !canPost || sending) return
    setBody('')
    composerRef.current?.clear()
    clearDraft(draftKey)
    atBottomRef.current = true
    postMessage({ body: text, reply_to: replyTo?.id ?? null })
    setReplyTo(null)
  }

  // PHOTOS AND VIDEO, IN EVERY ROOM.
  //
  // The market rooms had no attach control at all - the only place on the
  // platform you could send a picture was the legacy UK chat, which made the
  // rooms feel like a downgrade for everybody who moved into one. It reuses
  // `uploadChatImage` / `uploadChatVideo`, so the compression rules are the
  // same ones the live chat has used all along: images are re-encoded to
  // 1280px at quality 0.82 before they leave the device, and video is capped
  // rather than transcoded (there is no reliable in-browser transcoder, so a
  // clear limit beats a silent 200MB upload).
  // WHATEVER IS IN THE BOX GOES WITH IT.
  //
  // THE BUG THIS FIXES. This posted `{ image_url }` and nothing else, so
  // anything you had typed was left sitting in the composer and then thrown
  // away by the next draft write - a photo with a caption arrived in the room
  // as a bare photo. Nobody noticed for a while because it looks like you
  // simply forgot to press send. It surfaced from the other end: reporting one
  // of these showed the picture with no words, because there genuinely were
  // none on the row. The legacy chat has always sent the caption; the market
  // rooms were the odd one out.
  async function attach(file) {
    if (!file || !canPost || sending) return
    setAttachError('')
    const isVideo = file.type.startsWith('video/')
    const caption = body.trim()
    setSending(true)
    atBottomRef.current = true
    // Clear the composer up front, the same as `send` does: the caption is
    // spoken for now, and leaving it there invites sending it twice.
    if (caption) { setBody(''); composerRef.current?.clear(); clearDraft(draftKey) }
    try {
      const { url, w, h } = isVideo
        ? await uploadChatVideo(file, user.id)
        : await uploadChatImage(file, user.id)
      // Only once the bytes are somewhere permanent. A File cannot be queued -
      // it will not survive localStorage or a reload - so the upload is the one
      // part of a send that still needs the network up front.
      //
      // `media_w`/`media_h` travel WITH the message (migration 163). They are
      // what lets a thread reserve the right box before a photo decodes, which
      // is the whole fix for a chat that jumps while it opens.
      postMessage({
        body: caption,
        ...(isVideo ? { video_url: url } : { image_url: url }),
        ...(w && h ? { media_w: w, media_h: h } : null),
      })
    } catch (err) {
      setAttachError(err?.message || 'That file could not be sent.')
    }
    setSending(false)
  }

  if (ctxLoading && !community) {
    return <div className="mx-auto w-full max-w-7xl px-4 py-8"><ChatSkeleton /></div>
  }

  if (!community) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <EmptyState icon={<Icon name="pin" className="h-6 w-6" />} title={tr("No such market")}
          action={<Link to="/global" className="btn-secondary">{tr("Back to Worldwide")}</Link>} />
      </div>
    )
  }

  const base = slug ? `/c/${slug}/chat` : '/global/chat'
  const flags = (community.country_codes || []).map(flagFromIso).join('')

  // EVERY place you belong to, each with its rooms, in ONE list - the place you
  // are standing in included, sitting wherever the reader put it. Worldwide
  // first and then markets alphabetically is only the DEFAULT, used until
  // somebody drags something. A place with no rooms is dropped rather than
  // rendered as an empty heading.
  const places = [
    ...myCommunities,
    ...(community && !myCommunities.some((c) => c.id === community.id) ? [community] : []),
  ]
    .map((c) => ({
      ...c,
      flags: (c.country_codes || []).map(flagFromIso).join(''),
      rooms: sidebarRooms.filter((r) => r.community_id === c.id),
    }))
    .filter((c) => c.rooms.length > 0)
    .sort((a, b) => (b.kind === 'network') - (a.kind === 'network') || a.name.localeCompare(b.name))

  // The saved order, with anything it has not heard of (a market opened since
  // you last dragged) falling in behind at its alphabetical place rather than
  // disappearing.
  function saveRoomOrder(next) {
    const ids = next.map((c) => c.id)
    setRoomOrder(ids)
    try { localStorage.setItem(ROOM_ORDER_KEY, JSON.stringify(ids)) } catch { /* private mode */ }
  }

  const rank = new Map(roomOrder.map((id, i) => [id, i]))
  const orderedPlaces = [...places].sort(
    (a, b) => (rank.has(a.id) ? rank.get(a.id) : 1e9) - (rank.has(b.id) ? rank.get(b.id) : 1e9),
  )

  // --------------------------------------------------------------- the room
  const room = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white lg:rounded-card lg:border lg:border-gray-100 lg:shadow-card">
      {/* Room tabs. On mobile these ARE the navigation: the sidebar is a
          desktop-only shape and a stack of full-width room buttons above a
          conversation pushes the conversation off the screen. */}
      {/* THE NOTCH INSET, AS A REAL ELEMENT. With the header away the overlay
          starts at y=0, and this is what keeps the tabs clear of the notch.
          IT IS NO LONGER A BUTTON: it used to restore the header, and Ethan
          asked for that to stop - see the tab strip below. It snaps rather than
          animating for the same reason the overlay does. */}
      <div
        aria-hidden
        className="shrink-0 lg:hidden"
        style={{ height: topGone ? 'max(env(safe-area-inset-top), 12px)' : 0 }}
      />

      {/* SEARCH LIVES AT THE HEAD OF THE STRIP AND TAKES THE WHOLE STRIP OVER.
          Ethan: "because we no longer have the search bar, you could add to the
          left of General a little search icon, and clicking it shows the search
          bar across - it takes over general, introductions, announcements -
          where you can type and search for something. This is for all the
          chats."
          A magnifier at the head of the tabs is where a thumb already is, and
          it costs one tab's worth of width; opening it replaces the tabs
          entirely, because a search field squeezed in beside four room names is
          the "very cramped" bar this strip already had removed once. It writes
          the same `search` state the desktop bar and the header field do, so
          there is one filter and three ways to reach it. */}
      <div
        // NOTHING HERE BRINGS THE HEADER BACK (1 Sep 2026).
        //
        // Ethan: "on mobile when on a chat and the header is gone, scrolling
        // across announcements tabs at the top with announcements, general,
        // content tips etc, should not bring the header back, there should be
        // no way to bring the header back from here, it is not necessary,
        // although the header should smoothly animate back in if you click on a
        // different section like worldwide or rooms."
        //
        // A press here used to restore it, which meant that scrolling the strip
        // sideways to reach another room - a horizontal drag that necessarily
        // starts with a pointerdown - shoved 64px of chrome back onto the
        // screen and pushed the room you were aiming at down with it. The
        // header comes back on the way OUT of the room (the unmount releases
        // the channel), which is the only moment it is wanted.
        className="flex shrink-0 items-stretch gap-1 border-b border-gray-100 px-2 pt-2 lg:hidden"
      >
        <button
          type="button"
          onClick={() => { setStripSearch((v) => !v); if (stripSearch) setSearch('') }}
          aria-label={stripSearch ? 'Close search' : `Search ${active?.label || 'this room'}`}
          aria-expanded={stripSearch}
          className={cx(
            'flex shrink-0 items-center justify-center rounded-t-lg px-2.5 py-1.5 transition-colors',
            stripSearch ? 'bg-brand-tint text-brand' : 'text-smoke hover:bg-cloud hover:text-ink',
          )}
        >
          <Icon name={stripSearch ? 'close' : 'magnifier'} className="h-4 w-4" />
        </button>

        {stripSearch ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${active?.label || 'this room'}`}
              aria-label={`Search ${active?.label || 'this room'}`}
              // `no-ios-zoom` IS 16px ON A PHONE, AND THAT IS THE WHOLE FIX.
              // Ethan: "when I click the magnifying glass icon in top left to
              // search, it zooms in the screen a bit and is weird." iOS Safari
              // zooms the page into any field under 16px and does not zoom back
              // out; at `text-[13px]` this was one of them. It drops back to
              // 13px from `sm` up, where no browser does this.
              className="no-ios-zoom min-w-0 flex-1 border-0 bg-transparent p-0 pb-1.5 sm:text-[13px] placeholder:text-gray-400 focus:outline-none focus:ring-0 focus-visible:ring-0"
            />
            {search && (
              <span className="shrink-0 pb-1.5 text-[11px] tabular-nums text-smoke">
                {visible.length}/{messages.length}
              </span>
            )}
          </div>
        ) : (
          <div
            ref={tabStripRef}
            className="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label={`${community.name} rooms`}
          >
            {channels.map((c) => (
              <button
                key={c.id}
                role="tab"
                data-room-tab={c.key}
                aria-selected={active?.key === c.key}
                onClick={() => navigate(`${base}/${c.key}`)}
                className={cx(
                  // Smaller than they were. Every pixel this strip gives back is
                  // a pixel of conversation, which is what the screen is for.
                  'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-lg px-3 py-1.5 text-[13px] font-semibold transition-colors',
                  active?.key === c.key ? 'bg-brand-tint text-brand' : 'text-smoke hover:bg-cloud hover:text-ink',
                )}
              >
                <Icon name={c.icon || 'chat'} className="h-4 w-4 shrink-0" />
                {tr(c.label)}
              </button>
            ))}

            {/* NO "ALL ROOMS" BUTTON. It sat at the end of a horizontal scroller,
                which is the one place on the strip you cannot see without scrolling
                to it - and the Rooms tab in the bottom bar is one tap from
                anywhere and goes to the same page. Ethan: "I would remove the 'all
                rooms' button way to the right as it's not needed and it's quicker
                to just click on the rooms icon at the bottom." */}
          </div>
        )}
      </div>

      {/* The hint bar doubles as the room's identity on mobile, where the page
          heading is scrolled away.

          THE BAR HAS TO BE TALL ENOUGH FOR THE CONTROL IN IT. It was `py-1` at
          11px, which is a strip about eighteen pixels high, and the search field
          was then squeezed into that - the "very, very cramped" report. The DM
          thread header gives its search real height and reads properly, so this
          matches it: enough room for a 36px field with air round it, and the
          hint text steps up to the same size. */}
      {/* DESKTOP ONLY. On a phone this bar was ~40px of permanent chrome saying
          the room's name - which the highlighted tab directly above it already
          says - with a search field in it. Ethan: "it shouldn't show up the
          second bar below the tabs saying announcements or general with the
          search bar, this takes up too much space, we should be able to see
          messages here." Search moved into the header's own search button,
          which points at whichever chat is open (see lib/chatSearch). */}
      {active && (
        <div className={cx(
          'hidden shrink-0 items-center gap-2.5 px-3 py-1.5 text-xs sm:px-4 sm:py-2 lg:flex',
          active.key === 'announcements' ? 'bg-brand-tint font-medium text-brand' : 'bg-cloud/60 text-smoke',
        )}>
          <RoomSearch value={search} onChange={setSearch} count={visible.length} total={messages.length} />
          {!search && (
            <span className="min-w-0 flex-1 truncate">
              <span className="font-semibold">{tr(active.label)}</span>
              {active.hint && <span className="hidden sm:inline"> · {active.hint}</span>}
            </span>
          )}
        </div>
      )}

      {/* THE THREAD NEVER SHOWS A BLANK ROOM (2 Sep 2026).

          Ethan: "the text is like flashing for the first split second."

          `settled` hides the scroller with `opacity-0` while lib/chatScroll
          pins it, which is right - the rows have to be LAID OUT for there to be
          a scroll height to pin to, so they cannot be unmounted - but it left
          a white rectangle where the conversation was, and then the whole
          thread appeared at once. What that reads as is a flash.

          A placeholder over the top covers the gap, so the sequence is
          skeleton -> conversation rather than skeleton -> nothing -> flash. It
          is bottom-aligned, because a chat fills upwards from the composer and
          a placeholder that starts at the top is a different screen. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollerRef}
        // The browser must not anchor this scroller: lib/chatScroll already owns
        // where it sits, and two mechanisms moving one scroller is the jitter.
        data-chat-scroller
        onScroll={onScroll}
        className={cx(
          'flex-1 space-y-4 overflow-y-auto overscroll-contain overflow-x-hidden px-4 py-4 touch-pan-y touch-pinch-zoom sm:px-5',
          // See `settled` above. Opacity only, and never `visibility` or a
          // conditional render: the rows have to be laid out for the pin to
          // have a scroll height to pin to.
          'transition-opacity duration-150',
          settled ? 'opacity-100' : 'opacity-0',
        )}
      >
        {loading ? (
          <ChatSkeleton />
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <Icon name="chat" className="h-8 w-8 text-gray-200" />
            <p className="text-sm font-medium">{tr("Nothing here yet")}</p>
            <p className="max-w-xs text-xs text-smoke">
              {tr("This room is brand new. It is separate from every other market, so it starts empty.")}
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <Icon name="magnifier" className="h-8 w-8 text-gray-200" />
            <p className="text-sm font-medium">No messages match &ldquo;{search}&rdquo;</p>
          </div>
        ) : (
          visible.map((m, i) => {
            const prev = visible[i - 1]
            const mine = m.sender_id === user?.id
            // Grouping is suppressed while searching: consecutive results are
            // not consecutive messages, so hiding the second author is a lie.
            const grouped = !search && prev && prev.sender_id === m.sender_id
            const reactions = reactionsByMessage.get(m.id) || []
            // [[emoji, count, isMine]] - the shape MessageActions draws.
            const chips = (() => {
              const byEmoji = new Map()
              for (const r of reactions) {
                // [emoji, count, isMine, names] - the names are what the chip's
                // hover tooltip says, so a count always has people behind it.
                const row = byEmoji.get(r.emoji) || [r.emoji, 0, false, []]
                row[1] += 1
                if (r.creator_id === user?.id) { row[2] = true; row[3].push('You') }
                else row[3].push(nameFor(r.creator_id))
                byEmoji.set(r.emoji, row)
              }
              return [...byEmoji.values()]
            })()
            const seen = (isAdmin || mine) ? seenBy(m) : []
            return (
              <motion.div
                key={m.id}
                id={`msg-${m.id}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={SOFT_SPRING}
                // PRESS A MESSAGE TO OPEN ITS ACTIONS. AT EVERY WIDTH.
                // This used to be `if (!isMobile) return`, with a laptop given
                // a hover state instead - two behaviours for one control, and
                // the hover one was the worse of them. Presses on a link, a
                // button or a video are left alone so this never eats a real
                // one, and a press that ENDED A TEXT SELECTION is not a press:
                // dragging across a message to copy it would otherwise open the
                // bar every time.
                onClick={(e) => {
                  if (e.target.closest?.('a,button,video,input')) return
                  if (!window.getSelection?.()?.isCollapsed) return
                  setActionsFor((cur) => (cur === m.id ? null : m.id))
                }}
                // `relative z-20` when this row has something open. Every row
                // here is a motion.div carrying a transform, so each is its own
                // stacking context and a later message paints over an earlier
                // one's popover whatever z-index the popover has.
                className={cx(
                  'group/msg relative flex gap-2.5 hover:z-20 focus-within:z-20',
                  // YOUR OWN MESSAGES SIT ON THE RIGHT.
                  //
                  // THE REPORTED BUG: "whenever I send a message in any of
                  // these rooms it shows up on the left side, which is weird
                  // because normally mine shows on the right and everyone
                  // else's on the left. It's like I'm sending a message and it
                  // appears as if someone else sent it."
                  //
                  // Nothing was ever wrong on the way to the database. This was
                  // a flat Slack-style log where every row was drawn
                  // identically, and the DMs three tabs away bubble your side -
                  // so the rooms looked broken by comparison. Marking the
                  // author "You" (the previous attempt) was not enough: the
                  // SHAPE is what people read, not the label.
                  mine && 'flex-row-reverse',
                  grouped && '!mt-1',
                  // Quiet, not alarming: a queued message is a message, just
                  // one the world has not seen yet.
                  m.pending && 'opacity-60',
                  actionsFor === m.id && 'z-20',
                )}
              >
                {/* THE FACE COLUMN, AND ONLY WHERE A FACE CAN GO.
                    It is not reserved on YOUR rows: your messages never draw an
                    avatar, and the row is `flex-row-reverse`, so an empty 36px
                    column plus its gap sat against the right edge of every
                    message you sent. Ethan: "when I send a message there's a
                    lot of unnecessary white space on the right side."

                    A FACE ON EVERY MESSAGE, INCLUDING A RUN FROM ONE PERSON.
                    The column used to be reserved-but-empty under the first of
                    a run, on the Slack reasoning that repeating the avatar is
                    noise. It is not noise here, because these bubbles are
                    tinted and shrink-to-fit: a run of four short messages from
                    announcements drew one face and then three bubbles hanging
                    off nothing, indented past an empty gutter. Ethan: "I
                    noticed it was showing up like it was floating because there
                    was no profile picture beside it... it should still show up
                    the profile photo on the left hand side even if the creator
                    sent multiple messages, just for the UI, so it looks
                    clean."
                    The NAME line is still once per run - that is the repetition
                    that actually reads as noise, and it is not what anchors the
                    bubble to the left edge. */}
                {!mine && (
                  <div className="w-9 shrink-0 self-end pb-5">
                    <Avatar src={m.profiles?.photo_url} name={m.profiles?.name} size="sm" />
                  </div>
                )}

                <div className={cx('flex w-full min-w-0 max-w-[82%] flex-col sm:max-w-[68%]', mine && 'items-end')}>
                  {/* THE META LINE IS INSIDE MessageActions, and that is the
                      point. The pill hangs off the TOP of whatever this wraps;
                      wrapping the bubble alone put it exactly where "You ·
                      just now" is, so hovering your own message hid who sent it
                      and when. Wrapping the meta line too lifts it clear of
                      everything belonging to this message. It still cannot move
                      when somebody reacts, because the chips are added at the
                      BOTTOM of the wrapper and the pill is anchored to the top. */}
                  <MessageActions
                    className="w-full"
                    side={mine ? 'right' : 'left'}
                    reactions={chips}
                    onToggleReaction={(emoji) => toggleReaction(m.id, emoji)}
                    open={actionsFor === m.id}
                    onClose={() => setActionsFor(null)}
                    // THE EDITED NOTE, THE OUTBOX STATE AND "SEEN BY" GO IN
                    // HERE rather than after the component. They used to be
                    // siblings underneath it, which is exactly where the pill
                    // now lives - so the control you were reaching for landed
                    // on top of the receipt you were trying to read. Passed in,
                    // they share the bottom row with the pill and MessageActions
                    // keeps the two at opposite ends of it.
                    footer={(
                      <>
                        {m.edited_at && !m.pending && (
                          <p className={cx('mt-0.5 px-1 text-[10px] text-gray-400', mine && 'text-right')}>edited</p>
                        )}
                        {m.pending && (
                          <PendingLabel tries={m.tries} className="mt-0.5 block px-1 text-[11px] text-gray-400" />
                        )}
                        {m.failed && (
                          <p className="mt-0.5 px-1 text-[11px] text-smoke">
                            Not sent yet.{' '}
                            <button type="button" onClick={() => retryQueued(m.queuedId)} className="font-semibold text-brand underline">{tr("Retry")}</button>
                            {' · '}
                            <button type="button" onClick={() => dropQueued(m.queuedId)} className="font-semibold underline">{tr("Discard")}</button>
                          </p>
                        )}
                        {seen.length > 0 && (
                          <div className={cx('mt-0.5 flex', mine && 'justify-end')}>
                            <SeenBy readers={seen} align={mine ? 'right' : 'left'} />
                          </div>
                        )}
                      </>
                    )}
                    // Reply to anything, edit yours for five minutes, delete
                    // yours (or anybody's, as an admin), report somebody
                    // else's. A pending message has no id on the server yet, so
                    // none of them apply to it.
                    actions={m.pending || m.failed ? [] : [
                      // MEDIA GETS TWO MORE, AND THEY LEAD. On a message that
                      // is a photograph, "look at it properly" and "keep it"
                      // are what somebody pressed it for; reply and react are
                      // the same as on any other message and can follow.
                      ...((m.image_url || m.video_url)
                        ? [
                          {
                            icon: 'expand',
                            label: 'Full screen',
                            title: 'Open full screen',
                            onClick: () => setViewing({ url: m.image_url || m.video_url, kind: m.image_url ? 'image' : 'video' }),
                          },
                          {
                            icon: 'download',
                            label: 'Save',
                            title: m.image_url ? 'Save this photo' : 'Save this video',
                            onClick: () => saveMedia(m.image_url || m.video_url),
                          },
                        ]
                        : []),
                      ...(canPost
                        ? [{ icon: 'reply', label: 'Reply', title: 'Reply to this message', onClick: () => { setReplyTo(m); setActionsFor(null); composerRef.current?.focus() } }]
                        : []),
                      ...(mine && withinEditWindow(m.created_at, nowTick)
                        ? [{ icon: 'pencil', label: 'Edit message', title: 'Edit (5 minutes)', onClick: () => { setEditingId(m.id); setActionsFor(null) } }]
                        : []),
                      ...(mine || isAdmin
                        ? [{ icon: 'trash', label: 'Delete message', title: 'Delete for everyone', danger: true, onClick: () => removeMessage(m) }]
                        : []),
                      ...(!mine
                        ? [{ icon: 'flag', label: 'Report message', title: 'Report to the team', danger: true, onClick: () => { setReporting(m); setActionsFor(null) } }]
                        : []),
                    ]}
                  >
                    {!grouped && (
                      <p className={cx('mb-1 flex flex-wrap items-baseline gap-x-2 px-1', mine && 'flex-row-reverse')}>
                        <span className={cx('text-sm font-semibold', mine && 'text-brand')}>
                          {mine ? 'You' : (m.profiles?.name || 'Someone')}
                        </span>
                        {!mine && m.profiles?.is_admin && (
                          <span className="rounded-full bg-brand-tint px-1.5 py-0.5 text-[10px] font-semibold text-brand">{tr("Team")}</span>
                        )}
                        <span className="text-[11px] text-smoke" title={messageTimeTitle(m.created_at)}>{formatMessageTime(m.created_at)}</span>
                      </p>
                    )}
                    {/* THE BUBBLE. Shrink-to-fit, so a two-word message is a
                        two-word bubble; the column above caps it at 82% of the
                        thread so a paragraph still wraps. */}
                    <div
                      className={cx(
                        'w-fit max-w-full rounded-2xl text-sm leading-relaxed',
                        mine ? 'ml-auto rounded-br-md bg-brand text-white' : 'rounded-bl-md bg-cloud text-ink',
                        (m.image_url || m.video_url) ? 'overflow-hidden p-1.5' : 'px-3.5 py-2',
                      )}
                    >
                      {/* WHAT THIS IS ANSWERING. A reply with no quote is a
                          non-sequitur three messages later. The quote is a
                          BUTTON: pressing it scrolls to the original and
                          flashes it, so a thread can be walked backwards. */}
                      {m.reply_to && (
                        <div className={cx((m.image_url || m.video_url) && 'px-2 pt-1.5')}>
                          <QuotedParent id={m.reply_to} lookup={byId} onDark={mine} />
                        </div>
                      )}
                      {/* A PHOTO IS PRESSED LIKE ANY OTHER MESSAGE. It opens
                          this message's own bar, which carries Save and Full
                          screen alongside reply / react / delete for anything
                          with media on it - see `actions` below. The picture no
                          longer owns a lightbox, a save button or a long-press
                          sheet of its own. */}
                      {m.image_url && (
                        <ChatMedia
                          url={m.image_url} kind="image" alt={m.body || 'Shared image'}
                          w={m.media_w} h={m.media_h}
                          onTap={() => setActionsFor((cur) => (cur === m.id ? null : m.id))}
                        />
                      )}
                      {m.video_url && (
                        <ChatMedia
                          url={m.video_url} kind="video"
                          onTap={() => setActionsFor((cur) => (cur === m.id ? null : m.id))}
                        />
                      )}
                      {editingId === m.id ? (
                        <div className={cx((m.image_url || m.video_url) && 'px-2 py-1.5')}>
                          <MessageEditor
                            kind="channel"
                            message={m}
                            onDark={mine}
                            onCancel={() => setEditingId(null)}
                            onSaved={(next) => {
                              setMessages((cur) => cur.map((x) => (x.id === next.id ? { ...x, body: next.body, edited_at: next.edited_at } : x)))
                              setEditingId(null)
                            }}
                          />
                        </div>
                      ) : (
                        m.body && (
                          <div className={cx('whitespace-pre-wrap break-words', (m.image_url || m.video_url) && 'px-2 py-1.5')}>
                            {search
                              ? <Highlight text={m.body} term={search} />
                              : renderMessageBody(m.body, { rich: true, members, onDark: mine })}
                          </div>
                        )
                      )}
                      <div className={cx((m.image_url || m.video_url) && 'px-2 pb-1.5')}>
                        <AttachedCard message={m} titles={cardTitles} onDark={mine} />
                      </div>
                    </div>
                  </MessageActions>
                </div>
              </motion.div>
            )
          })
        )}
      </div>

      {!settled && (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <ChatSkeleton fill rows={6} />
        </div>
      )}
      </div>

      {/* THE COMPOSER IS NOT ON SCREEN WHILE YOU ARE SEARCHING.
          Ethan: "it shows up the messaging bar which it shouldn't in that case
          because I would be typing into the search bar, not the message box."
          Two text fields on one phone screen, one of them focused and the other
          holding a keyboard's worth of chrome under the results you are trying
          to read. `stripSearch` is the phone's search - the desktop bar is a
          different control and does not do this - so this only ever applies
          where the space is actually contested. */}
      {stripSearch ? null : !canPost ? (
        <div className="shrink-0 border-t border-gray-100 p-3">
          <p className="flex items-center justify-center gap-2 rounded-xl bg-cloud px-4 py-3 text-center text-xs text-smoke">
            <Icon name="bell" className="h-4 w-4 shrink-0" />
            Only the team posts in {active?.label}. Everyone can read it.
          </p>
        </div>
      ) : (
        <>
        <div className="shrink-0 px-3 pt-3">
          <OutboxNotice scope={outboxScope} />
        </div>
        <ChatComposer
          ref={composerRef}
          docId={`${community.id}:${active?.key}`}
          initialMd={loadDraft(draftKey)}
          // A one-row composer cannot show a placeholder that wraps, and at
          // 375px "Message Introductions" wrapped and had its second line sliced
          // off - which reads as broken before you have typed anything.
          placeholder={isMobile ? 'Message' : `Message ${active?.label}`}
          ariaLabel={`Message ${active?.label}`}
          mentionNames={mentionNames}
          onChangeMd={onComposerChange}
          onInput={onComposerInput}
          // Typing is reading's twin here: both want the screen.
          onFocus={hideChrome}
          onSend={send}
          canSend={!!body.trim()}
          sending={sending}
          onAttach={attach}
          isAdmin={isAdmin}
          onGame={() => setAdminTool('game')}
          onResource={() => setAdminTool('resource')}
          onPoll={() => setAdminTool('poll')}
          onSchedule={() => setAdminTool('schedule')}
          isMobile={isMobile}
          kbOpen={kbOpen}
          bottomInsetHandled={isMobile}
        >
          {/* WHAT YOU ARE REPLYING TO, WHILE YOU TYPE IT.
              Above the composer and inside it, so it moves with the composer on
              a phone where the whole thing is pinned to the visual viewport.
              Escape and the X both clear it; sending clears it too. */}
          {replyTo && (
            <div className="mb-2 flex items-center gap-2 rounded-xl border border-brand/25 bg-brand-tint/40 py-2 pl-3 pr-2">
              <Icon name="reply" className="h-4 w-4 shrink-0 text-brand" />
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold text-brand">
                  Replying to {replyTo.sender_id === user?.id ? 'yourself' : (replyTo.profiles?.name || 'someone')}
                </span>
                <span className="block truncate text-xs text-smoke">
                  {(replyTo.body || '').replace(/\s+/g, ' ').trim()
                    || (replyTo.image_url ? 'Photo' : replyTo.video_url ? 'Video' : 'Message')}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                aria-label={tr("Cancel reply")}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-smoke transition-colors hover:bg-white hover:text-ink"
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* THE INTRO INVITATION, IN THE ROOM ITS ANSWER GOES TO.
              It renders nothing anywhere else and nothing once the creator has
              posted an introduction. It opens itself once a session as a card
              over the room; dismiss it and this stays as the way back in. */}
          <IntroInvite community={community} channel={active} canPost={canPost} />

          {attachError && (
            <p role="alert" className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{attachError}</p>
          )}
          {/* @-autocomplete, anchored above the composer. */}
          <AnimatePresence>
            {mention && (
              <MentionMenu
                query={mention.query}
                members={members}
                isAdmin={isAdmin}
                onPick={pickMention}
                onClose={() => setMention(null)}
              />
            )}
          </AnimatePresence>
        </ChatComposer>
        </>
      )}
    </div>
  )

  return (
    <NetworkMotion>
      {/* Desktop heading. Hidden on mobile because the overlay covers the area
          it would occupy, and a heading nobody can see still costs layout. */}
      <div className="mx-auto hidden w-full max-w-7xl px-4 pt-8 sm:px-6 lg:block lg:px-8">
        <Link
          to={slug ? `/c/${slug}` : '/global'}
          className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-smoke transition-colors hover:text-brand"
        >
          <Icon name="chevronLeft" className="h-4 w-4" />
          {community.name}
        </Link>
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight sm:text-3xl">
          {flags && <span aria-hidden>{flags}</span>}
          {community.name}
        </h1>
        {/* THE SCOPE LINE IS GONE. Every market page carried "Only Spain.
            Nothing posted here reaches another market." under its own title,
            which is a disclaimer where a room name should be: it repeats what
            the flag, the market name and the place switcher directly above it
            all already say, and it reads as a warning about something that has
            not happened. Ethan asked for it off. */}
      </div>

      <div
        style={mobileStyle}
        className={cx(
          // Mobile: a fixed overlay pinned to the visual viewport so the
          // document never scrolls and the composer hugs the keyboard. Desktop
          // keeps the normal centred card.
          'fixed inset-x-0 flex w-full flex-col',
          kbOpen ? 'z-50' : 'z-20',
          'lg:static lg:inset-auto lg:z-auto lg:mx-auto lg:h-[calc(100vh-11rem)] lg:max-w-7xl lg:translate-y-0 lg:px-8 lg:pb-8 lg:pt-4',
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:items-stretch lg:gap-6">
          {/* Rooms sidebar, desktop only. There is deliberately no market
              switcher on this page: a strip of other markets above a
              conversation makes the room feel like a tab in a directory rather
              than somewhere you are. Leaving is the back link, one target. */}
          {/* ONE LIST, AND IT DOES NOT MOVE.
              Every place you belong to, grouped by market, so a creator in
              Worldwide and Spain reaches the Spanish General without going back
              to Spain first. It is still not a market switcher: these are rooms
              you are already in, not places to browse.

              IT USED TO BE TWO CARDS - where you ARE pinned at the top, and
              everywhere else beneath - and that made the column reshuffle every
              time you opened a room: press General in Portugal and Portugal
              leapt to the top while the place you had just left dropped down
              into the list. A sidebar whose order is a function of where you
              last clicked cannot be learned. Now the order is only ever the
              reader's, and opening a room moves the highlight, nothing else. */}
          {/* `focus:outline-none` because Chrome makes any element with
              `overflow-y: auto` keyboard focusable and paints its own grey
              focus ring round the whole region the moment you click inside it -
              which on a column of white cards reads as a box drawn round the
              sidebar. The region stays wheel and keyboard scrollable; only the
              ring goes. */}
          <nav aria-label={tr("Rooms")} className="hidden focus:outline-none lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:gap-3 lg:overflow-y-auto overscroll-contain lg:overscroll-contain lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden">
            {/* ONE CARD PER MARKET, IN YOUR ORDER.
                These were sub-headings inside a single "Your other rooms" box,
                which made six markets read as one long undifferentiated list -
                exactly the flat-list problem the /rooms page exists to solve,
                reproduced in the sidebar. Germany is a place. It gets a card.

                And the order is the reader's. Somebody who lives in the
                Portuguese room should not have to scroll past Germany and the
                Nordics to reach it every time, and there is no ordering we
                could pick centrally that would be right for everybody. Drag
                the grip; it is remembered on this device. */}
            <Reorderable
              items={orderedPlaces}
              onReorder={saveRoomOrder}
              handleLabel="Reorder this market"
              className="flex flex-col gap-3"
              // The lift lives on the CARD, not on Reorderable's wrapper. A
              // shadow on the wrapper is a shadow at the wrong corner radius,
              // and its four grey arcs poking past the card are what read as
              // an outline down this column.
              renderItem={(place, { handleProps, dragging }) => {
                const here = place.id === community.id
                const roomBase = place.kind === 'network' ? '/global/chat' : `/c/${place.slug}/chat`
                return (
                  <div className={cx(
                    'group rounded-card border bg-white p-2 transition-shadow',
                    dragging ? 'border-brand/40 shadow-lift' : 'border-gray-100 shadow-card',
                  )}>
                    <div className="flex items-center gap-1 px-1 pb-1.5 pt-1">
                      <Link
                        to={place.kind === 'network' ? '/global' : `/c/${place.slug}`}
                        className={cx(
                          'flex min-w-0 flex-1 items-center gap-2 text-[11px] font-semibold transition-colors hover:text-brand',
                          here ? 'text-brand' : 'text-smoke',
                        )}
                      >
                        <span aria-hidden>{place.flags || '🌍'}</span>
                        <span className="min-w-0 truncate">{place.name}</span>
                      </Link>
                      <span
                        {...handleProps}
                        title={tr("Drag to reorder")}
                        className="flex h-6 w-5 shrink-0 items-center justify-center rounded-md text-gray-300 transition-opacity hover:text-smoke focus:opacity-100 focus:outline-none focus-visible:text-brand sm:opacity-40 sm:group-hover:opacity-100"
                      >
                        <Icon name="grip" className="h-3.5 w-3.5" />
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {place.rooms.map((c) => {
                        // The row you are reading. Only ever a highlight - the
                        // row does not move, and neither does its card.
                        const on = here && active?.key === c.key
                        return (
                          <Link
                            key={c.id}
                            to={`${roomBase}/${c.key}`}
                            aria-current={on ? 'page' : undefined}
                            className={cx(
                              'flex items-center gap-2.5 rounded-xl px-3 py-2 transition-colors duration-200',
                              on ? 'bg-brand-tint font-medium text-brand' : 'text-ink hover:bg-cloud',
                            )}
                          >
                            <Icon name={c.icon || 'chat'} className={cx('h-3.5 w-3.5 shrink-0', on ? 'text-brand' : 'text-smoke')} />
                            <span className="min-w-0 flex-1 truncate text-[13px]">{tr(c.label)}</span>
                            {c.visibility === 'staff' && (
                              <span className="shrink-0 rounded-full bg-cloud px-1.5 py-0.5 text-[9px] font-medium text-smoke">{tr("Staff")}</span>
                            )}
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )
              }}
            />
          </nav>

          {room}
        </div>
      </div>

      {/* Poll / game / resource, for admins, in this room like any other.

          GUARDED ON THERE BEING A ROOM, which it was not - and `active` is null
          on the first paint of every visit, because it is derived from a
          channel list that is fetched. `scopedKey(community, active.key)` was
          evaluated unconditionally on the way into this element, so the whole
          page threw before it could render anything: not a dead link, a dead
          route. It stayed dead for any community whose channel list came back
          empty. */}
      {active && community && (
      <ChatAdminTools
        // A market room schedules on the MARKET's clock: 09:00 in the Spanish
        // room means 09:00 in Madrid, whoever is typing it.
        room={{
          channel: scopedKey(community, active.key),
          channel_id: active.id,
          community_id: community.id,
          tz: community?.timezone || 'Europe/London',
        }}
        tool={adminTool}
        onClose={() => setAdminTool(null)}
        postCard={(fields) => postMessage({ body: '', ...fields })}
        // THE ROOM'S NAME, NOT A SLUG. Ethan: "I don't know why it's
        // showing up like hashtag general. It should just show up like
        // general, the actual chat name." The hash and the lowercasing were
        // borrowed from Slack; nothing else in this product writes a room
        // that way, and the tab the admin just pressed says "General".
        roomLabel={active?.label || 'this room'}
      />
      )}

      <ReportMessage
        open={!!reporting}
        kind="channel"
        messageId={reporting?.id}
        authorName={reporting?.profiles?.name}
        authorPhoto={reporting?.profiles?.photo_url}
        sentAt={reporting?.created_at}
        preview={reporting?.body || ''}
        imageUrl={reporting?.image_url}
        videoUrl={reporting?.video_url}
        onClose={() => setReporting(null)}
      />

      {/* ONE FULL-SCREEN LAYER FOR THE WHOLE THREAD, opened from a message's
          own action bar. It portals to the body, so neither a bubble's
          `overflow-hidden` nor the chat overlay can clip it, and it carries its
          own pinch zoom and Save. */}
      <PhotoLightbox
        src={viewing?.url ?? null}
        kind={viewing?.kind ?? 'image'}
        alt="Shared media"
        canSave
        onClose={() => setViewing(null)}
      />
    </NetworkMotion>
  )
}
