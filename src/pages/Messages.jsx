import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'
import PendingLabel from '../components/PendingLabel'
import { confirm, notice } from '../lib/confirm'
import { loadDraft, saveDraft, clearDraft } from '../lib/drafts'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { uploadDmImage, uploadDmVideo, signDmImages, isSignedDmPath } from '../lib/chatMedia'
import { loadRelationship, loadRelationships } from '../lib/connections'
import { openConversation } from '../lib/dm'
import { Avatar, Badge, EmptyState, Skeleton, Spinner } from '../components/ui'
import Icon from '../components/Icon'
import { jumpThreshold, distanceFromBottom } from '../lib/scrollJump'
import ChatMedia from '../components/ChatMedia'
import PhotoLightbox from '../components/PhotoLightbox'
import MessageActions from '../components/chat/MessageActions'
import { useProfileNames } from '../components/network/ChatExtras'
import { mediaType, saveFile, fileNameFromUrl } from '../lib/media'
import { isOnline } from '../lib/presence'
import { pinToBottom } from '../lib/chatScroll'
import { formatChatTime, formatMessageTime, messageTimeTitle, otherParticipant, cx } from '../lib/utils'
import { useVisualViewport, useIsMobile } from '../lib/useKeyboardInset'
import { setChatChromeHidden } from '../lib/chatChrome'
import { RoomSearch } from '../components/ChatSearch'
import Reveal from '../components/network/Reveal'
import SeenBy from '../components/SeenBy'
import ChatComposer from '../components/ChatComposer'
import OutboxNotice from '../components/OutboxNotice'
import { enqueueMessage, queuedFor, subscribeOutbox, onOutboxSent, retryQueued, dropQueued } from '../lib/outbox'
import MessageEditor from '../components/MessageEditor'
import ReportMessage from '../components/ReportMessage'
import { useNowTick, withinEditWindow } from '../lib/messageActions'
import { playSend, playSendFail, playDmArrival, playReactionPop } from '../lib/appSounds'
import { renderMessageBody, stripMarkup } from '../lib/richText'
import { EntryReferenceCard, loadEntryRefs } from '../components/EntryFeedback'
import ResourceCard from '../components/ResourceCard'
import ResourcePicker from '../components/ResourcePicker'
import { GroupAvatar, NewGroupModal, GroupSettingsModal } from '../components/GroupPanels'
import {
  groupName, acceptInvite, declineInvite, leaveGroup,
  loadGroupMembers, loadMyInvites, markGroupRead,
} from '../lib/groups'
import { useT } from '../lib/i18n'


// PINNED CHATS. Three, per device, in localStorage - see the note on the
// `pinned` state for why it is not a column.
const MAX_PINNED_CONVERSATIONS = 3
const PINNED_KEY = 'dm-pinned'

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

// A short label for a DM when it's quoted in a reply.
// A PREVIEW IS PLAIN TEXT, NOT MARKDOWN.
//
// Replying to a message written with the formatting buttons put the RAW body in
// the quote strip, so a reply to a heading read "## Content tips" and a reply to
// bold text read "**this**". Ethan: "when you reply to a message it doesn't show
// the correct bold message headings, but rather it shows hashtags and stars."
// `stripMarkup` is the one place that knows how to undo the markers, and it
// keeps @names intact, which is what a one-line quote actually needs.
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

// Direct messages: inbox (conversation list) + active thread, both realtime.
// On mobile you see one panel at a time; on desktop they sit side by side.
export default function Messages() {
  const tr = useT()
  const { conversationId } = useParams()
  const { user, profile, isAdmin } = useAuth()
  const navigate = useNavigate()

  const [conversations, setConversations] = useState([]) // enriched with profile/members + unread
  // GROUPS.
  //
  // The inbox holds two shapes now. A 'direct' conversation is the pair it has
  // always been; a 'group' is a room with a membership table behind it. They
  // share this page rather than getting a second one because they share
  // everything that makes a conversation work - media, replies, reactions,
  // typing, the mobile overlay - and because an inbox split in two is an inbox
  // you have to check twice.
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
    saveDraft('dm-' + conversationId, md)
    if (md.trim()) pingTyping()
  } // message id with emoji picker open
  // Searching THIS conversation. The inbox search above finds a person; this
  // finds a message, and they are different questions - "where is Jacob" and
  // "what did Jacob say about the Lisbon shoot" - so they are two controls.
  const [threadSearch, setThreadSearch] = useState('')

  // ---- The outbox -------------------------------------------------------
  //
  // THE DMs HAD NOTHING. `send` awaited the insert and let realtime put the
  // message on screen, which means a DM written with no signal made a fail
  // noise, left an empty composer and was simply gone - the one surface where
  // that matters most, because a DM is addressed to a person who is now waiting
  // for an answer that was never sent. Queued in `src/lib/outbox.js` now, and
  // read back from there so it survives the reload. Same module the two chats
  // use; there is exactly one of these in the codebase.
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
  const [loadingList, setLoadingList] = useState(true)
  // PINNED CONVERSATIONS, PER DEVICE.
  //
  // localStorage rather than a column, deliberately. Pinning is a view
  // preference about how YOU want your own inbox arranged - it changes nothing
  // for the other person and nothing about the data - and the same rule already
  // governs the rooms sidebar's order and the two sound switches. It also means
  // no migration and no round trip on a press.
  //
  // THREE IS THE LIMIT, and it is a real limit rather than a suggestion. The
  // whole value of a pin is that the pinned set is small enough to be the first
  // thing you look at; a fourth pin is the beginning of a second inbox.
  const [pinned, setPinned] = useState(loadPinnedConversations)
  const [loadingThread, setLoadingThread] = useState(false)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [attachError, setAttachError] = useState('')
  const [activeRelation, setActiveRelation] = useState(null)
  // Inbox search + the people it searches over (every creator you could DM).
  const [search, setSearch] = useState('')
  const [people, setPeople] = useState([])
  const [connectionIds, setConnectionIds] = useState(new Set())
  const [starting, setStarting] = useState(null) // creator id being opened
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

  // Visual-viewport tracking drives the WhatsApp-style mobile layout: the whole
  // thread becomes a fixed overlay pinned to the visible area so the composer
  // hugs the keyboard, the person you're messaging stays pinned at the top, and
  // the app header + bottom tab bar collapse away while typing. Same approach as
  // the #general chat (see useVisualViewport for the iOS reasoning).
  const { height: vpHeight, offsetTop: vpOffset, keyboardOpen: kbOpen } = useVisualViewport()
  const isMobile = useIsMobile()

  // THE APP HEADER SLIDES AWAY WHILE YOU ARE READING A DM, exactly as it does
  // in a room.
  //
  // Ethan: "I would incorporate the same animation and structure for DMs on
  // mobile - whenever you click on a DM, the header on the top smoothly
  // animates away and it just shows the person's name and the search bar in the
  // top right at the top instead. You can see more messages. And if you're near
  // the top it brings it back, and going back brings it back."
  //
  // The thread already HAS the right top bar - a back arrow, the other person's
  // face and name, and the search - so the app header above it was a second
  // 64px bar carrying a logo, a bell and an avatar that nobody is using while
  // they read. Same module-level channel the rooms use (lib/chatChrome), so
  // the shell needs to know nothing about DMs.
  //
  // `setChrome` calls the channel IN THE HANDLER rather than from an effect
  // keyed on the state. That is not a style preference: an effect runs after
  // the commit that grew the overlay, so the header would start sliding one
  // frame later and the two movements read as a lag instead of as one gesture.
  // The rooms learned this the hard way; the note in NetworkChat has the
  // detail. The effect below is still here for the two cases a handler cannot
  // cover - the width changing under a hidden header, and leaving the page.
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

  // A THREAD OPENS WITH THE HEADER ALREADY AWAY, and the inbox always has it.
  // Hiding on scroll alone is not enough: a short conversation never scrolls,
  // so the room this was copied from used to keep its chrome for ever in
  // exactly the threads that had the least to show.
  useEffect(() => {
    setChatChromeHidden(isMobile && !!conversationId)
    setChromeHidden(isMobile && !!conversationId)
  }, [isMobile, conversationId])

  // Mobile overlay geometry. Keyboard closed: leave room for the top header
  // (4rem, or nothing once it has slid away) and the bottom tab bar (4.5rem +
  // safe area). Keyboard open: take the full visible viewport so the header +
  // tabs are hidden until it closes.
  // `chromeHidden` and `kbOpen` do the same thing to the top edge for different
  // reasons, so they are one condition here.
  const topGone = kbOpen || chromeHidden
  const mobileStyle = isMobile
    ? {
        top: topGone ? 0 : '4rem',
        height: kbOpen
          ? `${vpHeight}px`
          : `calc(${vpHeight}px - ${chromeHidden ? '0rem' : '4rem'} - 4.5rem - env(safe-area-inset-bottom))`,
        // Clamp to >= 0: on iOS a downward pull at the top makes offsetTop go
        // negative, which would ride the overlay up above the header.
        transform: `translateY(${Math.max(0, vpOffset)}px)`,
        paddingTop: topGone ? 'env(safe-area-inset-top)' : undefined,
        // The overlay grows in the SAME 300ms the header slides in, so the two
        // read as one movement rather than as a gap opening and then filling.
        transition: 'top 300ms cubic-bezier(0.32,0.72,0,1), height 300ms cubic-bezier(0.32,0.72,0,1)',
      }
    : undefined

  // Lock the document while the mobile DM overlay is up so iOS can't rubber-band
  // the page (which dragged the header down / exposed content above it).
  useEffect(() => {
    if (!isMobile) return
    document.documentElement.classList.add('overlay-lock')
    return () => document.documentElement.classList.remove('overlay-lock')
  }, [isMobile])

  const active = conversations.find((c) => c.id === conversationId)
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
    const [{ data: convos }, myInvites] = await Promise.all([
      supabase.from('conversations').select('*').order('last_message_at', { ascending: false }),
      loadMyInvites(user.id),
    ])
    setInvites(myInvites)
    if (!convos?.length) {
      setConversations([])
      setLoadingList(false)
      return
    }
    const groups = convos.filter((c) => c.kind === 'group')
    const directs = convos.filter((c) => c.kind !== 'group')

    // The other participant of each 1:1, the membership of each group, and my
    // unread counts, in as few round trips as the shapes allow.
    const otherIds = directs.map((c) => otherParticipant(c, user.id)).filter(Boolean)
    const [{ data: profiles }, { data: unreadMsgs }, memberData, { data: groupMsgs }] = await Promise.all([
      otherIds.length
        ? supabase.from('profiles').select('id, name, photo_url, is_admin, bio').in('id', otherIds)
        : Promise.resolve({ data: [] }),
      supabase.from('direct_messages').select('id, conversation_id').eq('recipient_id', user.id).eq('read', false),
      loadGroupMembers(groups.map((c) => c.id)),
      // UNREAD IN A GROUP IS A WATERMARK, NOT A FLAG. `direct_messages.read` is
      // one boolean on one row and a group message has many readers, so "new
      // since you last looked" is `created_at > your last_read_at` instead.
      groups.length
        ? supabase.from('direct_messages')
            .select('id, conversation_id, sender_id, created_at')
            .in('conversation_id', groups.map((c) => c.id))
        : Promise.resolve({ data: [] }),
    ])

    const profileById = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))
    const unreadByConvo = {}
    for (const m of unreadMsgs ?? []) unreadByConvo[m.conversation_id] = (unreadByConvo[m.conversation_id] || 0) + 1

    const memberProfiles = new Map()
    const myRow = new Map()
    for (const [cid, rows] of memberData.byConversation) {
      memberProfiles.set(cid, rows.map((r) => r.profiles).filter(Boolean))
      const mine = rows.find((r) => r.profile_id === user.id)
      if (mine) myRow.set(cid, mine)
    }
    const groupUnread = {}
    for (const m of groupMsgs ?? []) {
      if (m.sender_id === user.id) continue
      const since = myRow.get(m.conversation_id)?.last_read_at
      if (since && new Date(m.created_at) <= new Date(since)) continue
      groupUnread[m.conversation_id] = (groupUnread[m.conversation_id] || 0) + 1
    }

    setConversations(
      convos.map((c) => (c.kind === 'group'
        ? {
            ...c,
            members: memberProfiles.get(c.id) || [],
            myRole: myRow.get(c.id)?.role ?? null,
            unread: groupUnread[c.id] || 0,
          }
        : {
            ...c,
            other: profileById[otherParticipant(c, user.id)],
            unread: unreadByConvo[c.id] || 0,
          }))
    )
    setLoadingList(false)
  }, [user.id])

  useEffect(() => { loadConversations() }, [loadConversations])

  // Everyone you could message, for the inbox search box and the empty state.
  // Same visibility rules as the creator directory (active, non-test, not
  // pending deletion), ordered most-recently-active first so the suggestions
  // shown to a creator with no connections are people actually around.
  useEffect(() => {
    let cancelled = false
    async function loadPeople() {
      const [{ data: profiles }, rels] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, name, photo_url, bio, is_admin, city, country')
          .eq('status', 'active').eq('is_test', false).is('deletion_requested_at', null)
          .order('last_seen_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false }),
        loadRelationships(user.id),
      ])
      if (cancelled) return
      setPeople((profiles ?? []).filter((p) => p.id !== user.id))
      setConnectionIds(new Set([...rels.entries()].filter(([, v]) => v.relation === 'connected').map(([id]) => id)))
    }
    loadPeople()
    return () => { cancelled = true }
  }, [user.id])

  // Jump into a conversation with someone from search / the suggestions list,
  // creating the thread if this is the first time.
  async function startConversation(creatorId) {
    setStarting(creatorId)
    const id = await openConversation(user.id, creatorId)
    setStarting(null)
    if (!id) return
    setSearch('')
    await loadConversations()
    navigate(`/messages/${id}`)
  }

  // Restore any half-written draft when the open conversation changes, so a
  // message you started isn't lost when you flick away to check something.
  useEffect(() => {
    setBody(loadDraft(conversationId ? 'dm-' + conversationId : ''))
  }, [conversationId])

  // ---------- Active thread ----------
  useEffect(() => {
    if (!conversationId) return
    let cancelled = false
    async function loadThread() {
      setLoadingThread(true)
      const { data } = await supabase
        .from('direct_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
      if (cancelled) return
      setThread(data ?? [])
      // Load reactions for the thread (silently no-ops if the table isn't there yet).
      const ids = (data ?? []).map((m) => m.id)
      if (ids.length) {
        const { data: reacts } = await supabase.from('dm_reactions').select('*').in('message_id', ids)
        if (!cancelled) setReactions(reacts ?? [])
      } else if (!cancelled) {
        setReactions([])
      }
      // A feedback DM carries the entry it is about, so the bubble can show the
      // entry card rather than a paragraph about a video you then have to find.
      const refs = await loadEntryRefs((data ?? []).map((m) => m.submission_id))
      if (!cancelled) setEntryRefs(refs)
      setLoadingThread(false)
      // Mark everything they sent me as read. In a group there is no per-reader
      // flag on the message - one row, many readers - so the watermark on my
      // own membership row moves instead.
      await Promise.all([
        supabase
          .from('direct_messages')
          .update({ read: true })
          .eq('conversation_id', conversationId)
          .eq('recipient_id', user.id)
          .eq('read', false),
        markGroupRead(conversationId, user.id),
      ])
      loadConversations() // refresh unread badges
    }
    loadThread()
    return () => { cancelled = true }
  }, [conversationId, user.id, loadConversations])

  // READ RECEIPTS IN A GROUP DM.
  //
  // A 1:1 has had them forever - `direct_messages.read` is one boolean because
  // there is exactly one other reader - but a group has many, so the answer
  // lives on each member's own `last_read_at` watermark. Loaded when the thread
  // opens and kept live, because "seen by 4" that only updates on a page
  // refresh is worse than no receipt at all: it is a wrong one.
  const [groupReads, setGroupReads] = useState(new Map())
  useEffect(() => {
    if (!isGroup || !conversationId) { setGroupReads(new Map()); return undefined }
    let alive = true
    const pull = () => supabase.from('conversation_members')
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
    supabase.from('conversation_invites')
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
        // Only react to messages I can see: mine, addressed to me, or posted in
        // a conversation I am in. That last clause is what carries GROUP
        // messages - they have no recipient at all, so the old two-way test
        // dropped every one of them and a group only updated on a reload.
        // Realtime already applies RLS, so anything that arrives here is
        // something this session is allowed to read; this is about which OPEN
        // thread it belongs to.
        const mine = msg.sender_id === user.id || msg.recipient_id === user.id
        if (!mine && msg.conversation_id !== conversationId) return
        // A DM IS A PERSON. Its own two-note arrival, distinct from the single
        // tick a room makes, because "somebody is talking TO you" and "the
        // room is busy" should not be the same event to your ear. It plays for
        // any of your conversations, not just the open one - that is the
        // difference between a crowd and a person - but never for your own
        // message and never with the tab in the background.
        if (msg.sender_id !== user.id && !document.hidden) playDmArrival()
        if (msg.conversation_id === conversationId) {
          setThread((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
          // I'm looking at this thread - mark it read immediately.
          if (msg.recipient_id === user.id) {
            await supabase.from('direct_messages').update({ read: true }).eq('id', msg.id)
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
        // REACTING TO A DM USED TO TAKE THE PAGE DOWN.
        //
        // This read the open thread by calling `setThread` and reaching into
        // the updater - and then called `setReactions` from inside it. A
        // setState updater has to be a pure function of the previous state:
        // React is allowed to call it twice, to call it while another component
        // is rendering, and to discard the result, so scheduling a second
        // update from inside one is exactly the thing that throws. The comment
        // three lines above says as much, about the sound, and then the next
        // line does it anyway. That is the "mayday mayday" on reacting to a DM.
        //
        // The question it was asking - "is this reaction about a message I have
        // on screen" - is answered by a ref, which is what refs are for.
        if (threadIdsRef.current.has(payload.new.message_id)) {
          setReactions((prev) => (prev.some((r) => r.id === payload.new.id) ? prev : [...prev, payload.new]))
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'dm_reactions' }, (payload) => {
        setReactions((prev) => prev.filter((r) => r.id !== payload.old.id))
      })
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [user.id, conversationId, loadConversations])

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
    await supabase.from('direct_messages').delete().eq('id', m.id)
  }

  // Accept a pending connection request from the person I'm messaging, right in
  // the thread (smooths the gated-DM flow: accepting connects us and unlocks it).
  async function acceptConnection() {
    if (!activeRelation?.rowId) return
    const { error } = await supabase.from('connections').update({ status: 'accepted' }).eq('id', activeRelation.rowId)
    if (!error) setActiveRelation((r) => (r ? { ...r, relation: 'connected' } : r))
  }

  // ---------- Reactions ----------
  // Add / remove my reaction to a DM (same UX as #general).
  async function toggleReaction(messageId, emoji) {
    setActionsFor(null)
    const mine = reactions.find((r) => r.message_id === messageId && r.creator_id === user.id && r.emoji === emoji)
    if (mine) {
      setReactions((prev) => prev.filter((r) => r.id !== mine.id))
      await supabase.from('dm_reactions').delete().eq('id', mine.id)
    } else {
      const { data } = await supabase
        .from('dm_reactions')
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
    // LEAVING A GROUP IS NOT DELETING IT. A long-press that ended everybody
    // else's conversation because one member wanted it out of their inbox would
    // be a genuinely destructive accident, and RLS refuses it anyway unless you
    // own the group - so the gesture means "leave" here, and deleting for
    // everyone lives behind a named button in the settings panel.
    if (c.kind === 'group') {
      const name = groupName(c, c.members, user.id)
      if (!await confirm(`Leave ${name}? The conversation carries on without you.`)) return
      setConversations((prev) => prev.filter((x) => x.id !== c.id))
      if (c.id === conversationId) navigate('/messages')
      await leaveGroup(c.id, user.id)
      return
    }
    if (!await confirm(`Delete your conversation with ${c.other?.name ?? 'this creator'}? This deletes the entire conversation and removes the chat.`)) return
    setConversations((prev) => prev.filter((x) => x.id !== c.id))
    if (c.id === conversationId) navigate('/messages')
    await supabase.from('conversations').delete().eq('id', c.id)
  }

  // ---------- Group invites ----------
  async function answerInvite(invite, yes) {
    setInvites((prev) => prev.filter((i) => i.id !== invite.id))
    const { error } = yes ? await acceptInvite(invite, user.id) : await declineInvite(invite)
    if (error) { notice(error); loadConversations(); return }
    await loadConversations()
    if (yes) navigate(`/messages/${invite.conversation_id}`)
  }
  // ONE TIMER, AND THE FLAG IS CLEARED WHEN THE PRESS STARTS.
  //
  // A tap on a touch screen fires touchstart AND a synthetic mousedown, so this
  // was started twice for one press and only the second handle was ever stored
  // - the first was orphaned and went off 550ms later, opening the delete
  // dialog on a conversation somebody had merely tapped. Clearing before
  // starting makes a second start harmless.
  //
  // And `convLongPressed` is reset HERE rather than only inside the click that
  // it suppresses. It used to be sticky: once a long press had happened, the
  // flag stayed true until some later click consumed it - so the next tap on
  // ANY row was swallowed, with nothing on screen to explain it. A press is the
  // start of a new gesture, so a new gesture is what it means.
  // HOLDING A ROW OFFERS BOTH THINGS YOU CAN DO TO IT.
  //
  // Ethan: "holding down on mobile correctly brings up the do you want to
  // delete this conversation, as well as this, you can add it to the ui for
  // mobile here the ability to pin the person."
  //
  // It went straight to the delete confirmation, which made a hold on a
  // conversation mean exactly one thing - and the most destructive one. It
  // opens a two-item sheet now, so the hold means "what can I do with this"
  // and deleting is a choice inside it rather than the gesture itself.
  //
  // Pinning had no route at all on a phone: the pin button only appears on
  // hover, and there is no hover.
  const startConvPress = (c) => {
    clearTimeout(convTimer.current)
    convLongPressed.current = false
    convTimer.current = setTimeout(() => { convLongPressed.current = true; setConvSheet(c) }, 550)
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
    if (!el) return
    if (behavior === 'smooth') el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    else el.scrollTop = el.scrollHeight
  }, [])

  useEffect(() => { atBottomRef.current = atBottom }, [atBottom])

  // A THREAD DOES NOT OPEN HALFWAY UP ITSELF AND THEN CORRECT ITSELF.
  //
  // Every re-pin above is a CORRECTION, and a correction you can watch is
  // indistinguishable from a bug: the first paint lands at the top of the
  // conversation, the frame pin drags it to the bottom, and each of the four
  // timers yanks it again as another avatar or photo arrives. Ethan reported
  // it in the rooms first - "it'll show up the messages in a different layer or
  // scrolled up and then suddenly load or fix itself and jump to the bottom" -
  // and the DMs are the same code doing the same thing.
  //
  // The thread is not SHOWN until it is where it belongs. Opacity only: the
  // messages are laid out and measured the whole time, which is exactly what
  // the pinning needs, so this costs nothing and moves nothing.
  const [settled, setSettled] = useState(false)

  // Opening a conversation, pin to the newest message until the thread stops
  // growing. Media - avatars, photos, video posters, async link previews - can
  // finish loading after the first scroll and push content down, stranding the
  // view in the middle.
  //
  // THE CORRECTIONS ARE NO LONGER ON A TIMETABLE. They fired at 60, 200, 500
  // and 1200ms whatever was happening, which is a guess at when a thread stops
  // growing, and it was wrong in both directions - still yanking a settled
  // thread at 1.2s, and giving up on a slow one at 1.3. `pinToBottom` watches
  // the scroll height and stops two frames after it last changed. The rooms use
  // exactly the same helper, so the two surfaces cannot drift on this again.
  //
  // The upstream half is migration 163: a DM attachment records its own shape,
  // so a photograph reserves its box before it decodes and most threads have
  // nothing left to settle.
  useLayoutEffect(() => {
    if (loadingThread || !conversationId) return undefined
    const el = scrollerRef.current
    if (!el) return undefined
    setSettled(false)
    el.scrollTop = el.scrollHeight
    return pinToBottom(
      () => scrollerRef.current,
      () => atBottomRef.current,
      () => setSettled(true),
    )
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

  // Keep the latest message visible as the keyboard opens/closes or the visible
  // viewport resizes (only if we were already following the newest).
  useEffect(() => {
    if (atBottom) scrollToBottom('smooth')
  }, [kbOpen, vpHeight, atBottom, scrollToBottom])

  // Track whether the reader is pinned to the bottom of the thread.
  const onScrollMessages = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const gap = distanceFromBottom(el)
    const near = gap < 90
    atBottomRef.current = near
    setAtBottom(near)
    setFarUp(gap > jumpThreshold(el, 5))
    if (near) setNewBelow(0)
    // REACHING THE TOP OF THE THREAD IS WHERE YOU HAVE RUN OUT OF MESSAGES AND
    // ARE LOOKING FOR SOMETHING ELSE, so the chrome comes back there and goes
    // away everywhere else. Same rule as the rooms.
    if (el.scrollTop < 12) showChrome()
    else hideChrome()
  }, [showChrome, hideChrome])

  const jumpToLatest = useCallback(() => {
    setAtBottom(true)
    atBottomRef.current = true
    setFarUp(false)
    setNewBelow(0)
    scrollToBottom('smooth')
  }, [scrollToBottom])

  // Mobile composer gestures (same as #general). The thread is a fixed overlay,
  // so a drag on the composer chrome used to rubber-band the page body under it,
  // firing visualViewport scroll events that made the whole screen shake/jitter.
  // We swallow those drags so the body can't move, and a downward swipe smoothly
  // dismisses the keyboard. A touch that starts inside the textarea is left alone
  // ONLY when the textarea is actually scrollable (a multi-line message you've
  // typed), so you can still scroll through what you've written.
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

  // Queue a DM row. Everything the send needs travels with it, so the outbox
  // can post it in twenty minutes from a cold tab with no idea what a
  // conversation is.
  function queueDm(fields) {
    const row = {
      conversation_id: conversationId,
      sender_id: user.id,
      // A GROUP MESSAGE IS ADDRESSED TO THE ROOM. `recipient_id` stays null,
      // and the RLS policy insists on it: a message in a group that named a
      // recipient would land in somebody's 1:1 unread count.
      recipient_id: isGroup ? null : otherParticipant(active, user.id),
      body: '',
      ...fields,
    }
    enqueueMessage({
      scope: outboxScope,
      table: 'direct_messages',
      row,
      select: '*',
      display: { ...row, created_at: new Date().toISOString(), read: false },
    })
  }

  function send(e) {
    e.preventDefault()
    if (!body.trim() || !active || dmLocked) return
    setAtBottom(true)
    // The whoosh answers the press, not the server. With a queue behind it
    // there may be no server for an hour.
    playSend()
    const replyId = replyTo?.id ?? null
    queueDm({ body: body.trim(), ...(replyId ? { reply_to: replyId } : {}) })
    setBody(''); dmComposerRef.current?.clear(); clearDraft('dm-' + conversationId); setReplyTo(null); stopTyping()
  }

  // Attach a photo or video to the DM (uploads, then sends with any typed
  // caption). Both land in the private dm-media bucket; the storage PATH is
  // stored in image_url and rendered back through a signed URL (video paths end
  // in .mp4 etc, so the renderer picks the right player from the extension).
  // SHARING A RESOURCE INTO A DM.
  //
  // Admins only, same as in the rooms: a creator can paste a link, but an
  // admin pointing somebody at the brand rules does it several times a week.
  // It goes through the same outbox as every other message, so it survives a
  // dead tunnel and appears optimistically like anything else.
  const [pickingResource, setPickingResource] = useState(false)
  function shareResource(resourceId) {
    setPickingResource(false)
    queueDm({ resource_id: resourceId })
  }

  async function sendAttachment(file) {
    if (!file || !active || dmLocked) return
    const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name)
    setAttachError('')
    setAtBottom(true)
    setSending(true)
    try {
      // Store the private storage PATH (not a public URL); it's signed on render.
      const { url: path, w, h } = isVideo
        ? await uploadDmVideo(file, conversationId)
        : await uploadDmImage(file, conversationId)
      const replyId = replyTo?.id ?? null
      // Queued only once the file is in storage. The upload is the one part of
      // a send that genuinely cannot wait for signal: a File does not survive
      // localStorage, so there is nothing honest to queue until it has a path.
      //
      // `media_w`/`media_h` ride along (migration 163) so the thread reserves
      // the picture's box before it decodes - the fix for a DM that jumps while
      // it opens.
      queueDm({
        body: body.trim(),
        image_url: path,
        ...(w && h ? { media_w: w, media_h: h } : null),
        ...(replyId ? { reply_to: replyId } : {}),
      })
      playSend()
      setBody(''); dmComposerRef.current?.clear(); clearDraft('dm-' + conversationId); setReplyTo(null)
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

  // PINNED THREADS RIDE ON TOP, IN THE ORDER YOU PINNED THEM.
  //
  // Everything else keeps the order the query gave it (most recent first), so a
  // new message in an unpinned thread still climbs to just under the pins -
  // which is the behaviour Ethan described: "pins the chat to the top and
  // always remains there, new messages will come in below it".
  //
  // A stable sort is what makes that true: `Array.prototype.sort` has been
  // required to be stable since ES2019, so returning 0 for two unpinned threads
  // genuinely leaves them where they were rather than shuffling them.
  const shownConversations = useMemo(() => {
    if (!pinned.length) return matching
    const rank = new Map(pinned.map((id, i) => [id, i]))
    return [...matching].sort((a, b) => {
      const ra = rank.has(a.id) ? rank.get(a.id) : Infinity
      const rb = rank.has(b.id) ? rank.get(b.id) : Infinity
      return ra - rb
    })
    // `matching` is rebuilt every render by design (it is a filter over state),
    // so depending on it here is depending on the thing that changes - which is
    // correct: the sort has to re-run when the inbox or the search does.
  }, [matching, pinned])
  // Creators you match but haven't messaged yet: "start a new chat with…".
  const talkingTo = new Set(conversations.map((c) => c.other?.id).filter(Boolean))
  const searchMatches = q
    ? people.filter((p) => !talkingTo.has(p.id) && (p.name ?? '').toLowerCase().includes(q)).slice(0, 12)
    : []
  // Nobody in the inbox yet: nudge them towards their own connections, or, if
  // they haven't connected with anyone, towards creators who are active here.
  const myConnections = people.filter((p) => connectionIds.has(p.id))
  const emptyStatePeople = (myConnections.length > 0 ? myConnections : people.filter((p) => !p.is_admin)).slice(0, 6)
  // The same set for the DESKTOP pane, but ordered by who is around: the empty
  // pane's whole job is to start a conversation, and a message to somebody
  // online gets answered today. Sorted from the full list before slicing, or
  // the ordering would only shuffle whichever six the inbox happened to pick.
  const startablePeople = (myConnections.length > 0 ? myConnections : people.filter((p) => !p.is_admin))
    .slice()
    .sort((a, b) => (isOnline(b.last_seen_at) ? 1 : 0) - (isOnline(a.last_seen_at) ? 1 : 0))
    .slice(0, 8)

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
      {/* THE PANEL ARRIVES RATHER THAN SNAPPING IN.
          `animate-page-in` is opacity-only, deliberately: this is a fixed
          overlay, and a persisted transform on it (or on any ancestor) becomes
          the containing block for the position:fixed children inside, which is
          what breaks the mobile keyboard geometry. The inbox rows carry their
          own stagger, so the effect is a panel fading up with its list filling
          in behind it. */}
      <div className="flex min-h-0 flex-1 animate-page-in overflow-hidden bg-white sm:rounded-card sm:border sm:border-gray-100 sm:shadow-card">
        {/* ---------- Conversation list ---------- */}
        <aside
          className={cx(
            'w-full shrink-0 flex-col border-r border-gray-100 sm:flex sm:w-80',
            conversationId ? 'hidden' : 'flex'
          )}
          aria-label={tr("Conversations")}
        >
          <div className="border-b border-gray-100 px-5 py-4">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-lg font-bold">{tr("Messages")}</h1>
              {/* Starting a group is a different intent from finding a person,
                  so it is a different control. Folding it into the search box
                  ("type a name…") would mean the only way to discover groups
                  exist is to already know. */}
              <button
                type="button"
                onClick={() => setShowNewGroup(true)}
                className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-smoke transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:text-brand"
              >
                <Icon name="users" className="h-3.5 w-3.5" /> {tr("New group")}
              </button>
            </div>
            {/* Search doubles as the "new message" entry point: type a name to
                filter your threads and to start a fresh one with anyone in the
                community, instead of scrolling the inbox to find them. */}
            <div className="relative mt-3">
              <Icon name="magnifier" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-smoke" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tr("Search creators…")}
                aria-label={tr("Search creators to message")}
                className="input !py-2.5 !pl-9 !pr-9"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label={tr("Clear search")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-smoke hover:bg-cloud hover:text-ink"
                >
                  <Icon name="close" className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {/* GROUP INVITES SIT ABOVE THE INBOX.
                An invite is the one thing here that expires socially: a group
                gets going in its first day or it never does. Putting it in the
                notification list and nowhere else means it is answered by
                whoever happens to check notifications, which is not everybody. */}
            {invites.length > 0 && !q && (
              <div className="border-b border-gray-100 bg-brand-tint/25 px-3 py-3">
                <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand">
                  Group invite{invites.length === 1 ? '' : 's'}
                </p>
                <div className="space-y-1.5">
                  {invites.map((i) => (
                    <div key={i.id} className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2.5">
                      <GroupAvatar conversation={i.conversations} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{i.conversations?.title || 'A group'}</p>
                        <p className="truncate text-xs text-smoke">
                          {i.inviter?.name?.split(' ')[0] ?? 'Someone'} invited you
                        </p>
                      </div>
                      <button type="button" onClick={() => answerInvite(i, true)}
                        className="btn-primary shrink-0 !px-3 !py-1.5 !text-xs">{tr("Join")}</button>
                      <button type="button" onClick={() => answerInvite(i, false)} aria-label={tr("Decline invite")}
                        className="shrink-0 rounded-full p-1.5 text-smoke transition-colors hover:bg-cloud hover:text-ink">
                        <Icon name="close" className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {loadingList && (
              <div className="space-y-4 p-5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-3"><Skeleton className="h-10 w-10 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-28" /><Skeleton className="h-3 w-40" /></div></div>
                ))}
              </div>
            )}

            {/* Nothing in the inbox: rather than a dead end, offer the people
                you're already connected to. Someone who hasn't connected with
                anyone yet gets creators who are active in the community. */}
            {!loadingList && conversations.length === 0 && !q && (
              <div className="p-5">
                <div className="rounded-card border border-brand/20 bg-brand-tint/40 px-4 py-4 text-center">
                  <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-brand" aria-hidden>
                    <Icon name="envelope" className="h-6 w-6" />
                  </span>
                  <p className="mt-3 text-sm font-semibold">{tr("No messages yet")}</p>
                  <p className="mt-1 text-xs leading-relaxed text-smoke">
                    {myConnections.length > 0
                      ? 'Say hi to one of your connections. A quick hello is how most collabs start.'
                      : 'Say hi to someone new. A quick hello is how most collabs start.'}
                  </p>
                </div>

                {emptyStatePeople.length > 0 && (
                  <div className="mt-4">
                    <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      {myConnections.length > 0 ? 'Your connections' : 'Suggestions'}
                    </p>
                    <div className="space-y-0.5">
                      {emptyStatePeople.map((p) => personRow(p, 'Send a hello'))}
                    </div>
                  </div>
                )}

                <Link to="/creators" className="mt-4 block text-center text-xs font-semibold text-brand hover:underline">
                  {tr("Browse all creators")}
                </Link>
              </div>
            )}

            {/* Search found nothing at all. */}
            {!loadingList && q && shownConversations.length === 0 && searchMatches.length === 0 && (
              <div className="p-5">
                <EmptyState
                  icon={<Icon name="magnifier" className="h-7 w-7" />}
                  title={tr("No creators found")}
                  hint={tr("Try a different name.")}
                />
              </div>
            )}

            {/* THE INBOX ARRIVES, AND THIS TIME IT ACTUALLY DOES.
                Every other list in the app rises into view one row after
                another. There was already a `Reveal` here and it did nothing,
                which is Ethan's "all the open messages and people you've
                messaged just flash up on the left hand side rather than
                smoothly load and animate in from top to bottom".

                WHY IT DID NOTHING. `Reveal` marks itself `is-in` the moment its
                container is on screen - and the sidebar is at the top of the
                page, so that happened on the FIRST frame, while the list was
                still empty and waiting on the query. The rows arrived into a
                container that was already `is-in`, so they were rendered with
                the finished state applied and never had a starting frame to
                transition FROM. An entrance animation needs the element to
                exist before it arrives.

                The `key` fixes it by remounting the container the moment the
                list stops loading: a fresh Reveal, children present from its
                first frame, observer fires, everything staggers in.

                Tight stagger (35ms) because these are dense rows, not cards -
                past about 45ms a list stops reading as arriving and starts
                reading as slow. */}
            {/* `dense`: an inbox of twenty rows carrying twenty avatars is the
                list this variant exists for. See the prop in Reveal. */}
            <Reveal dense key={loadingList ? 'inbox-loading' : 'inbox-ready'} className="flex flex-col" stagger={0.035}>
            {shownConversations.map((c) => (
              // A ROW IS A BUTTON, SO THE PIN CANNOT BE ONE INSIDE IT.
              // Nesting a <button> in a <button> is invalid HTML and React will
              // say so; browsers resolve it by dropping the inner one, which
              // means the pin would render and never fire. The row is a div
              // with a click handler and the pin is a real button on top of it.
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => { if (convLongPressed.current) { convLongPressed.current = false; return } navigate(`/messages/${c.id}`) }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/messages/${c.id}`) } }}
                onTouchStart={() => startConvPress(c)} onTouchEnd={cancelConvPress} onTouchMove={cancelConvPress}
                onMouseDown={() => startConvPress(c)} onMouseUp={cancelConvPress} onMouseLeave={cancelConvPress}
                onContextMenu={(e) => { e.preventDefault(); setConvSheet(c) }}
                className={cx(
                  // `hoverable:` - A ROW WITH A `:hover` RULE COSTS YOU THE
                  // FIRST TAP ON iOS. Safari treats the first tap on an element
                  // whose appearance changes on hover as the hover, and only
                  // the second one as the click; the row lights up grey and
                  // nothing opens. Ethan: "on the first click on mobile it
                  // doesn't seem to open - I clicked on Shannon's chat and it
                  // just highlighted it in grey and didn't actually open the
                  // chat." The same rule is why the grey then STAYS: there is
                  // no pointer to move away.
                  // The `hoverable` variant is `(hover: hover) and (pointer:
                  // fine)`, so the style simply does not exist on a phone.
                  'group/conv relative flex w-full cursor-pointer select-none items-center gap-3 px-5 py-4 text-left transition-colors hoverable:hover:bg-cloud',
                  // A press still gives feedback on touch - it is just tied to
                  // the finger being down rather than to a hover that never
                  // ends.
                  'active:bg-cloud/70',
                  c.id === conversationId && 'bg-brand-tint/50'
                )}
              >
                {c.kind === 'group'
                  ? <GroupAvatar conversation={c} members={c.members} />
                  : <Avatar src={c.other?.photo_url} name={c.other?.name} size="md" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">
                      {c.kind === 'group' ? groupName(c, c.members, user.id) : (c.other?.name ?? 'Creator')}
                    </p>
                    {c.kind === 'group'
                      ? <Badge tone="light" className="!px-2 !py-0">{c.members?.length ?? 0}</Badge>
                      : c.other?.is_admin && <Badge tone="light" className="!px-2 !py-0">{tr("Tryp.com")}</Badge>}
                  </div>
                  <p className="truncate text-xs text-smoke">{formatChatTime(c.last_message_at)}</p>
                </div>
                {c.unread > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-semibold text-white">
                    {c.unread}
                  </span>
                )}

                {/* THE PIN. Top-right, on hover - and PERMANENTLY VISIBLE once
                    the chat is pinned, because a state you can only see by
                    hovering is a state that does not exist on a phone. It is
                    also the only affordance that says pinning is possible at
                    all, so it appears on focus as well as hover. */}
                <button
                  type="button"
                  onClick={(e) => togglePin(e, c)}
                  aria-label={pinned.includes(c.id) ? 'Unpin this chat' : 'Pin this chat to the top'}
                  title={pinned.includes(c.id) ? 'Unpin' : 'Pin to the top'}
                  className={cx(
                    'absolute right-2 top-2 rounded-full p-1.5 transition-all',
                    pinned.includes(c.id)
                      // An ALREADY pinned chat shows its pin at every width -
                      // a state you can only see by hovering is a state that
                      // does not exist on a phone.
                      ? 'text-brand opacity-100'
                      // AND THIS IS WHY THE FIRST TAP ON A DM DID NOTHING.
                      //
                      // Ethan: "whenever i click on a dm it just highlights it
                      // and i have to click again for it to open, i figure the
                      // reason for this is because the first time i click it
                      // shows up the pin icon."
                      //
                      // Exactly that. The row itself was already careful to put
                      // its hover behind `hoverable:` for this precise reason -
                      // iOS spends the first tap on an element whose appearance
                      // changes on hover, and only the second on the click -
                      // but this button's `group-hover/conv:` was UNPREFIXED,
                      // so the row still had a hover-sensitive descendant and
                      // Safari still charged a tap for it.
                      //
                      // `hoverable:` is `(hover: hover) and (pointer: fine)`,
                      // so on a phone these styles do not exist at all and the
                      // first tap opens the chat. Pinning is reachable there by
                      // holding the row - see the sheet below.
                      : 'text-gray-300 opacity-0 hoverable:hover:bg-white hoverable:hover:text-brand hoverable:focus-visible:opacity-100 hoverable:group-hover/conv:opacity-100',
                  )}
                >
                  <Icon name="pin" className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            </Reveal>

            {/* People matching the search that you haven't messaged before:
                tapping one opens a brand new thread with them. */}
            {searchMatches.length > 0 && (
              <div className="px-2 pb-4 pt-2">
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  {tr("Start a new chat")}
                </p>
                <div className="space-y-0.5">
                  {searchMatches.map((p) => personRow(p))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* ---------- Thread ---------- */}
        <section className={cx('min-w-0 flex-1 flex-col sm:flex', conversationId ? 'flex' : 'hidden')}>
          {!conversationId ? (
            // THE EMPTY PANE DOES SOMETHING NOW (1 Sep 2026).
            //
            // Ethan: "on dms when you first click on the tab and haven't opened
            // a dm yet it shows 'Pick a conversation. Or start a new one from
            // any creator's profile.' I think this is okay but something
            // better, more engaging, motivating etc could be here, or some
            // function, so think of this and improve it."
            //
            // It was an instruction to go somewhere else, on the largest empty
            // rectangle in the product, sent to somebody who is already exactly
            // where they need to be. So it does the thing instead: the people
            // you could message, as faces you can press, sorted with whoever is
            // online first - because "who is around right now" is the question
            // that actually starts a conversation.
            //
            // It reuses `emptyStatePeople`, which the inbox's own empty state
            // already builds (your connections, or active creators if you have
            // none), so there is one definition of "who should I talk to" and
            // no second query.
            <div className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-tint text-brand" aria-hidden>
                <Icon name="chat" className="h-7 w-7" />
              </span>
              <div>
                <p className="text-lg font-semibold">
                  {conversations.length > 0 ? tr('Open a conversation') : tr('Say hello to someone')}
                </p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-smoke">
                  {conversations.length > 0
                    ? tr('Pick one from the left, or start a new one with anybody below.')
                    : tr('A message is how most things here actually start: a meet-up, a collab, a question about a brief.')}
                </p>
              </div>

              {startablePeople.length > 0 && (
                <div className="w-full max-w-md">
                  <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    {myConnections.length > 0 ? tr('Your connections') : tr('Creators here right now')}
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {startablePeople.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => startConversation(p.id)}
                        disabled={starting === p.id}
                        className="flex items-center gap-2 rounded-full border border-gray-200 bg-white py-1.5 pl-1.5 pr-3.5 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-card disabled:opacity-60"
                      >
                        <span className="relative shrink-0">
                          <Avatar src={p.photo_url} name={p.name} size="xs" />
                          {isOnline(p.last_seen_at) && (
                            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-white" title={tr('Online now')} />
                          )}
                        </span>
                        <span className="max-w-[9rem] truncate">{p.name?.split(' ')[0]}</span>
                        {starting === p.id && <Spinner className="h-3.5 w-3.5" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <Link to="/creators" className="text-xs font-semibold text-brand hover:underline">
                {tr('Browse all creators')}
              </Link>
            </div>
          ) : (
            <>
              {/* Thread header. A press anywhere along it is "give me the app
                  header back" - the same gesture the rooms' tab strip carries,
                  and the one a thumb makes without being told, since the top of
                  the screen is where the header used to be. It does not fight
                  the buttons inside it: both happen. */}
              <div
                onPointerDown={showChrome}
                className="flex items-center gap-3 border-b border-gray-100 px-5 py-3"
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
                <RoomSearch
                  value={threadSearch}
                  onChange={setThreadSearch}
                  count={visibleThread.length}
                  total={thread.length}
                  label={tr("Search this conversation")}
                />
              </div>

              {/* Inline connection request: accept without leaving the thread. */}
              {activeRelation?.relation === 'pending_received' && (
                <div className="mx-5 mt-4 flex items-center gap-3 rounded-card border border-brand/20 bg-brand-tint/50 px-4 py-3">
                  <Icon name="users" className="h-5 w-5 shrink-0 text-brand" />
                  <p className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold">{active?.other?.name?.split(' ')[0]}</span> {tr("wants to connect with you.")}
                  </p>
                  <button onClick={acceptConnection} className="btn-primary shrink-0 !py-1.5 text-xs">{tr("Accept")}</button>
                </div>
              )}

              {/* Messages */}
              <div
                ref={scrollerRef}
                // The browser must not anchor this scroller: lib/chatScroll already owns
                // where it sits, and two mechanisms moving one scroller is the jitter.
                data-chat-scroller
                onScroll={onScrollMessages}
                // Tapping the thread dismisses the keyboard (WhatsApp-style); a
                // scroll drag doesn't fire click, so scrolling history leaves it up.
                onClick={() => { if (isMobile && kbOpen) document.activeElement?.blur?.() }}
                className={cx(
                  'min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain overflow-x-hidden touch-pan-y touch-pinch-zoom px-5 py-6',
                  // See `settled`. Opacity only, and never a conditional
                  // render: the rows have to be laid out for the pin to have a
                  // scroll height to pin to.
                  'transition-opacity duration-150',
                  settled ? 'opacity-100' : 'opacity-0',
                )}
              >
                {loadingThread && <div className="space-y-3"><Skeleton className="h-10 w-2/3" /><Skeleton className="ml-auto h-10 w-1/2" /><Skeleton className="h-10 w-3/5" /></div>}
                {!loadingThread && visibleThread.map((m, i) => {
                  // Only the first screenful animates. A thread of two hundred
                  // messages animating every row on open is a page that shudders
                  // for a second and a half; the ones above the fold carry the
                  // arrival and the rest are simply there.
                  const entering = i >= visibleThread.length - 12
                  const mine = m.sender_id === user.id
                  // WHO SAID IT. A 1:1 never needed this - there are two people
                  // and one of them is you - but eight anonymous grey bubbles
                  // is not a conversation. Shown once per run of consecutive
                  // messages from the same person, and suppressed entirely
                  // while searching, where "consecutive" is not true.
                  const sender = isGroup && !mine ? memberById.get(m.sender_id) : null
                  const startsRun = !threadSearch.trim()
                    ? visibleThread[i - 1]?.sender_id !== m.sender_id
                    : true
                  // Private DM media resolves to a signed URL; legacy public URLs pass through.
                  const imageSrc = m.image_url ? (isSignedDmPath(m.image_url) ? signedUrls.get(m.image_url) : m.image_url) : null
                  const isVid = m.image_url && mediaType(m.image_url) === 'video'
                  const summary = reactionSummary(m.id)
                  const orig = m.reply_to ? thread.find((x) => x.id === m.reply_to) : null
                  const showActions = actionsFor === m.id
                  return (
                    <div
                      key={m.id}
                      id={`dm-${m.id}`}
                      data-msg
                      className={cx(
                        // `group/msg` is the NAMED group MessageActions hangs
                        // its hover state on. The plain `group` stays because
                        // other things inside the row use it; an unnamed
                        // `group-hover:` cannot see a named group and vice
                        // versa, which is why the pill never appeared here.
                        'group/msg group flex gap-2',
                        mine && 'justify-end',
                        entering && 'animate-fade-up',
                        // THE ROW THAT HAS SOMETHING OPEN HAS TO COME FORWARD.
                        // `animate-fade-up` is `both`-filled, so the transform
                        // stays applied after it ends and every animated row is
                        // its own stacking context for good. A later row
                        // therefore paints over an earlier row's popover
                        // whatever z-index the popover carries - which is why
                        // the emoji panel opened underneath the next message.
                        showActions && 'relative z-20',
                      )}
                      style={entering ? { animationDelay: `${Math.min(i, 12) * 24}ms` } : undefined}
                    >
                      {/* The face column, drawn on EVERY message rather than
                          once per run - see the same change in the rooms. A
                          tinted shrink-to-fit bubble with an empty gutter
                          beside it reads as floating, which is exactly how
                          Ethan described it. */}
                      {isGroup && !mine && (
                        <span className="w-8 shrink-0 self-end pb-5">
                          <Link to={`/profile/${m.sender_id}`}>
                            <Avatar src={sender?.photo_url} name={sender?.name} size="xs" />
                          </Link>
                        </span>
                      )}
                      <div
                        // A queued message fades back a little: still yours,
                        // still there, just not out in the world yet.
                        className={cx('w-full min-w-0 max-w-[80%] sm:max-w-[65%]', m.pending && 'opacity-60')}
                        // PRESS A MESSAGE TO OPEN ITS ACTIONS. AT EVERY WIDTH.
                        // THE BUG THIS FIXES: this was gated on `isMobile`, and
                        // a laptop was meant to get the actions on hover
                        // instead - which nobody could make appear. Ethan: "a
                        // problem with the DMs is that it's not showing at all,
                        // whenever I'm hovering over a message". One behaviour
                        // now, the same one the rooms use. A press that ended a
                        // text selection is not a press.
                        onClick={(e) => {
                          if (e.target.closest('a,button,video,input')) return
                          if (!window.getSelection?.()?.isCollapsed) return
                          setActionsFor(showActions ? null : m.id)
                        }}
                      >
                      {/* THE SAME ACTION PILL THE ROOMS USE.
                          The DMs and the rooms had two hand-written copies of
                          this, and both had drifted into the same three faults:
                          the pill straddled the message so a short one was
                          covered entirely, it was anchored to the message COLUMN
                          so it jumped a row the moment anybody reacted, and it
                          hung off the outer edge, which is the edge of the
                          screen. One component now, so a fix lands in both. */}
                      <MessageActions
                        side={mine ? 'right' : 'left'}
                        open={showActions}
                        onClose={() => setActionsFor(null)}
                        reactions={Object.entries(summary).map(([emoji, info]) => [emoji, info.count, info.mine, dmReactorNames(info)])}
                        onToggleReaction={(emoji) => toggleReaction(m.id, emoji)}
                        // SAME SLOT AS THE ROOMS. These used to sit inside
                        // `children`, which put the timestamp and "Seen by"
                        // ABOVE the reaction chips here and BELOW them in a
                        // room - the same message furniture in two different
                        // orders on two surfaces that are meant to be
                        // identical. In the footer they are in one place, and
                        // the pill stays out of their way on both.
                        footer={(
                          <>
                            <p className={cx('mt-1 text-[10px] text-gray-400', mine && 'text-right')}>
                              <span title={messageTimeTitle(m.created_at)}>{formatMessageTime(m.created_at)}</span>
                              {m.edited_at && <span title={`Edited ${messageTimeTitle(m.edited_at)}`}> · edited</span>}
                              {m.pending
                                ? <PendingLabel tries={m.tries} prefix=" · " />
                                : (mine && !isGroup && m.read && ' · Read')}
                            </p>
                            {m.failed && (
                              <p className={cx('mt-0.5 text-[10px] text-smoke', mine && 'text-right')}>
                                Not sent yet.{' '}
                                <button type="button" onClick={() => retryQueued(m.queuedId)} className="font-semibold text-brand underline">{tr("Retry")}</button>
                                {' · '}
                                <button type="button" onClick={() => dropQueued(m.queuedId)} className="font-semibold underline">{tr("Discard")}</button>
                              </p>
                            )}
                            {mine && isGroup && (() => {
                              const seen = seenBy(m)
                              return seen.length ? (
                                <div className="mt-0.5 flex justify-end">
                                  <SeenBy readers={seen} align="right" />
                                </div>
                              ) : null
                            })()}
                          </>
                        )}
                        actions={m.pending || m.failed ? [] : [
                          // MEDIA GETS TWO MORE, AND THEY LEAD - same bar, same
                          // order as the rooms. `imageSrc` and not
                          // `m.image_url`: a DM attachment is a PRIVATE storage
                          // path, and only the signed URL is fetchable, so both
                          // of these have to use the one the bubble is already
                          // rendering.
                          ...((m.image_url && imageSrc)
                            ? [
                              {
                                icon: 'expand',
                                label: 'Full screen',
                                title: 'Open full screen',
                                onClick: () => setViewing({ url: imageSrc, kind: isVid ? 'video' : 'image' }),
                              },
                              {
                                icon: 'arrow-down',
                                label: 'Save',
                                title: isVid ? 'Save this video' : 'Save this photo',
                                onClick: () => saveMedia(imageSrc),
                              },
                            ]
                            : []),
                          { icon: 'reply', label: 'Reply', title: 'Reply to this message', onClick: () => { setReplyTo(m); setActionsFor(null); dmComposerRef.current?.focus() } },
                          ...(mine && withinEditWindow(m.created_at, nowTick)
                            ? [{ icon: 'pencil', label: 'Edit message', title: 'Edit (5 minutes)', onClick: () => { setEditingId(m.id); setActionsFor(null) } }]
                            : []),
                          ...(mine
                            ? [{ icon: 'trash', label: 'Delete message', title: 'Delete for everyone', danger: true, onClick: () => deleteDm(m) }]
                            : []),
                          // A DM is the one place a creator is most exposed and
                          // has the least recourse: a stranger gets one message
                          // through before you have agreed to talk at all.
                          ...(!mine
                            ? [{ icon: 'flag', label: 'Report message', title: 'Report to the team', danger: true, onClick: () => { setReporting(m); setActionsFor(null) } }]
                            : []),
                        ]}
                      >
                        {isGroup && !mine && startsRun && (
                          <p className="mb-0.5 truncate pl-1 text-[11px] font-semibold text-smoke">
                            {sender?.name ?? 'Someone'}
                          </p>
                        )}
                        {/* THE BUBBLE IS SHRINK-TO-FIT, like the rooms'.
                            It was a plain block inside a `w-full` column, so
                            every bubble was drawn at the full 80%/65% of the
                            thread whatever was in it: "whenever I send a short
                            message the text box is still super long". `w-fit`
                            takes the bubble down to its content and `max-w-full`
                            keeps a paragraph wrapping at the column's cap;
                            `ml-auto` puts yours back against the right edge,
                            since a shrunk bubble no longer reaches it. */}
                        <div
                          className={cx(
                          'w-fit max-w-full whitespace-pre-line break-words rounded-2xl text-sm leading-relaxed',
                          m.image_url ? 'overflow-hidden p-1.5' : 'px-4 py-2.5',
                          mine ? 'ml-auto rounded-br-md bg-brand text-white' : 'rounded-bl-md bg-cloud text-ink'
                        )}>
                          {/* Quoted reply */}
                          {m.reply_to && (
                            <button
                              type="button"
                              onClick={() => orig && scrollToMessage(orig.id)}
                              className={cx(
                                'mb-1.5 block w-full max-w-full overflow-hidden rounded-lg border-l-2 px-2.5 py-1 text-left',
                                m.image_url && 'mx-0.5 mt-0.5',
                                mine ? 'border-white/70 bg-white/15' : 'border-brand/60 bg-black/[0.04]'
                              )}
                            >
                              <span className={cx('block truncate text-[11px] font-semibold', mine ? 'text-white' : 'text-brand')}>
                                {orig ? (orig.sender_id === user.id ? 'You' : reactorName(orig.sender_id)) : 'Original message'}
                              </span>
                              {/* line-clamp, NOT truncate: nowrap made this preview's min-content
                                  width the whole quoted line, and the shrink-to-fit bubble grew to
                                  match, so replying to a long message ran off screen. */}
                              <span className={cx('line-clamp-1 text-xs [overflow-wrap:anywhere]', mine ? 'text-white/80' : 'text-smoke')}>{dmPreview(orig)}</span>
                            </button>
                          )}
                          {m.image_url && (
                            imageSrc ? (
                              // A tap opens this message's own bar, which is
                              // where Full screen and Save now live.
                              <ChatMedia
                                url={imageSrc} kind={isVid ? 'video' : 'image'} alt={m.body || 'Shared image'}
                                w={m.media_w} h={m.media_h}
                                onTap={() => setActionsFor((cur) => (cur === m.id ? null : m.id))}
                              />
                            ) : (
                              <div className="flex h-40 w-56 items-center justify-center rounded-xl bg-cloud"><Spinner /></div>
                            )
                          )}
                          {/* Feedback from the team arrives with the entry it
                              is about attached. */}
                          {m.resource_id && (
                            <span className={cx('block', m.image_url && 'px-2.5 pt-1.5')}>
                              <ResourceCard resourceId={m.resource_id} />
                            </span>
                          )}

                          {m.submission_id && (
                            <span className={cx('block', m.image_url && 'px-2.5 pt-1.5')}>
                              <EntryReferenceCard entry={entryRefs[m.submission_id]} onDark={mine} />
                            </span>
                          )}
                          {/* MARKDOWN, LIKE EVERY OTHER SURFACE. The DMs printed
                              the raw body, so a message written with the
                              formatting buttons - which the DMs now have -
                              arrived as literal asterisks and hashes. */}
                          {editingId === m.id ? (
                            <span className={cx('block', m.image_url && 'px-2.5 py-1.5')}>
                              <MessageEditor
                                kind="dm"
                                message={m}
                                onDark={mine}
                                onCancel={() => setEditingId(null)}
                                onSaved={(next) => {
                                  setThread((cur) => cur.map((x) => (x.id === next.id ? { ...x, body: next.body, edited_at: next.edited_at } : x)))
                                  setEditingId(null)
                                }}
                              />
                            </span>
                          ) : (
                            m.body && (
                              <span className={cx('block', m.image_url && 'px-2.5 py-1.5')}>
                                {renderMessageBody(m.body, { rich: true, members: activeMembers, onDark: mine })}
                              </span>
                            )
                          )}
                        </div>
                      </MessageActions>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>

              {/* Typing indicator + jump-to-latest pill float above the composer. */}
              <div className="relative">
                {otherTyping && (
                  <div className="pointer-events-none absolute -top-6 left-5 flex items-center gap-1.5 text-xs text-smoke">
                    <span className="flex gap-0.5">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-smoke [animation-delay:-0.2s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-smoke [animation-delay:-0.1s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-smoke" />
                    </span>
                    <span className="italic">
                      {(otherTyping.name || active?.other?.name || 'Someone').split(' ')[0]} is typing…
                    </span>
                  </div>
                )}
                {farUp && (
                  <div className="pointer-events-none absolute -top-14 inset-x-0 z-10 flex justify-center">
                    <button
                      type="button"
                      onClick={jumpToLatest}
                      className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white shadow-lift transition-transform hover:scale-105 active:scale-95"
                    >
                      {newBelow > 0 ? `${newBelow} new message${newBelow === 1 ? '' : 's'}` : 'Jump to latest'}
                      <Icon name="arrow-down" className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Composer */}
              {/* `shrink-0`, matching the legacy chat. Without it the composer
                  is the only flexible item in the column once the message list
                  has taken its `flex-1 basis-0`, so a composer grown to six
                  lines is the thing the browser squeezes when the keyboard
                  takes half the screen. */}
              <div ref={composerRef} className="shrink-0 border-t border-gray-100 px-5 py-4">
                {dmLocked ? (
                  <div className="rounded-card bg-cloud px-4 py-3 text-center text-sm text-smoke">
                    Message sent. You can send one message until {active?.other?.name?.split(' ')[0]} replies, which connects you.
                  </div>
                ) : (
                <>
                <OutboxNotice scope={outboxScope} />
                {attachError && <p className="mb-2 text-xs text-red-600">{attachError}</p>}
                {!connected && !isAdmin && iSentCount === 0 && !theyReplied && (
                  <p className="mb-2 text-xs text-smoke">You can send one message. If {active?.other?.name?.split(' ')[0]} replies, you’ll be connected.</p>
                )}
                {/* WHAT YOU ARE REPLYING TO. CHARACTER FOR CHARACTER THE ROOMS'.
                    The two had drifted into different chips doing the same job:
                    this one was a grey bar with a left rule and a BAN icon to
                    cancel - a no-entry sign, which reads as "you may not do
                    this" rather than "drop this reply". Ethan: "it shows up the
                    reply with a circle, like a no entry icon, it should be an x
                    to exit out of the reply, the same as it shows on the rooms."
                    So it is the rooms' markup: tinted, a reply arrow to say what
                    the bar is, and a close cross to leave. */}
                {replyTo && (
                  <div className="mb-2 flex items-center gap-2 rounded-xl border border-brand/25 bg-brand-tint/40 py-2 pl-3 pr-2">
                    <Icon name="reply" className="h-4 w-4 shrink-0 text-brand" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-semibold text-brand">
                        Replying to {replyTo.sender_id === user.id ? 'yourself' : reactorName(replyTo.sender_id).split(' ')[0]}
                      </span>
                      <span className="block truncate text-xs text-smoke">{dmPreview(replyTo)}</span>
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
                <ChatComposer
                  ref={dmComposerRef}
                  docId={conversationId}
                  initialMd={loadDraft('dm-' + conversationId)}
                  placeholder={isMobile
                    ? 'Message…'
                    : `Message ${isGroup ? activeTitle : (active?.other?.name?.split(' ')[0] ?? '')}…`}
                  ariaLabel="Message"
                  mentionNames={dmMentionNames}
                  onChangeMd={onComposerChange}
                  onBlur={stopTyping}
                  onSend={send}
                  canSend={!!body.trim()}
                  sending={sending}
                  onAttach={sendAttachment}
                  isAdmin={isAdmin}
                  onResource={isAdmin ? () => setPickingResource(true) : undefined}
                  onFocus={hideChrome}
                  isMobile={isMobile}
                  kbOpen={kbOpen}
                  className="!border-t-0 !px-0 !py-0"
                />
                </>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      <ResourcePicker
        open={pickingResource}
        onClose={() => setPickingResource(false)}
        onPick={shareResource}
        where="Send"
      />

      <NewGroupModal
        open={showNewGroup}
        onClose={() => setShowNewGroup(false)}
        people={people}
        connectionIds={connectionIds}
        myId={user.id}
        onCreated={async (id) => {
          setShowNewGroup(false)
          await loadConversations()
          navigate(`/messages/${id}`)
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
        // DM media lives in the PRIVATE dm-media bucket, so the stored value is
        // a path and only a short-lived signed URL will render. Hand the
        // snapshot whatever we have already signed for the thread; if it has
        // expired or was never signed, the card falls back to "this was a
        // photo" rather than a broken image. Both photos and videos are stored
        // in `image_url` here; `mediaType` is what tells them apart.
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
      {convSheet && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-6"
          onClick={() => setConvSheet(null)}
          onContextMenu={(e) => { e.preventDefault(); setConvSheet(null) }}
        >
          <div className="w-72 max-w-full overflow-hidden rounded-2xl bg-white shadow-lift" onClick={(e) => e.stopPropagation()}>
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
        </div>
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
