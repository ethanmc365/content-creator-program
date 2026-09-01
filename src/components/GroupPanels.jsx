import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, Modal, Spinner } from './ui'
import Icon from './Icon'
import { confirm, notice } from '../lib/confirm'
import {
  GROUP_ACCENTS, accentHex, groupName,
  createGroup, inviteToGroup, updateGroup, leaveGroup, removeMember, deleteGroup,
} from '../lib/groups'
import { cx } from '../lib/utils'
import { useT } from '../lib/i18n'

// The two panels a group needs: one to start it, one to run it.
//
// They live outside Messages.jsx because that file is already the inbox, the
// thread, the composer, the reactions, the typing indicator and the mobile
// overlay geometry, and a group settings form is none of those things.

// A GROUP'S FACE.
//
// An emoji if it has one, otherwise the members' own faces stacked. A grey
// placeholder square would be the obvious thing and it is the wrong one: the
// whole reason a group is easy to find in an inbox is that it does not look
// like the person above it.
export function GroupAvatar({ conversation, members = [], size = 'md' }) {
  const px = size === 'lg' ? 'h-12 w-12' : size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'
  const text = size === 'lg' ? 'text-xl' : size === 'sm' ? 'text-sm' : 'text-base'
  if (conversation?.emoji) {
    return (
      <span
        className={cx('flex shrink-0 items-center justify-center rounded-full', px, text)}
        style={{ backgroundColor: accentHex(conversation.accent) }}
        aria-hidden
      >
        {conversation.emoji}
      </span>
    )
  }
  const faces = members.slice(0, 3)
  return (
    <span
      className={cx('relative flex shrink-0 items-center justify-center rounded-full', px)}
      style={{ backgroundColor: accentHex(conversation?.accent) }}
      aria-hidden
    >
      {faces.length === 0 ? (
        <Icon name="users" className="h-4 w-4 text-white" />
      ) : (
        <span className="flex -space-x-2">
          {faces.map((m) => (
            <Avatar key={m.id} src={m.photo_url} name={m.name} size="xs" className="ring-2 ring-white" />
          ))}
        </span>
      )}
    </span>
  )
}

// Somebody you can put in a group: a row that toggles.
function PersonToggle({ person, on, onToggle, hint }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(person.id)}
      aria-pressed={on}
      className={cx(
        'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors',
        on ? 'bg-brand-tint' : 'hover:bg-cloud',
      )}
    >
      <Avatar src={person.photo_url} name={person.name} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{person.name}</span>
        {hint && <span className="block truncate text-xs text-smoke">{hint}</span>}
      </span>
      <span className={cx(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
        on ? 'border-brand bg-brand text-white' : 'border-gray-300',
      )}>
        {on && <Icon name="check" className="h-3 w-3" />}
      </span>
    </button>
  )
}

// The look controls, shared by "new group" and "group settings" so a group
// cannot be given an emoji at birth and then have nowhere to change it.
// TWELVE TRAVEL ICONS, AND THEN THE WHOLE STOCK.
//
// The twelve are the answer for almost every group anybody here will make, and
// twelve is a row you can scan rather than a search task. But a fixed twelve is
// somebody else's idea of what your group is about, and a Christmas-markets
// group that has to settle for a generic globe is a group that feels like it
// came out of a template. So: the shortlist first, and "more icons" opens the
// stock set grouped under headings - the same two-state bargain the reaction
// picker makes, for the same reason.
const SUGGESTED_ICONS = ['✈️', '🌍', '📸', '🎬', '🏔️', '🏖️', '🍜', '🎒', '☕️', '🔥', '⭐️', '🎉']

const ICON_GROUPS = [
  { name: 'Getting there', emoji: ['✈️', '🚆', '🚗', '🛳️', '🚐', '🛵', '🚲', '🎒', '🧳', '🗺️', '🧭', '🛎️'] },
  { name: 'Places', emoji: ['🌍', '🌎', '🌏', '🏔️', '🏝️', '🏖️', '🏜️', '🌋', '🗻', '🏞️', '🌅', '🌌', '🏙️', '🌉', '🕌', '⛩️', '🏰', '🗼'] },
  { name: 'Making it', emoji: ['📸', '🎬', '🎥', '🎙️', '💻', '📝', '🎨', '🚁', '🔦', '📱', '🎞️', '✂️'] },
  { name: 'Eating and drinking', emoji: ['🍜', '🍕', '🌮', '🍣', '🥐', '☕️', '🍷', '🍺', '🍹', '🧉', '🍦', '🥘'] },
  { name: 'Doing things', emoji: ['🏄', '🥾', '🧗', '🏂', '🤿', '🚵', '🧘', '⚽️', '🎿', '🎣', '🏊', '🛶'] },
  { name: 'Weather and seasons', emoji: ['☀️', '🌧️', '❄️', '🌪️', '🌈', '🌙', '⛱️', '🍁', '🌸', '🎄', '🎃', '🎆'] },
  { name: 'Odds and ends', emoji: ['🔥', '⭐️', '🎉', '💡', '💬', '❤️', '🤝', '🏆', '💰', '🔑', '🚀', '🦄', '🐧', '🐬', '🐝', '🌻'] },
]

function LookControls({ emoji, accent, onEmoji, onAccent }) {
  const tr = useT()
  const [expanded, setExpanded] = useState(false)
  return (
    <>
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{tr("Pick an icon")}</p>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs font-semibold text-brand transition-transform duration-200 hover:translate-x-0.5"
          >
            <Icon name={expanded ? 'chevronLeft' : 'plus'} className="h-3.5 w-3.5" />
            {expanded ? 'Show fewer' : 'More icons'}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {/* Whatever is currently chosen is always on the shortlist, even if it
              came from the stock set - or picking a custom icon and reopening
              the panel would show nothing selected. */}
          {[...new Set([...SUGGESTED_ICONS, ...(emoji ? [emoji] : [])])].map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onEmoji(emoji === e ? '' : e)}
              aria-pressed={emoji === e}
              className={cx(
                'flex h-9 w-9 items-center justify-center rounded-xl border text-lg transition-transform duration-200 hover:-translate-y-0.5',
                emoji === e ? 'border-brand bg-brand-tint' : 'border-gray-200 bg-white',
              )}
            >
              {e}
            </button>
          ))}
        </div>
        {expanded && (
          <div className="mt-3 max-h-56 overflow-y-auto overscroll-contain rounded-xl border border-gray-100 p-2">
            {ICON_GROUPS.map((g) => (
              <div key={g.name} className="mb-2 last:mb-0">
                <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-smoke">{g.name}</p>
                <div className="grid grid-cols-8 gap-0.5">
                  {g.emoji.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => onEmoji(emoji === e ? '' : e)}
                      aria-pressed={emoji === e}
                      aria-label={`Use ${e} as the group icon`}
                      className={cx(
                        'flex h-8 items-center justify-center rounded-lg text-lg transition-transform duration-150 hover:scale-125',
                        emoji === e && 'bg-brand-tint',
                      )}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">{tr("Colour")}</p>
        <div className="flex flex-wrap gap-2">
          {GROUP_ACCENTS.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => onAccent(a.key)}
              aria-label={a.label}
              aria-pressed={accent === a.key}
              title={a.label}
              className={cx(
                'h-8 w-8 rounded-full transition-transform duration-200 hover:scale-110',
                accent === a.key ? 'ring-2 ring-ink ring-offset-2' : '',
              )}
              style={{ backgroundColor: a.bg }}
            />
          ))}
        </div>
      </div>
    </>
  )
}

/** Start a group: name it, dress it, and pick who gets an invite. */
export function NewGroupModal({ open, onClose, people, connectionIds, myId, onCreated }) {
  const tr = useT()
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState('✈️')
  const [accent, setAccent] = useState('brand')
  const [picked, setPicked] = useState([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)

  // Reset every time it opens. A half-filled form from a group you decided not
  // to make is somebody else's group, waiting to be created by accident.
  useEffect(() => {
    if (!open) return
    setTitle(''); setEmoji('✈️'); setAccent('brand'); setPicked([]); setSearch(''); setBusy(false)
  }, [open])

  // Your connections first, then everybody else. The people you would put in a
  // group are overwhelmingly the people you already know.
  const listed = useMemo(() => {
    const q = search.trim().toLowerCase()
    return people
      .filter((p) => p.id !== myId && (!q || (p.name || '').toLowerCase().includes(q)))
      .sort((a, b) => (connectionIds.has(b.id) ? 1 : 0) - (connectionIds.has(a.id) ? 1 : 0))
      .slice(0, 60)
  }, [people, search, connectionIds, myId])

  const toggle = (id) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  async function create() {
    if (busy) return
    setBusy(true)
    const { id, error } = await createGroup({ ownerId: myId, title, emoji, accent, inviteIds: picked })
    setBusy(false)
    if (!id) { notice(error || 'The group could not be created.'); return }
    if (error) notice(`The group was made, but the invites did not send: ${error}`)
    onCreated?.(id)
  }

  return (
    <Modal open={open} onClose={onClose} title={tr("New group")}>
      <div className="space-y-5">
        <div>
          <label htmlFor="group-name" className="mb-2 block text-sm font-semibold">{tr("Name it")}</label>
          <input
            id="group-name"
            className="input text-base sm:text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={tr("Lisbon crew")}
            maxLength={60}
          />
        </div>

        <LookControls emoji={emoji} accent={accent} onEmoji={setEmoji} onAccent={setAccent} />

        <div>
          <p className="mb-2 text-sm font-semibold">
            Who is in it?
            {picked.length > 0 && <span className="ml-2 font-normal text-smoke">{picked.length} invited</span>}
          </p>
          {/* THEY ARE INVITED, NOT ADDED. Being dropped into a group without
              being asked is the fastest way to make somebody mute the product,
              so this sends an invite and they choose. */}
          <p className="mb-2 text-xs text-smoke">
            {tr("They get an invite in their messages and join when they accept.")}
          </p>
          <input
            className="input mb-2 !py-2 text-base sm:text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr("Search creators…")}
            aria-label={tr("Search creators to invite")}
          />
          <div className="max-h-56 space-y-0.5 overflow-y-auto overscroll-contain">
            {listed.map((p) => (
              <PersonToggle
                key={p.id}
                person={p}
                on={picked.includes(p.id)}
                onToggle={toggle}
                hint={connectionIds.has(p.id) ? 'Connected' : null}
              />
            ))}
            {listed.length === 0 && <p className="px-3 py-4 text-sm text-smoke">{tr("Nobody matches that.")}</p>}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={create} disabled={busy} className="btn-primary disabled:opacity-50">
            {busy ? <Spinner /> : 'Create group'}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">{tr("Cancel")}</button>
        </div>
      </div>
    </Modal>
  )
}

/** Run a group: rename it, restyle it, invite more people, leave, or end it. */
export function GroupSettingsModal({
  open, onClose, conversation, members, invites = [], myId, people, connectionIds, onChanged, onLeft,
}) {
  const tr = useT()
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState('')
  const [accent, setAccent] = useState('brand')
  const [picked, setPicked] = useState([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !conversation) return
    setTitle(conversation.title || '')
    setEmoji(conversation.emoji || '')
    setAccent(conversation.accent || 'brand')
    setPicked([]); setSearch(''); setBusy(false)
  }, [open, conversation])

  const isOwner = conversation?.created_by === myId
  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members])
  const invitedIds = useMemo(() => new Set(invites.map((i) => i.invited_profile_id)), [invites])

  const listed = useMemo(() => {
    const q = search.trim().toLowerCase()
    return people
      .filter((p) => p.id !== myId && !memberIds.has(p.id) && !invitedIds.has(p.id))
      .filter((p) => !q || (p.name || '').toLowerCase().includes(q))
      .sort((a, b) => (connectionIds.has(b.id) ? 1 : 0) - (connectionIds.has(a.id) ? 1 : 0))
      .slice(0, 40)
  }, [people, search, memberIds, invitedIds, connectionIds, myId])

  const dirty =
    (conversation?.title || '') !== title
    || (conversation?.emoji || '') !== emoji
    || (conversation?.accent || 'brand') !== accent

  async function save() {
    setBusy(true)
    const { error } = await updateGroup(conversation.id, {
      title: title.trim() || null,
      emoji: emoji || null,
      accent,
    })
    setBusy(false)
    if (error) { notice(error); return }
    onChanged?.()
  }

  async function invite() {
    if (!picked.length) return
    setBusy(true)
    const { error } = await inviteToGroup(conversation.id, picked, myId)
    setBusy(false)
    if (error) { notice(error); return }
    setPicked([])
    onChanged?.()
  }

  async function kick(profileId, name) {
    if (!await confirm(`Remove ${name || 'this creator'} from the group?`)) return
    const { error } = await removeMember(conversation.id, profileId)
    if (error) { notice(error); return }
    onChanged?.()
  }

  async function leave() {
    // Leaving is not deleting, and the difference matters enough to say out
    // loud: the group carries on without you.
    if (!await confirm('Leave this group? The conversation carries on without you.')) return
    const { error } = await leaveGroup(conversation.id, myId)
    if (error) { notice(error); return }
    onLeft?.()
  }

  async function end() {
    if (!await confirm('Delete this group for everybody? Every message in it goes too.')) return
    const { error } = await deleteGroup(conversation.id)
    if (error) { notice(error); return }
    onLeft?.()
  }

  if (!conversation) return null

  return (
    <Modal open={open} onClose={onClose} title={tr("Group settings")}>
      <div className="space-y-5">
        <div>
          <label htmlFor="group-rename" className="mb-2 block text-sm font-semibold">{tr("Name")}</label>
          <input
            id="group-rename"
            className="input text-base sm:text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={groupName(conversation, members, myId)}
            maxLength={60}
          />
        </div>

        <LookControls emoji={emoji} accent={accent} onEmoji={setEmoji} onAccent={setAccent} />

        {dirty && (
          <button type="button" onClick={save} disabled={busy} className="btn-primary disabled:opacity-50">
            {busy ? <Spinner /> : 'Save changes'}
          </button>
        )}

        <div className="border-t border-gray-100 pt-5">
          <p className="mb-2 text-sm font-semibold">
            {tr("In the group")} <span className="font-normal text-smoke">{members.length}</span>
          </p>
          <div className="space-y-0.5">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-xl px-3 py-2">
                <Avatar src={m.photo_url} name={m.name} size="sm" />
                <Link to={`/profile/${m.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-brand">
                  {m.name}
                </Link>
                {m.id === conversation.created_by && (
                  <span className="shrink-0 rounded-full bg-cloud px-2 py-0.5 text-[10px] font-semibold text-smoke">{tr("Owner")}</span>
                )}
                {isOwner && m.id !== myId && (
                  <button type="button" onClick={() => kick(m.id, m.name)} aria-label={`Remove ${m.name}`}
                    className="shrink-0 rounded-full p-1.5 text-smoke transition-colors hover:bg-red-50 hover:text-red-500">
                    <Icon name="close" className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {invites.length > 0 && (
            <p className="mt-2 px-3 text-xs text-smoke">
              {invites.length} invite{invites.length === 1 ? '' : 's'} still waiting to be accepted.
            </p>
          )}
        </div>

        <div className="border-t border-gray-100 pt-5">
          <p className="mb-2 text-sm font-semibold">{tr("Invite more people")}</p>
          <input
            className="input mb-2 !py-2 text-base sm:text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr("Search creators…")}
            aria-label={tr("Search creators to invite")}
          />
          <div className="max-h-48 space-y-0.5 overflow-y-auto overscroll-contain">
            {listed.map((p) => (
              <PersonToggle
                key={p.id}
                person={p}
                on={picked.includes(p.id)}
                onToggle={(id) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))}
                hint={connectionIds.has(p.id) ? 'Connected' : null}
              />
            ))}
            {listed.length === 0 && <p className="px-3 py-3 text-sm text-smoke">{tr("Everybody matching is already here.")}</p>}
          </div>
          {picked.length > 0 && (
            <button type="button" onClick={invite} disabled={busy} className="btn-secondary mt-3 disabled:opacity-50">
              Send {picked.length} invite{picked.length === 1 ? '' : 's'}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-5">
          <button type="button" onClick={leave} className="btn-ghost !text-red-600">{tr("Leave group")}</button>
          {isOwner && (
            <button type="button" onClick={end} className="btn-ghost !text-red-600">{tr("Delete for everyone")}</button>
          )}
        </div>
      </div>
    </Modal>
  )
}
