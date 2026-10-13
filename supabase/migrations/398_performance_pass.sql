-- 398: performance pass before the move to Tryp.com infrastructure (13 Oct 2026)
--
-- Measured on production first (pg_stat_statements since the 7 Oct restart):
--
-- 1. ROOM MESSAGES took ~110 ms per load for a plain creator (5,900 loads = 11
--    minutes of database time). The read policies on `messages` called five
--    SECURITY DEFINER helpers PER ROW (channel_is_vip twice, vip_room_ok,
--    channel_community_of, vip_room_key_ok -> vip_hides_announcements,
--    vip_my_kind, vip_has_access). The rewrite asks the per-user questions ONCE
--    per query (initplans: the `(select f())` form) and turns the per-row part
--    into array membership, so the answer is identical and the cost no longer
--    grows with the number of messages. Same answer, proved by the rehearsal
--    that compares every user's visible rows before and after.
--
-- 2. reconcile_milestones took 2.2 s per run: milestone_progress_internal
--    called milestone_state_internal six times per creator. Now once.
--
-- 3. Three duplicate indexes (the advisor's duplicate_index) dropped.
--
-- 4. Every foreign key gets a covering index. The tables are small today; they
--    will not be after the Tryp.com onboarding, and deleting a profile (the
--    nightly purge) otherwise scans every one of ~70 referencing tables.

-- ---------------------------------------------------------------------------
-- 1. Room reads
-- ---------------------------------------------------------------------------

-- The VIP room-key rule as a pure function of its inputs, so a policy can feed
-- it per-user values computed once. Not SECURITY DEFINER and no SET clause:
-- that is what lets the planner inline it.
create or replace function public.vip_room_key_allowed(
  p_key text, p_has_access boolean, p_kind text, p_hides boolean
) returns boolean
language sql immutable parallel safe
as $$
  select case
    when coalesce(p_key, '') like 'official%' then p_has_access or p_kind = 'official'
    when coalesce(p_key, '') in ('vip', 'vip_announcements', 'vip_global') and p_kind = 'official' and not p_has_access then false
    else not p_hides or coalesce(p_key, '') in ('introductions', 'vip', 'vip_announcements', 'vip_global', 'official')
  end
$$;

-- vip_room_key_ok keeps its signature and answer; the rule now lives in one place.
CREATE OR REPLACE FUNCTION public.vip_room_key_ok(p_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.vip_room_key_allowed(p_key, public.vip_has_access(), public.vip_my_kind(), public.vip_hides_announcements())
$function$;

-- Channels that are VIP rooms (any viewer).
create or replace function public.vip_channel_ids()
returns uuid[] language sql stable security definer set search_path to 'public'
as $$ select coalesce(array_agg(id), '{}') from public.channels where visibility = 'vip' $$;

-- VIP rooms the caller may open (was: channel_is_vip(x) and vip_room_ok(channel_community_of(x))).
create or replace function public.my_vip_room_channel_ids()
returns uuid[] language sql stable security definer set search_path to 'public'
as $$
  select coalesce(array_agg(id), '{}') from public.channels
   where visibility = 'vip' and public.vip_room_ok(community_id)
$$;

-- Channels whose messages the caller may read through market membership. This
-- is exactly the old `exists (select 1 from channels ch where ...)` in the
-- messages policy, INCLUDING what the channels table's own policies added to it
-- (that subquery ran under channels RLS): readable via channels_read or
-- channels_manage, and passing both restrictive VIP policies.
create or replace function public.my_open_channel_ids()
returns uuid[] language plpgsql stable security definer set search_path to 'public'
as $$
declare
  -- Each per-user answer is asked once, not once per channel.
  v_scopes     uuid[]  := array(select public.my_scopes());
  v_managed    uuid[]  := array(select public.my_managed_scopes());
  v_has_access boolean := public.vip_has_access();
  v_kind       text    := public.vip_my_kind();
  v_hides      boolean := public.vip_hides_announcements();
begin
  return coalesce((
    select array_agg(ch.id)
      from public.channels ch
     where (ch.visibility = 'scope'
            or (ch.visibility <> 'vip' and ch.community_id = any (v_managed))
            or (ch.visibility = 'vip' and public.vip_room_ok(ch.community_id)))
       and (ch.community_id = any (v_scopes) or ch.community_id = any (v_managed))
       and (ch.key <> 'announcements' or not v_hides)
       and public.vip_room_key_allowed(ch.key, v_has_access, v_kind, v_hides)
  ), '{}');
end
$$;

alter policy "messages: read in rooms you can open" on public.messages using (
  ((select public.is_admin()) and not coalesce(channel_id = any ((select public.vip_channel_ids())::uuid[]), false))
  or coalesce(channel_id = any ((select public.my_vip_room_channel_ids())::uuid[]), false)
  or (community_id in (select public.my_scopes())
      and (channel_id is null or channel_id = any ((select public.my_open_channel_ids())::uuid[])))
);

alter policy "vips see introductions and vip rooms" on public.messages using (
  public.vip_room_key_allowed(public.channel_key(channel),
    (select public.vip_has_access()), (select public.vip_my_kind()), (select public.vip_hides_announcements()))
);

alter policy "vips post in introductions and vip rooms" on public.messages with check (
  public.vip_room_key_allowed(public.channel_key(channel),
    (select public.vip_has_access()), (select public.vip_my_kind()), (select public.vip_hides_announcements()))
);

alter policy "vips see introductions and vip rooms" on public.channels using (
  public.vip_room_key_allowed(key,
    (select public.vip_has_access()), (select public.vip_my_kind()), (select public.vip_hides_announcements()))
);

-- ---------------------------------------------------------------------------
-- 2. Milestones: state worked out once per creator
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.milestone_progress_internal(p_profile uuid)
 RETURNS TABLE(id uuid, title text, description text, reward text, reward_kind text, role_title text, icon text, sort_order integer, criteria jsonb, met boolean, reached boolean, blocked boolean, reached_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me   uuid := p_profile;
  v_role text;
  v_home uuid;
  v_rows int;
  v_gets text;
  v_state jsonb;
  m      record;
  a      record;
begin
  if v_me is null then return; end if;

  -- AN EMPTY STATE MEANS "COULD NOT COMPUTE", NOT "EARNED NOTHING". See 185.
  -- The state is worked out ONCE per call and read back below (it used to be
  -- recomputed six times per creator, which made the half-hourly reconcile cost
  -- seconds). Nothing this function writes feeds back into it.
  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into v_state
    from public.milestone_state_internal(v_me) s;
  v_rows := jsonb_array_length(v_state);
  if v_rows = 0 and exists (select 1 from public.milestones where is_active) then
    return;
  end if;

  for a in
    insert into public.creator_milestones (profile_id, milestone_id)
    select v_me, g.id from jsonb_to_recordset(v_state) as g(id uuid, title text, description text, reward text, reward_kind text, role_title text, icon text, sort_order integer, criteria jsonb, met boolean, reached boolean, blocked boolean) where g.reached
    on conflict do nothing
    returning milestone_id
  loop
    select ms.title, ms.role_title, ms.voucher_amount, ms.voucher_currency, ms.items
      into m
      from public.milestones ms where ms.id = a.milestone_id;

    -- Everything the stop gives, said once: "the title Senior Creator, a EUR 20
    -- voucher and a Tryp.com hoodie".
    select string_agg(x, ', ') into v_gets from (
      select 'the title ' || m.role_title as x where coalesce(m.role_title, '') <> ''
      union all
      select 'a ' || case when m.voucher_currency = 'GBP' then '£' else '€' end || trim(to_char(m.voucher_amount, 'FM999999990.##')) || ' Tryp.com voucher'
       where coalesce(m.voucher_amount, 0) > 0
      union all
      select i ->> 'label' from jsonb_array_elements(coalesce(m.items, '[]'::jsonb)) i where coalesce(i ->> 'label', '') <> ''
    ) parts;

    perform public.notify_user(
      v_me, 'reward',
      'Milestone reached: ' || m.title,
      case when v_gets is not null
        then 'You earned ' || v_gets || '.'
        else 'You reached "' || m.title || '". Have a look at what is next.'
      end,
      '/milestones'
    );
  end loop;

  delete from public.creator_milestones cm
  where cm.profile_id = v_me
    and exists (select 1 from public.milestones ms where ms.id = cm.milestone_id and ms.is_active)
    and not exists (select 1 from jsonb_to_recordset(v_state) as g(id uuid, title text, description text, reward text, reward_kind text, role_title text, icon text, sort_order integer, criteria jsonb, met boolean, reached boolean, blocked boolean) where g.id = cm.milestone_id and g.reached);

  select cm2.community_id into v_home
    from public.community_members cm2
   where cm2.profile_id = v_me and cm2.role = 'creator'
   order by cm2.joined_at nulls last limit 1;

  -- The voucher, whatever the stop's headline kind says.
  for m in
    select g.id as ms_id, g.title as ms_title, ms.voucher_amount as amt, ms.voucher_currency as cur
    from jsonb_to_recordset(v_state) as g(id uuid, title text, description text, reward text, reward_kind text, role_title text, icon text, sort_order integer, criteria jsonb, met boolean, reached boolean, blocked boolean)
    join public.milestones ms on ms.id = g.id
    where g.reached
      and coalesce(ms.voucher_amount, 0) > 0
      and not exists (
        select 1 from public.rewards r
         where r.creator_id = v_me and r.milestone_id = g.id
      )
  loop
    insert into public.rewards
      (creator_id, challenge_id, community_id, milestone_id, reward_type, amount,
       currency, status, source, payment_notes)
    values
      (v_me, null, v_home, m.ms_id, 'voucher', m.amt,
       coalesce(m.cur, 'EUR'), 'pending', 'milestone',
       'Milestone reward: ' || m.ms_title)
    on conflict do nothing;
  end loop;

  delete from public.rewards r
  where r.creator_id = v_me
    and r.source = 'milestone'
    and r.status = 'pending'
    and r.distributed_at is null
    and r.milestone_id is not null
    and not exists (
      select 1 from jsonb_to_recordset(v_state) as g(id uuid, title text, description text, reward text, reward_kind text, role_title text, icon text, sort_order integer, criteria jsonb, met boolean, reached boolean, blocked boolean) where g.id = r.milestone_id and g.reached
    );

  -- The title, whatever the stop's headline kind says.
  select g.role_title into v_role
    from jsonb_to_recordset(v_state) as g(id uuid, title text, description text, reward text, reward_kind text, role_title text, icon text, sort_order integer, criteria jsonb, met boolean, reached boolean, blocked boolean)
   where g.reached and coalesce(g.role_title, '') <> ''
   order by g.sort_order desc limit 1;

  update public.profiles p set earned_role = v_role
   where p.id = v_me and p.earned_role is distinct from v_role;

  return query
  select g.id, g.title, g.description, g.reward, g.reward_kind,
         g.role_title, g.icon, g.sort_order, g.criteria, g.met, g.reached, g.blocked,
         cm.reached_at
  from jsonb_to_recordset(v_state) as g(id uuid, title text, description text, reward text, reward_kind text, role_title text, icon text, sort_order integer, criteria jsonb, met boolean, reached boolean, blocked boolean)
  left join public.creator_milestones cm
    on cm.milestone_id = g.id and cm.profile_id = v_me
  order by g.sort_order, g.id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Duplicate indexes (each pair is identical; the kept one is named first)
-- ---------------------------------------------------------------------------
drop index if exists public.idx_audit_recent;                     -- = idx_audit_created
drop index if exists public.notifications_recipient_created_idx;  -- = idx_notifications_recipient
drop index if exists public.uq_join_request_open;                 -- = market_join_requests_one_open

-- ---------------------------------------------------------------------------
-- 4. A covering index for every foreign key
-- ---------------------------------------------------------------------------
create index if not exists agreement_acceptances_profile_id_fk_idx on public.agreement_acceptances (profile_id);
create index if not exists agreements_created_by_fk_idx on public.agreements (created_by);
create index if not exists agreements_programme_id_fk_idx on public.agreements (programme_id);
create index if not exists app_updates_created_by_fk_idx on public.app_updates (created_by);
create index if not exists certificate_awards_awarded_by_fk_idx on public.certificate_awards (awarded_by);
create index if not exists certificate_awards_challenge_id_fk_idx on public.certificate_awards (challenge_id);
create index if not exists certificate_awards_community_id_fk_idx on public.certificate_awards (community_id);
create index if not exists certificate_awards_milestone_id_fk_idx on public.certificate_awards (milestone_id);
create index if not exists certificate_designs_created_by_fk_idx on public.certificate_designs (created_by);
create index if not exists certificate_designs_milestone_id_fk_idx on public.certificate_designs (milestone_id);
create index if not exists challenge_boosts_created_by_fk_idx on public.challenge_boosts (created_by);
create index if not exists challenge_collabs_challenge_id_fk_idx on public.challenge_collabs (challenge_id);
create index if not exists challenge_collabs_requester_id_fk_idx on public.challenge_collabs (requester_id);
create index if not exists challenge_history_challenge_id_fk_idx on public.challenge_history (challenge_id);
create index if not exists challenge_history_created_by_fk_idx on public.challenge_history (created_by);
create index if not exists challenge_participation_marks_creator_id_fk_idx on public.challenge_participation_marks (creator_id);
create index if not exists challenge_templates_community_id_fk_idx on public.challenge_templates (community_id);
create index if not exists challenge_templates_created_by_fk_idx on public.challenge_templates (created_by);
create index if not exists challenge_voucher_day_wins_creator_id_fk_idx on public.challenge_voucher_day_wins (creator_id);
create index if not exists challenge_voucher_day_wins_reward_id_fk_idx on public.challenge_voucher_day_wins (reward_id);
create index if not exists challenge_voucher_day_wins_submission_id_fk_idx on public.challenge_voucher_day_wins (submission_id);
create index if not exists challenge_voucher_days_created_by_fk_idx on public.challenge_voucher_days (created_by);
create index if not exists client_error_seen_profile_id_fk_idx on public.client_error_seen (profile_id);
create index if not exists client_errors_resolved_by_fk_idx on public.client_errors (resolved_by);
create index if not exists communities_lead_id_fk_idx on public.communities (lead_id);
create index if not exists community_invites_created_by_fk_idx on public.community_invites (created_by);
create index if not exists connection_notes_author_id_fk_idx on public.connection_notes (author_id);
create index if not exists content_translations_reviewed_by_fk_idx on public.content_translations (reviewed_by);
create index if not exists conversation_invites_invited_by_fk_idx on public.conversation_invites (invited_by);
create index if not exists conversations_created_by_fk_idx on public.conversations (created_by);
create index if not exists creator_kit_assets_created_by_fk_idx on public.creator_kit_assets (created_by);
create index if not exists creator_milestones_items_sent_by_fk_idx on public.creator_milestones (items_sent_by);
create index if not exists creator_milestones_milestone_id_fk_idx on public.creator_milestones (milestone_id);
create index if not exists creator_reports_reported_id_fk_idx on public.creator_reports (reported_id);
create index if not exists creator_reports_reviewed_by_fk_idx on public.creator_reports (reviewed_by);
create index if not exists direct_messages_submission_id_fk_idx on public.direct_messages (submission_id);
create index if not exists dm_reactions_creator_id_fk_idx on public.dm_reactions (creator_id);
create index if not exists email_outbox_decided_by_fk_idx on public.email_outbox (decided_by);
create index if not exists email_send_log_campaign_id_fk_idx on public.email_send_log (campaign_id);
create index if not exists email_send_log_recipient_id_fk_idx on public.email_send_log (recipient_id);
create index if not exists email_templates_updated_by_fk_idx on public.email_templates (updated_by);
create index if not exists event_poll_slots_poll_id_fk_idx on public.event_poll_slots (poll_id);
create index if not exists event_poll_votes_creator_id_fk_idx on public.event_poll_votes (creator_id);
create index if not exists event_polls_created_by_fk_idx on public.event_polls (created_by);
create index if not exists event_ratings_creator_id_fk_idx on public.event_ratings (creator_id);
create index if not exists event_rsvps_user_id_fk_idx on public.event_rsvps (user_id);
create index if not exists event_suggestions_creator_id_fk_idx on public.event_suggestions (creator_id);
create index if not exists faq_questions_answered_by_fk_idx on public.faq_questions (answered_by);
create index if not exists faq_questions_asker_id_fk_idx on public.faq_questions (asker_id);
create index if not exists faq_questions_faq_id_fk_idx on public.faq_questions (faq_id);
create index if not exists faqs_created_by_fk_idx on public.faqs (created_by);
create index if not exists hooks_created_by_fk_idx on public.hooks (created_by);
create index if not exists invoices_decided_by_fk_idx on public.invoices (decided_by);
create index if not exists invoices_submitted_by_fk_idx on public.invoices (submitted_by);
create index if not exists kpi_targets_created_by_fk_idx on public.kpi_targets (created_by);
create index if not exists kpi_targets_updated_by_fk_idx on public.kpi_targets (updated_by);
create index if not exists market_join_requests_challenge_id_fk_idx on public.market_join_requests (challenge_id);
create index if not exists market_join_requests_decided_by_fk_idx on public.market_join_requests (decided_by);
create index if not exists market_join_requests_profile_id_fk_idx on public.market_join_requests (profile_id);
create index if not exists message_reports_author_id_fk_idx on public.message_reports (author_id);
create index if not exists message_reports_dm_id_fk_idx on public.message_reports (dm_id);
create index if not exists message_reports_message_id_fk_idx on public.message_reports (message_id);
create index if not exists message_reports_reviewed_by_fk_idx on public.message_reports (reviewed_by);
create index if not exists point_awards_awarded_by_fk_idx on public.point_awards (awarded_by);
create index if not exists point_awards_rule_id_fk_idx on public.point_awards (rule_id);
create index if not exists point_awards_submission_id_fk_idx on public.point_awards (submission_id);
create index if not exists profiles_team_invite_id_fk_idx on public.profiles (team_invite_id);
create index if not exists resource_bookmarks_creator_id_fk_idx on public.resource_bookmarks (creator_id);
create index if not exists results_group_id_fk_idx on public.results (group_id);
create index if not exists rewards_milestone_id_fk_idx on public.rewards (milestone_id);
create index if not exists rewards_used_by_fk_idx on public.rewards (used_by);
create index if not exists submission_bonus_claims_creator_id_fk_idx on public.submission_bonus_claims (creator_id);
create index if not exists submission_disqualifications_challenge_id_fk_idx on public.submission_disqualifications (challenge_id);
create index if not exists submission_disqualifications_creator_id_fk_idx on public.submission_disqualifications (creator_id);
create index if not exists submission_disqualifications_disqualified_by_fk_idx on public.submission_disqualifications (disqualified_by);
create index if not exists submission_duplicates_creator_id_fk_idx on public.submission_duplicates (creator_id);
create index if not exists submission_feedback_author_id_fk_idx on public.submission_feedback (author_id);
create index if not exists survey_responses_profile_id_fk_idx on public.survey_responses (profile_id);
create index if not exists surveys_challenge_id_fk_idx on public.surveys (challenge_id);
create index if not exists surveys_created_by_fk_idx on public.surveys (created_by);
create index if not exists team_invites_created_by_fk_idx on public.team_invites (created_by);
create index if not exists tracked_videos_added_by_fk_idx on public.tracked_videos (added_by);
create index if not exists tracked_videos_creator_id_fk_idx on public.tracked_videos (creator_id);
create index if not exists tracked_videos_history_id_fk_idx on public.tracked_videos (history_id);
create index if not exists translations_updated_by_fk_idx on public.translations (updated_by);
create index if not exists vip_announcements_created_by_fk_idx on public.vip_announcements (created_by);
create index if not exists vip_bonus_awards_profile_id_fk_idx on public.vip_bonus_awards (profile_id);
create index if not exists vip_bonus_awards_statement_id_fk_idx on public.vip_bonus_awards (statement_id);
create index if not exists vip_bonus_rules_created_by_fk_idx on public.vip_bonus_rules (created_by);
create index if not exists vip_bonus_rules_month_id_fk_idx on public.vip_bonus_rules (month_id);
create index if not exists vip_briefs_created_by_fk_idx on public.vip_briefs (created_by);
create index if not exists vip_briefs_programme_id_fk_idx on public.vip_briefs (programme_id);
create index if not exists vip_events_actor_id_fk_idx on public.vip_events (actor_id);
create index if not exists vip_guides_created_by_fk_idx on public.vip_guides (created_by);
create index if not exists vip_guides_programme_id_fk_idx on public.vip_guides (programme_id);
create index if not exists vip_invites_created_by_fk_idx on public.vip_invites (created_by);
create index if not exists vip_invites_programme_id_fk_idx on public.vip_invites (programme_id);
create index if not exists vip_kpi_targets_created_by_fk_idx on public.vip_kpi_targets (created_by);
create index if not exists vip_ledger_created_by_fk_idx on public.vip_ledger (created_by);
create index if not exists vip_ledger_month_id_fk_idx on public.vip_ledger (month_id);
create index if not exists vip_ledger_reward_id_fk_idx on public.vip_ledger (reward_id);
create index if not exists vip_managers_added_by_fk_idx on public.vip_managers (added_by);
create index if not exists vip_members_created_by_fk_idx on public.vip_members (created_by);
create index if not exists vip_perks_created_by_fk_idx on public.vip_perks (created_by);
create index if not exists vip_perks_programme_id_fk_idx on public.vip_perks (programme_id);
create index if not exists vip_requirement_reviews_decided_by_fk_idx on public.vip_requirement_reviews (decided_by);
create index if not exists vip_requirement_reviews_profile_id_fk_idx on public.vip_requirement_reviews (profile_id);
create index if not exists vip_requirement_reviews_programme_id_fk_idx on public.vip_requirement_reviews (programme_id);
create index if not exists vip_sheet_history_created_by_fk_idx on public.vip_sheet_history (created_by);
create index if not exists vip_sheet_history_profile_id_fk_idx on public.vip_sheet_history (profile_id);
create index if not exists vip_statements_approved_by_fk_idx on public.vip_statements (approved_by);
create index if not exists vip_statements_invoice_id_fk_idx on public.vip_statements (invoice_id);
create index if not exists vip_statements_programme_id_fk_idx on public.vip_statements (programme_id);
create index if not exists vip_statements_reward_id_fk_idx on public.vip_statements (reward_id);
create index if not exists vip_video_claims_created_by_fk_idx on public.vip_video_claims (created_by);
create index if not exists vip_video_claims_decided_by_fk_idx on public.vip_video_claims (decided_by);
create index if not exists vip_videos_disqualified_by_fk_idx on public.vip_videos (disqualified_by);
create index if not exists voucher_nudges_sent_creator_id_fk_idx on public.voucher_nudges_sent (creator_id);

select public.lock_down_definer_functions();
