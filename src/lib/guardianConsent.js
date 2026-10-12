// PARENT OR GUARDIAN CONFIRMATION IS ON (12 Oct 2026), FOR A HANDFUL OF PEOPLE ONLY.
//
// The community is 18+ (MIN_AGE in lib/utils, `trg_zz_adults_only` in migration 388), so nobody new can be under 18.
// The exception is the members who were already in aged 16 or 17 (`age_exceptions`): Ethan - "for these specific
// creators i was thinking of creating a form that their parents can fill in and approve". They give a parent or
// guardian's name and email when they accept the Community Terms (accept_agreement refuses them without), get a link to
// send, and the parent confirms on /guardian/<token> with no account (guardian_consent_view/confirm are public since 388).
// The register on Admin > Agreements shows who has and has not confirmed. Was OFF 9-12 Oct while Ethan asked Francesco.
export const GUARDIAN_CONSENT_ON = true
