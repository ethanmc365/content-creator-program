# Work queue captured 28 Sep 2026

Every decision from Ethan's brief, transcribed so none of it is lost. Nothing in
here has been built yet: the session it was captured in had no shell access
(see "Why nothing shipped" at the foot).

Ordering is by cost, not by the order it was dictated. Group 1 is a single
afternoon; groups 5 to 9 are each a feature in their own right.

---

## 1. Copy and small UI (cheap, do first)

1. **"Read your brief to view all details" -> "View all details"**, everywhere
   that button appears (worldwide page, challenges page, any other caller).
   Ethan's words: it is not just the brief behind it any more.
2. **Mobile: add a "View all details" button above "Submit your video"**, so it
   is reachable without hunting.
3. **"Find a deal" capture card**: make it a SMALL card matching the others.
   Delete "prices move" and "catch the price, dates and airport the moment you
   find them" - that instruction is not wanted at all. No bullet points. One
   plain sentence covering the three ways to record: screenshot the trip, screen
   record while scrolling it, or film the laptop screen with a phone, so viewers
   see the website, the prices and the dates.
4. **Trip-ideas icons**: drop the orange background circle; a bold Tryp.com
   orange icon on its own.
5. **Leaderboard**: remove "Reach 18 points for a EUR 10 Tryp.com voucher" from
   the very top - wrong placement. KEEP the voucher line where it already shows
   when somebody earns one.

## 2. KPI tracker

6. **Recruiters graph moves ABOVE the main overview graph.** (Ethan asked as a
   question - "or am I wrong?" - he is not wrong, put it above.)
7. **"Landed" and "Target" labels do not make sense** - relabel, and improve the
   panel's design generally.
8. **Country list must take more countries without breaking**: fixed height,
   smooth scroll. Today's short list is fine as-is.
9. **Target-met progress bar reads as EMPTY when it is 100%** because the fill is
   pure white on white. Redesign it, and give completion a proper animation.

## 3. Calendar

10. **Two-finger swipe only fires once.** It moves one page, then will not fire
    again until the mouse is physically moved. It must repeat immediately.
    (Note from the last pass: the wheel gesture state is module-level,
    `wheelGesture`, because the grid remounts per month - the reset is likely
    there.)
11. **The "you are in Oslo" cell** draws a stray orange border along its TOP edge
    only, not around the cell. Fix, and keep the animations clean.

## 4. Challenge recap

12. **Delete the "Your Challenge and Numbers" page entirely** - redundant, the
    same things are said elsewhere.
13. **Final page: delete the "First of 28 creators, overall 4.8x average video"
    line.** The other stats on that page are enough.
14. Recap must be **live at the end of a challenge for every creator who took
    part**. "Everybody together" and the final page are both approved as they are.
15. **"Your Recap Is Ready" card on the challenges page**: it must sit LEVEL with
    the bonuses card (the slot where "Current Leaderboard" appears when the
    leaderboard tab is open). When a bonus is active, the bonus shows there; when
    no bonus is active, show "your recap card is coming" so creators know it is
    on the way. Works for every challenge, not just this one.

## 5. Certificates (largest UI group; gated behind `certificates_live`, still FALSE)

Horizon is the favourite and the reference for quality.

**Applies to every template:**

16. **Place styling is inconsistent.** Horizon's first place is WHITE and is
    wrong; use the orange treatment Sky Banner and Passport already have.
17. **Never "1st of 10".** Just the ordinal word: "First", "Second", "Third".
    Not even the word "place".
18. **Third place must not be transparent** (Sky Banner) - light orange
    background. Fourth and beyond sit on white with their ordinal ("Tenth").
19. **The date block**: "Awarded" in BOLD, the date under it in smaller grey.
    Currently inverted. Passport is already correct because both lines are bold -
    leave Passport's alone.
20. **A certificate may have NO place at all** (a milestone award). That must be
    a supported shape.

**Per template:**

21. **Horizon**: remove the dotted ring around the profile photo. The NAME must
    be the recipient's - it printed "Roxana travels" over Ethan's photo. Design
    otherwise approved.
22. **Sky Banner**: general UI polish. The incoming plane is liked, keep it.
23. **Passport**: the stamp-as-date idea is liked, keep it. **Print the name
    forwards**, not reversed.
24. **Boarding pass**: strongly liked. QR code WORKS and should be BIGGER.
    Remove the "Scanned"/"Verify" chip beside it; put small verify text UNDER the
    QR instead. Centre "First Place" vertically in the right column.
25. **Boarding pass -> the /verify check page needs rebuilding**: it does not
    match the platform's style and has no clean animations.
26. **Postcard: redesign it.** The current style is not liked. Make it read as an
    actual postcard: ONE stamp, top right. The extra stamps overlapping it look
    wrong - remove them. The rest is acceptable.
27. **Minimal**: decent already. Make the first-place icon slightly BIGGER.
    Fix the date as above. **Remove the paper-style options entirely** - no soft
    glow wash, no Tryp gradient, white only. KEEP the accent colours.

**Builder / options:**

28. **Remove the "Badge / Tryp Plane / Root" options** - not needed.
29. **Milestone icon**: the flag is not liked. Use a trophy or similar.
30. **Badges must not print their kind**: no "Participant" on a participation
    badge, no "Milestone" on a milestone one, no "Honour" on a by-hand one - a
    star is enough there. The badge renders GREY when the accent colour is
    changed; fix so it follows the accent.
31. **The milestone picker is a native Apple dropdown** - replace with the
    platform's own select styling.
32. **Bug**: switching award kind (milestone / by hand / entering a challenge)
    raises "none of the wording can be filled in for this kind of award, so it
    falls back to the default sentences". Every kind must fill its own wording.
33. **The Instagram story size cannot be found.** It was reported as built in an
    earlier session. Either surface it somewhere obvious, or build it. Ethan must
    be able to see and reach it clearly.
34. **Top of the builder**: the "Took part" wording looks like it is addressed to
    the recipient. Improve that UI.
35. **The certificates page is confusing.** The other certificates on it are
    unexplained; some are faded (draft?) and some are not (live?). Cut it back to
    ONE example certificate that can be viewed and edited, and make draft vs live
    legible.
36. **Then take certificates live** (flip `certificates_live`) once the above is
    done and reviewed.

## 6. Admin-sent notifications (new build)

37. **An admin can compose and send a push notification to creators.**
    Placement, decided: a button on the CHALLENGE, to the LEFT of Edit. It is a
    notification about that challenge, so it belongs there. Not limited to one
    purpose - any custom message about the challenge.
38. **Mid-challenge nudges** are the motivating case: "you are 3 points from a
    voucher", "you are 5 points away". Those should be sendable, and worth
    considering as automatic.
39. Ethan raised the admin email page as an alternative home (it is barely used -
    only address copying). Decision landed on the challenge button; the email
    page is the fallback if a general-purpose sender is wanted later.

## 7. Rewards and referrals

40. **Voucher wallet**: already exists in effect; improve it on the rewards page.
41. **Referrals page: an ALL-TIME referrals leaderboard**, visible to creators -
    who is bringing creators in, and how many.

## 8. Invoices (from the second brief)

Context: another session fixed the amount field, which had been showing pence.

42. **"Other - someone not on the platform"**: remove the em dash. Make it read
    "Someone not on the platform" or similar. (House rule: no em dashes anywhere
    in user-facing copy.)
43. **Remove the euro sign next to the price label/title.** With the EUR/GBP
    toggle in place it is wrong there; the symbol inside the box is correct.
44. **Align the invoice-date boxes.** The layout went crooked when the currency
    toggle was added.
45. Notes should say paid in pounds or paid in euros to match the toggle, and the
    invoice@ details need checking alongside it.

## 9. Spanish and the i18n system (large)

46. **Spanish must be complete and correct everywhere.** Rigorous sweep.
    Recently-added strings are the known gap: "most points at the deadline wins",
    "find a deal", and anything else added in the last few passes.
    (Known trap from an earlier pass: neither i18n script could see a `pl()`
    string, so script-driven coverage reports have under-reported before.)
47. **Worldwide page cards grow in Spanish.** They must keep their normal size -
    reduce the text size slightly if that is what it takes.
48. **The top nav is misaligned in Spanish** ("global / challenges / messages /
    calendario" spacing is wrong).
49. **A "Translate" button on a brief**, so a Spanish creator can flip an English
    brief to Spanish on demand. Build it if it is feasible; skip if not.
50. **Adding a language must be trivial.** German is the next one Ethan will ask
    for; all the plumbing should already be there when he does.
51. **Rebuild the admin languages page.** Today it is endless scrolling and it is
    hard to tell the English from the translation. It needs: sections per page
    (worldwide, challenges, and everything inside them), English and translation
    side by side, easy inline correcting so a native Spanish speaker can make it
    sound natural, clean animations.

## 10. Creator network map (rework, over-corrected last pass)

52. **The clustering went much too far.** Fully zoomed out, the whole of Europe
    collapses into a single "130" pin on the UK. That is wrong: creators should
    still sit in THEIR OWN countries, grouped within each country. Zooming in
    should spread them further.
53. **The regroup animation is too slow and too delayed.** Much smoother, much
    quicker. The goal is neither one giant blob nor jumbled overlapping pins.
    Worth real time: plan it, build it, test it at several zoom levels.

## 11. Public programme page (`/programme`, the signup page)

54. **The dotted connection lines are still drawn between pins that have been
    clustered away**, so lines run to curves that no longer exist. Likely fixed
    by fixing group 10, but verify on this page specifically - it is a duplicate
    of the creator map.
55. **A Wall of Fame.** Placement suggested: under "recently active creators" or
    below "Why creators join". Shows the top creators from EVERY challenge - the
    winners, e.g. the three from the Tryp.com challenge. Per creator: profile
    photo or card, a little about them, some of their numbers, their links,
    accumulated views, and possibly their best video's thumbnail. **Clicking
    prompts signup or login** to see the full creator. Think of it as an alumni
    wall / public winners page: real public credit, with a link to the video.
56. **Privacy**: a Settings toggle under privacy to opt OUT, **on by default**.

## 12. Admin invite link (new build)

57. **A shareable link that lets a Tryp.com team member apply for ADMIN access**,
    so Ethan can hand it to the team instead of onboarding each person by hand.
58. **Ethan still approves every one.** That is the deliberate safeguard if the
    link is forwarded to somebody it was not meant for - and with approval in
    place, a leaked link is not a serious exposure.
59. **On approval they get admin access**, and Ethan can set their role title to
    whatever they should be called.
60. **A shortened signup**: keep name, profile photo, bio, and the tutorial and
    the other main features. SKIP bank details and social links - they do not
    apply. It should feel like the normal signup, just faster.

---

## Why nothing shipped in the session that captured this

Every command-running tool in that session (Bash, and the Terminal panel tool)
returned the same fault: the auto-mode safety classifier gave no verdict, which
blocks execution without saying anything about the commands themselves. File
reads and writes were unaffected, which is why this document exists.

That meant no `git`, no `npm run test`, no `npm run lint`, no `npm run build`, no
push, and therefore no Vercel deploy - and also no `grep`, so the strings and
components named above were never located in the tree.

This is the wrong codebase to change blind. The platform's own notes record a
run of faults that were invisible until something was measured: a CSS rule with
equal specificity parking every revealed item 32px low, a cache that tested
`!obj[key]` and re-geocoded for ever at 28 renders a second, PostgREST quietly
returning 1000 rows of a larger table, an `exception when others` swallowing a
type error for months. Editing roughly sixty items across a 460-file tree with
no test run and no build would have added to that list rather than shortening it.

**To pick this up:** confirm the shell works (`git -C ~/tryp-creator-platform
status`), `git fetch` first because other sessions push to `origin/main`, then
work down from group 1. Groups 1 to 4 and 8 are small and safe to batch. Group 5
is a long grind but low-risk. Groups 6, 9, 10, 11 and 12 each deserve their own
plan before any code.
