import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { EmptyState, Modal, PageHeader, Skeleton, Spinner, Toggle } from '../components/ui'
import Icon from '../components/Icon'
import Segmented from '../components/network/Segmented'
import RichEditable from '../components/RichEditable'
import RichToolbar from '../components/RichToolbar'
import { TranslateButton } from '../components/TranslateText'
import { confirm, notice } from '../lib/confirm'
import { toastSuccess } from '../lib/toast'
import { renderNote } from '../lib/noteMarkdown'
import { useTranslateOnDemand } from '../lib/quickTranslate'
import { cx } from '../lib/utils'
import { useLocale, useT } from '../lib/i18n'

// WHAT'S NEW (6 Oct 2026).
//
// Ethan: "a page to share all the updates ... all the new features, improvements, every time they do this ... in the profile
// dropdown, right above the get help button ... clean UI and animations ... I should be able to edit them and add new notes when
// there are new features. Ensure you use the heading tools, bold, bullet points etc."
//
// So: a timeline, newest first, grouped by month. Every card is a title and one line; pressing it opens the write-up (headings, bold,
// bullets - the same markdown the notes and the resource library use). The team writes and edits them here with the same formatting
// toolbar, hides one without deleting it, and puts the date on it, so an old update can be written up after the fact.
export const SEEN_KEY = 'tryp_updates_seen_v1'

const KINDS = {
  new: { label: 'New', cls: 'bg-brand text-white' },
  improved: { label: 'Improved', cls: 'bg-ink text-white' },
  fixed: { label: 'Fixed', cls: 'bg-cloud text-ink' },
}
// A short list of glyphs the editor offers; every one exists in Icon.jsx.
const ICONS = ['sparkles', 'star', 'trophy', 'globe', 'language', 'chat', 'bell', 'chart', 'plane', 'video', 'money', 'ticket', 'calendar', 'pin', 'bulb', 'shield', 'users', 'fire', 'image', 'briefcase']

const today = () => new Date().toISOString().slice(0, 10)
const dayLabel = (iso, locale) => { try { return new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) } catch { return iso } }
const monthLabel = (iso, locale) => { try { return new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }) } catch { return iso.slice(0, 7) } }

export function rememberUpdatesSeen(latest) {
  try { if (latest) { localStorage.setItem(SEEN_KEY, latest); window.dispatchEvent(new Event('tryp:updates-seen')) } } catch { /* private mode */ }
}

export default function Updates() {
  const tr = useT()
  const locale = useLocale()
  const { isAdmin, profile } = useAuth()
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [edit, setEdit] = useState(null) // {} for a new one, a row to edit
  const [open, setOpen] = useState(() => new Set())
  const [seenThen] = useState(() => { try { return localStorage.getItem(SEEN_KEY) || '' } catch { return '' } })

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('app_updates').select('*').order('published_on', { ascending: false }).order('created_at', { ascending: false })
    if (e) { setError(e.message); setRows([]); return }
    setError('')
    setRows(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  // The newest one opens itself, and the menu's dot goes out once the page has been seen.
  const firstId = rows?.find((r) => r.published)?.id
  useEffect(() => {
    if (!rows?.length) return
    if (firstId) setOpen((s) => (s.size ? s : new Set([firstId])))
    const latest = rows.filter((r) => r.published).map((r) => `${r.published_on}|${r.id}`).sort().pop()
    rememberUpdatesSeen(latest)
  }, [rows, firstId])

  const groups = useMemo(() => {
    const out = []
    for (const r of rows || []) {
      const key = r.published_on.slice(0, 7)
      const last = out[out.length - 1]
      if (last?.key === key) last.items.push(r); else out.push({ key, label: monthLabel(r.published_on, locale), items: [r] })
    }
    return out
  }, [rows, locale])

  const toggle = (id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  async function remove(r) {
    if (!await confirm(tr('Delete this update for good? Hide it instead if you might want it back.'), { confirmLabel: tr('Delete'), danger: true })) return
    const { error: e } = await supabase.from('app_updates').delete().eq('id', r.id)
    if (e) { notice(e.message); return }
    toastSuccess(tr('Deleted'))
    load()
  }
  async function setPublished(r, published) {
    const { error: e } = await supabase.from('app_updates').update({ published }).eq('id', r.id)
    if (e) { notice(e.message); return }
    toastSuccess(published ? tr('Showing to everyone') : tr('Hidden from creators'))
    load()
  }

  return (
    <div className="page max-w-3xl">
      <PageHeader
        title={tr("What's new")}
        subtitle={tr('Every new feature and improvement, with the date it arrived.')}
        action={isAdmin ? <button type="button" onClick={() => setEdit({})} className="btn-primary !py-2.5 text-sm"><Icon name="plus" className="h-4 w-4" strokeWidth={2.4} />{tr('New update')}</button> : null}
        inlineAction
      />

      {rows === null ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-card" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Icon name="sparkles" className="h-7 w-7" />} title={error ? tr('Could not load the updates') : tr('Nothing here yet')} hint={error || tr('New features and improvements will be written up here.')} />
      ) : (
        <div className="space-y-9">
          {groups.map((g, gi) => (
            <section key={g.key} aria-label={g.label}>
              <h2 className="sticky top-14 z-10 -mx-1 mb-4 flex items-center gap-3 bg-white/90 px-1 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400 backdrop-blur-sm sm:top-16">
                <span>{g.label}</span>
                <span aria-hidden className="h-px flex-1 bg-gray-100" />
                <span className="rounded-full bg-cloud px-2 py-0.5 text-[10px] tracking-wide text-smoke">{tr('{n} updates', { n: g.items.length })}</span>
              </h2>
              <ol className="relative space-y-3.5 pl-7 sm:pl-9">
                <span aria-hidden className="absolute bottom-3 left-[11px] top-3 w-px bg-gradient-to-b from-brand/50 via-gray-200 to-transparent sm:left-[15px]" />
                {g.items.map((r, i) => (
                  <UpdateCard
                    key={r.id}
                    r={r}
                    delay={Math.min(gi * 4 + i, 10) * 55}
                    open={open.has(r.id)}
                    fresh={r.published && `${r.published_on}|${r.id}` > seenThen && !!seenThen}
                    onToggle={() => toggle(r.id)}
                    admin={isAdmin}
                    onEdit={() => setEdit(r)}
                    onDelete={() => remove(r)}
                    onPublish={(v) => setPublished(r, v)}
                    locale={locale}
                  />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      {edit && <UpdateEditor row={edit} authorId={profile?.id} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </div>
  )
}

function UpdateCard({ r, open, onToggle, delay, fresh, admin, onEdit, onDelete, onPublish, locale }) {
  const tr = useT()
  // Written in English; a reader on another language gets a Translate button inside the write-up.
  const tTitle = useTranslateOnDemand(r.title)
  const tSummary = useTranslateOnDemand(r.summary || '')
  const tBody = useTranslateOnDemand(r.body || '')
  const everyone = [tTitle, tSummary, tBody]
  const busy = everyone.some((t) => t.busy)
  const on = tBody.on
  const kind = KINDS[r.kind] || KINDS.new
  const bodyId = `upd-${r.id}`
  async function flip() {
    // One press translates all three; pressing again puts the original back.
    if (on) { for (const t of everyone) if (t.on) t.toggle(); return }
    for (const t of everyone) if (t.available && !t.on) t.toggle()
  }
  const switchState = { available: tBody.available || tTitle.available, on, busy, same: tBody.same, failed: tBody.failed, toggle: flip }

  return (
    <li className="relative animate-rise" style={{ animationDelay: `${delay}ms` }}>
      {/* the dot on the line */}
      <span aria-hidden className={cx('absolute -left-7 top-5 flex h-[23px] w-[23px] items-center justify-center rounded-full border-2 bg-white transition-colors duration-300 sm:-left-9 sm:h-[31px] sm:w-[31px]', open ? 'border-brand' : 'border-gray-200')}>
        <Icon name={r.icon} className={cx('h-3 w-3 transition-colors duration-300 sm:h-4 sm:w-4', open ? 'text-brand' : 'text-gray-400')} strokeWidth={2.2} />
      </span>
      <article className={cx('overflow-hidden rounded-card border bg-white shadow-card transition-all duration-300', open ? 'border-brand/30 shadow-lift' : 'border-gray-100 hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift', !r.published && 'opacity-70')}>
        <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={bodyId} className="flex w-full items-start gap-3 px-4 py-3.5 text-left sm:px-5 sm:py-4">
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', kind.cls)}>{tr(kind.label)}</span>
              <time dateTime={r.published_on} className="text-[11px] font-semibold text-smoke">{dayLabel(r.published_on, locale)}</time>
              {fresh && <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-brand"><span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/70" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" /></span>{tr('New for you')}</span>}
              {!r.published && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-smoke">{tr('Hidden')}</span>}
            </span>
            <span className="mt-1.5 block text-[16px] font-bold leading-snug text-ink sm:text-[17px]">{tTitle.shown}</span>
            {r.summary && <span className="mt-0.5 block text-sm leading-relaxed text-smoke">{tSummary.shown}</span>}
          </span>
          <Icon name="chevronDown" className={cx('mt-1 h-5 w-5 shrink-0 text-gray-300 transition-transform duration-300', open && 'rotate-180 text-brand')} />
        </button>
        <div id={bodyId} className={cx('grid transition-[grid-template-rows] duration-300 ease-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
          <div className="overflow-hidden">
            <div className={cx('border-t border-gray-100 px-4 pb-4 pt-3 transition-opacity duration-300 sm:px-5', open ? 'opacity-100' : 'opacity-0')}>
              <div className="space-y-1 text-[14.5px] leading-relaxed [&_h3]:!mt-1 [&_h3]:!text-[15px] [&_h3]:!font-bold [&_h4]:!text-[14px]">{renderNote(tBody.shown || '')}</div>
              {switchState.available && <TranslateButton t={switchState} />}
              {admin && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-3">
                  <button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-full bg-cloud px-3 py-1.5 text-xs font-semibold text-ink transition-transform hoverable:hover:scale-105"><Icon name="pencil" className="h-3.5 w-3.5 text-brand" />{tr('Edit')}</button>
                  <button type="button" onClick={() => onPublish(!r.published)} className="inline-flex items-center gap-1.5 rounded-full bg-cloud px-3 py-1.5 text-xs font-semibold text-ink transition-transform hoverable:hover:scale-105"><Icon name="eye" className="h-3.5 w-3.5 text-brand" />{r.published ? tr('Hide') : tr('Show')}</button>
                  <button type="button" onClick={onDelete} className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full text-smoke transition-colors hoverable:hover:bg-red-50 hoverable:hover:text-red-500" aria-label={tr('Delete')}><Icon name="trash" className="h-4 w-4" /></button>
                </div>
              )}
            </div>
          </div>
        </div>
      </article>
    </li>
  )
}

function UpdateEditor({ row, authorId, onClose, onSaved }) {
  const tr = useT()
  const editing = !!row.id
  const [title, setTitle] = useState(row.title || '')
  const [summary, setSummary] = useState(row.summary || '')
  const [body, setBody] = useState(row.body || '')
  const [kind, setKind] = useState(row.kind || 'new')
  const [icon, setIcon] = useState(row.icon || 'sparkles')
  const [date, setDate] = useState(row.published_on || today())
  const [published, setPublished] = useState(row.published ?? true)
  const [busy, setBusy] = useState(false)
  const editor = useRef(null)

  async function save() {
    if (!title.trim()) { notice(tr('Give the update a title.')); return }
    setBusy(true)
    const payload = { title: title.trim(), summary: summary.trim() || null, body, kind, icon, published_on: date, published }
    const { error } = editing
      ? await supabase.from('app_updates').update(payload).eq('id', row.id)
      : await supabase.from('app_updates').insert({ ...payload, created_by: authorId })
    setBusy(false)
    if (error) { notice(error.message); return }
    toastSuccess(editing ? tr('Saved') : tr('Posted'))
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={editing ? tr('Edit update') : tr('New update')} wide>
      <div className="space-y-4">
        <label className="block"><span className="label">{tr('Title')}</span><input className="input" maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr('For example: Translate what other creators write')} autoFocus /></label>
        <label className="block"><span className="label">{tr('One line under the title')}</span><input className="input" maxLength={280} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder={tr('What it is, in a sentence')} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="label">{tr('Tag')}</p>
            <Segmented size="sm" value={kind} onChange={setKind} label={tr('Tag')} options={Object.entries(KINDS).map(([k, v]) => ({ value: k, label: tr(v.label) }))} />
          </div>
          <label className="block"><span className="label">{tr('Date it went live')}</span><input type="date" className="input" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} /></label>
        </div>
        <div>
          <p className="label">{tr('Icon')}</p>
          <div className="flex flex-wrap gap-1.5">
            {ICONS.map((n) => (
              <button key={n} type="button" onClick={() => setIcon(n)} aria-pressed={icon === n} aria-label={n}
                className={cx('flex h-9 w-9 items-center justify-center rounded-xl border transition-all duration-200', icon === n ? 'border-brand bg-brand text-white shadow-card' : 'border-gray-200 bg-white text-brand hoverable:hover:-translate-y-0.5')}>
                <Icon name={n} className="h-[18px] w-[18px]" strokeWidth={2} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="label">{tr('The write-up')}</p>
          <RichToolbar editorRef={editor} only={['h2', 'h3', '|', 'bold', 'italic', 'link', '|', 'ul', 'ol', 'quote', 'divider']} />
          <RichEditable
            ref={editor}
            docId={row.id || 'new-update'}
            initialMd={row.body || ''}
            onChangeMd={setBody}
            placeholder={tr('Start with a heading, then a few bullets.')}
            className="min-h-[14rem] rounded-card border border-gray-200 bg-white px-4 py-3 text-[15px] leading-relaxed focus:border-brand/40"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2.5 text-sm font-semibold text-ink"><Toggle on={published} onChange={setPublished} label={tr('Show to creators')} />{tr('Show to creators')}</label>
          <div className="flex gap-2.5">
            <button type="button" onClick={onClose} className="btn-secondary !py-2.5 text-sm">{tr('Cancel')}</button>
            <button type="button" onClick={save} disabled={busy || !title.trim()} className="btn-primary !py-2.5 text-sm">{busy ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />}{tr('Save')}</button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
