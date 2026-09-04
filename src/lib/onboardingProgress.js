// HOW FAR SOMEBODY GOT BEFORE THEY STOPPED.
//
// Ethan: "if you go to the creators in the admin panel it shows the creators
// that partly signed up - they're dealing with their profile. This should not
// be showing up here. The only ones to drop here are creators that are actually
// accepted into the community. For these ones that partly signed up, I want
// them to go onto the applications thing, a separate section where market
// managers can review it and maybe reach out to them... and maybe give a little
// pointer to where they actually dropped off."
//
// The roster and the queue were one list because the DATABASE has one table,
// which is a reason to write this file rather than a reason to show a country
// manager forty people who never finished a form.
//
// WHY IT IS DERIVED AND NOT STORED. There is no "current step" column and there
// should not be: onboarding is a client-side draft until the single write at
// the end (see Onboarding.finish), so a stored step would be a second source of
// truth that is wrong whenever somebody edits their profile afterwards. Every
// answer below is read off the columns the flow actually fills in, in the order
// the flow asks for them, so this cannot drift from the form - and if a step is
// added to the form and not to this list, the worst case is an optimistic
// count, not a wrong name.
//
// This is a PURE function of a profile row so it can be tested without a
// database, which matters: "where did they stop" is the sort of thing that is
// obviously right and quietly off by one.

// The required steps of Onboarding.STEPS, in order, each with the test that
// decides whether it was completed. `contact` is the creator_private row (the
// phone lives there, never in profiles).
const STEPS = [
  {
    key: 'identity',
    label: 'Name and photo',
    done: (p) => !!p?.name?.trim() && !!p?.photo_url,
  },
  {
    key: 'based',
    label: 'Where they are based',
    // `age` rather than `dob`: a BEFORE trigger moves the date of birth into
    // creator_private and derives the age, so `profiles.dob` is null on every
    // row in the database and always will be. Reading it here would report
    // every finished applicant as having stopped on this step.
    done: (p, contact) => !!p?.country_code && !!p?.city?.trim() && p?.age != null && !!contact?.phone,
  },
  {
    key: 'socials',
    label: 'Where they post',
    done: (p) => !!(p?.instagram_url || p?.tiktok_url || p?.youtube_url || p?.facebook_url),
  },
  {
    key: 'story',
    label: 'Their story',
    done: (p) => !!p?.bio?.trim() && !!p?.about?.trim(),
  },
  {
    key: 'languages',
    label: 'Languages',
    done: (p) => (p?.languages?.length ?? 0) > 0,
  },
  {
    key: 'map',
    label: 'Travel map',
    done: (p) => (p?.countries_visited?.length ?? 0) > 0,
  },
]

export const ONBOARDING_STEP_COUNT = STEPS.length

/**
 * @param {object} profile     a `profiles` row
 * @param {object} [contact]   the matching `creator_private` row, if known
 * @returns {{
 *   steps: {key:string,label:string,done:boolean}[],
 *   done: number,
 *   total: number,
 *   percent: number,
 *   stoppedAt: {key:string,label:string}|null,
 *   summary: string,
 * }}
 */
export function onboardingProgress(profile, contact = null) {
  const steps = STEPS.map((s) => ({ key: s.key, label: s.label, done: !!s.done(profile, contact) }))
  const done = steps.filter((s) => s.done).length
  const first = steps.find((s) => !s.done) ?? null
  return {
    steps,
    done,
    total: steps.length,
    percent: Math.round((done / steps.length) * 100),
    stoppedAt: first ? { key: first.key, label: first.label } : null,
    // A SENTENCE, NOT A FRACTION. "3 of 6" is a progress bar's caption; the
    // person reading this page is deciding whether to send somebody a message,
    // and what they need is the name of the screen that stopped them.
    summary: !first
      ? 'Filled everything in but never pressed submit'
      : done === 0
        ? 'Signed up and never started'
        : `Stopped at "${first.label}"`,
  }
}

/**
 * Which bucket a profile belongs in. The three are mutually exclusive and
 * between them they cover every row, which is the property that lets the roster
 * and the application queue stop overlapping.
 *
 *  incomplete - signed up, never finished the form. Nobody has anything to
 *               review; somebody might want to nudge them.
 *  applied    - finished it and is waiting on a decision.
 *  member     - in the community (active or muted), or an admin.
 *  declined   - refused. Kept separate so it is never counted as either.
 */
export function applicantBucket(profile) {
  if (!profile) return 'incomplete'
  if (profile.status === 'declined') return 'declined'
  if (profile.status === 'pending') return profile.onboarded ? 'applied' : 'incomplete'
  return 'member'
}
