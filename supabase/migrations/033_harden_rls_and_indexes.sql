-- 033_harden_rls_and_indexes.sql
-- Database hardening (Supabase linter findings). Three parts:
--   1. Pin search_path on public.set_accepted_at() (mutable search_path lint).
--   2. auth_rls_initplan: rewrite RLS policies so bare auth.uid() calls become
--      (select auth.uid()), letting the planner evaluate them once per query
--      (InitPlan) instead of once per row. Expressions are otherwise identical
--      to the current pg_policies definitions. 33 policies.
--   3. Covering indexes for 15 unindexed foreign key columns.

-- Part 1: pin search_path on trigger function
alter function public.set_accepted_at() set search_path = public;

-- Part 2: RLS initplan fixes (33 policies)

alter policy "connections: connect as yourself" on public.connections
  with check (((creator_id = (select auth.uid())) AND can_post()));

alter policy "connections: disconnect own" on public.connections
  using ((creator_id = (select auth.uid())));

alter policy "conversations: participants delete" on public.conversations
  using (((participant_a = (select auth.uid())) OR (participant_b = (select auth.uid()))));

alter policy "conversations: participants read" on public.conversations
  using (((participant_a = (select auth.uid())) OR (participant_b = (select auth.uid()))));

alter policy "conversations: participants update" on public.conversations
  using (((participant_a = (select auth.uid())) OR (participant_b = (select auth.uid()))));

alter policy "conversations: start as yourself" on public.conversations
  with check ((((participant_a = (select auth.uid())) OR (participant_b = (select auth.uid()))) AND can_post()));

alter policy "creator_photos: manage own" on public.creator_photos
  using ((creator_id = (select auth.uid())))
  with check ((creator_id = (select auth.uid())));

alter policy "creator_photos: read for members" on public.creator_photos
  using (((creator_id = (select auth.uid())) OR is_member()));

alter policy "creator_private: insert own" on public.creator_private
  with check ((id = (select auth.uid())));

alter policy "creator_private: read own or admin" on public.creator_private
  using (((id = (select auth.uid())) OR is_admin()));

alter policy "creator_private: update own" on public.creator_private
  using ((id = (select auth.uid())))
  with check ((id = (select auth.uid())));

alter policy "dms: participants read" on public.direct_messages
  using (((sender_id = (select auth.uid())) OR (recipient_id = (select auth.uid()))));

alter policy "dms: recipient marks read" on public.direct_messages
  using ((recipient_id = (select auth.uid())))
  with check ((recipient_id = (select auth.uid())));

alter policy "dms: send as yourself" on public.direct_messages
  with check (((sender_id = (select auth.uid())) AND can_post() AND (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = direct_messages.conversation_id) AND ((c.participant_a = (select auth.uid())) OR (c.participant_b = (select auth.uid()))))))));

alter policy "feedback: insert own" on public.feedback
  with check ((creator_id = (select auth.uid())));

alter policy "feedback: read own or admin" on public.feedback
  using (((creator_id = (select auth.uid())) OR is_admin()));

alter policy "game_scores: insert own" on public.game_scores
  with check (((player_id = (select auth.uid())) AND can_post()));

alter policy "messages: send" on public.messages
  with check (((sender_id = (select auth.uid())) AND can_post() AND ((channel <> 'announcements'::text) OR is_admin())));

alter policy "notifications: mark own read" on public.notifications
  using ((recipient_id = (select auth.uid())))
  with check ((recipient_id = (select auth.uid())));

alter policy "notifications: read own" on public.notifications
  using ((recipient_id = (select auth.uid())));

alter policy "poll_votes: change own vote" on public.poll_votes
  using ((voter_id = (select auth.uid())));

alter policy "poll_votes: vote as yourself" on public.poll_votes
  with check (((voter_id = (select auth.uid())) AND can_post()));

alter policy "profiles: read for members" on public.profiles
  using (((id = (select auth.uid())) OR is_member()));

alter policy "profiles: update own" on public.profiles
  using ((id = (select auth.uid())))
  with check ((id = (select auth.uid())));

alter policy "push: manage own" on public.push_subscriptions
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy "reactions: add own" on public.reactions
  with check (((creator_id = (select auth.uid())) AND can_post()));

alter policy "reactions: remove own" on public.reactions
  using ((creator_id = (select auth.uid())));

alter policy "referrals: create own" on public.referrals
  with check (((referrer_id = (select auth.uid())) AND can_post()));

alter policy "referrals: read own or admin" on public.referrals
  using (((referrer_id = (select auth.uid())) OR is_admin()));

alter policy "rewards: read own" on public.rewards
  using (((creator_id = (select auth.uid())) OR is_admin()));

alter policy "submissions: create own" on public.submissions
  with check (((creator_id = (select auth.uid())) AND can_post() AND (EXISTS ( SELECT 1
   FROM challenges c
  WHERE ((c.id = submissions.challenge_id) AND (c.status = 'active'::text))))));

alter policy "submissions: delete own" on public.submissions
  using ((creator_id = (select auth.uid())));

alter policy "submissions: update own caption" on public.submissions
  using ((creator_id = (select auth.uid())))
  with check ((creator_id = (select auth.uid())));

-- Part 3: FK covering indexes (15)
create index if not exists idx_admin_audit_log_actor_id on public.admin_audit_log(actor_id);
create index if not exists idx_challenge_reminders_sent_creator_id on public.challenge_reminders_sent(creator_id);
create index if not exists idx_challenges_created_by on public.challenges(created_by);
create index if not exists idx_conversations_participant_b on public.conversations(participant_b);
create index if not exists idx_creator_admin_notes_updated_by on public.creator_admin_notes(updated_by);
create index if not exists idx_email_campaigns_sent_by on public.email_campaigns(sent_by);
create index if not exists idx_events_created_by on public.events(created_by);
create index if not exists idx_feedback_creator_id on public.feedback(creator_id);
create index if not exists idx_game_events_created_by on public.game_events(created_by);
create index if not exists idx_jobs_created_by on public.jobs(created_by);
create index if not exists idx_messages_birthday_for on public.messages(birthday_for);
create index if not exists idx_polls_created_by on public.polls(created_by);
create index if not exists idx_resources_created_by on public.resources(created_by);
create index if not exists idx_scheduled_announcements_created_by on public.scheduled_announcements(created_by);
create index if not exists idx_wall_of_fame_updated_by on public.wall_of_fame(updated_by);
