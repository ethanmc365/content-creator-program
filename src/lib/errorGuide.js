// WHAT THIS ERROR ACTUALLY MEANS, IN ENGLISH.
//
// Ethan: "under error monitoring you will notice it says that there are two
// errors, I'm not sure what these errors are, the information provided doesn't
// really help me... on that error monitoring page can you provide more info for
// these and in future so I can really understand exactly what the issue is."
//
// THE PANEL WAS PRINTING THE TRUTH AND THE TRUTH WAS UNREADABLE. A row said
// "The object can not be found here." over twelve frames of
// `Fa@.../ui-BaIenqY-.js:4:29678`. Every one of those facts is correct and none
// of them tells somebody who is not holding a debugger what happened, what
// probably caused it, or whether it is worth an afternoon.
//
// So: a table from a fault's SIGNATURE to the three things a person reading
// this panel actually wants - what it means, what usually causes it, and what
// to do about it. It is a lookup, not a guess: every entry below is a fault
// with a single well-understood cause, and anything not in the table gets no
// explanation rather than a made-up one. A confident wrong explanation on a
// monitoring panel is worse than a blank, because it sends somebody looking in
// the wrong place.
//
// HOW TO ADD ONE. When a new fault turns up and you work out what it was, put
// it here. That is the whole maintenance story, and it is what turns this panel
// from a list of strings into the platform's accumulated knowledge of its own
// failure modes.

const GUIDE = [
  {
    // Safari/WebKit's wording for DOMException NotFoundError out of
    // insertBefore/removeChild. Chrome says "Failed to execute 'insertBefore'".
    match: /the object can not be found here|failed to execute '(insertBefore|removeChild)' on 'node'|the node before which the new node is to be inserted is not a child/i,
    severity: 'usually not ours',
    means: 'React tried to move or remove a DOM node that was no longer where it left it.',
    cause: 'Almost always something outside React editing the page underneath it. In order of how often it is the answer: a browser translation feature (Safari and Chrome both rewrite text nodes in place, which breaks React’s bookkeeping), a password manager or extension injecting elements into a form, or an in-app webview (Instagram, TikTok) doing the same. A genuine app bug of this shape is possible but rare, and it would repeat rather than happen once.',
    todo: 'Check whether it happened more than once and to more than one person. One person, one time, on a page with a form on it is a translated page or an extension and there is nothing to fix. If it repeats for several people on the same route, that route is doing something React does not own - look for direct DOM writes, a portal, or a third-party embed.',
  },
  {
    // THE SIGNATURE OF A REPORT THAT ATE ITS OWN EVIDENCE. Every frame in the
    // stack is inside the monitoring chunk and there are only one or two of
    // them, which cannot happen for a real fault - the reporter is never what
    // failed. It means the pre-12-Sep-2026 `new Error(msg)` path built a fresh
    // Error here and threw the original away. Matched on the DETAIL, because
    // the message on these rows is a minified token that matches nothing.
    match: /monitoring-[A-Za-z0-9_-]+\.js:\d+:\d+\s*$/,
    severity: 'unreadable by construction',
    means: 'This row records that something failed, and nothing about what. The stack points at the crash reporter itself.',
    cause: 'A bug in the reporter, fixed on 12 Sep 2026. A promise rejected with something that was not an Error, and the old handler responded by constructing a brand new Error right there - so the stack it saved was two frames of `monitoring.js` and the message was whatever minified token happened to be sitting on the original object. The real failure’s type, fields and stack were all discarded before the row was written.',
    todo: 'Nothing to fix from this row - the evidence is gone and cannot be recovered. If the same fault happens again it will now arrive with its own type, its own stack, any supabase code and hint it carried, and the trail of what the person was doing. Tick it off; if it comes back it will come back readable.',
  },
  {
    match: /non-error thrown|^rejection: |unhandled promise rejection/i,
    severity: 'report quality',
    means: 'Something rejected a promise with an object that is not an Error, so there is no real stack to read.',
    cause: 'Usually a supabase client error (a plain object with code/details/hint) or a minified class escaping from a library. The reporter now keeps the original type and fields; a row from before 12 Sep 2026 will have neither.',
    todo: 'Read the `reason` block in the context below - the supabase code and hint are the actionable half. If there is none, the trail is what to go on.',
  },
  {
    match: /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i,
    severity: 'expected after a deploy',
    means: 'The browser asked for a code chunk that no longer exists on the server.',
    cause: 'A tab that was open before a deploy. The new build has different file hashes, so the chunk that page was told to load has been replaced. This is normal and unavoidable for anybody holding a stale tab.',
    todo: 'Nothing, unless it is happening to people who have NOT had a tab open for hours. A reload fixes it for the person. If the count is high right after every deploy, that is just how many people had the app open.',
  },
  {
    match: /quotaexceeded|exceeded the quota/i,
    severity: 'device',
    means: 'The browser refused a write to localStorage or IndexedDB because the site is out of space.',
    cause: 'Private browsing (where the quota is tiny or zero) or a device genuinely full. This app writes drafts, the outbox, the reorder preferences and the page cache.',
    todo: 'Every localStorage write in this codebase is meant to be in a try/catch for exactly this. If one reached the panel, find the write that is not wrapped.',
  },
  {
    match: /is not a function|undefined is not an object|cannot read propert(y|ies) of (undefined|null)|null is not an object/i,
    severity: 'ours',
    means: 'Something was read off a value that had not arrived yet, or had arrived as null.',
    cause: 'The commonest real bug in this codebase, and it is nearly always the same shape: a query result read before it lands, or a row that exists for most people and not for this one. Look at what is optional on the route below.',
    todo: 'Read the trail to see which screen they were on, then find the value on that screen that is null for some people and not others. A missing profile row, an empty market, a creator with no photos and a challenge with no prize structure have each caused this.',
  },
  {
    match: /jwt|refresh token|invalid claim|session.*expired/i,
    severity: 'auth',
    means: 'The session token was rejected.',
    cause: 'A session that expired while the tab was open, or a refresh that failed offline.',
    todo: 'The app should be signing them out and sending them to the login screen rather than throwing. If this row has hits, the sign-out path is not catching it.',
  },
  {
    match: /row-level security|permission denied for|violates row-level security/i,
    severity: 'ours',
    means: 'The database refused a read or a write this screen assumed it could do.',
    cause: 'An RLS policy that does not cover the case the UI offers. Very often an admin-only surface reached by a creator, or a new column added without its policy.',
    todo: 'The route below tells you the screen; the reason block tells you the table. Either the policy is missing or the button should not have been drawn for that person.',
  },
]

/**
 * The guide entry for a fault, or null when there is no honest answer.
 *
 * Matched on the message AND the stored detail, because some faults only
 * identify themselves in the frames (a dynamic import failure names the chunk
 * there and nowhere else).
 */
export function explain(row) {
  if (!row) return null
  const hay = `${row.message || ''}\n${row.detail || ''}`
  return GUIDE.find((g) => g.match.test(hay)) || null
}

/** Exported for the test: every entry has all four fields and a real regexp. */
export const GUIDE_ENTRIES = GUIDE
