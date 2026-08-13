import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'
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
import ChatMedia from '../components/ChatMedia'
import ReactionPill from '../components/ReactionPill'
import { mediaType } from '../lib/media'
import { formatChatTime, formatMessageTime, messageTimeTitle, otherParticipant, cx } from '../lib/utils'
import { useVisualViewport, useIsMobile } from '../lib/useKeyboardInset'
import ReactionPicker from '../components/ReactionPicker'
import { RoomSearch } from '../components/ChatSearch'
import Reveal from '../components/network/Reveal'
import SeenBy from '../components/SeenBy'
import ChatComposer from '../components/ChatComposer'
import { renderMessageBody } from '../lib/richText'
import { GroupAvatar, NewGroupModal, GroupSettingsModal } from '../components/GroupPanels'
import {
  groupName, acceptInvite, declineInvite, leaveGroup,
  loadGroupMembers, loadMyInvites, markGroupRead,
} from '../lib/groups'


// A short label for a DM when it's quoted in a reply.
function dmPreview(m) {
  if (!m) return 'Message unavailable'
  if (m.body) return m.body
  if (m.image_url) return mediaType(m.image_url) === 'video' ? 'Video' : 'Photo'
  return 'Message'
}

// Direct messages: inbox (conversation list) + active thread, both realtime.
// On mobile you see one panel at a time; on desktop they sit side by side.
export default function Messages() {
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
  const [pickerFor, setPickerFor] = useState(null)
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

  // What the thread actually renders. Without a search that is every message.
  const visibleThread = useMemo(() => {
    const q = threadSearch.trim().toLowerCase()
    if (!q) return thread
    return thread.filter((m) => (m.body || '').toLowerCase().includes(q))
  }, [thread, threadSearch])
  const [actionsFor, setActionsFor] = useState(null) // message id with actions revealed (mobile tap)
  const [replyTo, setReplyTo] = useState(null)     // message being replied to
  const [loadingList, setLoadingList] = useState(true)
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
  const [newBelow, setNewBelow] = useState(0)
  const bottomRef = useRef(null)
  const scrollerRef = useRef(null)
  const prevLenRef = useRef(0)
  const atBottomRef = useRef(true)
  const dmComposerRef = useRef(null)
  const composerRef = useRef(null)

  // Visual-viewport tracking drives the WhatsApp-style mobile layout: the whole
  // thread becomes a fixed overlay pinned to the visible area so the composer
  // hugs the keyboard, the person you're messaging stays pinned at the top, and
  // the app header + bottom tab bar collapse away while typing. Same approach as
  // the #general chat (see useVisualViewport for the iOS reasoning).
  const { height: vpHeight, offsetTop: vpOffset, keyboardOpen: kbOpen } = useVisualViewport()
  const isMobile = useIsMobile()

  // Mobile overlay geometry. Keyboard closed: leave room for the top header
  // (4rem) and the bottom tab bar (4.5rem + safe area). Keyboard open: take the
  // full visible viewport so the header + tabs are hidden until it closes.
  const mobileStyle = isMobile
    ? {
        top: kbOpen ? 0 : '4rem',
        height: kbOpen
          ? `${vpHeight}px`
          : `calc(${vpHeight}px - 4rem - 4.5rem - env(safe-area-inset-bottom))`,
        // Clamp to >= 0: on iOS a downward pull at the top makes offsetTop go
        // negative, which would ride the overlay up above the header.
        transform: `translateY(${Math.max(0, vpOffset)}px)`,
        paddingTop: kbOpen ? 'env(safe-area-inset-top)' : undefined,
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
        setThread((cur) => {
          if (cur.some((m) => m.id === payload.new.message_id)) {
            setReactions((prev) => (prev.some((r) => r.id === payload.new.id) ? prev : [...prev, payload.new]))
          }
          return cur
        })
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
    setPickerFor(null)
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

  // Flash-highlight and scroll to a quoted original message when its reply is tapped.
  const scrollToMessage = useCallback((id) => {
    const el = document.getElementById(`dm-${id}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-2', 'ring-brand', 'ring-offset-2', 'rounded-2xl')
    setTimeout(() => el.classList.remove('ring-2', 'ring-brand', 'ring-offset-2', 'rounded-2xl'), 1300)
  }, [])

  // ---------- Anyone: long-press a conversation to delete it entirely ----------
  const convTimer = useRef(null)
  const convLongPressed = useRef(false)
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
    if (!await confirm(`Delete your conversation with ${c.other?.name ?? 'this creator'}? This removes the whole thread.`)) return
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
  const startConvPress = (c) => { convTimer.current = setTimeout(() => { convLongPressed.current = true; deleteConversation(c) }, 550) }
  const cancelConvPress = () => clearTimeout(convTimer.current)

  // Reset scroll bookkeeping when the open conversation changes (we always land
  // at the newest message in a freshly opened thread).
  useEffect(() => {
    prevLenRef.current = 0
    setAtBottom(true)
    setNewBelow(0)
    setReplyTo(null)
    setPickerFor(null)
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

  // Opening a conversation, pin firmly to the newest message. Media (avatars,
  // images, video posters, async link previews) can finish loading AFTER the
  // first scroll and push content down, stranding the view in the middle. We
  // re-pin across the next few frames AND whenever any descendant image loads -
  // `load` doesn't bubble, so we listen in the capture phase, which also catches
  // images inserted later. Guarded by atBottomRef so a scrolled-up reader is
  // never yanked.
  useLayoutEffect(() => {
    if (loadingThread || !conversationId) return
    const el = scrollerRef.current
    if (!el) return
    const pin = () => { if (atBottomRef.current) el.scrollTop = el.scrollHeight }
    el.scrollTop = el.scrollHeight
    const raf = requestAnimationFrame(pin)
    const timers = [setTimeout(pin, 60), setTimeout(pin, 200), setTimeout(pin, 500), setTimeout(pin, 1200)]
    el.addEventListener('load', pin, true)
    return () => {
      cancelAnimationFrame(raf)
      timers.forEach(clearTimeout)
      el.removeEventListener('load', pin, true)
    }
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
    } else if (grew) {
      setNewBelow((n) => n + (thread.length - prevLenRef.current))
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
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 90
    atBottomRef.current = near
    setAtBottom(near)
    if (near) setNewBelow(0)
  }, [])

  const jumpToLatest = useCallback(() => {
    setAtBottom(true)
    atBottomRef.current = true
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

  async function send(e) {
    e.preventDefault()
    if (!body.trim() || !active || dmLocked) return
    setAtBottom(true)
    setSending(true)
    const replyId = replyTo?.id ?? null
    const { error } = await supabase.from('direct_messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      // A GROUP MESSAGE IS ADDRESSED TO THE ROOM. `recipient_id` stays null,
      // and the RLS policy insists on it: a message in a group that named a
      // recipient would land in somebody's 1:1 unread count.
      recipient_id: isGroup ? null : otherParticipant(active, user.id),
      body: body.trim(),
      ...(replyId ? { reply_to: replyId } : {}),
    })
    setSending(false)
    if (!error) { setBody(''); dmComposerRef.current?.clear(); clearDraft('dm-' + conversationId); setReplyTo(null); stopTyping() }
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
      // Store the private storage PATH (not a public URL); it's signed on render.
      const path = isVideo
        ? await uploadDmVideo(file, conversationId)
        : await uploadDmImage(file, conversationId)
      const replyId = replyTo?.id ?? null
      const { error } = await supabase.from('direct_messages').insert({
        conversation_id: conversationId,
        sender_id: user.id,
        recipient_id: isGroup ? null : otherParticipant(active, user.id),
        body: body.trim(),
        image_url: path,
        ...(replyId ? { reply_to: replyId } : {}),
      })
      if (error) throw new Error(error.message)
      setBody(''); dmComposerRef.current?.clear(); clearDraft('dm-' + conversationId); setReplyTo(null)
    } catch (err) {
      setAttachError(err.message)
    }
    setSending(false)
  }

  // ---------- Inbox search + suggestions ----------
  const q = search.trim().toLowerCase()
  // Existing threads that match what you typed.
  const shownConversations = q
    ? conversations.filter((c) => (c.kind === 'group'
        ? groupName(c, c.members, user.id).toLowerCase().includes(q)
          // A group is also findable by who is in it, which is how you find the
          // one whose name you never bothered to set.
          || (c.members || []).some((m) => (m.name ?? '').toLowerCase().includes(q))
        : (c.other?.name ?? '').toLowerCase().includes(q)))
    : conversations
  // Creators you match but haven't messaged yet: "start a new chat with…".
  const talkingTo = new Set(conversations.map((c) => c.other?.id).filter(Boolean))
  const searchMatches = q
    ? people.filter((p) => !talkingTo.has(p.id) && (p.name ?? '').toLowerCase().includes(q)).slice(0, 12)
    : []
  // Nobody in the inbox yet: nudge them towards their own connections, or, if
  // they haven't connected with anyone, towards creators who are active here.
  const myConnections = people.filter((p) => connectionIds.has(p.id))
  const emptyStatePeople = (myConnections.length > 0 ? myConnections : people.filter((p) => !p.is_admin)).slice(0, 6)

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
          {p.is_admin && <Badge tone="light" className="!px-2 !py-0">Tryp.com</Badge>}
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
      <div className="flex min-h-0 flex-1 overflow-hidden bg-white sm:rounded-card sm:border sm:border-gray-100 sm:shadow-card">
        {/* ---------- Conversation list ---------- */}
        <aside
          className={cx(
            'w-full shrink-0 flex-col border-r border-gray-100 sm:flex sm:w-80',
            conversationId ? 'hidden' : 'flex'
          )}
          aria-label="Conversations"
        >
          <div className="border-b border-gray-100 px-5 py-4">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-lg font-bold">Messages</h1>
              {/* Starting a group is a different intent from finding a person,
                  so it is a different control. Folding it into the search box
                  ("type a name…") would mean the only way to discover groups
                  exist is to already know. */}
              <button
                type="button"
                onClick={() => setShowNewGroup(true)}
                className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-smoke transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:text-brand"
              >
                <Icon name="users" className="h-3.5 w-3.5" /> New group
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
                placeholder="Search creators…"
                aria-label="Search creators to message"
                className="input !py-2.5 !pl-9 !pr-9"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-smoke hover:bg-cloud hover:text-ink"
                >
                  <Icon name="close" className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
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
                        className="btn-primary shrink-0 !px-3 !py-1.5 !text-xs">Join</button>
                      <button type="button" onClick={() => answerInvite(i, false)} aria-label="Decline invite"
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
                  <p className="mt-3 text-sm font-semibold">No messages yet</p>
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
                  Browse all creators
                </Link>
              </div>
            )}

            {/* Search found nothing at all. */}
            {!loadingList && q && shownConversations.length === 0 && searchMatches.length === 0 && (
              <div className="p-5">
                <EmptyState
                  icon={<Icon name="magnifier" className="h-7 w-7" />}
                  title="No creators found"
                  hint="Try a different name."
                />
              </div>
            )}

            {/* THE INBOX ARRIVES. Every other list in the app rises into view
                one row after another; the DM inbox was a wall of rows that
                simply existed. Tight stagger (35ms) because these are dense
                rows, not cards - past about 45ms a list stops reading as
                arriving and starts reading as slow. */}
            <Reveal className="flex flex-col" stagger={0.035}>
            {shownConversations.map((c) => (
              <button
                key={c.id}
                onClick={() => { if (convLongPressed.current) { convLongPressed.current = false; return } navigate(`/messages/${c.id}`) }}
                onTouchStart={() => startConvPress(c)} onTouchEnd={cancelConvPress} onTouchMove={cancelConvPress}
                onMouseDown={() => startConvPress(c)} onMouseUp={cancelConvPress} onMouseLeave={cancelConvPress}
                onContextMenu={(e) => { e.preventDefault(); deleteConversation(c) }}
                className={cx(
                  'flex w-full select-none items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-cloud',
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
                      : c.other?.is_admin && <Badge tone="light" className="!px-2 !py-0">Tryp.com</Badge>}
                  </div>
                  <p className="truncate text-xs text-smoke">{formatChatTime(c.last_message_at)}</p>
                </div>
                {c.unread > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-semibold text-white">
                    {c.unread}
                  </span>
                )}
              </button>
            ))}
            </Reveal>

            {/* People matching the search that you haven't messaged before:
                tapping one opens a brand new thread with them. */}
            {searchMatches.length > 0 && (
              <div className="px-2 pb-4 pt-2">
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Start a new chat
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
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-tint text-brand" aria-hidden>
                <Icon name="chat" className="h-7 w-7" />
              </span>
              <p className="font-semibold">Pick a conversation</p>
              <p className="max-w-xs text-sm text-smoke">Or start a new one from any creator's profile.</p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-3">
                <button onClick={() => navigate('/messages')} className="rounded-full p-2 text-smoke hover:bg-cloud sm:hidden" aria-label="Back to inbox">
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
                        {active.other.is_admin && <Badge tone="light" className="!px-2 !py-0">Tryp.com Team</Badge>}
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
                  label="Search this conversation"
                />
              </div>

              {/* Inline connection request: accept without leaving the thread. */}
              {activeRelation?.relation === 'pending_received' && (
                <div className="mx-5 mt-4 flex items-center gap-3 rounded-card border border-brand/20 bg-brand-tint/50 px-4 py-3">
                  <Icon name="users" className="h-5 w-5 shrink-0 text-brand" />
                  <p className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold">{active?.other?.name?.split(' ')[0]}</span> wants to connect with you.
                  </p>
                  <button onClick={acceptConnection} className="btn-primary shrink-0 !py-1.5 text-xs">Accept</button>
                </div>
              )}

              {/* Messages */}
              <div
                ref={scrollerRef}
                onScroll={onScrollMessages}
                // Tapping the thread dismisses the keyboard (WhatsApp-style); a
                // scroll drag doesn't fire click, so scrolling history leaves it up.
                onClick={() => { if (isMobile && kbOpen) document.activeElement?.blur?.() }}
                className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-6"
              >
                {loadingThread && <div className="space-y-3"><Skeleton className="h-10 w-2/3" /><Skeleton className="ml-auto h-10 w-1/2" /><Skeleton className="h-10 w-3/5" /></div>}
                {!loadingThread && visibleThread.map((m, i) => {
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
                    <div key={m.id} id={`dm-${m.id}`} className={cx('group flex gap-2', mine && 'justify-end')}>
                      {/* The face column. Reserved even on the rows that do not
                          draw one, so a run of messages from one person stays
                          aligned under the first. */}
                      {isGroup && !mine && (
                        <span className="w-8 shrink-0 self-end pb-5">
                          {startsRun && (
                            <Link to={`/profile/${m.sender_id}`}>
                              <Avatar src={sender?.photo_url} name={sender?.name} size="xs" />
                            </Link>
                          )}
                        </span>
                      )}
                      <div
                        // `relative`: the action toolbar is absolutely
                        // positioned against this column so it costs no layout.
                        className="relative min-w-0 max-w-[80%] sm:max-w-[65%]"
                        // Tap a message on mobile to reveal its reply / react actions.
                        onClick={(e) => { if (isMobile && !e.target.closest('a,button,video,input')) setActionsFor(showActions ? null : m.id) }}
                      >
                        {isGroup && !mine && startsRun && (
                          <p className="mb-0.5 truncate pl-1 text-[11px] font-semibold text-smoke">
                            {sender?.name ?? 'Someone'}
                          </p>
                        )}
                        <div
                          className={cx(
                          'max-w-full whitespace-pre-line break-words rounded-2xl text-sm leading-relaxed',
                          m.image_url ? 'overflow-hidden p-1.5' : 'px-4 py-2.5',
                          mine ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md bg-cloud text-ink'
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
                              <ChatMedia url={imageSrc} kind={isVid ? 'video' : 'image'} alt={m.body || 'Shared image'} maxW={240} maxH={360} />
                            ) : (
                              <div className="flex h-40 w-56 items-center justify-center rounded-xl bg-cloud"><Spinner /></div>
                            )
                          )}
                          {/* MARKDOWN, LIKE EVERY OTHER SURFACE. The DMs printed
                              the raw body, so a message written with the
                              formatting buttons - which the DMs now have -
                              arrived as literal asterisks and hashes. */}
                          {m.body && (
                            <span className={cx('block', m.image_url && 'px-2.5 py-1.5')}>
                              {renderMessageBody(m.body, { rich: true, members: activeMembers, onDark: mine })}
                            </span>
                          )}
                        </div>
                        <p className={cx('mt-1 text-[10px] text-gray-400', mine && 'text-right')}>
                          <span title={messageTimeTitle(m.created_at)}>{formatMessageTime(m.created_at)}</span>
                          {mine && !isGroup && m.read && ' · Read'}
                        </p>

                        {/* Seen by, in groups. A 1:1 says "Read" on the line
                            above; a group needs names, and eight of them will
                            not fit on a timestamp. */}
                        {mine && isGroup && (() => {
                          const seen = seenBy(m)
                          return seen.length ? (
                            <div className="mt-0.5 flex justify-end">
                              <SeenBy readers={seen} align="right" />
                            </div>
                          ) : null
                        })()}

                        {/* Reactions stay in the flow. */}
                        {Object.keys(summary).length > 0 && (
                          <div className={cx('mt-0.5 flex flex-wrap items-center gap-1', mine && 'justify-end')}>
                            {Object.entries(summary).map(([emoji, info]) => (
                              <ReactionPill
                                key={emoji}
                                emoji={emoji}
                                count={info.count}
                                mine={info.mine}
                                names={info.ids.map(reactorName)}
                                onToggle={() => toggleReaction(m.id, emoji)}
                                align={mine ? 'right' : 'left'}
                              />
                            ))}
                          </div>
                        )}

                        {/* THE ACTIONS FLOAT. As an `opacity-0` row in the flow
                            they reserved their height under every message even
                            though nobody could see them, which on a phone left a
                            visible gap between a bubble and its timestamp. */}
                          <div className={cx(
                            'absolute top-0 z-10 flex items-center gap-1 rounded-full border border-gray-100 bg-white/95 px-1 py-0.5 shadow-card backdrop-blur transition-opacity',
                            mine ? 'left-0' : 'right-0',
                            showActions
                              ? 'opacity-100'
                              : 'pointer-events-none opacity-0 focus-within:pointer-events-auto focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100',
                          )}>
                            <button
                              onClick={() => { setReplyTo(m); setActionsFor(null); dmComposerRef.current?.focus() }}
                              aria-label="Reply"
                              title="Reply"
                              className="rounded-full border border-gray-200 bg-white p-1 text-smoke hover:border-brand hover:text-brand"
                            >
                              <Icon name="reply" className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setPickerFor(pickerFor === m.id ? null : m.id)}
                              aria-label="Add reaction"
                              className="rounded-full border border-gray-200 bg-white p-1 text-smoke hover:border-brand hover:text-brand"
                            >
                              <Icon name="smile" className="h-4 w-4" />
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => deleteDm(m)}
                                aria-label="Delete message"
                                title="Delete for everyone"
                                className="rounded-full border border-gray-200 bg-white p-1 text-smoke hover:border-red-300 hover:text-red-500"
                              >
                                <Icon name="trash" className="h-4 w-4" />
                              </button>
                            )}
                            {pickerFor === m.id && (
                              <>
                                <div className="fixed inset-0 z-20" onClick={() => setPickerFor(null)} />
                                <ReactionPicker
                                  align={mine ? 'right' : 'left'}
                                  onPick={(e) => toggleReaction(m.id, e)}
                                  onClose={() => setPickerFor(null)}
                                />
                              </>
                            )}
                          </div>
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
                {!atBottom && (
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
              <div ref={composerRef} className="border-t border-gray-100 px-5 py-4">
                {dmLocked ? (
                  <div className="rounded-card bg-cloud px-4 py-3 text-center text-sm text-smoke">
                    Message sent. You can send one message until {active?.other?.name?.split(' ')[0]} replies, which connects you.
                  </div>
                ) : (
                <>
                {attachError && <p className="mb-2 text-xs text-red-600">{attachError}</p>}
                {!connected && !isAdmin && iSentCount === 0 && !theyReplied && (
                  <p className="mb-2 text-xs text-smoke">You can send one message. If {active?.other?.name?.split(' ')[0]} replies, you’ll be connected.</p>
                )}
                {/* Reply preview: what you're replying to, with a cancel button. */}
                {replyTo && (
                  <div className="mb-2 flex items-center gap-2 rounded-xl border-l-2 border-brand bg-cloud/70 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-brand">
                        Replying to {replyTo.sender_id === user.id ? 'yourself' : reactorName(replyTo.sender_id).split(' ')[0]}
                      </p>
                      <p className="truncate text-xs text-smoke">{dmPreview(replyTo)}</p>
                    </div>
                    <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="rounded-full p-1 text-smoke hover:bg-white hover:text-ink">
                      <Icon name="ban" className="h-4 w-4" />
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
