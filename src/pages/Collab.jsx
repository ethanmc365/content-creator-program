import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Avatar, Badge, EmptyState, PageHeader, Skeleton, Spinner } from '../components/ui'
import Icon from '../components/Icon'

// Travel collab board. Creators post "I'll be in <city> on <dates>" and others
// browse who's travelling where, then reach out via DM to meet up, grab a
// coffee, film together or plan a trip. Linked from the avatar dropdown.

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

export default function Collab() {
  const { user, isAdmin, profile } = useAuth()
  const navigate = useNavigate()
  const [posts, setPosts] = useState(null)
  const [form, setForm] = useState({ city: '', country: '', start_date: '', end_date: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const canPost = profile?.status === 'active'

  async function load() {
    // Ongoing or upcoming trips only (nothing already finished).
    const { data } = await supabase
      .from('collab_posts')
      .select('*, profiles:creator_id(id, name, photo_url)')
      .gte('end_date', todayYmd())
      .order('start_date', { ascending: true })
    setPosts(data ?? [])
  }
  useEffect(() => { load() }, [])

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!form.city.trim() || !form.start_date || !form.end_date) {
      setError('Add a city and both dates.')
      return
    }
    if (form.end_date < form.start_date) {
      setError('The end date can’t be before the start date.')
      return
    }
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
      .from('conversations')
      .insert({ participant_a: user.id, participant_b: creatorId })
      .select('id')
      .single()
    if (created) navigate(`/messages/${created.id}`)
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
              <label htmlFor="country" className="label">Country <span className="text-smoke">(optional)</span></label>
              <input id="country" className="input" placeholder="Portugal" value={form.country}
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} maxLength={60} />
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

      {/* ---- The board ---- */}
      {posts === null ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
      ) : posts.length === 0 ? (
        <EmptyState
          icon={<Icon name="pin" className="h-7 w-7" />}
          title="No trips posted yet"
          hint={canPost ? 'Be the first — post where you’re headed and let the community find you.' : 'Once your application is approved you can post your trips here.'}
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {posts.map((p) => {
            const person = p.profiles || {}
            const mine = p.creator_id === user.id
            return (
              <div key={p.id} className="card flex flex-col gap-4 !p-6">
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

                <Badge tone="brand"><Icon name="calendar" className="mr-1 inline h-3.5 w-3.5" />{fmtRange(p.start_date, p.end_date)}</Badge>

                {p.note && <p className="text-sm leading-relaxed text-ink/90">{p.note}</p>}

                {!mine && (
                  <button onClick={() => message(p.creator_id)} className="btn-secondary mt-auto w-full">
                    Message {person.name?.split(' ')[0]}
                  </button>
                )}
                {mine && <p className="mt-auto text-xs text-smoke">Your trip · visible to the community</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
