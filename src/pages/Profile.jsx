import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import WorldMap from '../components/WorldMap'
import TravelGallery from '../components/TravelGallery'
import VideoThumb from '../components/VideoThumb'
import AchievementBadges from '../components/AchievementBadges'
import ConnectButton from '../components/ConnectButton'
import { loadRelationship, mutualConnections } from '../lib/connections'
import { downloadShareCard } from '../lib/shareCard'
import { flagForCountry } from '../lib/flags'
import { Avatar, Badge, Skeleton, EmptyState } from '../components/ui'
import Icon from '../components/Icon'
import { format } from 'date-fns'
import { formatDate, timeAgo, ageFromDob, cx } from '../lib/utils'

// A creator's public profile: photo, bio, socials, the orange country map,
// languages, stats and their content showcase (submitted video links).
export default function Profile() {
  const { id } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const isMe = id === user?.id
  const viewerIsAdmin = !!profile?.is_admin

  const [creator, setCreator] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [challengeCount, setChallengeCount] = useState(0)
  const [relation, setRelation] = useState(null)
  const [trips, setTrips] = useState([])
  const [mutualCount, setMutualCount] = useState(0)
  const [loading, setLoading] = useState(true)
  // Private contact details (email + phone), only fetched for admin viewers.
  const [contact, setContact] = useState(null)
  // Aggregated stats that drive the achievement badges.
  const [badgeStats, setBadgeStats] = useState(null)
  const [sharing, setSharing] = useState(false)

  async function shareCard() {
    setSharing(true)
    await downloadShareCard({
      name: creator.name,
      photoUrl: creator.photo_url,
      city: creator.city,
      country: creator.country,
      joinedYear: (creator.accepted_at || creator.created_at) ? new Date(creator.accepted_at || creator.created_at).getFullYear() : null,
      stats: {
        countries: creator.countries_visited?.length || 0,
        videos: submissions.length,
        totalViews: badgeStats?.totalViews || 0,
      },
    })
    setSharing(false)
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: p }, { data: subs }, rel, { data: results }, { count: referralCount }, { data: tripsData }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', id).single(),
        supabase
          .from('submissions')
          .select('*, challenges(title)')
          .eq('creator_id', id)
          .order('submitted_at', { ascending: false }),
        isMe ? Promise.resolve(null) : loadRelationship(user.id, id),
        supabase.from('results').select('final_views, rank').eq('creator_id', id),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('referred_by', id),
        supabase.from('collab_posts').select('id, city, country, start_date, end_date').eq('creator_id', id).gte('end_date', format(new Date(), 'yyyy-MM-dd')).order('start_date', { ascending: true }),
      ])
      setCreator(p)
      setSubmissions(subs ?? [])
      setChallengeCount(new Set((subs ?? []).map((s) => s.challenge_id)).size)
      setRelation(rel)
      setTrips(tripsData ?? [])
      const r = results ?? []
      setBadgeStats({
        submissions: (subs ?? []).length,
        challenges: new Set((subs ?? []).map((s) => s.challenge_id)).size,
        totalViews: r.reduce((sum, x) => sum + (x.final_views || 0), 0),
        bestRank: r.length ? Math.min(...r.map((x) => x.rank)) : 0,
        wins: r.filter((x) => x.rank === 1).length,
        countries: (p?.countries_visited ?? []).length,
        languages: (p?.languages ?? []).length,
        referrals: referralCount ?? 0,
      })
      setLoading(false)
    }
    load()
  }, [id, user.id, isMe])

  // Mutual connections (people you both know), shown on other people's profiles.
  useEffect(() => {
    if (isMe || !user?.id) { setMutualCount(0); return }
    let cancelled = false
    mutualConnections(user.id, id).then((n) => { if (!cancelled) setMutualCount(n) })
    return () => { cancelled = true }
  }, [id, user?.id, isMe])

  // Admins (and only admins) see the creator's email + phone. The RPC and the
  // creator_private RLS both enforce admin-only access server-side too.
  useEffect(() => {
    if (!viewerIsAdmin) { setContact(null); return }
    async function loadContact() {
      const [{ data: email }, { data: priv }] = await Promise.all([
        supabase.rpc('admin_get_email', { target: id }),
        supabase.from('creator_private').select('phone, phone_country').eq('id', id).maybeSingle(),
      ])
      setContact({
        email: email || '',
        phone: priv ? [priv.phone_country, priv.phone].filter(Boolean).join(' ').trim() : '',
      })
    }
    loadContact()
  }, [id, viewerIsAdmin, isMe])

  async function startMessage() {
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(participant_a.eq.${user.id},participant_b.eq.${id}),and(participant_a.eq.${id},participant_b.eq.${user.id})`)
      .maybeSingle()
    if (existing) return navigate(`/messages/${existing.id}`)
    const { data: created } = await supabase
      .from('conversations')
      .insert({ participant_a: user.id, participant_b: id })
      .select('id')
      .single()
    if (created) navigate(`/messages/${created.id}`)
  }

  if (loading) {
    return (
      <div className="page space-y-8">
        <div className="flex items-center gap-6">
          <Skeleton className="h-28 w-28 rounded-full" />
          <div className="flex-1 space-y-3"><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-72" /></div>
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  if (!creator) {
    return (
      <div className="page">
        <EmptyState emoji="🧭" title="Creator not found" hint="They may have left the program." action={<Link to="/creators" className="btn-primary">Browse creators</Link>} />
      </div>
    )
  }

  const socials = [
    { url: creator.instagram_url, label: 'Instagram' },
    { url: creator.tiktok_url, label: 'TikTok' },
    { url: creator.youtube_url, label: 'YouTube' },
    ...(Array.isArray(creator.other_links) ? creator.other_links.map((l) => ({ url: l.url, label: l.label || 'Link' })) : []),
  ].filter((s) => s.url)

  return (
    <div className="page space-y-10">
      {/* ---------- Header ---------- */}
      <section className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-start sm:text-left">
        <Avatar src={creator.photo_url} name={creator.name} size="xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{creator.name}</h1>
            {creator.is_admin && <Badge tone="light">Tryp.com Team</Badge>}
            {(ageFromDob(creator.dob) ?? creator.age) && <span className="text-smoke">{ageFromDob(creator.dob) ?? creator.age}</span>}
          </div>
          {(creator.city || creator.country) && (
            <p className="mt-1 flex items-center justify-center gap-1 text-sm text-smoke sm:justify-start">
              <svg className="h-4 w-4 text-brand" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
              {[creator.city, creator.country].filter(Boolean).join(', ')}
            </p>
          )}
          {creator.bio && <p className="mt-2 text-lg text-smoke">{creator.bio}</p>}
          {creator.favourite_quote && (
            <p className="mt-3 border-l-2 border-brand pl-3 text-sm italic text-smoke">“{creator.favourite_quote}”</p>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            {socials.map((s) => (
              <a key={s.label} href={s.url} target="_blank" rel="noopener noreferrer" className="btn-secondary !px-4 !py-2 text-xs">
                {s.label} ↗
              </a>
            ))}
          </div>
          {!isMe && mutualCount > 0 && (
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs font-medium text-smoke sm:justify-start">
              <Icon name="users" className="h-4 w-4 text-brand" />
              {mutualCount} mutual connection{mutualCount === 1 ? '' : 's'}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-3">
          {isMe ? (
            <>
              <Link to="/profile/edit" className="btn-primary">Edit profile</Link>
              <div className="group relative">
                <button onClick={shareCard} disabled={sharing} className="btn-secondary">{sharing ? 'Creating…' : 'Share card'}</button>
                <div className="pointer-events-none absolute right-0 top-full z-20 mt-2 hidden w-60 rounded-lg bg-ink px-3 py-2 text-left text-xs font-medium leading-snug text-white shadow-lift group-hover:block">
                  Download a polished card to share on LinkedIn, Instagram or your portfolio.
                </div>
              </div>
            </>
          ) : (
            <>
              <ConnectButton
                myId={user.id}
                targetId={id}
                relation={relation}
                onChange={setRelation}
                className="!py-2.5"
              />
              <button onClick={startMessage} className="btn-secondary">Message</button>
            </>
          )}
        </div>
      </section>

      {/* ---------- Admin-only contact (email + phone) ---------- */}
      {viewerIsAdmin && contact && (contact.email || contact.phone) && (
        <section className="rounded-card border border-brand/20 bg-brand-tint/40 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand">
            <Icon name="eye" className="h-4 w-4" />
            Contact details
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {contact.email && (
              <div>
                <p className="text-xs font-medium text-smoke">Email</p>
                <a href={`mailto:${contact.email}`} className="text-sm font-medium hover:text-brand">{contact.email}</a>
              </div>
            )}
            {contact.phone && (
              <div>
                <p className="text-xs font-medium text-smoke">Phone</p>
                <a href={`tel:${contact.phone.replace(/\s+/g, '')}`} className="text-sm font-medium hover:text-brand">{contact.phone}</a>
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-smoke">Only visible to the Tryp.com Team.</p>
        </section>
      )}

      {/* ---------- Stats strip ---------- */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Member since', value: formatDate(creator.accepted_at || creator.created_at) },
          { label: 'Countries visited', value: creator.countries_visited?.length || 0 },
          { label: 'Challenges entered', value: challengeCount },
          { label: 'Submissions', value: submissions.length },
        ].map((s) => (
          <div key={s.label} className="rounded-card bg-cloud px-5 py-4 text-center">
            <p className="text-xl font-bold">{s.value}</p>
            <p className="mt-0.5 text-xs font-medium text-smoke">{s.label}</p>
          </div>
        ))}
      </section>

      {/* ---------- About (bio) ---------- */}
      {creator.about && (
        <section className="card">
          <h2 className="mb-3 text-lg font-semibold">About {creator.name.split(' ')[0]}</h2>
          <p className="whitespace-pre-line leading-relaxed text-smoke">{creator.about}</p>
        </section>
      )}

      {/* ---------- Achievements ---------- */}
      {badgeStats && !creator.is_admin && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Achievements</h2>
          <AchievementBadges stats={badgeStats} showLocked />
        </section>
      )}

      {/* ---------- Where I'm headed next (upcoming collab trips) ---------- */}
      {(trips.length > 0 || isMe) && (
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">
              {isMe ? "Where I'm headed next" : `Where ${creator.name.split(' ')[0]}'s headed next`}
            </h2>
            <Link to="/collab" className="text-sm font-medium text-brand hover:underline">{isMe ? 'Post a trip' : 'Collab board'}</Link>
          </div>
          {trips.length === 0 ? (
            <p className="text-sm text-smoke">No upcoming trips posted. Share where you’re headed on the collab board so nearby creators can meet up.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {trips.map((t) => {
                const flag = flagForCountry(t.country)
                return (
                  <Link key={t.id} to="/collab" className="flex items-center gap-3 rounded-card border border-gray-100 bg-white px-4 py-3 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift">
                    <span className="text-2xl leading-none" aria-hidden>{flag || '📍'}</span>
                    <span>
                      <span className="block text-sm font-semibold">{t.city}{t.country ? `, ${t.country}` : ''}</span>
                      <span className="block text-xs text-smoke">{format(new Date(t.start_date), 'd MMM')} – {format(new Date(t.end_date), 'd MMM yyyy')}</span>
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* ---------- Languages ---------- */}
      {creator.languages?.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Languages</h2>
          <div className="flex flex-wrap gap-2">
            {creator.languages.map((l) => <Badge key={l} tone="light">{l}</Badge>)}
          </div>
        </section>
      )}

      {/* ---------- Travel bucket list ---------- */}
      {creator.bucket_list?.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">
            {isMe ? 'My travel bucket list' : `${creator.name.split(' ')[0]}'s travel bucket list`}
          </h2>
          <div className="flex flex-wrap gap-2">
            {creator.bucket_list.map((b, i) => (
              <Badge key={i} tone="light">
                {flagForCountry(b.country)} {b.city ? `${b.city}, ${b.country}` : b.country}
              </Badge>
            ))}
          </div>
        </section>
      )}

      {/* ---------- World map (countries visited) ---------- */}
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">
            {creator.countries_visited?.length || 0} {creator.countries_visited?.length === 1 ? 'country' : 'countries'} visited
          </h2>
          {isMe && <Link to="/profile/edit" className="text-sm font-medium text-brand hover:underline">Update map</Link>}
        </div>
        <WorldMap selected={creator.countries_visited || []} />
        {creator.countries_visited?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {[...creator.countries_visited].sort().map((c) => (
              <Badge key={c} tone="grey">{c}</Badge>
            ))}
          </div>
        )}
      </section>

      {/* ---------- Travel photos ---------- */}
      <ProfileGallery creatorId={creator.id} isMe={isMe} creatorName={creator.name} />

      {/* ---------- Content showcase (creators only; admins don't submit) ---------- */}
      {!creator.is_admin && (
      <section>
        <h2 className="mb-4 text-lg font-semibold">Content showcase</h2>
        {submissions.length === 0 ? (
          <EmptyState
            icon={<Icon name="video" className="h-7 w-7" />}
            title={isMe ? 'No submissions yet' : `${creator.name.split(' ')[0]} hasn't submitted yet`}
            hint={isMe ? 'Enter the current challenge and your videos will show up here.' : 'Their challenge entries will appear here.'}
            action={isMe && <Link to="/challenges" className="btn-primary">View challenges</Link>}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {submissions.map((s) => (
              <a
                key={s.id}
                href={s.video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="card group overflow-hidden !p-0 transition-all hover:-translate-y-0.5 hover:shadow-lift"
              >
                <VideoThumb url={s.video_url} platform={s.platform} className="rounded-b-none" />
                <div className="p-5">
                  <div className="flex items-center justify-between gap-3 text-xs text-smoke">
                    <span className="truncate">{s.challenges?.title}</span>
                    <span className="shrink-0">{timeAgo(s.submitted_at)}</span>
                  </div>
                  <p className={cx('mt-2 text-sm font-medium group-hover:text-brand', !s.caption && 'text-smoke')}>
                    {s.caption || 'View the video ↗'}
                  </p>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
      )}
    </div>
  )
}

// Travel photo section. The section ALWAYS renders (even with no photos) so a
// profile never looks broken/incomplete. On your own profile an empty state
// nudges you to add photos; on someone else's it says they haven't added any.
function ProfileGallery({ creatorId, isMe, creatorName }) {
  const [count, setCount] = useState(null)
  useEffect(() => {
    supabase
      .from('creator_photos')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', creatorId)
      .then(({ count }) => setCount(count ?? 0))
  }, [creatorId])

  // Hold the section until we know the count, so the empty state doesn't flash.
  if (count === null) return null

  const firstName = creatorName?.split(' ')[0] || 'This creator'

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Icon name="image" className="h-5 w-5 text-brand" /> Travel photos</h2>
        {isMe && count > 0 && <Link to="/profile/edit" className="text-sm font-medium text-brand hover:underline">Manage photos</Link>}
      </div>
      {count === 0 ? (
        isMe ? (
          <EmptyState
            icon={<Icon name="image" className="h-7 w-7" />}
            title="Add your travel photos"
            hint="Share up to 10 shots from your trips to bring your profile to life."
            action={<Link to="/profile/edit" className="btn-primary">Add photos</Link>}
          />
        ) : (
          <EmptyState
            icon={<Icon name="image" className="h-7 w-7" />}
            title="No travel photos yet"
            hint={`${firstName} hasn't added any travel photos yet.`}
          />
        )
      ) : (
        <TravelGallery creatorId={creatorId} />
      )}
    </section>
  )
}
