import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'
import { confirm, notice, saved } from '../lib/confirm'
import { loadDraft, saveDraft, clearDraft, listDrafts, DRAFTS_EVENT } from '../lib/drafts'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { uploadDmImage, uploadDmVideo, signDmImages, isSignedDmPath } from '../lib/chatMedia'
import { loadRelationship } from '../lib/connections'
import { openConversation } from '../lib/dm'
import { Avatar, Badge, Spinner } from '../components/ui'
import Icon from '../components/Icon'
import { jumpThreshold, distanceFromBottom } from '../lib/scrollJump'
import PhotoLightbox from '../components/PhotoLightbox'
import { useProfileNames } from '../components/network/ChatExtras'
import { mediaType, saveFile, fileNameFromUrl } from '../lib/media'
import { useCachedPage, writePageCache } from '../lib/pageCache'
import { DM_CACHE_KEY, DM_PEOPLE_CACHE_KEY, fetchDmPeople, fetchInbox, isListableConversation } from '../lib/inbox'
import { pinToBottom, isPinning, stickToBottom } from '../lib/chatScroll'
import { otherParticipant, cx } from '../lib/utils'
import { useChatOverlayHeight, useIsMobile, useViewportPin, useNoFocusPan } from '../lib/useKeyboardInset'
import { setChatChromeHidden, readerMovedChrome } from '../lib/chatChrome'
import { useNoScrollChain, useOverlayTouchLock } from '../lib/noScrollChain'
import { RoomSearch } from '../components/ChatSearch'
import { enqueueMessage, queuedFor, subscribeOutbox, onOutboxSent } from '../lib/outbox'
import ReportMessage from '../components/ReportMessage'
import { useNowTick } from '../lib/messageActions'
import { playSend, playSendFail, playDmArrival, playReactionPop } from '../lib/appSounds'
import { stripMarkup } from '../lib/richText'
import { loadEntryRefs } from '../components/EntryFeedback'
import { GroupAvatar, NewGroupModal, GroupSettingsModal } from '../components/GroupPanels'
import {
  groupName, acceptInvite, declineInvite, leaveGroup,
  markGroupRead,
} from '../lib/groups'
import { useT } from '../lib/i18n'
import { useMessageTranslations } from '../lib/quickTranslate'
import { profilesApi } from '../api/profiles'
import { chatApi } from '../api/chat'
import MessagesComposer from './MessagesComposer'
import MessagesThread from './MessagesThread'
import MessagesInbox from './MessagesInbox'
import MessagesEmptyThread from './MessagesEmptyThread'


// PINNED CHATS. Three, per device, in localStorage - see the note on the
// `pinned` state for why it is not a column.
const MAX_PINNED_CONVERSATIONS = 3
const PINNED_KEY = 'dm-pinned'
// See lib/pageCache.

function loadPinnedConversations() {
  try {
    const v = JSON.parse(localStorage.getItem(PINNED_KEY))
    // Trimmed on read as well as on write. The cap could have changed between
    // releases, and a stored array of six would otherwise pin six for ever.
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, MAX_PINNED_CONVERSATIONS) : []
  } catch { return [] }
}

function savePinnedConversations(ids) {
  try { localStorage.setItem(PINNED_KEY, JSON.stringify(ids.slice(0, MAX_PINNED_CONVERSATIONS))) } catch { /* private mode */ }
}

// A short plain-text label for a DM quoted in a reply (`stripMarkup` removes formatting, keeps @names).
function dmPreview(m) {
  if (!m) return 'Message unavailable'
  if (m.body) return stripMarkup(m.body)
  if (m.image_url) return mediaType(m.image_url) === 'video' ? 'Video' : 'Photo'
  // A card-only message has an empty body, and a conversation list showing a
  // blank line for one is the bug that turns up the day after it ships.
  if (m.resource_id) return 'Shared a resource'
  if (m.submission_id) return 'Shared an entry'
  return 'Message'
}

// Direct messages: inbox + active thread, both realtime. One panel at a time on mobile, side by side on desktop.
// A 1:1 nobody has written in is not listed (`last_message_at` is null until the first message; migration 214),
// but opening it by URL still works. Groups are always listed. A thread this page just created is listable before
// its first message lands (`justCreated`). The rule lives in lib/inbox and is re-exported here.
export { isListableConversation }

/** Where an unsent message is kept: per conversation, or per person before the conversation exists. */
const dmDraftKey = (cid, toId) => (cid ? 'dm-' + cid : toId ? 'dm-to-' + toId : '')

export default function Messages() {
  const tr = useT()
  const { conversationId } = useParams()
  const { user, profile, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Back from a thread always lands in the inbox: a thread opened from anywhere else (push, bell, profile) puts the
  // inbox under itself once per mount. Navigation from within this page carries `fromInbox` and is left alone.
  const inboxBehind = useRef(false)
  useEffect(() => {
    if (!conversationId || inboxBehind.current) return
    inboxBehind.current = true
    if (location.state?.fromInbox) return
    navigate('/messages', { replace: true })
    navigate(`/messages/${conversationId}`, { state: { fromInbox: true } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  // SECOND AND LATER VISITS TO THE DM TAB DRAW THE INBOX, NOT FOUR GREY ROWS.
  // `loadConversations` still runs on every visit; the cache only decides what
  // is on screen while it does. See lib/pageCache.
  const cachedInbox = useCachedPage(DM_CACHE_KEY)
  // Strained on the way IN as well as on the way out - see the note on
  // `isListableConversation`: a cache written before migration 214 still holds
  // abandoned threads carrying a `now()` timestamp.
  const [conversations, setConversations] = useState(() => (cachedInbox ?? []).filter((c) => isListableConversation(c))) // enriched with profile/members + unread
  // Groups share this page with 1:1s: media, replies, reactions, typing and the mobile overlay all apply to both.
  const [invites, setInvites] = useState([])          // groups waiting on my answer
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [showGroupSettings, setShowGroupSettings] = useState(false)
  const [groupInvites, setGroupInvites] = useState([]) // pending invites for the OPEN group
  const [thread, setThread] = useState([])
  const [reactions, setReactions] = useState([]) // dm_reactions for the open thread
  const [entryRefs, setEntryRefs] = useState({}) // submission id -> the entry a feedback DM is about
  // The composer serialises to markdown on every keystroke, so `body` is still
  // exactly what send/drafts/previews have always read.
  const onComposerChange = (md) => {
    setBody(md)
    const k = dmDraftKey(conversationId, draftTo?.id)
    if (k) saveDraft(k, md)
    if (md.trim()) pingTyping()
  } // message id with emoji picker open
  // Searching THIS conversation. The inbox search above finds a person; this
  // finds a message, and they are different questions - "where is Jacob" and
  // "what did Jacob say about the Lisbon shoot" - so they are two controls.
  const [threadSearch, setThreadSearch] = useState('')
  const [threadSearchOpen, setThreadSearchOpen] = useState(false)
  // THE HEADER'S X CLOSES THE SEARCH. The team: with the keyboard up, "that X in the top right, when I press it, nothing
  // happens". On a phone the press blurs the search field first, an empty field closes itself on blur, and the click
  // that follows toggled it straight back open. The X now only ever closes, and a click within half a second of the
  // field closing itself is that same press, not a request to open it again.
  const searchClosedAt = useRef(0)
  const closeThreadSearch = useCallback(() => { searchClosedAt.current = Date.now(); setThreadSearchOpen(false); setThreadSearch('') }, [])
  useEffect(() => { setThreadSearchOpen(false); setThreadSearch('') }, [conversationId])

  // Sends are queued in lib/outbox (the same module the rooms use), so a DM written offline survives a reload.
  const outboxScope = `dm:${conversationId || 'none'}`
  const [queued, setQueued] = useState(() => queuedFor(outboxScope))
  useEffect(() => {
    setQueued(queuedFor(outboxScope))
    return subscribeOutbox(() => setQueued(queuedFor(outboxScope)))
  }, [outboxScope])

  // What the thread actually renders. Without a search that is every message,
  // plus anything still waiting to leave the device.
  const visibleThread = useMemo(() => {
    // The dedupe covers the beat where realtime has delivered the real row but
    // the outbox has not yet had the insert's reply back. Without it your own
    // message appears twice for a frame or two.
    const pending = queued
      .filter((i) => !thread.some((m) => m.id === i.id
        || (m.sender_id === user.id && (m.body || '') === (i.display.body || '') && !!m.image_url === !!i.display.image_url)))
      .map((i) => ({ ...i.display, pending: !i.failed, failed: i.failed, queuedId: i.id, tries: i.tries }))
    const q = threadSearch.trim().toLowerCase()
    if (!q) return [...thread, ...pending]
    return thread.filter((m) => (m.body || '').toLowerCase().includes(q))
  }, [thread, threadSearch, queued, user.id])
  // A queued DM landing puts the real row in the thread straight away, rather
  // than waiting for realtime to say the same thing a moment later. The id
  // check means arriving twice is arriving once.
  useEffect(() => onOutboxSent((item, row) => {
    if (item.scope !== outboxScope || !row) return
    setThread((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]))
  }), [outboxScope])

  // The fail sound now marks the outbox GIVING UP, which is the only moment
  // worth interrupting somebody for. A single failed request is a tunnel.
  const gaveUpRef = useRef(new Set())
  useEffect(() => {
    for (const item of queued) {
      if (item.failed && !gaveUpRef.current.has(item.id)) { gaveUpRef.current.add(item.id); playSendFail() }
      if (!item.failed) gaveUpRef.current.delete(item.id)
    }
  }, [queued])

  // TRANSLATE A MESSAGE: only for a reader on another language, original first.
  const mt = useMessageTranslations()
  const [actionsFor, setActionsFor] = useState(null) // message id with actions revealed (mobile tap)
  const [editingId, setEditingId] = useState(null)   // message being edited in place
  const [reporting, setReporting] = useState(null)   // message being reported, or null

  // WHICH ATTACHMENT IS OPEN FULL SCREEN. One layer for the whole thread,
  // opened from a message's own action bar - ChatMedia used to own a lightbox
  // each. See the note in that component.
  const [viewing, setViewing] = useState(null)

  // Saving goes through the SHARE SHEET on a phone, which is the only route to
  // the iOS camera roll. Same helper the rooms and the photo layer use.
  const saveMedia = useCallback((url) => {
    if (!url) return
    saveFile(url, fileNameFromUrl(url)).catch(() => {})
  }, [])
  // Slow clock so the Edit button retires itself. See lib/messageActions.
  const nowTick = useNowTick()
  const [replyTo, setReplyTo] = useState(null)     // message being replied to
  const [loadingList, setLoadingList] = useState(!cachedInbox)
  // `inboxLoaded` is set only by a completed live query; the discover pane waits for it, the rail uses the cache.
  const [inboxLoaded, setInboxLoaded] = useState(false)
  // Pinned conversations are a per-device preference in localStorage. At most three.
  const [pinned, setPinned] = useState(loadPinnedConversations)
  const [loadingThread, setLoadingThread] = useState(false)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [attachError, setAttachError] = useState('')
  const [activeRelation, setActiveRelation] = useState(null)
  // Inbox search + the people it searches over (every creator you could DM).
  const [search, setSearch] = useState('')
  // A CACHED PEOPLE LIST COUNTS AS LOADED: it is this session's own answer (written by the last visit or by the idle
  // warm-up in lib/warmPages), so the pane paints at once and the live read below only corrects it.
  const cachedPeople = useCachedPage(DM_PEOPLE_CACHE_KEY)
  const [people, setPeople] = useState(() => cachedPeople?.people ?? [])
  // "HAVE WE LOOKED YET" IS NOT THE SAME QUESTION AS "IS IT EMPTY", and the
  // pane below reads the wrong answer to the wrong question without this. See
  // the note on `discover`.
  const [peopleLoaded, setPeopleLoaded] = useState(!!cachedPeople)
  const [connectionIds, setConnectionIds] = useState(() => new Set(cachedPeople?.connected ?? []))
  const [starting, setStarting] = useState(null) // creator id being opened
  // A thread you open but have not written in does not exist yet: the conversation row is created on the first send
  // (`ensureConversation`). Until then it is a draft held in state. Cost: the first message to a new person cannot be
  // queued offline, because the outbox needs a conversation id.
  const [draftTo, setDraftTo] = useState(null)   // a profile row, or null
  // Guards a double-press: two sends racing would insert two conversations for
  // the same pair, and the pair has no unique constraint to stop it.
  const ensuringRef = useRef(null)
  // Conversations this page created (listable before their first message). A ref, so `loadConversations` keeps a
  // stable identity.
  const justCreatedRef = useRef(new Set())
  // path -> short-lived signed URL, for DM images in the private dm-media bucket.
  const [signedUrls, setSignedUrls] = useState(new Map())
  // Scroll bookkeeping so the thread only follows new messages when you're
  // already at the bottom (mirrors #general), with a jump-to-latest pill.
  const [atBottom, setAtBottom] = useState(true)
  // See the note in Chat.jsx: the pill's distance is not the auto-follow's.
  const [farUp, setFarUp] = useState(false)
  const [newBelow, setNewBelow] = useState(0)
  const bottomRef = useRef(null)
  const scrollerRef = useRef(null)
  const prevLenRef = useRef(0)
  const atBottomRef = useRef(true)
  const dmComposerRef = useRef(null)
  const composerRef = useRef(null)
  // WHICH MESSAGES IN THE OPEN THREAD ARE YOURS. The dm_reactions subscription
  // has to answer "is this about me?" from inside a realtime callback, where
  // `thread` is a stale closure and a setState updater is the wrong place for
  // a side effect.
  const myMessageIdsRef = useRef(new Set())
  // AND WHICH MESSAGES ARE IN IT AT ALL, for the same reason and for a worse
  // bug - see the reaction subscription below.
  const threadIdsRef = useRef(new Set())

  // Visual-viewport tracking: on mobile the thread is a fixed overlay pinned to the visible area, so the composer
  // sits on the keyboard (same approach as the rooms; see useVisualViewport).
  const overlayRef = useRef(null)
  // The composer and what floats over it: it rides with the keyboard while the thread scrolls (useChatOverlayHeight).
  const dockRef = useRef(null)
  const isMobile = useIsMobile()
  useViewportPin(overlayRef, isMobile)
  // No pan when the message box takes focus, so the header stays where it is (see useNoFocusPan).
  useNoFocusPan(overlayRef, isMobile)
  useOverlayTouchLock(overlayRef, isMobile)

  // The app header slides away while a DM is open, through lib/chatChrome. `setChrome` is called in the handler, not
  // an effect, so the header and overlay move in the same frame. The effect covers width changes and leaving the page.
  const [chromeHidden, setChromeHidden] = useState(false)
  const setChrome = useCallback((hidden) => {
    setChromeHidden(hidden)
    setChatChromeHidden(isMobile && hidden)
  }, [isMobile])
  useEffect(() => { setChatChromeHidden(isMobile && chromeHidden) }, [isMobile, chromeHidden])
  // ALWAYS RELEASED ON THE WAY OUT. A header hidden by a screen you have left
  // is a header nobody can get back.
  useEffect(() => () => setChatChromeHidden(false), [])
  const showChrome = useCallback(() => setChrome(false), [setChrome])
  const hideChrome = useCallback(() => { if (isMobile) setChrome(true) }, [isMobile, setChrome])

  const realActive = conversations.find((c) => c.id === conversationId)
  // The draft thread is shaped like a conversation (with no id, so it stays out of the inbox and the database).
  // Memoised so its identity is stable.
  const active = useMemo(
    () => realActive || (draftTo && !conversationId
      ? { id: null, kind: 'direct', draft: true, other: draftTo, participant_a: user.id, participant_b: draftTo.id }
      : undefined),
    [realActive, draftTo, conversationId, user.id],
  )
  // Is a thread on screen (a draft has no id, so `conversationId` alone is not enough).
  const threadOpen = !!active
  useNoScrollChain(scrollerRef, `${threadOpen}-${active?.id ?? ''}`)

  // A thread opens with the header already hidden (a short thread never scrolls); the inbox always shows it.
  // A layout effect with `instant`, so there is no slide on open.
  useLayoutEffect(() => {
    setChatChromeHidden(isMobile && threadOpen, { instant: true })
    setChromeHidden(isMobile && threadOpen)
  }, [isMobile, threadOpen])

  // Mobile overlay geometry: keyboard closed leaves room for the header and the tab bar; keyboard open takes the whole
  // visible viewport.
  const { kbOpen, height: overlayH } = useChatOverlayHeight({ enabled: isMobile, chromeHidden, overlayRef, dockRef, scrollerRef, tuck: 10 })
  const topGone = kbOpen || chromeHidden
  const mobileStyle = isMobile
    ? {
        top: topGone ? 0 : 'calc(4rem + env(safe-area-inset-top))',
        // One px height for both states, glided on keyboard changes (useChatOverlayHeight).
        height: `${overlayH}px`,
        // Clamp to >= 0: on iOS a downward pull at the top makes offsetTop go negative, which would ride the overlay up
        // above the header. `transform` is written frame by frame by useViewportPin, not here.
        paddingTop: topGone ? 'env(safe-area-inset-top)' : undefined,
        // The overlay snaps; only the header animates (on transform). Animating top/height relaid out the whole thread every
        // frame and left the last message under the keyboard.
      }
    : undefined

  // Lock the document while the mobile DM overlay is up so iOS can't rubber-band
  // the page (which dragged the header down / exposed content above it).
  // A layout effect so the lock is released in the same commit that leaves the chat: AppLayout restores the scroll of
  // the page you return to in its own layout effect, and a document still locked would clamp it to the top.
  useLayoutEffect(() => {
    if (!isMobile) return
    document.documentElement.classList.add('overlay-lock')
    return () => document.documentElement.classList.remove('overlay-lock')
  }, [isMobile])

  const isGroup = active?.kind === 'group'
  const activeMembers = useMemo(() => active?.members ?? [], [active])
  // Who a message is FROM, in a group. A 1:1 needs no such lookup - there are
  // only two people and one of them is you - which is why the thread never
  // carried sender profiles before.
  const memberById = useMemo(
    () => new Map(activeMembers.map((m) => [m.id, m])),
    [activeMembers],
  )
  const activeTitle = isGroup ? groupName(active, activeMembers, user.id) : (active?.other?.name ?? 'Creator')
  // @-chips in a DM mean the people actually in it. Mentioning somebody who
  // cannot read the thread is a mention that goes nowhere.
  const dmMentionNames = useMemo(
    () => (isGroup ? activeMembers : [active?.other].filter(Boolean))
      .map((m) => m?.name).filter((n) => n && n.length > 1)
      .sort((a, b) => b.length - a.length),
    [isGroup, activeMembers, active?.other],
  )
  // A group has no "other" and therefore no DM gate: the gate exists to stop a
  // stranger sending twelve messages to one person, and a room you were invited
  // into is not that.
  const otherId = active?.other?.id

  // DM gating: a non-connection may send only until the other person replies
  // (a reply auto-connects them). Connected / admins have no limit.
  const iSentCount = thread.filter((m) => m.sender_id === user.id).length
  const theyReplied = !!otherId && thread.some((m) => m.sender_id === otherId)
  const connected = activeRelation?.relation === 'connected'
  const dmLocked = !isAdmin && !!otherId && !connected && iSentCount >= 1 && !theyReplied

  // Load the connection status for the open conversation.
  useEffect(() => {
    if (!otherId) { setActiveRelation(null); return }
    let cancelled = false
    loadRelationship(user.id, otherId).then((r) => { if (!cancelled) setActiveRelation(r) })
    return () => { cancelled = true }
  }, [otherId, user.id, thread.length])

  // ---------- Inbox ----------
  const loadConversations = useCallback(async () => {
    const { conversations: list, invites: myInvites } = await fetchInbox(user.id, justCreatedRef.current)
    setInvites(myInvites)
    setConversations(list)
    setLoadingList(false)
    setInboxLoaded(true)
  }, [user.id])

  useEffect(() => { loadConversations() }, [loadConversations])

  // Remember the inbox for the next visit. See lib/pageCache.
  useEffect(() => {
    if (loadingList) return
    writePageCache(DM_CACHE_KEY, conversations)
  }, [loadingList, conversations])

  // Everyone you could message, for the inbox search box and the empty state.
  // Same visibility rules as the creator directory (active, non-test, not
  // pending deletion), ordered most-recently-active first so the suggestions
  // shown to a creator with no connections are people actually around.
  useEffect(() => {
    let cancelled = false
    async function loadPeople() {
      // `created_at` and `last_seen_at` ride along for the pane's suggestions: "new here" and "around today" are the
      // two reasons that make a stranger worth messaging. See lib/inbox.fetchDmPeople.
      const got = await fetchDmPeople(user.id)
      if (cancelled) return
      setPeople(got.people)
      setPeopleLoaded(true)
      setConnectionIds(new Set(got.connected))
      writePageCache(DM_PEOPLE_CACHE_KEY, got)
    }
    // On a desktop with no thread open the pane IS the page, so it is read at once. Elsewhere the list only feeds
    // the search box, and it waits until the inbox itself is drawn.
    const id = setTimeout(loadPeople, !isMobile && !conversationId ? 0 : 900)
    return () => { cancelled = true; clearTimeout(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])

  // Open a thread with somebody: navigate to an existing conversation, or open a draft. Creates nothing.
  async function startConversation(creatorId) {
    setStarting(creatorId)
    try {
      // The inbox is already loaded, so the common case costs no round trip.
      const existing = conversations.find(
        (c) => c.kind !== 'group' && (c.other?.id === creatorId
          || c.participant_a === creatorId || c.participant_b === creatorId),
      )
      if (existing) {
        setSearch('')
        setDraftTo(null)
        navigate(`/messages/${existing.id}`, { state: { fromInbox: true } })
        return
      }
      // Who they are, for the header and the @-chips. A draft thread has no
      // conversation row to join the profile through, so it is fetched once.
      const { data: who } = await profilesApi
        .profiles().select('id, name, photo_url, city, country').eq('id', creatorId).maybeSingle()
      if (!who) return
      setSearch('')
      setDraftTo(who)
      // The URL says who it is with, so a reload comes back to the same draft
      // rather than to the inbox. `/messages/:id` is for threads that exist.
      navigate(`/messages?to=${creatorId}`)
    } finally {
      setStarting(null)
    }
  }

  /**
   * The conversation id to write into, creating the row if this is a draft.
   *
   * THE ONLY PLACE A CONVERSATION IS CREATED. Everything that sends goes
   * through here first, so "a thread exists" and "somebody sent something" are
   * the same event rather than two events a change of mind can separate.
   */
  async function ensureConversation() {
    if (conversationId) return conversationId
    if (!draftTo) return null
    // A second press while the first is still in flight must not insert a
    // second row for the same pair.
    if (ensuringRef.current) return ensuringRef.current
    const other = draftTo
    const p = (async () => {
      const id = await openConversation(user.id, other.id)
      if (!id) return null
      // When a draft becomes a row, splice the row into `conversations` on the same render that clears the draft, and add
      // its id to `justCreated` for later refetches, so the thread never leaves the screen.
      justCreatedRef.current.add(id)
      setConversations((prev) => (prev.some((c) => c.id === id) ? prev : [
        {
          id,
          kind: 'direct',
          participant_a: user.id,
          participant_b: other.id,
          other,
          unread: 0,
          // Sorted by this, and the thread being written into belongs at the
          // top. The real value arrives with the refetch a moment later.
          last_message_at: new Date().toISOString(),
        },
        ...prev,
      ]))
      // All three of these land in one batch with the splice above, so there is
      // no frame on which the draft is gone and the row has not arrived.
      setDraftTo(null)
      // `replace`, so Back does not land on the draft URL of a thread that now
      // exists at a different address.
      navigate(`/messages/${id}`, { replace: true, state: { fromInbox: true } })
      // NOT AWAITED. The optimistic row above is already correct for everything
      // on screen; this only reconciles the fields the server owns, and making
      // the send wait for it is what put a round trip in the middle of pressing
      // Send in the first place.
      loadConversations()
      return id
    })()
    ensuringRef.current = p
    try { return await p } finally { ensuringRef.current = null }
  }

  // `/messages?to=<creator>` opens a thread with that person (used by profiles, Connections and Get help).
  // Consumed once (`deepLinkedRef`).
  const [searchParams] = useSearchParams()
  const toParam = searchParams.get('to')
  // It opens a draft, never a row, and waits for the inbox so it can find an existing thread first.
  const deepLinkedRef = useRef(false)
  useEffect(() => {
    if (!toParam || deepLinkedRef.current || conversationId || loadingList) return
    deepLinkedRef.current = true
    startConversation(toParam)
    // `startConversation` is redefined on every render and is not a dependency
    // worth chasing - the ref is what makes this run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toParam, conversationId, loadingList])

  // Restore the half-written draft when the conversation changes. Drafts are kept per person, and the send button
  // reads the same key.
  useEffect(() => {
    setBody(loadDraft(dmDraftKey(conversationId, draftTo?.id)))
  }, [conversationId, draftTo?.id])

  // ---------- Active thread ----------
  useEffect(() => {
    // Clear the previous thread's messages as soon as the thread changes, except when a draft has just become this thread.
    if (!justCreatedRef.current.has(conversationId)) {
      setThread([])
      setReactions([])
      setEntryRefs({})
    }
    if (!conversationId) return
    let cancelled = false
    async function loadThread() {
      setLoadingThread(true)
      const { data } = await chatApi
        .directMessages()
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
      if (cancelled) return
      // THE MESSAGES ARE ON SCREEN THE MOMENT THEY ARRIVE. The reactions, the entry cards and the read marks were three
      // round trips run one after another BEFORE the spinner stopped, so a thread waited for things it can draw without.
      // They run alongside now and fill in when they land.
      setThread(data ?? [])
      setLoadingThread(false)
      const ids = (data ?? []).map((m) => m.id)
      // Reactions (silently no-ops if the table isn't there yet) and the entries a feedback DM carries, together.
      const [reacts, refs] = await Promise.all([
        ids.length ? chatApi.dmReactions().select('*').in('message_id', ids).then(({ data: r }) => r ?? []) : Promise.resolve([]),
        loadEntryRefs((data ?? []).map((m) => m.submission_id)),
      ])
      if (!cancelled) { setReactions(reacts); setEntryRefs(refs) }
      // Mark everything they sent me as read. In a group there is no per-reader
      // flag on the message - one row, many readers - so the watermark on my
      // own membership row moves instead.
      await Promise.all([
        chatApi
          .directMessages()
          .update({ read: true })
          .eq('conversation_id', conversationId)
          .eq('recipient_id', user.id)
          .eq('read', false),
        markGroupRead(conversationId, user.id),
      ])
      // The badge on this thread is simply gone; reloading the whole inbox for it (six queries, every group's whole
      // history) was most of what a tap cost.
      if (!cancelled) setConversations((prev) => prev.map((c) => (c.id === conversationId && c.unread ? { ...c, unread: 0 } : c)))
    }
    loadThread()
    return () => { cancelled = true }
  }, [conversationId, user.id])

  // Group read receipts come from each member's `last_read_at`, loaded on open and kept live.
  const [groupReads, setGroupReads] = useState(new Map())
  useEffect(() => {
    if (!isGroup || !conversationId) { setGroupReads(new Map()); return undefined }
    let alive = true
    const pull = () => chatApi.conversationMembers()
      .select('profile_id, last_read_at')
      .eq('conversation_id', conversationId)
      .then(({ data }) => {
        if (alive) setGroupReads(new Map((data || []).map((r) => [r.profile_id, r.last_read_at])))
      })
    pull()
    const ch = supabase.channel(`grp-reads-${conversationId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new
          if (row?.profile_id) setGroupReads((prev) => new Map(prev).set(row.profile_id, row.last_read_at))
        })
      .subscribe()
    return () => { alive = false; supabase.removeChannel(ch) }
  }, [isGroup, conversationId])

  const seenBy = useCallback((msg) => {
    if (!isGroup || !msg) return []
    const t = new Date(msg.created_at).getTime()
    return activeMembers.filter((mem) => {
      if (mem.id === user.id || mem.id === msg.sender_id) return false
      const r = groupReads.get(mem.id)
      return !!r && new Date(r).getTime() >= t
    })
  }, [isGroup, activeMembers, groupReads, user.id])

  // The invites still waiting on other people for the group that is open, so
  // the settings panel can say "3 invites not answered yet" rather than
  // silently offering to invite somebody who already has one.
  useEffect(() => {
    if (!isGroup || !conversationId) { setGroupInvites([]); return undefined }
    let cancelled = false
    chatApi.conversationInvites()
      .select('id, invited_profile_id, status')
      .eq('conversation_id', conversationId).eq('status', 'pending')
      .then(({ data }) => { if (!cancelled) setGroupInvites(data || []) })
    return () => { cancelled = true }
  }, [isGroup, conversationId, showGroupSettings])

  useEffect(() => {
    myMessageIdsRef.current = new Set(thread.filter((m) => m.sender_id === user.id).map((m) => m.id))
    threadIdsRef.current = new Set(thread.map((m) => m.id))
  }, [thread, user.id])

  // ---------- Realtime: new DMs in any of my conversations ----------
  useEffect(() => {
    const sub = supabase
      .channel(`dms-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, async (payload) => {
        const msg = payload.new
        // Only react to messages I can see: mine, addressed to me, or in a conversation I am in (groups have no recipient).
        // Realtime already applies RLS; this decides which open thread a row belongs to.
        const mine = msg.sender_id === user.id || msg.recipient_id === user.id
        if (!mine && msg.conversation_id !== conversationId) return
        // A DM has its own two-note sound, for any of your conversations, never for your own message or a background tab.
        if (msg.sender_id !== user.id && !document.hidden) playDmArrival()
        if (msg.conversation_id === conversationId) {
          setThread((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
          // I'm looking at this thread - mark it read immediately.
          if (msg.recipient_id === user.id) {
            await chatApi.directMessages().update({ read: true }).eq('id', msg.id)
          } else if (msg.recipient_id == null && msg.sender_id !== user.id) {
            // A group message arriving in the thread I have open. Move the
            // watermark or `loadConversations` below will count it as unread
            // while it is on my screen.
            await markGroupRead(msg.conversation_id, user.id)
          }
        }
        loadConversations()
      })
      // Admin moderation: a deleted DM disappears for both participants instantly.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'direct_messages' }, (payload) => {
        setThread((prev) => prev.filter((m) => m.id !== payload.old.id))
      })
      // Reactions on messages in the open thread appear instantly for both people.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_reactions' }, (payload) => {
        // A pop, but only when somebody else reacted to something YOU wrote.
        // Read from a ref: a setState updater has to be pure and React may run
        // it twice, which would double the sound.
        if (myMessageIdsRef.current.has(payload.new.message_id)
          && payload.new.creator_id !== user.id && !document.hidden) playReactionPop()
        // Is this reaction about a message on screen: answered with a ref. Calling setState inside another updater crashed.
        if (threadIdsRef.current.has(payload.new.message_id)) {
          setReactions((prev) => (prev.some((r) => r.id === payload.new.id) ? prev : [...prev, payload.new]))
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'dm_reactions' }, (payload) => {
        setReactions((prev) => prev.filter((r) => r.id !== payload.old.id))
      })
      // The inbox list is live too: a deleted or left conversation is dropped (and the thread closed if it was open);
      // an insert or update refetches the list with its joins.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'conversations' }, (payload) => {
        const gone = payload.old?.id
        if (!gone) return
        setConversations((prev) => prev.filter((c) => c.id !== gone))
        if (gone === conversationId) navigate('/messages', { replace: true })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations' }, () => {
        loadConversations()
      })
      // Being removed from - or leaving - a group on another device. The row
      // carries both halves of its key, so this only fires the reload for the
      // membership that is actually mine.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'conversation_members' }, (payload) => {
        if (payload.old?.profile_id !== user.id) { loadConversations(); return }
        const gone = payload.old?.conversation_id
        setConversations((prev) => prev.filter((c) => c.id !== gone))
        if (gone === conversationId) navigate('/messages', { replace: true })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_members' }, () => {
        loadConversations()
      })
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [user.id, conversationId, loadConversations, navigate])

  // ---------- Typing indicator (realtime broadcast, no DB writes) ----------
  // In a 1:1 there is only one person who could be typing, so this was a
  // boolean. In a group it has to say WHO, or "someone is typing" in a room of
  // eight is noise.
  const [otherTyping, setOtherTyping] = useState(null) // null | { id, name }
  const typingChanRef = useRef(null)
  const typingSentRef = useRef(0)
  const typingTimerRef = useRef(null)
  useEffect(() => {
    setOtherTyping(null)
    if (!conversationId) return
    const ch = supabase.channel(`dm-typing-${conversationId}`, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (!payload || payload.id === user.id) return
      setOtherTyping(payload.typing ? { id: payload.id, name: payload.name } : null)
      clearTimeout(typingTimerRef.current)
      if (payload.typing) typingTimerRef.current = setTimeout(() => setOtherTyping(null), 4500)
    }).subscribe()
    typingChanRef.current = ch
    return () => {
      clearTimeout(typingTimerRef.current)
      supabase.removeChannel(ch)
      typingChanRef.current = null
      setOtherTyping(null)
    }
  }, [conversationId, user.id])

  const myName = profile?.name ?? 'Someone'
  const pingTyping = useCallback(() => {
    const now = Date.now()
    if (now - typingSentRef.current < 1500) return
    typingSentRef.current = now
    typingChanRef.current?.send({ type: 'broadcast', event: 'typing', payload: { id: user.id, name: myName, typing: true } })
  }, [user.id, myName])
  const stopTyping = useCallback(() => {
    typingSentRef.current = 0
    typingChanRef.current?.send({ type: 'broadcast', event: 'typing', payload: { id: user.id, name: myName, typing: false } })
  }, [user.id, myName])

  // ---------- Admin: long-press a message to delete it for everyone ----------
  async function deleteDm(m) {
    if (!isAdmin) return
    if (!await confirm('Delete this message for everyone?')) return
    setThread((prev) => prev.filter((x) => x.id !== m.id))
    if (!await saved(chatApi.directMessages().delete().eq('id', m.id))) setThread((prev) => [...prev, m].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)))
  }

  // Accept a pending connection request from the person I'm messaging, right in
  // the thread (smooths the gated-DM flow: accepting connects us and unlocks it).
  async function acceptConnection() {
    if (!activeRelation?.rowId) return
    const { error } = await profilesApi.connections().update({ status: 'accepted' }).eq('id', activeRelation.rowId)
    if (!error) setActiveRelation((r) => (r ? { ...r, relation: 'connected' } : r))
  }

  // ---------- Reactions ----------
  // Add / remove my reaction to a DM (same UX as #general).
  async function toggleReaction(messageId, emoji) {
    setActionsFor(null)
    const mine = reactions.find((r) => r.message_id === messageId && r.creator_id === user.id && r.emoji === emoji)
    if (mine) {
      setReactions((prev) => prev.filter((r) => r.id !== mine.id))
      if (!await saved(chatApi.dmReactions().delete().eq('id', mine.id))) setReactions((prev) => [...prev, mine])
    } else {
      const { data } = await chatApi
        .dmReactions()
        .insert({ message_id: messageId, creator_id: user.id, emoji })
        .select('*')
        .single()
      if (data) setReactions((prev) => (prev.some((r) => r.id === data.id) ? prev : [...prev, data]))
    }
  }

  // Two people in a DM, so a reactor is either me or the other participant. In
  // a group it is whoever the membership says it is.
  const reactorName = useCallback((id) => {
    if (id === user.id) return 'You'
    if (id === active?.other?.id) return active?.other?.name ?? 'Them'
    return memberById.get(id)?.name ?? 'Someone'
  }, [user.id, active?.other?.id, active?.other?.name, memberById])

  // Group reactions per message: { '❤️': { count, mine, ids: [...] } }
  function reactionSummary(messageId) {
    const grouped = {}
    for (const r of reactions.filter((x) => x.message_id === messageId)) {
      grouped[r.emoji] = grouped[r.emoji] || { count: 0, mine: false, ids: [] }
      grouped[r.emoji].count++
      grouped[r.emoji].ids.push(r.creator_id)
      if (r.creator_id === user.id) grouped[r.emoji].mine = true
    }
    return grouped
  }

  // Anybody reacting who is not in `people` - a group member whose profile has
  // not come back yet, or somebody who has left - is looked up by id so the
  // tooltip names them instead of saying "Someone".
  const dmFetchedNames = useProfileNames(
    useMemo(
      () => [...new Set(reactions.map((r) => r.creator_id))]
        .filter((id) => id && id !== user?.id && !people.some((p) => p.id === id)),
      [reactions, people, user?.id],
    ),
  )

  // WHO REACTED, for the chip's hover tooltip. `ids` on a summary are
  // creator_ids; the names come from the people already loaded for this thread.
  // Anybody not among them - a group member whose profile has not come back
  // yet - is "Someone", which still beats a naked number.
  function dmReactorNames(info) {
    return (info?.ids || []).map((id) => (
      id === user?.id
        ? 'You'
        : (people.find((p) => p.id === id)?.name || dmFetchedNames.get(id) || 'Someone')
    ))
  }

  // Flash-highlight and scroll to a quoted original message when its reply is tapped.
  const scrollToMessage = useCallback((id) => {
    const el = document.getElementById(`dm-${id}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-2', 'ring-brand', 'ring-offset-2', 'rounded-2xl')
    setTimeout(() => el.classList.remove('ring-2', 'ring-brand', 'ring-offset-2', 'rounded-2xl'), 1300)
  }, [])

  // ---------- Anyone: hold a conversation for what you can do with it --------
  const convTimer = useRef(null)
  const convLongPressed = useRef(false)
  // The conversation whose action sheet is open, or null.
  const [convSheet, setConvSheet] = useState(null)

  // Pin or unpin. Unpinning is always allowed; pinning a fourth is refused with
  // a sentence rather than by the button quietly doing nothing, which is the
  // failure mode of every silent cap.
  async function togglePin(e, c) {
    e.preventDefault()
    e.stopPropagation()
    const isPinned = pinned.includes(c.id)
    if (!isPinned && pinned.length >= MAX_PINNED_CONVERSATIONS) {
      await notice(`You can pin ${MAX_PINNED_CONVERSATIONS} chats. Please remove a current pin before adding a new one.`)
      return
    }
    // Newly pinned goes to the END of the pinned block, not the top: pinning a
    // second chat should not push the first one down.
    const next = isPinned ? pinned.filter((id) => id !== c.id) : [...pinned, c.id]
    setPinned(next)
    savePinnedConversations(next)
  }
  async function deleteConversation(c) {
    // Long-press means "leave" for a group (deleting for everyone is a named button in settings).
    // `leave_conversation` (migration 195) does the whole leave, and every write result is checked, because supabase-js
    // resolves on a refused write.
    const restore = () => {
      setConversations((prev) => (prev.some((x) => x.id === c.id)
        ? prev
        : [...prev, c].sort((a, b) => new Date(b.last_message_at ?? 0) - new Date(a.last_message_at ?? 0))))
    }
    if (c.kind === 'group') {
      const name = groupName(c, c.members, user.id)
      if (!await confirm(`Leave ${name}? The conversation carries on without you.`)) return
      setConversations((prev) => prev.filter((x) => x.id !== c.id))
      if (c.id === conversationId) navigate('/messages')
      const { error } = await leaveGroup(c.id)
      if (error) { restore(); notice(`That group could not be left: ${error}`); return }
      loadConversations()
      return
    }
    if (!await confirm(`Delete your conversation with ${c.other?.name ?? 'this creator'}? This deletes the entire conversation and removes the chat.`)) return
    setConversations((prev) => prev.filter((x) => x.id !== c.id))
    if (c.id === conversationId) navigate('/messages')
    const { error } = await chatApi.leaveConversation({ p_conversation: c.id })
    if (error) { restore(); notice(`That conversation could not be deleted: ${error.message}`) }
  }

  // ---------- Group invites ----------
  async function answerInvite(invite, yes) {
    setInvites((prev) => prev.filter((i) => i.id !== invite.id))
    const { error } = yes ? await acceptInvite(invite, user.id) : await declineInvite(invite)
    if (error) { notice(error); loadConversations(); return }
    await loadConversations()
    if (yes) navigate(`/messages/${invite.conversation_id}`, { state: { fromInbox: true } })
  }
  // Long-press: one timer (touch fires touchstart and a synthetic mousedown), and `convLongPressed` resets at the start
  // of every press. Holding a row opens a small menu beside it (Pin, Delete) and highlights the row in orange.
  const openConvMenu = (c, el) => {
    const r = el?.getBoundingClientRect?.()
    setConvSheet({ ...c, _anchor: r ? { top: r.top, bottom: r.bottom, left: r.left, width: r.width } : null })
  }
  const startConvPress = (c, el) => {
    clearTimeout(convTimer.current)
    convLongPressed.current = false
    convTimer.current = setTimeout(() => { convLongPressed.current = true; openConvMenu(c, el) }, 550)
  }
  const cancelConvPress = () => clearTimeout(convTimer.current)

  // Reset scroll bookkeeping when the open conversation changes (we always land
  // at the newest message in a freshly opened thread).
  useEffect(() => {
    prevLenRef.current = 0
    setAtBottom(true)
    setNewBelow(0)
    setReplyTo(null)
    setActionsFor(null)
  }, [conversationId])

  // Jump the thread to the newest message. Setting scrollTop directly is more
  // reliable than scrollIntoView on a sentinel inside this flex/overflow column.
  const scrollToBottom = useCallback((behavior = 'auto') => {
    const el = scrollerRef.current
    // The keyboard glide is scrolling the thread itself (lib/useKeyboardInset) and lands it at the bottom.
    if (!el || el.dataset.glide === '1') return
    if (behavior === 'smooth') el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    else el.scrollTop = el.scrollHeight
  }, [])

  useEffect(() => { atBottomRef.current = atBottom }, [atBottom])

  // The thread is hidden (opacity only) until it is pinned to the bottom, so it never visibly jumps into place.
  const [settled, setSettled] = useState(false)

  // Pin to the newest message until the thread stops growing: `pinToBottom` watches the scroll height and stops two
  // frames after it last changed (same helper as the rooms). DM attachments store their size (migration 163).
  useLayoutEffect(() => {
    if (loadingThread) return undefined
    // A draft thread has nothing to settle: mark it settled at once or the skeleton never lifts.
    if (!conversationId) { setSettled(true); return undefined }
    const el = scrollerRef.current
    if (!el) return undefined
    setSettled(false)
    // A new conversation starts at the bottom: reset `atBottomRef` on every thread change.
    atBottomRef.current = true
    setAtBottom(true)
    el.scrollTop = el.scrollHeight
    return pinToBottom(
      () => scrollerRef.current,
      () => atBottomRef.current,
      () => setSettled(true),
    )
  }, [loadingThread, conversationId])

  // AND STAY THERE for as long as the thread is open - a DM grows late too
  // (avatars, photos, link previews, an attachment that decodes minutes after
  // it arrives). See stickToBottom.
  useEffect(() => {
    if (loadingThread || !conversationId) return undefined
    return stickToBottom(() => scrollerRef.current, () => atBottomRef.current)
  }, [loadingThread, conversationId])


  // Smart auto-scroll + "jump to latest" bookkeeping (same as #general): only
  // follow new messages when the reader is already at the bottom, or the new
  // message is their own. If they've scrolled up to read history, leave them put
  // and count arrivals for the jump-to-latest pill instead.
  useEffect(() => {
    const last = thread[thread.length - 1]
    const grew = thread.length > prevLenRef.current
    const firstPaint = prevLenRef.current === 0
    const mineJustSent = grew && last && last.sender_id === user.id
    if (firstPaint || atBottom || mineJustSent) {
      scrollToBottom(firstPaint ? 'auto' : 'smooth')
      setNewBelow(0)
      setFarUp(false)
    } else if (grew) {
      setNewBelow((n) => n + (thread.length - prevLenRef.current))
      // See Chat.jsx: arrivals below a scrolled-up reader fire no scroll event.
      setFarUp(distanceFromBottom(scrollerRef.current) > jumpThreshold(scrollerRef.current, 5))
    }
    prevLenRef.current = thread.length
  }, [thread, atBottom, user.id, scrollToBottom])

  // Keep the latest message visible as the keyboard opens or closes: one instant correction, then `stickToBottom`
  // owns every frame after it. Not smooth: a smooth scroll aims at where the bottom was.
  useEffect(() => {
    if (atBottomRef.current) scrollToBottom('auto')
  }, [kbOpen, overlayH, scrollToBottom])

  // Track whether the reader is pinned to the bottom of the thread.
  const onScrollMessages = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    // WHILE A PIN IS IN FLIGHT, THIS EVENT IS NOT THE READER. Identical fault to the rooms - see lib/chatScroll's 3 Sep
    // note. Here it was worse than a stranded scroll: `setAtBottom(false)` and `setFarUp` also raised the "jump to
    // latest" pill over a thread the reader had not touched.
    if (isPinning(el)) return
    const gap = distanceFromBottom(el)
    const near = gap < 90
    atBottomRef.current = near
    setAtBottom(near)
    setFarUp(gap > jumpThreshold(el, 5))
    if (near) setNewBelow(0)
    // REACHING THE TOP OF THE THREAD IS WHERE YOU HAVE RUN OUT OF MESSAGES AND
    // ARE LOOKING FOR SOMETHING ELSE, so the chrome comes back there and goes away everywhere else. Same rule as the
    // rooms. Only for a scroll the reader made - see lib/chatChrome (the translate shake). Same hysteresis as the rooms:
    // back only at the very top moving up, away only after a real scroll down.
    const top = el.scrollTop
    const dy = top - lastTopRef.current
    lastTopRef.current = top
    if (!readerMovedChrome()) return
    if (top <= 2 && dy <= 0) showChrome()
    else if (top > 40 && dy > 2) hideChrome()
  }, [showChrome, hideChrome])
  const lastTopRef = useRef(0)

  const jumpToLatest = useCallback(() => {
    setAtBottom(true)
    atBottomRef.current = true
    setFarUp(false)
    setNewBelow(0)
    scrollToBottom('smooth')
  }, [scrollToBottom])

  // Mobile composer gestures (same as the rooms): swallow drags on the composer chrome so the page cannot rubber-band
  // under the overlay; a downward swipe closes the keyboard; a scrollable textarea keeps its own scroll.
  useEffect(() => {
    const el = composerRef.current
    if (!el || !isMobile) return
    let startY = null
    let letScroll = false
    const onStart = (e) => {
      const ta = e.target.closest?.('textarea')
      letScroll = !!ta && ta.scrollHeight > ta.clientHeight + 1
      startY = e.touches[0]?.clientY ?? null
    }
    const onMove = (e) => {
      if (letScroll || startY == null) return
      const dy = (e.touches[0]?.clientY ?? startY) - startY
      if (dy > 20) { document.activeElement?.blur?.(); startY = null }
      if (e.cancelable) e.preventDefault()
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
    }
  }, [isMobile, conversationId])

  // Sign any private DM-image paths in the thread so they can render. Legacy
  // messages hold a full public URL and are skipped by signDmImages.
  useEffect(() => {
    const paths = thread.map((m) => m.image_url).filter(isSignedDmPath)
    if (!paths.length) return
    const missing = paths.filter((p) => !signedUrls.has(p))
    if (!missing.length) return
    let cancelled = false
    signDmImages(missing).then((map) => {
      if (cancelled || map.size === 0) return
      setSignedUrls((prev) => new Map([...prev, ...map]))
    })
    return () => { cancelled = true }
  }, [thread, signedUrls])

  // Queue a DM row with everything the send needs. `cid` is passed in, because state does not update inside the async
  // function that just created the conversation.
  function queueDm(fields, cid = conversationId) {
    const row = {
      conversation_id: cid,
      sender_id: user.id,
      // A GROUP MESSAGE IS ADDRESSED TO THE ROOM. `recipient_id` stays null,
      // and the RLS policy insists on it: a message in a group that named a
      // recipient would land in somebody's 1:1 unread count.
      recipient_id: isGroup ? null : otherParticipant(active, user.id),
      body: '',
      ...fields,
    }
    enqueueMessage({
      // The scope follows the row, for the same reason: on the first send of a
      // new thread `outboxScope` is still `dm:none`.
      scope: `dm:${cid || 'none'}`,
      table: 'direct_messages',
      row,
      select: '*',
      display: { ...row, created_at: new Date().toISOString(), read: false },
    })
  }

  async function send(e) {
    e.preventDefault()
    if (!body.trim() || !active || dmLocked) return
    setAtBottom(true)
    // The whoosh answers the press, not the server. With a queue behind it
    // there may be no server for an hour.
    playSend()
    const replyId = replyTo?.id ?? null
    const text = body.trim()
    // THE CONVERSATION IS CREATED HERE, ON THE FIRST MESSAGE, AND NOWHERE ELSE.
    // For a thread that already exists this resolves on the next microtask and
    // costs nothing. See `ensureConversation`.
    const sentTo = draftTo?.id
    const cid = await ensureConversation()
    if (!cid) { playSendFail(); return }
    queueDm({ body: text, ...(replyId ? { reply_to: replyId } : {}) }, cid)
    setBody(''); dmComposerRef.current?.clear(); clearDraft('dm-' + cid); if (sentTo) clearDraft(dmDraftKey(null, sentTo)); setReplyTo(null); stopTyping()
  }

  // Attach a photo or video to the DM (uploads, then sends with any typed
  // caption). Both land in the private dm-media bucket; the storage PATH is
  // stored in image_url and rendered back through a signed URL (video paths end
  // in .mp4 etc, so the renderer picks the right player from the extension).
  async function sendAttachment(file) {
    if (!file || !active || dmLocked) return
    const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name)
    setAttachError('')
    setAtBottom(true)
    setSending(true)
    try {
      // The conversation has to exist before the upload, not merely before the
      // message: the storage path is namespaced by conversation id.
      const cid = await ensureConversation()
      if (!cid) throw new Error('Could not open that conversation.')
      // Store the private storage PATH (not a public URL); it's signed on render.
      const { url: path, w, h } = isVideo
        ? await uploadDmVideo(file, cid)
        : await uploadDmImage(file, cid)
      const replyId = replyTo?.id ?? null
      // Queued only once the file is in storage (a File cannot be kept in localStorage). `media_w`/`media_h` let the
      // thread reserve the picture's box before it decodes.
      queueDm({
        body: body.trim(),
        image_url: path,
        ...(w && h ? { media_w: w, media_h: h } : null),
        ...(replyId ? { reply_to: replyId } : {}),
      }, cid)
      playSend()
      setBody(''); dmComposerRef.current?.clear(); clearDraft('dm-' + cid); setReplyTo(null)
    } catch (err) {
      playSendFail()
      setAttachError(err.message)
    }
    setSending(false)
  }

  // ---------- Inbox search + suggestions ----------
  const q = search.trim().toLowerCase()
  // Existing threads that match what you typed.
  const matching = q
    ? conversations.filter((c) => (c.kind === 'group'
        ? groupName(c, c.members, user.id).toLowerCase().includes(q)
          // A group is also findable by who is in it, which is how you find the
          // one whose name you never bothered to set.
          || (c.members || []).some((m) => (m.name ?? '').toLowerCase().includes(q))
        : (c.other?.name ?? '').toLowerCase().includes(q)))
    : conversations

  // Order: unsent drafts first (from lib/drafts, kept live by `DRAFTS_EVENT`; the open chat stays in place), then pinned
  // threads in pin order, then the rest by most recent (a stable sort). A chat shown as a draft is not repeated below.
  const [draftList, setDraftList] = useState(() => listDrafts('dm-'))
  useEffect(() => {
    const read = () => setDraftList(listDrafts('dm-'))
    const onStorage = (e) => { if (!e.key || e.key.startsWith('tryp_draft')) read() }
    window.addEventListener(DRAFTS_EVENT, read)
    window.addEventListener('storage', onStorage)
    return () => { window.removeEventListener(DRAFTS_EVENT, read); window.removeEventListener('storage', onStorage) }
  }, [])
  // Leaving a chat is when its draft becomes one: read the list again whenever the open chat changes.
  useEffect(() => { setDraftList(listDrafts('dm-')) }, [conversationId, draftTo?.id, threadOpen])
  const openDraftKey = threadOpen ? dmDraftKey(conversationId, draftTo?.id) : ''
  const drafts = useMemo(() => {
    if (q) return []
    const byId = new Map(conversations.map((c) => [c.id, c]))
    const byPerson = new Map(people.map((p) => [p.id, p]))
    for (const c of conversations) if (c.other?.id && !byPerson.has(c.other.id)) byPerson.set(c.other.id, c.other)
    const out = []
    for (const d of draftList) {
      if (d.key === openDraftKey) continue
      const preview = stripMarkup(d.text).replace(/\s+/g, ' ').trim()
      if (!preview) continue
      if (d.key.startsWith('dm-to-')) {
        const person = byPerson.get(d.key.slice(6))
        if (person) out.push({ key: d.key, preview, at: d.at, person, to: `/messages?to=${person.id}` })
      } else {
        const c = byId.get(d.key.slice(3))
        if (c) out.push({ key: d.key, preview, at: d.at, conversation: c, to: `/messages/${c.id}` })
      }
    }
    return out
  }, [q, draftList, openDraftKey, conversations, people])
  const draftConvIds = useMemo(() => new Set(drafts.map((d) => d.conversation?.id).filter(Boolean)), [drafts])
  const discardDraft = (d) => { clearDraft(d.key); setDraftList(listDrafts('dm-')) }
  const shownConversations = useMemo(() => {
    const rest = draftConvIds.size ? matching.filter((c) => !draftConvIds.has(c.id)) : matching
    if (!pinned.length) return rest
    const rank = new Map(pinned.map((id, i) => [id, i]))
    return [...rest].sort((a, b) => {
      const ra = rank.has(a.id) ? rank.get(a.id) : Infinity
      const rb = rank.has(b.id) ? rank.get(b.id) : Infinity
      return ra - rb
    })
    // `matching` is rebuilt every render by design (it is a filter over state),
    // so depending on it here is depending on the thing that changes - which is
    // correct: the sort has to re-run when the inbox or the search does.
  }, [matching, pinned, draftConvIds])
  // Creators you match but haven't messaged yet: "start a new chat with…".
  const talkingTo = new Set(conversations.map((c) => c.other?.id).filter(Boolean))
  const searchMatches = q
    ? people.filter((p) => !talkingTo.has(p.id) && (p.name ?? '').toLowerCase().includes(q)).slice(0, 12)
    : []
  // Nobody in the inbox yet: nudge them towards their own connections, or, if
  // they haven't connected with anyone, towards creators who are active here.
  const myConnections = people.filter((p) => connectionIds.has(p.id))

  // The empty pane suggests people you have not met (the rail shows your connections), by most recently seen.
  // Six faces, strangers first, topped up with people you know to a floor of three; every card says which.
  // Until `peopleLoaded` it shows only its heading, never a guess.
  const NEW_HERE_DAYS = 21
  const DISCOVER_TARGET = 6
  const newHereCutoff = nowTick - NEW_HERE_DAYS * 86400000
  const discover = useMemo(() => {
    // A stranger needs both facts: not a connection (`people`) and not somebody you have messaged (`talkingTo`, from the
    // inbox query). Wait for both. A cached inbox is used only when the people list is cached from the same session.
    if (!peopleLoaded || !(inboxLoaded || (cachedPeople && cachedInbox))) return { loading: true, mode: 'new', people: [] }
    const eligible = people.filter((p) => !p.is_admin)
    const isStranger = (p) => !connectionIds.has(p.id) && !talkingTo.has(p.id)
    const strangers = eligible.filter(isStranger)
    // Ordered by `last_seen_at` already (see the query), so the top of the
    // top-up is whoever has been around most recently - which is the only thing
    // that makes "say hello again" a good suggestion rather than a random one.
    const known = eligible.filter((p) => !isStranger(p))
    const list = [...strangers, ...known].slice(0, DISCOVER_TARGET)
    return {
      loading: false,
      // The heading follows the LEAD of the list, not its whole contents: if
      // there is anybody new in it, "connect with someone new" is true of the
      // first card and the badges say which of the rest are which.
      mode: strangers.length ? 'new' : 'known',
      strangerIds: new Set(strangers.map((p) => p.id)),
      people: list,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, peopleLoaded, inboxLoaded, connectionIds, conversations])
  const discoverPeople = discover.people

  // One row in the inbox for someone you haven't messaged yet.
  const personRow = (p, hint) => (
    <button
      key={p.id}
      type="button"
      onClick={() => startConversation(p.id)}
      disabled={starting === p.id}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-cloud disabled:opacity-60"
    >
      <Avatar src={p.photo_url} name={p.name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold">{p.name}</p>
          {p.is_admin && <Badge tone="light" className="!px-2 !py-0">{tr("Tryp.com")}</Badge>}
        </div>
        <p className="truncate text-xs text-smoke">{hint ?? p.bio ?? [p.city, p.country].filter(Boolean).join(', ')}</p>
      </div>
      {starting === p.id
        ? <Spinner />
        : <Icon name="envelope" className="h-4 w-4 shrink-0 text-smoke" />}
    </button>
  )

  return (
    <div
      ref={overlayRef}
      data-kb-self
      style={mobileStyle}
      className={cx(
        // Mobile/tablet: a fixed overlay pinned to the visual viewport (geometry
        // in mobileStyle) so the document never scrolls and the composer hugs
        // the keyboard. Desktop keeps the normal centered card.
        'fixed inset-x-0 mx-auto flex w-full max-w-6xl sm:px-8',
        // While typing the overlay goes full-screen ABOVE the header so it can
        // cover it; otherwise it sits below (z-20) so the header stays tappable.
        kbOpen ? 'z-50' : 'z-20',
        'lg:static lg:inset-auto lg:bottom-auto lg:z-auto lg:h-[calc(100vh-4rem)] lg:translate-y-0 lg:py-6'
      )}
    >
      {/* The panel fades in (opacity only: a transform here would break the fixed keyboard geometry inside it). */}
      <div className="flex min-h-0 flex-1 animate-page-in overflow-hidden bg-white sm:rounded-card sm:border sm:border-gray-100 sm:shadow-card">
        {/* ---------- Conversation list ---------- */}
        <MessagesInbox
          answerInvite={answerInvite}
          cancelConvPress={cancelConvPress}
          convLongPressed={convLongPressed}
          convSheet={convSheet}
          conversationId={conversationId}
          conversations={conversations}
          discover={discover}
          discoverPeople={discoverPeople}
          discardDraft={discardDraft}
          drafts={drafts}
          invites={invites}
          loadingList={loadingList}
          myConnections={myConnections}
          navigate={navigate}
          openConvMenu={openConvMenu}
          personRow={personRow}
          pinned={pinned}
          q={q}
          search={search}
          searchMatches={searchMatches}
          setSearch={setSearch}
          setShowNewGroup={setShowNewGroup}
          shownConversations={shownConversations}
          startConvPress={startConvPress}
          threadOpen={threadOpen}
          togglePin={togglePin}
          tr={tr}
          user={user}
        />

        {/* ---------- Thread ---------- */}
        <section className={cx('min-w-0 flex-1 flex-col sm:flex', threadOpen ? 'flex' : 'hidden')}>
          {!threadOpen ? (
            // The empty pane: people you could message, online first, in a two-column grid inside one card.
            // Reuses `discover`, so there is one definition of who to suggest.
            /*
             * THE SUGGESTIONS ARE ALREADY ON THE LEFT.
             *
             * They are right: the same list of people was rendered twice, side by side, on one screen - a grid of names
             * in the middle of the pane and the identical names in the rail next to it. The empty pane's job is to say
             * the pane is empty and point at where the answer is, and the answer is two inches to the left.
             *
             * What is left is one line and a mark that moves: the envelope
             * drifts and its ring breathes, so the pane reads as waiting rather
             * than as unfinished. CSS keyframes, not a runtime.
             */
            /*
             * AND NOW IT OFFERS PEOPLE AGAIN - DIFFERENT PEOPLE. "Open a conversation" is an instruction to do the thing
             * the pane is for, printed on the pane, with no way to do it from there - so the largest rectangle in the
             * product was a label. The envelope above it was decoration on an empty screen. What is here now is
             * `discoverPeople`: creators you are NOT connected to and have NOT messaged, which is a genuinely different
             * list from the rail's connections, so the screen no longer says the same thing twice. A press starts the
             * thread.
             */
            <MessagesEmptyThread
              discover={discover}
              discoverPeople={discoverPeople}
              newHereCutoff={newHereCutoff}
              startConversation={startConversation}
              starting={starting}
              tr={tr}
            />
          ) : (
            <>
              {/* Thread header: a press anywhere on it brings the app header back. Buttons inside still work. */}
              <div
                onPointerDown={showChrome}
                // Above the mover (relative z-10, opaque): the thread slides under it as the keyboard comes and goes.
                className="relative z-10 flex items-center gap-3 border-b border-gray-100 bg-white px-5 py-3"
              >
                <button onClick={() => { showChrome(); navigate('/messages') }} className="rounded-full p-2 text-smoke hover:bg-cloud sm:hidden" aria-label={tr("Back to inbox")}>
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                </button>
                {isGroup ? (
                  // The whole header is the way into the group's settings.
                  // Renaming a group is something you do BECAUSE you are
                  // looking at its name, so the name is the button.
                  <button
                    type="button"
                    onClick={() => setShowGroupSettings(true)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <GroupAvatar conversation={active} members={activeMembers} size="sm" />
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate text-sm font-semibold hover:text-brand">
                        {activeTitle}
                        <Icon name="pencil" className="h-3 w-3 shrink-0 text-gray-300" />
                      </p>
                      <p className="truncate text-xs text-smoke">
                        {activeMembers.length} {activeMembers.length === 1 ? 'member' : 'members'}
                        {activeMembers.length > 0 && ' · '}
                        {activeMembers.filter((m) => m.id !== user.id).map((m) => m.name?.split(' ')[0]).join(', ')}
                      </p>
                    </div>
                  </button>
                ) : active?.other && (
                  <Link to={`/profile/${active.other.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar src={active.other.photo_url} name={active.other.name} size="sm" />
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-sm font-semibold hover:text-brand">
                        {active.other.name}
                        {active.other.is_admin && <Badge tone="light" className="!px-2 !py-0">{tr("Tryp.com Team")}</Badge>}
                      </p>
                      <p className="truncate text-xs text-smoke">{active.other.bio}</p>
                    </div>
                  </Link>
                )}
                {isMobile ? (
                  // ON A PHONE THE SEARCH OPENS WHERE THE MESSAGE BOX IS: see ComposerSearch.
                  <button
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => { if (threadSearchOpen) closeThreadSearch(); else if (Date.now() - searchClosedAt.current > 500) setThreadSearchOpen(true) }}
                    aria-label={threadSearchOpen ? tr('Close search') : tr('Search this conversation')}
                    aria-expanded={threadSearchOpen}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-smoke transition-transform duration-200 active:scale-90"
                  >
                    <Icon name={threadSearchOpen ? 'close' : 'magnifier'} className="h-[18px] w-[18px]" />
                  </button>
                ) : (
                  <RoomSearch
                    value={threadSearch}
                    onChange={setThreadSearch}
                    count={visibleThread.length}
                    total={thread.length}
                    label={tr("Search this conversation")}
                  />
                )}
              </div>

              {/* Inline connection request: accept without leaving the thread. */}
              {activeRelation?.relation === 'pending_received' && (
                <div className="mx-5 mt-4 flex items-center gap-3 rounded-card border border-gray-100 bg-white px-4 py-3">
                  <Icon name="users" className="h-5 w-5 shrink-0 text-brand" />
                  <p className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold">{active?.other?.name?.split(' ')[0]}</span> {tr("wants to connect with you.")}
                  </p>
                  <button onClick={acceptConnection} className="btn-primary shrink-0 !py-1.5 text-xs">{tr("Accept")}</button>
                </div>
              )}

              {/* Messages. A placeholder covers the thread while lib/chatScroll pins it (rows stay mounted so they can be measured). */}
              <MessagesThread
                actionsFor={actionsFor}
                active={active}
                activeMembers={activeMembers}
                bottomRef={bottomRef}
                deleteDm={deleteDm}
                dmComposerRef={dmComposerRef}
                dmPreview={dmPreview}
                dmReactorNames={dmReactorNames}
                editingId={editingId}
                entryRefs={entryRefs}
                isAdmin={isAdmin}
                isGroup={isGroup}
                isMobile={isMobile}
                kbOpen={kbOpen}
                loadingThread={loadingThread}
                memberById={memberById}
                mt={mt}
                nowTick={nowTick}
                onScrollMessages={onScrollMessages}
                reactionSummary={reactionSummary}
                reactorName={reactorName}
                saveMedia={saveMedia}
                scrollToMessage={scrollToMessage}
                scrollerRef={scrollerRef}
                seenBy={seenBy}
                setActionsFor={setActionsFor}
                setEditingId={setEditingId}
                setReplyTo={setReplyTo}
                setReporting={setReporting}
                setThread={setThread}
                setViewing={setViewing}
                settled={settled}
                signedUrls={signedUrls}
                thread={thread}
                threadSearch={threadSearch}
                toggleReaction={toggleReaction}
                tr={tr}
                user={user}
                visibleThread={visibleThread}
              />

              <MessagesComposer
                active={active}
                activeTitle={activeTitle}
                attachError={attachError}
                body={body}
                closeThreadSearch={closeThreadSearch}
                composerRef={composerRef}
                connected={connected}
                conversationId={conversationId}
                dmComposerRef={dmComposerRef}
                dmDraftKey={dmDraftKey}
                dmLocked={dmLocked}
                dmMentionNames={dmMentionNames}
                dmPreview={dmPreview}
                dockRef={dockRef}
                draftTo={draftTo}
                farUp={farUp}
                hideChrome={hideChrome}
                iSentCount={iSentCount}
                isAdmin={isAdmin}
                isGroup={isGroup}
                isMobile={isMobile}
                jumpToLatest={jumpToLatest}
                kbOpen={kbOpen}
                newBelow={newBelow}
                onComposerChange={onComposerChange}
                otherTyping={otherTyping}
                outboxScope={outboxScope}
                reactorName={reactorName}
                replyTo={replyTo}
                send={send}
                sendAttachment={sendAttachment}
                sending={sending}
                setReplyTo={setReplyTo}
                setThreadSearch={setThreadSearch}
                stopTyping={stopTyping}
                theyReplied={theyReplied}
                thread={thread}
                threadSearch={threadSearch}
                threadSearchOpen={threadSearchOpen}
                tr={tr}
                user={user}
                visibleThread={visibleThread}
              />
            </>
          )}
        </section>
      </div>

      <NewGroupModal
        open={showNewGroup}
        onClose={() => setShowNewGroup(false)}
        people={people}
        connectionIds={connectionIds}
        myId={user.id}
        onCreated={async (id) => {
          setShowNewGroup(false)
          await loadConversations()
          navigate(`/messages/${id}`, { state: { fromInbox: true } })
        }}
      />

      <ReportMessage
        open={!!reporting}
        kind="dm"
        messageId={reporting?.id}
        authorName={reporting ? reactorName(reporting.sender_id) : ''}
        authorPhoto={reporting
          ? (reporting.sender_id === active?.other?.id ? active?.other?.photo_url : memberById.get(reporting.sender_id)?.photo_url)
          : null}
        sentAt={reporting?.created_at}
        preview={reporting?.body || ''}
        // DM media is in the private dm-media bucket: the stored value is a path and needs a signed URL. If the URL has
        // expired the card says it was a photo. Photos and videos both use `image_url`; `mediaType` tells them apart.
        imageUrl={reporting?.image_url && mediaType(reporting.image_url) !== 'video'
          ? (isSignedDmPath(reporting.image_url) ? signedUrls.get(reporting.image_url) : reporting.image_url)
          : null}
        videoUrl={reporting?.image_url && mediaType(reporting.image_url) === 'video' ? reporting.image_url : null}
        onClose={() => setReporting(null)}
      />

      {/* WHAT YOU CAN DO WITH A CONVERSATION, from holding it (or right-clicking
          it). Two items, because there are two: pin it to the top, or get rid
          of it. Fixed and centred so no list overflow can clip it, and the
          backdrop is the way out. */}
      {convSheet && createPortal(
        <div
          className="fixed inset-0 z-[70]"
          onClick={() => setConvSheet(null)}
          onContextMenu={(e) => { e.preventDefault(); setConvSheet(null) }}
        >
          <div
            className="absolute w-72 max-w-[calc(100vw-2rem)] origin-top animate-fade-up overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-lift"
            style={(() => {
              const a = convSheet._anchor
              const vw = typeof window !== 'undefined' ? window.innerWidth : 400
              const vh = typeof window !== 'undefined' ? window.innerHeight : 800
              if (!a) return { left: '50%', top: '40%', transform: 'translate(-50%, -50%)' }
              const left = Math.max(16, Math.min(a.left + 16, vw - 288 - 16))
              const below = a.bottom + 6
              return below + 210 < vh ? { left, top: below } : { left, bottom: Math.max(16, vh - a.top + 6) }
            })()}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="truncate border-b border-gray-100 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-smoke">
              {convSheet.kind === 'group'
                ? groupName(convSheet, convSheet.members, user.id)
                : (convSheet.other?.name ?? 'Creator')}
            </p>
            <button
              type="button"
              onClick={(e) => { const c = convSheet; setConvSheet(null); togglePin(e, c) }}
              className="flex w-full items-center gap-3.5 px-5 py-4 text-left text-sm font-semibold text-ink transition-colors hover:bg-cloud"
            >
              <Icon name="pin" className="h-5 w-5 shrink-0 text-brand" />
              {pinned.includes(convSheet.id) ? tr('Unpin from the top') : tr('Pin to the top')}
            </button>
            <button
              type="button"
              onClick={() => { const c = convSheet; setConvSheet(null); deleteConversation(c) }}
              className="flex w-full items-center gap-3.5 border-t border-gray-100 px-5 py-4 text-left text-sm font-semibold text-red-600 transition-colors hover:bg-cloud"
            >
              <Icon name="trash" className="h-5 w-5 shrink-0" />
              {convSheet.kind === 'group' ? tr('Leave this group') : tr('Delete this conversation')}
            </button>
            <button
              type="button"
              onClick={() => setConvSheet(null)}
              className="w-full border-t border-gray-100 px-5 py-3.5 text-center text-sm font-medium text-smoke transition-colors hover:bg-cloud"
            >
              {tr('Cancel')}
            </button>
          </div>
        </div>,
        document.body,
      )}

      {/* ONE FULL-SCREEN LAYER FOR THE WHOLE THREAD. It portals to the body, so
          neither the bubble's `overflow-hidden` nor the DM overlay can clip it,
          and it carries its own pinch zoom and Save. */}
      <PhotoLightbox
        src={viewing?.url ?? null}
        kind={viewing?.kind ?? 'image'}
        alt="Shared media"
        canSave
        onClose={() => setViewing(null)}
      />

      {isGroup && (
        <GroupSettingsModal
          open={showGroupSettings}
          onClose={() => setShowGroupSettings(false)}
          conversation={active}
          members={activeMembers}
          invites={groupInvites}
          myId={user.id}
          people={people}
          connectionIds={connectionIds}
          onChanged={loadConversations}
          onLeft={() => { setShowGroupSettings(false); loadConversations(); navigate('/messages') }}
        />
      )}
    </div>
  )
}
