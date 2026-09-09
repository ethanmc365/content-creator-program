import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Modal, Select, Spinner } from '../ui'
import Icon from '../Icon'
import AutoTextarea from '../AutoTextarea'
import { confirm } from '../../lib/confirm'
import { cx, formatViews } from '../../lib/utils'
import { platformOf, videoIdOf } from '../../lib/videoLinks'
import { describeSyncError, probeLink } from '../../lib/viewSync'
import { getVideoPreview } from '../../lib/videoPreview'
import { atHandle, parseTags } from '../../lib/videoTracker'
import { useT } from '../../lib/i18n'

// ADDING A VIDEO THE PLATFORM HAS NEVER SEEN, AND EDITING ONE IT HAS.
//
// Ethan: "you can start off by doing this for the UK challenge at least... and
// we can also use them to share with the other markets."
//
// Five of the seven markets are not on this platform yet - they still run on a
// spreadsheet and WhatsApp - so a tracker that can only see `submissions` can
// only ever show the UK. This dialog is the other door: paste a link, and the
// row is as real as a synced one.
//
// TWO THINGS ARE FILLED IN FOR YOU AND NEITHER IS GUESSED. `platformOf` and
// `videoIdOf` (lib/videoLinks) read the URL itself - the same two functions the
// submission form and the view sync use, so a link that resolves here resolves
// everywhere. Everything else is typed, because everything else is a judgement:
// what the hook was, which challenge it belongs to, what is worth saying about
// it.
//
// THE HOOK FIELD IS THE ONE THAT MATTERS AND IT IS FIRST. On a synced row it
// arrives pre-filled from the first line of the caption, which is right about
// half the time - the written hook and the spoken one are often different
// sentences, and only somebody who has watched it knows which. Editing it sets
// `hook_source = 'manual'`, and `sync_tracked_videos` then never touches it
// again. See migration 212.
export default function TrackedVideoSheet({ row, markets, challenges, profileId, onClose, onSaved }) {
  const tr = useT()
  const isNew = !row?.id

  const [form, setForm] = useState(() => ({
    video_url: row?.video_url || '',
    hook: row?.hook || '',
    caption: row?.caption || '',
    creator_name: row?.creator_name || '',
    creator_handle: row?.creator_handle || '',
    views: row?.views ?? '',
    community_id: row?.community_id || '',
    challenge: row?.challenge_id ? `c:${row.challenge_id}` : row?.history_id ? `h:${row.history_id}` : '',
    tags: (row?.tags || []).join(', '),
    notes: row?.notes || '',
    pinned: !!row?.pinned,
  }))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [reading, setReading] = useState(false)
  const [readNote, setReadNote] = useState('')

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  // WHAT THE LINK ITSELF SAYS. Recomputed as they type rather than on blur, so
  // pasting a link answers "did that work" immediately - the alternative is a
  // dialog that looks identical for a good link and a typo until you save it.
  const detected = useMemo(() => {
    const url = form.video_url.trim()
    if (!url) return null
    return { platform: platformOf(url), id: videoIdOf(url) }
  }, [form.video_url])

  // Esc is handled by Modal; this is the "did I mean to close that" guard for a
  // half-typed row, and only for a new one - an edit is saved or it is not.
  const dirty = isNew && (form.video_url || form.hook || form.notes)

  useEffect(() => {
    if (!isNew) return undefined
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, isNew])

  // ASK THE PLATFORM WHAT IT KNOWS ABOUT THIS LINK.
  //
  // Ethan: "you'll pull the views from this... and we would want the hooks for
  // this. I wonder if you can pull these from the video, because you have the
  // scraper already."
  //
  // We do, and it is the same one: `view-sync`'s PROBE mode, which resolves one
  // pasted link and writes nothing anywhere. It returned only a view count
  // until now; it also returns the caption, the account that posted it, a
  // poster frame and the date (9 Sep 2026, see the `Resolved` type in that
  // function). So this fills in five fields from one request.
  //
  // IT NEVER OVERWRITES SOMETHING A PERSON WROTE. Every field below is filled
  // only where it is currently EMPTY, because the reason somebody typed a hook
  // is that the platform's own first line was not it - and a button that
  // silently undoes that is a button nobody presses twice. The exception is the
  // view count, where the platform genuinely is the source of truth (the same
  // rule the whole view sync lives by).
  async function readFromPlatform() {
    const url = form.video_url.trim()
    if (!url) { setErr(tr('Paste a link first.')); return }
    setReading(true)
    setErr('')
    setReadNote('')
    try {
      // TWO SOURCES, AND THE BROWSER'S IS THE ONE THAT ALWAYS WORKS.
      //
      // `probeLink` is the edge function - the only thing that can state a view
      // count, on all four platforms. `getVideoPreview` is TikTok's and
      // YouTube's own tokenless oEmbed, called straight from this page: no
      // key, no server, CORS-open, and it returns the caption as `title`, the
      // account as `author` and a poster frame. It is already how a submitted
      // entry gets its thumbnail (lib/videoPreview), so this is a second
      // caller rather than a second implementation.
      //
      // Asking both at once costs one round trip rather than two, and neither
      // is allowed to sink the other - `Promise.allSettled`, because a probe
      // that 500s must not take the caption down with it.
      const [probed, preview] = await Promise.allSettled([probeLink(url), getVideoPreview(url)])
      const r = probed.status === 'fulfilled' ? probed.value : null
      const o = preview.status === 'fulfilled' ? preview.value : null
      // The edge function wins where both answer: it reads the post itself,
      // while oEmbed reads a card about the post and truncates a long caption.
      const caption = r?.caption || o?.title || null
      // THE @HANDLE AND THE DISPLAY NAME ARE TWO FIELDS ON THIS FORM, and they
      // are two different facts: the handle is what a link to the account is
      // built from, the name is what a person reads. The edge function returns
      // the handle (`author`); oEmbed returns both, so they go to their own
      // boxes rather than the display name landing in the account field, which
      // is what "@Lisa | ..." looked like on the first pass.
      const handle = r?.author || o?.authorHandle || null
      const name = o?.author || null

      const got = []
      const patch = {}
      if (r?.views != null) { patch.views = String(r.views); got.push(tr('views')) }
      if (caption && !form.caption.trim()) { patch.caption = caption; got.push(tr('caption')) }
      // The hook is the first line of the caption, which is exactly what the
      // sync does server-side (`hook_from_caption`, migration 212). Doing it
      // here as well would be two implementations of one rule, so it is
      // deliberately the same shape: first line, collapsed, capped.
      if (caption && !form.hook.trim()) {
        const first = caption.split('\n')[0].replace(/\s+/g, ' ').trim().slice(0, 140)
        if (first) { patch.hook = first; got.push(tr('hook')) }
      }
      if (handle && !form.creator_handle.trim()) { patch.creator_handle = handle; got.push(tr('account')) }
      if (name && !form.creator_name.trim()) { patch.creator_name = name; got.push(tr('name')) }
      if (Object.keys(patch).length) set(patch)

      // A FAILED VIEW READ IS NOT A FAILED CALL. Every one of these errors has
      // a sentence written for it already (lib/viewSync), and half of them are
      // facts about the post rather than faults - a carousel has no view count
      // and never will. If the caption came back anyway, that is worth saying
      // in the same breath rather than reporting only the miss.
      const note = []
      if (got.length) note.push(`${tr('Read')} ${got.join(', ')}.`)
      if (r?.error) {
        const d = describeSyncError(r.error)
        note.push(`${d?.label || r.error}. ${r.detail || ''}`.trim())
      }
      if (probed.status === 'rejected' && !got.length) {
        note.push(probed.reason?.message || tr('Could not reach the platform.'))
      }
      setReadNote(note.join(' ') || tr('Nothing new to fill in - everything it knows is already here.'))
    } catch (e) {
      setReadNote(e?.message || tr('Could not reach the platform.'))
    } finally {
      setReading(false)
    }
  }

  async function save() {
    const url = form.video_url.trim()
    if (!url) { setErr(tr('A link is the one thing this cannot be without.')); return }

    setSaving(true)
    setErr('')

    const [kind, id] = form.challenge ? form.challenge.split(':') : []
    const payload = {
      video_url: url,
      platform: detected?.platform || null,
      platform_video_id: detected?.id || null,
      hook: form.hook.trim() || null,
      // TYPING A HOOK CLAIMS IT. Anything else and the next sync would quietly
      // overwrite what somebody watched the video to work out.
      hook_source: form.hook.trim() && form.hook.trim() !== (row?.hook || '') ? 'manual' : (row?.hook_source || 'auto'),
      caption: form.caption.trim() || null,
      creator_name: form.creator_name.trim() || null,
      creator_handle: form.creator_handle.trim().replace(/^@/, '') || null,
      views: form.views === '' ? null : Number(form.views),
      // A HAND-TYPED NUMBER IS NEVER 'auto'. The same rule the view sync lives
      // by: a row must not claim to have been read from the platform when a
      // person put the figure there.
      views_source: form.views === '' ? null : (String(form.views) === String(row?.views ?? '') ? row?.views_source || 'manual' : 'manual'),
      community_id: form.community_id || null,
      challenge_id: kind === 'c' ? id : null,
      history_id: kind === 'h' ? id : null,
      tags: parseTags(form.tags),
      notes: form.notes.trim() || null,
      pinned: form.pinned,
    }

    const res = row?.id
      ? await supabase.from('tracked_videos').update(payload).eq('id', row.id)
      : await supabase.from('tracked_videos').insert({ ...payload, reason: 'manual', added_by: profileId || null })

    setSaving(false)
    if (res.error) {
      // The unique index on (platform, platform_video_id) is the one error a
      // person can actually do something about, so it is named rather than
      // handed back raw.
      setErr(res.error.code === '23505'
        ? tr('That video is already in the tracker.')
        : res.error.message)
      return
    }
    onSaved()
  }

  async function remove() {
    if (!row?.id) return
    // `confirm` takes the MESSAGE first and options second - see lib/confirm.
    // Passing it one object silently stringifies to "[object Object]" and the
    // dialog asks nothing at all, which is worse than not asking.
    const ok = await confirm(
      tr('It goes out of the tracker along with the hook and any notes on it. A synced video comes back on the next sync; one added by hand does not.'),
      { title: tr('Remove this video?'), confirmLabel: tr('Remove'), danger: true },
    )
    if (!ok) return
    setSaving(true)
    const { error } = await supabase.from('tracked_videos').delete().eq('id', row.id)
    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={isNew ? tr('Add a video') : tr('Edit this video')} wide>
      <div className="space-y-4">
        {err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{err}</p>}

        <Field label={tr('Link to the video')} hint={tr('Instagram, TikTok, YouTube or Facebook.')}>
          <input
            value={form.video_url}
            onChange={(e) => set({ video_url: e.target.value })}
            placeholder="https://www.instagram.com/reel/..."
            className={inputCls}
            autoFocus={isNew}
          />
          {detected && (
            <p className={cx('mt-1.5 flex items-center gap-1.5 text-xs',
              detected.platform ? 'text-smoke' : 'text-amber-700')}>
              <Icon name={detected.platform ? 'check' : 'alert'} className="h-3.5 w-3.5 shrink-0" />
              {detected.platform
                ? `${detected.platform}${detected.id ? ` · ${detected.id}` : ` · ${tr('no id in this link, which is fine')}`}`
                : tr('That host is not one of the four the tracker knows. It will still be saved.')}
            </p>
          )}
          {/* THE BUTTON THAT DOES THE TYPING. It is under the link because that
              is the only field it needs, and it is a secondary button because
              it is an offer rather than a step: everything it fills in can be
              typed instead, and on a market whose videos are unlisted it has to
              be. */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={readFromPlatform}
              disabled={reading || !form.video_url.trim()}
              className="btn-secondary !py-2 text-xs disabled:opacity-50"
            >
              {reading ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="refresh" className="h-3.5 w-3.5" />}
              {tr('Read it from the platform')}
            </button>
            {readNote && <span className="text-xs text-smoke">{readNote}</span>}
          </div>
        </Field>

        {/* THE HOOK IS THE SECOND FIELD AND THE BIGGEST ONE, because it is the
            thing the whole page exists to collect. */}
        <Field
          label={tr('The hook')}
          hint={row?.hook_source === 'manual'
            ? tr('Written by hand. A sync will not overwrite it.')
            : tr('The first thing said or shown. Taken from the caption until somebody writes a better one.')}
        >
          <AutoTextarea
            value={form.hook}
            onChange={(e) => set({ hook: e.target.value })}
            rows={2}
            placeholder={tr('Your sign to book those £53 flights to Benidorm')}
            className={inputCls}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tr('Creator')}>
            <input value={form.creator_name} onChange={(e) => set({ creator_name: e.target.value })}
              placeholder={tr('Their name')} className={inputCls} />
          </Field>
          <Field label={tr('Account')} hint={form.creator_handle ? atHandle(form.creator_handle) : tr('Without the @')}>
            <input value={form.creator_handle} onChange={(e) => set({ creator_handle: e.target.value })}
              placeholder="lisaburns_" className={inputCls} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tr('Views')} hint={form.views !== '' ? formatViews(Number(form.views) || 0) : tr('Leave empty if you do not know')}>
            <input
              value={form.views}
              onChange={(e) => set({ views: e.target.value.replace(/[^\d]/g, '') })}
              inputMode="numeric"
              placeholder="0"
              className={cx(inputCls, 'tabular-nums')}
            />
          </Field>
          <Field label={tr('Market')}>
            <Select
              inFlow
              variant="field"
              value={form.community_id}
              onChange={(v) => set({ community_id: v })}
              ariaLabel={tr('Market')}
              options={[{ value: '', label: tr('No market') },
                ...markets.map((m) => ({ value: m.id, label: m.name }))]}
            />
          </Field>
        </div>

        <Field label={tr('Challenge')} hint={tr('Live challenges and everything in the challenge log.')}>
          <Select
            inFlow
            variant="field"
            value={form.challenge}
            onChange={(v) => set({ challenge: v })}
            ariaLabel={tr('Challenge')}
            options={[{ value: '', label: tr('Not part of a challenge') },
              ...(challenges || []).map((c) => ({ value: c.key, label: c.label, hint: c.market }))]}
          />
        </Field>

        <Field label={tr('Caption')} hint={tr('What was posted with it.')}>
          <AutoTextarea value={form.caption} onChange={(e) => set({ caption: e.target.value })}
            rows={3} className={inputCls} />
        </Field>

        <Field label={tr('Tags')} hint={tr('Commas between them. POV, transition, price reveal.')}>
          <input value={form.tags} onChange={(e) => set({ tags: e.target.value })} className={inputCls} />
        </Field>

        <Field label={tr('Notes for the team')} hint={tr('Why it worked, what to copy, what not to.')}>
          <AutoTextarea value={form.notes} onChange={(e) => set({ notes: e.target.value })}
            rows={2} className={inputCls} />
        </Field>

        <label className="flex cursor-pointer items-center gap-3 rounded-card bg-cloud/60 px-4 py-3">
          <input type="checkbox" checked={form.pinned} onChange={(e) => set({ pinned: e.target.checked })}
            className="h-4 w-4 accent-[#d94407]" />
          <span className="text-sm">
            <span className="block font-semibold">{tr('Pin it to the top')}</span>
            <span className="block text-xs text-smoke">{tr('A pinned video stays first whatever the sort or the filter, and never retires.')}</span>
          </span>
        </label>

        <div className="flex flex-col gap-2 pt-1 sm:flex-row-reverse">
          <button type="button" onClick={save} disabled={saving} className="btn-primary flex-1 justify-center disabled:opacity-50">
            {saving ? <Spinner /> : isNew ? tr('Add it') : tr('Save')}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">{tr('Cancel')}</button>
          {!isNew && (
            <button type="button" onClick={remove} disabled={saving}
              className="btn-ghost justify-center text-sm text-red-600 hover:bg-red-50 sm:mr-auto">
              {tr('Remove')}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

const inputCls = 'no-ios-zoom w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-brand'

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-smoke">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-smoke">{hint}</span>}
    </label>
  )
}
