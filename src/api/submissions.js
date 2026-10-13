// Challenge entries, bonus claims and disqualifications: the Supabase tables and functions this feature owns. Pages call these instead of
// naming tables, so a schema rename or a backend move is a change in this folder. Each accessor returns the same
// query builder / `{ data, error }` as before.
import { supabase } from '../lib/supabase'

export const makeSubmissionsApi = (db = supabase) => ({
  submissionBonusClaims: () => db.from('submission_bonus_claims'),
  submissionDisqualifications: () => db.from('submission_disqualifications'),
  submissions: () => db.from('submissions'),
  disqualifySubmission: (args, opts) => db.rpc('disqualify_submission', args, opts),
  reinstateSubmission: (args, opts) => db.rpc('reinstate_submission', args, opts),
})

export const submissionsApi = makeSubmissionsApi()
