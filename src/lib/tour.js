import { supabase } from './supabase'
import { readFlag } from './appFlags'

// THE GUIDED WALKTHROUGH.
//
// A new creator's first minute decides whether they ever come back, and until
// now that minute was: land on the home page, see five tabs, work it out. The
// people who work it out are the people who were going to stay anyway.
//
// WHAT THIS IS NOT
//
// It is not a tutorial and it does not call itself one. Nobody wants a tutorial
// and the word promises homework. It is a short walk round the place with
// somebody pointing at things, and two of the stops ask you to actually do
// something rather than read about it, because a creator who has enabled
// notifications and made one connection on day one is a creator who has a
// reason to open the app on day two.
//
// HOW IT IS ANCHORED
//
// Every step names a `data-tour` attribute rather than a CSS class or a
// position. The SAME name is on the desktop nav item and on the mobile tab, and
// the resolver picks whichever one is actually visible - so one set of steps
// covers a phone, a tablet and a desktop without three sets of copy that would
// drift apart within a month. A step whose anchor is nowhere on the page is
// skipped rather than shown pointing at the top-left corner.
//
// WHO SEES IT
//
//   - `profiles.tour_completed_at` is null            (they have never done it)
//   - AND the `tour_enabled` app setting reads true   (the master switch)
//   - AND they are an approved creator, not an admin, not a test account
//
// Migration 107 backfilled tour_completed_at for every creator who was already
// here, so nobody in the existing community can be ambushed by it even if the
// switch is flipped on by accident.

export const TOUR_VERSION = 1

// Which layout a step belongs to. `both` is the overwhelming majority; the two
// exceptions exist because the avatar menu is a dropdown on a desktop and a
// sheet on a phone, and pointing at the wrong one is worse than not pointing.
const BOTH = 'both'

/**
 * The walk.
 *
 * key      stable id, used for progress and for the Testing Centre's list
 * title    short. It is read in about a second, over the top of a live app.
 * body     one or two sentences. Never three.
 * anchor   a `data-tour` value, or null for a centred card
 * route    navigate here before the step is shown
 * on       'both' | 'desktop' | 'mobile'
 * action   a step that WAITS for the creator to do something real
 * optional true if it can be passed over without doing the action
 */
export const TOUR_STEPS = [
  {
    key: 'welcome',
    title: 'Two minutes, and then you are on your own',
    body: 'A quick walk round so you know where everything is. You can stop at any point, and you can run it again later from Settings.',
    anchor: null,
    route: '/home',
    on: BOTH,
  },
  {
    key: 'home',
    title: 'This is your home page',
    body: 'The live challenge, what is happening in the community, and anything waiting on you. It is the page to check when you open the app.',
    anchor: 'nav-home',
    route: '/home',
    on: BOTH,
  },
  {
    key: 'challenges',
    title: 'The work lives here',
    body: 'Usually one challenge is running at a time. Read the brief, film your video, and paste the link before the deadline.',
    anchor: 'nav-challenges',
    route: '/challenges',
    on: BOTH,
  },
  {
    key: 'challenge-brief',
    title: 'Open a brief to see what is being asked for',
    body: 'Every challenge says what to film, when it closes, how it is scored and what the prizes are. Nothing is hidden until afterwards.',
    anchor: 'challenge-card',
    route: '/challenges',
    on: BOTH,
    skipIfMissing: true,
  },
  {
    key: 'creators',
    title: 'Everybody else',
    body: 'Every creator in the programme, where they are based, what they film and where they are going next. This is the part people stay for.',
    skipIfMissing: true,
    anchor: 'creator-card',
    route: '/creators',
    on: BOTH,
  },
  {
    key: 'connect',
    title: 'Connect with somebody',
    body: 'Pick anyone. Connections are how you get introduced, how meet-ups get arranged, and how the collaboration board finds you people.',
    anchor: 'creator-card',
    route: '/creators',
    on: BOTH,
    action: 'connect',
    optional: true,
    skipIfMissing: true,
  },
  {
    key: 'chat',
    title: 'The rooms',
    body: 'Where the programme actually talks. Ask anything, post what you are working on, and the team is in here too.',
    anchor: 'nav-chat',
    route: '/chat/general',
    on: BOTH,
  },
  {
    key: 'dms',
    title: 'And private messages',
    body: 'One to one, or a group. Every creator you are connected to can be messaged from here.',
    anchor: 'nav-messages',
    route: '/messages',
    on: BOTH,
  },
  {
    key: 'notifications',
    title: 'Turn notifications on',
    body: 'This is the one thing worth doing right now. It is how you hear that a challenge went live, that results are in, or that you have been paid.',
    anchor: 'enable-push',
    route: '/settings?section=notifications',
    on: BOTH,
    action: 'push',
    optional: true,
  },
  {
    key: 'rewards',
    title: 'Where the money shows up',
    body: 'Prizes, vouchers and the invoices behind them. Add your payment details here before you win something, not after.',
    anchor: null,
    route: '/rewards',
    on: BOTH,
  },
  {
    key: 'profile',
    title: 'Your profile',
    body: 'Everything you filled in when you joined, editable any time. A complete profile gets you noticed by other creators and by us.',
    anchor: 'avatar-menu',
    route: '/settings',
    on: BOTH,
  },
  {
    key: 'done',
    title: 'That is the tour',
    body: 'You can run it again whenever you like from Settings. Now go and read the brief.',
    anchor: null,
    route: '/home',
    on: BOTH,
  },
]

/** The steps that apply to this layout. */
export function stepsFor(isPhone) {
  const layout = isPhone ? 'mobile' : 'desktop'
  return TOUR_STEPS.filter((s) => s.on === BOTH || s.on === layout)
}

// ------------------------------------------------------------ persistence ---

const SEEN_KEY = (layout) => `tryp_tour_seen_${layout}_v${TOUR_VERSION}`

/**
 * ONE FLAG IN THE DATABASE, ONE PER LAYOUT IN THE BROWSER.
 *
 * The database column answers "has this person ever been walked round", which
 * is what stops it running twice and what Settings resets. The local flag is
 * per LAYOUT, because the phone walk and the desktop walk point at genuinely
 * different chrome - somebody who joined on a laptop and later opens it on
 * their phone has not seen the phone one, and showing it to them once is right
 * rather than annoying.
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
 * of problem; they can start it deliberately from the Testing Centre or from
 * Settings.
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
