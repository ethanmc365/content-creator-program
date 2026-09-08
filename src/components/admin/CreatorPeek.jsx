import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Avatar, Modal, Skeleton, CopyButton } from '../ui'
import Icon from '../Icon'
import { formatDateTimeTz } from '../../lib/utils'
import { useT } from '../../lib/i18n'

// THE ADMIN RECORD, WHERE THE ADMIN ALREADY IS.
//
// Ethan: "for admins, whenever they're viewing any creator profile, clicking on
// the creator's name should show up the details like it would if I was on the
// admin panel, went to creators and clicked their name there. Show the little
// pop-up that I can click on their profile or dashboard to see their contact
// details or submissions etc, and the team note. So clicking on their name as
// an admin brings up that pop-up, so I don't have to go into creators every
// time I want that information."
//
// WHY IT IS A NEW COMPONENT AND NOT THE ADMIN MODAL MOVED. The sheet on
// /admin/creators is welded to that page: it reads from the list's own state
// (the roster, the market map, the emails, the activity map, all fetched in one
// batch for the whole table) and it carries the destructive controls - suspend,
// promote, delete - which belong on a page you deliberately went to. Lifting it
// would mean either dragging that whole loader along or gutting it.
//
// So this asks the same questions of the same tables, for ONE creator, and
// answers the ones somebody looking at a profile actually has: how do I reach
// them, what have they posted, what have they been paid, what has the team said
// about them. Anything that changes their account is a link away, on the page
// where that is the point.
//
// THE NOTE IS THE SAME ROW. `creator_admin_notes` is one row per creator with
// an admins-only policy, so a note written here is the note the roster shows
// and vice versa. It would be worse than useless as a second, private copy.
export default function CreatorPeek({ creator, open, onClose }) {
  const tr = useT()
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [note, setNote] = useState('')
  const [noteMeta, setNoteMeta] = useState(null)
  const [saved, setSaved] = useState(false)
  const id = creator?.id

  useEffect(() => {
    if (!open || !id) { setData(null); setNote(''); setNoteMeta(null); setSaved(false); return undefined }
    let alive = true
    async function load() {
      const [{ data: subs }, { data: rewards }, { data: n }, { data: priv }, { data: emails }, { data: members }] =
        await Promise.all([
          supabase.from('submissions').select('id, video_url, platform, logged_views, submitted_at, challenges(title)')
            .eq('creator_id', id).order('submitted_at', { ascending: false }).limit(5),
          supabase.from('rewards').select('amount, currency, status').eq('creator_id', id),
          supabase.from('creator_admin_notes').select('note, updated_at, updated_by').eq('creator_id', id).maybeSingle(),
          supabase.from('creator_private').select('phone, phone_country').eq('id', id).maybeSingle(),
          // The address lives in `auth.users`, which no client may read. This is
          // the definer RPC the roster uses, asked for one row.
          supabase.rpc('admin_list_emails'),
          supabase.from('community_members').select('communities(name)').eq('profile_id', id),
        ])
      if (!alive) return
      setData({
        subs: subs ?? [],
        rewards: rewards ?? [],
        priv: priv ?? {},
        email: (emails ?? []).find((r) => r.id === id)?.email || null,
        markets: (members ?? []).map((m) => m.communities?.name).filter(Boolean),
      })
      setNote(n?.note ?? '')
      setNoteMeta(n?.note ? { at: n.updated_at } : null)
    }
    load()
    return () => { alive = false }
  }, [open, id])

  async function saveNote() {
    const { error } = await supabase.from('creator_admin_notes').upsert({
      creator_id: id, note, updated_by: user.id, updated_at: new Date().toISOString(),
    })
    // THE RESULT IS READ. A refused upsert resolves like a successful one in
    // supabase-js, and a team note that silently did not save is worse than no
    // note at all - the next admin reads an empty box and assumes nobody looked.
    if (error) { setSaved('error'); return }
    setNoteMeta(note.trim() ? { at: new Date().toISOString() } : null)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!creator) return null
  const phone = data?.priv?.phone ? `${data.priv.phone_country || ''} ${data.priv.phone}`.trim() : null
  const paid = (data?.rewards ?? []).filter((r) => r.status === 'paid')

  return (
    <Modal open={open} onClose={onClose} title={tr('Creator record')} sheet={false}>
      <div className="space-y-5">
        <div className="flex items-center gap-3.5">
          <Avatar src={creator.photo_url} name={creator.name} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold">{creator.name}</p>
            <p className="truncate text-xs text-smoke">
              {(data?.markets ?? []).join(' · ') || [creator.city, creator.country].filter(Boolean).join(', ') || tr('No market yet')}
            </p>
          </div>
        </div>

        {/* ---- Contact, which is the commonest reason for opening this ---- */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{tr('Team only')}</p>
          {!data ? (
            <><Skeleton className="h-11 w-full rounded-xl" /><Skeleton className="mt-2 h-11 w-full rounded-xl" /></>
          ) : (
            <>
              <Row icon="envelope" value={data.email} empty={tr('No email on file')} />
              <Row icon="device" value={phone} empty={tr('No phone number given')} />
            </>
          )}
        </div>

        {/* ---- What they have done ---- */}
        <div className="grid grid-cols-3 gap-2">
          <Tile label={tr('Entries')} value={data ? data.subs.length : null} />
          <Tile label={tr('Paid')} value={data ? paid.length : null} />
          <Tile label={tr('Joined')} value={creator.created_at ? new Date(creator.created_at).getFullYear() : '—'} />
        </div>

        {data?.subs.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{tr('Latest entries')}</p>
            <ul className="divide-y divide-gray-100 rounded-card border border-gray-100">
              {data.subs.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{s.challenges?.title || tr('A challenge')}</span>
                    <span className="block truncate text-[11px] text-smoke">
                      {s.platform || '—'} · {formatDateTimeTz(s.submitted_at)}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums">
                    {(s.logged_views ?? 0).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ---- The shared team note ---- */}
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {tr('Team note')}
            {noteMeta && <span className="ml-2 font-normal normal-case tracking-normal text-gray-300">{formatDateTimeTz(noteMeta.at)}</span>}
          </p>
          <textarea
            value={note}
            onChange={(e) => { setNote(e.target.value); setSaved(false) }}
            rows={3}
            placeholder={tr('Anything the team should know. Every admin sees this.')}
            className="input resize-none text-sm"
          />
          <div className="mt-2 flex items-center justify-end gap-3">
            {saved === 'error' && <span className="text-xs font-medium text-red-600">{tr('Could not save')}</span>}
            {saved === true && <span className="text-xs font-medium text-green-600">{tr('Saved')}</span>}
            <button type="button" onClick={saveNote} className="btn-secondary !py-2 text-xs">{tr('Save note')}</button>
          </div>
        </div>

        {/* ---- THEIR OWN PAGES, AS THEY SEE THEM (8 Sep 2026) ----
            Ethan: "instead of this, it should just show up the popup with
            everything - the popup that normally shows up when clicking on a
            creator's profile on the creators page... so I can view their
            dashboard, etcetera."

            The sheet on /admin/creators has carried "Their profile / Their
            dashboard / Their rewards" for weeks and this one had a button that
            navigated AWAY to go and find them. So every question this popup is
            opened to answer - what have they earned, where are they on the
            milestones, what does their dashboard say - cost a page load and
            losing your place, which is the exact friction that made him ask for
            the popup in the first place ("so I don't have to go into creators
            every time I want that information").

            `?as=<id>` is the existing read-only mechanism - see
            components/ViewingAs. It is inert for anybody who is not an admin,
            and it grants nothing: it chooses which id the page filters on, and
            row-level security decides what comes back. */}
        <div className="border-t border-gray-100 pt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {tr('Their pages')}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <PeekLink to={`/dashboard?as=${creator.id}`} onClose={onClose} icon="chart" label={tr('Dashboard')} />
            <PeekLink to={`/rewards?as=${creator.id}`} onClose={onClose} icon="money" label={tr('Rewards')} />
            <PeekLink to={`/milestones?as=${creator.id}`} onClose={onClose} icon="trophy" label={tr('Milestones')} />
            <PeekLink to={`/admin/creators?open=${creator.id}`} onClose={onClose} icon="shield" label={tr('Admin record')} />
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Link to={`/messages?to=${creator.id}`} onClick={onClose} className="btn-primary flex-1 justify-center !py-2.5 text-xs">
            <Icon name="envelope" className="h-4 w-4" />
            {tr('Message')}
          </Link>
        </div>
      </div>
    </Modal>
  )
}

// One of the four ways out of the sheet. A tile rather than a button row
// because four full-width buttons is a stack taller than the record above it,
// and these are destinations, not actions.
function PeekLink({ to, onClose, icon, label }) {
  return (
    <Link
      to={to}
      onClick={onClose}
      className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-100 px-2 py-3 text-center text-[11px] font-semibold text-smoke transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/40 hoverable:hover:text-brand"
    >
      <Icon name={icon} className="h-4 w-4" />
      {label}
    </Link>
  )
}

function Row({ icon, value, empty }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-cloud/40 px-3.5 py-2.5">
      <Icon name={icon} className="h-4 w-4 shrink-0 text-brand" />
      {value
        ? <>
            <span className="min-w-0 flex-1 select-all break-all text-sm font-medium text-ink">{value}</span>
            <CopyButton value={value} label="Copy" />
          </>
        : <span className="min-w-0 flex-1 text-sm text-gray-400">{empty}</span>}
    </div>
  )
}

function Tile({ label, value }) {
  return (
    <div className="rounded-xl border border-gray-100 px-3 py-2.5 text-center">
      {value === null
        ? <Skeleton className="mx-auto h-5 w-8 rounded" />
        : <p className="text-lg font-bold tabular-nums">{value}</p>}
      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
    </div>
  )
}
