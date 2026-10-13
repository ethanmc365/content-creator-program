import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { confirm, notice } from '../lib/confirm'
import { useAuth } from '../context/AuthContext'
import { useCommunity } from '../context/CommunityContext'
import { useUnread } from '../context/UnreadContext'
import RoomSwitcherSheet from '../components/chat/RoomSwitcherSheet'
import { flagFromIso } from '../components/network/PlaceSwitcher'
import NetworkMotion from '../components/NetworkMotion'
import { useProfileNames, useReactions, RoomSearch } from '../components/network/ChatExtras'
import { registerChatSearch } from '../lib/chatSearch'
import { setChatChromeHidden, readerMovedChrome } from '../lib/chatChrome'
import { useNoScrollChain, useOverlayTouchLock } from '../lib/noScrollChain'
import { ChatSkeleton } from '../components/network/Skeletons'
import Icon from '../components/Icon'
import PhotoLightbox from '../components/PhotoLightbox'
import { saveFile, fileNameFromUrl } from '../lib/media'
import { uploadChatImage, uploadChatVideo } from '../lib/chatMedia'
import { pinToBottom, isPinning, stickToBottom } from '../lib/chatScroll'
import { broadcastNames } from '../lib/broadcastMentions'
import ChatAdminTools from '../components/ChatAdminTools'
import ReportMessage from '../components/ReportMessage'
import { useNowTick } from '../lib/messageActions'
import { playSend, playSendFail, playInbound } from '../lib/appSounds'
import { buildIntro, parseLegacyIntro } from '../lib/intro'
import { loadRelationships } from '../lib/connections'
import { textBeforeCaret } from '../lib/richEditor'
import { saveDraft, clearDraft } from '../lib/drafts'
import { EmptyState } from '../components/ui'
import { useChatOverlayHeight, useIsMobile, useViewportPin, useNoFocusPan } from '../lib/useKeyboardInset'
import { cx } from '../lib/utils'
import { enqueueMessage, queuedFor, subscribeOutbox, onOutboxSent, onOutboxBlocked } from '../lib/outbox'
import { useT } from '../lib/i18n'
import { useMessageTranslations } from '../lib/quickTranslate'
import { testFlags } from '../lib/testData'
import { onResume } from '../lib/resume'
import { profilesApi } from '../api/profiles'
import { chatApi } from '../api/chat'
import { marketsApi } from '../api/markets'
import { scopedKey, ROOM_CACHE, roomCacheFor, ROOM_ORDER_KEY, loadRoomOrder, hasContent, VipChip } from './NetworkChatParts'
import NetworkChatRoomNav from './NetworkChatRoomNav'
import NetworkChatComposerDock from './NetworkChatComposerDock'
import NetworkChatThread from './NetworkChatThread'

// The three interactive cards. Lazy is wrong here: a room whose most recent
// messages include a poll would pop it in after the thread had already settled,
// which is exactly the growth-after-pin that lib/chatScroll exists to stop.



































export default function NetworkChat() {
  const tr = useT()
  const { slug, channelKey } = useParams()
  const { user, profile, isAdmin } = useAuth()
  const { bySlug, network, manages, myCommunities, loading: ctxLoading } = useCommunity()

  const community = slug ? bySlug(slug) : network
  // BACK FROM A PROFILE, THE ROOM IS STILL THERE. The room's list, the sidebar and the last messages read are kept for
  // the session (ROOM_CACHE), drawn at once on the way back, and refreshed quietly behind. Another account (a sign-in,
  // or "view as creator") never sees what the last one read.
  const cacheFor = roomCacheFor(user?.id)
  const cachedKey = community && channelKey ? scopedKey(community, channelKey) : null
  const [channels, setChannels] = useState(() => (community && cacheFor.channels.get(community.id)) || [])
  const [sidebarRooms, setSidebarRooms] = useState(() => cacheFor.sidebar || [])
  const [messages, setMessages] = useState(() => (cachedKey && cacheFor.messages.get(cachedKey)) || [])
  const [loading, setLoading] = useState(() => !(cachedKey && cacheFor.messages.has(cachedKey)))
  // WHICH ROOM `messages` BELONGS TO, so a room whose messages are already in hand is shown at once (see `settled`).
  const [messagesKey, setMessagesKey] = useState(() => (cachedKey && cacheFor.messages.has(cachedKey) ? cachedKey : null))
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const [members, setMembers] = useState([])
  const [mention, setMention] = useState(null) // { query, start } while typing @…
  const [roomOrder, setRoomOrder] = useState(loadRoomOrder)
  const [attachError, setAttachError] = useState('')
  // Titles for poll / game / resource cards, keyed `table:id`.
  // Which message has its actions revealed by a TAP. On a phone there is no
  // hover, so `group-hover` alone meant the reaction button was permanently
  // invisible and market rooms simply had no reactions on mobile.
  // TRANSLATE A MESSAGE: only for a reader on another language, original first.
  const mt = useMessageTranslations()
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

  const overlayRef = useRef(null)
  // The composer and what floats over it: it rides with the keyboard while the thread scrolls (useChatOverlayHeight).
  const dockRef = useRef(null)
  const isMobile = useIsMobile()
  useViewportPin(overlayRef, isMobile)
  // No pan when the message box takes focus, so the header stays where it is (see useNoFocusPan).
  useNoFocusPan(overlayRef, isMobile)
  useOverlayTouchLock(overlayRef, isMobile)
  useNoScrollChain(scrollerRef, `${slug}-${channelKey}`)

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
  const [stripSearch, setStripSearch] = useState(false)
  // The header's X only ever closes the search; see closeThreadSearch in Messages for the blur race this avoids.
  const stripClosedAt = useRef(0)
  const closeStripSearch = useCallback(() => { stripClosedAt.current = Date.now(); setStripSearch(false); setSearch('') }, [])
  // The room switcher sheet (components/chat/RoomSwitcherSheet), opened from the phone's room header.
  const [switcher, setSwitcher] = useState(false)
  const closeSwitcher = useCallback(() => setSwitcher(false), [])
  useEffect(() => { setSwitcher(false) }, [channelKey, slug])
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
  const { kbOpen, height: overlayH } = useChatOverlayHeight({ enabled: isMobile, chromeHidden, overlayRef, dockRef, scrollerRef, tuck: 2 })
  const topGone = kbOpen || chromeHidden
  const mobileStyle = isMobile
    ? {
        top: topGone ? 0 : 'calc(4rem + env(safe-area-inset-top))',
        // One px height for both states, glided on keyboard changes (useChatOverlayHeight).
        height: `${overlayH}px`,
        // `transform` is written frame by frame by useViewportPin, not here.
        // THE OVERLAY SNAPS. ONLY THE HEADER ANIMATES.
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

  // A layout effect so the lock is released in the same commit that leaves the chat: AppLayout restores the scroll of
  // the page you return to in its own layout effect, and a document still locked would clamp it to the top.
  useLayoutEffect(() => {
    if (!isMobile) return
    document.documentElement.classList.add('overlay-lock')
    return () => document.documentElement.classList.remove('overlay-lock')
  }, [isMobile])

  const active = useMemo(
    () => channels.find((c) => c.key === channelKey) || channels[0] || null,
    [channels, channelKey],
  )

  // THE INTRODUCTIONS ROOM DRAWS CARDS. A new intro carries `intro` (migration 262); an old one is read back out of its
  // text with parseLegacyIntro, so the whole room looks the same. Each card ends in a Connect button, so the reader's
  // relationships are loaded once, here.
  const isIntroRoom = active?.key === 'introductions'
  const [relations, setRelations] = useState(() => new Map())
  useEffect(() => {
    if (!isIntroRoom || !user?.id) return undefined
    let alive = true
    loadRelationships(user.id).then((map) => { if (alive && map) setRelations(map) }).catch(() => {})
    return () => { alive = false }
  }, [isIntroRoom, user?.id])
  // AN OLD INTRO GETS THE PROFILE'S FLAGS AND SOCIALS TOO. It was written
  // before the card existed, so its text has none; the profile has them now.
  const [introProfiles, setIntroProfiles] = useState(() => new Map())
  const introSenders = useMemo(
    () => (isIntroRoom ? [...new Set(messages.filter((m) => !m.intro).map((m) => m.sender_id))].sort().join(',') : ''),
    [isIntroRoom, messages],
  )
  useEffect(() => {
    if (!introSenders) return undefined
    let alive = true
    profilesApi.profiles()
      .select('id, countries_visited, bucket_list, instagram_url, tiktok_url, youtube_url, facebook_url, languages')
      .in('id', introSenders.split(','))
      .then(({ data }) => { if (alive && data) setIntroProfiles(new Map(data.map((p) => [p.id, p]))) })
    return () => { alive = false }
  }, [introSenders])
  const introOf = (m) => {
    if (m.intro) return m.intro
    if (!isIntroRoom || m.image_url || m.video_url) return null
    const legacy = parseLegacyIntro(m.body)
    if (!legacy) return null
    const p = introProfiles.get(m.sender_id)
    if (!p) return legacy
    const rich = buildIntro(p, {}, {})
    return { ...legacy, visited: rich.visited, dreams: rich.dreams, socials: rich.socials, stats: { countries: rich.stats.countries, flights: 0, videos: 0 } }
  }

  // THE HEADER'S SEARCH BUTTON SEARCHES THIS ROOM WHILE IT IS OPEN.
  // See lib/chatSearch for why this is a module-level channel rather than a
  // prop threaded through the shell.
  useEffect(
    () => registerChatSearch({ label: active?.label || 'this room', value: search, onChange: setSearch }),
    [active?.label, search],
  )

  // WHO CAN POST HERE. Two rules and no third.
  //
  // THE THIRD RULE WAS THE BUG. There used to be an `isLiveWorldwide` guard that made Worldwide's General, Announcements
  // and Content tips READ ONLY, with a panel explaining that "this is a room every creator is already in today, so it is
  // read only here in case a test message reaches all of them". That was correct while the network was an admin-only
  // preview sitting underneath a live UK chat. The network IS the app now, those three rooms are the main conversation,
  // and the guard was locking everybody out of the busiest rooms on the platform.
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
    chatApi.channels()
      .select('id, key, label, hint, icon, visibility, post_policy, position')
      .eq('community_id', community.id).order('position')
      .then(({ data }) => {
        if (cancelled) return
        ROOM_CACHE.channels.set(community.id, data || [])
        setChannels(data || [])
      })
    return () => { cancelled = true }
  }, [community])

  // Every room in EVERY place the viewer belongs to, including the one they are
  // standing in.
  //
  // IT INCLUDES THE CURRENT PLACE ON PURPOSE, AND THAT IS THE WHOLE FIX.
  //
  // THE BUG THIS FIXES. The sidebar used to be two things: a card for where you ARE, pinned at the top, and a
  // reorderable list of everywhere else under it. So opening Portugal's General re-sorted the entire column - Portugal
  // leapt to the top and whatever you had been reading dropped into the list below.
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
    chatApi.channels()
      .select('id, key, label, icon, visibility, position, community_id')
      .in('community_id', sidebarIds).order('position')
      .then(({ data }) => { if (!cancelled) { ROOM_CACHE.sidebar = data || []; setSidebarRooms(data || []) } })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarIds.join(',')])

  const load = useCallback(async () => {
    if (!community || !active) return
    const key = scopedKey(community, active.key)
    // A room read before this session shows what it had at once; the fresh read replaces it without a skeleton.
    const cached = ROOM_CACHE.messages.get(key)
    if (cached) { setMessages(cached); setMessagesKey(key); setLoading(false) } else setLoading(true)
    const { data } = await chatApi
      .messages()
      .select('*, profiles:sender_id(id, name, photo_url, is_admin)')
      .eq('channel', scopedKey(community, active.key))
      .eq('deleted', false)
      .order('created_at', { ascending: true })
      .limit(200)
    ROOM_CACHE.messages.set(key, data || [])
    setMessages(data || [])
    setMessagesKey(key)
    setLoading(false)
  }, [community, active])
  // Keep the cache as current as the screen (realtime inserts, edits, deletes), so coming back shows the latest.
  const liveKey = community && active ? scopedKey(community, active.key) : null
  useEffect(() => {
    if (liveKey && !loading) ROOM_CACHE.messages.set(liveKey, messages.filter((m) => !m.pending && !m.failed))
  }, [liveKey, messages, loading])

  useEffect(() => { load() }, [load])

  // Room members, for @-autocomplete. Scoped to THIS community: @-ing somebody
  // who cannot read the room is a mention that goes nowhere.
  useEffect(() => {
    if (!community) return
    let alive = true
    marketsApi.communityMembers()
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
          const { data } = await chatApi
            .messages()
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
    // Not while the keyboard glide is scrolling the thread (lib/useKeyboardInset); it lands at the bottom itself.
    if (el && atBottomRef.current && el.dataset.glide !== '1') el.scrollTop = el.scrollHeight
  }, [])

  // A ROOM DOES NOT OPEN HALFWAY UP ITSELF AND THEN CORRECT ITSELF.
  //
  // , and later "it flashes, glitches and then shows the current chats, sometimes it's scrolled up a bit, its
  // inconsistent, sometimes it jutters more."
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

  // NO FLASH WHEN THE MESSAGES ARE ALREADY HERE. Every open hid the thread for a few frames behind a skeleton and faded
  // it in, even when the room's messages were in hand from the cache and could be pinned to the bottom before the first
  // paint. Now: messages for THIS room present -> pin here (a layout effect, so before paint) and show at once; the pin
  // loop below still follows anything that grows late. Only a room still loading, or still showing the previous room's
  // messages, is hidden.
  const readyKey = community && active ? scopedKey(community, active.key) : null
  const ready = !loading && readyKey != null && messagesKey === readyKey
  // Starts true when the room is ready on mount: the thread is never painted hidden, so nothing fades in.
  const [settled, setSettled] = useState(ready)
  useLayoutEffect(() => {
    atBottomRef.current = true
    setSettled(ready)
    // NOTHING TO PIN WHILE THE ROOM IS STILL LOADING. This effect used to run
    // against the SKELETON: a skeleton has no images and a stable height, so
    // the loop declared it settled within two frames, revealed it, and then
    // re-ran on the real messages and hid the thread again. Skeleton, flash,
    // skeleton, thread. The skeleton is drawn by the `loading` branch below and
    // needs no pinning of its own.
    if (loading) return undefined
    pin()
    if (ready) setSettled(true)
    return pinToBottom(
      () => scrollerRef.current,
      () => atBottomRef.current,
      () => setSettled(true),
    )
  }, [loading, ready, active?.key, community?.id, pin])

  useEffect(() => { pin() }, [messages.length, pin])

  // AND STAY THERE. The poll, game and resource cards in a room fetch their own
  // contents and grow long after the arrival loop has settled - measured at
  // 104px off the bottom in Announcements and 53px in Content tips, every time,
  // while General (no cards) opened at 1px. See stickToBottom.
  useEffect(() => {
    if (loading) return undefined
    return stickToBottom(() => scrollerRef.current, () => atBottomRef.current)
  }, [loading, active?.key, community?.id])
  // Reflow when the keyboard opens: the scroller just got shorter, so the
  // message the user was reading has to stay at the bottom.
  useEffect(() => { pin() }, [kbOpen, overlayH, pin])

  // The titles behind any poll / game / resource cards in this room. One query
  // per kind, only for the kinds actually present, and only when the set of ids
  // changes - a room with no cards in it issues nothing.
  // THE TITLE PREFETCH IS GONE WITH THE LINK STRIPS.
  //
  // It ran one query per card kind present in the room, purely to write a title
  // into a strip that said "Poll: which destination next?" and linked away.
  // `PollCard`, `GameEventCard` and `ResourceCard` each load the thing they are
  // drawing, so this was a second, earlier, partial fetch of the same rows.

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
  // THE ROOM'S MESSAGES FLOAT IN WHEN IT OPENS. For the first moment after a room's messages arrive, the last dozen or
  // so rise in one after another from the top of the screen down; older ones off screen and messages arriving later are
  // not held.
  const [introRoom, setIntroRoom] = useState(null)
  const [introOver, setIntroOver] = useState(null)
  const hasMessages = messages.length > 0
  useEffect(() => {
    if (!roomKey || loading || !hasMessages || introRoom === roomKey) return undefined
    setIntroRoom(roomKey)
    const t = setTimeout(() => setIntroOver(roomKey), 1100)
    return () => clearTimeout(t)
  }, [roomKey, loading, hasMessages, introRoom])
  const introducing = !!roomKey && introOver !== roomKey
  // Per-room draft, so a half-written message in Spain's General is still there
  // when you come back from the UK's.
  const draftKey = `net-chat-${roomKey || 'none'}`

  // ---- The unread dots --------------------------------------------------
  //
  // Which OTHER rooms have something new in them, for the sidebar and the tab
  // strip. `markRead` is the optimistic half of the watermark below: opening a
  // room puts its dot out on the same frame rather than after the throttled
  // upsert has been acknowledged, which is the difference between a signal you
  // trust and one that lingers on the thing you are reading.
  const { unread, markRead, readAt } = useUnread()
  // WHERE THE NEW MESSAGES START. The room's read watermark as it was the moment it was opened - taken DURING RENDER,
  // before the effect below moves it to now - so the thread can draw a "New messages" line and the bar can jump to it.
  const [openedRead, setOpenedRead] = useState({})
  if (roomKey && readAt && !(roomKey in openedRead)) setOpenedRead((o) => ({ ...o, [roomKey]: readAt.get(roomKey) || null }))
  const openedReadAt = roomKey ? openedRead[roomKey] ?? null : null
  useEffect(() => {
    if (roomKey) markRead(roomKey)
  }, [roomKey, markRead])

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
    chatApi.channelReads().select('user_id, last_read_at').eq('channel', roomKey)
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

  // WRITING "I HAVE READ THIS ROOM" (migration 250).
  //
  // The team: rooms showed a dot for messages he had already read, after a refresh, another tab or the phone. This write
  // was the cause three ways:
  //   - a LEADING-EDGE throttle with no trailing call: a message that arrived
  //     inside 2.5s of the last write was never recorded at all, so it was
  //     "unread" again on the next load;
  //   - the throttle was shared by EVERY room, so opening one room and then
  //     another within 2.5s never marked the second;
  //   - the browser's own clock, `upsert`ed over whatever was there, so a slow
  //     phone or an old tab could move the watermark BACKWARDS.
  // Now: `mark_channel_read` stamps the server's time and only moves forward;
  // the write is per room, trailing (the last message always lands), and
  // flushed when the room is left or the app goes to the background.
  const readTimer = useRef(null)
  const readPending = useRef(null)
  const flushRead = useCallback(() => {
    clearTimeout(readTimer.current)
    const key = readPending.current
    readPending.current = null
    if (!key) return
    chatApi.markChannelRead({ p_channel: key })
      .then(({ data }) => {
        if (data && user?.id) setReads((prev) => new Map(prev).set(user.id, data))
      }, () => {})
  }, [user?.id])
  useEffect(() => {
    if (!roomKey || !user?.id || loading || messages.length === 0) return
    if (document.visibilityState === 'hidden') return
    // A different room waiting to be written goes now, not never.
    if (readPending.current && readPending.current !== roomKey) flushRead()
    const first = !readPending.current && !readTimer.current
    readPending.current = roomKey
    markRead(roomKey)
    clearTimeout(readTimer.current)
    readTimer.current = setTimeout(() => { readTimer.current = null; flushRead() }, first ? 300 : 1500)
  }, [roomKey, user?.id, loading, messages.length, markRead, flushRead])
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushRead() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flushRead)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flushRead)
      flushRead()
    }
  }, [flushRead])
  // Coming back to an open room is reading it again.
  useEffect(() => {
    if (!roomKey) return undefined
    return onResume(() => {
      readPending.current = roomKey
      markRead(roomKey)
      flushRead()
    })
  }, [roomKey, markRead, flushRead])

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

  // CLOSING A SEARCH PUTS YOU BACK WHERE YOU WERE. The team: pressing the X on the room's search "seems to reload the
  // entire page... it should just bring it back to wherever I was". Every message the search had hidden mounted again
  // with its entrance animation, all at once, and the list landed somewhere else. So the frame a search is cleared
  // mounts them still (`quietMount`), and the scroller goes back to the distance from the bottom it had before the
  // search began (kept by the scroll listener below while no search is typed).
  const [searchWas, setSearchWas] = useState(search)
  const [quietMount, setQuietMount] = useState(false)
  if (searchWas !== search) {
    setSearchWas(search)
    setQuietMount(!search.trim() && !!searchWas.trim())
  }
  const fromBottomRef = useRef(0)
  const lastTopRef = useRef(0)
  const searchingRef = useRef(false)
  useEffect(() => { searchingRef.current = !!search.trim() }, [search])
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return undefined
    const onScroll = () => { if (!searchingRef.current) fromBottomRef.current = Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight) }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [channelKey, slug, hasMessages])
  useLayoutEffect(() => {
    if (!quietMount) return
    const el = scrollerRef.current
    if (el) el.scrollTo({ top: Math.max(0, el.scrollHeight - el.clientHeight - fromBottomRef.current), behavior: 'instant' })
    setQuietMount(false)
  }, [quietMount])

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

  const firstUnread = useMemo(() => {
    if (!openedReadAt || search) return null
    return visible.find((m) => !m.pending && m.created_at > openedReadAt && m.sender_id !== user?.id) || null
  }, [visible, openedReadAt, search, user?.id])
  const unreadSince = firstUnread ? visible.filter((m) => m.created_at >= firstUnread.created_at && m.sender_id !== user?.id).length : 0
  const [farFromEnd, setFarFromEnd] = useState(false)
  const scrollToMessage = useCallback((id) => {
    const el = scrollerRef.current
    const row = document.getElementById(`msg-${id}`)
    if (!el || !row) return
    const top = row.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 72
    el.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }, [])
  const jumpToEnd = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    atBottomRef.current = true
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [])

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
    // WHILE A PIN IS IN FLIGHT, THIS EVENT IS NOT THE READER. See lib/chatScroll's 3 Sep note: a scroll event fired by
    // the pin itself, or by content growing under it, was being read as "they scrolled up" and it switched the pin off
    // for the rest of the room's life. The thread is at opacity-0 for the whole of that window - there is nothing on
    // screen for anybody to have scrolled.
    if (!isPinning(el)) {
      atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      const far = el.scrollHeight - el.scrollTop - el.clientHeight > 600
      setFarFromEnd((f) => (f === far ? f : far))
    }
    // Reading hides the chrome; running out of messages at the top brings it
    // back, because that is the moment you are looking for something else.
    // Only for a scroll the reader made - see lib/chatChrome (the translate shake).
    if (!readerMovedChrome()) { lastTopRef.current = el.scrollTop; return }
    // HYSTERESIS. The team: scrolling up, "I don't get to the top... and the header jumps up. Everything sort of jitters
    // there". It flipped on a single 12px line: the header coming in changes the overlay's height, the list moves under
    // the finger, the line is crossed again, and it flips back. Now it comes back only at the very top while moving up,
    // and goes away only after a real scroll down (40px past the top, moving down).
    const top = el.scrollTop
    const dy = top - lastTopRef.current
    lastTopRef.current = top
    if (top <= 2 && dy <= 0) showChrome()
    else if (top > 40 && dy > 2) hideChrome()
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
    const { error } = await chatApi.deleteMessage({ p_id: m.id })
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

  const flags = (community.country_codes || []).map(flagFromIso).join('')

  // EVERY place you belong to, each with its rooms, in ONE list - the place you
  // are standing in included, sitting wherever the reader put it. Worldwide
  // first and then markets alphabetically is only the DEFAULT, used until
  // somebody drags something. A place with no rooms is dropped rather than
  // rendered as an empty heading.
  const allPlaces = [
    ...myCommunities,
    ...(community && !myCommunities.some((c) => c.id === community.id) ? [community] : []),
  ]
  const places = allPlaces
    .map((c) => ({
      ...c,
      flags: (c.country_codes || []).map(flagFromIso).join(''),
      // THE VIP LOUNGE IS A WORLDWIDE ROOM. A network room with visibility 'vip' stays in Worldwide's card, last; only
      // the market VIP rooms get cards of their own.
      rooms: sidebarRooms
        .filter((r) => r.community_id === c.id && (r.visibility !== 'vip' || c.kind === 'network'))
        .sort((a, b) => (a.visibility === 'vip') - (b.visibility === 'vip')),
    }))
    .filter((c) => c.rooms.length > 0)
    .sort((a, b) => (b.kind === 'network') - (a.kind === 'network') || a.name.localeCompare(b.name))
  // THE VIP ROOMS, APART. Each VIP market (and the lounge) is its own card under a "VIP rooms" heading, below the
  // markets for the team and at the top for a VIP creator.
  const vipFirst = !!profile?.is_vip && !isAdmin
  const vipPlaces = allPlaces
    .filter((c) => c.kind !== 'network')
    .map((c) => ({ ...c, rooms: sidebarRooms.filter((r) => r.community_id === c.id && r.visibility === 'vip') }))
    .filter((c) => c.rooms.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name))

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

  // How many OTHER rooms have something new, for the badge on the phone's room header.
  const otherUnread = [...orderedPlaces, ...vipPlaces]
    .reduce((n, p) => n + p.rooms.filter((r) => { const k = scopedKey(p, r.key); return k !== roomKey && unread.has(k) }).length, 0)

  // --------------------------------------------------------------- the room
  const room = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white lg:rounded-card lg:border lg:border-gray-100 lg:shadow-card">
      {/* Room tabs. On mobile these ARE the navigation: the sidebar is a
          desktop-only shape and a stack of full-width room buttons above a
          conversation pushes the conversation off the screen. */}
      {/* THE NOTCH INSET, AS A REAL ELEMENT. With the header away the overlay
          starts at y=0, and this is what keeps the tabs clear of the notch.
          IT IS NO LONGER A BUTTON: it used to restore the header, and the team asked for that to stop - see the tab
          strip below. It snaps rather than animating for the same reason the overlay does. */}
      <div
        aria-hidden
        className="relative z-10 shrink-0 bg-white lg:hidden"
        // THE NOTCH AND NOTHING MORE. It had a 12px floor, which on top of the header's own padding read as "extra white
        // space above" General (the team). The inset alone clears the status bar.
        style={{ height: topGone ? 'env(safe-area-inset-top)' : 0 }}
      />

      {/* SEARCH LIVES AT THE HEAD OF THE STRIP AND TAKES THE WHOLE STRIP OVER. A magnifier at the head of the tabs is
          where a thumb already is, and it costs one tab's worth of width; opening it replaces the tabs entirely, because
          a search field squeezed in beside four room names is the "very cramped" bar this strip already had removed
          once. It writes the same `search` state the desktop bar and the header field do, so there is one filter and
          three ways to reach it. */}
      {/* THE PHONE'S ROOM HEADER. The team: on mobile the rooms are "hard to navigate, especially if in multiple
          rooms... research how other popular chats work and rebuild the mobile version." The sideways strip of one
          market's tabs is gone: it only ever reached the rooms of the place you were already in, and on a 375px screen
          half of those were off the end of it. Now it is the header every chat app converged on: back to your rooms, the
          room's name with where it is (tap it and every room you are in opens in a sheet, the ones with something new
          first), and search. Nothing here brings the app header back - that still only happens on the way out of the
          room. */}
      {/* Above the mover (relative z-10, opaque): the thread slides under it as the keyboard comes and goes. */}
      <div className="relative z-10 flex shrink-0 items-center gap-1 border-b border-gray-100 bg-white px-1 py-1 lg:hidden">
        <Link
          to="/rooms"
          aria-label={tr('All rooms')}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink transition-colors active:bg-cloud"
        >
          <Icon name="chevronLeft" className="h-5 w-5" />
        </Link>
        {/* The search field lives in the composer's slot now, so the room's name stays here. */}
        {(
          // ONE LINE: THE ROOM, THEN WHERE IT IS. The room's name leads; the place is a pill beside it that opens the
          // switcher, with the unread count of the other rooms on it. The whole row still opens the switcher too.
          <div className="flex min-w-0 flex-1 items-center gap-2 pl-0.5">
            <button
              type="button"
              onClick={() => setSwitcher(true)}
              className="flex min-w-0 shrink items-center gap-1.5 text-left"
            >
              <span key={`${community.id}-${active?.key}`} className="truncate text-[17px] font-bold leading-tight tracking-[-0.01em] text-ink animate-tab-in">
                {active ? tr(active.label) : ' '}
              </span>
              {active?.visibility === 'vip' && <VipChip />}
            </button>
            <button
              type="button"
              onClick={() => setSwitcher(true)}
              aria-haspopup="dialog"
              aria-expanded={switcher}
              aria-label={tr('Switch room')}
              className="relative flex min-w-0 shrink-0 items-center gap-1 rounded-full border border-gray-200 bg-white py-1 pl-2 pr-1.5 text-[13px] font-semibold text-ink transition-transform active:scale-95"
            >
              <span aria-hidden className="leading-none">{community.kind === 'network' ? '🌍' : flags}</span>
              <span className="max-w-[7.5rem] truncate">{community.kind === 'network' ? tr('Worldwide') : community.name}</span>
              <Icon name="chevronDown" className="h-3.5 w-3.5 shrink-0 text-smoke" />
              {otherUnread > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white ring-2 ring-white animate-pop-in" aria-label={tr('{n} rooms with new messages', { n: otherUnread })}>
                  {otherUnread}
                </span>
              )}
            </button>
          </div>
        )}
        <button
          type="button"
          // Keeps the composer focused until the search field takes over, so the keyboard stays up.
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => { if (stripSearch) closeStripSearch(); else if (Date.now() - stripClosedAt.current > 500) setStripSearch(true) }}
          aria-label={stripSearch ? 'Close search' : `Search ${active?.label || 'this room'}`}
          aria-expanded={stripSearch}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-smoke transition-colors active:bg-cloud"
        >
          <Icon name={stripSearch ? 'close' : 'magnifier'} className="h-5 w-5" />
        </button>
      </div>
      <RoomSwitcherSheet
        open={switcher}
        onClose={closeSwitcher}
        places={orderedPlaces}
        vipPlaces={vipPlaces}
        currentPlaceId={community.id}
        activeKey={active?.key}
      />

      {/* The hint bar doubles as the room's identity on mobile, where the page
          heading is scrolled away.

          THE BAR HAS TO BE TALL ENOUGH FOR THE CONTROL IN IT. It was `py-1` at
          11px, which is a strip about eighteen pixels high, and the search field
          was then squeezed into that - the "very, very cramped" report. The DM
          thread header gives its search real height and reads properly, so this
          matches it: enough room for a 36px field with air round it, and the
          hint text steps up to the same size. */}
      {/* DESKTOP ONLY. On a phone this bar was ~40px of permanent chrome saying the room's name - which the highlighted
          tab directly above it already says - with a search field in it. Search moved into the header's own search
          button, which points at whichever chat is open (see lib/chatSearch). */}
      {active && (
        <div className={cx(
          'hidden shrink-0 items-center gap-2.5 px-3 py-1.5 text-xs sm:px-4 sm:py-2 lg:flex',
          active.key === 'announcements' ? 'bg-brand-tint font-medium text-brand' : 'bg-cloud/60 text-smoke',
        )}>
          <RoomSearch value={search} onChange={setSearch} count={visible.length} total={messages.length} />
          {/* THE ROOM'S OWN CONTROLS, ON THE RIGHT. */}
          {!search && (firstUnread || farFromEnd) && (
            <span className="order-last ml-auto flex shrink-0 items-center gap-1.5">
              {firstUnread && (
                <button type="button" onClick={() => scrollToMessage(firstUnread.id)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1 text-[12px] font-bold text-white shadow-card transition-transform duration-200 animate-pop-in hoverable:hover:-translate-y-px">
                  <Icon name="chevronUp" className="h-3.5 w-3.5" />{unreadSince === 1 ? tr('1 new message') : tr('{n} new messages', { n: unreadSince })}
                </button>
              )}
              {farFromEnd && (
                <button type="button" onClick={jumpToEnd}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-[12px] font-bold text-ink transition-transform duration-200 animate-pop-in hoverable:hover:-translate-y-px">
                  <Icon name="chevronDown" className="h-3.5 w-3.5" />{tr('Latest')}
                </button>
              )}
            </span>
          )}
          {!search && (
            <span className="min-w-0 flex-1 truncate">
              <span className="font-semibold">{tr(active.label)}</span>
              {active.hint && <span className="hidden sm:inline"> · {active.hint}</span>}
            </span>
          )}
        </div>
      )}

      {/* THE THREAD NEVER SHOWS A BLANK ROOM.

          `settled` hides the scroller with `opacity-0` while lib/chatScroll
          pins it, which is right - the rows have to be LAID OUT for there to be
          a scroll height to pin to, so they cannot be unmounted - but it left
          a white rectangle where the conversation was, and then the whole
          thread appeared at once. What that reads as is a flash.

          A placeholder over the top covers the gap, so the sequence is
          skeleton -> conversation rather than skeleton -> nothing -> flash. It
          is bottom-aligned, because a chat fills upwards from the composer and
          a placeholder that starts at the top is a different screen. */}
      <NetworkChatThread
        actionsFor={actionsFor}
        byId={byId}
        canPost={canPost}
        composerRef={composerRef}
        editingId={editingId}
        farFromEnd={farFromEnd}
        firstUnread={firstUnread}
        introOf={introOf}
        introducing={introducing}
        isAdmin={isAdmin}
        jumpToEnd={jumpToEnd}
        loading={loading}
        members={members}
        messages={messages}
        mt={mt}
        nameFor={nameFor}
        nowTick={nowTick}
        onScroll={onScroll}
        quietMount={quietMount}
        reactionsByMessage={reactionsByMessage}
        relations={relations}
        removeMessage={removeMessage}
        saveMedia={saveMedia}
        scrollerRef={scrollerRef}
        search={search}
        seenBy={seenBy}
        setActionsFor={setActionsFor}
        setEditingId={setEditingId}
        setMessages={setMessages}
        setRelations={setRelations}
        setReplyTo={setReplyTo}
        setReporting={setReporting}
        setViewing={setViewing}
        settled={settled}
        toggleReaction={toggleReaction}
        tr={tr}
        user={user}
        visible={visible}
      />

      <NetworkChatComposerDock
        active={active}
        attach={attach}
        attachError={attachError}
        body={body}
        canPost={canPost}
        closeStripSearch={closeStripSearch}
        community={community}
        composerRef={composerRef}
        dockRef={dockRef}
        draftKey={draftKey}
        hideChrome={hideChrome}
        isAdmin={isAdmin}
        isMobile={isMobile}
        kbOpen={kbOpen}
        members={members}
        mention={mention}
        mentionNames={mentionNames}
        messages={messages}
        onComposerChange={onComposerChange}
        onComposerInput={onComposerInput}
        outboxScope={outboxScope}
        pickMention={pickMention}
        replyTo={replyTo}
        search={search}
        send={send}
        sending={sending}
        setAdminTool={setAdminTool}
        setMention={setMention}
        setReplyTo={setReplyTo}
        setSearch={setSearch}
        stripSearch={stripSearch}
        tr={tr}
        user={user}
        visible={visible}
      />
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
        {/* THE SCOPE LINE IS GONE. Every market page carried "Only Spain. Nothing posted here reaches another market."
            under its own title, which is a disclaimer where a room name should be: it repeats what the flag, the market
            name and the place switcher directly above it all already say, and it reads as a warning about something that
            has not happened. The team asked for it off. */}
      </div>

      <div
        ref={overlayRef}
      data-kb-self
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
          <NetworkChatRoomNav
            active={active}
            community={community}
            orderedPlaces={orderedPlaces}
            roomKey={roomKey}
            saveRoomOrder={saveRoomOrder}
            tr={tr}
            unread={unread}
            vipFirst={vipFirst}
            vipPlaces={vipPlaces}
          />

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
        // THE ROOM'S NAME, NOT A SLUG. The hash and the lowercasing were borrowed from Slack; nothing else in this
        // product writes a room that way, and the tab the admin just pressed says "General".
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
