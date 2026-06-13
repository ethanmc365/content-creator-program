import { useEffect, useState, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Avatar, Badge, EmptyState, PageHeader, Skeleton, Spinner } from '../../components/ui'
import { formatViews, cx } from '../../lib/utils'

// Wall of Fame editor for one challenge.
//  * Start from the saved leaderboard, pick how many spots to feature.
//  * Reorder spots (↑/↓), add a note / "admin's pick" per creator.
//  * Save as draft, then Publish when ready (publishes = notifies everyone).
export default function AdminWallOfFame() {
  const { id } = useParams()
  const { user } = useAuth()

  const [challenge, setChallenge] = useState(null)
  const [results, setResults] = useState([])
  const [wall, setWall] = useState(null)        // existing wall row (if any)
  const [spots, setSpots] = useState([])        // [{ creator_id, note, profile, views }]
  const [adminNote, setAdminNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    const [{ data: ch }, { data: res }, { data: w }] = await Promise.all([
      supabase.from('challenges').select('*').eq('id', id).single(),
      supabase
        .from('results')
        .select('*, profiles:creator_id(id, name, photo_url)')
        .eq('challenge_id', id)
        .order('rank'),
      supabase.from('wall_of_fame').select('*').eq('challenge_id', id).maybeSingle(),
    ])
    setChallenge(ch)
    setResults(res ?? [])
    setWall(w)
    setAdminNote(w?.admin_note ?? '')

    // Rebuild editable spots from the saved wall, or default to the top 4.
    const resByCreator = Object.fromEntries((res ?? []).map((r) => [r.creator_id, r]))
    if (w?.featured_spots?.length) {
      setSpots(
        w.featured_spots.map((s) => ({
          creator_id: s.creator_id,
          note: s.note ?? '',
          profile: resByCreator[s.creator_id]?.profiles,
          views: resByCreator[s.creator_id]?.final_views,
        }))
      )
    } else {
      setSpots(
        (res ?? []).slice(0, 4).map((r) => ({
          creator_id: r.creator_id, note: '', profile: r.profiles, views: r.final_views,
        }))
      )
    }
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  function flash(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  function move(i, dir) {
    const j = i + dir
    if (j < 0 || j >= spots.length) return
    const next = [...spots]
    ;[next[i], next[j]] = [next[j], next[i]]
    setSpots(next)
  }

  function setNote(i, note) {
    setSpots((prev) => prev.map((s, idx) => (idx === i ? { ...s, note } : s)))
  }

  function addSpot(result) {
    if (spots.some((s) => s.creator_id === result.creator_id)) return
    setSpots([...spots, { creator_id: result.creator_id, note: '', profile: result.profiles, views: result.final_views }])
  }

  // Re-pull the top performers from the current leaderboard, keeping any notes
  // you've already written for creators who are still featured.
  function syncFromResults() {
    const notesByCreator = Object.fromEntries(spots.map((s) => [s.creator_id, s.note]))
    setSpots(
      results.slice(0, Math.max(spots.length, 4)).map((r) => ({
        creator_id: r.creator_id,
        note: notesByCreator[r.creator_id] ?? '',
        profile: r.profiles,
        views: r.final_views,
      }))
    )
    flash('Synced with the latest leaderboard. Review and republish to update the wall.')
  }

  async function save(publish) {
    if (publish && !confirm('Publish this Wall of Fame? Every creator gets a "Results are in!" notification.')) return
    setBusy(true)
    const payload = {
      challenge_id: id,
      featured_spots: spots.map((s) => ({ creator_id: s.creator_id, note: s.note })),
      admin_note: adminNote,
      updated_by: user.id,
      ...(publish ? { published: true, published_at: new Date().toISOString() } : {}),
    }
    const { error } = wall
      ? await supabase.from('wall_of_fame').update(payload).eq('id', wall.id)
      : await supabase.from('wall_of_fame').insert(payload)
    setBusy(false)
    if (error) return flash(`Couldn't save: ${error.message}`)
    flash(publish ? 'Published! 🎉 The community has been notified.' : 'Draft saved.')
    load()
  }

  async function unpublish() {
    if (!confirm('Hide this wall from creators again?')) return
    await supabase.from('wall_of_fame').update({ published: false }).eq('id', wall.id)
    load()
  }

  if (loading) {
    return <div className="page space-y-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-96 w-full" /></div>
  }

  const unfeatured = results.filter((r) => !spots.some((s) => s.creator_id === r.creator_id))
  const MEDALS = ['🥇', '🥈', '🥉']

  return (
    <div className="page max-w-4xl">
      <Link to="/admin/challenges" className="mb-6 inline-block text-sm font-medium text-smoke hover:text-brand">← Manage challenges</Link>

      <PageHeader
        title={`Wall of Fame: ${challenge?.title}`}
        subtitle="Choose the featured spots, the order and the shout-outs. Publish when it's perfect."
        action={wall?.published
          ? <Badge tone="green">Published ✓</Badge>
          : <Badge tone="amber">Draft, not visible to creators</Badge>}
      />

      {toast && <p className="mb-6 rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700 animate-fade-up">{toast}</p>}

      {results.length === 0 ? (
        <EmptyState
          emoji="📊"
          title="No leaderboard yet"
          hint="Enter the logged views and generate the leaderboard first. The wall is built from it."
          action={<Link to={`/admin/challenges/${id}/results`} className="btn-primary">Enter results</Link>}
        />
      ) : (
        <div className="space-y-10">
          {/* ---------- Challenge-wide note ---------- */}
          <section className="card space-y-3">
            <label htmlFor="admin_note" className="text-lg font-semibold">Headline note <span className="text-sm font-normal text-smoke">(shown above the wall)</span></label>
            <textarea
              id="admin_note" rows={2} className="input"
              placeholder='e.g. "Our best round yet, over 880k combined views!"'
              value={adminNote} onChange={(e) => setAdminNote(e.target.value)}
            />
          </section>

          {/* ---------- Featured spots ---------- */}
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Featured spots ({spots.length})</h2>
              <button onClick={syncFromResults} className="btn-secondary !py-2 text-xs" title="Re-pull the current top performers from the leaderboard">
                ↻ Sync with leaderboard
              </button>
            </div>
            <p className="mb-4 text-xs leading-relaxed text-smoke">
              View counts always reflect the live leaderboard. If you re-enter results, click
              "Sync with leaderboard" to refresh who's featured here, then republish.
            </p>
            <div className="space-y-4">
              {spots.map((s, i) => (
                <div key={s.creator_id} className={cx('card flex flex-wrap items-center gap-4 !p-5', i < 3 && 'border-brand/20 bg-brand-tint/30')}>
                  <span className="w-8 text-center text-xl font-bold">{MEDALS[i] || i + 1}</span>
                  <Avatar src={s.profile?.photo_url} name={s.profile?.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{s.profile?.name}</p>
                    {s.views != null && <p className="text-xs text-smoke">{formatViews(s.views)} logged views</p>}
                    <input
                      type="text" className="input mt-2 !py-2 text-xs"
                      placeholder='Note / shout-out, e.g. "Admin&apos;s pick 🎬, stunning edit"'
                      value={s.note}
                      onChange={(e) => setNote(i, e.target.value)}
                      aria-label={`Note for ${s.profile?.name}`}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => move(i, -1)} disabled={i === 0} className="btn-ghost !p-2 disabled:opacity-30" aria-label="Move up">↑</button>
                    <button onClick={() => move(i, 1)} disabled={i === spots.length - 1} className="btn-ghost !p-2 disabled:opacity-30" aria-label="Move down">↓</button>
                  </div>
                  <button onClick={() => setSpots(spots.filter((_, j) => j !== i))} className="btn-ghost !p-2 text-red-500" aria-label={`Remove ${s.profile?.name}`}>✕</button>
                </div>
              ))}
              {spots.length === 0 && <p className="text-sm text-smoke">No spots yet. Add creators from the leaderboard below.</p>}
            </div>
          </section>

          {/* ---------- Add more from leaderboard ---------- */}
          {unfeatured.length > 0 && (
            <section>
              <h2 className="mb-4 text-sm font-semibold text-smoke">Add from the leaderboard</h2>
              <div className="flex flex-wrap gap-2">
                {unfeatured.map((r) => (
                  <button key={r.id} onClick={() => addSpot(r)} className="btn-secondary !py-2 text-xs">
                    + #{r.rank} {r.profiles?.name} ({formatViews(r.final_views)})
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ---------- Actions ---------- */}
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 pt-6">
            {wall?.published && (
              <button onClick={unpublish} className="btn-danger" disabled={busy}>Unpublish</button>
            )}
            <button onClick={() => save(false)} className="btn-secondary" disabled={busy}>
              {busy ? <Spinner /> : 'Save draft'}
            </button>
            <button onClick={() => save(true)} className="btn-primary" disabled={busy || spots.length === 0}>
              {busy ? <Spinner /> : wall?.published ? 'Save & republish 🎉' : 'Publish 🎉'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
