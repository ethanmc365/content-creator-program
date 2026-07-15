import { useEffect, useState, useCallback } from 'react'
import { confirm } from '../../lib/confirm'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Avatar, EmptyState, PageHeader, Skeleton, Spinner } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { formatViews, timeAgo } from '../../lib/utils'

// Results entry for one challenge:
//  1. Click through each submission and watch it on the platform.
//  2. Type the view count you saw into the box (saved per submission).
//  3. "Generate leaderboard" ranks creators by their best entry's views
//     and writes the final results table (which feeds the Wall of Fame).
export default function AdminResults() {
  const { id } = useParams()
  const { user } = useAuth()
  const [challenge, setChallenge] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [resultsCount, setResultsCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [posting, setPosting] = useState(false)
  const [toast, setToast] = useState('')

  // While the challenge is still running a leaderboard is an INTERIM snapshot;
  // once it has ended (or been archived) it's the FINAL ranking.
  const isLive = challenge?.status === 'active'
  const phase = isLive ? 'interim' : 'final'

  const load = useCallback(async () => {
    const [{ data: ch }, { data: subs }, { count }] = await Promise.all([
      supabase.from('challenges').select('*').eq('id', id).single(),
      supabase
        .from('submissions')
        .select('*, profiles:creator_id(id, name, photo_url)')
        .eq('challenge_id', id)
        .order('submitted_at'),
      supabase.from('results').select('id', { count: 'exact', head: true }).eq('challenge_id', id),
    ])
    setChallenge(ch)
    setSubmissions(subs ?? [])
    setResultsCount(count ?? 0)
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  function flash(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  // Save one submission's logged views (on blur or Enter).
  async function saveViews(submission, raw) {
    const views = raw === '' ? null : parseInt(raw, 10)
    if (raw !== '' && (isNaN(views) || views < 0)) return
    if (views === submission.logged_views) return
    setSavingId(submission.id)
    await supabase.from('submissions').update({ logged_views: views }).eq('id', submission.id)
    setSubmissions((prev) => prev.map((s) => (s.id === submission.id ? { ...s, logged_views: views } : s)))
    setSavingId(null)
  }

  // Build the final leaderboard from the logged views.
  async function generateLeaderboard() {
    const withViews = submissions.filter((s) => s.logged_views != null)
    if (withViews.length === 0) return flash('Log views on at least one submission first.')
    if (!await confirm(`Generate the leaderboard from ${withViews.length} reviewed submissions? This replaces any existing results for this challenge.`)) return

    setGenerating(true)
    // A creator's score = their best-performing entry.
    const bestByCreator = {}
    for (const s of withViews) {
      if (!bestByCreator[s.creator_id] || s.logged_views > bestByCreator[s.creator_id]) {
        bestByCreator[s.creator_id] = s.logged_views
      }
    }
    const ranked = Object.entries(bestByCreator)
      .sort((a, b) => b[1] - a[1])
      .map(([creator_id, final_views], i) => ({ challenge_id: id, creator_id, final_views, rank: i + 1 }))

    // Replace previous results in one go.
    await supabase.from('results').delete().eq('challenge_id', id)
    const { error } = await supabase.from('results').insert(ranked)
    if (error) { setGenerating(false); return flash(`Couldn't save results: ${error.message}`) }
    // Stamp the challenge so the public page can label the standings correctly.
    const updatedAt = new Date().toISOString()
    await supabase.from('challenges').update({ results_status: phase, results_updated_at: updatedAt }).eq('id', id)
    setChallenge((c) => (c ? { ...c, results_status: phase, results_updated_at: updatedAt } : c))
    setGenerating(false)
    setResultsCount(ranked.length)
    flash(
      phase === 'interim'
        ? `Current leaderboard published. ${ranked.length} creators ranked and live on the challenge page. Re-log views and publish again any time; publish once more after the challenge closes for the final result.`
        : `Final results saved. ${ranked.length} creators ranked and now live on the challenge page.`
    )
  }

  // Drop a leaderboard-update card into #announcements linking to the current
  // standings (interim or final). Creators tap it to see the full leaderboard.
  async function postLeaderboardUpdate() {
    if (resultsCount === 0) return flash('Publish a leaderboard first, then post the update.')
    setPosting(true)
    const { error } = await supabase.from('messages').insert({
      channel: 'announcements',
      sender_id: user.id,
      body: '',
      leaderboard_challenge_id: id,
    })
    setPosting(false)
    flash(error ? `Couldn't post update: ${error.message}` : 'Leaderboard update posted to Announcements.')
  }

  if (loading) {
    return <div className="page space-y-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-96 w-full" /></div>
  }

  return (
    <div className="page max-w-4xl">
      <Link to="/admin/challenges" className="mb-6 inline-block text-sm font-medium text-smoke hover:text-brand">← Manage challenges</Link>

      <PageHeader
        title={`Results: ${challenge?.title}`}
        subtitle={
          isLive
            ? 'Log the views you can see so far and publish the current leaderboard mid-challenge. Re-log and publish again after it closes for the final ranking. No scraping. Your eyes are the source of truth.'
            : 'Open each video, check its views on the platform, and log the number here. No scraping. Your eyes are the source of truth.'
        }
        action={
          <div className="flex flex-col items-end gap-2">
            <button onClick={generateLeaderboard} disabled={generating} className="btn-primary">
              {generating ? <Spinner /> : isLive ? 'Publish current leaderboard' : 'Publish final results'}
            </button>
            {resultsCount > 0 && (
              <>
                <button onClick={postLeaderboardUpdate} disabled={posting} className="btn-secondary !py-2 text-xs">
                  {posting ? <Spinner /> : 'Post update to Announcements'}
                </button>
                <Link to={`/challenges/${id}`} className="text-xs font-medium text-brand hover:underline">
                  {challenge?.results_status === 'interim' ? 'Current' : 'Final'} leaderboard live ({resultsCount}) → view
                </Link>
              </>
            )}
          </div>
        }
      />

      {toast && <p className="mb-6 rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700 animate-fade-up">{toast}</p>}

      {submissions.length === 0 ? (
        <EmptyState emoji="🎬" title="No submissions to review" hint="Entries will appear here as creators submit their links." />
      ) : (
        <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
          {submissions.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-4 border-b border-gray-50 px-5 py-4 last:border-0 sm:px-7">
              <Avatar src={s.profiles?.photo_url} name={s.profiles?.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{s.profiles?.name}</p>
                <p className="text-xs text-smoke">{s.platform} · {timeAgo(s.submitted_at)}</p>
              </div>
              <a href={s.video_url} target="_blank" rel="noopener noreferrer" className="btn-secondary !py-2 text-xs">
                Watch ↗
              </a>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`views-${s.id}`}>Logged views for {s.profiles?.name}</label>
                <input
                  id={`views-${s.id}`}
                  type="number"
                  min="0"
                  className="input !w-32 text-right tabular-nums"
                  placeholder="views"
                  defaultValue={s.logged_views ?? ''}
                  onBlur={(e) => saveViews(s, e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                />
                <span className="w-14 text-xs text-smoke">
                  {savingId === s.id ? 'Saving…' : s.logged_views != null ? formatViews(s.logged_views) : '-'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs leading-relaxed text-smoke">
        💡 A creator with multiple entries is ranked by their <strong>best</strong> video.
        Generating the leaderboard replaces previous results for this challenge, so it's safe to redo if you spot a typo.
      </p>
    </div>
  )
}
