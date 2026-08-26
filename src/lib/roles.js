// What somebody is called on the platform.
//
// TITLES AND PERMISSIONS ARE DELIBERATELY DIFFERENT THINGS.
//
// `profiles.platform_role` is the permission and has exactly three values
// (owner / global_admin / none). `profiles.role_title` is free text and grants
// nothing at all. Keeping them apart is what lets the team be named however the
// programme grows - "Spain Country Manager", "Nordics Lead", "Campus Lead" -
// without a new policy being written for every label somebody invents.
//
// Nothing in this file is allowed to decide what anyone can DO. It decides what
// their name badge says.

// The programme lead's title in full, and short enough for a chip.
//
// The long one is correct and is what belongs on a profile, in the team roster
// and anywhere there is a line to spare. The short one exists because the full
// version is 38 characters and a rail card is 20rem wide: truncating it to
// "Tryp.com Content Creator Commu…" tells nobody anything.
export const LEAD_TITLE = 'Tryp.com Content Creator Community Lead'
export const LEAD_TITLE_SHORT = 'Tryp.com CCC Lead'

// Presets offered when titling a team member. Not a fixed list: the field
// accepts anything, and these are here so the common cases are one tap rather
// than something to think of and type.
export const TITLE_PRESETS = [
  'Country Manager',
  'Market Lead',
  'Community Manager',
  'Challenge Producer',
  'Partnerships',
  'Content Lead',
]

/**
 * The badge to show under somebody's name.
 * @param {{ role_title?: string, earned_role?: string, platform_role?: string, is_admin?: boolean, memberRole?: string }} person
 * @param {string} [marketName] the market being looked at, if any
 */
export function roleTitle(person, marketName) {
  if (!person) return ''
  // What they have actually been called always wins. The whole point of the
  // field is that the derived label is a fallback, not an override.
  if (person.role_title) return person.role_title
  if (person.platform_role === 'owner') return LEAD_TITLE_SHORT
  if (person.memberRole === 'manager') {
    return marketName ? `${marketName} manager` : 'Market manager'
  }
  if (person.is_admin || person.platform_role === 'global_admin') return 'Tryp.com team'
  // A TITLE THE LADDER HANDED OUT, rather than one a person typed.
  //
  // It sits here, immediately above the generic fallback, so it can only ever
  // replace "Creator" - never a team title, never the programme lead's. That is
  // the whole contract: the milestones can name somebody who had no name, and
  // cannot rename somebody who already has one.
  if (person.earned_role) return person.earned_role
  return 'Creator'
}

/**
 * The same title, cut to badge length.
 *
 * A badge sits beside a name and has to be read in the same glance as the name.
 * "Tryp.com Content Creator Community Lead" is 39 characters and, set next to
 * "Ethan", it is four times the width of the thing it is describing - the title
 * stops being an annotation and becomes the headline. So the one title we know
 * is over-long has an agreed short form, and anything else is used as written,
 * because a country manager's title is already short and cutting it by
 * character count would produce nonsense like "Spanish Country Man…".
 */
export function roleBadgeTitle(person, marketName) {
  const full = roleTitle(person, marketName)
  return full === LEAD_TITLE ? LEAD_TITLE_SHORT : full
}

/** Short label for the permission itself, for the admin surfaces that set it. */
export function permissionLabel(platformRole) {
  if (platformRole === 'owner') return 'Programme lead'
  if (platformRole === 'global_admin') return 'Tryp.com team'
  return 'Creator'
}

export function isLead(person) {
  return person?.platform_role === 'owner'
}
