-- 298: VIP PROGRAMME, SECOND PASS (30 Sep 2026).
--
-- Ethan: "plan a lot of improvements ... tracking data better, displaying better ... creators can be moved to VIP
-- creators and back to community creators ... everything automated."
--
--   * vip_events        a timeline of every move (joined, paused, resumed, moved market, back to the community, rate or
--                       target changed) written by a trigger, so nobody has to remember to log anything.
--   * vip_announcements what a market lead says to all their VIPs: a pinned card on the VIP page + a notification.
--   * moving people     a creator moving to VIP or back is told, once, in words that say what changes for them (this also
--                       replaces the welcome vip_add_member sent by hand, which would otherwise arrive twice).
--   * readers           vip_suggestions (community creators who look ready to be VIPs), vip_attention (who needs a nudge),
--                       vip_trends / vip_my_trends (views gained per day, platform split, top videos), vip_timeline.
--   * automations       a weekly digest to the managers, and a milestone notice when a VIP passes a round number of views.
--
-- Every new definer function is revoked from public and anon; the internal ones from authenticated too (separate statement).

-- --------------------------------------------------------------------------------------------- events
create table public.vip_events (
  id bigint generated always as identity primary key,
  programme_id uuid not null references public.vip_programmes(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  kind text not null,
  detail jsonb not null default '{}'::jsonb,
  actor_id uuid references public.profiles(id) on delete set null,
  at timestamptz not null default now()
);
create index vip_events_programme_idx on public.vip_events (programme_id, at desc);
create index vip_events_profile_idx on public.vip_events (profile_id, at desc);
alter table public.vip_events enable row level security;
create policy "vip events: managers read" on public.vip_events for select using (public.vip_can_manage(programme_id));

alter table public.vip_members add column milestone_notified bigint not null default 0;

create or replace function public.vip_log_member()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_kind text;
begin
  if tg_op = 'INSERT' then
    insert into public.vip_events (programme_id, profile_id, kind, detail, actor_id)
    values (new.programme_id, new.profile_id, 'joined', jsonb_build_object('source', new.source), auth.uid());
    return null;
  end if;
  if new.programme_id is distinct from old.programme_id then
    insert into public.vip_events (programme_id, profile_id, kind, detail, actor_id)
    values (new.programme_id, new.profile_id, 'moved', jsonb_build_object('from', old.programme_id), auth.uid());
  end if;
  if new.status is distinct from old.status then
    v_kind := case new.status when 'left' then 'left' when 'paused' then 'paused'
                when 'active' then case old.status when 'paused' then 'resumed' else 'rejoined' end end;
    insert into public.vip_events (programme_id, profile_id, kind, actor_id) values (new.programme_id, new.profile_id, v_kind, auth.uid());
  end if;
  if new.cpm is distinct from old.cpm then
    insert into public.vip_events (programme_id, profile_id, kind, detail, actor_id)
    values (new.programme_id, new.profile_id, 'rate_changed', jsonb_build_object('from', old.cpm, 'to', new.cpm), auth.uid());
  end if;
  if new.monthly_cap is distinct from old.monthly_cap then
    insert into public.vip_events (programme_id, profile_id, kind, detail, actor_id)
    values (new.programme_id, new.profile_id, 'cap_changed', jsonb_build_object('from', old.monthly_cap, 'to', new.monthly_cap), auth.uid());
  end if;
  if new.target_videos is distinct from old.target_videos or new.target_views is distinct from old.target_views then
    insert into public.vip_events (programme_id, profile_id, kind, detail, actor_id)
    values (new.programme_id, new.profile_id, 'target_changed',
            jsonb_build_object('videos', new.target_videos, 'views', new.target_views), auth.uid());
  end if;
  return null;
end $$;
create trigger trg_vip_log_member after insert or update on public.vip_members
  for each row execute function public.vip_log_member();

-- -------------------------------------------------------------------- moving people: tell them, once
drop trigger if exists trg_vip_notify_joined on public.vip_members;
drop trigger if exists trg_vip_notify_statement on public.vip_statements;   -- vip_approve_statement already sends its own
drop function if exists public.vip_notify_statement();

create or replace function public.vip_notify_joined()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_prog text; v_name text;
begin
  select name into v_prog from public.vip_programmes where id = new.programme_id;
  select name into v_name from public.profiles where id = new.profile_id;
  if (tg_op = 'INSERT' and new.status = 'active')
     or (tg_op = 'UPDATE' and new.status = 'active' and (old.status = 'left' or old.programme_id is distinct from new.programme_id)) then
    insert into public.notifications (recipient_id, type, title, body, link)
    values (new.profile_id, 'vip', 'Welcome to ' || coalesce(v_prog, 'the VIP programme'),
            'You are paid by the views your videos bring. Add your first video to start your month.', '/vip');
    if tg_op = 'INSERT' and new.source = 'invite' then
      insert into public.notifications (recipient_id, type, title, body, link)
      select mgr, 'vip', coalesce(v_name, 'Someone') || ' joined ' || coalesce(v_prog, 'the VIP programme'), 'They signed up with a VIP link.', '/admin/vip?tab=members'
        from public.vip_manager_ids(new.programme_id) mgr where mgr <> new.profile_id;
    end if;
  elsif tg_op = 'UPDATE' and new.status = 'left' and old.status <> 'left' then
    insert into public.notifications (recipient_id, type, title, body, link)
    values (new.profile_id, 'vip', 'You are back with the community creators',
            'Your VIP place has ended. The challenges, points and leaderboard are yours again, and past payouts are still paid.', '/challenges');
  elsif tg_op = 'UPDATE' and new.status = 'paused' and old.status = 'active' then
    insert into public.notifications (recipient_id, type, title, body, link)
    values (new.profile_id, 'vip', 'Your VIP place is paused', 'New views are not being counted while it is paused. Ask your market lead if that is a surprise.', '/vip');
  end if;
  return null;
end $$;
create trigger trg_vip_notify_joined after insert or update of status, programme_id on public.vip_members
  for each row execute function public.vip_notify_joined();

-- the welcome vip_add_member used to send by hand would now be a second one
do $$
declare d text; d2 text;
begin
  d := pg_get_functiondef('public.vip_add_member(uuid,uuid,numeric,numeric,int,bigint,text)'::regprocedure);
  d2 := regexp_replace(d, 'perform public\.notify_user\(p_profile, ''vip'', ''Welcome to the VIP creators'',.*?''/vip''\);', '', 's');
  if d2 = d then raise exception 'vip_add_member did not match the expected text'; end if;
  execute d2;
end $$;

-- ------------------------------------------------------------------------------------ announcements
create table public.vip_announcements (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.vip_programmes(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 2000),
  pinned boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index vip_announcements_programme_idx on public.vip_announcements (programme_id, created_at desc);
alter table public.vip_announcements enable row level security;
create policy "vip announcements: read" on public.vip_announcements for select
  using (public.vip_can_manage(programme_id) or programme_id = public.vip_my_programme());

create or replace function public.vip_announce(p_programme uuid, p_title text, p_body text, p_pinned boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_recent int;
begin
  if not public.vip_can_manage(p_programme) then raise exception 'Only the team members who manage this programme can post to its VIPs.'; end if;
  if btrim(coalesce(p_title, '')) = '' or btrim(coalesce(p_body, '')) = '' then raise exception 'Write a title and a message.'; end if;
  select count(*) into v_recent from public.vip_announcements where programme_id = p_programme and created_at > now() - interval '1 hour';
  if v_recent >= 10 then raise exception 'That is a lot of announcements in an hour. Please wait a little.'; end if;
  insert into public.vip_announcements (programme_id, title, body, pinned, created_by)
  values (p_programme, left(btrim(p_title), 120), left(btrim(p_body), 2000), coalesce(p_pinned, false), auth.uid())
  returning id into v_id;
  insert into public.notifications (recipient_id, type, title, body, link)
  select m.profile_id, 'vip', left(btrim(p_title), 120), left(btrim(p_body), 140), '/vip'
    from public.vip_members m where m.programme_id = p_programme and m.status in ('active', 'paused');
  return v_id;
end $$;

create or replace function public.vip_set_announcement(p_id uuid, p_pinned boolean default null, p_delete boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_prog uuid;
begin
  select programme_id into v_prog from public.vip_announcements where id = p_id;
  if v_prog is null or not public.vip_can_manage(v_prog) then raise exception 'Not yours to change.'; end if;
  if p_delete then delete from public.vip_announcements where id = p_id;
  else update public.vip_announcements set pinned = coalesce(p_pinned, pinned) where id = p_id; end if;
end $$;

-- ------------------------------------------------------------------------------------------- readers
-- Community creators who look ready to be VIPs: the most views on their challenge entries, not already VIPs.
create or replace function public.vip_suggestions(p_programme uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_comm uuid;
begin
  if not public.vip_can_manage(p_programme) then raise exception 'Not yours to see.'; end if;
  select community_id into v_comm from public.vip_programmes where id = p_programme;
  return coalesce((
    select jsonb_agg(jsonb_build_object('profile_id', z.id, 'name', z.name, 'photo', z.photo_url, 'videos', z.videos,
             'views', z.views, 'avg_views', z.avg_views, 'last_post', z.last_post) order by z.views desc)
      from (
        select p.id, p.name, p.photo_url, count(s.id) videos, coalesce(sum(s.logged_views), 0) views,
               coalesce(round(avg(s.logged_views)), 0) avg_views, max(s.submitted_at) last_post
          from public.community_members cm
          join public.profiles p on p.id = cm.profile_id
          join public.submissions s on s.creator_id = p.id
         where cm.community_id = v_comm and cm.status = 'active' and cm.role <> 'manager'
           and p.is_test = false and p.is_admin = false
           and not exists (select 1 from public.vip_members m where m.profile_id = p.id and m.status in ('active', 'paused'))
         group by p.id, p.name, p.photo_url
         having coalesce(sum(s.logged_views), 0) > 0
         order by coalesce(sum(s.logged_views), 0) desc limit 12) z), '[]'::jsonb);
end $$;

-- Who needs a nudge, and why.
create or replace function public.vip_attention(p_programme uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pr public.vip_programmes;
begin
  if not public.vip_can_manage(p_programme) then raise exception 'Not yours to see.'; end if;
  select * into pr from public.vip_programmes where id = p_programme;
  return coalesce((
    select jsonb_agg(jsonb_build_object('profile_id', z.profile_id, 'name', z.name, 'photo', z.photo, 'reasons', z.reasons) order by jsonb_array_length(z.reasons) desc, z.name)
      from (
        select m.profile_id, p.name, p.photo_url photo,
               to_jsonb(array_remove(array[
                 case when not public.vip_payment_ready(m.profile_id, pr.currency) then 'no_payment' end,
                 case when m.terms_accepted_at is null or coalesce(m.terms_version, 0) < pr.terms_version then 'no_terms' end,
                 case when m.joined_on < current_date - 10
                       and not exists (select 1 from public.vip_videos v where v.profile_id = m.profile_id and v.submitted_at > now() - interval '10 days') then 'quiet' end,
                 case when exists (select 1 from public.vip_videos v where v.profile_id = m.profile_id and v.status = 'tracking' and v.views_sync_error is not null) then 'sync_error' end
               ], null)) reasons
          from public.vip_members m join public.profiles p on p.id = m.profile_id
         where m.programme_id = p_programme and m.status = 'active') z
     where jsonb_array_length(z.reasons) > 0), '[]'::jsonb);
end $$;

-- Views gained per day (from the readings we keep), by platform, and the best videos. One person or the whole programme.
create or replace function public.vip_trend_core(p_programme uuid, p_profile uuid, p_days int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_tz text; v_days int := greatest(7, least(coalesce(p_days, 30), 120)); v_daily jsonb; v_plat jsonb; v_top jsonb; v_best jsonb;
begin
  select coalesce(c.timezone, 'UTC') into v_tz from public.vip_programmes p join public.communities c on c.id = p.community_id where p.id = p_programme;
  with r as (
    select rd.video_id, rd.read_at, rd.views, lag(rd.views) over (partition by rd.video_id order by rd.read_at) prev
      from public.vip_view_readings rd join public.vip_videos v on v.id = rd.video_id
     where v.programme_id = p_programme and (p_profile is null or v.profile_id = p_profile)
       and rd.read_at > now() - make_interval(days => v_days + 3)),
  g as (select (read_at at time zone v_tz)::date d, sum(greatest(views - prev, 0)) gained from r where prev is not null group by 1)
  select coalesce(jsonb_agg(jsonb_build_object('d', s.d, 'views', coalesce(g.gained, 0)) order by s.d), '[]'::jsonb) into v_daily
    from (select generate_series(((now() at time zone v_tz)::date - (v_days - 1)), (now() at time zone v_tz)::date, interval '1 day')::date d) s
    left join g on g.d = s.d;
  select coalesce(jsonb_agg(jsonb_build_object('platform', platform, 'videos', n, 'views', views) order by views desc), '[]'::jsonb) into v_plat
    from (select v.platform, count(*) n, coalesce(sum(v.logged_views), 0) views from public.vip_videos v
           where v.programme_id = p_programme and (p_profile is null or v.profile_id = p_profile) and v.status = 'tracking' group by v.platform) x;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'platform', platform, 'url', video_url, 'views', logged_views, 'posted_at', posted_at) order by logged_views desc), '[]'::jsonb) into v_top
    from (select v.id, pr.name, v.platform, v.video_url, v.logged_views, v.posted_at from public.vip_videos v join public.profiles pr on pr.id = v.profile_id
           where v.programme_id = p_programme and (p_profile is null or v.profile_id = p_profile) and v.status = 'tracking'
           order by v.logged_views desc limit 5) t;
  return jsonb_build_object('daily', v_daily, 'platforms', v_plat, 'top', v_top);
end $$;

create or replace function public.vip_trends(p_programme uuid, p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.vip_can_manage(p_programme) then raise exception 'Not yours to see.'; end if;
  return public.vip_trend_core(p_programme, null, p_days);
end $$;

create or replace function public.vip_my_trends(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_prog uuid; v_streak int := 0; r record; v_out jsonb;
begin
  select programme_id into v_prog from public.vip_members where profile_id = auth.uid();
  if v_prog is null then return null; end if;
  v_out := public.vip_trend_core(v_prog, auth.uid(), p_days);
  -- consecutive closed months, most recent first, in which they posted at least one video
  for r in select s.videos from public.vip_statements s join public.vip_months mo on mo.id = s.month_id
            where s.profile_id = auth.uid() and s.status <> 'void' and mo.status = 'closed' order by mo.year desc, mo.month desc loop
    exit when r.videos < 1;
    v_streak := v_streak + 1;
  end loop;
  return v_out || jsonb_build_object('streak_months', v_streak);
end $$;

-- The story of one creator (or the whole programme): moves, changes, who did them.
create or replace function public.vip_timeline(p_programme uuid, p_profile uuid default null, p_limit int default 40)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.vip_can_manage(p_programme) then raise exception 'Not yours to see.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'detail', e.detail, 'at', e.at, 'profile_id', e.profile_id,
             'name', pf.name, 'photo', pf.photo_url, 'actor', ac.name) order by e.at desc)
      from (select * from public.vip_events where programme_id = p_programme and (p_profile is null or profile_id = p_profile)
             order by at desc limit greatest(1, least(coalesce(p_limit, 40), 200))) e
      left join public.profiles pf on pf.id = e.profile_id
      left join public.profiles ac on ac.id = e.actor_id), '[]'::jsonb);
end $$;

-- ------------------------------------------------------------------------------------ automations
-- Monday morning: how the programme did this week, to the people who run it.
create or replace function public.vip_weekly_digest()
returns int language plpgsql security definer set search_path = public as $$
declare p record; v_views bigint; v_new int; v_quiet int; v_n int := 0;
begin
  for p in select pr.id, pr.name from public.vip_programmes pr where pr.active
            and exists (select 1 from public.vip_members m where m.programme_id = pr.id and m.status = 'active') loop
    select coalesce(sum((d ->> 'views')::bigint), 0) into v_views
      from jsonb_array_elements(public.vip_trend_core(p.id, null, 7) -> 'daily') d;
    select count(*) into v_new from public.vip_videos where programme_id = p.id and submitted_at > now() - interval '7 days';
    select count(*) into v_quiet from public.vip_members m where m.programme_id = p.id and m.status = 'active'
       and m.joined_on < current_date - 10
       and not exists (select 1 from public.vip_videos v where v.profile_id = m.profile_id and v.submitted_at > now() - interval '10 days');
    insert into public.notifications (recipient_id, type, title, body, link)
    select mgr, 'vip', p.name || ': your VIP week',
           to_char(v_views, 'FM999G999G999') || ' views gained, ' || v_new || ' videos added, ' || v_quiet || ' creators quiet for ten days.', '/admin/vip'
      from public.vip_manager_ids(p.id) mgr;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
select cron.schedule('vip-weekly-digest', '5 8 * * 1', 'select public.vip_weekly_digest()');

-- the daily nudges (296) plus a celebration when a VIP passes a round number of views
create or replace function public.vip_milestones()
returns int language plpgsql security definer set search_path = public as $$
declare r record; t bigint; v_n int := 0;
begin
  for r in select m.profile_id, m.milestone_notified, coalesce(sum(v.logged_views), 0)::bigint lifetime
             from public.vip_members m left join public.vip_videos v on v.profile_id = m.profile_id
            where m.status = 'active' group by m.profile_id, m.milestone_notified loop
    select max(x) into t from unnest(array[10000, 50000, 100000, 250000, 500000, 1000000, 2500000, 5000000, 10000000]::bigint[]) x
     where x <= r.lifetime and x > r.milestone_notified;
    if t is not null then
      update public.vip_members set milestone_notified = t where profile_id = r.profile_id;
      insert into public.notifications (recipient_id, type, title, body, link)
      values (r.profile_id, 'vip', 'VIP milestone reached', 'You have passed ' || to_char(t, 'FM999G999G999') || ' views as a VIP. Well done.', '/vip');
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
select cron.schedule('vip-milestones', '30 9 * * *', 'select public.vip_milestones()');

-- ------------------------------------------------------------------------------------------ grants
revoke all on function public.vip_announce(uuid, text, text, boolean), public.vip_set_announcement(uuid, boolean, boolean),
  public.vip_suggestions(uuid), public.vip_attention(uuid), public.vip_trends(uuid, int), public.vip_my_trends(int),
  public.vip_timeline(uuid, uuid, int), public.vip_trend_core(uuid, uuid, int), public.vip_weekly_digest(),
  public.vip_milestones(), public.vip_log_member(), public.vip_notify_joined() from public, anon;
grant execute on function public.vip_announce(uuid, text, text, boolean), public.vip_set_announcement(uuid, boolean, boolean),
  public.vip_suggestions(uuid), public.vip_attention(uuid), public.vip_trends(uuid, int), public.vip_my_trends(int),
  public.vip_timeline(uuid, uuid, int) to authenticated;
revoke all on function public.vip_trend_core(uuid, uuid, int), public.vip_weekly_digest(), public.vip_milestones(),
  public.vip_log_member(), public.vip_notify_joined() from authenticated;
