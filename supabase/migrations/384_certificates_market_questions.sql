-- 384 (12 Oct 2026): certificates go live properly, joining another market asks real questions, the closed role stops
-- being advertised, and the old welcome voucher is gone for good.
--
-- CERTIFICATES. Ethan switched four designs live on 11 Oct and found that:
--  * "Official Creator" (award_on 'challenge_entry') matched 11 people, all from the UK: the rule only looked at
--    FINISHED challenges with winners published, so the Global Challenge and every live one were invisible to it. And it
--    was once per challenge. He wants it ONCE per creator, the moment they first post a video, live challenge or not.
--  * "Joined the community" (award_on 'creator_joined') had never been handed to the 218 creators already in.
--  * "Milestone reached" waits for its milestone (On a roll); nobody has reached it yet, the trigger is in place.
--  * VIP and official creators are their own programme. A design is for the community unless the team says otherwise
--    (`audience`: community | vip | all), switched from VIP tools. For a VIP, "first video" means their first VIP video.
--
-- JOIN ANOTHER MARKET. "Creators requesting to join other markets that don't even speak the language ... from Romania to
-- Germany without even a message." A request now carries how well they speak the market's language, what ties them to
-- it, and a real reason (20+ characters). Enforced in the table, not only the sheet: a challenge card used to insert
-- straight into the table with whatever note it liked.

-- ---------------------------------------------------------------- certificates: who a design is for
alter table public.certificate_designs
  add column if not exists audience text not null default 'community';
do $$ begin
  alter table public.certificate_designs add constraint certificate_designs_audience_check check (audience in ('community', 'vip', 'all'));
exception when duplicate_object then null; end $$;
comment on column public.certificate_designs.audience is
  'Who it is awarded to: community (default, never VIP/official creators), vip (VIP and official creators only), all.';

create or replace function public.certificate_audience_ok(p_audience text, p_profile uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case coalesce(p_audience, 'community')
    when 'all' then true
    when 'vip' then coalesce((select is_vip from public.profiles where id = p_profile), false)
    else not coalesce((select is_vip from public.profiles where id = p_profile), false)
  end
$$;

-- ---------------------------------------------------------------- the first-video certificate, once per creator
create or replace function public.award_entry_certificates_internal(p_profile uuid)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  d record;
  p public.profiles;
  made integer := 0;
  v_at timestamptz; v_ch uuid; v_title text; v_comm uuid; v_market text;
begin
  select * into p from public.profiles where id = p_profile;
  if p.id is null or coalesce(p.is_test, false) or coalesce(p.is_admin, false) then return 0; end if;
  -- Two entries sent in the same second must not both win one.
  perform pg_advisory_xact_lock(hashtext('cert_entry:' || p_profile::text));

  for d in
    select * from public.certificate_designs
    where is_active and award_on = 'challenge_entry' and public.certificate_audience_ok(audience, p_profile)
      and not exists (select 1 from public.certificate_awards a where a.design_id = certificate_designs.id and a.profile_id = p_profile)
  loop
    v_at := null; v_ch := null; v_title := null; v_comm := null; v_market := null;
    select s.submitted_at, c.id, c.title, c.community_id, com.name
      into v_at, v_ch, v_title, v_comm, v_market
    from public.submissions s
    join public.challenges c on c.id = s.challenge_id
    left join public.communities com on com.id = c.community_id
    where s.creator_id = p_profile
      and (cardinality(d.community_ids) = 0 or c.community_id = any(d.community_ids))
    order by s.submitted_at
    limit 1;

    if v_at is null and coalesce(p.is_vip, false) then
      select v.submitted_at, com.name, vp.community_id into v_at, v_market, v_comm
      from public.vip_videos v
      join public.vip_programmes vp on vp.id = v.programme_id
      left join public.communities com on com.id = vp.community_id
      where v.profile_id = p_profile and coalesce(v.status, '') <> 'disqualified'
        and (cardinality(d.community_ids) = 0 or vp.community_id = any(d.community_ids))
      order by v.submitted_at
      limit 1;
    end if;
    continue when v_at is null;

    insert into public.certificate_awards (design_id, profile_id, challenge_id, community_id, facts, serial)
    values (d.id, p_profile, v_ch, v_comm,
            jsonb_strip_nulls(jsonb_build_object('name', p.name, 'challenge', v_title, 'market', coalesce(v_market, public.creator_market_name(p_profile)), 'date', v_at)),
            public.certificate_serial())
    on conflict do nothing;
    if found then made := made + 1; end if;
  end loop;
  return made;
end $$;

create or replace function public.on_entry_certificate()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    -- Read through jsonb: PL/pgSQL does not short-circuit record fields, so naming a column one table lacks fails.
    perform public.award_entry_certificates_internal(
      (case when tg_table_name = 'vip_videos' then to_jsonb(new)->>'profile_id' else to_jsonb(new)->>'creator_id' end)::uuid);
  exception when others then
    perform public.report_system_error('certificates', 'entry-award', 'Could not award the first-video certificate: ' || coalesce(sqlerrm, 'unknown'));
  end;
  return new;
end $$;

drop trigger if exists award_entry_certificate on public.submissions;
create trigger award_entry_certificate after insert on public.submissions
  for each row execute function public.on_entry_certificate();
drop trigger if exists award_entry_certificate on public.vip_videos;
create trigger award_entry_certificate after insert on public.vip_videos
  for each row execute function public.on_entry_certificate();

-- The winners trigger no longer hands out entry certificates (once per creator now, from the entry itself).
create or replace function public.award_challenge_certificates_internal(p_challenge uuid)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare
  ch       record;
  made     integer := 0;
  before   integer;
  v_places integer;
begin
  select c.id, c.title, c.community_id, c.end_date, com.name as market_name
    into ch
  from public.challenges c
  left join public.communities com on com.id = c.community_id
  where c.id = p_challenge;
  if not found then return 0; end if;
  v_places := coalesce(public.challenge_prize_places(p_challenge), 0);

  select count(*) into before from public.certificate_awards where challenge_id = p_challenge;

  insert into public.certificate_awards
    (design_id, profile_id, challenge_id, community_id, facts, serial)
  select d.id, r.creator_id, ch.id, ch.community_id,
         jsonb_strip_nulls(jsonb_build_object(
           'name',      p.name,
           'challenge', ch.title,
           'market',    ch.market_name,
           'place',     r.rank,
           'places',    nullif(v_places, 0),
           'views',     nullif(r.final_views, 0),
           'date',      coalesce(ch.end_date, now())
         )),
         public.certificate_serial()
  from public.certificate_designs d
  join public.results r on r.challenge_id = ch.id
  join public.profiles p on p.id = r.creator_id
  where d.is_active
    and d.award_on = 'challenge_rank'
    and public.certificate_audience_ok(d.audience, r.creator_id)
    and ((r.rank = any(d.ranks) and (v_places = 0 or r.rank <= v_places)) or (d.all_prize_places and r.rank between 1 and v_places))
    and (cardinality(d.community_ids) = 0 or ch.community_id = any(d.community_ids))
  on conflict do nothing;

  select count(*) - before into made from public.certificate_awards where challenge_id = p_challenge;
  return made;
end $function$;

create or replace function public.award_joined_certificates_internal(p_profile uuid)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare
  made integer := 0;
begin
  insert into public.certificate_awards (design_id, profile_id, facts, serial)
  select d.id, p.id,
         jsonb_strip_nulls(jsonb_build_object(
           'name', p.name,
           'market', public.creator_market_name(p.id),
           'date', coalesce(p.created_at, now())
         )),
         public.certificate_serial()
  from public.certificate_designs d
  join public.profiles p on p.id = p_profile
  where d.is_active
    and d.award_on = 'creator_joined'
    and p.status = 'active'
    and not coalesce(p.is_test, false)
    and not coalesce(p.is_admin, false)
    and public.certificate_audience_ok(d.audience, p.id)
    and (cardinality(d.community_ids) = 0 or exists (
      select 1 from public.community_members m where m.profile_id = p.id and m.community_id = any(d.community_ids)))
  on conflict do nothing;
  get diagnostics made = row_count;
  return made;
end $function$;

create or replace function public.on_milestone_certificate()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  begin
    insert into public.certificate_awards
      (design_id, profile_id, milestone_id, facts, serial)
    select d.id, new.profile_id, new.milestone_id,
           jsonb_strip_nulls(jsonb_build_object(
             'name', p.name, 'milestone', m.title, 'market', public.creator_market_name(new.profile_id), 'date', new.reached_at
           )),
           public.certificate_serial()
    from public.certificate_designs d
    join public.profiles p on p.id = new.profile_id
    join public.milestones m on m.id = new.milestone_id
    where d.is_active and d.award_on = 'milestone' and d.milestone_id = new.milestone_id
      and not coalesce(p.is_test, false)
      and public.certificate_audience_ok(d.audience, new.profile_id)
    on conflict do nothing;
  exception when others then
    perform public.report_system_error(
      'certificates', 'milestone-award',
      'Could not award a milestone certificate: ' || coalesce(sqlerrm, 'unknown'));
  end;
  return new;
end $function$;

-- Who qualifies, read by the studio's "Who gets this" panel and by the backfill. Admin only now (it lists names), and it
-- carries the challenge/milestone ids so the backfill stops looking challenges up by title.
drop function if exists public.backfill_certificate_design(uuid);
drop function if exists public.certificate_candidates(uuid);
create function public.certificate_candidates(p_design uuid)
returns table(profile_id uuid, creator_name text, challenge_title text, place integer, facts jsonb, already boolean, challenge_id uuid, community_id uuid, milestone_id uuid)
language sql stable security definer set search_path to 'public' as $function$
  with d as (select * from public.certificate_designs where id = p_design and public.is_admin())
  select r.creator_id, p.name, c.title, r.rank,
         jsonb_strip_nulls(jsonb_build_object(
           'name', p.name, 'challenge', c.title, 'market', com.name,
           'place', r.rank, 'places', nullif(public.challenge_prize_places(c.id), 0),
           'views', nullif(r.final_views, 0),
           'date', coalesce(c.end_date, now())
         )),
         exists (select 1 from public.certificate_awards a
                 where a.design_id = p_design and a.profile_id = r.creator_id and a.challenge_id = c.id),
         c.id, c.community_id, null::uuid
  from d
  join public.challenges c on c.winners_published_at is not null
  join public.results r on r.challenge_id = c.id
  join public.profiles p on p.id = r.creator_id
  left join public.communities com on com.id = c.community_id
  where d.award_on = 'challenge_rank'
    and public.certificate_audience_ok(d.audience, r.creator_id)
    and ((r.rank = any(d.ranks) and (coalesce(public.challenge_prize_places(c.id), 0) = 0 or r.rank <= public.challenge_prize_places(c.id))) or (d.all_prize_places and r.rank between 1 and coalesce(public.challenge_prize_places(c.id), 0)))
    and (cardinality(d.community_ids) = 0 or c.community_id = any(d.community_ids))

  union all

  -- ONE ROW PER CREATOR: their first entry, live challenge or finished.
  select f.creator_id, p.name, f.title, null::integer,
         jsonb_strip_nulls(jsonb_build_object(
           'name', p.name, 'challenge', f.title, 'market', f.market, 'date', f.submitted_at
         )),
         exists (select 1 from public.certificate_awards a where a.design_id = p_design and a.profile_id = f.creator_id),
         f.challenge_id, f.community_id, null::uuid
  from d
  join lateral (
    select distinct on (s.creator_id) s.creator_id, s.submitted_at, c.id as challenge_id, c.title, c.community_id, com.name as market
    from public.submissions s
    join public.challenges c on c.id = s.challenge_id
    left join public.communities com on com.id = c.community_id
    where (cardinality(d.community_ids) = 0 or c.community_id = any(d.community_ids))
    order by s.creator_id, s.submitted_at
  ) f on true
  join public.profiles p on p.id = f.creator_id
  where d.award_on = 'challenge_entry'
    and not coalesce(p.is_test, false) and not coalesce(p.is_admin, false)
    and public.certificate_audience_ok(d.audience, f.creator_id)

  union all

  select cm.profile_id, p.name, m.title, null::integer,
         jsonb_strip_nulls(jsonb_build_object(
           'name', p.name, 'milestone', m.title, 'market', public.creator_market_name(p.id), 'date', cm.reached_at
         )),
         exists (select 1 from public.certificate_awards a
                 where a.design_id = p_design and a.profile_id = cm.profile_id and a.milestone_id = cm.milestone_id),
         null::uuid, null::uuid, cm.milestone_id
  from d
  join public.creator_milestones cm on cm.milestone_id = d.milestone_id
  join public.profiles p on p.id = cm.profile_id
  join public.milestones m on m.id = cm.milestone_id
  where d.award_on = 'milestone' and d.milestone_id is not null
    and not coalesce(p.is_test, false)
    and public.certificate_audience_ok(d.audience, cm.profile_id)

  union all

  select p.id, p.name, null::text, null::integer,
         jsonb_strip_nulls(jsonb_build_object(
           'name', p.name, 'market', public.creator_market_name(p.id), 'date', p.created_at
         )),
         exists (select 1 from public.certificate_awards a
                 where a.design_id = p_design and a.profile_id = p.id and a.challenge_id is null and a.milestone_id is null),
         null::uuid, null::uuid, null::uuid
  from d
  join public.profiles p on p.status = 'active' and not coalesce(p.is_test, false) and not coalesce(p.is_admin, false)
  where d.award_on = 'creator_joined'
    and public.certificate_audience_ok(d.audience, p.id)
    and (cardinality(d.community_ids) = 0 or exists (
      select 1 from public.community_members m where m.profile_id = p.id and m.community_id = any(d.community_ids)));
$function$;

create function public.backfill_certificate_design(p_design uuid)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare
  made integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can award certificates';
  end if;
  with cand as (
    select * from public.certificate_candidates(p_design) where not already
  ), ins as (
    insert into public.certificate_awards
      (design_id, profile_id, challenge_id, milestone_id, community_id, facts, serial, awarded_by)
    select p_design, c.profile_id, c.challenge_id, c.milestone_id, c.community_id,
           c.facts, public.certificate_serial(), auth.uid()
    from cand c
    on conflict do nothing
    returning 1
  )
  select count(*) into made from ins;
  return made;
end $function$;

-- A QUIET BACKFILL. Handing 200 creators two certificates each must not ring 400 bells: the award notification can be
-- held for one transaction, and one "your certificates are here" goes out per creator afterwards instead.
create or replace function public.on_certificate_awarded()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  design_title text;
begin
  if current_setting('tryp.certificates_quiet', true) = 'on' then return new; end if;
  begin
    select d.title into design_title
    from public.certificate_designs d where d.id = new.design_id;

    perform public.notify_user(
      new.profile_id,
      'reward',
      coalesce(design_title, 'You have a new certificate'),
      case
        when new.facts ? 'challenge' then
          'For ' || (new.facts->>'challenge') || '. Open it to download and share it.'
        when new.facts ? 'milestone' then
          'For reaching ' || (new.facts->>'milestone') || '. Open it to download and share it.'
        else 'Open it to download it and share it on your socials.'
      end,
      '/rewards?tab=certificates');
  exception when others then
    perform public.report_system_error(
      'certificates', 'notify',
      'Could not notify a creator about a certificate: ' || coalesce(sqlerrm, 'unknown'));
  end;
  return new;
end $function$;

-- "Took part" was switched to joining the community by Ethan; its name in the studio says so now.
update public.certificate_designs set name = 'Joined the community' where id = 'e46c1a3f-050e-4260-8304-9df3b956eef8' and name = 'Took part';

-- Hand out what the live designs owe, quietly, then one notification each.
do $$
declare r record; t0 timestamptz := now();
begin
  perform set_config('tryp.certificates_quiet', 'on', true);
  for r in select id from public.profiles where status = 'active' loop
    perform public.award_joined_certificates_internal(r.id);
  end loop;
  for r in select distinct creator_id as id from public.submissions loop
    perform public.award_entry_certificates_internal(r.id);
  end loop;
  perform set_config('tryp.certificates_quiet', 'off', true);
  if public.certificates_live() then
    for r in
      select a.profile_id, count(*) n from public.certificate_awards a
      where a.awarded_at >= t0 group by a.profile_id
    loop
      perform public.notify_user(r.profile_id, 'reward',
        case when r.n = 1 then 'Your certificate is here' else 'Your certificates are here' end,
        'Open Rewards to see them, download them and share them on Instagram or LinkedIn.',
        '/rewards?tab=certificates');
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------- joining another market: real questions
alter table public.market_join_requests
  add column if not exists language_level text,
  add column if not exists ties text[] not null default '{}';
do $$ begin
  alter table public.market_join_requests add constraint market_join_requests_language_check
    check (language_level is null or language_level in ('native', 'fluent', 'some', 'none'));
exception when duplicate_object then null; end $$;
comment on column public.market_join_requests.language_level is 'How well they say they speak the market''s language: native, fluent, some, none.';
comment on column public.market_join_requests.ties is 'What ties them to the market: live, part_time, study, work, family, audience.';

-- New requests must explain themselves, however they arrive. Admin-made rows and status changes are left alone.
create or replace function public.market_join_request_complete()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'UPDATE' and new.note is not distinct from old.note and new.language_level is not distinct from old.language_level
     and new.ties is not distinct from old.ties then
    return new;
  end if;
  if public.is_admin() or new.status <> 'pending' then return new; end if;
  if char_length(btrim(coalesce(new.note, ''))) < 20 then
    raise exception 'Tell the team why you want to join, in a sentence or two (20 characters at least).';
  end if;
  if new.language_level is null then
    raise exception 'Say how well you speak the language of that market.';
  end if;
  new.ties := coalesce((select array_agg(distinct t) from unnest(new.ties) t
                        where t in ('live', 'part_time', 'study', 'work', 'family', 'audience')), '{}');
  return new;
end $$;
drop trigger if exists market_join_request_complete on public.market_join_requests;
create trigger market_join_request_complete before insert or update on public.market_join_requests
  for each row execute function public.market_join_request_complete();

drop function if exists public.request_join_market(uuid, text);
create or replace function public.request_join_market(p_community uuid, p_note text, p_language text, p_ties text[] default '{}')
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare c public.communities; me public.profiles; v_id uuid; v_note text := left(btrim(coalesce(p_note, '')), 500);
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into me from public.profiles where id = auth.uid();
  if me.status not in ('active', 'muted') then raise exception 'Your account needs to be approved first.'; end if;
  if public.is_active_vip() then raise exception 'Your market is set by the team. Message them if you want to change it.'; end if;
  select * into c from public.communities where id = p_community;
  if c.id is null or c.kind <> 'chapter' or c.retired_at is not null then raise exception 'That market is not open.'; end if;
  if not c.is_active then raise exception '% is not open yet.', c.name; end if;
  if exists (select 1 from public.community_members where community_id = c.id and profile_id = me.id and status = 'active') then
    raise exception 'You are already in %.', c.name;
  end if;
  select id into v_id from public.market_join_requests where community_id = c.id and profile_id = me.id and status = 'pending';
  if v_id is not null then
    update public.market_join_requests
       set note = v_note, language_level = p_language, ties = coalesce(p_ties, '{}')
     where id = v_id;
    return v_id;
  end if;
  insert into public.market_join_requests (community_id, profile_id, note, status, language_level, ties)
  values (c.id, me.id, v_note, 'pending', p_language, coalesce(p_ties, '{}'))
  returning id into v_id;
  return v_id;
end $function$;

-- The team can ask somebody to fill in a request that came without answers.
create or replace function public.ask_join_request_details(p_request uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare r public.market_join_requests; v_name text;
begin
  if not public.is_admin() then raise exception 'Only admins can do that'; end if;
  select * into r from public.market_join_requests where id = p_request;
  if r.id is null or r.status <> 'pending' then raise exception 'That request is not waiting any more'; end if;
  select name into v_name from public.communities where id = r.community_id;
  perform public.notify_user(r.profile_id, 'community',
    format('Tell us more about joining %s', coalesce(v_name, 'that market')),
    'Before the team can answer, tell them why you want to join and how well you speak the language. It takes a minute.',
    '/global?join=' || r.community_id::text);
end $function$;

-- The requests already waiting with no reason get that prompt now.
do $$
declare r record;
begin
  for r in select q.id, q.profile_id, q.community_id, c.name from public.market_join_requests q
           join public.communities c on c.id = q.community_id
           where q.status = 'pending' and (q.note is null or char_length(btrim(q.note)) < 20 or q.language_level is null)
  loop
    perform public.notify_user(r.profile_id, 'community',
      format('Tell us more about joining %s', r.name),
      'Before the team can answer, tell them why you want to join and how well you speak the language. It takes a minute.',
      '/global?join=' || r.community_id::text);
  end loop;
end $$;

-- ---------------------------------------------------------------- the closed role is not advertised any more
-- "You sent a notification adding the Tryp.com official creator role. Ensure that notification is withdrawn because I
-- have closed that role." The job row is already gone; its 197 bell entries go too.
delete from public.notifications
 where type = 'challenge' and link = '/jobs' and title = 'We''re hiring: Official Tryp.com Creator';

-- ---------------------------------------------------------------- the old welcome voucher, gone for good
-- Its cron was removed earlier and nothing has set these columns since 5 Oct; the voucher days replace it.
drop trigger if exists trg_challenge_welcome_from on public.challenges;
drop function if exists public.trg_challenge_welcome_from();
drop function if exists public.challenge_welcome_rewards();
drop function if exists public.challenge_welcome_rewards(uuid);
alter table public.challenges
  drop column if exists welcome_amount,
  drop column if exists welcome_views,
  drop column if exists welcome_limit,
  drop column if exists welcome_from;

-- ---------------------------------------------------------------- a live podium as well as a live board in the rooms
-- "We also have the podium image and the board image ... you could even make them dynamic, kind of like how the live
-- leaderboard works." A leaderboard card now says which view it is: the whole board, or the podium.
alter table public.messages add column if not exists leaderboard_view text;
do $$ begin
  alter table public.messages add constraint messages_leaderboard_view_check check (leaderboard_view is null or leaderboard_view in ('board', 'podium'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- the team types a hook on a video idea
-- "Admins on the video page can manually type in a hook if you're unable to register it." A tracked video was already
-- writable by admins; a VIP video has no update policy, so one door for both.
create or replace function public.set_video_hook(p_video uuid, p_is_vip boolean, p_text text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_text text := nullif(left(btrim(coalesce(p_text, '')), 600), '');
begin
  if not public.is_admin() then raise exception 'Only the team can type a hook'; end if;
  if p_is_vip then
    update public.vip_videos set screen_text = v_text where id = p_video;
  else
    update public.tracked_videos set screen_text = v_text where id = p_video;
  end if;
  if not found then raise exception 'That video was not found'; end if;
end $$;

-- Internal helpers stay off the API.
insert into public.owner_only_rpcs (proname, why) values
  ('award_entry_certificates_internal', 'Certificate award, called by triggers and the 384 backfill'),
  ('on_entry_certificate', 'Trigger function'),
  ('market_join_request_complete', 'Trigger function')
on conflict do nothing;
select public.lock_down_definer_functions();
