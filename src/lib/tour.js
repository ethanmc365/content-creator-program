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
// THREE PARTS, FOR TEN STOPS (3 Sep 2026).
//
// It was five parts over twenty stops. Ethan, after walking the whole thing:
// "cut back any unnecessary steps... really improve it and simplify it. Remember
// it should be easy for the creators."
//
// Twenty stops is not a walk round, it is a training course, and the half of
// them that were "here is another page" taught nothing that opening the page
// would not. What is left is the shortest path that leaves somebody able to use
// the platform: they have opened a brief, met the directory, sent one
// connection request, been in a room and a DM, and turned notifications on.
export const TOUR_PARTS = [
  { key: 'start', label: 'The work' },
  { key: 'people', label: 'Your people' },
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
  // ------------------------------------------------------------- the work ---
  {
    key: 'welcome',
    part: 'start',
    title: 'Two minutes, and you drive',
    body: 'This is your hub - challenges, rooms, and everyone else in the network. Do the thing each card asks and it moves on by itself.',
    do: 'Starting in a moment',
    anchor: null,
    at: '/home',
    atNet: '/global',
    goal: { kind: 'dwell', ms: 2600 },
    on: ALL,
  },
  {
    key: 'challenges',
    part: 'start',
    title: 'This is what you are here for',
    body: 'A brief goes up, you film it, you post it, the best videos win real money. Usually one is running at a time.',
    do: 'Tap Challenges',
    anchor: 'nav-challenges',
    goal: { kind: 'route', to: '/challenges' },
    on: ALL,
  },
  {
    key: 'brief',
    part: 'start',
    title: 'Everything is in the brief',
    body: 'What to shoot, when it closes, how it is scored and exactly what the prizes are. Entering takes thirty seconds: post it on your own account as normal, then paste the link.',
    do: 'Open a challenge',
    anchor: 'challenge-card',
    at: '/challenges',
    goal: { kind: 'route', to: '/challenges/' },
    on: ALL,
    skipIfMissing: true,
  },

  // ---------------------------------------------------------- your people ---
  {
    key: 'creators',
    part: 'people',
    title: 'Everybody else',
    body: 'Every creator in the network, where they are based and what they film. This is the part people stay for.',
    do: 'Open the creator directory',
    anchor: 'avatar-menu',
    openMenu: true,
    at: '/challenges',
    goal: { kind: 'route', to: '/creators' },
    on: ALL,
  },
  {
    key: 'connect',
    part: 'people',
    title: 'Connect with one person',
    body: 'Pick anyone at all. Connections are how introductions happen, how meet-ups get arranged, and how you start appearing in other people\u2019s suggestions.',
    do: 'Press Connect on any creator you like',
    anchor: null,
    at: '/creators',
    goal: { kind: 'connect' },
    on: ALL,
  },
  {
    key: 'rooms',
    part: 'people',
    title: 'How to talk to other creators',
    body: 'Ask anything, post what you are working on, share a rate you got quoted. The team is in here too, and answers.',
    do: 'Open Rooms',
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

  // --------------------------------------------------------- your account ---
  {
    key: 'games',
    part: 'you',
    title: 'Three puzzles, every day',
    body: 'Quick travel games with a streak that builds as long as you keep playing. It is the reason most people open the app on a day nothing else is happening.',
    do: 'Open Travel Games',
    anchor: 'avatar-menu',
    openMenu: true,
    goal: { kind: 'route', to: '/game' },
    on: NET,
    skipIfMissing: true,
  },
  // THE ONE HARD GATE.
  //
  // Everything else on this walk is a place. This is the only thing that decides
  // whether the creator ever comes back, because a brief they did not hear about
  // is a brief they did not enter.
  //
  // BANK DETAILS ARE NOT ON THIS WALK AT ALL ANY MORE. There was a step for
  // them and it pointed at nothing; Ethan: "maybe it shouldn't enforce it - you
  // can click to add them later, but then every time you open the app there
  // should be a visual pop up asking." That is a better shape and it is now its
  // own thing (components/BankDetailsPrompt), asked once per app open until
  // they are filled in. A tour step is the wrong instrument for something
  // somebody may genuinely not have to hand.
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
    body: 'The rest you will find as you go. Post something in a room and say hello - that is how most people start.',
    do: null,
    anchor: null,
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
