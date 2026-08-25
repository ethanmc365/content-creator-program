import { useEffect, useMemo, useState } from 'react'
import { confirm } from '../../lib/confirm'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Avatar, Badge, CopyButton, EmptyState, PageHeader, Skeleton } from '../../components/ui'
import Icon from '../../components/Icon'
import Reveal from '../../components/network/Reveal'
import PlatformBadges from '../../components/PlatformBadges'
import { useMarkets, resolveMarketForCountryName } from '../../lib/markets'
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
  const [search, setSearch] = useState('')
  const [market, setMarket] = useState('')
  const markets = useMarkets()

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
    if (!await confirm(`${verb} ${app.name}'s application?${note}`)) return
    setBusyId(app.id)
    let error
    if (status === 'active') {
      ({ error } = await supabase.from('profiles').update({ status: 'active' }).eq('id', app.id))
    } else {
      // Decline = record the decision (for analytics), then fully remove the
      // account so it never appears in the community.
      ({ error } = await supabase.rpc('admin_decline_application', { target: app.id }))
    }
    setBusyId(null)
    if (error) { flash(`Something went wrong: ${error.message}`); return }
    flash(status === 'active' ? `${app.name} approved and welcomed.` : `${app.name}'s application declined and removed.`)
    setApps((prev) => prev.filter((a) => a.id !== app.id))
  }

  // NOBODY APPLIES TO A MARKET, SO THE PAGE HAS TO WORK IT OUT.
  //
  // A creator gives us a country, and every open market owns a set of country
  // codes that do not overlap - so their market is a fact, not a question. It
  // just was not shown anywhere, which meant the person who runs Spain had to
  // read every application worldwide to find the two that were theirs.
  const marketOf = useMemo(() => {
    const out = {}
    for (const a of apps ?? []) {
      const r = resolveMarketForCountryName(a.country, markets)
      out[a.id] = r.market?.name ?? (r.outcome === 'worldwide' ? 'Worldwide' : 'Unknown')
    }
    return out
  }, [apps, markets])

  const tabs = useMemo(() => {
    const tally = {}
    for (const a of apps ?? []) tally[marketOf[a.id]] = (tally[marketOf[a.id]] ?? 0) + 1
    return Object.entries(tally).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [apps, marketOf])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (apps ?? []).filter((a) => {
      if (market && marketOf[a.id] !== market) return false
      if (!q) return true
      return `${a.name} ${a.country ?? ''} ${a.city ?? ''} ${emails[a.id] ?? ''}`.toLowerCase().includes(q)
    })
  }, [apps, search, market, marketOf, emails])

  const socialsOf = (a) => [
    { label: 'Instagram', url: a.instagram_url },
    { label: 'TikTok', url: a.tiktok_url },
    { label: 'YouTube', url: a.youtube_url },
    ...(Array.isArray(a.other_links) ? a.other_links : []),
  ].filter((s) => s.url)

  return (
    <div className="page max-w-4xl">
      <PageHeader
        back="/admin"
        title="Applications"
        subtitle="Review new creators and approve or decline their application to join the program."
      />

      {/* SEARCH AND MARKET, ABOVE THE LIST.
          Nobody applies TO a market - a creator gives us a country and the
          network works the rest out - so these tabs are the only place the
          answer is visible, and they are what lets the right admin approve the
          right people instead of reading the world's applications to find two. */}
      {apps !== null && apps.length > 0 && (
        <div className="mb-6 space-y-3">
          {tabs.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {[['', 'All', apps.length], ...tabs.map(([m, n]) => [m, m, n])].map(([key, label, count]) => {
                const on = market === key
                return (
                  <button
                    key={key || 'all'}
                    type="button"
                    onClick={() => setMarket(key)}
                    aria-pressed={on}
                    className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
                      on ? 'border-brand bg-brand text-white' : 'border-gray-200 bg-white text-smoke hover:-translate-y-0.5 hover:border-brand hover:text-brand'
                    }`}
                  >
                    {label}
                    <span className={on ? 'text-white/80' : 'text-gray-400'}>{count}</span>
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              className="input sm:max-w-xs"
              placeholder="Search name, country or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search applications"
            />
            <span className="text-xs text-smoke">{shown.length} shown</span>
          </div>
        </div>
      )}

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
        <Reveal className="space-y-5" stagger={0.05}>
          {shown.length === 0 && (
            <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">
              No applications match that.
            </p>
          )}
          {shown.map((a) => {
            const age = ageFromDob(a.dob)
            const socials = socialsOf(a)
            return (
              <div key={a.id} className="card !p-6 transition-all duration-200 hover:shadow-lift">
                <div className="flex flex-col gap-5 sm:flex-row">
                  <div className="flex items-start gap-4">
                    <Avatar src={a.photo_url} name={a.name} size="lg" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-bold">{a.name}</h2>
                        {age != null && <span className="text-sm text-smoke">{age}</span>}
                        <Badge tone="light">{marketOf[a.id]}</Badge>
                      </div>
                      {(a.city || a.country) && (
                        <p className="text-sm text-smoke">{[a.city, a.country].filter(Boolean).join(', ')}</p>
                      )}
                      {emails[a.id] && (
                        <p className="flex min-w-0 items-center gap-1">
                          <span className="truncate text-xs text-gray-400">{emails[a.id]}</span>
                          <CopyButton value={emails[a.id]} label="Copy email" className="!h-5 !w-5 shrink-0" />
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-gray-400">Applied {timeAgo(a.created_at)}</p>
                    </div>
                  </div>

                  {/* ENOUGH TO DECIDE WITHOUT LEAVING THE PAGE.
                      Ethan: show a little more on the first card so the full
                      profile is not needed. What an approval actually turns on
                      is where they are, what they post and where - so the
                      platforms they are on became marks rather than four
                      identical grey buttons, and their own words are given room
                      rather than clamped to three lines of a bio nobody wrote
                      to be read at that size. */}
                  <div className="min-w-0 flex-1 space-y-3">
                    {a.bio && <p className="text-sm font-medium leading-relaxed">{a.bio}</p>}
                    {a.about && <p className="line-clamp-4 text-sm leading-relaxed text-smoke">{a.about}</p>}

                    <div className="flex flex-wrap items-center gap-2">
                      {socials.length > 0 ? (
                        <>
                          <PlatformBadges
                            platforms={socials.map((x) => x.label).filter((l) => ['Instagram', 'TikTok', 'YouTube', 'Facebook'].includes(l))}
                            size="sm"
                          />
                          {socials.map((x) => (
                            <a
                              key={x.label + x.url}
                              href={x.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-full border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-smoke transition-colors hover:border-brand hover:text-brand"
                            >
                              {x.label} ↗
                            </a>
                          ))}
                        </>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                          No social links given
                        </span>
                      )}
                    </div>

                    <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-smoke">
                      {a.languages?.length > 0 && (
                        <div><dt className="inline font-medium text-ink">Speaks </dt><dd className="inline">{a.languages.join(', ')}</dd></div>
                      )}
                      {a.countries_visited?.length > 0 && (
                        <div><dt className="inline font-medium text-ink">Visited </dt><dd className="inline">{a.countries_visited.length} countries</dd></div>
                      )}
                      {a.referred_by && (
                        <div><dt className="inline font-medium text-ink">Referred </dt><dd className="inline">by a member</dd></div>
                      )}
                      {a.bucket_list?.length > 0 && (
                        <div><dt className="inline font-medium text-ink">Wants to visit </dt><dd className="inline">{a.bucket_list.slice(0, 3).join(', ')}</dd></div>
                      )}
                    </dl>
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
        </Reveal>
      )}
    </div>
  )
}
