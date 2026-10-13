-- 407: merge duplicate permissive policies (advisor "multiple_permissive_policies", audit M3).
--
-- 38 tables each had an "admin manage" policy FOR ALL plus a member policy per command, so Postgres evaluated two
-- policies on every read. Here the admin test is folded into the member policy for that command
-- ("<member rule> OR is_admin()") and admin-only commands get their own policy; the FOR ALL policy goes.
-- Access is identical by construction (permissive policies are OR-ed); the rehearsal compared every table's
-- visible row count for the QA creator, VIP and admin before and after. Generated from pg_policies, not retyped.
-- agreement_translations is left alone (its read policy is split by role).

-- app_settings
alter policy "app_settings: read public flags" on public.app_settings using (((key = ANY (ARRAY['tour_enabled'::text, 'referral_reward'::text]))) or (select is_admin()));
create policy "app_settings: admin insert" on public.app_settings as permissive for insert to authenticated with check ((select is_admin()));
create policy "app_settings: admin update" on public.app_settings as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "app_settings: admin delete" on public.app_settings as permissive for delete to authenticated using ((select is_admin()));
drop policy "app_settings: admin all" on public.app_settings;

-- app_updates
alter policy "updates: read" on public.app_updates using (((published OR ( SELECT is_admin() AS gate))) or (select is_admin()));
create policy "app_updates: admin insert" on public.app_updates as permissive for insert to authenticated with check ((select is_admin()));
create policy "app_updates: admin update" on public.app_updates as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "app_updates: admin delete" on public.app_updates as permissive for delete to authenticated using ((select is_admin()));
drop policy "updates: team writes" on public.app_updates;

-- certificate_awards
alter policy "creators read their certificates" on public.certificate_awards using (((( SELECT is_admin() AS is_admin) OR ((profile_id = ( SELECT auth.uid() AS uid)) AND ( SELECT certificates_live() AS certificates_live)))) or (select is_admin()));
create policy "certificate_awards: admin insert" on public.certificate_awards as permissive for insert to authenticated with check ((select is_admin()));
alter policy "creators mark their certificates seen" on public.certificate_awards using (((profile_id = ( SELECT auth.uid() AS uid))) or (select is_admin())) with check (((profile_id = ( SELECT auth.uid() AS uid))) or (select is_admin()));
create policy "certificate_awards: admin delete" on public.certificate_awards as permissive for delete to authenticated using ((select is_admin()));
drop policy "admins manage awards" on public.certificate_awards;

-- certificate_designs
alter policy "creators read live designs" on public.certificate_designs using (((is_active OR ( SELECT is_admin() AS is_admin))) or (select is_admin()));
create policy "certificate_designs: admin insert" on public.certificate_designs as permissive for insert to authenticated with check ((select is_admin()));
create policy "certificate_designs: admin update" on public.certificate_designs as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "certificate_designs: admin delete" on public.certificate_designs as permissive for delete to authenticated using ((select is_admin()));
drop policy "admins manage designs" on public.certificate_designs;

-- challenge_boosts
alter policy "boosts: read" on public.challenge_boosts using ((true) or (select is_admin()));
create policy "challenge_boosts: admin insert" on public.challenge_boosts as permissive for insert to authenticated with check ((select is_admin()));
create policy "challenge_boosts: admin update" on public.challenge_boosts as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "challenge_boosts: admin delete" on public.challenge_boosts as permissive for delete to authenticated using ((select is_admin()));
drop policy "boosts: admins write" on public.challenge_boosts;

-- challenge_group_members
alter policy "challenge_group_members_read" on public.challenge_group_members using ((true) or (select is_admin()));
create policy "challenge_group_members: admin insert" on public.challenge_group_members as permissive for insert to authenticated with check ((select is_admin()));
create policy "challenge_group_members: admin update" on public.challenge_group_members as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "challenge_group_members: admin delete" on public.challenge_group_members as permissive for delete to authenticated using ((select is_admin()));
drop policy "challenge_group_members_manage" on public.challenge_group_members;

-- challenge_groups
alter policy "challenge_groups_read" on public.challenge_groups using ((true) or (select is_admin()));
create policy "challenge_groups: admin insert" on public.challenge_groups as permissive for insert to authenticated with check ((select is_admin()));
create policy "challenge_groups: admin update" on public.challenge_groups as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "challenge_groups: admin delete" on public.challenge_groups as permissive for delete to authenticated using ((select is_admin()));
drop policy "challenge_groups_manage" on public.challenge_groups;

-- challenge_history
alter policy "challenge_history: admins read" on public.challenge_history using ((( SELECT is_admin() AS gate)) or (select is_admin()));
create policy "challenge_history: admin insert" on public.challenge_history as permissive for insert to authenticated with check ((select is_admin()));
create policy "challenge_history: admin update" on public.challenge_history as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "challenge_history: admin delete" on public.challenge_history as permissive for delete to authenticated using ((select is_admin()));
drop policy "challenge_history: admins write" on public.challenge_history;

-- challenge_voucher_days
alter policy "voucher days: read" on public.challenge_voucher_days using ((true) or (select is_admin()));
create policy "challenge_voucher_days: admin insert" on public.challenge_voucher_days as permissive for insert to authenticated with check ((select is_admin()));
create policy "challenge_voucher_days: admin update" on public.challenge_voucher_days as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "challenge_voucher_days: admin delete" on public.challenge_voucher_days as permissive for delete to authenticated using ((select is_admin()));
drop policy "voucher days: admins write" on public.challenge_voucher_days;

-- challenges
alter policy "challenges: read published" on public.challenges using (((( SELECT is_admin() AS gate) OR (( SELECT is_member() AS gate) AND (status <> 'draft'::text) AND ((community_id IS NULL) OR (community_id IN ( SELECT my_scopes() AS my_scopes)) OR (status = 'archived'::text))))) or (select is_admin()));
create policy "challenges: admin insert" on public.challenges as permissive for insert to authenticated with check ((select is_admin()));
create policy "challenges: admin update" on public.challenges as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "challenges: admin delete" on public.challenges as permissive for delete to authenticated using ((select is_admin()));
drop policy "challenges: admin manage" on public.challenges;

-- creator_admin_notes
create policy "creator_admin_notes: admin read" on public.creator_admin_notes as permissive for select to authenticated using ((select is_admin()));
create policy "creator_admin_notes: admin insert" on public.creator_admin_notes as permissive for insert to authenticated with check ((select is_admin()));
create policy "creator_admin_notes: admin update" on public.creator_admin_notes as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "creator_admin_notes: admin delete" on public.creator_admin_notes as permissive for delete to authenticated using ((select is_admin()));
drop policy "admin notes: admins only" on public.creator_admin_notes;

-- creator_kit_assets
alter policy "creators read active kit" on public.creator_kit_assets using (((is_active OR ( SELECT is_admin() AS is_admin))) or (select is_admin()));
create policy "creator_kit_assets: admin insert" on public.creator_kit_assets as permissive for insert to authenticated with check ((select is_admin()));
create policy "creator_kit_assets: admin update" on public.creator_kit_assets as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "creator_kit_assets: admin delete" on public.creator_kit_assets as permissive for delete to authenticated using ((select is_admin()));
drop policy "admins manage kit" on public.creator_kit_assets;

-- creator_milestones
alter policy "creator_milestones_read" on public.creator_milestones using ((true) or (select is_admin()));
create policy "creator_milestones: admin insert" on public.creator_milestones as permissive for insert to authenticated with check ((select is_admin()));
create policy "creator_milestones: admin update" on public.creator_milestones as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "creator_milestones: admin delete" on public.creator_milestones as permissive for delete to authenticated using ((select is_admin()));
drop policy "creator_milestones_write" on public.creator_milestones;

-- email_campaigns
create policy "email_campaigns: admin read" on public.email_campaigns as permissive for select to authenticated using ((select is_admin()));
create policy "email_campaigns: admin insert" on public.email_campaigns as permissive for insert to authenticated with check ((select is_admin()));
create policy "email_campaigns: admin update" on public.email_campaigns as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "email_campaigns: admin delete" on public.email_campaigns as permissive for delete to authenticated using ((select is_admin()));
drop policy "email_campaigns: admin only" on public.email_campaigns;

-- event_poll_slots
alter policy "event_poll_slots: members read" on public.event_poll_slots using ((( SELECT is_member() AS gate)) or (select is_admin()));
create policy "event_poll_slots: admin insert" on public.event_poll_slots as permissive for insert to authenticated with check ((select is_admin()));
create policy "event_poll_slots: admin update" on public.event_poll_slots as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "event_poll_slots: admin delete" on public.event_poll_slots as permissive for delete to authenticated using ((select is_admin()));
drop policy "event_poll_slots: admin write" on public.event_poll_slots;

-- event_polls
alter policy "event_polls: members read" on public.event_polls using ((( SELECT is_member() AS gate)) or (select is_admin()));
create policy "event_polls: admin insert" on public.event_polls as permissive for insert to authenticated with check ((select is_admin()));
create policy "event_polls: admin update" on public.event_polls as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "event_polls: admin delete" on public.event_polls as permissive for delete to authenticated using ((select is_admin()));
drop policy "event_polls: admin write" on public.event_polls;

-- events
alter policy "events: read for members" on public.events using ((( SELECT is_member() AS gate)) or (select is_admin()));
alter policy "events: own personal insert" on public.events with check ((((owner_id = ( SELECT auth.uid() AS uid)) AND ( SELECT can_post() AS gate))) or (select is_admin()));
alter policy "events: own personal update" on public.events using (((owner_id = ( SELECT auth.uid() AS uid))) or (select is_admin())) with check (((owner_id = ( SELECT auth.uid() AS uid))) or (select is_admin()));
alter policy "events: own personal delete" on public.events using (((owner_id = ( SELECT auth.uid() AS uid))) or (select is_admin()));
drop policy "events: admin manage" on public.events;

-- faq_questions
alter policy "faq_questions: read" on public.faq_questions using ((((asker_id = ( SELECT auth.uid() AS uid)) OR (is_public AND (status = 'answered'::text) AND ( SELECT is_member() AS gate)) OR ( SELECT is_admin() AS gate))) or (select is_admin()));
alter policy "faq_questions: ask" on public.faq_questions with check ((((asker_id = ( SELECT auth.uid() AS uid)) AND ( SELECT can_post() AS gate) AND (status = 'open'::text) AND (answer IS NULL) AND (NOT is_public))) or (select is_admin()));
alter policy "faq_questions: asker edits open" on public.faq_questions using ((((asker_id = ( SELECT auth.uid() AS uid)) AND (status = 'open'::text))) or (select is_admin())) with check ((((asker_id = ( SELECT auth.uid() AS uid)) AND (status = 'open'::text) AND (answer IS NULL) AND (NOT is_public))) or (select is_admin()));
alter policy "faq_questions: asker withdraws open" on public.faq_questions using ((((asker_id = ( SELECT auth.uid() AS uid)) AND (status = 'open'::text))) or (select is_admin()));
drop policy "faq_questions: admins" on public.faq_questions;

-- faqs
alter policy "faqs: members read published" on public.faqs using ((((published AND ( SELECT is_member() AS gate)) OR ( SELECT is_admin() AS gate))) or (select is_admin()));
create policy "faqs: admin insert" on public.faqs as permissive for insert to authenticated with check ((select is_admin()));
create policy "faqs: admin update" on public.faqs as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "faqs: admin delete" on public.faqs as permissive for delete to authenticated using ((select is_admin()));
drop policy "faqs: admins write" on public.faqs;

-- game_events
alter policy "game_events: read for members" on public.game_events using ((( SELECT is_member() AS gate)) or (select is_admin()));
create policy "game_events: admin insert" on public.game_events as permissive for insert to authenticated with check ((select is_admin()));
create policy "game_events: admin update" on public.game_events as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "game_events: admin delete" on public.game_events as permissive for delete to authenticated using ((select is_admin()));
drop policy "game_events: admin manage" on public.game_events;

-- invoices
alter policy "invoices: own read" on public.invoices using ((((creator_id = ( SELECT auth.uid() AS uid)) AND (stage = ANY (ARRAY['sent'::text, 'paid'::text])))) or (select is_admin()));
create policy "invoices: admin insert" on public.invoices as permissive for insert to authenticated with check ((select is_admin()));
create policy "invoices: admin update" on public.invoices as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "invoices: admin delete" on public.invoices as permissive for delete to authenticated using ((select is_admin()));
drop policy "invoices: admin all" on public.invoices;

-- jobs
alter policy "jobs: read open or admin" on public.jobs using ((((( SELECT is_member() AS gate) AND (status = 'open'::text)) OR ( SELECT is_admin() AS gate))) or (select is_admin()));
create policy "jobs: admin insert" on public.jobs as permissive for insert to authenticated with check ((select is_admin()));
create policy "jobs: admin update" on public.jobs as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "jobs: admin delete" on public.jobs as permissive for delete to authenticated using ((select is_admin()));
drop policy "jobs: admin manage" on public.jobs;

-- milestone_criteria
alter policy "criteria readable" on public.milestone_criteria using ((true) or (select is_admin()));
create policy "milestone_criteria: admin insert" on public.milestone_criteria as permissive for insert to authenticated with check ((select is_admin()));
create policy "milestone_criteria: admin update" on public.milestone_criteria as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "milestone_criteria: admin delete" on public.milestone_criteria as permissive for delete to authenticated using ((select is_admin()));
drop policy "criteria admin" on public.milestone_criteria;

-- milestones
alter policy "milestones_read" on public.milestones using (((is_active OR ( SELECT is_admin() AS gate))) or (select is_admin()));
create policy "milestones: admin insert" on public.milestones as permissive for insert to authenticated with check ((select is_admin()));
create policy "milestones: admin update" on public.milestones as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "milestones: admin delete" on public.milestones as permissive for delete to authenticated using ((select is_admin()));
drop policy "milestones_write" on public.milestones;

-- poll_options
alter policy "poll_options: read for members" on public.poll_options using ((( SELECT is_member() AS gate)) or (select is_admin()));
create policy "poll_options: admin insert" on public.poll_options as permissive for insert to authenticated with check ((select is_admin()));
create policy "poll_options: admin update" on public.poll_options as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "poll_options: admin delete" on public.poll_options as permissive for delete to authenticated using ((select is_admin()));
drop policy "poll_options: admin manage" on public.poll_options;

-- polls
alter policy "polls: read for members" on public.polls using ((( SELECT is_member() AS gate)) or (select is_admin()));
create policy "polls: admin insert" on public.polls as permissive for insert to authenticated with check ((select is_admin()));
create policy "polls: admin update" on public.polls as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "polls: admin delete" on public.polls as permissive for delete to authenticated using ((select is_admin()));
drop policy "polls: admin manage" on public.polls;

-- referrals
alter policy "referrals: read own or admin" on public.referrals using ((((referrer_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS gate))) or (select is_admin()));
alter policy "referrals: create own" on public.referrals with check ((((referrer_id = ( SELECT auth.uid() AS uid)) AND ( SELECT can_post() AS gate))) or (select is_admin()));
create policy "referrals: admin update" on public.referrals as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "referrals: admin delete" on public.referrals as permissive for delete to authenticated using ((select is_admin()));
drop policy "referrals: admin manage" on public.referrals;

-- resources
alter policy "resources: read for members" on public.resources using ((( SELECT is_member() AS gate)) or (select is_admin()));
create policy "resources: admin insert" on public.resources as permissive for insert to authenticated with check ((select is_admin()));
create policy "resources: admin update" on public.resources as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "resources: admin delete" on public.resources as permissive for delete to authenticated using ((select is_admin()));
drop policy "resources: admin manage" on public.resources;

-- results
alter policy "results: read for members" on public.results using (((( SELECT is_member() AS gate) AND (( SELECT is_admin() AS gate) OR (creator_id = ( SELECT auth.uid() AS uid)) OR (NOT (creator_id = ANY (( SELECT test_creator_ids() AS gate)::uuid[])))))) or (select is_admin()));
create policy "results: admin insert" on public.results as permissive for insert to authenticated with check ((select is_admin()));
create policy "results: admin update" on public.results as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "results: admin delete" on public.results as permissive for delete to authenticated using ((select is_admin()));
drop policy "results: admin manage" on public.results;

-- rewards
alter policy "rewards: read own" on public.rewards using ((((creator_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS gate))) or (select is_admin()));
create policy "rewards: admin insert" on public.rewards as permissive for insert to authenticated with check ((select is_admin()));
create policy "rewards: admin update" on public.rewards as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "rewards: admin delete" on public.rewards as permissive for delete to authenticated using ((select is_admin()));
drop policy "rewards: admin manage" on public.rewards;

-- scheduled_announcements
create policy "scheduled_announcements: admin read" on public.scheduled_announcements as permissive for select to authenticated using ((select is_admin()));
create policy "scheduled_announcements: admin insert" on public.scheduled_announcements as permissive for insert to authenticated with check ((select is_admin()));
create policy "scheduled_announcements: admin update" on public.scheduled_announcements as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "scheduled_announcements: admin delete" on public.scheduled_announcements as permissive for delete to authenticated using ((select is_admin()));
drop policy "scheduled announcements: admins only" on public.scheduled_announcements;

-- streak_freezes
alter policy "streak_freezes_read" on public.streak_freezes using ((true) or (select is_admin()));
create policy "streak_freezes: admin insert" on public.streak_freezes as permissive for insert to authenticated with check ((select is_admin()));
create policy "streak_freezes: admin update" on public.streak_freezes as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "streak_freezes: admin delete" on public.streak_freezes as permissive for delete to authenticated using ((select is_admin()));
drop policy "streak_freezes_admin" on public.streak_freezes;

-- submission_bonus_claims
alter policy "submission_bonus_claims_read" on public.submission_bonus_claims using ((true) or (select is_admin()));
alter policy "submission_bonus_claims_own" on public.submission_bonus_claims with check ((((creator_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM ((submissions s
     JOIN point_rules r ON ((r.id = submission_bonus_claims.rule_id)))
     JOIN challenges c ON ((c.id = s.challenge_id)))
  WHERE ((s.id = submission_bonus_claims.submission_id) AND (s.creator_id = ( SELECT auth.uid() AS uid)) AND (s.challenge_id = submission_bonus_claims.challenge_id) AND (r.challenge_id = s.challenge_id) AND (r.kind = 'bonus'::text) AND r.is_active AND (NULLIF(btrim(COALESCE(r.prompt, ''::text)), ''::text) IS NOT NULL) AND (c.status = 'active'::text) AND ((r.starts_at IS NULL) OR (s.submitted_at >= r.starts_at)) AND ((r.ends_at IS NULL) OR (s.submitted_at <= r.ends_at))))))) or (select is_admin()));
create policy "submission_bonus_claims: admin update" on public.submission_bonus_claims as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
alter policy "submission_bonus_claims_own_delete" on public.submission_bonus_claims using ((((creator_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS gate))) or (select is_admin()));
drop policy "submission_bonus_claims_admin" on public.submission_bonus_claims;

-- submission_feedback
alter policy "entry feedback: mine or team" on public.submission_feedback using (((( SELECT is_admin() AS gate) OR (EXISTS ( SELECT 1
   FROM submissions s
  WHERE ((s.id = submission_feedback.submission_id) AND (s.creator_id = ( SELECT auth.uid() AS uid))))))) or (select is_admin()));
create policy "submission_feedback: admin insert" on public.submission_feedback as permissive for insert to authenticated with check ((select is_admin()));
create policy "submission_feedback: admin update" on public.submission_feedback as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "submission_feedback: admin delete" on public.submission_feedback as permissive for delete to authenticated using ((select is_admin()));
drop policy "entry feedback: team writes" on public.submission_feedback;

-- submissions
alter policy "submissions: read for members" on public.submissions using (((( SELECT is_member() AS gate) AND (( SELECT is_admin() AS gate) OR (creator_id = ( SELECT auth.uid() AS uid)) OR (NOT (creator_id = ANY (( SELECT test_creator_ids() AS gate)::uuid[])))))) or (select is_admin()));
alter policy "submissions: create own" on public.submissions with check ((((creator_id = ( SELECT auth.uid() AS uid)) AND ( SELECT can_post() AS gate) AND (EXISTS ( SELECT 1
   FROM challenges c
  WHERE ((c.id = submissions.challenge_id) AND (c.status = 'active'::text)))))) or (select is_admin()));
alter policy "submissions: update own caption" on public.submissions using (((creator_id = ( SELECT auth.uid() AS uid))) or (select is_admin())) with check (((creator_id = ( SELECT auth.uid() AS uid))) or (select is_admin()));
alter policy "submissions: delete own" on public.submissions using (((creator_id = ( SELECT auth.uid() AS uid))) or (select is_admin()));
drop policy "submissions: admin manage" on public.submissions;

-- surveys
alter policy "surveys: creators read their live ones" on public.surveys using ((survey_is_for(id, ( SELECT auth.uid() AS uid))) or (select is_admin()));
create policy "surveys: admin insert" on public.surveys as permissive for insert to authenticated with check ((select is_admin()));
create policy "surveys: admin update" on public.surveys as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "surveys: admin delete" on public.surveys as permissive for delete to authenticated using ((select is_admin()));
drop policy "surveys: admins manage" on public.surveys;

-- tracked_videos
alter policy "tracked_videos_read" on public.tracked_videos using ((( SELECT is_admin() AS gate)) or (select is_admin()));
create policy "tracked_videos: admin insert" on public.tracked_videos as permissive for insert to authenticated with check ((select is_admin()));
create policy "tracked_videos: admin update" on public.tracked_videos as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "tracked_videos: admin delete" on public.tracked_videos as permissive for delete to authenticated using ((select is_admin()));
drop policy "tracked_videos_write" on public.tracked_videos;

-- view_snapshots
alter policy "view_snapshots: read for signed-in users" on public.view_snapshots using ((true) or (select is_admin()));
create policy "view_snapshots: admin insert" on public.view_snapshots as permissive for insert to authenticated with check ((select is_admin()));
create policy "view_snapshots: admin update" on public.view_snapshots as permissive for update to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "view_snapshots: admin delete" on public.view_snapshots as permissive for delete to authenticated using ((select is_admin()));
drop policy "view_snapshots: admin manage" on public.view_snapshots;
