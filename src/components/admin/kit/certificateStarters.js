// SIX CERTIFICATES THAT COVER MOST OF WHAT THIS PROGRAMME GIVES OUT.
//
// Ethan: "you can start by creating some generic ones I can choose from as
// examples."
//
// AN EXAMPLE IS ONLY USEFUL IF IT IS THE THING YOU WOULD HAVE MADE. These are
// not lorem: each one is a real award with its trigger already set, so an admin
// can pick one, change three words, and be finished.
//
// ONE PER LAYOUT, AND THAT IS THE SECOND JOB THEY DO (20 Sep 2026). The studio
// can now make six genuinely different objects, and a list of six starters that
// all used the same one would quietly teach an admin that it cannot. So each
// starter is on a different layout, a different accent and a different paper -
// open the gallery and the range is the first thing you see, without reading a
// word about it. That is also why the accents here are spread rather than all
// orange: "I want a lot of different colors."
//
// THE BODY NEVER REPEATS THE NAME. The card already prints it, large, under
// "This certifies that" - so a body of "awarded to {name} for winning X" puts
// the creator's name on the certificate twice, three lines apart. Caught in the
// preview, which is the whole argument for the preview being the real
// component. The body starts mid-sentence on purpose: the card's own line is
// the subject, and the body is what follows it.
//
// TWO OF THEM SHIP AS DRAFTS, and both are deliberate. "Took part" fires for
// EVERY creator who entered, so turning it on is a decision about how common a
// certificate should be. "Milestone reached" has no milestone chosen, because
// only the admin knows which one - the studio says so in the panel.
export const STARTERS = [
  {
    name: 'Challenge winner',
    tier: 'achievement',
    title: 'Certificate of Achievement',
    subtitle: 'Tryp.com Creator Community',
    body: 'for finishing {place} in {challenge}\n{market}',
    footnote: 'Issued by the Tryp.com Content Creator Community.',
    accent: '#D94407',
    layout: 'banner',
    paper: 'paper',
    emblem: 'trophy',
    pattern: 'plain',
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
    footnote: '',
    accent: '#D94407',
    layout: 'horizon',
    paper: 'paper',
    emblem: 'star',
    pattern: 'plain',
    signature: 'Tryp.com',
    signature_role: 'Creator Community',
    award_on: 'challenge_rank',
    ranks: [2, 3],
    community_ids: [],
    is_active: true,
  },
  {
    name: 'Official creator',
    tier: 'honour',
    title: 'Official Tryp.com Content Creator',
    subtitle: 'Tryp.com Creator Community',
    body: 'is an official Tryp.com Content Creator',
    footnote: 'Issued by the Tryp.com Content Creator Community.',
    accent: '#D94407',
    layout: 'route',
    paper: 'glow',
    emblem: 'shield',
    pattern: 'plain',
    signature: 'Tryp.com',
    signature_role: 'Creator Community',
    award_on: 'manual',
    ranks: [],
    community_ids: [],
    is_active: true,
  },
  {
    name: 'Creator of the month',
    tier: 'honour',
    title: 'Creator of the Month',
    subtitle: 'Tryp.com Creator Community',
    body: 'for the month’s stand-out work in {market}',
    footnote: '',
    accent: '#D94407',
    layout: 'postcard',
    paper: 'ivory',
    emblem: 'star',
    pattern: 'plain',
    signature: 'Tryp.com',
    signature_role: 'Creator Community',
    award_on: 'manual',
    ranks: [],
    community_ids: [],
    is_active: true,
  },
  {
    name: 'Milestone reached',
    tier: 'milestone',
    title: 'Certificate of Achievement',
    subtitle: 'Tryp.com Creator Community',
    body: 'for reaching {milestone}',
    footnote: '',
    accent: '#D94407',
    layout: 'boarding',
    paper: 'tint',
    emblem: 'flag',
    pattern: 'plain',
    signature: 'Tryp.com',
    signature_role: 'Creator Community',
    award_on: 'milestone',
    ranks: [],
    community_ids: [],
    is_active: false,
  },
  {
    name: 'Took part',
    tier: 'participation',
    title: 'Certificate of Participation',
    subtitle: 'Tryp.com Creator Community',
    body: 'for taking part in {challenge}',
    footnote: '',
    accent: '#D94407',
    layout: 'minimal',
    paper: 'sunset',
    emblem: 'check',
    pattern: 'plain',
    signature: 'Tryp.com',
    signature_role: 'Creator Community',
    award_on: 'challenge_entry',
    ranks: [],
    community_ids: [],
    is_active: false,
  },
]
