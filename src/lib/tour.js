import { supabase } from './supabase'
import { readFlag } from './appFlags'

// THE GUIDED WALKTHROUGH.
//
// A new creator's first minute decides whether they ever come back, and without
// this that minute is: land on the hub, see five tabs, work it out. The people
// who work it out are the people who were going to stay anyway.
//
// IT IS NOT A SLIDESHOW ANY MORE.
//
// The first two versions were a carousel: read a card, press Next, read the next
// card. Nobody remembers a carousel. Every step here now has an OBJECTIVE - tap
// this, scroll that, open a brief, connect with somebody, turn notifications on -
// and the walk advances when the creator actually does it. There is no Next
// button, because pressing Next teaches you how to press Next.
//
// The consequence worth stating: by the end of it they have navigated to eight
// real pages themselves, opened a live brief, sent one connection request and
// enabled notifications. That is not a tour, it is a first session.
//
// HOW IT IS ANCHORED
//
// A step names a `data-tour` attribute, never a position. The SAME name is on
// the desktop nav item and the mobile tab, and the resolver picks whichever is
// visible - one set of steps for a phone, a tablet and a desktop. A step whose
// anchor is nowhere is skipped rather than shown pointing at the corner.
//
// WHO SEES IT: `shouldAutoStart` at the foot of this file. A brand new approved
// creator, once, and nobody else. Migration 107 backfilled every creator who was
// already here, and it additionally reads a switch in app_settings.

export const TOUR_VERSION = 3

// The five named parts. Twenty stops read as a list of twenty things; five
// parts read as a walk with a shape, and a shape is what stops somebody
// quitting a third of the way in.
export const TOUR_PARTS = [
  { key: 'start', label: 'Getting your bearings' },
  { key: 'work', label: 'The work' },
  { key: 'people', label: 'Your people' },
  { key: 'world', label: 'The wider network' },
  { key: 'you', label: 'Your account' },
]

const ALL = 'both'
const NET = 'network'

/**
 * A STEP.
 *
 * key      stable id, used for progress and by the Testing Centre
 * part     one of TOUR_PARTS
 * title    short. Read in about a second, over the top of a live app.
 * body     one or two sentences. Never three.
 * do       THE INSTRUCTION. What the creator has to actually do. Shown in
 *          brand colour under the body, because it is the only line that
 *          matters if they read nothing else.
 * anchor   a `data-tour` value to spotlight, or null for a centred card
 * at       where the tour puts them before the step begins. If they are already
 *          somewhere the goal accepts, it does not move them.
 * atNet    `at` when the worldwide shell is on. THE HUB IS /global THERE, not
 *          /home - which is the whole reason this field exists.
 * goal     what completes it. See GOAL kinds below.
 * on       'both' | 'network'
 * required cannot be skipped (exactly one step: notifications)
 *
 * GOAL KINDS
 *   route   { to }        they navigate there themselves
 *   scroll  { px }        they scroll the page by that much
 *   click   { anchor }    they press the highlighted thing
 *   connect               a connection request goes out
 *   push                  notification permission is granted
 *   dwell   { ms }        nothing to do, so it advances on its own
 */
export const TOUR_STEPS = [
  // ------------------------------------------------ getting your bearings ---
  {
    key: 'welcome',
    part: 'start',
    title: 'Give us two minutes',
    body: 'This is a short walk round, and you drive it. Do the thing each card asks and it moves on by itself.',
    do: 'Starting in a moment',
    anchor: null,
    at: '/home',
    atNet: '/global',
    goal: { kind: 'dwell', ms: 3400 },
    on: ALL,
  },
  {
    key: 'hub',
    part: 'start',
    title: 'This is the hub',
    body: 'Everything happening across the network right now: live briefs, who is travelling, what the rooms are talking about.',
    do: 'Scroll down and have a look',
    anchor: null,
    at: '/home',
    atNet: '/global',
    goal: { kind: 'scroll', px: 420 },
    on: ALL,
  },
  {
    key: 'search',
    part: 'start',
    title: 'Everything is one search away',
    body: 'Any creator, any brief, any room. Faster than hunting through menus, and it is the shortcut worth learning first.',
    do: 'Press the search button',
    anchor: 'search',
    at: '/home',
    atNet: '/global',
    goal: { kind: 'click', anchor: 'search' },
    on: NET,
    skipIfMissing: true,
  },

  // -------------------------------------------------------------- the work ---
  {
    key: 'challenges',
    part: 'work',
    title: 'This is what you are here for',
    body: 'A brief goes up, you film it, you post it, the best videos win real money. Usually one is running at a time.',
    do: 'Tap Challenges',
    anchor: 'nav-challenges',
    goal: { kind: 'route', to: '/challenges' },
    on: ALL,
  },
  {
    key: 'brief',
    part: 'work',
    title: 'Open one and read it properly',
    body: 'A brief says what to shoot, when it closes, how it is judged and exactly what the prizes are. None of it is held back until afterwards.',
    do: 'Open a challenge',
    anchor: 'challenge-card',
    at: '/challenges',
    goal: { kind: 'route', to: '/challenges/' },
    on: ALL,
    skipIfMissing: true,
  },
  {
    key: 'brief-read',
    part: 'work',
    title: 'The whole deal, in one place',
    body: 'Prizes, deadline, scoring and the participation voucher. Entering takes about thirty seconds: post the video on your own account as normal, then paste the link.',
    do: 'Scroll through the brief',
    anchor: null,
    goal: { kind: 'scroll', px: 500 },
    on: ALL,
  },
  {
    key: 'rewards',
    part: 'work',
    title: 'Add your bank details before you win',
    body: 'Prizes, vouchers and the invoices behind them live here. Filling this in now saves a week of chasing later.',
    do: 'Open your rewards',
    anchor: null,
    at: '/challenges',
    goal: { kind: 'route', to: '/rewards' },
    on: ALL,
  },

  // ----------------------------------------------------------- your people ---
  {
    key: 'creators',
    part: 'people',
    title: 'Everybody else',
    body: 'Every creator in the programme, where they are based, what they film and where they are heading next. This is the part people stay for.',
    anchor: null,
    do: 'Open the creator directory',
    at: '/rewards',
    goal: { kind: 'route', to: '/creators' },
    on: ALL,
  },
  {
    key: 'connect',
    part: 'people',
    title: 'Connect with one person',
    body: 'Pick anyone. Connections are how introductions happen, how meet-ups get arranged, and how you start appearing in other people’s suggestions.',
    do: 'Press Connect on any creator',
    anchor: 'creator-card',
    at: '/creators',
    goal: { kind: 'connect' },
    on: ALL,
    skipIfMissing: true,
  },
  {
    key: 'rooms',
    part: 'people',
    title: 'Where the programme actually talks',
    body: 'Ask anything, post what you are working on, share a rate you got quoted. The team is in here too, and answers.',
    do: 'Tap the rooms',
    anchor: 'nav-chat',
    goal: { kind: 'route', to: '/chat' },
    goalNet: { kind: 'route', to: '/rooms' },
    on: ALL,
  },
  {
    key: 'dms',
    part: 'people',
    title: 'And privately',
    body: 'One to one, or a group. Anybody you are connected to can be messaged from here.',
    do: 'Tap DMs',
    anchor: 'nav-messages',
    goal: { kind: 'route', to: '/messages' },
    on: ALL,
  },
  {
    key: 'collab',
    part: 'people',
    title: 'Post a trip, find company',
    body: 'Put your next trip on the map and it tells you who else will be there. Half the collaborations in the programme started as an overlap nobody would have spotted.',
    do: 'Open the collaboration board',
    anchor: null,
    goal: { kind: 'route', to: '/collab' },
    on: NET,
  },
  {
    key: 'board',
    part: 'people',
    title: 'Somebody has already answered it',
    body: 'Gear, rates, visas, which airline actually pays out. Ask a question, or read what has been asked.',
    do: 'Open the question board',
    anchor: null,
    goal: { kind: 'route', to: '/board' },
    on: NET,
  },

  // ------------------------------------------------------ the wider network ---
  {
    key: 'worldwide',
    part: 'world',
    title: 'Six markets, one network',
    body: 'The people, the map and the games are shared across every market. The briefs and the leaderboards are local to yours.',
    do: 'Tap Worldwide',
    anchor: 'nav-worldwide',
    goal: { kind: 'route', to: '/global' },
    on: NET,
  },
  {
    key: 'flights',
    part: 'world',
    title: 'Log a flight, get a boarding pass',
    body: 'Two airport codes and a date. It works out the distance, the aircraft, the time zones you crossed and who else has flown that route.',
    do: 'Open the flight log',
    anchor: null,
    goal: { kind: 'route', to: '/flights' },
    on: NET,
  },
  {
    key: 'aircraft',
    part: 'world',
    title: 'Every aircraft you have flown',
    body: 'The ones you have flown are in colour and the rest are waiting. It fills in on its own as you log trips.',
    do: 'Have a look at the collection',
    anchor: null,
    at: '/flights/aircraft',
    goal: { kind: 'scroll', px: 400 },
    on: NET,
  },
  {
    key: 'games',
    part: 'world',
    title: 'Three puzzles, every day',
    body: 'Guess the country, fly the flight path, take the quiz. Keep a streak going and you climb the leaderboard.',
    do: 'Open the games',
    anchor: null,
    goal: { kind: 'route', to: '/game' },
    on: NET,
  },
  {
    key: 'milestones',
    part: 'world',
    title: 'There is a route through all this',
    body: 'Videos posted, views reached, challenges entered. Each milestone unlocks something and shows exactly how far off the next one you are.',
    do: 'Open your route',
    anchor: null,
    goal: { kind: 'route', to: '/milestones' },
    on: NET,
  },
  {
    key: 'calendar',
    part: 'world',
    title: 'What is coming up',
    body: 'Deadlines, community calls, content days and your own trips, on one calendar you can subscribe to from your phone.',
    do: 'Open the calendar',
    anchor: 'nav-calendar',
    goal: { kind: 'route', to: '/events' },
    on: ALL,
    skipIfMissing: true,
  },

  // ---------------------------------------------------------- your account ---
  {
    key: 'profile',
    part: 'you',
    title: 'Your profile and your settings',
    body: 'Everything you filled in when you joined, editable any time. A complete profile is what gets you picked for paid work.',
    do: 'Open your settings',
    anchor: 'avatar-menu',
    goal: { kind: 'route', to: '/settings' },
    on: ALL,
  },
  // THE ONE HARD GATE.
  //
  // Everything else on this walk is a place. This is the only thing that decides
  // whether the creator ever comes back, because a brief they did not hear about
  // is a brief they did not enter. It still lets somebody past when the browser
  // has already refused or cannot do push - a gate with no way through is a dead
  // end rather than a gate. See TourHost.
  {
    key: 'notifications',
    part: 'you',
    title: 'Last thing, and it matters most',
    body: 'This is how you hear that a brief went live, that results are in, or that you have been paid. Without it you will miss deadlines.',
    do: 'Turn notifications on',
    anchor: 'enable-push',
    at: '/settings?section=notifications',
    goal: { kind: 'push' },
    on: ALL,
    required: true,
  },
  {
    key: 'done',
    part: 'you',
    title: 'That is everything',
    body: 'You have just done more in two minutes than most people do in a week. Go and read the current brief.',
    do: null,
    anchor: null,
    at: '/home',
    atNet: '/global',
    goal: { kind: 'end' },
    on: ALL,
  },
]

/**
 * The steps that apply here.
 *
 * Network steps are dropped entirely when the worldwide shell is off, so the
 * walk is shorter and correct rather than longer and full of dead ends. The
 * percentage is computed off THIS list, never off TOUR_STEPS, or a creator on
 * the legacy shell tops out at sixty per cent.
 */
export function stepsFor({ network = false } = {}) {
  return TOUR_STEPS.filter((s) => s.on === ALL || (s.on === NET && network))
}

/** Where a step puts you, which differs by shell for the hub. */
export const stepAt = (step, network) => (network && step.atNet) || step.at || null

/** The goal for this shell. Only the rooms step differs. */
export const stepGoal = (step, network) => (network && step.goalNet) || step.goal

/** Which part a step belongs to, and where that part sits. */
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
 * their phone has not seen the phone one.
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

/** THE MASTER SWITCH. A row update rather than a deploy. Fails closed. */
export const tourEnabled = () => readFlag('tour_enabled')

/**
 * Should this person be walked round, right now, without being asked?
 *
 * Every condition has to hold. Admins are excluded because they are the people
 * demonstrating it; they start it from the Testing Centre or Settings.
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
