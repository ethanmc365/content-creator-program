import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { LabPage, Panel, Note, Stage, useStage, Choice, Field } from './kit'
import { Skeleton } from '../../../components/ui'
import Icon from '../../../components/Icon'
import AgreementSheet from '../../../components/agreements/AgreementSheet'
import { renderNote } from '../../../lib/noteMarkdown'

// THE AGREEMENT POP-UP, BEFORE ANY CREATOR SEES IT (7 Oct 2026).
//
// Ethan: "add into the test centre a place where I can view this: how it looks, how the signature thing works ...
// exactly how it looks in the pop-up."
//
// Pick the document (draft or published), the VIP market and a name; the text is filled in exactly as that market's
// creator would read it (agreement_preview, migration 357), and the REAL sheet opens over this page or inside a phone
// frame. Signing in here records nothing: the sheet runs in preview mode.
export default function AgreementLab() {
  const [params] = useSearchParams()
  const embed = params.get('embed') === '1'
  const stage = useStage('phone')
  const [docs, setDocs] = useState(null)
  const [programmes, setProgrammes] = useState([])
  const [docId, setDocId] = useState(params.get('doc') || '')
  const [programme, setProgramme] = useState(params.get('programme') || '')
  const [name, setName] = useState(params.get('name') || 'Jessica Nieto Sánchez')
  const [updated, setUpdated] = useState(params.get('updated') === '1')
  const [filled, setFilled] = useState(null)
  const [open, setOpen] = useState(embed)
  const [frameKey, setFrameKey] = useState(0)

  useEffect(() => {
    supabase.from('agreements').select('*').order('audience').order('version', { ascending: false }).then(({ data }) => {
      setDocs(data || [])
      if (!docId && data?.length) setDocId((data.find((d) => d.audience === 'vip') || data[0]).id)
    })
    supabase.from('vip_programmes').select('id, name').eq('active', true).order('name').then(({ data }) => {
      setProgrammes(data || [])
      if (!programme && data?.length) setProgramme((data.find((p) => /spain/i.test(p.name)) || data[0]).id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const doc = (docs || []).find((d) => d.id === docId)
  const vip = doc?.audience === 'vip'

  useEffect(() => {
    if (!doc) return undefined
    let alive = true
    const withName = (t) => (t || '').replaceAll('{{creator_name}}', name.trim() || 'the Creator')
    Promise.all([
      supabase.rpc('agreement_preview', { p_agreement: doc.id, p_programme: vip ? (programme || null) : null, p_body: withName(doc.body) }),
      supabase.rpc('agreement_preview', { p_agreement: doc.id, p_programme: vip ? (programme || null) : null, p_body: withName(doc.summary) }),
    ]).then(([b, s]) => { if (alive) setFilled({ ...doc, body: b.data ?? doc.body, summary: s.data ?? doc.summary }) })
    return () => { alive = false }
  }, [doc, programme, name, vip])

  const frameSrc = useMemo(() => {
    const q = new URLSearchParams({ embed: '1', doc: docId, programme, name, updated: updated ? '1' : '0' })
    return `/admin/testing/agreements?${q}`
  }, [docId, programme, name, updated])

  // Inside the phone frame: only the sheet, open, over a plain page.
  if (embed) {
    return filled ? <AgreementSheet preview doc={filled} updated={updated} onAccepted={() => {}} /> : null
  }

  return (
    <LabPage
      title="Agreements and signatures"
      icon="key"
      subtitle="The pop-up creators get when terms are published or updated, filled in for any VIP market. Try ticking, typing and drawing a signature: nothing is saved."
    >
      <Panel title="What to show">
        {docs === null ? <Skeleton className="h-24 w-full" /> : docs.length === 0 ? (
          <Note>No agreements yet. Write one on Admin, Agreements.</Note>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Document">
              <select className="input" value={docId} onChange={(e) => setDocId(e.target.value)}>
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} · v{d.version}{d.programme_id ? ` · ${programmes.find((p) => p.id === d.programme_id)?.name || 'one market'}` : ''} · {d.published_at ? 'published' : 'draft'}
                  </option>
                ))}
              </select>
            </Field>
            {vip && (
              <Field label="VIP market (fills in the rate, cap, minimums and stay-in rule)">
                <select className="input" value={programme} onChange={(e) => setProgramme(e.target.value)}>
                  {programmes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="Creator name">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Shown as">
              <Choice size="sm" value={updated ? 'update' : 'first'} onChange={(v) => setUpdated(v === 'update')}
                options={[{ value: 'first', label: 'First time' }, { value: 'update', label: 'An update' }]} />
            </Field>
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" disabled={!filled} onClick={() => setOpen(true)} className="btn-primary disabled:opacity-50"><Icon name="eye" className="h-4 w-4" />Open the pop-up here</button>
          <button type="button" disabled={!filled} onClick={() => setFrameKey((k) => k + 1)} className="btn-secondary disabled:opacity-50"><Icon name="refresh" className="h-4 w-4" />Reset the phone</button>
        </div>
      </Panel>

      {filled && (
        <Panel title="On a phone" hint="The real pop-up, in a phone-sized frame. Draw with the mouse to try the signature pad.">
          <Stage key={`${frameSrc}-${frameKey}`} src={frameSrc} {...stage} label={vip ? (programmes.find((p) => p.id === programme)?.name || 'VIP') : 'Community'} />
        </Panel>
      )}

      {filled && (
        <Panel title="The text, filled in" hint={vip ? 'Exactly what a creator in this market reads and signs.' : 'Exactly what every creator reads and accepts.'}>
          <div className="agreement-text max-h-[32rem] overflow-y-auto rounded-2xl border border-gray-100 bg-white p-5 text-[14px]">{renderNote(filled.body)}</div>
        </Panel>
      )}

      {open && filled && <AgreementSheet preview doc={filled} updated={updated} onClose={() => setOpen(false)} onAccepted={() => setOpen(false)} />}
    </LabPage>
  )
}
