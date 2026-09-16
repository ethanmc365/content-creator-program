// FOUR CERTIFICATES THAT COVER MOST OF WHAT THIS PROGRAMME GIVES OUT.
//
// Ethan: "you can start by creating some generic ones I can choose from as
// examples."
//
// AN EXAMPLE IS ONLY USEFUL IF IT IS THE THING YOU WOULD HAVE MADE. These are
// not lorem: each one is a real award with its trigger already set, so an admin
// can add the set, change three words, and be finished. They are also the
// ladder in `lib/certificates` made concrete - one of each tier, so the first
// thing an admin sees is that these are meant to be different from each other.
//
// THE BODY NEVER REPEATS THE NAME. The card already prints it, large and in
// the accent, under "This certifies that" - so a body of "awarded to {name} for
// winning X" puts the creator's name on the certificate twice, three lines
// apart. Caught in the preview, which is the whole argument for the preview
// being the real component. The body starts mid-sentence on purpose: the card's
// own line is the subject, and the body is what follows it.
//
// THE PARTICIPATION ONE SHIPS AS A DRAFT (`is_active: false`), and that is the
// one deliberate asymmetry. It fires for EVERY creator who entered, so turning
// it on is a decision about how common a certificate should be - and a decision
// like that should be made on purpose, not by pressing "add the starter set".
export const STARTERS = [
  {
    name: 'Challenge winner',
    tier: 'achievement',
    title: 'Certificate of Achievement',
    subtitle: 'Tryp.com Creator Community',
    body: 'for finishing {place} in {challenge}\n{market}',
    footnote: 'Verified by the Tryp.com Creator Community',
    accent: '#d94407',
    emblem: 'trophy',
    pattern: 'rays',
    signature: 'Tryp.com',
    signature_role: 'Creator Community',
    award_on: 'challenge_rank',
    ranks: [1],
    community_ids: [],
    is_active: true,
  },
  {
    name: 'Podium finish',
    tier: 'achievement',
    title: 'Certificate of Achievement',
    subtitle: 'Tryp.com Creator Community',
    body: 'for finishing {place} in {challenge}',
    footnote: 'Verified by the Tryp.com Creator Community',
    accent: '#d94407',
    emblem: 'star',
    pattern: 'wash',
    signature: 'Tryp.com',
    signature_role: 'Creator Community',
    award_on: 'challenge_rank',
    ranks: [2, 3],
    community_ids: [],
    is_active: true,
  },
  {
    name: 'Took part',
    tier: 'participation',
    title: 'Certificate of Participation',
    subtitle: 'Tryp.com Creator Community',
    body: 'for taking part in {challenge}',
    footnote: '',
    accent: '#475569',
    emblem: 'check',
    pattern: 'plain',
    signature: 'Tryp.com',
    signature_role: 'Creator Community',
    award_on: 'challenge_entry',
    ranks: [],
    community_ids: [],
    is_active: false,
  },
  {
    name: 'Official creator',
    tier: 'honour',
    title: 'Official Tryp.com Content Creator',
    subtitle: 'Tryp.com Creator Community',
    body: 'is an official Tryp.com Content Creator',
    footnote: 'Verified by the Tryp.com Creator Community',
    accent: '#b8860b',
    emblem: 'shield',
    pattern: 'rays',
    signature: 'Tryp.com',
    signature_role: 'Creator Community',
    award_on: 'manual',
    ranks: [],
    community_ids: [],
    is_active: true,
  },
]
