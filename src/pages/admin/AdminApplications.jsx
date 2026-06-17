import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Avatar, Badge, EmptyState, PageHeader, Skeleton } from '../../components/ui'
import Icon from '../../components/Icon'
import { ageFromDob, timeAgo } from '../../lib/utils'

// Signup review: new creators sign up and complete their profile, then wait
// here as 'pending' until an admin approves or declines them. Approving flips
// status to 'active' (a DB trigger sends them a welcome notification);
// declining flips it to 'declined'.
export default function AdminApplications() {
  const [apps, setApps] = useState(null)
  const [emails, setEmails] = useState({})
  const [busyId, setBusyId] = useState(null)
  const [toast, setToast] = useState('')

  async function load() {
    const [{ data: profiles }, { data: emailRows }] = await Promise.all([
      supabase.from('profiles').select('*').eq('status', 'pending').eq('onboarded', true).order('created_at', { ascending: true }),
      supabase.rpc('admin_list_emails'),
    ])
    setApps(profiles ?? [])
    setEmails(Object.fromEntries((emailRows ?? []).map((r) => [r.id, r.email])))
  }

  useEffect(() => { load() }, [])

  function flash(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  async function decide(app, status) {
    const verb = status === 'active' ? 'Approve' : 'Decline'
    const note = status === 'active' ? '' : ' This permanently deletes their account.'
    if (!confirm(`${verb} ${app.name}'s application?${note}`)) return
    setBusyId(app.id)
    if (status === 'active') {
      await supabase.from('profiles').update({ status: 'active' }).eq('id', app.id)
    } else {
      // Decline = fully remove the account so it never appears in the community.
      await supabase.rpc('admin_delete_creator', { target: app.id })
    }
    setBusyId(null)
    flash(status === 'active' ? `${app.name} approved and welcomed.` : `${app.name}'s application declined and removed.`)
    setApps((prev) => prev.filter((a) => a.id !== app.id))
  }

  const socialsOf = (a) => [
    { label: 'Instagram', url: a.instagram_url },
    { label: 'TikTok', url: a.tiktok_url },
    { label: 'YouTube', url: a.youtube_url },
    ...(Array.isArray(a.other_links) ? a.other_links : []),
  ].filter((s) => s.url)

  return (
    <div className="page max-w-4xl">
      <PageHeader
        title="Applications"
        subtitle="Review new creators and approve or decline their application to join the program."
      />

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white shadow-lift lg:bottom-8">
          {toast}
        </div>
      )}

      {apps === null ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
      ) : apps.length === 0 ? (
        <EmptyState icon={<Icon name="check" className="h-7 w-7" />} title="No applications waiting" hint="When a new creator finishes their profile, they'll appear here for review." />
      ) : (
        <div className="space-y-5">
          {apps.map((a) => {
            const age = ageFromDob(a.dob)
            const socials = socialsOf(a)
            return (
              <div key={a.id} className="card !p-6">
                <div className="flex flex-col gap-5 sm:flex-row">
                  <div className="flex items-start gap-4">
                    <Avatar src={a.photo_url} name={a.name} size="lg" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-bold">{a.name}</h2>
                        {age != null && <span className="text-sm text-smoke">{age}</span>}
                        <Badge tone="amber">Pending</Badge>
                      </div>
                      {(a.city || a.country) && (
                        <p className="text-sm text-smoke">{[a.city, a.country].filter(Boolean).join(', ')}</p>
                      )}
                      {emails[a.id] && <p className="text-xs text-gray-400">{emails[a.id]}</p>}
                      <p className="mt-0.5 text-xs text-gray-400">Applied {timeAgo(a.created_at)}</p>
                    </div>
                  </div>

                  <div className="min-w-0 flex-1 space-y-3">
                    {a.bio && <p className="text-sm font-medium">{a.bio}</p>}
                    {a.about && <p className="line-clamp-3 text-sm text-smoke">{a.about}</p>}
                    <div className="flex flex-wrap gap-2">
                      {socials.length > 0 ? socials.map((s) => (
                        <a key={s.label + s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="btn-secondary !px-3 !py-1.5 text-xs">
                          {s.label} ↗
                        </a>
                      )) : <span className="text-xs text-gray-400">No social links provided</span>}
                    </div>
                    {a.languages?.length > 0 && (
                      <p className="text-xs text-smoke">Speaks: {a.languages.join(', ')}</p>
                    )}
                    {a.countries_visited?.length > 0 && (
                      <p className="text-xs text-smoke">{a.countries_visited.length} countries visited</p>
                    )}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-gray-50 pt-4">
                  <Link to={`/profile/${a.id}`} className="btn-ghost !py-2 text-xs">View full profile</Link>
                  <button onClick={() => decide(a, 'declined')} disabled={busyId === a.id} className="btn-danger !py-2 text-xs">Decline</button>
                  <button onClick={() => decide(a, 'active')} disabled={busyId === a.id} className="btn-primary !py-2 text-xs">Approve</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
