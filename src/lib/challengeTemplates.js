// WHAT A CHALLENGE TEMPLATE CARRIES, AND WHAT IT DELIBERATELY DROPS.
//
// This is the whole meaning of the feature, which is why it is a pure module
// with tests rather than two object literals inside the form. A template that
// carries the wrong field is worse than no template: it silently puts LAST
// month's dates, or another market's currency, or a live challenge's id, into a
// brief somebody is about to publish.
//
// THE RULE: a template is the SHAPE of a brief, never an instance of one.
//
// DROPPED, and each one is a bug that would otherwise ship:
//
//   dates       The one field nobody would notice was wrong until a challenge
//               opened in the past and closed before it started. A template
//               made in August must not put August in a form in November.
//   status      A template is never published, never a draft, never archived.
//               Carrying `status: 'active'` into a new form and pressing the
//               button that says "Save as draft" would publish it.
//   ids         `community_id` is the market the brief was WRITTEN for, and
//               it is stored on the template ROW for the card to show - not in
//               the payload, because applying a template must not silently move
//               a challenge into another market. Same for any row id: point
//               rules and groups keep their text and lose their keys, or the
//               new challenge's rules would be written over the old
//               challenge's rows. That is migration 139's bug in a new place.
//   members     A group's DEALT PEOPLE are the people who were in that market
//               at that time. Nobody wants August's roster.
//
// KEPT: everything that is a decision about the brief itself.

// The form keys a template is allowed to restore. An allow-list rather than a
// deny-list, because the form grows - it has grown three times this year - and
// a new field should have to be ADDED here deliberately. The failure mode of
// forgetting is "the template does not carry my new field", which somebody
// notices immediately; the failure mode of a deny-list is that a new field is
// carried when it should not have been, which nobody notices until it is wrong
// in production.
export const TEMPLATE_FIELDS = [
  'title',
  'description',
  'rules',
  'platforms',
  'prize_structure',
  'participation_threshold',
  'participation_prize',
  'format',
  'audience',
  'prize_currency',
  'prize_type',
  'content_type',
  'content_note',
  'objective',
  'cpm_target',
  'scoring',
  'threshold_mode',
]

// The keys that make a point rule a ROW rather than a rule. Listed rather than
// destructured away, because a destructure of names nobody reads is four lint
// errors and reads as a mistake.
const ROW_KEYS = ['id', 'challenge_id', 'community_id', 'created_at']

/** A point rule with its database keys removed - the rule, not the row. */
function ruleShape(rule) {
  const out = { ...(rule || {}) }
  for (const key of ROW_KEYS) delete out[key]
  return out
}

/** A group with its id and its roster removed - the board, not who was on it. */
function groupShape(group) {
  return {
    name: group?.name || '',
    prize_currency: group?.prize_currency || 'EUR',
    prize_structure: Array.isArray(group?.prize_structure) ? group.prize_structure : [],
    participation_threshold: group?.participation_threshold ?? '',
    participation_prize: group?.participation_prize ?? '',
  }
}

/**
 * The payload to store, from the form as it stands.
 *
 * @param form    the challenge form state
 * @param rules   the point rules being edited
 * @param groups  the groups being edited
 */
export function templateFromForm(form = {}, rules = [], groups = []) {
  const payload = {}
  for (const key of TEMPLATE_FIELDS) {
    if (form[key] !== undefined) payload[key] = form[key]
  }
  payload.point_rules = (rules || []).map(ruleShape)
  payload.groups = (groups || []).map(groupShape)
  return payload
}

/**
 * The patch to apply to a form, from a stored payload.
 *
 * NOTHING IS INVENTED HERE. A key the payload does not have is simply absent
 * from the patch, so the form's own default survives - which is what makes an
 * OLD template usable after the form grows a field. A key the form no longer
 * reads is dropped by the allow-list on the way in, so a template written
 * before a field was removed does not resurrect it.
 */
export function formFromTemplate(payload = {}) {
  const patch = {}
  for (const key of TEMPLATE_FIELDS) {
    if (payload[key] !== undefined) patch[key] = payload[key]
  }
  return {
    form: patch,
    // `seed-` ids are what STARTER_POINT_RULES uses for "a rule that is not a
    // database row yet", and the save path already knows to insert rather than
    // update anything carrying one. Reusing that convention means a template's
    // rules travel the exact same path as a hand-written one.
    rules: (payload.point_rules || []).map((r, i) => ({ ...r, id: `seed-${i}` })),
    groups: (payload.groups || []).map((g) => ({ ...groupShape(g), members: [] })),
  }
}

/** A one-line summary for the template card, in the language of the caller. */
export function templateSummary(payload = {}, tr = (s) => s) {
  const bits = []
  const prizes = Array.isArray(payload.prize_structure) ? payload.prize_structure.length : 0
  if (prizes) bits.push(`${prizes} ${prizes === 1 ? tr('prize') : tr('prizes')}`)
  const points = Array.isArray(payload.point_rules) ? payload.point_rules.length : 0
  if (points) bits.push(`${points} ${points === 1 ? tr('point rule') : tr('point rules')}`)
  const groups = Array.isArray(payload.groups) ? payload.groups.length : 0
  if (groups) bits.push(`${groups} ${groups === 1 ? tr('group') : tr('groups')}`)
  const platforms = Array.isArray(payload.platforms) ? payload.platforms.length : 0
  if (platforms) bits.push(`${platforms} ${platforms === 1 ? tr('platform') : tr('platforms')}`)
  return bits.join(' · ')
}
