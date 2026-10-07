import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Avatar, PageHeader, Skeleton, Spinner, Toggle } from '../../components/ui'
import Icon from '../../components/Icon'
import Segmented from '../../components/network/Segmented'
import RichEditable from '../../components/RichEditable'
import RichToolbar from '../../components/RichToolbar'
import AgreementSheet from '../../components/agreements/AgreementSheet'
import { SignatureImage } from '../../components/agreements/SignaturePad'
import { renderNote } from '../../lib/noteMarkdown'
import { confirm, notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { cx, dateTag } from '../../lib/utils'

// ADMIN > AGREEMENTS (7 Oct 2026).
//
// The two documents (Community Terms for every creator, the VIP Creator Agreement for VIPs), each as a list of
// versions. A published version is frozen: acceptances point at its exact text. To change one, start a new version (a
// draft copy of the newest), edit it, and Publish - everybody in its audience is then asked to accept it the next time
// they open the app, and told in a notification. The register shows who has accepted the current version, how (tick,
// typed or drawn signature), when, and from where; it downloads as a CSV for the records.
const when = (iso) => (iso ? new Date(iso).toLocaleString(dateTag(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
const AUD = { creator: 'Community Terms', vip: 'VIP Creator Agreement' }

export default function AdminAgreements() {
  const { profile } = useAuth()
  const [audience, setAudience] = useState('creator')
  const [docs, setDocs] = useState(undefined)
  const [openId, setOpenId] = useState(null)
  const [preview, setPreview] = useState(null)
  const load = useCallback(async () => {
    const { data } = await supabase.from('agreements').select('*').order('version', { ascending: false })
    setDocs(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  const list = (docs || []).filter((d) => d.audience === audience)
  const live = list.find((d) => d.published_at)
  const draft = list.find((d) => !d.published_at)
  const selected = list.find((d) => d.id === openId) || draft || live

  async function newVersion() {
    const base = live || list[0]
    const { data, error } = await supabase.from('agreements').insert({
      audience, version: (list[0]?.version || 0) + 1, title: base?.title || AUD[audience], summary: base?.summary || '',
      body: base?.body || `# ${AUD[audience]}\n\n`, requires_signature: base ? base.requires_signature : audience === 'vip', created_by: profile.id,
    }).select('id').single()
    if (error) { notice(error.message); return }
    await load(); setOpenId(data.id)
  }

  return (
    <div className="page max-w-5xl">
      <PageHeader back="/admin" title="Agreements" subtitle="The terms creators accept and the agreement VIPs sign. Publish a version and everyone it applies to is asked to accept it." />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented value={audience} onChange={(v) => { setAudience(v); setOpenId(null) }} options={[{ value: 'creator', label: 'Community Terms' }, { value: 'vip', label: 'VIP agreement' }]} />
        {!draft && <button type="button" onClick={newVersion} className="btn-primary !py-2 text-sm"><Icon name="plus" className="h-4 w-4" />New version</button>}
      </div>

      {docs === undefined ? <Skeleton className="h-64 w-full rounded-card" /> : !selected ? (
        <p className="rounded-card border border-dashed border-gray-200 bg-white px-5 py-10 text-center text-sm text-smoke">No versions yet. Press New version to write the first.</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-w-0 space-y-5">
            {selected.published_at
              ? <PublishedView doc={selected} onPreview={() => setPreview(selected)} />
              : <DraftEditor key={selected.id} doc={selected} hasLive={!!live} onSaved={load} onPreview={(d) => setPreview(d)} />}
            {selected.published_at && <Register doc={selected} />}
          </div>
          <aside className="space-y-2">
            <p className="px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">Versions</p>
            {list.map((d) => (
              <button key={d.id} type="button" onClick={() => setOpenId(d.id)}
                className={cx('flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all duration-200', d.id === selected.id ? 'border-brand bg-brand text-white shadow-card' : 'border-gray-100 bg-white hoverable:hover:-translate-y-0.5')}>
                <span className="text-sm font-black tabular-nums">v{d.version}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{d.title}</span>
                  <span className={cx('block text-[11px]', d.id === selected.id ? 'text-white/80' : 'text-smoke')}>{d.published_at ? (d.id === live?.id ? `Live since ${when(d.published_at)}` : `Published ${when(d.published_at)}`) : 'Draft'}</span>
                </span>
              </button>
            ))}
          </aside>
        </div>
      )}
      {preview && <AgreementSheet preview doc={preview} onClose={() => setPreview(null)} onAccepted={() => setPreview(null)} />}
    </div>
  )
}

function PublishedView({ doc, onPreview }) {
  return (
    <section className="rounded-card border border-gray-100 bg-white p-6 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand">Published · v{doc.version}{doc.requires_signature ? ' · signature' : ' · tick to accept'}</p>
          <h2 className="mt-1 text-xl font-bold text-ink">{doc.title}</h2>
          <p className="mt-1 text-sm text-smoke">{doc.summary}</p>
        </div>
        <button type="button" onClick={onPreview} className="btn-secondary !py-2 text-sm"><Icon name="eye" className="h-4 w-4" />See it as a creator</button>
      </div>
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-bold text-brand">Read the text</summary>
        <div className="agreement-text mt-3 text-[14px]">{renderNote(doc.body)}</div>
      </details>
      <p className="mt-4 break-all font-mono text-[10px] text-gray-400">SHA-256 {doc.body_sha256}</p>
    </section>
  )
}

function DraftEditor({ doc, hasLive, onSaved, onPreview }) {
  const editor = useRef(null)
  const [title, setTitle] = useState(doc.title)
  const [summary, setSummary] = useState(doc.summary)
  const [body, setBody] = useState(doc.body)
  const [note, setNote] = useState(doc.change_note || '')
  const [sig, setSig] = useState(doc.requires_signature)
  const [busy, setBusy] = useState(false)
  const dirty = title !== doc.title || summary !== doc.summary || body !== doc.body || note !== (doc.change_note || '') || sig !== doc.requires_signature

  async function save(quiet) {
    setBusy(true)
    const { error } = await supabase.from('agreements').update({ title, summary, body, change_note: note || null, requires_signature: sig, updated_at: new Date().toISOString() }).eq('id', doc.id)
    setBusy(false)
    if (error) { notice(error.message); return false }
    if (!quiet) toastSuccess('Draft saved.')
    onSaved()
    return true
  }
  async function publish() {
    const who = doc.audience === 'vip' ? 'every active VIP' : 'every creator'
    if (!await confirm(`Publish v${doc.version}? ${who[0].toUpperCase()}${who.slice(1)} will be asked to ${sig ? 'sign' : 'accept'} it the next time they open the app${hasLive ? ', and told in a notification' : ''}. A published version cannot be edited.`, { confirmLabel: 'Publish' })) return
    if (dirty && !await save(true)) return
    setBusy(true)
    const { error } = await supabase.rpc('publish_agreement', { p_agreement: doc.id, p_notify: true })
    setBusy(false)
    if (error) { notice(error.message); return }
    toastSuccess('Published.')
    onSaved()
  }
  async function discard() {
    if (!await confirm('Delete this draft?', { confirmLabel: 'Delete', danger: true })) return
    await supabase.from('agreements').delete().eq('id', doc.id)
    onSaved()
  }

  return (
    <section className="space-y-4 rounded-card border border-brand/25 bg-white p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand">Draft · v{doc.version}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => onPreview({ ...doc, title, summary, body, change_note: note, requires_signature: sig, id: doc.id })} className="btn-secondary !py-2 text-sm"><Icon name="eye" className="h-4 w-4" />Preview</button>
          <button type="button" onClick={discard} className="btn-secondary !py-2 text-sm text-red-600">Delete draft</button>
        </div>
      </div>
      <label className="block"><span className="label">Title</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="block"><span className="label">Summary (shown at the top, two lines)</span><textarea className="input resize-none" rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} /></label>
      {hasLive && <label className="block"><span className="label">What changed (shown to people re-accepting, and in the notification)</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: we added the Video Ideas page and how videos appear on it." /></label>}
      <div>
        <p className="label">The text</p>
        <RichToolbar editorRef={editor} sticky only={['h1', 'h2', 'h3', '|', 'bold', 'italic', 'link', '|', 'ul', 'ol', 'quote', 'divider']} />
        <RichEditable ref={editor} docId={doc.id} initialMd={doc.body} onChangeMd={setBody} className="agreement-text min-h-[24rem] rounded-card border border-gray-200 bg-white px-5 py-4 text-[14.5px] leading-relaxed focus:border-brand/40" />
      </div>
      <label className="flex items-center gap-2.5 text-sm font-semibold text-ink"><Toggle on={sig} onChange={setSig} label="Ask for a signature" />Ask for a signature (typed or drawn) instead of a tick</label>
      <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
        <button type="button" onClick={() => save(false)} disabled={busy || !dirty} className="btn-secondary !py-2.5 text-sm disabled:opacity-50">{busy ? <Spinner className="h-4 w-4" /> : null}Save draft</button>
        <button type="button" onClick={publish} disabled={busy || !title.trim() || body.trim().length < 50} className="btn-primary !py-2.5 text-sm disabled:opacity-50"><Icon name="megaphone" className="h-4 w-4" />Publish v{doc.version}</button>
      </div>
    </section>
  )
}

function Register({ doc }) {
  const [rows, setRows] = useState(undefined)
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  useEffect(() => {
    let alive = true
    supabase.rpc('agreement_register', { p_agreement: doc.id }).then(({ data }) => { if (alive) setRows(data || []) })
    return () => { alive = false }
  }, [doc.id])
  const done = (rows || []).filter((r) => r.accepted_at)
  const shown = useMemo(() => (rows || [])
    .filter((r) => (filter === 'all' ? true : filter === 'done' ? !!r.accepted_at : !r.accepted_at))
    .filter((r) => !q.trim() || (r.name || '').toLowerCase().includes(q.trim().toLowerCase())), [rows, filter, q])

  function csv() {
    const head = ['name', 'status', 'accepted_at', 'method', 'signed_name', 'email', 'ip', 'user_agent', 'text_sha256']
    const lines = (rows || []).map((r) => [r.name, r.status, r.accepted_at || '', r.method || '', r.signed_name || '', r.account_email || '', r.ip || '', r.user_agent || '', r.body_sha256 || '']
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${doc.audience}-agreement-v${doc.version}-register.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  return (
    <section className="rounded-card border border-gray-100 bg-white p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-ink">Who has {doc.requires_signature ? 'signed' : 'accepted'}</h3>
          {rows && <p className="text-sm text-smoke"><strong className="text-ink">{done.length}</strong> of {rows.length} ({rows.length ? Math.round((done.length / rows.length) * 100) : 0}%)</p>}
        </div>
        <button type="button" onClick={csv} disabled={!rows?.length} className="btn-secondary !py-2 text-sm"><Icon name="download" className="h-4 w-4" />Download CSV</button>
      </div>
      {rows && rows.length > 0 && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-cloud"><div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-[width] duration-700" style={{ width: `${(done.length / rows.length) * 100}%` }} /></div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Everyone' }, { value: 'done', label: 'Done' }, { value: 'waiting', label: 'Waiting' }]} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a name" className="input !w-56 !py-2 text-sm" />
      </div>
      {rows === undefined ? <Skeleton className="mt-4 h-40 w-full" /> : (
        <ul className="mt-4 max-h-[32rem] divide-y divide-gray-50 overflow-y-auto">
          {shown.map((r) => (
            <li key={r.profile_id} className="flex items-center gap-3 py-2.5">
              <Avatar src={r.photo_url} name={r.name || ''} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{r.name}</span>
                <span className="block truncate text-[11px] text-smoke">{r.accepted_at ? `${when(r.accepted_at)} · ${r.method === 'click' ? 'ticked' : r.method === 'typed' ? 'typed signature' : 'drawn signature'}${r.ip ? ` · ${r.ip}` : ''}` : 'Not yet'}</span>
              </span>
              {r.method && r.method !== 'click' && <SignatureImage svg={r.signature_svg} method={r.method} name={r.signed_name} className="max-h-9 max-w-[140px]" textClass="text-[20px]" />}
              {!r.accepted_at && <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-bold uppercase text-brand">Waiting</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
