import { supabase } from './supabase'
import { readFlag } from './appFlags'

// THE GUIDED WALKTHROUGH.
//
// A new creator's first minute decides whether they ever come back, and without
// this that minute is: land on the hub, see five tabs, work it out. The people
// who work it out are the people who were going to stay anyway.
//
// IT IS NOT A SLIDESHOW.
//
// The first two versions were a carousel: read a card, press Next, read the next
// card. Nobody remembers a carousel. Every step here has an OBJECTIVE - tap
// this, scroll that, open a brief, connect with somebody, turn notifications on -
// and the walk advances when the creator actually does it. There is no Next
// button, because pressing Next teaches you how to press Next.
//
// The consequence worth stating: by the end of it they have navigated to a
// dozen real pages themselves, opened a live brief, sent one connection request
// and enabled notifications. That is not a tour, it is a first session.
//
// HOW IT IS ANCHORED
//
// A step names a `data-tour` attribute, never a position. The SAME name is on
// the desktop nav item and the mobile tab, and the resolver picks whichever is
// visible - one set of steps for a phone, a tablet and a desktop.
//
// WHAT HAPPENS WHEN THE THING IS NOT THERE (v4)
//
// This is the half that was missing. The walk asked people to "open a
// challenge" on a board that, for a brand new market on a quiet week, has no
// challenges on it at all - so the one instruction on the card was impossible
// and the only way on was the Skip button. Same for a directory of one creator,
// an empty question board, an empty collab board.
//
// Every step that points at CONTENT rather than at chrome now carries an
// `empty` variant: different copy, a different instruction and a goal that can
// actually be completed ("this is where they appear - have a look and scroll
// on"). `skipIfMissing` still exists for the handful of steps that make no
// sense at all without their target, and TourHost now genuinely honours it.
// See `variantFor` at the foot of this file - that is the whole mechanism.
//
// WHO SEES IT: `shouldAutoStart`. A brand new approved creator, once, and
// nobody else. Migration 107 backfilled every creator who was already here, and
// it additionally reads a switch in app_settings.

export const TOUR_VERSION = 4

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
 * size     'sm' | 'md' | 'lg' - the card's preferred width. It is a preference,
 *          not a promise: the placement code shrinks it to whatever the gap
 *          beside the highlighted thing can actually hold.
 * required cannot be skipped (exactly one step: notifications)
 * empty    { title?, body, do, goal } used INSTEAD when `anchor` is nowhere to
 *          be found. This is what covers "no live challenge", "nobody in the
 *          directory yet", "nothing on the board yet".
 * skipIfMissing  drop the step entirely when its anchor is absent AND it has
 *          no `empty` variant.
 * door     { to, icon, label } a way to the destination drawn ON the card,
 *          shown whenever there is no highlight to press instead. Two cases:
 *          a step with no anchor at all (rewards, the creator network and the
 *          milestones all live in the avatar menu, which is shut), and a step
 *          whose anchor turned out to be absent (the worldwide rail is
 *          desktop-only). Without one, a card can end up saying "open your
 *          rewards" with nothing on screen that does that.
 * choices  like `door`, but several, and shown always. One step, four
 *          destinations, and any of them completes it.
 *
 * GOAL KINDS
 *   route   { to } | { any: [...] }   they navigate there themselves
 *   scroll  { px }                    they scroll the page by that much
 *   click   { anchor }                they press the highlighted thing
 *   connect                           a connection request goes out
 *   push                              notification permission is granted
 *   dwell   { ms }                    nothing to do, so it advances on its own
 *   end                               the sign-off
 */
export const TOUR_STEPS = [
  // ------------------------------------------------ getting your bearings ---
  {
    key: 'welcome',
    part: 'start',
    title: 'Two minutes, and you drive',
    body: 'No slideshow. Each card asks for one thing - tap it, scroll it, open it - and the walk moves on the moment you do.',
    do: 'Hold on, starting now',
    anchor: null,
    at: '/home',
    atNet: '/global',
    goal: { kind: 'dwell', ms: 3200 },
    size: 'lg',
    on: ALL,
  },
  {
    key: 'hub',
    part: 'start',
    title: 'This is home',
    body: 'Live briefs, who is travelling this week, what the rooms are arguing about. It changes every day, so it is worth a look every day.',
    do: 'Scroll down and have a look',
    anchor: null,
    at: '/home',
    atNet: '/global',
    goal: { kind: 'scroll', px: 420 },
    size: 'md',
    on: ALL,
  },
  {
    key: 'search',
    part: 'start',
    title: 'Everything is one search away',
    body: 'Any creator, any brief, any room, from any page. It is the shortcut worth learning first, and ⌘K opens it too.',
    do: 'Press the search button',
    anchor: 'search',
    at: '/home',
    atNet: '/global',
    goal: { kind: 'click', anchor: 'search' },
    size: 'sm',
    on: NET,
    skipIfMissing: true,
  },

  // -------------------------------------------------------------- the work ---
  {
    key: 'challenges',
    part: 'work',
    title: 'This is what you came for',
    body: 'A brief goes up, you film it, you post it, the best videos win real money. Usually one is running at a time.',
    do: 'Tap Challenges',
    anchor: 'nav-challenges',
    goal: { kind: 'route', to: '/challenges' },
    size: 'md',
    on: ALL,
  },
  {
    key: 'brief',
    part: 'work',
    title: 'Open one and read it properly',
    body: 'A brief tells you what to shoot, when it closes, how it is judged and exactly what the prizes are. Nothing is held back until afterwards.',
    do: 'Open the live challenge',
    anchor: 'challenge-card',
    at: '/challenges',
    goal: { kind: 'route', to: '/challenges/' },
    size: 'md',
    on: ALL,
    // NOTHING RUNNING RIGHT NOW. A brand new market, or the gap between two
    // briefs, and this board is empty - so the step says what the empty board
    // means and moves on instead of asking for something impossible.
    empty: {
      title: 'Briefs land here',
      body: 'Nothing is running this second. When a brief goes live it takes over this page with a countdown, the prize pot and a submit button - and you get a notification the moment it does.',
      do: 'Got it - have a look round the board',
      goal: { kind: 'dwell', ms: 5200 },
    },
  },
  {
    key: 'brief-read',
    part: 'work',
    title: 'The whole deal, in one place',
    body: 'Prizes, deadline, scoring and the participation voucher. Entering takes about thirty seconds: post the video on your own account as normal, then paste the link here.',
    do: 'Scroll through the brief',
    anchor: null,
    goal: { kind: 'scroll', px: 500 },
    size: 'md',
    on: ALL,
    // Only shown when there WAS a brief to open - see `needsRoute`.
    needsPath: '/challenges/',
  },
  {
    key: 'rewards',
    part: 'work',
    title: 'Sort your bank details before you win',
    body: 'Prizes, vouchers and the invoices behind them all live here. Ten minutes now saves a fortnight of chasing later.',
    do: 'Open your rewards',
    anchor: null,
    at: '/challenges',
    goal: { kind: 'route', to: '/rewards' },
    door: { to: '/rewards', icon: 'wallet', label: 'Your rewards' },
    size: 'md',
    on: ALL,
  },

  // ----------------------------------------------------------- your people ---
  {
    key: 'creators',
    part: 'people',
    title: 'Everybody else',
    body: 'Every creator in the programme on one map: where they are based, what they film, where they are heading next. This is the part people stay for.',
    anchor: null,
    do: 'Open the creator network',
    at: '/rewards',
    goal: { kind: 'route', to: '/creators' },
    door: { to: '/creators', icon: 'users', label: 'Creator network' },
    size: 'md',
    on: ALL,
  },
  {
    key: 'connect',
    part: 'people',
    title: 'Connect with one person',
    body: 'Pick anyone. Connections are how introductions happen, how meet-ups get arranged, and how you start showing up in other people’s suggestions.',
    do: 'Press Connect on any creator',
    anchor: 'creator-card',
    at: '/creators',
    goal: { kind: 'connect' },
    size: 'md',
    on: ALL,
    empty: {
      title: 'Your neighbours, when they arrive',
      body: 'Nobody matches the filters on screen yet. As creators join they appear here with their city, their platforms and a Connect button - and you will be in somebody else’s list too.',
      do: 'Have a scroll through',
      goal: { kind: 'dwell', ms: 4800 },
    },
  },
  {
    key: 'rooms',
    part: 'people',
    title: 'Where the programme actually talks',
    body: 'Ask anything, post what you are working on, share a rate somebody quoted you. The team is in here as well, and answers.',
    do: 'Tap the rooms',
    anchor: 'nav-chat',
    goal: { kind: 'route', to: '/chat' },
    goalNet: { kind: 'route', to: '/rooms' },
    size: 'md',
    on: ALL,
  },
  {
    key: 'dms',
    part: 'people',
    title: 'And quietly, one to one',
    body: 'A single person or a small group. Anybody you are connected to can be messaged from here, in any market.',
    do: 'Tap DMs',
    anchor: 'nav-messages',
    goal: { kind: 'route', to: '/messages' },
    size: 'sm',
    on: ALL,
  },

  // ------------------------------------------------------ the wider network ---
  {
    key: 'worldwide',
    part: 'world',
    title: 'Six markets, one network',
    body: 'The people, the map, the board and the games are shared across every market. Briefs and leaderboards stay local to yours.',
    do: 'Tap Worldwide',
    anchor: 'nav-worldwide',
    goal: { kind: 'route', to: '/global' },
    size: 'md',
    on: NET,
  },
  // FIVE STOPS THAT ALL LEAVE FROM THE HUB.
  //
  // Each of these sends the creator back to /global first and then asks them to
  // press the thing in the rail. It costs a navigation per step and it buys the
  // one lesson that outlasts the walk: everything in the people layer hangs off
  // the Worldwide hub, and here is the list it hangs off.
  //
  // The rail is desktop-only, so on a phone every one of these resolves to an
  // unanchored card and the `door` below is what the creator presses instead -
  // same destination, same goal, no dead end. See `variantFor`.
  {
    key: 'board',
    part: 'world',
    title: 'Somebody has already answered it',
    body: 'Gear, rates, visas, which airline actually pays out. A question asked here stays put until it is answered, unlike one in a room, which is gone by lunchtime.',
    do: 'Open the community board',
    anchor: 'link-board',
    at: '/global',
    goal: { kind: 'route', to: '/board' },
    door: { to: '/board', icon: 'chat', label: 'Community board' },
    size: 'md',
    on: NET,
  },
  {
    key: 'collab',
    part: 'world',
    title: 'Post a trip, find company',
    body: 'Put your next trip up and it tells you who else will be there. Half the collaborations in this programme started as an overlap nobody would have spotted.',
    do: 'Open the collab board',
    anchor: 'link-collab',
    at: '/global',
    goal: { kind: 'route', to: '/collab' },
    door: { to: '/collab', icon: 'pin', label: 'Travel collab board' },
    size: 'md',
    on: NET,
  },
  {
    key: 'flights',
    part: 'world',
    title: 'Log a flight, get a boarding pass',
    body: 'Two airport codes and a date. It works out the distance, the aircraft, the time zones you crossed and who else has flown that exact route.',
    do: 'Open the flight log',
    anchor: 'link-flights',
    at: '/global',
    goal: { kind: 'route', to: '/flights' },
    door: { to: '/flights', icon: 'plane', label: 'Flight log' },
    size: 'md',
    on: NET,
  },
  {
    key: 'aircraft',
    part: 'world',
    title: 'Every aircraft you have flown',
    body: 'The ones you have been on are in colour and the rest are waiting. It fills itself in as you log trips - some people are very competitive about it.',
    do: 'Scroll the collection',
    anchor: null,
    at: '/flights/aircraft',
    goal: { kind: 'scroll', px: 400 },
    size: 'sm',
    on: NET,
  },
  {
    key: 'games',
    part: 'world',
    title: 'Three puzzles, every day',
    body: 'Guess the country, fly the flight path, take the quiz. Keep a streak going and you climb a leaderboard that has nothing to do with your follower count.',
    do: 'Open the games',
    anchor: 'link-game',
    at: '/global',
    goal: { kind: 'route', to: '/game' },
    door: { to: '/game', icon: 'joystick', label: 'Travel games' },
    size: 'md',
    on: NET,
  },
  {
    key: 'milestones',
    part: 'world',
    title: 'There is a ladder through all this',
    body: 'Videos posted, views reached, challenges entered, people brought in. Every milestone unlocks something real and shows exactly how far off the next one you are.',
    do: 'Open your milestones',
    anchor: null,
    goal: { kind: 'route', to: '/milestones' },
    door: { to: '/milestones', icon: 'flag', label: 'Milestones' },
    size: 'md',
    on: NET,
  },
  // ONE STEP, FOUR DESTINATIONS, YOUR PICK.
  //
  // The alternative was four more steps, and a walk that is already twenty
  // stops long does not need four more polite introductions to pages that
  // explain themselves. Any one of these completes it, so the creator leaves
  // having chosen something rather than having been marched past it.
  {
    key: 'explore',
    part: 'world',
    title: 'Four more worth knowing',
    body: 'The leaderboard ranks every market. The library has the templates and the brand guidelines. Roles are paid jobs with Tryp.com. Referrals pay you for bringing somebody good in.',
    do: 'Open any one of them',
    anchor: null,
    goal: { kind: 'route', any: ['/leaderboard', '/resources', '/jobs', '/refer'] },
    size: 'lg',
    on: NET,
    choices: [
      { to: '/leaderboard', icon: 'chart', label: 'Leaderboard', hint: 'Who is winning, everywhere' },
      { to: '/resources', icon: 'book', label: 'Library', hint: 'Guides, templates, brand kit' },
      { to: '/jobs', icon: 'briefcase', label: 'Roles', hint: 'Paid work with Tryp.com' },
      { to: '/refer', icon: 'share', label: 'Refer', hint: 'Bring a creator, get paid' },
    ],
  },
  {
    key: 'calendar',
    part: 'world',
    title: 'What is coming up',
    body: 'Deadlines, community calls, content days and your own trips on one calendar you can subscribe to from your phone.',
    do: 'Open the calendar',
    anchor: 'nav-calendar',
    goal: { kind: 'route', to: '/events' },
    size: 'sm',
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
    size: 'md',
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
    size: 'md',
    on: ALL,
    required: true,
  },
  {
    key: 'done',
    part: 'you',
    title: 'That is the whole place',
    body: 'You have done more in two minutes than most people manage in a week. Go and read the current brief - or say hello in the rooms, which is the faster way in.',
    do: null,
    anchor: null,
    at: '/home',
    atNet: '/global',
    goal: { kind: 'end' },
    size: 'lg',
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

/** Does this route goal accept the path we are on? Handles `to` and `any`. */
export function goalAccepts(goal, pathname) {
  if (!goal || goal.kind !== 'route') return false
  const targets = goal.any || [goal.to]
  return targets.some((t) => t && pathname.startsWith(t))
}

/**
 * THE STEP AS IT WILL ACTUALLY BE SHOWN.
 *
 * `present` is whether the step's anchor was found on the page. Everything a
 * step can vary - its words, its instruction, its goal - is resolved here, in
 * one function, so TourHost never has to remember which of three fields wins.
 *
 * Returns null for a step that should be dropped altogether.
 */
export function variantFor(step, { network = false, present = true, pathname = '' } = {}) {
  if (!step) return null
  // A step that only makes sense somewhere it never got to. `brief-read` is the
  // whole reason this exists: it asks you to scroll a brief, and if the board
  // had no brief to open there is nothing under the card to scroll.
  if (step.needsPath && !pathname.startsWith(step.needsPath)) return null
  const anchored = !step.anchor || present
  if (!anchored && step.empty) {
    return {
      ...step,
      ...step.empty,
      anchor: null,
      variant: 'empty',
      goal: step.empty.goal,
      goalNet: undefined,
    }
  }
  if (!anchored && step.skipIfMissing) return null
  return {
    ...step,
    variant: anchored ? 'normal' : 'unanchored',
    // An anchor that is not on the page must not be spotlighted: pointing at
    // the corner of the screen is worse than pointing at nothing.
    anchor: anchored ? step.anchor : null,
    goal: stepGoal(step, network),
    goalNet: undefined,
  }
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
