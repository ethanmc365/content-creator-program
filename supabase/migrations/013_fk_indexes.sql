-- ============================================================================
-- 013 - indexes on hot / cascade-critical foreign keys
-- Speeds up joins, per-creator lookups, and the cascade when an account is
-- deleted (admin_delete_creator -> auth.users -> profiles -> everything).
-- ============================================================================
create index if not exists idx_submissions_creator on public.submissions (creator_id);
create index if not exists idx_submissions_challenge on public.submissions (challenge_id);
create index if not exists idx_rewards_creator on public.rewards (creator_id);
create index if not exists idx_rewards_challenge on public.rewards (challenge_id);
create index if not exists idx_results_creator on public.results (creator_id);
create index if not exists idx_game_scores_player on public.game_scores (player_id);
create index if not exists idx_messages_sender on public.messages (sender_id);
create index if not exists idx_dms_sender on public.direct_messages (sender_id);
create index if not exists idx_reactions_creator on public.reactions (creator_id);
create index if not exists idx_poll_votes_voter on public.poll_votes (voter_id);
create index if not exists idx_poll_votes_option on public.poll_votes (option_id);
create index if not exists idx_poll_options_poll on public.poll_options (poll_id);
create index if not exists idx_connections_connected on public.connections (connected_creator_id);
create index if not exists idx_referrals_referrer on public.referrals (referrer_id);
create index if not exists idx_profiles_referred_by on public.profiles (referred_by);
create index if not exists idx_push_subscriptions_user on public.push_subscriptions (user_id);
create index if not exists idx_messages_poll on public.messages (poll_id);
create index if not exists idx_messages_game_event on public.messages (game_event_id);
create index if not exists idx_messages_resource on public.messages (resource_id);
