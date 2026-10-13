// Agreements, acceptances, translations, guardian consent and signed copies: the Supabase tables and functions this area owns. Pages call these instead of naming
// tables, so a schema rename or a backend move is a change in this folder. Each accessor returns the same query
// builder / `{ data, error }` as before.
import { supabase } from '../lib/supabase'

export const makeAgreementsApi = (db = supabase) => ({
  agreementTranslations: () => db.from('agreement_translations'),
  agreements: () => db.from('agreements'),
  guardianConsents: () => db.from('guardian_consents'),
  acceptAgreement: (args, opts) => db.rpc('accept_agreement', args, opts),
  agreementForMe: (args, opts) => db.rpc('agreement_for_me', args, opts),
  agreementPreview: (args, opts) => db.rpc('agreement_preview', args, opts),
  agreementRegister: (args, opts) => db.rpc('agreement_register', args, opts),
  agreementSignedCopy: (args, opts) => db.rpc('agreement_signed_copy', args, opts),
  guardianConsentConfirm: (args, opts) => db.rpc('guardian_consent_confirm', args, opts),
  guardianConsentView: (args, opts) => db.rpc('guardian_consent_view', args, opts),
  myAgreementContext: (args, opts) => db.rpc('my_agreement_context', args, opts),
  myAgreements: (args, opts) => db.rpc('my_agreements', args, opts),
  myGuardianLinks: (args, opts) => db.rpc('my_guardian_links', args, opts),
  myPendingAgreements: (args, opts) => db.rpc('my_pending_agreements', args, opts),
  publishAgreement: (args, opts) => db.rpc('publish_agreement', args, opts),
  /** A function in this area chosen at run time. */
  call: (fn, args, opts) => db.rpc(fn, args, opts),
})

export const agreementsApi = makeAgreementsApi()
