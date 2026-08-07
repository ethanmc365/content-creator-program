# Platform page review and 50 feature ideas

Date: 27 July 2026  
Code revision reviewed: `927ad24099b7c2a2546f3843dd70a0687fe0b078`

## Method and scope

Every routed page in `src/App.jsx` was mapped to its page component, data calls, supporting components, and connected workflows. The existing Graphify knowledge graph was also queried to trace shared dependencies between routes, authentication, Supabase, messaging, challenges, analytics, and administration.

This is a source-backed page review. A local interactive server could not be opened in the restricted review environment, and browser access to the production URL was blocked by the browser's site policy. Recommendations therefore reflect the implemented screens and workflows rather than a signed-in visual usability session. Redirect-only compatibility routes are covered by their destination page.

Priority means likely product value, not implementation sequence. Effort is a rough product-and-engineering estimate: S (small), M (medium), L (large).

## Public, access, and legal pages

1. **Landing — `/`**  
   Current surface: explains the creator program, benefits, workflow, community activity, and application call to action.  
   **Idea: interactive creator earnings and opportunity simulator.** Let a prospective creator select audience size, platforms, travel frequency, and challenge participation to see realistic opportunity ranges and matching success stories. This makes the value proposition concrete without promising guaranteed income. **Priority P1 · Effort M**

2. **Login — `/login`**  
   Current surface: email/password authentication with bot protection and recovery routing.  
   **Idea: passkeys plus email magic-link sign-in.** Offer phishing-resistant passkeys as the preferred returning-user method, with magic links as a low-friction fallback and password login retained during migration. **Priority P0 · Effort M**

3. **Signup — `/signup`**  
   Current surface: creator application/account registration, referral handling, and bot protection.  
   **Idea: resumable application with referral prefill.** Save a draft locally and server-side, show progress, validate social profiles as they are added, and let invite links prefill the referrer transparently. **Priority P1 · Effort M**

4. **Forgot password — `/forgot-password`**  
   Current surface: initiates account recovery.  
   **Idea: recovery status centre.** Show a privacy-safe confirmation, expected delivery time, resend cooldown, common delivery fixes, and an escalation path without revealing whether an email is registered. **Priority P2 · Effort S**

5. **Reset password — `/reset-password`**  
   Current surface: accepts a recovery session and sets a new password.  
   **Idea: post-reset session control.** After a successful reset, offer “sign out every other device,” display the security effect clearly, and send a non-sensitive account alert. **Priority P0 · Effort S**

6. **Privacy policy — `/privacy`**  
   Current surface: static privacy terms.  
   **Idea: policy-linked privacy controls.** Add a plain-language data map and deep links into export, profile visibility, notification, location, and deletion settings, with a dated change log. **Priority P1 · Effort M**

7. **Terms — `/terms`**  
   Current surface: static programme terms.  
   **Idea: versioned consent history.** Record the terms version each member accepted, highlight material changes, and provide an admin view of re-consent completion. **Priority P1 · Effort M**

## Creator pages

8. **Onboarding — `/onboarding`**  
   Current surface: multi-step basics, platforms, photos, travel map, languages, and programme education.  
   **Idea: adaptive onboarding with autosave and profile preview.** Save every step, skip irrelevant questions based on platform choices, preview the public profile, and show exactly what remains before approval/readiness. **Priority P0 · Effort M**

9. **Home — `/home`**  
   Current surface: personalised greeting, next challenge, community activity, collaboration, and recent content.  
   **Idea: daily creator action plan.** Rank three useful next actions—finish a profile field, respond to a connection, enter a challenge, bookmark a brief—using deadlines and member state. **Priority P0 · Effort M**

10. **Edit profile — `/profile/edit`**  
    Current surface: identity, social links, travel plans, languages, bucket list, visited countries, and travel photos.  
    **Idea: profile quality coach.** Score completeness, validate platform URLs, flag stale travel dates, support drag-to-reorder media, and preview how the profile appears to creators versus administrators. **Priority P1 · Effort M**

11. **Creator profile — `/profile/:id`**  
    Current surface: biography, achievements, languages, content showcase, travel activity, connect, and message actions.  
    **Idea: shareable creator media kit.** Generate a public-safe portfolio link/PDF with selected metrics, top work, destinations, languages, collaboration interests, and contact controls chosen by the creator. **Priority P1 · Effort L**

12. **Creator directory — `/creators`**  
    Current surface: directory and creator map with profiles, travel context, connection, and messaging.  
    **Idea: saved discovery searches.** Add filters for niche, language, platform, destination window, collaboration format, availability, and audience band; allow members to save a search and receive privacy-preserving match alerts. **Priority P0 · Effort L**

13. **Community chat — `/chat/:channel`**  
    Current surface: channels, media, reactions, polls, game events, resources, and read state.  
    **Idea: threaded conversations and answer summaries.** Add replies, thread subscriptions, accepted answers for practical questions, and an administrator-generated summary that links back to source messages. **Priority P1 · Effort L**

14. **Direct messages — `/messages` and `/messages/:conversationId`**  
    Current surface: conversations, connection requests, message media, reactions, and realtime updates.  
    **Idea: consent inbox and safety toolkit.** Separate messages from connections and message requests; add block, mute, report, attachment scanning status, and clear controls for who may initiate contact. **Priority P0 · Effort L**

15. **Challenges — `/challenges`**  
    Current surface: active/past challenge discovery, participation state, results, and rewards.  
    **Idea: personalised challenge fit.** Rank briefs using the creator's platforms, destinations, content niches, past entries, and availability, with an explanation of why each challenge fits. **Priority P1 · Effort M**

16. **Challenge detail — `/challenges/:id`**  
    Current surface: brief, rules, prizes, eligible platforms, deadline, entry, and results.  
    **Idea: preflight submission checker.** Before entry, validate link accessibility, platform, publish date, required hashtags/disclosures, aspect ratio/duration metadata, and deadline; produce a reusable checklist without altering content. **Priority P0 · Effort L**

17. **Rewards — `/rewards`**  
    Current surface: earned rewards and reward state.  
    **Idea: payout ledger and document vault.** Show pending/approved/paid stages, expected payment dates, currency conversion, invoices, receipts, tax-document reminders, and an auditable dispute path. **Priority P0 · Effort L**

18. **Resources — `/resources`**  
    Current surface: categorised tips, briefs, brand rules, assets, authors, and bookmarks.  
    **Idea: searchable learning paths.** Add full-text search, content versioning, “updated since you read it,” role/platform learning collections, completion state, and short knowledge checks for mandatory brand rules. **Priority P1 · Effort L**

19. **Events — `/events`**  
    Current surface: upcoming dates, challenge deadlines, calendar export, RSVPs, polls, ratings, and suggestions.  
    **Idea: event operations suite.** Add capacity/waitlists, timezone-safe reminders, QR attendance, streaming links, post-event recordings, and attendance-based feedback while preserving opt-in visibility. **Priority P1 · Effort L**

20. **Jobs — `/jobs`**  
    Current surface: community-first vacancies and applications.  
    **Idea: creator-to-role matching and application tracker.** Explain fit using profile evidence, support saved applications, show stage/status and next steps, and let creators reuse a controlled portfolio rather than re-entering details. **Priority P1 · Effort L**

21. **Refer — `/refer`**  
    Current surface: invite link, direct referral, and referral progress.  
    **Idea: referral milestone journey.** Show consented milestones—invite opened, application started, approved, first qualifying submission—plus reminder controls and transparent reward eligibility. **Priority P1 · Effort M**

22. **Collaboration — `/collab`**  
    Current surface: post a trip, discover overlapping travel, express interest, and review past trips.  
    **Idea: collaboration planner.** Turn a match into a private plan with availability windows, timezone overlap, content concepts, task ownership, meeting point, safety check-in, and mutual visibility controls. **Priority P0 · Effort L**

23. **Connections — `/connections`**  
    Current surface: incoming requests, current network, and suggested creators.  
    **Idea: relationship follow-up assistant.** Let members privately tag how they met, set a follow-up reminder, record collaboration topics, and receive explainable suggested introductions without exposing private notes. **Priority P2 · Effort M**

24. **Daily game — `/game`**  
    Current surface: daily travel puzzles across flags, maps, airports, currencies, and countries.  
    **Idea: seasons and cooperative leagues.** Add verified daily attempts, streak recovery rules, private creator teams, seasonal themes, accessibility modes, and reward only server-validated outcomes. **Priority P1 · Effort L**

25. **Leaderboard — `/leaderboard`**  
    Current surface: programme/community rankings and results.  
    **Idea: transparent segmented leaderboards.** Let members compare by period, challenge, platform, game mode, and cohort; explain scoring and display confidence/eligibility so high-volume creators do not dominate every view. **Priority P1 · Effort M**

26. **Notifications — `/notifications`**  
    Current surface: notification history and mark-all-read.  
    **Idea: smart notification inbox.** Group related activity, add filters and per-item actions, support snooze and daily/weekly digests, and explain why each notification was sent. **Priority P0 · Effort M**

27. **Settings — `/settings`**  
    Current surface: display, account, privacy, notifications, payment details, export/deletion, and admin settings.  
    **Idea: account security centre.** Show active sessions/devices, recent security events, passkeys, recovery methods, global sign-out, login alerts, and the status of data-export/deletion requests. **Priority P0 · Effort L**

28. **Feedback — `/feedback`**  
    Current surface: submit bugs/ideas and view personal reports.  
    **Idea: transparent feedback lifecycle.** Add duplicate suggestions, attachments with redaction guidance, status and staff responses, votes on public ideas, and an opt-in roadmap link while keeping sensitive bug reports private. **Priority P1 · Effort M**

29. **Creator dashboard — `/dashboard`**  
    Current surface: challenge performance, rewards, submissions, and programme highlights.  
    **Idea: personal growth analytics.** Add period comparisons, platform/content breakdown, challenge conversion, audience-normalised benchmarks, goals, and recommendations that link directly to the underlying submission or brief. **Priority P0 · Effort L**

## Administration pages

30. **Admin home — `/admin`**  
    Current surface: headline programme statistics and links for creators, challenges, rewards/invoices, analytics, and feedback.  
    **Idea: prioritised operations command centre.** Build one attention queue for applications, expiring challenges, unpaid rewards, failed emails, unresolved feedback, anomalous activity, and scheduled announcements, with owner and due date. **Priority P0 · Effort L**

31. **Applications — `/admin/applications`**  
    Current surface: approve or decline creator applications.  
    **Idea: structured review rubric.** Add configurable scoring, evidence links, conflict-of-interest flags, blind-review mode, duplicate detection, second-review thresholds, and decision templates with appeal tracking. **Priority P0 · Effort L**

32. **Creators — `/admin/creators`**  
    Current surface: creator detail, submissions, private notes, rewards, conversations, export, and account actions.  
    **Idea: cohort segmentation and reversible bulk actions.** Save segments by status, activity, geography, platform, and risk; support carefully previewed bulk outreach/status changes with undo windows and complete audit records. **Priority P0 · Effort L**

33. **Challenges list — `/admin/challenges`**  
    Current surface: create, publish, close, and archive challenges.  
    **Idea: challenge templates and lifecycle automation.** Duplicate a proven challenge, schedule state changes, require a launch checklist, detect date conflicts, and compare predicted versus actual participation. **Priority P1 · Effort M**

34. **Challenge editor — `/admin/challenges/new` and `/admin/challenges/:id/edit`**  
    Current surface: brief basics, dates, platforms, and prize breakdown.  
    **Idea: creator-view preview and policy validation.** Preview every responsive state, validate totals/dates/rules, test links, check accessibility/readability, manage translations, and publish a versioned brief change log. **Priority P0 · Effort L**

35. **Challenge results — `/admin/challenges/:id/results`**  
    Current surface: generate/rank results and publish announcements.  
    **Idea: judging, anomaly, and appeals workflow.** Support multiple judges, weighted criteria, blind scoring, disagreement resolution, duplicate/fraud signals, locked finalisation, creator feedback, and time-bounded appeals. **Priority P0 · Effort L**

36. **Rewards and invoices — `/admin/rewards`**  
    Current surface: rewards, payment details, distribution, invoice generation/download/email, and export.  
    **Idea: approval-controlled payout batches.** Validate payee data, separate preparer and approver, preview totals, lock exchange rates, detect duplicates, reconcile payment references, and expose an exception queue. **Priority P0 · Effort L**

37. **Programme analytics — `/admin/analytics`**  
    Current surface: application funnel, community health, activity, engagement, challenge metrics, and CSV export.  
    **Idea: cohort retention and funnel explorer.** Filter by join cohort, referral source, platform, geography, and approval reviewer; compare funnels and retention while applying minimum cohort sizes for privacy. **Priority P1 · Effort L**

38. **Challenge analytics — `/admin/analytics/:id`**  
    Current surface: entries/views by platform, leaderboard, and all submissions.  
    **Idea: benchmark and attribution workspace.** Compare with similar challenges, separate organic/paid reach, track cost per valid entry and prize ROI, annotate campaign changes, and export a shareable executive summary. **Priority P1 · Effort L**

39. **Network analytics — `/admin/network`**  
    Current surface: connection totals, most-connected creators, and recent connections.  
    **Idea: community graph health.** Detect isolated cohorts, clusters, one-sided request patterns, and collaboration bridges; recommend consent-based introductions and measure whether introductions produce activity. **Priority P1 · Effort L**

40. **Admin events — `/admin/events`**  
    Current surface: manage programme events alongside challenge dates.  
    **Idea: recurring event series and attendance operations.** Add recurrence, capacity, hosts, venue/stream details, reminder sequences, RSVP questions, attendance import, follow-up resources, and cancellation workflows. **Priority P1 · Effort L**

41. **Admin resources — `/admin/resources`**  
    Current surface: publish and manage creator resources.  
    **Idea: governed content publishing.** Add drafts, review/approval, scheduled publishing, versions, expiry, audience targeting, mandatory acknowledgements, broken-link checks, and usage analytics. **Priority P1 · Effort L**

42. **Admin jobs — `/admin/jobs`**  
    Current surface: create jobs and manage applications/conversations.  
    **Idea: applicant pipeline with scorecards.** Add stages, owners, structured interview rubrics, anonymised screening, consented portfolio sharing, templated communications, SLA reminders, and equal-opportunity metrics. **Priority P1 · Effort L**

43. **Admin referrals — `/admin/referrals`**  
    Current surface: referral relationships, lead follow-up, qualifying progress, and export.  
    **Idea: attribution and incentive rules engine.** Define qualification windows, prevent self/duplicate attribution, resolve disputes, issue milestone rewards, and show a full evidence trail for each credited referral. **Priority P1 · Effort M**

44. **Admin email — `/admin/email`**  
    Current surface: creator address list, welcome-email outbox approval, preview, and send actions.  
    **Idea: governed lifecycle messaging.** Add reusable versioned templates, test sends, audience previews, unsubscribe/suppression handling, approval, delivery/bounce status, and experiment reporting with minimum sample safeguards. **Priority P0 · Effort L**

45. **Audit log — `/admin/audit`**  
    Current surface: record of administrator account actions.  
    **Idea: tamper-evident audit investigations.** Add chained integrity hashes or an append-only sink, rich filters, before/after values with sensitive-field redaction, saved investigations, exports, and alerts for high-risk actions. **Priority P0 · Effort L**

46. **Scheduled announcements — `/admin/scheduled`**  
    Current surface: schedule future channel announcements and notifications.  
    **Idea: communications calendar with collision controls.** Show all campaigns/events/deadlines in recipient timezones, estimate audience, detect overlapping sends, require preview/approval, and provide pause/cancel with delivery receipts. **Priority P1 · Effort M**

47. **What's new — `/admin/whats-new`**  
    Current surface: announce product improvements in announcements and creator notifications.  
    **Idea: targeted product changelog.** Target by role/cohort/platform, attach walkthroughs, require acknowledgement for material workflow changes, measure reads/adoption, and automatically archive entries into a searchable changelog. **Priority P2 · Effort M**

48. **Admin feedback — `/admin/feedback`**  
    Current surface: creator bug reports and ideas with profile context.  
    **Idea: triage and service-level workflow.** Add duplicate clustering, severity/impact, assignee, SLA, internal/public comments, linked releases, reporter updates, and a security-sensitive queue with restricted access. **Priority P0 · Effort L**

49. **Admin notes — `/admin/notes`**  
    Current surface: private team notes, weekly questions, plans, playbooks, rich formatting, and ordering.  
    **Idea: linked operations wiki.** Add version history, comments/mentions, granular permissions, templates, backlinks to creators/challenges/events, action items, search, and retention controls. **Priority P1 · Effort L**

## Cross-platform idea

50. **All authenticated pages**  
    Current surface: navigation is route-based and data is distributed across creators, content, challenges, events, messaging, and administration.  
    **Idea: permission-aware global command palette and search.** Search only records the caller is authorised to see, jump to pages, run safe shortcuts, resume recent work, and expose keyboard/mobile quick actions. Index public and private content separately and enforce authorization again when opening a result. **Priority P0 · Effort L**

## Suggested sequencing

- **Foundation:** security centre, message consent/safety, server-validated games, governed admin workflows, audit integrity, and notification/email controls.
- **Creator value:** daily action plan, challenge preflight, creator discovery, collaboration planning, payout visibility, and personal analytics.
- **Scale:** structured application/judging workflows, operations command centre, cohort analytics, governed resources, global search, and automation.

The strongest near-term product bundle is ideas 9, 14, 16, 17, 26, 27, 30, 31, 35, and 45: it improves creator clarity while reducing operational and trust risk.
