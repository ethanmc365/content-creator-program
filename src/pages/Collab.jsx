import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Avatar, Badge, EmptyState, Modal, PageHeader, Skeleton, Spinner } from '../components/ui'
import { notice } from '../lib/confirm'
import { toast } from '../lib/toast'
import { cx } from '../lib/utils'
import Icon from '../components/Icon'
import WorldMap from '../components/WorldMap'
import CreatorMap from '../components/CreatorMap'
import { loadMapCountryNames, canonicalCountry } from '../lib/mapCountries'
import Reveal from '../components/network/Reveal'
import WhenVisible from '../components/WhenVisible'

// How many upcoming trips to show before the "View more" button.
const TRIPS_PREVIEW = 6

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

// A TRIP CARD IS A MODULE-SCOPE COMPONENT, NOT A CLOSURE INSIDE THE PAGE.
//
// THE BUG THIS FIXES. It used to be `function TripCard()` declared inside
// `Collab`, which makes a BRAND NEW component type on every render of the page.
// React compares types by identity, so every single re-render unmounted all six
// cards and mounted six replacements - and each replacement's `<WorldMap>`
// started again from nothing: new SVG, new projection, new fetch, new entry
// animation. Pressing "I'm interested" sets one piece of state, so pressing it
// re-mounted every map on the board. That is the reported "clicking I'm
// Interested causes all the maps to reload again".
//
// Hoisted here it is one stable type, and `memo` means a card whose own props
// have not changed does not re-render at all. `selected` is memoised inside so
// the WorldMap's own `memo` is not defeated by a fresh `[country]` array every
// time. Everything the card needs that used to come from the closure now
// arrives as a prop.
const TripCard = memo(function TripCard({
  p, past = false, mine, canEdit, mapCountry, interestCount, iAmInterested,
  onEdit, onRemove, onToggleInterest, onMessage,
}) {
  const person = p.profiles || {}
  const selectedCountries = useMemo(() => (mapCountry ? [mapCountry] : []), [mapCountry])
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
        {canEdit && (
          <div className="flex shrink-0 items-center gap-1">
            <button onClick={() => onEdit(p)} aria-label="Edit trip" title="Edit trip" className="rounded-lg p-1.5 text-smoke transition-colors hover:bg-brand-tint hover:text-brand">
              <Icon name="pencil" className="h-4 w-4" />
            </button>
            <button onClick={() => onRemove(p.id)} aria-label="Delete trip" title="Delete trip" className="rounded-lg p-1.5 text-smoke transition-colors hover:bg-red-50 hover:text-red-600">
              <Icon name="trash" className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <Badge tone={past ? 'grey' : 'brand'}><Icon name="calendar" className="mr-1 inline h-3.5 w-3.5" />{fmtRange(p.start_date, p.end_date)}</Badge>

      {/* The map mounts when the card is nearly on screen, not when the board
          renders. Six atlases laid out at once is what made the board hitch on
          open even after the parse was shared; the placeholder reserves the
          height so deferring the mount cannot become a jump. */}
      {!past && mapCountry && (
        <WhenVisible fallback={<div className="aspect-[2/1] w-full animate-pulse rounded-card bg-cloud/70" />}>
          <div className="overflow-hidden rounded-card">
            <WorldMap selected={selectedCountries} focusCountry={mapCountry} />
          </div>
        </WhenVisible>
      )}

      {p.note && <p className="text-sm leading-relaxed text-ink/90">{p.note}</p>}

      {!mine && !past && (
        <div className="mt-auto flex flex-col gap-2">
          <button onClick={() => onToggleInterest(p.id)} className={iAmInterested ? 'btn-primary flex w-full items-center justify-center gap-1.5 !py-2 text-sm' : 'btn-secondary w-full !py-2 text-sm'}>
            {iAmInterested && <Icon name="check" className="h-4 w-4" />}
            {iAmInterested ? 'Interested' : "I'm interested"}
            {interestCount > 0 && <span className="ml-1 opacity-80">· {interestCount}</span>}
          </button>
          <button onClick={() => onMessage(p.creator_id)} className="btn-secondary w-full !py-2 text-sm">
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
})

export default function Collab() {
  const { user, isAdmin, profile } = useAuth()
  const navigate = useNavigate()
  const [posts, setPosts] = useState(null)
  const [interests, setInterests] = useState({ count: new Map(), mine: new Set(), rows: [] })
  // The "why" dialog. Holds the post being expressed interest in, or null.
  const [interestFor, setInterestFor] = useState(null)
  const [interestNote, setInterestNote] = useState('')
  const [sendingInterest, setSendingInterest] = useState(false)
  const [posting, setPosting] = useState(false)
  const [expanded, setExpanded] = useState(false) // show all upcoming trips vs the first 6
  // "Who's travelling now" map data: creators currently mid-trip, with their
  // home location + current destination, mirroring the creators-map feature.
  const [travellers, setTravellers] = useState({ creators: [], trips: {} })
  const [form, setForm] = useState({ city: '', country: '', start_date: '', end_date: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [countryNames, setCountryNames] = useState([])
  const [monthFilter, setMonthFilter] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  // Edit an existing trip (own post for creators; any post for admins).
  const [editing, setEditing] = useState(null) // the post being edited, or null
  const [editForm, setEditForm] = useState({ city: '', country: '', start_date: '', end_date: '', note: '' })
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')
  const canPost = profile?.status === 'active'

  useEffect(() => { loadMapCountryNames().then(setCountryNames) }, [])

  async function load() {
    const today = todayYmd()
    const [{ data }, { data: ints }, { data: tallies }] = await Promise.all([
      supabase.from('collab_posts').select('*, profiles:creator_id(id, name, photo_url)').order('start_date', { ascending: true }).limit(300),
      // ONLY THE ROWS THAT ARE ABOUT ME NOW. Migration 099 made an interest
      // private to the person who sent it and the person whose trip it is,
      // because it carries a note somebody wrote to one reader. So this returns
      // the ones I sent and the ones sent to me, and nothing else.
      supabase.from('collab_interests')
        .select('id, post_id, creator_id, message, acknowledged_at, created_at, profiles:creator_id(id, name, photo_url)')
        .order('created_at', { ascending: false }),
      // …and the public count comes from a definer function that returns post
      // ids and numbers, which is all a card needs to say "3 interested".
      supabase.rpc('collab_interest_counts'),
    ])
    setPosts((data ?? []).map((p) => ({ ...p, isPast: p.end_date < today })))
    const count = new Map()
    for (const t of tallies ?? []) count.set(t.post_id, Number(t.n) || 0)
    const mine = new Set()
    for (const i of ints ?? []) if (i.creator_id === user.id) mine.add(i.post_id)
    setInterests({ count, mine, rows: ints ?? [] })

    // Who is on the move: mid-trip today, OR leaving within the next three
    // months. It used to be only the first, which on a normal Tuesday is two
    // people and an almost empty map - and which answered the wrong question.
    // The point of the board is finding somebody to meet BEFORE they book, so
    // the map has to show the trips that have not happened yet.
    // CreatorMap decides how far ahead is worth drawing (TRIP_HORIZON_DAYS) and
    // draws current and upcoming differently; this just has to hand it enough.
    const horizon = new Date()
    horizon.setDate(horizon.getDate() + 92)
    const horizonYmd = format(horizon, 'yyyy-MM-dd')
    const currentPosts = (data ?? []).filter((p) => p.end_date >= today && p.start_date <= horizonYmd)
    const ids = [...new Set(currentPosts.map((p) => p.creator_id))]
    if (ids.length) {
      const { data: profs } = await supabase
        .from('profiles').select('id, name, photo_url, city, city_lat, city_lng, country, countries_visited').in('id', ids)
      const tripsByCreator = {}
      for (const p of currentPosts) {
        (tripsByCreator[p.creator_id] ||= []).push({ country: p.country, city: p.city, start_date: p.start_date, end_date: p.end_date })
      }
      setTravellers({ creators: profs ?? [], trips: tripsByCreator })
    } else {
      setTravellers({ creators: [], trips: {} })
    }
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

  // Trips that collide with one of mine: same country, overlapping dates.
  //
  // Country rather than city on purpose. Two creators in Portugal the same week
  // is a coffee worth having even if one is in Lisbon and the other in Porto;
  // requiring the same city would reduce this to almost never firing, which is
  // the same as not building it.
  const overlaps = useMemo(() => {
    const mineTrips = upcoming.filter((p) => p.creator_id === user.id)
    if (!mineTrips.length) return []
    const out = []
    for (const p of upcoming) {
      if (p.creator_id === user.id) continue
      const theirCountry = canonicalCountry(p.country, countryNames) || p.country
      if (!theirCountry) continue
      for (const m of mineTrips) {
        const myCountry = canonicalCountry(m.country, countryNames) || m.country
        if (!myCountry || myCountry !== theirCountry) continue
        const from = p.start_date > m.start_date ? p.start_date : m.start_date
        const to = p.end_date < m.end_date ? p.end_date : m.end_date
        if (from > to) continue
        const days = Math.round((localDate(to) - localDate(from)) / 86400000) + 1
        out.push({ post: p, mineTrip: m, days })
        break
      }
    }
    return out.sort((a, b) => b.days - a.days)
  }, [upcoming, user.id, countryNames])

  // The two-sided list under the map: every interest that is about ME, on a
  // trip that has not already happened, with the OTHER person resolved so the
  // card can say who it is without asking which side of it you are on.
  //
  // Sorted so the ones needing something from you come first: an unacknowledged
  // message somebody sent you is the only row on this page with an action still
  // owed on it.
  const meetups = useMemo(() => {
    const byId = new Map((posts ?? []).map((p) => [p.id, p]))
    return (interests.rows ?? [])
      .map((row) => {
        const post = byId.get(row.post_id)
        if (!post || post.isPast) return null
        const incoming = post.creator_id === user.id
        // Outgoing rows carry no `profiles` join for the trip owner, and
        // incoming ones carry the sender's - so the other person is whichever
        // of the two this row is not about.
        const person = incoming ? row.profiles : post.profiles
        return { row, post, incoming, person }
      })
      .filter(Boolean)
      .sort((a, b) =>
        (b.incoming && !b.row.acknowledged_at) - (a.incoming && !a.row.acknowledged_at)
        || String(b.row.created_at).localeCompare(String(a.row.created_at)))
  }, [interests.rows, posts, user.id])

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
    // Close the form on success. Leaving it open with empty fields reads as
    // "that did not work, try again".
    setPosting(false)
    load()
  }

  // STABLE CALLBACKS, OR `memo` ON THE CARD BUYS NOTHING. A fresh arrow on
  // every render is a changed prop, and a changed prop re-renders the card the
  // memo was there to spare.
  const remove = useCallback(async (id) => {
    setPosts((p) => p.filter((x) => x.id !== id))
    await supabase.from('collab_posts').delete().eq('id', id)
  }, [])

  // Open the edit modal, prefilled with the post's current values.
  const startEdit = useCallback(function startEdit(p) {
    setEditError('')
    setEditForm({
      city: p.city || '',
      country: p.country || '',
      start_date: p.start_date || '',
      end_date: p.end_date || '',
      note: p.note || '',
    })
    setEditing(p)
  }, [])

  async function saveEdit(e) {
    e.preventDefault()
    setEditError('')
    if (!editForm.city.trim() || !editForm.start_date || !editForm.end_date) { setEditError('Add a city and both dates.'); return }
    if (editForm.end_date < editForm.start_date) { setEditError('The end date can’t be before the start date.'); return }
    setSavingEdit(true)
    const patch = {
      city: editForm.city.trim(),
      country: editForm.country.trim() || null,
      start_date: editForm.start_date,
      end_date: editForm.end_date,
      note: editForm.note.trim() || null,
    }
    const { error: updErr } = await supabase.from('collab_posts').update(patch).eq('id', editing.id)
    setSavingEdit(false)
    if (updErr) { setEditError('Could not save those changes. Please try again.'); return }
    setEditing(null)
    load()
  }

  // PRESSING "I'M INTERESTED" ASKS WHY, RATHER THAN JUST COUNTING YOU.
  //
  // It used to be a toggle that inserted a row and fired a notification saying
  // somebody was interested, which left the trip owner with a bell and no way
  // to do anything about it, and the sender with no way to say the one thing
  // that would have made it useful ("I am in Lisbon those exact dates"). Ethan:
  // "the I'm interested button does seemingly nothing, just sends a
  // notification. I think when you press I'm interested you should fill in a
  // little popup to say why."
  //
  // Pressing it when you have ALREADY said so still withdraws it, with no
  // dialog: taking something back should be one press.
  const toggleInterest = async (postId) => {
    if (interests.mine.has(postId)) {
      setInterests((prev) => {
        const mine = new Set(prev.mine)
        const count = new Map(prev.count)
        mine.delete(postId)
        count.set(postId, Math.max(0, (count.get(postId) || 1) - 1))
        return { ...prev, count, mine, rows: prev.rows.filter((r) => !(r.post_id === postId && r.creator_id === user.id)) }
      })
      await supabase.from('collab_interests').delete().eq('post_id', postId).eq('creator_id', user.id)
      return
    }
    setInterestNote('')
    setInterestFor((posts ?? []).find((p) => p.id === postId) || null)
  }

  async function sendInterest(e) {
    e.preventDefault()
    if (!interestFor || sendingInterest) return
    setSendingInterest(true)
    const postId = interestFor.id
    const { data, error: insErr } = await supabase
      .from('collab_interests')
      .insert({ post_id: postId, creator_id: user.id, message: interestNote.trim() || null })
      .select('id, post_id, creator_id, message, acknowledged_at, created_at')
      .single()
    setSendingInterest(false)
    if (insErr) { notice('Could not send that. Please try again.'); return }
    setInterests((prev) => {
      const mine = new Set(prev.mine)
      const count = new Map(prev.count)
      mine.add(postId)
      count.set(postId, (count.get(postId) || 0) + 1)
      return {
        count,
        mine,
        rows: [{ ...data, profiles: { id: user.id, name: profile?.name, photo_url: profile?.photo_url } }, ...prev.rows],
      }
    })
    setInterestFor(null)
    toast('Sent. They will see it on their board and in their notifications.')
  }

  async function acknowledge(interestId) {
    setInterests((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => (r.id === interestId ? { ...r, acknowledged_at: new Date().toISOString() } : r)),
    }))
    const { error: ackErr } = await supabase.rpc('acknowledge_collab_interest', { p_interest: interestId })
    if (ackErr) { notice('Could not mark that as seen.'); load() }
  }

  // Open (or create) the 1:1 conversation with a poster, then jump into it.
  const message = useCallback(async (creatorId) => {
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
  }, [navigate, user.id])

  // Everything a card needs, worked out here so the card itself stays a plain
  // function of its props and can be memoised.
  const cardProps = (p) => ({
    p,
    mine: p.creator_id === user.id,
    canEdit: p.creator_id === user.id || isAdmin,
    mapCountry: canonicalCountry(p.country, countryNames),
    interestCount: interests.count.get(p.id) || 0,
    iAmInterested: interests.mine.has(p.id),
    onEdit: startEdit,
    onRemove: remove,
    onToggleInterest: toggleInterest,
    onMessage: message,
  })


  return (
    <div className="page">
      <PageHeader
        title="Travel collab board"
        subtitle="Heading somewhere? Post your trip so nearby creators can meet up, grab a coffee, film together or plan a trip."
        action={canPost && (
          <button onClick={() => setPosting((v) => !v)} className="btn-primary !py-2.5">
            <Icon name={posting ? 'close' : 'plus'} className="h-4 w-4" />
            {posting ? 'Close' : 'Post a trip'}
          </button>
        )}
      />

      {/* ---- Post your trip ----
          Behind a button. An always-open five-field form was the first thing you
          saw on a page whose content is other people's trips: it pushed the
          board below the fold and asked everybody who came to READ to scroll
          past a form they were not there to fill in.

          IT OPENS WHERE THE BUTTON IS. It used to render four sections down,
          under the overlap alerts and the whole map, so pressing "Post a trip"
          at the top of the page changed something two screens below the fold
          and read as nothing happening at all. A control and the thing it
          reveals belong next to each other. */}
      {canPost && posting && (
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

      {/* ---- Overlaps ----
          THE ONE THING A COLLAB BOARD IS FOR.
          The board's whole promise is "somebody else will be where you are
          going". It was making every creator work that out by eye, off a grid
          sorted by date, against trips they had posted on another page. This
          does the comparison for them and puts the answer at the top. If nobody
          overlaps, the section is not there at all. */}
      {overlaps.length > 0 && (
        <section className="mb-10 rounded-card border border-brand/25 bg-brand-tint/20 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Icon name="sparkles" className="h-5 w-5 text-brand" />
            You will be in the same place
          </h2>
          <p className="mb-4 mt-1 text-sm text-smoke">
            These trips overlap with yours, in the same country and on the same dates.
          </p>
          <div className="space-y-2.5">
            {overlaps.map(({ post, mineTrip, days }) => (
              <div key={post.id} className="flex flex-wrap items-center gap-3 rounded-card bg-white px-4 py-3 shadow-card">
                <Avatar src={post.profiles?.photo_url} name={post.profiles?.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {post.profiles?.name} is in {post.city}{post.country ? `, ${post.country}` : ''}
                  </p>
                  <p className="truncate text-xs text-smoke">
                    {days} {days === 1 ? 'day' : 'days'} overlapping your {mineTrip.city} trip
                    {' · '}{fmtRange(post.start_date, post.end_date)}
                  </p>
                </div>
                <button onClick={() => message(post.creator_id)} className="btn-primary shrink-0 !py-2 !px-4 text-xs">
                  Say hello
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {(travellers.creators.length > 0 || boardCountries.length > 0) && (
        <section className="mb-10">
          <h2 className="mb-1 text-lg font-semibold">Where everyone's headed</h2>
          {travellers.creators.length > 0 ? (
            <>
              <p className="mb-5 text-sm text-smoke">Everyone on the move: a filled plane for creators who are there now, a hollow one for trips in the next three months.</p>
              {/* Deferred like the card maps. This one is the heaviest thing on
                  the page - the atlas plus a pin and a flight path per traveller
                  - and laying it out on the same frames as the cards above are
                  arriving is what made the whole board judder on open. */}
              <WhenVisible fallback={<div className="aspect-[2/1] w-full animate-pulse rounded-card bg-cloud/70" />}>
                <CreatorMap creators={travellers.creators} trips={travellers.trips} travelOnlyView />
              </WhenVisible>
            </>
          ) : (
            <>
              <p className="mb-5 text-sm text-smoke">No one's mid-trip right now. Here's every country with an upcoming trip, highlighted.</p>
              <WhenVisible fallback={<div className="aspect-[2/1] w-full animate-pulse rounded-card bg-cloud/70" />}>
                <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
                  <WorldMap selected={boardCountries} />
                </div>
              </WhenVisible>
            </>
          )}
          {boardCountries.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {boardCountries.sort((a, b) => a.localeCompare(b)).map((c) => (
                <button key={c} onClick={() => setCountryFilter(c)} className="inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1 text-xs font-medium text-brand transition-transform hover:scale-105">
                  <Icon name="pin" className="h-3.5 w-3.5" />{c}
                </button>
              ))}
            </div>
          )}
        </section>
      )}


      {/* ---- Meet-ups in the making ----
          DIRECTLY UNDER THE MAP, FOR BOTH SIDES, which is where Ethan asked for
          it: "it will appear on the top of the collab board page under the map
          for both you that sent it and the creator."

          This is the half of "I'm interested" that was missing. The button used
          to insert a row and send a notification, and a notification is a thing
          that scrolls away - so the sender had no record of having asked and the
          trip owner had nothing to act on. Here both people see the same
          exchange from their own side: what was said, whether it has been
          acknowledged, and a DM button, which is where an actual meet-up gets
          arranged. Acknowledging is deliberately a light touch ("seen") rather
          than a yes or a no: the answer is the conversation, not a status. */}
      {meetups.length > 0 && (
        <section className="mb-10">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Icon name="users" className="h-5 w-5 text-brand" />
            Meet-ups in the making
          </h2>
          <p className="mb-4 mt-1 text-sm text-smoke">
            Interest you have sent and interest people have sent you. Only the two of you can see the note.
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            {meetups.map(({ row, post, incoming, person }) => (
              <div
                key={row.id}
                className={cx(
                  'rounded-card border bg-white p-4 shadow-card',
                  incoming && !row.acknowledged_at ? 'border-brand/40' : 'border-gray-100',
                )}
              >
                <div className="flex items-start gap-3">
                  <Avatar src={person?.photo_url} name={person?.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug">
                      {incoming
                        ? <>{person?.name || 'Someone'} wants to meet you in {post?.city}</>
                        : <>You asked to meet {person?.name || 'them'} in {post?.city}</>}
                    </p>
                    <p className="mt-0.5 text-xs text-smoke">
                      {post ? fmtRange(post.start_date, post.end_date) : ''}
                      {post?.country ? ` · ${post.country}` : ''}
                    </p>
                  </div>
                  <span
                    className={cx(
                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                      row.acknowledged_at ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800',
                    )}
                  >
                    {row.acknowledged_at ? 'Seen' : incoming ? 'New' : 'Waiting'}
                  </span>
                </div>

                {row.message && (
                  <p className="mt-3 whitespace-pre-wrap rounded-xl border-l-2 border-brand/40 bg-brand-tint/20 px-3 py-2 text-sm leading-relaxed text-ink [overflow-wrap:anywhere]">
                    {row.message}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {incoming && !row.acknowledged_at && (
                    <button onClick={() => acknowledge(row.id)} className="btn-secondary !py-2 !px-4 text-xs">
                      <Icon name="check" className="h-4 w-4" /> Mark as seen
                    </button>
                  )}
                  <button onClick={() => message(person?.id)} className="btn-primary !py-2 !px-4 text-xs">
                    Message {person?.name?.split(' ')[0] || 'them'}
                  </button>
                  {!incoming && (
                    <button onClick={() => toggleInterest(row.post_id)} className="btn-ghost !py-2 !px-4 text-xs">
                      Withdraw
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
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
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"><Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
      ) : upcoming.length === 0 ? (
        <EmptyState
          icon={<Icon name="pin" className="h-7 w-7" />}
          title="No upcoming trips"
          hint={canPost ? 'Be the first to post where you’re headed and let the community find you.' : 'Once your application is approved you can post your trips here.'}
        />
      ) : filteredUpcoming.length === 0 ? (
        <EmptyState icon={<Icon name="magnifier" className="h-7 w-7" />} title="No trips match those filters" hint="Try a different month or country." />
      ) : (
        <>
          <Reveal className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(expanded ? filteredUpcoming : filteredUpcoming.slice(0, TRIPS_PREVIEW)).map((p) => (
              <TripCard key={p.id} {...cardProps(p)} />
            ))}
          </Reveal>
          {filteredUpcoming.length > TRIPS_PREVIEW && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-card border border-gray-100 bg-white py-3 text-sm font-semibold text-brand shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift"
            >
              {expanded
                ? <>Show fewer <Icon name="chevronLeft" className="h-4 w-4 rotate-90" /></>
                : <>View more upcoming trips ({filteredUpcoming.length - TRIPS_PREVIEW} more) <Icon name="chevronRight" className="h-4 w-4 rotate-90" /></>}
            </button>
          )}
        </>
      )}

      {/* ---- Where everyone's headed ----
          When creators are mid-trip we show the live "who's travelling" map
          (home-country pin + dotted flight path + animated plane to where they
          are). Otherwise we fall back to highlighting every upcoming
          destination country. Country chips below either map filter the list. */}
      {/* ---- Archive: trips whose dates have passed ---- */}
      {archived.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-1 text-lg font-semibold">Past trips</h2>
          <p className="mb-5 text-sm text-smoke">Trips that have already happened.</p>
          <Reveal className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {archived.map((p) => <TripCard key={p.id} {...cardProps(p)} past />)}
          </Reveal>
        </section>
      )}

      {/* ---- Why you are interested ----
          A NOTE, NOT A FORM. One field, optional, with a placeholder that says
          what a useful one contains. Making it required would turn a one-tap
          gesture into a task and fewer people would do it at all; leaving it
          out entirely is what the button used to do and the reason it read as
          doing nothing. */}
      <Modal open={!!interestFor} onClose={() => setInterestFor(null)} title="Say why" sheet={false}>
        <form onSubmit={sendInterest} className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">
              Meeting {interestFor?.profiles?.name?.split(' ')[0] || 'them'} in {interestFor?.city}
            </h2>
            <p className="mt-1 text-sm text-smoke">
              {interestFor ? fmtRange(interestFor.start_date, interestFor.end_date) : ''}
              {' · '}They will see this on their board and in their notifications. Nobody else can read it.
            </p>
          </div>
          <div>
            <label htmlFor="interest-note" className="label">
              What have you got in mind? <span className="font-normal text-smoke">(optional)</span>
            </label>
            <textarea
              id="interest-note"
              className="input min-h-[110px]"
              maxLength={400}
              autoFocus
              value={interestNote}
              onChange={(e) => setInterestNote(e.target.value)}
              placeholder="I'm in Lisbon the same week. Fancy shooting a couple of reels around Alfama, or just a coffee?"
            />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setInterestFor(null)} className="btn-ghost w-full justify-center sm:w-auto">Cancel</button>
            <button type="submit" disabled={sendingInterest} className="btn-primary w-full justify-center sm:w-auto">
              {sendingInterest ? <Spinner /> : 'Send it'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ---- Edit trip modal (own post, or any post for admins) ---- */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit trip">
        <form onSubmit={saveEdit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-city" className="label">City / place</label>
              <input id="edit-city" className="input" placeholder="Lisbon" value={editForm.city}
                onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))} maxLength={60} />
            </div>
            <div>
              <label htmlFor="edit-country" className="label">Country <span className="text-smoke">(shows on the map)</span></label>
              <input id="edit-country" className="input" placeholder="Start typing…" value={editForm.country}
                list="collab-edit-country-list" autoComplete="off"
                onChange={(e) => setEditForm((f) => ({ ...f, country: e.target.value }))} maxLength={60} />
              <datalist id="collab-edit-country-list">
                {countryNames.map((n) => <option key={n} value={n} />)}
              </datalist>
            </div>
            <div>
              <label htmlFor="edit-start" className="label">From</label>
              <input id="edit-start" type="date" className="input" value={editForm.start_date}
                onChange={(e) => setEditForm((f) => ({ ...f, start_date: e.target.value, end_date: f.end_date && f.end_date < e.target.value ? e.target.value : f.end_date }))} />
            </div>
            <div>
              <label htmlFor="edit-end" className="label">To</label>
              <input id="edit-end" type="date" className="input" min={editForm.start_date || undefined} value={editForm.end_date}
                onChange={(e) => setEditForm((f) => ({ ...f, end_date: e.target.value }))} />
            </div>
          </div>
          <div>
            <label htmlFor="edit-note" className="label">Note <span className="text-smoke">(optional)</span></label>
            <textarea id="edit-note" className="input min-h-[80px]" maxLength={300}
              value={editForm.note} onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))} />
          </div>
          {editError && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{editError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(null)} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={savingEdit} className="btn-primary">{savingEdit ? <Spinner /> : 'Save changes'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
