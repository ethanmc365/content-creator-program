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
import AgreementDoc from '../../components/agreements/AgreementDoc'
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

// THE PLACEHOLDERS A TEMPLATE CAN USE (migration 357). Filled in from each reader's own VIP market when they read or
// sign, so one shared VIP agreement can say EUR 0.20 to Spain and EUR 0.40 to Romania.
export const PLACEHOLDERS = [
  ['{{creator_name}}', 'The creator\'s name', 'all'],
  ['{{creator_market}}', 'Their community market, for example Spain. "Worldwide" if they are in no country market yet; "Portugal and Spain" if in two', 'all'],
  ['{{creator_country}}', 'The country on their profile', 'all'],
  ['{{market}}', 'Their VIP market, for example VIP Spain', 'vip'],
  ['{{rate}}', 'Their rate per 1,000 views', 'vip'],
  ['{{min_payout}}', 'The market\'s minimum cash payout', 'vip'],
  ['{{voucher_min}}', 'The smallest voucher they can take', 'vip'],
  ['{{window_days}}', 'How many days a video keeps counting', 'vip'],
  ['{{payment_cap}}', 'A sentence about the monthly cap (or that there is none)', 'vip'],
  ['{{stay_in}}', 'A sentence about the stay-in requirement (or that there is none)', 'vip'],
  ['{{today}}', 'The date they accept or sign', 'all'],
]

// The person the team's previews are filled in for. A real-looking name shows how the personal lines read.
const SAMPLE = { name: 'Alex Morgan', market: 'Spain', country: 'Spain' }
const sampleFill = (t = '') => String(t || '')
  .replaceAll('{{creator_name}}', SAMPLE.name)
  .replaceAll('{{creator_market}}', SAMPLE.market)
  .replaceAll('{{creator_country}}', SAMPLE.country)

export default function AdminAgreements() {
  const { profile } = useAuth()
  const [audience, setAudience] = useState('creator')
  const [market, setMarket] = useState('') // '' = every VIP market (the shared version), else a programme id
  const [programmes, setProgrammes] = useState([])
  const [docs, setDocs] = useState(undefined)
  const [openId, setOpenId] = useState(null)
  const [preview, setPreview] = useState(null)
  const [registerKey, setRegisterKey] = useState(0)
  const load = useCallback(async () => {
    const { data } = await supabase.from('agreements').select('*').order('version', { ascending: false })
    setDocs(data || [])
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    supabase.from('vip_programmes').select('id, name, active').eq('active', true).order('name').then(({ data }) => setProgrammes(data || []))
  }, [])

  const inScope = (d) => d.audience === audience && (audience !== 'vip' || (d.programme_id || '') === market)
  const list = (docs || []).filter(inScope)
  const live = list.find((d) => d.published_at)
  const draft = list.find((d) => !d.published_at)
  const selected = list.find((d) => d.id === openId) || draft || live
  const sharedLive = (docs || []).find((d) => d.audience === 'vip' && !d.programme_id && d.published_at)
  const sharedLatest = (docs || []).find((d) => d.audience === 'vip' && !d.programme_id)
  const marketName = programmes.find((p) => p.id === market)?.name

  async function newVersion() {
    // A market's first version starts as a copy of the shared one.
    const base = live || list[0] || (audience === 'vip' && market ? (sharedLive || sharedLatest) : null)
    const { data, error } = await supabase.from('agreements').insert({
      audience, programme_id: audience === 'vip' && market ? market : null,
      version: (list[0]?.version || 0) + 1, title: base?.title || AUD[audience], summary: base?.summary || '',
      body: base?.body || `# ${AUD[audience]}\n\n`, requires_signature: base ? base.requires_signature : audience === 'vip', created_by: profile.id,
    }).select('id').single()
    if (error) { notice(error.message); return }
    await load(); setOpenId(data.id)
  }

  // The real sheet, with this market's numbers and a sample creator in it. `minor` shows the under-18 version.
  async function openPreview(d, minor = false) {
    const programme = audience === 'vip' ? (market || null) : null
    const [{ data: body }, { data: summary }] = await Promise.all([
      supabase.rpc('agreement_preview', { p_agreement: d.id, p_programme: programme, p_body: sampleFill(d.body) }),
      supabase.rpc('agreement_preview', { p_agreement: d.id, p_programme: programme, p_body: sampleFill(d.summary || '') }),
    ])
    setPreview({ ...d, body: body ?? d.body, summary: summary ?? d.summary, minor })
  }

  async function publishDoc(d) {
    const who = d.audience === 'vip' ? 'every active VIP' : 'every creator'
    if (!await confirm(`Switch on v${d.version}? ${who[0].toUpperCase()}${who.slice(1)} will have to ${d.requires_signature ? 'sign' : 'accept'} it before they can use the app, the next time they open it${live ? ', and will be told in a notification' : ''}. A published version cannot be edited.`, { confirmLabel: 'Publish' })) return false
    const { error } = await supabase.rpc('publish_agreement', { p_agreement: d.id, p_notify: true })
    if (error) { notice(error.message); return false }
    toastSuccess('Published. Creators are asked the next time they open the app.')
    await load(); setOpenId(d.id); setRegisterKey((k) => k + 1)
    return true
  }

  return (
    <div className="page max-w-5xl">
      <PageHeader back="/admin" title="Agreements" subtitle="The terms creators accept and the agreement VIPs sign. Publish a version and everyone it applies to is asked to accept it." />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Segmented value={audience} onChange={(v) => { setAudience(v); setOpenId(null) }} options={[{ value: 'creator', label: 'Community Terms' }, { value: 'vip', label: 'VIP agreement' }]} />
        {!draft && <button type="button" onClick={newVersion} className="btn-primary !py-2 text-sm"><Icon name="plus" className="h-4 w-4" />{audience === 'vip' && market && !list.length ? `Make one for ${marketName}` : 'New version'}</button>}
      </div>
      {audience === 'vip' && (
        <div className="mb-5 flex w-fit max-w-full flex-wrap items-center gap-1.5 rounded-card border border-gray-100 bg-white p-1.5 shadow-card">
          {[{ id: '', name: 'Every VIP market' }, ...programmes].map((p) => (
            <button key={p.id || 'all'} type="button" onClick={() => { setMarket(p.id); setOpenId(null) }} aria-pressed={market === p.id}
              className={cx('rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors', market === p.id ? 'bg-brand text-white' : 'text-smoke hover:bg-cloud hover:text-ink')}>
              {p.name}
            </button>
          ))}
        </div>
      )}
      {audience === 'vip' && market && !list.length && (
        <p className="mb-5 rounded-card border border-brand/20 bg-white px-5 py-4 text-sm text-ink shadow-card">
          <strong>{marketName}</strong> uses the shared VIP agreement, with {marketName}'s own numbers filled in. Make a version just for {marketName} only if its wording has to differ.
        </p>
      )}

      {docs !== undefined && (list.length > 0 || audience === 'creator' || !market) && (
        <StatusBanner audience={audience} live={live} draft={draft} market={marketName} sharedLive={audience === 'vip' && market ? sharedLive : null}
          onPublish={() => draft && publishDoc(draft)} onPreview={(d, minor) => openPreview(d, minor)} onOpen={(d) => setOpenId(d.id)} />
      )}

      {docs === undefined ? <Skeleton className="h-64 w-full rounded-card" /> : !selected ? (
        !(audience === 'vip' && market) && <p className="rounded-card border border-dashed border-gray-200 bg-white px-5 py-10 text-center text-sm text-smoke">No versions yet. Press New version to write the first.</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-w-0 space-y-5">
            {selected.published_at
              ? <PublishedView doc={selected} onPreview={(minor) => openPreview(selected, minor)} />
              : <DraftEditor key={selected.id} doc={selected} hasLive={!!live} onSaved={load} onPreview={(d, minor) => openPreview(d, minor)} onPublish={publishDoc} />}
            {selected.published_at && <Register key={`${selected.id}-${registerKey}`} doc={selected} />}
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
            <PlaceholderGuide programme={market || null} audience={audience} />
          </aside>
        </div>
      )}
      {preview && <AgreementSheet preview previewMinor={!!preview.minor} doc={preview} onClose={() => setPreview(null)} onAccepted={() => setPreview(null)} />}
    </div>
  )
}

/** What each placeholder turns into for the chosen market, so the team can write the template with the answers in front of them. */
function PlaceholderGuide({ programme, audience }) {
  const shown = PLACEHOLDERS.filter(([, , who]) => who === 'all' || audience === 'vip')
  const [values, setValues] = useState(null)
  useEffect(() => {
    let alive = true
    // Any agreement id will do for the preview call; the body is passed in.
    supabase.from('agreements').select('id').limit(1).maybeSingle().then(async ({ data: one }) => {
      if (!one) return
      const sep = '\u0001'
      const { data } = await supabase.rpc('agreement_preview', { p_agreement: one.id, p_programme: programme, p_body: sampleFill(PLACEHOLDERS.map(([k]) => k).join(sep)) })
      if (alive && typeof data === 'string') setValues(Object.fromEntries(data.split(sep).map((v, i) => [PLACEHOLDERS[i][0], v])))
    })
    return () => { alive = false }
  }, [programme])
  return (
    <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">Fill-ins</p>
      <p className="mt-1 text-[11.5px] leading-snug text-smoke">{audience === 'vip' ? 'Type these into the text and each VIP sees their own name and their market\'s values.' : 'Type these into the text and each creator sees their own details. Shown here for a sample creator.'}</p>
      <ul className="mt-3 space-y-2">
        {shown.map(([k, label]) => (
          <li key={k} className="text-[11.5px] leading-snug">
            <code className="rounded bg-cloud px-1.5 py-0.5 font-semibold text-brand">{k}</code>
            <span className="ml-1.5 text-smoke">{label}</span>
            {values?.[k] && values[k] !== k && <span className="mt-0.5 block text-ink/80 [overflow-wrap:anywhere]">= {values[k]}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function PublishedView({ doc, onPreview }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="rounded-card border border-gray-100 bg-white p-6 shadow-card animate-rise">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand">Published · v{doc.version}{doc.requires_signature ? ' · signature' : ' · tick to accept'}</p>
          <h2 className="mt-1 text-xl font-bold text-ink">{doc.title}</h2>
          <p className="mt-1 text-sm text-smoke">{sampleFill(doc.summary)}</p>
        </div>
        <PreviewButtons doc={doc} onPreview={(minor) => onPreview(minor)} />
      </div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-brand">
        <Icon name={open ? 'chevronUp' : 'chevronDown'} className="h-4 w-4" />{open ? 'Hide the text' : 'Read the text'}
      </button>
      {open && <div className="mt-2 animate-rise"><AgreementDoc body={sampleFill(doc.body)} /></div>}
      <p className="mt-4 break-all font-mono text-[10px] text-gray-400">SHA-256 {doc.body_sha256}</p>
    </section>
  )
}

/** "See it as a creator", and for the community terms the under-18 version too. */
function PreviewButtons({ doc, onPreview, label = 'See it as a creator' }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => onPreview(false)} className="btn-secondary !py-2 text-sm"><Icon name="eye" className="h-4 w-4" />{label}</button>
      {doc.audience !== 'vip' && <button type="button" onClick={() => onPreview(true)} className="btn-secondary !py-2 text-sm" title="How it looks for a creator aged 16 or 17, who adds a parent or guardian">Under 18</button>}
    </div>
  )
}

/**
 * IS IT ON? (7 Oct 2026). Ethan: "There should also be a link for me to turn this on because currently it says
 * 'Draft', but at the bottom it says 'Publish V1'." The answer to "are creators being asked?" is now the first thing
 * on the page, with the button that changes it beside it.
 */
function StatusBanner({ audience, live, draft, market, sharedLive, onPublish, onPreview, onOpen }) {
  const who = audience === 'vip' ? (market ? `VIPs in ${market}` : 'every VIP') : 'every creator'
  if (!live && !draft && sharedLive) return null
  const on = !!live
  return (
    <section className={cx('mb-5 overflow-hidden rounded-card border shadow-card animate-rise', on ? 'border-gray-100 bg-white' : 'border-brand/30 bg-white')}>
      <div className="flex flex-wrap items-center gap-4 p-5">
        <span className={cx('relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full', on ? 'bg-brand text-white' : 'bg-cloud text-brand')}>
          {on && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-brand/30 [animation-duration:2.4s]" />}
          <Icon name={on ? 'check' : 'shield'} className="relative h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-ink">
            {on ? `On: v${live.version} is live` : 'Not switched on yet'}
          </p>
          <p className="text-sm text-smoke">
            {on
              ? `${who[0].toUpperCase()}${who.slice(1)} has to ${live.requires_signature ? 'sign' : 'accept'} it before using the app. It is the first thing they see, before any other pop-up.${draft ? ` v${draft.version} is a draft waiting to replace it.` : ''}`
              : `Nobody is being asked yet. Publish v${draft?.version ?? 1} and ${who} will have to ${draft?.requires_signature ? 'sign' : 'accept'} it the next time they open the app, before anything else.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {draft && <button type="button" onClick={() => onPreview(draft, false)} className="btn-secondary !py-2.5 text-sm"><Icon name="eye" className="h-4 w-4" />Preview v{draft.version}</button>}
          {draft && <button type="button" onClick={() => { onOpen(draft); onPublish() }} className="btn-primary !py-2.5 text-sm"><Icon name="megaphone" className="h-4 w-4" />{on ? `Publish v${draft.version}` : `Switch on: publish v${draft.version}`}</button>}
        </div>
      </div>
    </section>
  )
}

function DraftEditor({ doc, hasLive, onSaved, onPreview, onPublish }) {
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
    if (dirty && !await save(true)) return
    setBusy(true)
    await onPublish({ ...doc, title, summary, body, requires_signature: sig })
    setBusy(false)
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
          <PreviewButtons doc={doc} label="Preview" onPreview={(minor) => onPreview({ ...doc, title, summary, body, change_note: note, requires_signature: sig, id: doc.id }, minor)} />
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
  const [guardians, setGuardians] = useState({})
  useEffect(() => {
    let alive = true
    supabase.rpc('agreement_register', { p_agreement: doc.id }).then(({ data }) => { if (alive) setRows(data || []) })
    // Under-18s: has their parent or guardian confirmed on the link yet (migration 367)?
    supabase.from('guardian_consents').select('confirmed_at, confirmed_name, agreement_acceptances!inner(profile_id, agreement_id)')
      .eq('agreement_acceptances.agreement_id', doc.id)
      .then(({ data }) => { if (alive) setGuardians(Object.fromEntries((data || []).map((g) => [g.agreement_acceptances.profile_id, g]))) })
    return () => { alive = false }
  }, [doc.id])
  const done = (rows || []).filter((r) => r.accepted_at)
  const shown = useMemo(() => (rows || [])
    .filter((r) => (filter === 'all' ? true : filter === 'done' ? !!r.accepted_at : !r.accepted_at))
    .filter((r) => !q.trim() || (r.name || '').toLowerCase().includes(q.trim().toLowerCase())), [rows, filter, q])

  function csv() {
    const head = ['name', 'status', 'accepted_at', 'method', 'signed_name', 'email', 'guardian_name', 'guardian_email', 'guardian_confirmed_at', 'guardian_confirmed_name', 'ip', 'user_agent', 'text_sha256']
    const lines = (rows || []).map((r) => [r.name, r.status, r.accepted_at || '', r.method || '', r.signed_name || '', r.account_email || '', r.guardian_name || '', r.guardian_email || '', guardians[r.profile_id]?.confirmed_at || '', guardians[r.profile_id]?.confirmed_name || '', r.ip || '', r.user_agent || '', r.body_sha256 || '']
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
                {r.guardian_name && (
                  <span className="block truncate text-[11px] font-semibold text-ink/80">
                    Parent or guardian: {r.guardian_name} · {r.guardian_email} ·{' '}
                    {guardians[r.profile_id]?.confirmed_at
                      ? <span className="text-brand">confirmed by {guardians[r.profile_id].confirmed_name} {dateTag(guardians[r.profile_id].confirmed_at)}</span>
                      : <span className="text-amber-700">not confirmed yet</span>}
                  </span>
                )}
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
