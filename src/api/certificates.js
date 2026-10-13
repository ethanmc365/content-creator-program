// Certificates, milestones and the creator kit: the Supabase tables and functions this area owns. Pages call these instead of naming
// tables, so a schema rename or a backend move is a change in this folder. Each accessor returns the same query
// builder / `{ data, error }` as before.
import { supabase } from '../lib/supabase'

export const makeCertificatesApi = (db = supabase) => ({
  certificateAwards: () => db.from('certificate_awards'),
  certificateDesigns: () => db.from('certificate_designs'),
  creatorKitAssets: () => db.from('creator_kit_assets'),
  creatorMilestones: () => db.from('creator_milestones'),
  milestoneCriteria: () => db.from('milestone_criteria'),
  milestones: () => db.from('milestones'),
  awardCertificate: (args, opts) => db.rpc('award_certificate', args, opts),
  backfillCertificateDesign: (args, opts) => db.rpc('backfill_certificate_design', args, opts),
  certificateCandidates: (args, opts) => db.rpc('certificate_candidates', args, opts),
  milestoneItemsToSend: (args, opts) => db.rpc('milestone_items_to_send', args, opts),
  milestoneOverview: (args, opts) => db.rpc('milestone_overview', args, opts),
  milestoneProgress: (args, opts) => db.rpc('milestone_progress', args, opts),
  milestoneStandings: (args, opts) => db.rpc('milestone_standings', args, opts),
  verifyCertificate: (args, opts) => db.rpc('verify_certificate', args, opts),
  /** A function in this area chosen at run time. */
  call: (fn, args, opts) => db.rpc(fn, args, opts),
})

export const certificatesApi = makeCertificatesApi()
