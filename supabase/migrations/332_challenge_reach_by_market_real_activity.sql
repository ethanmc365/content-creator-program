-- 332 (4 Oct 2026): "WHO HAS NOT POSTED YET", REBUILT - market by market, from every sign of life, with emails for the ones the push cannot reach.
--
-- Ethan: "I notice it said Naomi hasn't been on in like 15 days, even though she's been active every day ... Properly rebuild this to
-- ensure it's all working correctly and has no leaks." Also: market by market with the participation-by-market look; clicking a market shows
-- who took part and who did not, with a push to retry; and for the ones who never opened the app a button to copy their emails, because they
-- cannot get a push.
--
-- THE LAST-SEEN FIX. `profiles.last_seen_at` is a heartbeat the open app writes; a creator whose phone puts the app to sleep, or who opens it
-- once and reads, can go days without one. "Last on" is now the LATEST of every sign of life the platform keeps: the heartbeat, the last
-- sign-in, the last room or conversation read, and the last push they tapped. Somebody who read a room yesterday is not "15 days away".

create or replace function public.challenge_reach(p_challenge uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare ch public.challenges; v_start timestamptz; v_net boolean; v_out jsonb;
begin
  if not public.is_admin() then raise exception 'Only the team can see this.'; end if;
  select * into ch from public.challenges where id = p_challenge;
  if ch.id is null then return null; end if;
  v_start := coalesce(ch.start_date, now());
  v_net := ch.community_id is null or exists (select 1 from public.communities c where c.id = ch.community_id and c.kind = 'network');
  with act as (
    select id as pid, max(t) as at from (
      select id, last_seen_at as t from public.profiles
      -- a sign-in counts as a visit only if it came after the account was made: signing up is not opening the app
      union all select id, case when last_sign_in_at > created_at + interval '1 hour' then last_sign_in_at end from auth.users
      union all select user_id, last_read_at from public.channel_reads
      union all select profile_id, last_read_at from public.conversation_members
      union all select recipient_id, created_at from public.push_events where event = 'clicked'
    ) x where t is not null group by id
  ), aud as (
    select p.id, p.name, p.photo_url, p.created_at, a.at as active_at,
           coalesce(h.name, 'Rest of the world') as market, coalesce(h.country_codes, '{}') as codes,
           exists (select 1 from public.submissions s where s.creator_id = p.id and s.challenge_id = p_challenge) as posted,
           exists (select 1 from public.push_subscriptions ps where ps.user_id = p.id) as push
      from public.profiles p
      left join act a on a.pid = p.id
      left join lateral (select c.name, c.country_codes from public.community_members m join public.communities c on c.id = m.community_id
                          where m.profile_id = p.id and m.is_home and m.status = 'active' and c.kind = 'chapter' limit 1) h on true
     where p.status = 'active' and not p.is_admin and not p.is_test and not coalesce(p.is_sandbox, false)
       and p.deletion_requested_at is null
       and (v_net or exists (select 1 from public.community_members cm where cm.profile_id = p.id and cm.community_id = ch.community_id and cm.status = 'active'))
  ), seg as (
    select a.*, case when posted then 'posted' when active_at >= v_start then 'seen' when active_at is not null then 'dormant' else 'never' end as state from aud a
  )
  select jsonb_build_object(
    'started', v_start,
    'audience', count(*),
    'posted', count(*) filter (where state = 'posted'),
    'seen', count(*) filter (where active_at >= v_start),
    'seen_not_posted', count(*) filter (where state = 'seen'),
    'dormant', count(*) filter (where state = 'dormant'),
    'never', count(*) filter (where state = 'never'),
    'push', count(*) filter (where push),
    'push_not_posted', count(*) filter (where push and not posted),
    'joined_since', count(*) filter (where created_at >= v_start),
    'markets', (select coalesce(jsonb_agg(jsonb_build_object('name', market, 'codes', codes, 'audience', n, 'seen', seen, 'posted', posted, 'seen_not_posted', snp, 'dormant', dor, 'never', nev) order by (market = 'Rest of the world'), n desc), '[]'::jsonb)
                  from (select market, (jsonb_agg(to_jsonb(codes)))->0 as codes, count(*) n, count(*) filter (where active_at >= v_start) seen,
                               count(*) filter (where state = 'posted') posted, count(*) filter (where state = 'seen') snp,
                               count(*) filter (where state = 'dormant') dor, count(*) filter (where state = 'never') nev
                          from seg group by market) m),
    'people', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'photo', photo_url, 'market', market, 'state', state,
                                                           'active_at', active_at, 'joined', created_at, 'push', push)
                                         order by (state = 'posted'), active_at desc nulls last), '[]'::jsonb) from seg))
    into v_out from seg;
  return v_out;
end $function$;
revoke execute on function public.challenge_reach(uuid) from public, anon;
grant execute on function public.challenge_reach(uuid) to authenticated;

-- A push to one group who have not entered, optionally within one market. 'seen' / 'dormant' / 'never' / 'all' (everyone who has not entered).
drop function if exists public.challenge_nudge(uuid, text, text, text);
create or replace function public.challenge_nudge(p_challenge uuid, p_segment text, p_title text, p_body text, p_market text default null)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare ch public.challenges; v_start timestamptz; v_net boolean; v_n int;
begin
  if not public.is_admin() then raise exception 'Only the team can send this.'; end if;
  if p_segment not in ('seen', 'dormant', 'never', 'all') then raise exception 'Unknown group.'; end if;
  if btrim(coalesce(p_title, '')) = '' or btrim(coalesce(p_body, '')) = '' then raise exception 'Write a title and a message.'; end if;
  select * into ch from public.challenges where id = p_challenge;
  if ch.id is null then raise exception 'No such challenge.'; end if;
  v_start := coalesce(ch.start_date, now());
  v_net := ch.community_id is null or exists (select 1 from public.communities c where c.id = ch.community_id and c.kind = 'network');
  with act as (
    select id as pid, max(t) as at from (
      select id, last_seen_at as t from public.profiles
      -- a sign-in counts as a visit only if it came after the account was made: signing up is not opening the app
      union all select id, case when last_sign_in_at > created_at + interval '1 hour' then last_sign_in_at end from auth.users
      union all select user_id, last_read_at from public.channel_reads
      union all select profile_id, last_read_at from public.conversation_members
      union all select recipient_id, created_at from public.push_events where event = 'clicked'
    ) x where t is not null group by id
  ), who as (
    select p.id from public.profiles p
      left join act a on a.pid = p.id
     where p.status = 'active' and not p.is_admin and not p.is_test and not coalesce(p.is_sandbox, false) and p.deletion_requested_at is null
       and (v_net or exists (select 1 from public.community_members cm where cm.profile_id = p.id and cm.community_id = ch.community_id and cm.status = 'active'))
       and not exists (select 1 from public.submissions s where s.creator_id = p.id and s.challenge_id = p_challenge)
       and (p_market is null or coalesce((select c.name from public.community_members m join public.communities c on c.id = m.community_id
                                            where m.profile_id = p.id and m.is_home and m.status = 'active' and c.kind = 'chapter' limit 1), 'Rest of the world') = p_market)
       and case p_segment
             when 'seen' then a.at >= v_start
             when 'dormant' then a.at < v_start
             when 'never' then a.at is null
             else true end
  ), ins as (
    insert into public.notifications (recipient_id, type, title, body, link)
    select id, 'challenge', left(btrim(p_title), 70), left(btrim(p_body), 300), '/challenges/' || p_challenge from who returning 1)
  select count(*) into v_n from ins;
  return v_n;
end $function$;
revoke execute on function public.challenge_nudge(uuid, text, text, text, text) from public, anon;
grant execute on function public.challenge_nudge(uuid, text, text, text, text) to authenticated;

-- The email addresses of one group who have not entered, for the ones a push cannot reach. Admin only; the addresses never ride along in
-- the main numbers.
create or replace function public.challenge_reach_emails(p_challenge uuid, p_segment text, p_market text default null)
 returns text[]
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare ch public.challenges; v_start timestamptz; v_net boolean;
begin
  if not public.is_admin() then raise exception 'Only the team can see this.'; end if;
  select * into ch from public.challenges where id = p_challenge;
  if ch.id is null then return '{}'; end if;
  v_start := coalesce(ch.start_date, now());
  v_net := ch.community_id is null or exists (select 1 from public.communities c where c.id = ch.community_id and c.kind = 'network');
  return coalesce((
    with act as (
      select id as pid, max(t) as at from (
        select id, last_seen_at as t from public.profiles
        -- a sign-in counts as a visit only if it came after the account was made: signing up is not opening the app
      union all select id, case when last_sign_in_at > created_at + interval '1 hour' then last_sign_in_at end from auth.users
        union all select user_id, last_read_at from public.channel_reads
        union all select profile_id, last_read_at from public.conversation_members
        union all select recipient_id, created_at from public.push_events where event = 'clicked'
      ) x where t is not null group by id
    )
    select array_agg(distinct u.email order by u.email)
      from public.profiles p
      join auth.users u on u.id = p.id
      left join act a on a.pid = p.id
     where p.status = 'active' and not p.is_admin and not p.is_test and not coalesce(p.is_sandbox, false) and p.deletion_requested_at is null
       and u.email is not null
       and (v_net or exists (select 1 from public.community_members cm where cm.profile_id = p.id and cm.community_id = ch.community_id and cm.status = 'active'))
       and not exists (select 1 from public.submissions s where s.creator_id = p.id and s.challenge_id = p_challenge)
       and (p_market is null or coalesce((select c.name from public.community_members m join public.communities c on c.id = m.community_id
                                            where m.profile_id = p.id and m.is_home and m.status = 'active' and c.kind = 'chapter' limit 1), 'Rest of the world') = p_market)
       and case p_segment
             when 'seen' then a.at >= v_start
             when 'dormant' then a.at < v_start
             when 'never' then a.at is null
             else true end
  ), '{}');
end $function$;
revoke execute on function public.challenge_reach_emails(uuid, text, text) from public, anon;
grant execute on function public.challenge_reach_emails(uuid, text, text) to authenticated;
