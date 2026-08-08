# The worldwide network: how it works, and what to build next

August 2026. Written alongside the build that separated Worldwide from the
markets, moved scoring onto the challenge, and made a market something you can
open from the UI.

---

## Part 1. The one idea the whole system rests on

**Worldwide owns the people. A market owns the work.**

Everything follows from that. When a decision is hard, ask which side of the
line it falls on and the answer usually appears.

| Worldwide (the network) | A market (a chapter) |
| --- | --- |
| Connections, DMs, the creator directory | Challenges and their briefs |
| The travel map, the collab board | Its own rooms (General, Announcements, Meetups) |
| The daily game, the leaderboard | Its own standings |
| The resource library, jobs, referrals | Its own managers, currency, timezone |
| Network standings (points from every market added up) | Its own creators |
| Announcements to everyone | Announcements to just this market |

**Why the split is this way round.** The instinct is to give each market its own
everything, and that instinct is wrong here. Splitting the social layer by
country turns one network of 43 creators into four lonely apps of 11. Nothing
about a connection, a DM or a shared trip is improved by a border. What
genuinely *is* local is the work: a brief written for Spanish audiences, in
euros, on a Spanish deadline, judged against Spanish creators.

**What this means for a creator.** You are in Worldwide from the moment you sign
up and you never leave. You are also in one market (usually), which is where
your briefs come from. Joining Spain does not cut you off from anybody. Leaving
Spain does not lose you a single connection or point.

---

## Part 2. The journey, end to end

```
Sign up
   ↓
Onboarding (8 steps)
   Welcome → About you → Socials → Travel photos → Your map
   → Languages → YOUR MARKET → How it works
   ↓
On submit, three things happen at once:
   1. Profile saved, and country_code derived from the country they typed
   2. A DB trigger has already put them in Worldwide (it fires at signup)
   3. If they picked a market, join_market() runs
   ↓
Pending review  →  admin approves  →  Active
   ↓
Home            = their market's live challenge, front and centre
Worldwide       = the people layer, the map, the standings
Their market    = briefs, rooms, challenges, who else is here
```

**The market step, specifically.** It shows Worldwide as already joined with a
tick, and then the market (or markets) whose countries match the code derived
from what they typed. One match is pre-selected; several means they pick; none
says so plainly and reassures them that this is fine. They can skip it entirely
and join later from `/global/markets`.

**A gap this closed.** `profiles.country_code` was backfilled once in migration
070 and then nothing kept it current, so every creator who signed up afterwards
had a null code. Nothing depended on it until markets did, at which point the
suggestion would have silently never fired for anybody new. Onboarding now
derives it from the free-text country field using the same country list the rest
of the app searches.

---

## Part 3. Who can do what

| | Creator | Market manager | Global admin |
| --- | --- | --- | --- |
| Read a market's challenges | Their markets only | Their market | Every market |
| Post in a market's rooms | Their markets | Their market | Everywhere |
| Join a market | If the join rule allows | — | Any, including closed |
| Create a challenge | — | In their market | Anywhere |
| Edit market settings | — | Their market | Any market |
| Award points | — | In their market | Anywhere |
| Open or close a market | — | Close their own | Yes |
| Create a new market | — | — | Yes |

Enforced in the database, not the UI. `my_scopes()` is what you are in;
`my_managed_scopes()` is what you may administer; `is_global_admin()` is the
platform role. Every policy expression calls one of the three, so hiding a
button is a courtesy and never the control.

**Join rules,** set per market:

- **`country`** (default) — a creator whose profile country is in the market's
  country list may join themselves. This is what "your market" means.
- **`open`** — anyone in the network. For a market defined by a language or a
  theme rather than a border.
- **`invite`** — a manager adds each person. For a pilot or a paid tier.

---

## Part 4. How a challenge is won

Chosen when the challenge is created, in every market. Three options:

1. **Points leaderboard.** You write the rules on the challenge: points per
   video (with a cap), bonuses at view milestones, and manual awards from the
   team. Most points at the deadline wins.
2. **Best single video.** Enter as often as you like; only your strongest video
   counts. The highest-viewed single entry wins.
3. **Total views.** Every entry adds to your total. Rewards volume as well as
   reach.

A fourth value, `prize`, exists in the database and is never offered for a new
challenge. It is what every challenge before August 2026 used, including the one
live in the UK right now. Remapping those rows would rewrite the rules of a
contest people have already entered.

**Scoring moved off the market and onto the challenge.** The market used to hold
a rule template every challenge inherited. That was the wrong owner twice over:
a market that runs points in March and best-video in April has no meaningful
"market scoring rules" during April, and editing the template silently changed
what a challenge people were already competing in was worth.

---

## Part 5. What was fixed on the way

- **A Spanish challenge appeared on the UK challenge board.** The `challenges`
  read policy ends in `or is_admin()`, correctly, so an admin can read every
  market. But `/challenges` selected every row it could read. It now filters to
  the viewer's own markets. RLS decides what you *may* read; the page decides
  what it is *about*.
- **"0 of 43 creators have posted."** Participation counted every active profile
  on the platform, which was right with one market and wrong with two. The
  denominator is now the challenge's own market roster.
- **The UK participation bar vanished.** It was keyed to a single "the live
  challenge", found by taking the first active row from a list ordered by start
  date. Spain started more recently, so the bar attached itself to Spain. It is
  now keyed per challenge.
- **Anonymous callers could wipe a leaderboard.** `recalc_challenge_points` was
  created without a grant, so it kept Postgres's default of EXECUTE to PUBLIC,
  and Supabase exposes every public function over PostgREST. It is
  `SECURITY DEFINER` and deletes then rebuilds a challenge's automatic awards.
  Now split: an internal function granted to nobody (which the submission
  trigger calls) and a public wrapper that checks `my_managed_scopes()` first.
- **The Motion runtime shipped to every creator.** Onboarding imported a flag
  helper from a component that imports `motion`, pulling ~39 kB gzipped into the
  initial bundle. The helper moved to a pure module.

---

## Part 6. Ideas, roughly in the order I would build them

Grouped by what they are for. The ones marked **[built]** landed in this pass.

### The shell and navigation

1. **[built]** Place switcher shows only where you belong, plus one door out.
2. **[built]** `/global/markets` as a real discovery page with join buttons.
3. **[built]** Sticky right rail on Worldwide: live now, your places, the people
   layer, worldwide rooms.
4. **[built]** Market pages get tabs: Overview, Challenges, Rooms, Creators.
5. **[built]** Full-width hub instead of a 56rem column on a 1920px screen.
6. Command palette (`⌘K`): jump to a market, a room, a creator, a challenge.
7. Breadcrumbs on deep market pages once markets nest further.
8. "Recently visited" in the rail, so a two-market creator has a one-tap flip.
9. Keyboard shortcuts for room switching (`⌥1..9`), like Slack.
10. Per-market accent colour, used only as a thin edge, never replacing brand
    orange.

### Challenges

11. **[built]** Three scoring modes, chosen per challenge.
12. **[built]** Inline point-rule editor on the challenge form.
13. **[built]** "How this is won" panel on the brief, with a live provisional
    standing.
14. **[built]** Market picker on the challenge form, so a challenge can never be
    filed nowhere.
15. **[built]** Plane empty state when a market has nothing running.
16. Challenge templates: save a finished challenge as a starting point.
17. Clone a challenge into another market, translating currency and dates.
18. Multi-market challenges: one brief, several markets, separate leaderboards.
19. Staged briefs: reveal week two's angle when week one closes.
20. Submission deadline reminders at 72h, 24h and 3h, respecting notification
    preferences.
21. Auto view-count refresh from platform APIs, replacing manual logging.
22. A "practice" challenge for new creators that never expires.
23. Entry quality flags: an admin marks an entry invalid with a reason the
    creator sees.
24. Team challenges: two creators enter as a pair, prize splits automatically.
25. Head-to-head weeks: two markets compete on aggregate views.
26. A public results page per challenge, shareable to a creator's audience.
27. Predicted finish: "at your current pace you finish 4th".
28. Prize pot progress bar that fills as entries land, if the pot scales.
29. Brief attachments: shot lists, b-roll, brand assets, per challenge.
30. Per-challenge FAQ that the team edits as questions arrive.

### Markets

31. **[built]** Five-step wizard to open a market.
32. **[built]** Room management: add, rename, set post policy, remove.
33. **[built]** Join policy per market.
34. **[built]** Big visibility switch instead of a bare checkbox.
35. **[built]** Welcome message and tagline per market.
36. Market health card: entries per creator, reply rate, time to first post.
37. Scheduled opening: a market flips live at a set time.
38. Market-level resource library, on top of the worldwide one.
39. Market events and meetups with RSVP, using the existing events system.
40. A market's own onboarding note, shown once on first visit.
41. Market archive rather than delete, preserving history.
42. Merge two markets (Nordics absorbing a standalone Sweden) without losing
    points.
43. Per-market notification defaults, since a quiet market should not be loud.
44. Market manager handover flow with a checklist.
45. Country coverage map on the discovery page, so gaps are visible.

### The people layer

46. Introductions room prompt: a new creator is nudged to post once.
47. "Creators near you" that respects the map opt-out.
48. Connection suggestions weighted by shared markets and shared destinations.
49. Group DMs, capped small, for collab planning.
50. Creator collections: save profiles into named lists.
51. A "who to meet" card on a trip, from the collab board.
52. Language filters on the directory, using the languages captured at
    onboarding.
53. Mentorship pairing: experienced creator to newcomer, opt-in both sides.
54. Cross-market spotlight so a Spanish creator can be featured to everyone.

### Growth and retention

55. Milestone moments: first entry, tenth video, first win, each with a share
    card.
56. Streaks for consecutive challenges entered, shown quietly.
57. A weekly digest email per market, generated from that market's activity.
58. Re-engagement nudge after two missed challenges, from a human, not a system.
59. Referral leaderboard per market.
60. Public market landing pages for recruiting in a new country.
61. Waitlist on a closed market, so demand is measurable before opening.
62. "Invite a creator from your country" when their market has under ten people.

### Admin and operations

63. Cross-market analytics: cost per asset and CPM side by side.
64. A single queue of every entry awaiting review, across markets.
65. Bulk view-count entry by pasting a spreadsheet.
66. Audit trail on market settings changes.
67. Impersonate-a-creator preview scoped to a specific market.
68. Payout batching per market and currency.
69. Budget per market per quarter, with spend against it.
70. Alert when a market has no live challenge for N days.
71. Duplicate submission detection across challenges.
72. Manager digest: what needs your attention in your market this week.

### Craft and polish

73. **[built]** Plane and contrail on the live card and empty states.
74. **[built]** Titles magnify on hover instead of underlining.
75. **[built]** The proven mobile chat overlay on market rooms.
76. Skeletons matching final layout, so nothing jumps on load.
77. Optimistic join: the market page updates before the round trip returns.
78. A quiet confetti moment when a challenge you entered closes.
79. Offline queue for a submission made on a train.
80. Reduced-motion audit of every new animation.
81. Dark mode pass over the rail and the wizard.
82. Empty states everywhere that suggest an action rather than apologise.

### Mobile

83. **[built]** Room tabs instead of a stacked sidebar.
84. **[built]** Six creators in a grid that fits a 375px screen.
85. Swipe between market tabs.
86. Bottom-sheet market switcher on phones.
87. Push notification per market, respecting per-market preferences.
88. Home-screen shortcut straight into your market's live challenge.
89. Camera-roll picker that remembers the last five videos submitted.

### Trust and data

90. Per-market data residency note in the privacy page, if markets go outside
    the EU.
91. Export my data including market memberships and point ledger.
92. Clear "what your market can see about you" explainer.
93. Point ledger visible to the creator, row by row, so a total is always
    explainable.
94. Dispute a score, with a thread attached to the entry.

### Further out

95. Creator tiers per market, unlocking briefs.
96. Brand-sponsored briefs inside a market, clearly labelled.
97. Marketplace: brands post a brief, markets bid.
98. Localised UI copy, if the English-only decision is ever revisited.
99. A market's own microsite, generated from its rooms and winners.
100. Cross-network creator passport: your standing, everywhere, one page.

---

## Part 7. What is deliberately NOT built

Worth writing down so it is not rediscovered as an oversight.

- **Per-market DMs, connections or maps.** See Part 1. Splitting these is the
  single change most likely to make the network feel small.
- **A second creator directory per market.** `/c/:slug/members` answers a
  narrower question (who am I competing against here) and does not try to be
  `/creators`.
- **Market-level scoring templates.** Removed on purpose. See Part 4.
- **Leaving Worldwide.** Not possible, enforced by an RLS policy rather than a
  hidden button.
- **Haptics.** Built and removed at Ethan's request in August 2026. Do not
  re-add unprompted.
