import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { roleBadgeTitle } from '../lib/roles'
import { useAuth } from '../context/AuthContext'
import WorldMap from '../components/WorldMap'
import PhotoBoard from '../components/PhotoBoard'
import VideoThumb from '../components/VideoThumb'
import MilestoneSnippet from '../components/network/MilestoneSnippet'
import ProfileFlights from '../components/network/ProfileFlights'
import { ChallengeHistoryCard, PuzzleCard } from '../components/network/ProfileRailCards'
import ConnectButton from '../components/ConnectButton'
import ReportCreator from '../components/ReportCreator'
import LocalTime from '../components/LocalTime'
import { loadRelationship, mutualCreators } from '../lib/connections'
import { openConversation } from '../lib/dm'
import { confirm, notice } from '../lib/confirm'
import { flagForCountry } from '../lib/flags'
import { useIsMobile } from '../lib/useKeyboardInset'
import { airport } from '../lib/airports'
import SocialMark, { brandForUrl } from '../components/SocialMark'
import { Avatar, Badge, Skeleton, EmptyState } from '../components/ui'
import Icon from '../components/Icon'
import { format } from 'date-fns'
import { loadMapCentroids } from '../lib/mapCountries'
import { formatDate, postedOn, ageFromDob, cx } from '../lib/utils'

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
  const [upcoming, setUpcoming] = useState([])
  const [todayStr] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [mutual, setMutual] = useState({ people: [], total: 0 })
  const [reporting, setReporting] = useState(false)
  const [bucketOpen, setBucketOpen] = useState(false)
  // Which of the two layouts to MOUNT. `lg` is 1024px, matching the grid the
  // desktop version uses, so the swap happens exactly where the two-column
  // layout would have taken over anyway.
  const isMobile = useIsMobile()
  // Which showcase card has its caption open. One at a time: two open cards in
  // a three-across grid pushes the row below them down twice.
  const [openCaption, setOpenCaption] = useState(null)
  const [loading, setLoading] = useState(true)
  const [deciding, setDeciding] = useState(false)

  // This is an application profile if an admin is viewing a creator still
  // pending review. Approving/declining right here saves the round-trip back to
  // the admin applications list. Mirrors AdminApplications.decide().
  const isApplication = viewerIsAdmin && !isMe && creator?.status === 'pending' && creator?.onboarded

  async function decideApplication(status) {
    const verb = status === 'active' ? 'Approve' : 'Decline'
    const note = status === 'active' ? '' : ' This permanently deletes their account.'
    if (!await confirm(`${verb} ${creator.name}'s application?${note}`)) return
    setDeciding(true)
    const { error } = status === 'active'
      ? await supabase.from('profiles').update({ status: 'active' }).eq('id', id)
      : await supabase.rpc('admin_decline_application', { target: id })
    setDeciding(false)
    if (error) { await notice(`Something went wrong: ${error.message}`); return }
    navigate('/admin/applications')
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      const today = format(new Date(), 'yyyy-MM-dd')
      // WHAT IS COMING UP COMES FROM TWO PLACES, NOT ONE.
      //
      // "Where I'm headed next" only ever read `collab_posts`, so a creator who
      // had logged four future flights and posted no collab trips had an empty
      // section on a profile that plainly knew where they were going. A booked
      // flight is a plan in exactly the way a collab post is; the difference is
      // only what you can do about it, which is what the card links to.
      //
      // Somebody else's upcoming flights are filtered to the ones they share
      // with the community, the same line migration 103 drew for the flight
      // leaderboards. Your own profile shows all of yours.
      let upcomingFlights = supabase
        .from('flights')
        .select('id, to_iata, flown_on, share_with_community')
        .eq('creator_id', id)
        .gt('flown_on', today)
        .order('flown_on', { ascending: true })
        .limit(12)
      if (!isMe) upcomingFlights = upcomingFlights.eq('share_with_community', true)

      const [{ data: p }, { data: subs }, rel, { data: tripsData }, { data: flightsData }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', id).single(),
        supabase
          .from('submissions')
          .select('*, challenges(title)')
          .eq('creator_id', id)
          .order('submitted_at', { ascending: false }),
        isMe ? Promise.resolve(null) : loadRelationship(user.id, id),
        supabase.from('collab_posts').select('id, city, country, start_date, end_date').eq('creator_id', id).gte('end_date', today).order('start_date', { ascending: true }),
        upcomingFlights,
      ])
      setCreator(p)
      setSubmissions(subs ?? [])
      setChallengeCount(new Set((subs ?? []).map((s) => s.challenge_id)).size)
      setRelation(rel)
      setTrips(tripsData ?? [])
      setUpcoming(flightsData ?? [])
      setLoading(false)
    }
    load()
  }, [id, user.id, isMe])

  // Mutual connections (people you both know), shown on other people's profiles.
  useEffect(() => {
    if (isMe || !user?.id) { setMutual({ people: [], total: 0 }); return }
    let cancelled = false
    mutualCreators(user.id, id).then((m) => { if (!cancelled) setMutual(m) })
    return () => { cancelled = true }
  }, [id, user?.id, isMe])

  // Admins see the creator's EMAIL here. The phone deliberately is not read.
  //
  // Ethan's rule: the admin-only details, their number above all, belong in the
  // creators roster panel and nowhere else. A profile is a page you land on
  // from a leaderboard, a chat room or a search - often with somebody looking
  // over your shoulder - and a phone number a creator gave us for payouts is
  // not something to put on it. Reaching for a number is now a deliberate act:
  // /admin/creators, open the person. The RPC and creator_private's RLS still
  // enforce admin-only access server side; this is one less place it is shown.
  // The admin email fetch that used to live here is gone with the card it fed.
  // Nothing on this page reads a creator's private contact details any more.

  async function startMessage() {
    const convId = await openConversation(user.id, id)
    if (convId) navigate(`/messages/${convId}`)
  }

  // A trip that's underway right now (trips are already end_date >= today).
  const currentTrip = trips.find((t) => t.start_date <= todayStr) || null

  // WHERE THEY ARE, AS A POINT ON THE MAP.
  //
  // Two sources and they are not equally precise, which decides what each one
  // is allowed to claim.
  //
  //   HOME is `profiles.city_lat/lng`, geocoded from the town they gave, so it
  //   is a real point and the marker sits on their town.
  //
  //   A TRIP is a collab-board post, and that table holds a city and a country
  //   as TEXT with no coordinates. So a trip is drawn at its COUNTRY's
  //   centroid - the same centroids the map already loads to zoom onto a
  //   country. That is honest at the zoom a world map is read at, and it is
  //   why the label says "in Portugal" rather than pretending to know a street.
  //
  // A trip wins when there is one, because "where are they now" is the question
  // and today's answer is the trip.
  const [centroids, setCentroids] = useState(null)
  useEffect(() => { loadMapCentroids().then(setCentroids).catch(() => {}) }, [])

  const here = useMemo(() => {
    if (!creator) return null
    // "You are in Lisbon" on your own profile, "Maddie is in Lisbon" on
    // somebody else's. The alternative is a sentence about yourself in the
    // third person, which reads as the app talking about you behind your back.
    const base = {
      photo: creator.photo_url,
      name: creator.name,
      who: isMe ? 'You' : (creator.name || '').trim().split(' ')[0] || 'They',
    }
    if (currentTrip) {
      const c = centroids?.get(currentTrip.country)
      if (c) {
        return {
          ...base, travelling: true, lng: c[0], lat: c[1],
          place: currentTrip.city || currentTrip.country,
          country: currentTrip.country,
        }
      }
    }
    if (Number.isFinite(creator.city_lat) && Number.isFinite(creator.city_lng)) {
      return {
        ...base, travelling: false, lng: creator.city_lng, lat: creator.city_lat,
        place: creator.city || creator.country, country: creator.country,
      }
    }
    return null
  }, [creator, currentTrip, centroids, isMe])

  // WHERE THEY ARE HEADED, FROM BOTH SOURCES, IN ONE ORDER.
  //
  // Collab posts and upcoming flights are two records of the same thing, so
  // they are merged, sorted by date and de-duplicated: a creator who posts a
  // Lisbon trip AND logs the flight to Lisbon should get one row, not two.
  // The collab post wins that tie, because it is the one with a conversation
  // attached and therefore the more useful destination.
  const headedNext = useMemo(() => {
    const rows = trips.map((t) => ({
      key: `trip-${t.id}`,
      // Country repeated as the city ("Namibia, Namibia") is what the collab
      // form produces when somebody names a country with no town. Say it once.
      place: t.city && t.city !== t.country ? `${t.city}, ${t.country}` : (t.city || t.country || 'Somewhere'),
      country: t.country,
      flag: flagForCountry(t.country),
      start: t.start_date,
      when: `${format(new Date(t.start_date), 'd MMM')} – ${format(new Date(t.end_date), 'd MMM yyyy')}`,
      to: '/collab',
    }))
    const claimed = new Set(rows.map((r) => (r.country || '').toLowerCase()))
    for (const f of upcoming) {
      const a = airport(f.to_iata)
      if (!a) continue
      if (claimed.has((a.country || '').toLowerCase())) continue
      claimed.add((a.country || '').toLowerCase())
      rows.push({
        key: `flight-${f.id}`,
        place: a.city ? `${a.city}, ${a.country}` : a.country,
        country: a.country,
        flag: flagForCountry(a.country),
        start: f.flown_on,
        when: `Flying in ${format(new Date(f.flown_on), 'd MMM yyyy')}`,
        // No collab post behind it, so the collab board has nothing to show.
        // The community flight log is where this trip actually exists.
        to: '/flights/community',
      })
    }
    return rows.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0)).slice(0, 6)
  }, [trips, upcoming])

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
        <EmptyState icon={<Icon name="users" className="h-7 w-7" />} title="Creator not found" hint="They may have left the program." action={<Link to="/creators" className="btn-primary">Browse creators</Link>} />
      </div>
    )
  }

  // A NAMED PLATFORM GETS ITS OWN MARK; ANYTHING ELSE GETS THE CHAIN LINK.
  // These were four identical grey buttons reading "Instagram ↗", "TikTok ↗"
  // and so on, so the row was four words where it should have been four
  // recognisable shapes. See components/SocialMark.
  const socials = [
    { url: creator.instagram_url, brand: 'instagram', label: 'Instagram' },
    { url: creator.tiktok_url, brand: 'tiktok', label: 'TikTok' },
    { url: creator.youtube_url, brand: 'youtube', label: 'YouTube' },
    { url: creator.facebook_url, brand: 'facebook', label: 'Facebook' },
    { url: creator.linkedin_url, brand: 'linkedin', label: 'LinkedIn' },
    ...(Array.isArray(creator.other_links)
      ? creator.other_links.map((l) => ({ url: l.url, brand: brandForUrl(l.url), label: l.label || 'Link' }))
      : []),
  ].filter((x) => x.url)

  // ================= THE PAGE, AS NAMED SECTIONS =================
  // Ethan gave a mobile reading order that INTERLEAVES the two desktop
  // columns: about, local time, at a glance, the map, where they are
  // headed, photos, languages and bucket list, milestones, games, and the
  // content showcase last of all.
  // CSS `order` cannot do that. Order only sorts SIBLINGS, and on desktop
  // these live in two different parents, so anything in the rail can never
  // be ordered between two things in the main column.
  // So each section is named once here and the two layouts below are
  // nothing but running orders. The markup exists exactly once, which is
  // the property that matters: the old page rendered its whole body twice
  // and the two copies drifted for weeks. Same trick as the Settings
  // page's BODIES map.
  const about = (
        <>
{/* ---------- About (bio) ---------- */}
        {creator.about && (
          <section className="card">
            <h2 className="mb-3 text-lg font-semibold">About {creator.name.split(' ')[0]}</h2>
            <p className="whitespace-pre-line leading-relaxed text-smoke">{creator.about}</p>
          </section>
        )}
        </>
      )
  const worldMap = (
        <>
{/* ---------- World map (countries visited) ---------- */}
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">
              {creator.countries_visited?.length || 0} {creator.countries_visited?.length === 1 ? 'country' : 'countries'} visited
            </h2>
            {isMe && <Link to="/profile/edit" className="text-sm font-medium text-brand hover:underline">Update map</Link>}
          </div>
            {/* `owner` makes the countries tappable: what the place is known for,
              and a way to ask the one person whose map this is about it. */}
          {/* THE LIST OF EVERY COUNTRY UNDER THE MAP IS GONE. Somebody with
              forty countries got forty grey chips, which is six rows of text
              restating what the map above had just drawn - and none of them
              did anything. The map is the list; the heading is the count.
              Ethan: "there is no need to list all the countries, it takes up
              space and looks bad." */}
          <WorldMap selected={creator.countries_visited || []} owner={creator} here={here} />
        </section>
        </>
      )
  const photos = (
        <>
{/* ---------- Travel photos ---------- */}
        <ProfileGallery creatorId={creator.id} isMe={isMe} creatorName={creator.name} />
        {/* THE FLIGHT LOG MOVED TO THE RAIL. It was a full-width band here,
            directly above a full-width country map, which put two different
            answers to "where has this person been" at the same weight one after
            the other. It is a set of numbers and three small photographs, which
            is a rail card, and the map keeps the width. See the aside. */}
        </>
      )
  const showcase = (
        <>
{/* ---------- Content showcase (creators only; admins don't submit) ---------- */}
        {/* EVERY CARD IS THE SAME HEIGHT, AND THE CAPTION IS WHY IT WASN'T.
            The caption sat in normal flow, so one creator writing three lines
            about their video made that card taller than the two beside it and
            the whole row went ragged. It is clamped to two lines now, with the
            card opening in place when there is more to read - which also gives
            the caption somewhere to go, rather than being cut off forever.
            THE VIEWS ARE ON THE CARD. `logged_views` is read automatically off
            the posted link (see the view sync), so this number keeps itself up
            to date and is the single most interesting thing about an entry.
            THREE TARGETS, THREE JOBS. The thumbnail and the platform mark open
            the video; the caption expands it; the card itself does neither, so
            nothing is a surprise. */}
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
            /* BEST FIRST. It was newest first, which buries the video that
               actually did the numbers under whatever was posted last. Ethan:
               "always filter the content showcase by views from highest to
               lowest, want the best videos showing first." Ties fall back to
               newest, so a wall of un-synced zeroes still reads in a sane
               order. */
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[...submissions]
                .sort((a, b) => (Number(b.logged_views) || 0) - (Number(a.logged_views) || 0)
                  || new Date(b.submitted_at) - new Date(a.submitted_at))
                .map((sub) => (
                <ShowcaseCard
                  key={sub.id}
                  submission={sub}
                  expanded={openCaption === sub.id}
                  onToggle={() => setOpenCaption((cur) => (cur === sub.id ? null : sub.id))}
                />
              ))}
            </div>
          )}
        </section>
        )}
        </>
      )
  const clock = (
        <>
{/* WHERE THEY ARE RIGHT NOW, AND IT LEADS THE RAIL.
            It used to sit above the map, which is where somebody looks when
            they wonder - but it is a one-line fact about a person, not a
            caption for a picture, and at the top of the rail it is the first
            thing read on the whole page after the name. */}
        {here && (
          <section className={cx(
            'rounded-card border p-4',
            here.travelling ? 'border-brand/25 bg-brand-tint/50' : 'border-gray-100 bg-white shadow-card',
          )}>
            <div className="flex items-center gap-3">
              {/* A CLOCK, NOT A PIN. Ethan: "I don't want it to say 'you are
                  home in Belfast', this is almost too creepy, instead just
                  show the time for you or for them. And change the icon from
                  that pin."
                  He is right, and the reason is worth writing down: a pin over
                  "Maddie is at home in Belfast" is a sentence about where
                  somebody LIVES, volunteered by the app to a stranger. The time
                  where they are is the same fact turned into something useful -
                  it answers "can I message them now" instead of "where do they
                  sleep". A travelling creator still says where, because they
                  published that themselves on the collab board. */}
              {/* ORANGE, LIKE EVERY OTHER RAIL CARD'S ICON. This one was grey
                  on grey while At a glance, Headed next, Languages and the rest
                  all lead with a brand-orange mark, so the first card in the
                  rail was the only one that did not look like it belonged.
                  Ethan: "make the your local time icon an orange icon that
                  matches the others." */}
              <span className={cx(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                here.travelling ? 'bg-brand text-white' : 'bg-brand-tint text-brand',
              )}>
                <Icon name={here.travelling ? 'plane' : 'clock'} className="h-4 w-4" />
              </span>
              <p className="min-w-0 text-sm">
                {here.travelling ? (
                  <>
                    <span className="block font-semibold text-ink">
                      {/* "You ARE", "Maddie IS". Getting this wrong is the sort
                          of thing that makes a product feel machine-written. */}
                      {`${here.who} ${isMe ? 'are' : 'is'} in ${here.place}`}
                    </span>
                    {currentTrip && <span className="block text-xs text-smoke">Back {formatDate(currentTrip.end_date)}</span>}
                  </>
                ) : (
                  <>
                    <span className="block font-semibold text-ink">
                      <LocalTime profile={creator} bare />
                    </span>
                    <span className="block text-xs text-smoke">
                      {isMe ? 'Your local time' : `${here.who}'s local time`}
                    </span>
                  </>
                )}
              </p>
            </div>
          </section>
        )}
        </>
      )
  const glance = (
        <>
{/* AT A GLANCE. Four numbers that used to be four full-width boxes in
            a row across the page, which is a lot of furniture for four facts.
            As rows in one rail card they take a quarter of the space and read
            faster, because the labels line up and the eye goes down a column
            rather than across a band. "Member since" stays - Ethan: "to hear
            since March 2026, I think we might have something similar to that,
            it says member since, so yeah that's good, we should keep that." */}
        <section className="rounded-card border border-gray-100 bg-white p-4 shadow-card">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Icon name="chart" className="h-4 w-4 shrink-0 text-brand" />
            At a glance
          </h2>
          <dl className="space-y-2">
            {[
              ['Member since', formatDate(creator.accepted_at || creator.created_at)],
              ['Countries visited', creator.countries_visited?.length || 0],
              ['Challenges entered', challengeCount],
              ['Videos submitted', submissions.length],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3">
                <dt className="text-xs text-smoke">{k}</dt>
                <dd className="shrink-0 text-sm font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
        </>
      )
  const headedNextSection = (
        <>
{/* ---------- Where I'm headed next ---------- */}
        {/* THE "COLLAB BOARD" LINK BESIDE THE HEADING IS GONE, and the cards
            are the link instead. A heading with a destination next to it is a
            second way to do what the thing underneath it already does, and it
            sent you to the board's front page rather than to the trip you were
            looking at. Ethan: "it shouldn't show collab board beside the title,
            although clicking on one of cards should correctly open to the
            collab board."
            EACH CARD GOES WHERE ITS TRIP LIVES. A collab post opens the collab
            board; a flight with no collab post behind it opens the community
            flight log, because that is the page that trip actually exists on.
            EVERY CARD IS THE SAME SIZE. They were shrink-to-fit, so
            "Namibia, Namibia" and "Cape Town, South Africa" came out as two
            different widths sitting raggedly beside each other. */}
        {(headedNext.length > 0 || isMe) && (
          <section className="rounded-card border border-gray-100 bg-white p-4 shadow-card">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Icon name="plane" className="h-4 w-4 shrink-0 text-brand" />
              {isMe ? "Where I'm headed next" : `Where ${creator.name.split(' ')[0]}'s headed next`}
            </h2>
            {headedNext.length === 0 ? (
              <p className="text-xs leading-relaxed text-smoke">
                Nothing coming up. Post a trip on the collab board or log an upcoming flight and it shows here.
              </p>
            ) : (
              <ul className="space-y-2">
                {headedNext.map((t) => (
                  <li key={t.key}>
                    {/* NO BORDER PER ROW. Every trip was a bordered box inside
                        a bordered card, which is two frames around one thing.
                        Ethan: "no need to have a border around each trip as
                        they're already inside a card." The hover tint is what
                        says a row is a target now. */}
                    <Link
                      to={t.to}
                      className="-mx-1.5 flex h-[58px] w-[calc(100%+0.75rem)] items-center gap-3 rounded-xl px-1.5 transition-colors duration-150 hover:bg-cloud/70"
                    >
                      <span className="w-7 shrink-0 text-center text-xl leading-none" aria-hidden>{t.flag || '📍'}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold leading-tight">{t.place}</span>
                        <span className="block truncate text-xs leading-tight text-smoke">{t.when}</span>
                      </span>
                      <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        </>
      )
  const languages = (
        <>
{/* LANGUAGES AND THE BUCKET LIST, IN ONE CARD AND MUCH SMALLER.
            Ethan: "we have the languages that show up, the travel bucket list,
            but the way they show up is really small, taking up a lot of space,
            and it just doesn't look good."
            Both were their own full-width section with an 18px heading over a
            row of pills - so two facts that fit on one line each were spending
            a third of a screen between them. One card, two labelled rows, and
            the pills are now plain text separated by dots: a chip around a
            single word is a button that does nothing. */}
        {(creator.languages?.length > 0 || creator.bucket_list?.length > 0) && (
          <section className="rounded-card border border-gray-100 bg-white p-4 shadow-card">
            {creator.languages?.length > 0 && (
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Icon name="chat" className="h-4 w-4 shrink-0 text-brand" />
                  Languages
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-smoke">
                  {creator.languages.join(' · ')}
                </p>
              </div>
            )}
            {/* BUCKET LIST, and it opens. It was headed "Still to go", which
                is a description rather than the name of the thing - creators
                call it a bucket list and so does the edit form that fills it
                in. Five, then a control: "+4 more" used to be a full stop, a
                line of grey text telling you there was something you could not
                see. */}
            {creator.bucket_list?.length > 0 && (
              <div className={creator.languages?.length > 0 ? 'mt-4 border-t border-gray-100 pt-4' : undefined}>
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Icon name="bucket" className="h-4 w-4 shrink-0 text-brand" />
                  Bucket list
                </h2>
                <ul className="mt-2 space-y-1.5">
                  {(bucketOpen ? creator.bucket_list : creator.bucket_list.slice(0, 5)).map((b, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span aria-hidden className="shrink-0 text-base leading-none">{flagForCountry(b.country) || '📍'}</span>
                      <span className="min-w-0 truncate text-smoke">
                        {b.city ? `${b.city}, ${b.country}` : b.country}
                      </span>
                    </li>
                  ))}
                </ul>
                {creator.bucket_list.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setBucketOpen((o) => !o)}
                    className="mt-2 text-xs font-medium text-brand transition-transform duration-200 hover:scale-105"
                  >
                    {bucketOpen ? 'Show fewer' : `+${creator.bucket_list.length - 5} more`}
                  </button>
                )}
              </div>
            )}
          </section>
        )}
        {/* ---------- Where they are on the route ----------
            THIS REPLACES THE ACHIEVEMENT BADGES. Those were effort tiers with
            nothing on the other side of them: they appeared, they were grey, and
            reaching one changed nothing, which is why nobody chased them. A
            milestone is the same idea with the two missing halves attached - a
            threshold you can see coming and a real reward behind it - so one line
            here does more than nine icons did. */}
          {/* BEHIND THE PREVIEW FLAG, like the page it links to. This snippet was
            the one part of the milestone build with no gate on it, so it drew on
            every UK creator's profile and its "See the whole route" link took
            them into the unreleased network. Milestones ship with the network,
            not before it. */}
        </>
      )
  const milestones = (
        <>
{/* MILESTONES SIT ABOVE THE FLIGHT LOG. They are the thing with a
            next step in it - a threshold you can see coming and a reward behind
            it - and the flight log underneath is the evidence of the distance
            already covered. Read in that order it is a route; read the other
            way round it is two sets of numbers. */}
        {!creator.is_admin && (
          <section>
            <MilestoneSnippet profileId={creator.id} own={isMe} />
          </section>
        )}
        </>
      )
  const flightLog = (
        <>
{/* THE FLIGHT LOG, WHICH IS ALSO THE AIRCRAFT COLLECTION NOW. Lifetime
            distance, flights, airports and countries, then the three types
            flown most with their photographs. There used to be a separate
            "Aircraft collection" card drawing the same aeroplanes at a
            different size two cards further down. */}
        <ProfileFlights creatorId={creator.id} isMe={isMe} name={creator.name} rail />
        </>
      )
  const challengeWall = (
        <>
        <ChallengeHistoryCard creatorId={creator.id} isMe={isMe} firstName={creator.name.split(' ')[0]} />
        </>
      )
  const puzzles = (
        <>
        <PuzzleCard creatorId={creator.id} isMe={isMe} firstName={creator.name.split(' ')[0]} />
        </>
      )



  return (
    <div className="page space-y-10">
      {/* ---------- Header ---------- */}
      <section className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-start sm:text-left">
        {/* BIGGER. The avatar is the only picture in the header and it was the
            same size as the one on a directory card, so the page opened with
            the name doing all the work. */}
        <div className="shrink-0">
          <Avatar src={creator.photo_url} name={creator.name} size="xl" className="!h-32 !w-32 sm:!h-36 sm:!w-36" />
        </div>
        <div className="min-w-0 flex-1">
          {/* THE ROLE SITS BESIDE THE NAME. It had its own line under it,
              which read as a second heading; beside the name it reads as what
              it is - who this person is, in four words. Ethan: "the role beside
              their name like Jacob and then Creator in the tryp.com orange." */}
          <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 sm:justify-start">
            <h1 className="text-3xl font-bold tracking-tight sm:text-[34px]">{creator.name}</h1>
            <span className="text-[15px] font-semibold tracking-[-0.01em] text-brand sm:text-base">
              {roleBadgeTitle(creator) || 'Creator'}
            </span>
          </div>

          {/* WHAT THEY ARE CALLED, AND IT IS THE SECOND THING YOU READ.
              This was a small grey pill sharing a line with the name and an
              unlabelled number. Every person on this platform holds a role -
              "Creator" if nothing else - and that role is the single most
              useful fact about them, so it gets its own line, in brand orange,
              at a size you read rather than notice.
              The per-person title is already stored (profiles.role_title, set
              on the team page) and `roleBadgeTitle` falls back to the generic
              label only when nobody has been given one, so a Spain country
              manager reads "Spanish Country Manager" and Ethan reads
              "Tryp.com CCC Lead". A creator who has flown far enough to earn
              "Tryp.com Senior Creator" reads that. Everybody else reads
              "Creator", which is a job, not a blank. */}
          {/* AGE, WITH THE WORD ON IT, on its own line under the name. It was
              a bare number floating after the name, which could have been
              anything - a rank, a count, a badge. */}
          {((ageFromDob(creator.dob) ?? creator.age) || isApplication) && (
            <p className="mt-1 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5 sm:justify-start">
              {(ageFromDob(creator.dob) ?? creator.age) && (
                <span className="text-sm text-smoke">
                  <span className="tabular-nums">{ageFromDob(creator.dob) ?? creator.age}</span> years old
                </span>
              )}
              {isApplication && <Badge tone="amber">Pending review</Badge>}
            </p>
          )}

          {(creator.city || creator.country || currentTrip) && (
            <p className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-smoke sm:justify-start">
              {(creator.city || creator.country) && (
                <span className="flex items-center gap-1.5">
                  <Icon name="home" className="h-4 w-4 shrink-0 text-brand" />
                  {[creator.city, creator.country].filter(Boolean).join(', ')}
                </span>
              )}
              {/* On a collab-board trip right now → live chip beside the base town */}
              {currentTrip && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2.5 py-0.5 text-[11px] font-semibold text-brand">
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden>
                    <path d="M21.5 15.5v-2l-8.5-5V3.25a1.5 1.5 0 0 0-3 0V8.5l-8.5 5v2l8.5-2.5v5.25L7.75 20v1.5L12 20.25l4.25 1.25V20L14 18.25V13z" />
                  </svg>
                  Currently in {currentTrip.city || currentTrip.country}
                </span>
              )}
              {/* THE CLOCK IS NOT HERE ANY MORE. It is the first card in the
                  rail, which is where somebody looks for a fact about where
                  this person is; having it in both places meant the same
                  sentence twice on one screen. */}
            </p>
          )}
          {creator.bio && <p className="mt-2 text-lg text-smoke">{creator.bio}</p>}
          {creator.favourite_quote && (
            /* BIGGER, because it was 14px grey italic and genuinely hard to
               read - a quote somebody chose to put on their profile should not
               be the faintest thing on it. */
            <p className="mt-3 border-l-[3px] border-brand pl-3.5 text-[17px] italic leading-relaxed text-ink/80">
              &ldquo;{creator.favourite_quote}&rdquo;
            </p>
          )}
          {/* NAMED, AND IN THE PLATFORM'S OWN COLOURS. These were six
              identical grey circles, so the row that is entirely ABOUT other
              platforms was the least recognisable thing on the page, and you
              had to hover to find out which was which. Ethan: "the links should
              have better UI and the actual colourful social media logos, not
              greyed, in each card have the icon and write the name TikTok etc,
              make it clearer." */}
          {socials.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              {socials.map((x) => (
                <a
                  key={`${x.brand}-${x.url}`}
                  href={x.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-full border border-gray-200 py-1.5 pl-2 pr-3.5 text-sm font-medium text-ink transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-card"
                >
                  <SocialMark brand={x.brand} colored className="h-[18px] w-[18px] shrink-0" />
                  {x.label}
                </a>
              ))}
            </div>
          )}
          {/* MUTUALS, AS FACES. It was a count: "3 mutual connections". A number
              answers "do we overlap"; the faces answer "should I say hello",
              which is the question somebody is actually asking on a profile -
              and in a community of 45 the specific people are recognisable, so
              the overlap is the introduction. Ethan: "mutual connections showing
              up on a profile, so it shows just connected with who kind of."
              Overlapped avatars rather than a row: at four or five it stays one
              object the width of a sentence, and the names are on hover. */}
          {!isMe && mutual.total > 0 && (
            <Link
              to="/connections"
              className="mt-3 flex items-center justify-center gap-2 text-xs font-medium text-smoke transition-colors hover:text-brand sm:justify-start"
            >
              <span className="flex -space-x-2">
                {mutual.people.slice(0, 5).map((m) => (
                  <span key={m.id} title={m.name} className="rounded-full ring-2 ring-white">
                    <Avatar src={m.photo_url} name={m.name} size="xs" />
                  </span>
                ))}
              </span>
              <span>
                {mutual.total === 1 && mutual.people[0]
                  ? `${mutual.people[0].name.split(' ')[0]} is a mutual connection`
                  : `${mutual.total} mutual connections`}
              </span>
            </Link>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-3">
          {/* THE SHARE CARD IS GONE. It rendered a canvas PNG of your own
              profile to download and post elsewhere, and it was the second
              thing on your own header competing with the one control that
              matters here. Removed at Ethan's request; lib/shareCard.js is
              still in the repo if it comes back. */}
          {isMe ? (
            <div className="flex gap-3">
              <Link to="/profile/edit" className="btn-primary">Edit profile</Link>
            </div>
          ) : (
            <>
              <div className="flex gap-3">
                <ConnectButton
                  myId={user.id}
                  targetId={id}
                  relation={relation}
                  onChange={setRelation}
                  targetName={creator?.name}
                  className="!py-2.5"
                />
                <button onClick={startMessage} className="btn-secondary">Message</button>
              </div>
              {/* REPORTING IS A QUIET CONTROL AND SHOULD LOOK LIKE ONE.
                  It sits under the two things you actually came here to do, in
                  the smallest type on the card, because a prominent Report
                  button on every profile changes what a profile FEELS like -
                  it suggests the community needs policing. It has to be
                  findable, not offered. Admins do not see it: they have the
                  reports queue, and reporting somebody to yourself is a loop. */}
              {!viewerIsAdmin && (
                <button
                  type="button"
                  onClick={() => setReporting(true)}
                  className="self-center text-[11px] font-medium text-smoke transition-colors hover:text-red-600 sm:self-end"
                >
                  Report this creator
                </button>
              )}

              {/* Approve / decline right here for application profiles, so admins
                  don't have to bounce back to the applications list. */}
              {isApplication && (
                <div className="flex gap-3">
                  <button onClick={() => decideApplication('active')} disabled={deciding} className="btn-primary flex-1 !py-2.5 text-sm">Approve</button>
                  <button onClick={() => decideApplication('declined')} disabled={deciding} className="btn-danger flex-1 !py-2.5 text-sm">Decline</button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* ================= THE PAGE, SPLIT =================
          Ethan: "you can split it rather than just having big wide cards
          everywhere. Similar to the worldwide page, smaller cards on the right
          hand side and the bigger cards on the left hand side."
          Everything here used to be a full-width band stacked twelve deep, so
          a map, four statistics, a language list and a bucket list all had the
          same weight and the same width - which is why the page read as a
          scroll of unrelated stripes rather than as one person.
          LEFT is the things that NEED width: the map, the photo board, the
          flight log, the video showcase. RIGHT is everything that is a fact
          rather than a picture, at a quarter of the size.
          ONE COLUMN BELOW `lg`, main first. A rail stacked above the content on
          a phone is just the old page with smaller headings.
          THERE IS NO SECOND LAYOUT ANY MORE. This whole page used to render
          twice - a split version behind the network preview flag and the old
          stack of full-width bands for everyone else - which meant every change
          had to be made in both or the two drifted. The network is live, so the
          old one is gone. */}
      {/* ---------------- ONE COLUMN, BELOW `lg` ----------------
          CHOSEN IN JAVASCRIPT, NOT WITH `hidden`. A `hidden lg:grid` twin still
          RENDERS: both trees mount, so the photo board fetched its rows twice,
          measured every image twice and loaded the world atlas twice, all to
          paint one of them. Cheap for a settings panel, not for this page. */}
      {isMobile ? (
      <div className="flex flex-col gap-6">
        {about}
        {clock}
        {glance}
        {worldMap}
        {headedNextSection}
        {photos}
        {languages}
        {milestones}
        {puzzles}
        {showcase}
        {/* The flight log and the challenge wall come after the games on a
            phone: they are the two densest cards and they are the ones a
            visitor is least likely to have scrolled this far for. */}
        {flightLog}
        {challengeWall}
      </div>

      ) : (
      /* ---------------- TWO COLUMNS, FROM `lg` ---------------- */
      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-8">
          {about}
          {worldMap}
          {photos}
          {showcase}
        </div>
        <aside className="min-w-0 space-y-4">
          {clock}
          {glance}
          {headedNextSection}
          {languages}
          {milestones}
          {flightLog}
          {challengeWall}
          {puzzles}
        </aside>
      </div>
      )}
      {/* Mounted at the page root rather than beside the button: Modal portals
          to the body anyway, and keeping it out of the header section means the
          header's flex layout never has to account for a child that renders
          nothing 99% of the time. */}
      <ReportCreator open={reporting} onClose={() => setReporting(false)} creator={creator} />
    </div>
  )
}

// ------------------------------------------------------- one showcase entry
//
// A challenge entry, as a card that is always the same height as the card
// beside it.
//
// THE THREE THINGS THAT BROKE THE OLD ONE. (1) The whole card was one <a>, so
// nothing inside it could ever be its own target. (2) The caption sat in normal
// flow, so a creator who wrote a paragraph made their card twice the height of
// everyone else's and the grid went ragged. (3) It showed no view count at all,
// which is the number the entry is actually judged on and the one thing that
// keeps updating by itself after it is posted.
//
// So: fixed geometry, a caption clamped to two lines that opens in place, and
// the views on the thumbnail where the eye already is.
function ShowcaseCard({ submission: s, expanded, onToggle }) {
  const views = Number(s.logged_views) || 0
  const hasCaption = !!s.caption?.trim()

  return (
    <div className="card group flex flex-col overflow-hidden !p-0">
      {/* The picture is the link to the video. THE PLATFORM BADGE THAT USED TO
          FLOAT IN THE TOP-RIGHT IS GONE: VideoThumb already draws the platform
          across the thumbnail, so the card said "Instagram" twice, once as a
          word and once as a mark six millimetres away. Ethan: "on the actual
          card it should already say Instagram, TikTok, Facebook etc, so you can
          remove the additional icon." */}
      <a
        href={s.video_url}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block"
        aria-label={`Watch this ${s.platform || ''} video`.trim()}
      >
        <VideoThumb url={s.video_url} platform={s.platform} className="rounded-b-none" />
      </a>

      <div className="flex min-w-0 flex-1 flex-col p-4">
        {/* VIEWS LEAD THE CARD. They were a dark pill floating on the bottom
            left of the thumbnail, sitting on whatever happened to be in the
            picture there and competing with the platform name beside it. They
            are the most interesting number on the card and the only one that
            keeps updating by itself, so they get the first line, in brand
            orange, with the challenge and the date as the quiet half.
            `views_approx` is set when the platform only gives us a rounded
            figure, and saying "1.2K" as though it were exact would be a small
            lie repeated on every card. */}
        <div className="flex items-baseline justify-between gap-3">
          {views > 0 ? (
            <span className="flex items-baseline gap-1.5 text-brand">
              <span className="text-[17px] font-bold tabular-nums leading-none">
                {s.views_approx ? '~' : ''}{views.toLocaleString('en-GB')}
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wide">views</span>
            </span>
          ) : (
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">No views yet</span>
          )}
          <span className="shrink-0 text-[11px] text-smoke">{postedOn(s.submitted_at)}</span>
        </div>

        <p className="mt-1 truncate text-xs text-smoke">{s.challenges?.title}</p>

        {hasCaption ? (
          <>
            <p className={cx('mt-2 whitespace-pre-line text-sm leading-5 text-ink', !expanded && 'line-clamp-2 h-10')}>
              {s.caption}
            </p>
            {/* The control only appears when there is genuinely something
                hidden. Measuring the text is the honest test, but a clamp of
                two lines at this size is about 110 characters and measuring on
                every render to save one button is not a trade worth making. */}
            {(expanded || s.caption.trim().length > 90 || s.caption.includes('\n')) && (
              <button
                type="button"
                onClick={onToggle}
                className="mt-1.5 self-start text-xs font-medium text-brand transition-transform duration-200 hover:scale-105"
              >
                {expanded ? 'Show less' : 'Read more'}
              </button>
            )}
          </>
        ) : (
          <p className="mt-2 h-10 text-sm leading-5 text-smoke">No caption</p>
        )}

        {/* Pushed to the bottom so the row of cards lines up on this line
            whatever the caption above it did. */}
        <a
          href={s.video_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto pt-3 text-sm font-semibold text-brand transition-transform duration-200 hover:scale-[1.02]"
        >
          Watch the video ↗
        </a>
      </div>
    </div>
  )
}

// Travel photo section. The section ALWAYS renders (even with no photos) so a
// profile never looks broken/incomplete. On your own profile an empty state
// nudges you to add photos; on someone else's it says they haven't added any.
// THE PHOTOS. A BOARD ON THE NETWORK PAGE, THE OLD GRID EVERYWHERE ELSE.
//
// `board` is the network-preview flag arriving from the page, and it is the one
// switch: UK creators keep the grid they have until the network ships, and the
// board only ever draws where the rest of the new profile does.
//
// ARRANGING IS FOR THE OWNER AND HAPPENS HERE, NOT IN EDIT PROFILE. Dragging a
// photo into place while looking at a settings form is arranging something you
// cannot see; the board is editable in situ, on the page it will be read on,
// which is the only place the result means anything.
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
        {/* STRAIGHT TO THE PHOTOS. This went to /profile/edit, which opens on
            the "You" step, so "Manage photos" landed you on a form about your
            name and date of birth with the photos three tabs away. */}
        {isMe && count > 0 && <Link to="/profile/edit?tab=photos" className="text-sm font-medium text-brand transition-transform duration-200 hover:scale-105">Manage photos</Link>}
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
        /* READ ONLY HERE. The board used to be editable in place, with an
           "Arrange the board" toggle sitting on your own public profile - so
           the page had two modes and the one you were shown depended on who
           you were. Ethan: "we have arrange the board and we have manage
           photos which is weird, it should just be manage photos."
           Arranging, cropping, captioning and deleting all live in one place
           now: Edit profile → Photos, which shows the same board with the same
           component, so what you arrange is exactly what lands here. */
        <PhotoBoard creatorId={creatorId} editable={false} />
      )}
    </section>
  )
}
