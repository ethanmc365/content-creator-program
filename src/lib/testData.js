// WHO IS ALLOWED TO SEE THE PRETEND PEOPLE.
//
// Ethan: "all the test data accounts you created seem to be in the actual
// community and viewable to everyone, for example on the creator network page
// etc, it should not be like this."
//
// He is right, and the reason is worth writing down because the obvious fix is
// the one that caused it. The eight Spanish demo creators were created with
// `is_test = false` ON PURPOSE: the leaderboard, the roster, the market map,
// the directory and the spotlight all filter `is_test` out, so flagging them
// would have made them invisible to the very people the demo was built for.
// Turning the flag on hides them from the team; leaving it off shows them to
// forty-five real creators. Neither is acceptable, because the question was
// never "are these rows test data" - it is "WHO IS LOOKING".
//
// So `is_test` goes back to meaning what it says, every demo person carries it,
// and visibility is a property of the VIEWER:
//
//   * a real creator                  - never sees a test row. Enforced in the
//                                       database (migration 178), not here, so
//                                       it holds for anyone talking to
//                                       PostgREST directly with their own token.
//   * a real admin (Ethan)            - sees them in /admin, where they have to
//                                       be managed, and NOT in the community
//                                       pages or the analytics. That is this
//                                       file's job.
//   * a TEST admin (the demo account) - sees everything, everywhere. This is the
//                                       account the Tryp.com team is handed, and
//                                       an empty demo is not a demo.
//
// `is_admin && (is_test || is_sandbox)` is the test-admin test. Note what it
// deliberately excludes: the sandbox creator behind "view as creator" is a test
// account but NOT an admin, so a preview of the app shows exactly what a real
// creator sees - which is the only thing that preview is for.

let visible = false

/**
 * Called by AuthContext whenever the signed-in profile changes. Defaults to
 * false and returns to false on sign-out, so the failure mode of every path
 * through this module is HIDING demo data rather than leaking it.
 * @param {{is_admin?: boolean, is_test?: boolean, is_sandbox?: boolean}|null} profile
 */
export function adoptTestDataVisibility(profile) {
  visible = !!(profile?.is_admin && (profile?.is_test || profile?.is_sandbox))
}

/** Is the current viewer one of the demo/QA admin accounts? */
export function seesTestData() {
  return visible
}

/**
 * THE VALUES OF `is_test` THIS VIEWER IS ALLOWED TO SEE.
 *
 * Written as a set to put into `.in('is_test', …)` rather than as a wrapper
 * that adds or omits `.eq('is_test', false)`, because a value drops into the
 * middle of an existing chain and a wrapper does not:
 *
 *     .eq('status', 'active').in('is_test', testFlags()).eq('is_admin', false)
 *
 * There are four dozen of these filters spread across the pages, most of them
 * in the middle of a long builder chain, and a change that can be made in place
 * is a change that can be made everywhere. `is_test` is NOT NULL with a default
 * of false, so `.in('is_test', [false])` and `.eq('is_test', false)` select
 * exactly the same rows - this is a widening, never a change of meaning.
 */
const HIDDEN = [false]
const BOTH = [false, true]
export function testFlags() {
  return visible ? BOTH : HIDDEN
}

/**
 * Apply `is_test = false` to a Supabase query UNLESS the viewer is a test admin.
 *
 * Written as a wrapper rather than left at each call site because there are
 * eighty-odd of these filters in the app and the failure mode of missing one is
 * a fake person in a real creator's feed.
 *
 * @param {object} q a PostgREST query builder
 * @param {string} [path] the column, qualified for an embedded table
 *                        (e.g. 'profiles' → `profiles.is_test`)
 */
export function hideTest(q, path) {
  if (visible) return q
  return q.eq(path ? `${path}.is_test` : 'is_test', false)
}

/**
 * The row-level version, for results that are filtered in JavaScript after the
 * fact (a leaderboard that has to be assembled before it can be trimmed).
 * @param {{is_test?: boolean}|null|undefined} p
 * @returns {boolean} true if this row should be DROPPED
 */
export function isHiddenTestRow(p) {
  return !visible && !!p?.is_test
}
