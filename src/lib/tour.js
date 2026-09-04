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

export const TOUR_VERSION = 4

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
  { key: 'start', label: 'Around the app' },
  // 'Get paid, stay told' was tried and reverted at Ethan's request (4 Sep
  // 2026): "I don't like this copy, just keep the previous copy there."
  { key: 'you', label: 'Your account' },
]

const ALL = 'both'

/**
 * A STEP.
 *
 * key      stable id, used for progress and by the Testing Centre
 * part     one of TOUR_PARTS
 * title    short. Read in about a second, over the top of a live app.
 * body     one or two sentences. Never three.
 * do       THE INSTRUCTION. What the creator has to actually do.
 * anchor   a `data-tour` value to spotlight, or null for a centred card
 * at       where the tour puts them before the step begins
 * atNet    `at` when the worldwide shell is on (the hub is /global there)
 * goal     what completes it
 * on       'both' | 'network'
 *
 * GOAL KINDS
 *   begin              a press on the card's own button. The first step only.
 *   route   { to }     they navigate there themselves
 *   click   { anchor } they press the highlighted thing
 *   push               notification permission is granted
 *   payee              payment details are saved
 *   end                the last card
 */

// ═════════════════════════════════════════════════════════════════════════════
// SIX STOPS, EVERY ONE A PRESS (4 Sep 2026 - THE THIRD REBUILD).
//
// Ethan: "the interactive tutorial is still working really badly, especially on
// mobile - if I click a button it all just goes away. I was thinking maybe it
// should be less interactive... but then how do you know how much time you need
// to read? So maybe just keep the clicks, but simple clicks, and shorten it a
// lot - because the most important thing for this is just getting the bank
// details, which I still haven't seen included at all, and the notifications,
// which I have. Just a clean, quick interactive tutorial where you click the
// buttons and complete it. I don't like at the start where there's a timer to
// start - you should always have to click something to proceed."
//
// FOUR CHANGES, AND EACH ONE REMOVES A CLASS OF FAILURE RATHER THAN A BUG.
//
//  1. TEN STOPS BECOME SIX, and the two that carry the point are last. What
//     went: the brief (opening a challenge is the challenges step over again),
//     the directory, DMs and the games (three "here is another page" stops that
//     teach nothing opening the page would not), and CONNECT - which sent a
//     real connection request to a real stranger as a side effect of a
//     tutorial, which is not a thing a tutorial should do.
//
//  2. NOTHING ADVANCES ON A TIMER. The welcome step was `dwell: 2600` - it read
//     for you and moved on whether you had finished or not, which is the one
//     interaction in the walk that takes control AWAY from the person. Every
//     step now waits for a press, including the first.
//
//  3. BANK DETAILS ARE BACK, AND THEY COME BEFORE THE GATE. Notifications is
//     the one step that cannot be skipped, so anything AFTER it is unreachable
//     to somebody who refuses - and the payment step is the one Ethan says
//     matters most, so it must not sit behind the gate. The required step is
//     always the last thing before the sign-off, and there is a test that says
//     so, which is how this was caught rather than shipped.
//     BANK DETAILS ARE BACK, AND THEY ARE THE POINT. They were cut on 3 Sep
//     because a hard gate produces somebody who closes the app - which is still
//     true, so this is NOT a gate: the step takes them to the field, asks, and
//     has a "I'll do this later" that genuinely moves on. BankDetailsPrompt
//     still asks on later opens. Ethan is right that it matters most: a creator
//     who wins a prize and has no payee details is an invoice that cannot be
//     paid, and that is the one failure this walk can actually prevent.
//
//  4. EVERY GOAL IS A PRESS ON SOMETHING THE TOUR IS POINTING AT. No scroll
//     goals (undetectable and uninstructive), no dwell, no side effects.
//
// WHY IT WAS BREAKING ON A PHONE, which is worth writing down because it was
// not in this file at all: `AppLayout` reset the scroll on every route change
// with `behavior: 'auto'`, and `auto` means "use the computed scroll-behavior",
// which is `smooth` platform-wide. So every navigation the tour asked for
// started a several-hundred-millisecond ANIMATED scroll, and this component
// measures its spotlight and card against `getBoundingClientRect()` of an
// anchor that was still moving. The card was placed against a page that had
// since slid out from under it. That is "if I click a button, it all just goes
// away", and it is fixed in AppLayout, not here.
export const TOUR_STEPS = [
  {
    key: 'welcome',
    part: 'start',
    title: 'Let me show you round',
    body: "I'll start by showing you the most important parts, but feel free to explore the community yourself after!",
    do: null,
    anchor: null,
    at: '/home',
    atNet: '/global',
    goal: { kind: 'begin' },
    on: ALL,
  },
  {
    key: 'challenges',
    part: 'start',
    title: 'This is what you are here for',
    body: 'A challenge goes live, you create content, you post it, and claim the prizes!',
    do: 'Tap Challenges',
    anchor: 'nav-challenges',
    goal: { kind: 'route', to: '/challenges' },
    on: ALL,
  },
  {
    key: 'rooms',
    part: 'start',
    title: 'Where everyone talks',
    body: 'Ask anything, connect with other creators or share what you are working on. The Tryp.com team is in here too.',
    do: 'Tap Rooms',
    anchor: 'nav-chat',
    goal: { kind: 'route', to: '/chat' },
    goalNet: { kind: 'route', to: '/rooms' },
    on: ALL,
  },

  // ------------------------------------------------------- get paid, told ---
  {
    key: 'payment',
    part: 'you',
    title: 'And so we can actually pay you',
    body: 'Prizes are paid by bank transfer against an invoice we raise for you. Without these we cannot send the money, and this is the single thing most likely to hold a payout up.',
    do: 'Add your payment details',
    // NO ANCHOR ON PURPOSE. `settings-payment` names the row on the settings
    // MENU, and this step navigates straight past it into the section - where
    // the thing to point at is the whole form. Spotlighting the Save button
    // while the fields are empty is not it.
    anchor: null,
    at: '/settings?section=payment',
    goal: { kind: 'payee' },
    on: ALL,
    // THE ONE STEP WHOSE PAGE HAS TO BE TYPED INTO (4 Sep 2026).
    //
    // Ethan: "when it has to go to the payment details section, the card is
    // actually covering some of it and I can't type in all my info. Ensure it
    // doesn't cover the card - maybe it moves to the left side or the right
    // side, or can be temporarily hidden if you're typing."
    //
    // Measured at 375px: the card occupied 453-728 and the currency chooser
    // sits at 368, so "Save payment details" and every field the chooser opens
    // were underneath it. An anchorless card is normally pinned bottom-centre,
    // which is right for a step that says "read this page" and wrong for the
    // only step that says "fill this in".
    //
    // `keepClear` says so, and it is honoured twice: on a desktop the card goes
    // to the bottom RIGHT so a centred form is never behind it, and on a phone -
    // which has no beside - the sheet slides away for as long as a field is
    // focused and comes back when it is not. See TourHost and index.css.
    keepClear: true,
  },
  {
    key: 'notifications',
    part: 'you',
    title: 'So you hear about a brief',
    body: 'This is how you find out a challenge went live, that results are in, or that you have been paid. Without it you will miss deadlines.',
    do: 'Turn notifications on',
    anchor: 'enable-push',
    at: '/settings?section=notifications',
    goal: { kind: 'push' },
    on: ALL,
    // THE ONE HARD GATE, AND IT STAYS ONE. Ethan, when it was built: "remember
    // that you can't skip enabling notifications." A brief nobody heard about
    // is a brief nobody entered, and this is the only step that prevents that.
    required: true,
  },
  {
    key: 'done',
    part: 'you',
    title: 'That is the basics',
    body: "Now it's up to you to explore the rest of the platform, you can start by saying 'Hi' in the chat!",
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
  // Every step applies on both shells now. The filter stays because the
  // `on: 'network'` escape hatch is worth keeping for a step that genuinely
  // only exists in one of them, and because the percentage MUST be computed off
  // this list rather than off TOUR_STEPS.
  return TOUR_STEPS.filter((s) => s.on === ALL || (s.on === 'network' && network))
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
// WHERE THEY GOT TO, SO CLOSING THE APP DOES NOT START THEM AGAIN.
//
// Ethan: "ensure that if they leave the app and come back, it automatically
// stays at the place they were in the tutorial and doesn't reset or cancel."
//
// A walkthrough that navigates you around the product is one you WILL leave
// halfway - a notification arrives, the phone rings, the app is backgrounded
// and killed. Coming back to step one is a punishment for that, and after the
// second time nobody finishes it.
//
// `localStorage`, not `sessionStorage`: the point is to survive the app being
// closed, which is precisely what sessionStorage does not do. Keyed per layout
// and per version like `seenLocally`, so a rebuilt walk never resumes into a
// step index that means something different now.
const AT_KEY = (layout) => `tryp_tour_at_${layout}_v${TOUR_VERSION}`

export function savedStep(layout) {
  try {
    const n = Number(localStorage.getItem(AT_KEY(layout)))
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch { return 0 }
}

export function saveStep(layout, i) {
  try { localStorage.setItem(AT_KEY(layout), String(i)) } catch { /* private mode */ }
}

export function clearStep(layout) {
  try { localStorage.removeItem(AT_KEY(layout)) } catch { /* private mode */ }
}

export function seenLocally(layout) {
  try { return localStorage.getItem(SEEN_KEY(layout)) === '1' } catch { return false }
}

export function markSeenLocally(layout) {
  try { localStorage.setItem(SEEN_KEY(layout), '1') } catch { /* private mode */ }
}

export function clearSeenLocally() {
  try {
    for (const l of ['mobile', 'desktop']) {
      localStorage.removeItem(SEEN_KEY(l))
      localStorage.removeItem(AT_KEY(l))
    }
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
