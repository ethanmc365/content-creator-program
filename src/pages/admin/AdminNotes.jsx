import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { confirm } from '../../lib/confirm'
import { PageHeader, Skeleton, EmptyState } from '../../components/ui'
import Icon from '../../components/Icon'
import { cx, timeAgo } from '../../lib/utils'
import { renderNote, noteExcerpt } from '../../lib/noteMarkdown'

// A private, Notion-lite notes space for the Tryp.com Team. The grid shows note
// cards you can reorder by dragging; opening a card gives a full editor with a
// formatting toolbar and a live preview. Admin-only (route + RLS). Great for a
// bank of "Weekly questions" to drop into the community chat.
const EMOJIS = ['📝', '❓', '💡', '📌', '🎯', '🗓️', '🔥', '✅', '📣', '🌍', '✈️', '⭐']

// Pure text transforms for the formatting toolbar. Each takes (value, selStart,
// selEnd) and returns the new value plus where to put the caret. Kept at module
// scope (no refs, no state) so the toolbar buttons stay render-safe.
const wrapT = (before, after) => (v, s, e) => {
  const sel = v.slice(s, e)
  return { value: v.slice(0, s) + before + sel + after + v.slice(e), selStart: s + before.length, selEnd: s + before.length + sel.length }
}
const prefixT = (prefix) => (v, s) => {
  const ls = v.lastIndexOf('\n', s - 1) + 1
  return { value: v.slice(0, ls) + prefix + v.slice(ls), selStart: s + prefix.length, selEnd: s + prefix.length }
}
const insertT = (text) => (v, s, e) => {
  const pos = s + text.length
  return { value: v.slice(0, s) + text + v.slice(e), selStart: pos, selEnd: pos }
}
const TOOLBAR = [
  { label: 'H1', title: 'Heading 1', run: prefixT('# ') },
  { label: 'H2', title: 'Heading 2', run: prefixT('## ') },
  { label: 'H3', title: 'Heading 3', run: prefixT('### ') },
  { label: 'B', title: 'Bold', cls: 'font-bold', run: wrapT('**', '**') },
  { label: 'I', title: 'Italic', cls: 'italic', run: wrapT('*', '*') },
  { label: '•', title: 'Bullet list', run: prefixT('- ') },
  { label: '1.', title: 'Numbered list', run: prefixT('1. ') },
  { label: '☑', title: 'Checklist', run: prefixT('- [ ] ') },
  { label: '❝', title: 'Quote', run: prefixT('> ') },
  { label: '—', title: 'Divider', run: insertT('\n---\n') },
  { label: '</>', title: 'Code', cls: 'font-mono text-[11px]', run: wrapT('`', '`') },
]

export default function AdminNotes() {
  const { user } = useAuth()
  const [notes, setNotes] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved
  const [preview, setPreview] = useState('edit') // mobile toggle: edit | preview
  const saveTimer = useRef(null)
  const taRef = useRef(null)
  const pendingSel = useRef(null)

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

  // Restore the caret after a toolbar edit (the textarea is controlled, so the
  // selection has to be reapplied once React re-renders the new value).
  useEffect(() => {
    if (pendingSel.current && taRef.current) {
      const [s, e] = pendingSel.current
      pendingSel.current = null
      taRef.current.focus()
      taRef.current.setSelectionRange(s, e)
    }
  })

  async function createNote() {
    const maxOrder = notes?.length ? Math.max(...notes.map((n) => n.sort_order)) : 0
    const { data } = await supabase
      .from('admin_notes')
      .insert({ title: 'Untitled', body: '', emoji: '📝', sort_order: maxOrder + 1, created_by: user.id })
      .select('*')
      .single()
    if (data) { setNotes((prev) => [...(prev || []), data]); setActiveId(data.id); setPreview('edit') }
  }

  // Debounced autosave of the open note.
  function patchActive(patch) {
    setNotes((prev) => prev.map((n) => (n.id === activeId ? { ...n, ...patch } : n)))
    setSaveState('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await supabase.from('admin_notes').update(patch).eq('id', activeId)
      setSaveState('saved')
    }, 600)
  }

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

  // Run a toolbar transform against the live textarea selection. Ref access
  // happens here inside a click handler (never during render).
  function runTool(tool) {
    const ta = taRef.current
    if (!ta || !active) return
    const { value, selStart, selEnd } = tool.run(active.body, ta.selectionStart, ta.selectionEnd)
    pendingSel.current = [selStart, selEnd]
    patchActive({ body: value })
  }

  // ---------------------------------------------------------------- Editor
  if (active) {
    return (
      <div className="page max-w-4xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <button onClick={() => setActiveId(null)} className="inline-flex items-center gap-1 text-sm font-medium text-smoke hover:text-brand">
            <Icon name="chevronLeft" className="h-4 w-4" /> All notes
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''}
            </span>
            <button onClick={() => deleteNote(active.id)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-smoke transition-colors hover:bg-red-50 hover:text-red-600">
              <Icon name="trash" className="h-4 w-4" /> Delete
            </button>
          </div>
        </div>

        {/* Emoji + title */}
        <div className="mb-4 flex items-center gap-3">
          <div className="group relative">
            <button className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-tint text-2xl leading-none">{active.emoji || '📝'}</button>
            <div className="absolute left-0 top-full z-20 mt-1 hidden w-56 grid-cols-6 gap-1 rounded-card border border-gray-100 bg-white p-2 shadow-lift group-hover:grid">
              {EMOJIS.map((em) => (
                <button key={em} onClick={() => patchActive({ emoji: em })} className="flex h-8 w-8 items-center justify-center rounded-lg text-lg hover:bg-cloud">{em}</button>
              ))}
            </div>
          </div>
          <input
            value={active.title}
            onChange={(e) => patchActive({ title: e.target.value })}
            placeholder="Untitled"
            aria-label="Note title"
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-3xl font-bold tracking-tight text-ink outline-none placeholder:text-gray-300 focus:ring-0"
          />
        </div>

        {/* Formatting toolbar */}
        <div className="mb-3 flex flex-wrap items-center gap-1 rounded-xl border border-gray-100 bg-cloud/50 p-1.5">
          {TOOLBAR.map((t) => (
            <button key={t.title} title={t.title} onClick={() => runTool(t)} className={cx('flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm text-ink transition-colors hover:bg-white hover:shadow-card', t.cls)}>
              {t.label}
            </button>
          ))}
          {/* Mobile edit/preview toggle */}
          <div className="ml-auto flex rounded-lg bg-white p-0.5 lg:hidden">
            <button onClick={() => setPreview('edit')} className={cx('rounded-md px-2.5 py-1 text-xs font-medium', preview === 'edit' ? 'bg-brand text-white' : 'text-smoke')}>Write</button>
            <button onClick={() => setPreview('preview')} className={cx('rounded-md px-2.5 py-1 text-xs font-medium', preview === 'preview' ? 'bg-brand text-white' : 'text-smoke')}>Preview</button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <textarea
            ref={taRef}
            value={active.body}
            onChange={(e) => patchActive({ body: e.target.value })}
            placeholder={"Start writing…\n\n# A heading\n- a bullet\n- [ ] a to-do\n\nUse the toolbar above for formatting."}
            className={cx('min-h-[60vh] w-full resize-none rounded-card border border-gray-100 bg-white p-6 font-mono text-sm leading-relaxed text-ink outline-none focus:border-brand/40', preview === 'preview' && 'hidden lg:block')}
            aria-label="Note body"
          />
          <div className={cx('min-h-[60vh] overflow-y-auto rounded-card border border-gray-100 bg-white p-6', preview === 'edit' && 'hidden lg:block')}>
            {active.body.trim()
              ? renderNote(active.body)
              : <p className="text-sm text-gray-300">Nothing to preview yet.</p>}
          </div>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------- Grid
  return (
    <div className="page">
      <PageHeader
        title="Notes"
        subtitle="A private space for the Tryp.com Team. Keep a bank of weekly questions, plans and playbooks. Drag cards to reorder."
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
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((n) => (
            <div
              key={n.id}
              draggable
              onDragStart={() => setDragId(n.id)}
              onDragEnd={() => { setDragId(null); setOverId(null) }}
              onDragOver={(e) => { e.preventDefault(); if (overId !== n.id) setOverId(n.id) }}
              onDrop={() => handleDrop(n.id)}
              onClick={() => { setActiveId(n.id); setPreview('preview') }}
              className={cx(
                'card group relative flex cursor-pointer flex-col !p-6 transition-all hover:-translate-y-0.5 hover:shadow-lift',
                dragId === n.id && 'opacity-40',
                overId === n.id && dragId && dragId !== n.id && 'ring-2 ring-brand'
              )}
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-tint text-xl leading-none">{n.emoji || '📝'}</span>
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
      )}
    </div>
  )
}
