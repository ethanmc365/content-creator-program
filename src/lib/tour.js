import { supabase } from './supabase'
import { readFlag } from './appFlags'

// THE GUIDED WALKTHROUGH.
//
// A new creator's first minute decides whether they ever come back, and until
// this existed that minute was: land on the home page, see five tabs, work it
// out. The people who work it out are the people who were going to stay anyway.
//
// It is not a tutorial and it does not call itself one. Nobody wants a tutorial
// and the word promises homework. It is somebody walking you round, and three
// of the stops ask you to actually do something rather than read about it -
// because a creator who has notifications on, one connection made and one brief
// read on day one is a creator with a reason to open the app on day two.
//
// WHAT CHANGED IN THE REWRITE
//
// The first version walked people round the LEGACY app: five tabs, a chat room
// and a rewards page. That is not the platform any more. This one covers the
// network - the worldwide hub, market chapters, the board, the flight log, the
// games, the collaboration map - and adapts: with the network shell off it
// skips straight past everything that does not exist yet, so the same step list
// serves both without two sets of copy drifting apart.
//
// HOW IT IS ANCHORED
//
// A step names a `data-tour` attribute, never a position. The SAME name is on
// the desktop nav item and the mobile tab, and the resolver picks whichever is
// actually visible - one set of steps for a phone, a tablet and a desktop. A
// step whose anchor is nowhere on the page is skipped rather than shown
// pointing at the top-left corner.
//
// WHO SEES IT: `shouldAutoStart` at the foot of this file. Short version - a
// brand new approved creator, once, and nobody else. Migration 107 backfilled
// every creator who was already here as done, and the whole thing additionally
// reads a switch in app_settings.

export const TOUR_VERSION = 2

// THE PARTS.
//
// Eighteen stops read as a list of eighteen things. Five named parts read as a
// short walk with a shape to it, and the card can say "Your people, 2 of 5" -
// which is the difference between "how much more of this is there" and "we are
// nearly at the end of this bit".
export const TOUR_PARTS = [
  { key: 'start', label: 'Getting your bearings' },
  { key: 'work', label: 'The work' },
  { key: 'people', label: 'Your people' },
  { key: 'world', label: 'The wider network' },
  { key: 'you', label: 'Your account' },
]

// `on`: 'both' | 'network' | 'legacy'. Network steps are dropped entirely when
// the worldwide shell is off, rather than pointing at a page that redirects.
const ALL = 'both'
const NET = 'network'

/**
 * key       stable id. Used for progress, and for the Testing Centre's list.
 * part      which of the five named parts this belongs to
 * title     short. It is read in about a second, over the top of a live app.
 * body      one or two sentences. Never three.
 * anchor    a `data-tour` value, or null for a centred card over a dimmed page
 * route     navigate here before the step is shown
 * on        which shell this step exists in
 * action    a step that WAITS for the creator to do something real
 * required  an action step that cannot be passed over (only the last one is)
 * tip       an extra line, shown smaller, for the thing people miss
 */
export const TOUR_STEPS = [
  // ------------------------------------------------ getting your bearings ---
  {
    key: 'welcome',
    part: 'start',
    title: 'Give us two minutes',
    body: 'A quick walk round so you know where everything is and what is worth doing first. Stop whenever you like.',
    anchor: null,
    route: '/home',
    on: ALL,
  },
  {
    key: 'home',
    part: 'start',
    title: 'Start here every time',
    body: 'The live brief, what the community is talking about, and anything waiting on you. If you only open one page, open this one.',
    anchor: 'nav-home',
    route: '/home',
    on: ALL,
  },
  {
    key: 'search',
    part: 'start',
    title: 'Everything is one search away',
    body: 'Any creator, any challenge, any room, any page. Press this rather than hunting through the menus.',
    anchor: 'search',
    route: '/home',
    on: NET,
    tip: 'Keyboard shortcut: Cmd K, or just press forward slash.',
    skipIfMissing: true,
  },

  // -------------------------------------------------------------- the work ---
  {
    key: 'challenges',
    part: 'work',
    title: 'This is what you are here for',
    body: 'A brief goes up, you film it, you post it, and the best videos win real money. Usually one is running at a time.',
    anchor: 'nav-challenges',
    route: '/challenges',
    on: ALL,
  },
  {
    key: 'brief',
    part: 'work',
    title: 'Read the brief before you film',
    body: 'It tells you what to shoot, when it closes, how it is judged and exactly what the prizes are. None of that is held back until afterwards.',
    anchor: 'challenge-card',
    route: '/challenges',
    on: ALL,
    skipIfMissing: true,
  },
  {
    key: 'submit',
    part: 'work',
    title: 'Entering takes about thirty seconds',
    body: 'Post the video on your own account as you normally would, then paste the link here. We never re-upload your work or take it off your channel.',
    anchor: null,
    route: '/challenges',
    on: ALL,
    tip: 'You can enter more than once. On most briefs only your strongest video counts.',
  },
  {
    key: 'rewards',
    part: 'work',
    title: 'Add your bank details before you win',
    body: 'Prizes, vouchers and the invoices behind them all live here. Filling this in now saves a week of chasing later.',
    anchor: null,
    route: '/rewards',
    on: ALL,
  },
  {
    key: 'milestones',
    part: 'work',
    title: 'There is a route through all this',
    body: 'Videos posted, views reached, challenges entered. Each milestone unlocks something, and you can see exactly how far off the next one you are.',
    anchor: null,
    route: '/milestones',
    on: NET,
  },

  // ----------------------------------------------------------- your people ---
  {
    key: 'creators',
    part: 'people',
    title: 'Everybody else',
    body: 'Every creator in the programme, where they are based, what they film and where they are heading next. This is the part people stay for.',
    anchor: 'creator-card',
    route: '/creators',
    on: ALL,
    skipIfMissing: true,
  },
  {
    key: 'connect',
    part: 'people',
    title: 'Connect with one person now',
    body: 'Pick anyone at all. Connections are how introductions happen, how meet-ups get arranged, and how you start showing up in other people’s suggestions.',
    anchor: 'creator-card',
    route: '/creators',
    on: ALL,
    action: 'connect',
    skipIfMissing: true,
    tip: 'Press Connect on any card. You can do this later, but doing it now is the single best thing on this list.',
  },
  {
    key: 'rooms',
    part: 'people',
    title: 'Where the programme actually talks',
    body: 'Ask anything, post what you are working on, share a rate you got quoted. The team is in here too, and answers.',
    anchor: 'nav-chat',
    route: '/chat/general',
    on: ALL,
  },
  {
    key: 'dms',
    part: 'people',
    title: 'And privately',
    body: 'One to one or a group. Anybody you are connected to can be messaged from here.',
    anchor: 'nav-messages',
    route: '/messages',
    on: ALL,
  },
  {
    key: 'collab',
    part: 'people',
    title: 'Post a trip, find company',
    body: 'Put your next trip on the map and it tells you who else will be there. Half the collaborations in the programme started as an overlap nobody would have spotted.',
    anchor: null,
    route: '/collab',
    on: NET,
  },
  {
    key: 'board',
    part: 'people',
    title: 'Somebody has already answered it',
    body: 'The question board. Gear, rates, visas, which airline actually pays out. Ask, or read what has been asked.',
    anchor: null,
    route: '/board',
    on: NET,
  },

  // ------------------------------------------------------ the wider network ---
  {
    key: 'worldwide',
    part: 'world',
    title: 'You are part of something bigger',
    body: 'Six markets across Europe, one network. The people, the map and the games are shared; the briefs and the leaderboards are local to you.',
    anchor: 'nav-worldwide',
    route: '/global',
    on: NET,
  },
  {
    key: 'flights',
    part: 'world',
    title: 'Log a flight, get a boarding pass',
    body: 'Two airport codes and a date is enough. It works out the distance, the aircraft, the time zones you crossed and who else has flown that route.',
    anchor: null,
    route: '/flights',
    on: NET,
    tip: 'Every aircraft type you fly gets added to your collection.',
  },
  {
    key: 'games',
    part: 'world',
    title: 'Three puzzles, every day',
    body: 'Guess the country, fly the flight path, take the quiz. Keep a streak going and you climb the leaderboard.',
    anchor: null,
    route: '/game',
    on: NET,
  },
  {
    key: 'calendar',
    part: 'world',
    title: 'What is coming up',
    body: 'Deadlines, community calls, content days and your own trips, on one calendar you can subscribe to from your phone.',
    anchor: 'nav-calendar',
    route: '/events',
    on: ALL,
    skipIfMissing: true,
  },

  // ---------------------------------------------------------- your account ---
  {
    key: 'profile',
    part: 'you',
    title: 'Keep your profile current',
    body: 'Everything you filled in when you joined, editable any time. A complete profile is what gets you picked for paid work.',
    anchor: 'avatar-menu',
    route: '/settings',
    on: ALL,
  },
  {
    key: 'settings',
    part: 'you',
    title: 'This walk lives in here',
    body: 'Theme, sounds, timezone, privacy, and a button to walk through all this again whenever you want.',
    anchor: null,
    route: '/settings',
    on: ALL,
  },
  // THE LAST STEP, AND THE ONE THAT CANNOT BE SKIPPED.
  //
  // Everything else on this list is a place. This is the only thing that
  // decides whether the creator ever comes back, because a challenge they did
  // not hear about is a challenge they did not enter. It is the one hard gate
  // in the whole walk, and it still lets somebody past when their browser has
  // already refused - see TourHost, a gate with no way through is not a gate.
  {
    key: 'notifications',
    part: 'you',
    title: 'Last thing, and it matters',
    body: 'Turn notifications on. It is how you hear that a brief went live, that results are in, or that you have been paid. Without it you will miss deadlines.',
    anchor: 'enable-push',
    route: '/settings?section=notifications',
    on: ALL,
    action: 'push',
    required: true,
  },
  {
    key: 'done',
    part: 'you',
    title: 'That is everything',
    body: 'Go and read the current brief. If you get stuck, ask in the rooms - somebody always answers.',
    anchor: null,
    route: '/home',
    on: ALL,
  },
]

/**
 * The steps that apply here.
 *
 * `network` drops every step whose feature does not exist yet, so the walk is
 * shorter and correct on the legacy shell rather than longer and full of dead
 * ends. The percentage is computed off THIS list, never off TOUR_STEPS, or a
 * creator on the legacy shell would top out at sixty per cent.
 */
export function stepsFor({ network = false } = {}) {
  return TOUR_STEPS.filter((s) => s.on === ALL || (s.on === NET && network))
}

/** Which part a step belongs to, and where that part sits in the walk. */
export function partOf(step) {
  const i = TOUR_PARTS.findIndex((p) => p.key === step?.part)
  return { index: i < 0 ? 0 : i, ...(TOUR_PARTS[i] || TOUR_PARTS[0]) }
}

// ------------------------------------------------------------ persistence ---

const SEEN_KEY = (layout) => `tryp_tour_seen_${layout}_v${TOUR_VERSION}`

/**
 * ONE FLAG IN THE DATABASE, ONE PER LAYOUT IN THE BROWSER.
 *
 * The database column answers "has this person ever been walked round", which
 * stops it running twice and is what Settings resets. The local flag is per
 * LAYOUT, because the phone walk and the desktop walk point at genuinely
 * different chrome - somebody who joined on a laptop and later opens it on
 * their phone has not seen the phone one, and showing it once is right rather
 * than annoying.
 */
export function seenLocally(layout) {
  try { return localStorage.getItem(SEEN_KEY(layout)) === '1' } catch { return false }
}

export function markSeenLocally(layout) {
  try { localStorage.setItem(SEEN_KEY(layout), '1') } catch { /* private mode */ }
}

export function clearSeenLocally() {
  try {
    for (const l of ['mobile', 'desktop']) localStorage.removeItem(SEEN_KEY(l))
  } catch { /* private mode */ }
}

/** Record that somebody finished or dismissed it. Never throws at the caller. */
export async function markTourComplete(userId) {
  if (!userId) return
  try {
    await supabase.from('profiles').update({ tour_completed_at: new Date().toISOString() }).eq('id', userId)
  } catch { /* a failed write means they see it once more, which is survivable */ }
}

/** Clear the flag so it runs again. Used by the Settings entry. */
export async function resetTour(userId) {
  clearSeenLocally()
  if (!userId) return
  try {
    await supabase.from('profiles').update({ tour_completed_at: null }).eq('id', userId)
  } catch { /* the local clear is enough to make it run on this device */ }
}

/**
 * THE MASTER SWITCH. Read from app_settings rather than compiled in, so turning
 * the walkthrough on for new signups is a row update and not a deploy. Fails
 * closed - see lib/appFlags.
 */
export const tourEnabled = () => readFlag('tour_enabled')

/**
 * Should this person be walked round, right now, without being asked?
 *
 * Every condition has to hold. Admins are excluded because they are the people
 * demonstrating it, and a spotlight arriving mid-demonstration is its own kind
 * of problem; they start it deliberately from the Testing Centre or Settings.
 */
export function shouldAutoStart({ profile, enabled, layout }) {
  if (!enabled) return false
  if (!profile) return false
  if (profile.is_admin || profile.is_test) return false
  if (profile.status !== 'active') return false
  if (!profile.onboarded) return false
  if (profile.tour_completed_at) return false
  if (seenLocally(layout)) return false
  return true
}
