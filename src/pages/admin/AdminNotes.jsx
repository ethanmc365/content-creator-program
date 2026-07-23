import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { confirm, promptText } from '../../lib/confirm'
import { PageHeader, Skeleton, EmptyState } from '../../components/ui'
import Icon from '../../components/Icon'
import RichEditable from '../../components/RichEditable'
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
  const { user } = useAuth()
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

  async function createNote() {
    const maxOrder = notes?.length ? Math.max(...notes.map((n) => n.sort_order)) : 0
    const { data } = await supabase
      .from('admin_notes')
      .insert({ title: 'Untitled', body: '', emoji: DEFAULT_GLYPH, sort_order: maxOrder + 1, created_by: user.id })
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

  // Toolbar: pure data + one stable handler. Ref access happens only inside
  // runTool (an event handler), never during render.
  const TOOLBAR = [
    { label: 'H1', title: 'Heading 1', act: 'h1' },
    { label: 'H2', title: 'Heading 2', act: 'h2' },
    { label: 'H3', title: 'Heading 3', act: 'h3' },
    { sep: true },
    { label: 'B', title: 'Bold', cls: 'font-bold', act: 'bold' },
    { label: 'I', title: 'Italic', cls: 'italic', act: 'italic' },
    { icon: 'link', title: 'Link', act: 'link' },
    { sep: true },
    { label: '•', title: 'Bullet list', act: 'ul' },
    { label: '1.', title: 'Numbered list', act: 'ol' },
    { label: '☑', title: 'Checklist', act: 'check' },
    { label: '❝', title: 'Quote', act: 'quote' },
    { label: '—', title: 'Divider', act: 'divider' },
  ]

  async function runTool(act) {
    const ed = editorRef.current
    if (!ed) return
    const curBlock = () => (document.queryCommandValue('formatBlock') || '').toLowerCase()
    const setBlock = (tag) => ed.exec('formatBlock', curBlock() === tag ? 'p' : tag)
    // A list/quote/divider applied while the caret sits in a heading would nest
    // inside it; drop back to a paragraph first so we get clean sibling blocks.
    const unheading = () => { if (/^h[1-3]$/.test(curBlock())) ed.exec('formatBlock', 'p') }
    switch (act) {
      case 'h1': case 'h2': case 'h3': return setBlock(act)
      case 'quote': return setBlock('blockquote')
      case 'bold': case 'italic': return ed.exec(act)
      case 'ul': unheading(); return ed.exec('insertUnorderedList')
      case 'ol': unheading(); return ed.exec('insertOrderedList')
      case 'check': unheading(); return ed.insertHtml('<ul data-check="1"><li data-checked="0">To do</li></ul>')
      case 'divider': unheading(); return ed.insertHtml('<hr><p><br></p>')
      case 'link': {
        // Capture the selection now, before the modal takes focus (toolbar
        // buttons preventDefault on mousedown, so the caret is still in the note).
        const sel = window.getSelection()
        const saved = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null
        const hasText = saved && !saved.collapsed
        const url = await promptText('Paste or type the web address to link.', {
          title: 'Add a link',
          placeholder: 'https://…',
          confirmLabel: 'Add link',
          inputType: 'url',
        })
        if (!url) return
        const href = (/^https?:\/\//i.test(url) ? url : `https://${url}`).replace(/"/g, '%22')
        // Put the caret/selection back into the note, then apply.
        ed.el?.()?.focus()
        if (saved) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(saved) }
        if (hasText) ed.exec('createLink', href)
        else ed.insertHtml(`<a href="${href}">${href}</a>&nbsp;`)
        return
      }
      default: return
    }
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
            <button onClick={() => deleteNote(active.id)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-smoke transition-colors hover:bg-red-50 hover:text-red-600">
              <Icon name="trash" className="h-4 w-4" /> Delete
            </button>
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

        {/* Formatting toolbar */}
        <div className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-1 rounded-xl border border-gray-100 bg-white/90 p-1.5 backdrop-blur">
          {TOOLBAR.map((t, i) =>
            t.sep ? (
              <span key={`s${i}`} className="mx-1 h-5 w-px bg-gray-200" />
            ) : (
              <button
                key={t.title}
                title={t.title}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runTool(t.act)}
                className={cx('flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm text-ink transition-colors hover:bg-cloud', t.cls)}
              >
                {t.icon ? <Icon name={t.icon} className="h-4 w-4" /> : t.label}
              </button>
            )
          )}
        </div>

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
      )}
    </div>
  )
}
