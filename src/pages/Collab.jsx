import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Avatar, Badge, EmptyState, PageHeader, Skeleton, Spinner } from '../components/ui'
import Icon from '../components/Icon'
import WorldMap from '../components/WorldMap'
import { loadMapCountryNames, canonicalCountry } from '../lib/mapCountries'

// Travel collab board. Creators post "I'll be in <city> on <dates>" and others
// browse who's travelling where, then reach out via DM or "I'm interested".
// Past trips drop off the map + upcoming list into an Archive section below.

// date-only strings (yyyy-mm-dd) parsed in LOCAL time so they never shift a day.
function localDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function fmtRange(start, end) {
  const s = localDate(start)
  const e = localDate(end)
  const sameYear = s.getFullYear() === e.getFullYear()
  const sameMonth = sameYear && s.getMonth() === e.getMonth()
  if (sameMonth) return `${format(s, 'd')}–${format(e, 'd MMM yyyy')}`
  if (sameYear) return `${format(s, 'd MMM')} – ${format(e, 'd MMM yyyy')}`
  return `${format(s, 'd MMM yyyy')} – ${format(e, 'd MMM yyyy')}`
}

const todayYmd = () => format(new Date(), 'yyyy-MM-dd')

// A trip overlaps a "yyyy-MM" month if any of its days fall inside it.
function tripInMonth(p, ym) {
  if (!ym) return true
  const [y, m] = ym.split('-').map(Number)
  const monthStart = new Date(y, m - 1, 1)
  const monthEnd = new Date(y, m, 0)
  return localDate(p.start_date) <= monthEnd && localDate(p.end_date) >= monthStart
}

export default function Collab() {
  const { user, isAdmin, profile } = useAuth()
  const navigate = useNavigate()
  const [posts, setPosts] = useState(null)
  const [interests, setInterests] = useState({ count: new Map(), mine: new Set() })
  const [form, setForm] = useState({ city: '', country: '', start_date: '', end_date: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [countryNames, setCountryNames] = useState([])
  const [monthFilter, setMonthFilter] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  const canPost = profile?.status === 'active'

  useEffect(() => { loadMapCountryNames().then(setCountryNames) }, [])

  async function load() {
    const today = todayYmd()
    const [{ data }, { data: ints }] = await Promise.all([
      supabase.from('collab_posts').select('*, profiles:creator_id(id, name, photo_url)').order('start_date', { ascending: true }).limit(300),
      supabase.from('collab_interests').select('post_id, creator_id'),
    ])
    setPosts((data ?? []).map((p) => ({ ...p, isPast: p.end_date < today })))
    const count = new Map()
    const mine = new Set()
    for (const i of ints ?? []) {
      count.set(i.post_id, (count.get(i.post_id) || 0) + 1)
      if (i.creator_id === user.id) mine.add(i.post_id)
    }
    setInterests({ count, mine })
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const upcoming = useMemo(() => (posts ?? []).filter((p) => !p.isPast), [posts])
  const archived = useMemo(() => (posts ?? []).filter((p) => p.isPast).reverse(), [posts])

  // Filter option lists derived from the live upcoming trips.
  const monthOptions = useMemo(() => {
    const set = new Set()
    for (const p of upcoming) { set.add(p.start_date.slice(0, 7)); set.add(p.end_date.slice(0, 7)) }
    return [...set].sort()
  }, [upcoming])
  const countryOptions = useMemo(() => {
    const set = new Set()
    for (const p of upcoming) { const c = canonicalCountry(p.country, countryNames) || p.country; if (c) set.add(c) }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [upcoming, countryNames])

  const filteredUpcoming = useMemo(() => upcoming.filter((p) => {
    if (!tripInMonth(p, monthFilter)) return false
    if (countryFilter) {
      const c = canonicalCountry(p.country, countryNames) || p.country
      if (c !== countryFilter) return false
    }
    return true
  }), [upcoming, monthFilter, countryFilter, countryNames])

  const boardCountries = useMemo(() => {
    const set = new Set()
    for (const p of filteredUpcoming) { const c = canonicalCountry(p.country, countryNames); if (c) set.add(c) }
    return [...set]
  }, [filteredUpcoming, countryNames])

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!form.city.trim() || !form.start_date || !form.end_date) { setError('Add a city and both dates.'); return }
    if (form.end_date < form.start_date) { setError('The end date can’t be before the start date.'); return }
    setBusy(true)
    const { error: insErr } = await supabase.from('collab_posts').insert({
      creator_id: user.id,
      city: form.city.trim(),
      country: form.country.trim() || null,
      start_date: form.start_date,
      end_date: form.end_date,
      note: form.note.trim() || null,
    })
    setBusy(false)
    if (insErr) { setError('Could not post that. Please try again.'); return }
    setForm({ city: '', country: '', start_date: '', end_date: '', note: '' })
    load()
  }

  async function remove(id) {
    setPosts((p) => p.filter((x) => x.id !== id))
    await supabase.from('collab_posts').delete().eq('id', id)
  }

  async function toggleInterest(postId) {
    const has = interests.mine.has(postId)
    setInterests((prev) => {
      const mine = new Set(prev.mine)
      const count = new Map(prev.count)
      if (has) { mine.delete(postId); count.set(postId, Math.max(0, (count.get(postId) || 1) - 1)) }
      else { mine.add(postId); count.set(postId, (count.get(postId) || 0) + 1) }
      return { count, mine }
    })
    if (has) await supabase.from('collab_interests').delete().eq('post_id', postId).eq('creator_id', user.id)
    else await supabase.from('collab_interests').insert({ post_id: postId, creator_id: user.id })
  }

  // Open (or create) the 1:1 conversation with a poster, then jump into it.
  async function message(creatorId) {
    if (creatorId === user.id) return
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(participant_a.eq.${user.id},participant_b.eq.${creatorId}),and(participant_a.eq.${creatorId},participant_b.eq.${user.id})`)
      .maybeSingle()
    if (existing) return navigate(`/messages/${existing.id}`)
    const { data: created } = await supabase
      .from('conversations').insert({ participant_a: user.id, participant_b: creatorId }).select('id').single()
    if (created) navigate(`/messages/${created.id}`)
  }

  function TripCard({ p, past = false }) {
    const person = p.profiles || {}
    const mine = p.creator_id === user.id
    const mapCountry = canonicalCountry(p.country, countryNames)
    const interestCount = interests.count.get(p.id) || 0
    const iAmInterested = interests.mine.has(p.id)
    return (
      <div className={`card flex flex-col gap-4 !p-6 ${past ? 'opacity-75' : ''}`}>
        <div className="flex items-start justify-between gap-3">
          <Link to={`/profile/${person.id}`} className="flex items-center gap-3 group">
            <Avatar src={person.photo_url} name={person.name} size="md" />
            <div className="min-w-0">
              <p className="truncate font-semibold group-hover:text-brand">{person.name}</p>
              <p className="flex items-center gap-1 text-xs text-smoke">
                <Icon name="pin" className="h-3.5 w-3.5" />
                {p.city}{p.country ? `, ${p.country}` : ''}
              </p>
            </div>
          </Link>
          {(mine || isAdmin) && (
            <button onClick={() => remove(p.id)} aria-label="Delete trip" className="shrink-0 rounded-lg p-1.5 text-smoke transition-colors hover:bg-red-50 hover:text-red-600">
              <Icon name="trash" className="h-4 w-4" />
            </button>
          )}
        </div>

        <Badge tone={past ? 'grey' : 'brand'}><Icon name="calendar" className="mr-1 inline h-3.5 w-3.5" />{fmtRange(p.start_date, p.end_date)}</Badge>

        {!past && mapCountry && (
          <div className="overflow-hidden rounded-card">
            <WorldMap selected={[mapCountry]} focusCountry={mapCountry} />
          </div>
        )}

        {p.note && <p className="text-sm leading-relaxed text-ink/90">{p.note}</p>}

        {!mine && !past && (
          <div className="mt-auto flex flex-col gap-2">
            <button onClick={() => toggleInterest(p.id)} className={iAmInterested ? 'btn-primary w-full !py-2 text-sm' : 'btn-secondary w-full !py-2 text-sm'}>
              {iAmInterested ? '✓ Interested' : "I'm interested"}
              {interestCount > 0 && <span className="ml-1 opacity-80">· {interestCount}</span>}
            </button>
            <button onClick={() => message(p.creator_id)} className="btn-secondary w-full !py-2 text-sm">
              Message {person.name?.split(' ')[0]}
            </button>
          </div>
        )}
        {mine && !past && (
          <p className="mt-auto text-xs text-smoke">
            Your trip · visible to the community{interestCount > 0 ? ` · ${interestCount} interested` : ''}
          </p>
        )}
        {past && <p className="mt-auto text-xs text-smoke">Trip ended</p>}
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader
        title="Travel collab board"
        subtitle="Heading somewhere? Post your trip so nearby creators can meet up, grab a coffee, film together or plan a trip."
      />

      {/* ---- Post your trip ---- */}
      {canPost && (
        <form onSubmit={submit} className="card mb-10 !p-6">
          <h2 className="mb-4 font-semibold">Post a trip</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="city" className="label">City / place</label>
              <input id="city" className="input" placeholder="Lisbon" value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} maxLength={60} />
            </div>
            <div>
              <label htmlFor="country" className="label">Country <span className="text-smoke">(shows on the map)</span></label>
              <input id="country" className="input" placeholder="Start typing…" value={form.country}
                list="collab-country-list" autoComplete="off"
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} maxLength={60} />
              <datalist id="collab-country-list">
                {countryNames.map((n) => <option key={n} value={n} />)}
              </datalist>
            </div>
            <div>
              <label htmlFor="start" className="label">From</label>
              <input id="start" type="date" className="input" min={todayYmd()} value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value, end_date: f.end_date && f.end_date < e.target.value ? e.target.value : f.end_date }))} />
            </div>
            <div>
              <label htmlFor="end" className="label">To</label>
              <input id="end" type="date" className="input" min={form.start_date || todayYmd()} value={form.end_date}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
            </div>
          </div>
          <div className="mt-4">
            <label htmlFor="note" className="label">Note <span className="text-smoke">(optional)</span></label>
            <textarea id="note" className="input min-h-[80px]" maxLength={300}
              placeholder="Anyone around for a coffee and a collab? Keen to shoot some content around the city."
              value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </div>
          {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex justify-end">
            <button type="submit" disabled={busy} className="btn-primary">{busy ? <Spinner /> : 'Post trip'}</button>
          </div>
        </form>
      )}

      {/* ---- Filters ---- */}
      {upcoming.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <select className="input !w-auto" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} aria-label="Filter by month">
            <option value="">Any month</option>
            {monthOptions.map((ym) => <option key={ym} value={ym}>{format(localDate(ym + '-01'), 'MMM yyyy')}</option>)}
          </select>
          <select className="input !w-auto" value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} aria-label="Filter by country">
            <option value="">Any country</option>
            {countryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {(monthFilter || countryFilter) && (
            <button onClick={() => { setMonthFilter(''); setCountryFilter('') }} className="btn-ghost !py-2 text-sm">Clear</button>
          )}
        </div>
      )}

      {/* ---- Upcoming trips ---- */}
      {posts === null ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
      ) : upcoming.length === 0 ? (
        <EmptyState
          icon={<Icon name="pin" className="h-7 w-7" />}
          title="No upcoming trips"
          hint={canPost ? 'Be the first — post where you’re headed and let the community find you.' : 'Once your application is approved you can post your trips here.'}
        />
      ) : filteredUpcoming.length === 0 ? (
        <EmptyState emoji="🔍" title="No trips match those filters" hint="Try a different month or country." />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {filteredUpcoming.map((p) => <TripCard key={p.id} p={p} />)}
        </div>
      )}

      {/* ---- Big board map: everywhere the community is headed ---- */}
      {boardCountries.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-1 text-lg font-semibold">Where everyone's headed</h2>
          <p className="mb-5 text-sm text-smoke">Every country with an upcoming trip, highlighted.</p>
          <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
            <WorldMap selected={boardCountries} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {boardCountries.sort((a, b) => a.localeCompare(b)).map((c) => (
              <button key={c} onClick={() => setCountryFilter(c)} className="inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1 text-xs font-medium text-brand transition-transform hover:scale-105">
                <Icon name="pin" className="h-3.5 w-3.5" />{c}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ---- Archive: trips whose dates have passed ---- */}
      {archived.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-1 text-lg font-semibold">Past trips</h2>
          <p className="mb-5 text-sm text-smoke">Trips that have already happened.</p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {archived.map((p) => <TripCard key={p.id} p={p} past />)}
          </div>
        </section>
      )}
    </div>
  )
}
