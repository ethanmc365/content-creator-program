import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { confirm } from '../../lib/confirm'
import { PageHeader, Skeleton, EmptyState } from '../../components/ui'
import Icon from '../../components/Icon'
import RichEditable from '../../components/RichEditable'
import RichToolbar from '../../components/RichToolbar'
import NoteGlyph, { NOTE_GLYPH_KEYS, DEFAULT_GLYPH } from '../../components/NoteGlyph'
import { cx, timeAgo } from '../../lib/utils'
import { noteExcerpt } from '../../lib/noteMarkdown'

// A private, Notion-lite notes space for the Tryp.com Team. The grid shows note
// cards you can reorder by dragging; opening a card gives ONE clean page you type
// straight into - headings, bold and lists render as themselves (no # ** *
// markers), and copying a section gives clean text you can paste as an
// announcement. Admin-only (route + RLS).

// Toolbar: each button drives the contentEditable via the editor's imperative
// handle. Kept flat and simple - the surface itself renders the formatting.
export default function AdminNotes() {
  const { user, profile } = useAuth()
  const [notes, setNotes] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved
  const [emojiOpen, setEmojiOpen] = useState(false)
  const saveTimer = useRef(null)
  const editorRef = useRef(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('admin_notes')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    setNotes(data ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const active = notes?.find((n) => n.id === activeId) || null

  // Yours - shared or not - and everybody else's shared ones. RLS already means
  // an unshared note by somebody else never arrives here at all.
  const mine = (notes ?? []).filter((n) => n.created_by === user?.id)
  const theirs = (notes ?? []).filter((n) => n.created_by !== user?.id)

  // Who wrote a shared note. Names come from the team list rather than a join,
  // because there are a handful of admins and this saves a query per render.
  const [team, setTeam] = useState({})
  useEffect(() => {
    supabase.from('profiles').select('id, name').eq('is_admin', true)
      .then(({ data }) => setTeam(Object.fromEntries((data ?? []).map((p) => [p.id, p.name]))))
  }, [])
  const authorName = (id) => team[id] ?? 'A colleague'

  async function createNote() {
    const maxOrder = notes?.length ? Math.max(...notes.map((n) => n.sort_order)) : 0
    const { data } = await supabase
      .from('admin_notes')
      .insert({ title: 'Untitled', body: '', emoji: DEFAULT_GLYPH, sort_order: maxOrder + 1, created_by: user.id, shared: false })
      .select('*')
      .single()
    if (data) { setNotes((prev) => [...(prev || []), data]); setActiveId(data.id) }
  }

  // Debounced autosave of the open note. Local state updates immediately; the DB
  // write is coalesced so a burst of typing is one round-trip.
  const patchActive = useCallback((patch) => {
    setNotes((prev) => prev.map((n) => (n.id === activeId ? { ...n, ...patch } : n)))
    setSaveState('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await supabase.from('admin_notes').update(patch).eq('id', activeId)
      setSaveState('saved')
    }, 600)
  }, [activeId])

  // ONLY THE AUTHOR, OR THE PROGRAMME LEAD.
  //
  // Anybody on the team can EDIT a shared note - that is what sharing it is for
  // - but removing somebody else's work is different in kind from improving it,
  // and there is no undo. The database enforces the same rule; this is so the
  // button is not offered when it would only fail.
  const isLead = profile?.platform_role === 'owner'
  const canDelete = (n) => !!n && (n.created_by === user?.id || isLead)

  async function deleteNote(id) {
    if (!await confirm('Delete this note? This cannot be undone.')) return
    setNotes((prev) => prev.filter((n) => n.id !== id))
    if (activeId === id) setActiveId(null)
    await supabase.from('admin_notes').delete().eq('id', id)
  }

  // Drag-to-reorder (desktop). Splice into the new position, renumber, persist.
  function handleDrop(targetId) {
    setOverId(null)
    if (!dragId || dragId === targetId) { setDragId(null); return }
    const arr = [...notes]
    const from = arr.findIndex((n) => n.id === dragId)
    const to = arr.findIndex((n) => n.id === targetId)
    const [moved] = arr.splice(from, 1)
    arr.splice(to, 0, moved)
    const renumbered = arr.map((n, i) => ({ ...n, sort_order: i }))
    setNotes(renumbered)
    setDragId(null)
    renumbered.forEach((n, i) => supabase.from('admin_notes').update({ sort_order: i }).eq('id', n.id).then(() => {}))
  }


  // ---------------------------------------------------------------- Editor
  if (active) {
    return (
      <div className="page max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <button onClick={() => setActiveId(null)} className="inline-flex items-center gap-1 text-sm font-medium text-smoke hover:text-brand">
            <Icon name="chevronLeft" className="h-4 w-4" /> All notes
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''}
            </span>

            {/* SHARING IS A SWITCH, NOT A COPY. The note stays where it is and
                becomes visible to the team - so the version they read is the one
                you keep editing, rather than a snapshot that goes stale the
                moment you change your mind. */}
            <button
              onClick={() => patchActive({ shared: !active.shared })}
              aria-pressed={!!active.shared}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200',
                active.shared
                  ? 'border-brand bg-brand-tint text-brand'
                  : 'border-gray-200 text-smoke hover:border-brand hover:text-brand',
              )}
            >
              <Icon name={active.shared ? 'users' : 'key'} className="h-3.5 w-3.5" />
              {active.shared ? 'Shared with the team' : 'Private'}
            </button>

            {canDelete(active) && (
              <button onClick={() => deleteNote(active.id)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-smoke transition-colors hover:bg-red-50 hover:text-red-600">
                <Icon name="trash" className="h-4 w-4" /> Delete
              </button>
            )}
          </div>
        </div>

        {/* Glyph + title */}
        <div className="mb-4 flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setEmojiOpen((o) => !o)}
              aria-label="Change note icon"
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-tint transition-transform hover:-translate-y-0.5"
            >
              <NoteGlyph name={active.emoji} className="h-7 w-7" />
            </button>
            {emojiOpen && (
              <>
                <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setEmojiOpen(false)} />
                <div className="absolute left-0 top-full z-20 mt-1 grid w-56 grid-cols-6 gap-1 rounded-card border border-gray-100 bg-white p-2 shadow-lift">
                  {NOTE_GLYPH_KEYS.map((key) => (
                    <button
                      key={key}
                      onClick={() => { patchActive({ emoji: key }); setEmojiOpen(false) }}
                      className={cx('flex h-8 w-8 items-center justify-center rounded-lg hover:bg-cloud', active.emoji === key && 'bg-brand-tint')}
                    >
                      <NoteGlyph name={key} className="h-6 w-6" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <input
            value={active.title}
            onChange={(e) => patchActive({ title: e.target.value })}
            placeholder="Untitled"
            aria-label="Note title"
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-3xl font-bold tracking-tight text-ink outline-none placeholder:text-gray-300 focus:ring-0"
          />
        </div>

        {/* The shared bar. It lights the buttons that are ON, which this page
            never did - a toolbar with no active state tells you what you could
            do and never what you are doing. */}
        <RichToolbar editorRef={editorRef} sticky />

        {/* The one clean writing surface. */}
        <RichEditable
          ref={editorRef}
          docId={active.id}
          initialMd={active.body || ''}
          onChangeMd={(md) => patchActive({ body: md })}
          placeholder="Start writing…"
          className="min-h-[60vh] rounded-card border border-gray-100 bg-white px-6 py-5 text-[15px] leading-relaxed focus:border-brand/40"
        />
      </div>
    )
  }

  // ---------------------------------------------------------------- Grid
  return (
    <div className="page">
      <PageHeader
        back="/admin"
        title="Notes"
        action={<button onClick={createNote} className="btn-primary">+ New note</button>}
      />

      {notes === null ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44" />)}</div>
      ) : notes.length === 0 ? (
        <EmptyState
          icon={<Icon name="book" className="h-7 w-7" />}
          title="No notes yet"
          hint="Create your first note, for example a bank of weekly questions to post in the community chat."
          action={<button onClick={createNote} className="btn-primary">+ New note</button>}
        />
      ) : (
        <>
        {/* YOURS FIRST, THEN THE TEAM'S.
            A shared note and a private one are not the same object: one is
            something you are thinking about, the other is something you have put
            in front of people. Mixing them in one grid means every card has to
            be read to know which it is. Two sections, and the badge on a shared
            card is a reminder rather than the only signal. */}
        {mine.length > 0 && (
        <div className="mb-10">
          <h2 className="mb-4 text-lg font-semibold">Your notes</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {mine.map((n) => (
            <div
              key={n.id}
              draggable
              onDragStart={() => setDragId(n.id)}
              onDragEnd={() => { setDragId(null); setOverId(null) }}
              onDragOver={(e) => { e.preventDefault(); if (overId !== n.id) setOverId(n.id) }}
              onDrop={() => handleDrop(n.id)}
              onClick={() => setActiveId(n.id)}
              className={cx(
                'card group relative flex cursor-pointer flex-col !p-6 transition-all hover:-translate-y-0.5 hover:shadow-lift',
                dragId === n.id && 'opacity-40',
                overId === n.id && dragId && dragId !== n.id && 'ring-2 ring-brand'
              )}
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-tint">
                  <NoteGlyph name={n.emoji} className="h-6 w-6" />
                </span>
                <span className="flex items-center gap-1">
                  <Icon name="grip" className="h-4 w-4 cursor-grab text-gray-300 opacity-0 transition-opacity group-hover:opacity-100" />
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteNote(n.id) }}
                    aria-label="Delete note"
                    className="rounded-lg p-1 text-gray-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                </span>
              </div>
              <h2 className="font-semibold text-ink group-hover:text-brand">{n.title || 'Untitled'}</h2>
              <p className="mt-1.5 line-clamp-3 flex-1 text-sm text-smoke">{noteExcerpt(n.body) || 'Empty note'}</p>
              <p className="mt-4 text-[11px] text-gray-400">Updated {timeAgo(n.updated_at)}</p>
            </div>
          ))}
          </div>
        </div>
        )}

        {theirs.length > 0 && (
          <div>
            <h2 className="mb-1 text-lg font-semibold">Shared with the team</h2>
            <p className="mb-4 text-sm text-smoke">
              Anybody on the team can edit these. Only the person who wrote one can remove it.
            </p>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {theirs.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setActiveId(n.id)}
                  className="card group flex flex-col !p-6 text-left transition-all hover:-translate-y-0.5 hover:shadow-lift"
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-tint">
                      <NoteGlyph name={n.emoji} className="h-6 w-6" />
                    </span>
                    <span className="rounded-full bg-cloud px-2 py-0.5 text-[10px] font-semibold text-smoke">
                      {authorName(n.created_by)}
                    </span>
                  </div>
                  <h2 className="font-semibold text-ink group-hover:text-brand">{n.title || 'Untitled'}</h2>
                  <p className="mt-1 line-clamp-3 text-sm text-smoke">{noteExcerpt(n.body)}</p>
                  <p className="mt-auto pt-3 text-[11px] text-gray-400">Edited {timeAgo(n.updated_at || n.created_at)}</p>
                </button>
              ))}
            </div>
          </div>
        )}
        </>
      )}
    </div>
  )
}
