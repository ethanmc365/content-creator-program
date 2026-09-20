import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { allRows } from '../../../lib/fetchAll'
import { LabPage, Panel, Note, Choice } from './kit'
import { Avatar, PlaneLoader, Skeleton } from '../../../components/ui'
import Icon from '../../../components/Icon'
import { cx } from '../../../lib/utils'
import { buildYearInReview } from '../../../lib/yearInReview'
import YearInReview, { YearInReviewLocked } from '../../../components/wrapped/YearInReview'

// THE YEAR IN REVIEW, BEFORE ANY CREATOR CAN SEE IT.
//
// Ethan: "obviously the creators won't have access to this yet but I want to
// have access immediately to test it, add it in a new page on the testing
// centre... build on exactly how it will look and appear to me and the
// creators, show their profile, name, make it custom, nice design, Tryp.com
// logo. It should act like it's September but just use the current data so far
// from the community."
//
// WHY THIS LAB READS REAL DATA WHEN EVERY OTHER ONE IS INVENTED.
//
// The other labs demonstrate a MECHANISM - an invoice raising itself, a
// challenge closing at midnight - and a mechanism is just as convincing over
// fictional people. This one is the opposite: the whole question is whether a
// recap built from what this community has actually done in 2026 is worth
// sending, and eight invented creators with round numbers would answer it
// dishonestly in both directions. So it loads the real datasets, read-only, and
// runs the real component over them.
//
// It still writes nothing. Every query here is a select.

const YEAR = 2026

export default function WrappedLab() {
  const [raw, setRaw] = useState(null)
  const [who, setWho] = useState('')
  const [view, setView] = useState('recap')   // recap | locked
  // FULL SCREEN, BECAUSE A RECAP IN A PANEL IS NOT THE THING BEING REVIEWED.
  // A creator will meet this on a phone with nothing else on the screen, and
  // the question "is this good enough to send" cannot be answered while it is
  // sitting in a box under an admin heading with a nav bar over it.
  const [full, setFull] = useState(false)

  // ESC closes the full-screen view, and the body stops scrolling underneath it.
  useEffect(() => {
    if (!full) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setFull(false) }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [full])

  useEffect(() => {
    let alive = true
    async function load() {
      // EVERY ONE OF THESE IS PAGED. PostgREST stops at a thousand rows and
      // says so only in a header - `game_scores` is one row per player per
      // daily puzzle and is the one about to cross, which would have made every
      // puzzle count, streak and rank on this page quietly too small. See
      // lib/fetchAll.
      const [
        profiles, communities, memberRows,
        flights, submissions, results,
        rewards, challenges, history, messages, directMessages,
        connections, collabPosts, gameScores,
        reactions, milestones, creatorMilestones,
      ] = await Promise.all([
        allRows(() => supabase.from('profiles').select('id, name, photo_url, city, country, status, is_test, is_admin, created_at, accepted_at')),
        allRows(() => supabase.from('communities').select('id, slug, name, kind, retired_at')),
        allRows(() => supabase.from('community_members').select('community_id, profile_id, is_home').eq('status', 'active'), { orderBy: ['community_id', 'profile_id'] }),
        allRows(() => supabase.from('flights').select('id, creator_id, from_iata, to_iata, flown_on, airline, aircraft, distance_km, return_of')),
        allRows(() => supabase.from('submissions').select('id, creator_id, challenge_id, platform, logged_views, submitted_at, thumbnail_url, video_url')),
        allRows(() => supabase.from('results').select('challenge_id, creator_id, final_views, rank')),
        allRows(() => supabase.from('rewards').select('creator_id, amount, currency, reward_type, created_at')),
        allRows(() => supabase.from('challenges').select('id, title')),
        // The off-platform record: the challenges the programme ran before this
        // app existed. `challenge_id is null` is the same filter AdminAnalytics
        // uses, and without it the community card counts 0.2% of the year.
        allRows(() => supabase.from('challenge_history').select('starts_at, total_views, posts, creators, challenge_id').is('challenge_id', null)),
        allRows(() => supabase.from('messages').select('sender_id, channel, created_at, deleted').eq('deleted', false)),
        // COUNTS ONLY - no `body`, no `image_url`, no recipient. The recap says
        // how many messages somebody sent, never what was in one.
        allRows(() => supabase.from('direct_messages').select('sender_id, created_at')),
        allRows(() => supabase.from('connections').select('creator_id, connected_creator_id, status, created_at')),
        allRows(() => supabase.from('collab_posts').select('creator_id, city, start_date, created_at')),
        allRows(() => supabase.from('game_scores').select('player_id, mode, day_key, created_at')),
        allRows(() => supabase.from('reactions').select('creator_id, created_at')),
        allRows(() => supabase.from('milestones').select('id, title, icon')),
        allRows(() => supabase.from('creator_milestones').select('profile_id, milestone_id, reached_at'), { orderBy: ['profile_id', 'milestone_id'] }),
      ])
      if (!alive) return
      setRaw({
        profiles: profiles || [], communities: communities || [], memberRows: memberRows || [],
        flights: flights || [], submissions: submissions || [], results: results || [],
        rewards: rewards || [], challenges: challenges || [], history: history || [], messages: messages || [], directMessages: directMessages || [],
        connections: connections || [], collabPosts: collabPosts || [], gameScores: gameScores || [],
        reactions: reactions || [], milestones: milestones || [], creatorMilestones: creatorMilestones || [],
      })
    }
    load()
    return () => { alive = false }
  }, [])

  // WHO IS WORTH LOOKING AT, RANKED BY HOW MUCH THERE IS TO SEE. A recap over
  // somebody with nothing in it is a real case and needs testing - it is the
  // "honest zero" path - but it is not the first thing to open on, so the list
  // is sorted by activity and says how many cards each person's recap runs to.
  const people = useMemo(() => {
    if (!raw) return []
    const score = new Map()
    const bump = (id, n) => id && score.set(id, (score.get(id) || 0) + n)
    for (const f of raw.flights) bump(f.creator_id, 4)
    for (const s of raw.submissions) bump(s.creator_id, 5)
    for (const m of raw.messages) bump(m.sender_id, 1)
    for (const g of raw.gameScores) bump(g.player_id, 1)
    for (const c of raw.collabPosts) bump(c.creator_id, 3)
    return raw.profiles
      .filter((p) => p.status === 'active' && !p.is_test)
      .map((p) => ({ ...p, score: score.get(p.id) || 0 }))
      .sort((a, b) => b.score - a.score || (a.name || '').localeCompare(b.name || ''))
  }, [raw])

  const meId = who || people[0]?.id || ''
  const data = useMemo(
    () => (raw && meId
      ? buildYearInReview({
        year: YEAR,
        meId,
        // ACTING LIKE IT IS SEPTEMBER, which is what Ethan asked for: the recap
        // covers the year to date rather than pretending December has happened.
        today: `${YEAR}-09-30`,
        ...raw,
      })
      : null),
    [raw, meId],
  )

  const chosen = people.find((p) => p.id === meId)

  return (
    <LabPage
      icon="sparkles"
      title="Year in Review"
      subtitle={
        'A creator’s personal recap of the year, in the shape Spotify made everybody expect: one fact '
        + 'a screen, played rather than clicked, ending in a card built to be posted. This lab runs the real '
        + 'component over the REAL community, up to 30 September 2026 — so what you are looking at is what '
        + 'that person would actually be sent.'
      }
      sandbox={false}
    >
      <Note icon="eye" tone="plain">
        <span className="font-semibold text-ink">Read-only, and nobody else can see it.</span> Every query on this
        page is a select. The recap is not on any creator-facing route yet: there is nothing to turn off, because
        nothing is turned on.
      </Note>

      <Panel
        title="Whose year"
        hint="Sorted by how much there is to show. Pick somebody quiet to see what the recap does with an empty year."
      >
        {!raw ? (
          <div className="flex flex-wrap gap-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 w-40" />)}</div>
        ) : (
          <div className="flex max-h-64 flex-wrap gap-2 overflow-y-auto">
            {people.slice(0, 40).map((p) => {
              const on = p.id === meId
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setWho(p.id)}
                  aria-pressed={on}
                  className={cx(
                    'inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs font-semibold transition-all duration-200',
                    on
                      ? 'border-brand bg-brand text-white shadow-card'
                      : 'border-gray-200 bg-white text-smoke hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand hoverable:hover:text-brand',
                  )}
                >
                  <Avatar src={p.photo_url} name={p.name} size="xs" />
                  <span className="max-w-[10rem] truncate">{p.name}</span>
                  {p.score === 0 && <span className={cx('text-[10px]', on ? 'text-white/70' : 'text-gray-300')}>quiet</span>}
                </button>
              )
            })}
          </div>
        )}
      </Panel>

      <Panel
        title={chosen ? `${chosen.name}’s ${YEAR}` : 'The recap'}
        hint="Tap the right of the card to move on, the left to go back. Hold to pause. Arrow keys work too."
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <Choice
              value={view}
              onChange={setView}
              options={[
                { value: 'recap', label: 'The recap' },
                { value: 'locked', label: 'Before it opens' },
              ]}
            />
            <button
              type="button"
              onClick={() => setFull(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-smoke transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand hoverable:hover:text-brand"
            >
              <Icon name="expand" className="h-3.5 w-3.5" />
              Full screen
            </button>
          </div>
        )}
      >
        {!data ? (
          <div className="flex min-h-[40vh] items-center justify-center"><PlaneLoader /></div>
        ) : view === 'locked' ? (
          <div className="py-4">
            <YearInReviewLocked year={YEAR} opensOn="3 December" />
          </div>
        ) : (
          <div className="py-4">
            <YearInReview key={meId} data={data} />
          </div>
        )}
      </Panel>

      {data && (
        <Panel title="What it found" hint="The numbers behind the cards, so a wrong one is traceable to a query rather than to the design." i={1}>
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['Flights', data.travel.flights],
              ['Distance', `${data.travel.distance.toLocaleString('en-GB')} km`],
              ['Countries', data.travel.countries],
              ['Aircraft types', data.travel.aircraftTypes],
              ['Trips on the board', data.travel.collabTrips],
              ['Videos', data.content.videos],
              ['Views', data.content.views.toLocaleString('en-GB')],
              ['Challenges entered', data.content.challenges],
              ['Podium finishes', data.content.podiums],
              ['Messages', data.community.messages],
              ['Connections', data.community.connections],
              ['Milestones', data.community.milestones.length],
              ['Puzzle rounds', data.games.played],
              ['Best streak', `${data.games.bestStreak} days`],
              ['Busiest month', data.busiest?.name ?? '—'],
              ['Views rank', data.ranks.views ? `${data.ranks.views.rank} of ${data.ranks.views.of} (top ${data.ranks.views.percentile}%)` : 'unranked'],
              ['Distance rank', data.ranks.distance ? `${data.ranks.distance.rank} of ${data.ranks.distance.of} (top ${data.ranks.distance.percentile}%)` : 'unranked'],
              ['Puzzle rank', data.ranks.games ? `${data.ranks.games.rank} of ${data.ranks.games.of} (top ${data.ranks.games.percentile}%)` : 'unranked'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3 border-b border-gray-50 py-1.5">
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">{k}</dt>
                <dd className="font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      )}

      {data && (
        <Panel title="The community's year" hint="The figures the last card shows everybody, whoever is watching." i={2}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ['Creators', data.everyone.creators],
              ['Views', data.everyone.views.toLocaleString('en-GB')],
              ['Videos', data.everyone.videos],
              ['Flights logged', data.everyone.flights],
              ['Km flown', data.everyone.distance.toLocaleString('en-GB')],
              ['Countries', data.everyone.countries],
              ['Messages', data.everyone.messages],
              ['Puzzle rounds', data.everyone.games],
            ].map(([k, v]) => (
              <div key={k} className="rounded-card border border-gray-100 bg-white px-4 py-3 shadow-card">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">{k}</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* ------------------------------------------------- as a creator sees it */}
      {full && data && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/90 p-4 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setFull(false)}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition-colors hoverable:hover:bg-white/25"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
          <div className="max-h-full w-full max-w-[400px] overflow-y-auto py-2">
            {view === 'locked'
              ? <YearInReviewLocked year={YEAR} opensOn="3 December" />
              : <YearInReview key={`full-${meId}`} data={data} onExit={() => setFull(false)} />}
          </div>
        </div>
      )}

      <Note icon="clock">
        <span className="font-semibold text-ink">When it should go out.</span> Spotify releases Wrapped in the
        first week of December, on a weekday, mid-morning local time - late enough that the year is effectively
        over, early enough to ride the fortnight everybody is posting about their year anyway. The same window is
        right here, with one addition this programme has and Spotify does not: a deadline. Tell the community two
        weeks beforehand that the recap counts flights, posts and puzzles up to the end of November, and the
        fortnight before release becomes the busiest fortnight of the year.
      </Note>
    </LabPage>
  )
}
