# 50 ideas for the platform

3 August 2026.

These are ordered by the problem they solve, not by page. A page-by-page UX pass
already exists in `PLATFORM_PAGE_REVIEW_AND_50_FEATURE_IDEAS_2026-07-27.md`;
this list deliberately does not repeat it. Everything here is aimed at the four
findings in `ENGAGEMENT_DIAGNOSIS_AND_REBRAND.md`: nobody can be reached, half
the community never arrived, the room looks empty, and the tournament
demotivates the middle.

Effort: **S** under a day, **M** a few days, **L** a week or more.
Impact is my honest estimate given the current numbers.

---

## A. Reachability — you cannot reach 93% of people (do these first)

1. **Ask for push during onboarding, not in Settings.** One screen, after the
   profile is complete, explaining what they'll be told about. This is the single
   highest-value change on the list. *S · very high*
2. **Re-ask once, well.** A one-time in-app banner for existing creators who
   have no subscription, explaining what they've been missing. *S · very high*
3. **Explain before prompting.** Browsers give one permission shot per install;
   a pre-prompt that earns the yes protects it. *S · high*
4. **"Add to home screen" walkthrough for iOS.** iOS only allows web push from
   an installed PWA. Most of your creators are on iPhones, so without this the
   ceiling on push adoption is low no matter what else you do. *M · very high*
5. **Show reachability in the admin roster.** A dot per creator for push on/off,
   so you know who you can actually contact before you plan an announcement.
   *(Shipped: Community health tab.)* *done*
6. **Email as the fallback channel it should be.** You cut broadcast email for
   good reasons, but a verified sending domain (`mail.tryp.com`) makes "new
   challenge live" reach people push cannot. *L · high*
7. **SMS for the top 10 only.** Cheap at this scale, and for a core group of
   ambassadors a text is worth fifty push notifications. *M · medium*
8. **Digest instead of silence.** A weekly "here's what happened" push for people
   who haven't opened the app in 7 days. *M · high*
9. **Per-challenge reminder cadence.** You have deadline reminders; add a "48h
   left and you haven't posted" that only fires at people who haven't. *S · high*
10. **Track notification-to-open rate.** Right now you can't tell whether a push
    that was sent was ever acted on. *M · medium*

## B. Activation — 22 people have never opened the app

11. **A personal DM from you on day one**, automated but written like a person,
    with one specific ask. Your DMs already outperform everything else on the
    platform. *S · very high*
12. **First-session checklist** with three tiny wins: say hi, connect with one
    person, play today's puzzle. Endowed progress (start it at 1 of 4 complete).
    *M · high*
13. **A reason to come back tomorrow, on day one.** The daily puzzle already
    exists and is played 206 times — surface it in the welcome flow rather than
    burying it. *S · high*
14. **Magic-link sign-in.** Half your community never logged in a second time;
    a forgotten password is a plausible reason for some of that. *M · high*
15. **"You haven't been back" nudge at day 7**, from a human, not the system.
    *S · high*
16. **Show what they're missing in the invite email**, not just "you're in":
    the live challenge, the prize, who else joined this week. *S · medium*
17. **Onboarding buddy.** Auto-suggest one connection with an overlapping
    destination, and introduce them both. *M · medium*
18. **Lower the first-post bar explicitly.** A "first post" brief that is
    deliberately trivial, with its own small guaranteed reward. Median time to
    first post is 13 days; this targets exactly that gap. *M · high*
19. **Re-onboarding for the dormant 22.** A single screen on next login: what's
    changed, what's live, one action. *M · medium*
20. **Exit survey when someone goes quiet.** Two questions, in-app, at day 30.
    You currently have no idea why people leave. *S · high*

## C. Make the room look alive (31 messages exist, 20 are yours)

21. **A weekly prompt with a one-line answer.** "Where are you off to next?"
    Low-risk questions get answers; open floors do not. *S · very high*
22. **Seed visible activity.** Auto-post challenge entries into #general as they
    land, so the room has a pulse even when nobody is talking. *M · high*
23. **Reply-to-newcomer prompts.** When someone posts for the first time, nudge
    two active members to react. Nothing kills a community faster than an
    unanswered first post. *M · high*
24. **Show who's online.** You have presence data already; a small "5 here now"
    changes the felt cost of posting. *S · medium*
25. **Threaded topics rather than one channel.** #general with 31 messages reads
    as dead; three topic rooms with 10 each read as three conversations. *M · medium*
26. **Voice notes in chat.** Far lower effort than typing for creators who live
    on camera. *M · medium*
27. **Weekly community roundup, auto-generated.** Who joined, who posted, the
    best video. Manufactured proof of life. *M · high*
28. **Creator spotlight as an interview**, not a card. Three questions, answered
    in the app, published to the room. *M · medium*
29. **Reactions on everything.** Cheapest possible participation, and the on-ramp
    to real posting. *S · medium*
30. **A visible "new here" tag** for the first two weeks, so newcomers get
    welcomed rather than ignored. *S · medium*

## D. Motivation beyond winning

31. **Guaranteed rate per accepted post.** The core of the ambassador model.
    Certainty beats a lottery. *M · very high*
32. **Tiers anyone can reach** (Ambassador / Featured / Core) instead of a
    ranking everyone loses. *M · very high*
33. **Repost creator content to Tryp.com's own channels.** Free to you, and
    worth more than the prize money to a growing creator. *S · very high*
34. **Trip credit as a reward currency.** Costs less than cash, worth more to
    this audience, and it puts them back in your product. *M · high*
35. **Short specific briefs, weekly.** "Any video" is a decision; "the view from
    your window" is a task. *S · high*
36. **Personal progress instead of a leaderboard.** Your own views over time,
    your own streak, your own best. Nobody quits because they lost to themselves.
    *M · high*
37. **Participation streaks** with a visible run. Loss aversion does the work
    the prize was failing to do. *M · high*
38. **Peer recognition awards** voted by the community, not by views. Detaches
    status from follower count. *M · medium*
39. **Publish the brief a week early** so people can shoot while travelling
    rather than scrambling at the deadline. *S · medium*
40. **A "no idea what to make" button** that hands them a concrete concept.
    *S · high*

## E. Proving the programme works

41. **Guaranteed-rate vs prize-pot A/B**, same budget, measured on posts, unique
    creators and CPM. One month of data decides the rebrand. *M · very high*
42. **Cost per creator acquired**, tracing referrals through to first post.
    *M · high*
43. **Earned media value per challenge** — what those 37,000 views would have
    cost as paid social in each market. This is the number a Tryp.com exec will
    actually respond to. *M · very high*
44. **Benchmark CPM against Tryp's own paid media.** If you beat their paid CPM,
    that is the entire pitch in one line. *S · very high*
45. **Historical challenge import.** Your spreadsheet has 40+ pre-platform
    challenges; a CSV import would put the full history behind the new analytics
    instead of only the challenges run here. *M · high*
46. **Automatic monthly report** as a shareable page, generated not written.
    *M · medium*

## F. Product surface

47. **Creator media kit, auto-generated.** Their stats, best videos and reach as
    a shareable page. Genuinely useful to them, which makes the programme
    valuable independent of prizes. *M · high*
48. **Public creator directory.** Turns the programme into a shop window for
    brands, which is a reason to stay in it. *L · medium*
49. **Booking integration.** Ambassadors book through Tryp.com with credit and
    the content loop closes on itself. *L · high*
50. **Rate card and paid brief marketplace.** The end state: brands post briefs,
    ambassadors accept, Tryp.com takes a cut. Turns a cost centre into a product.
    *L · high*

---

## If you only do five

1. Push permission during onboarding, plus the iOS install walkthrough (1, 4).
2. Personal DM to every creator on day one (11).
3. Weekly one-line prompt in #general (21).
4. One guaranteed-rate brief, measured against the prize-pot challenge (31, 41).
5. Earned media value per challenge, benchmarked against Tryp's paid CPM (43, 44).

The first three fix arrival and the empty room. The last two decide the rebrand
and write your pitch for you.
