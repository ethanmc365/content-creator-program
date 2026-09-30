-- 299: VIP PROGRAMME, THIRD PASS (30 Sep 2026).
--
-- Ethan: "anyone that's added to the VIP area, like as a market manager, should be able to see everything related to
-- the VIP, see how the other communities are performing ... market standings ... we shouldn't have separate links for
-- everyone. It should just be the same link where all the VIPs can sign up ... a content library with all those hooks
-- ... VIP perks and trips. We have milestones ... customise it ... a cool map ... portfolios ... a recap card ...
-- structuring challenges for the VIPs ... on a month-to-month basis."
--
--   1. SEEING IS WIDER THAN MANAGING. `vip_can_see` = anyone on the access list (or the owner), for EVERY programme.
--      Every read function and read policy uses it; every write still uses `vip_can_manage` (their own market).
--   2. MARKET STANDINGS across programmes (`vip_market_standings`) - managers see money, VIPs see only the totals.
--   3. ONE SIGN-UP LINK for every VIP (`vip_global_link`). The creator is placed in the VIP programme of the market they
--      are approved into (`vip_rehome`), until then in the default programme.
--   4. MONTHLY CHALLENGES (`vip_briefs`): a theme, a brief, hook ideas and a goal for a month, with live standings.
--   5. PERKS AND TRIPS (`vip_perks`, `vip_perk_awards`): unlocked automatically by views/videos/months/streak, or given by
--      hand; the creator claims, the team marks delivered.
--   6. GUIDES (`vip_guides`): the VIP content library (how to film a trip, hook formulas ...), editable by market leads.
--   7. CUSTOMISATION: a market lead sets the colour, tagline and welcome of their programme; a VIP sets their own
--      headline, accent colour, personal view goal and whether they are on the VIP map.
--   8. THE VIP MAP (`vip_map`), THE RECAP (`vip_my_recap`), THE APPLICATION FUNNEL (`vip_funnel`).
--
-- Every new definer function is revoked from public and anon; the internal ones from authenticated too (separate statement).

-- ------------------------------------------------------------------------------------------------- columns
alter table public.vip_invites alter column programme_id drop not null;
alter table public.vip_invites add column is_global boolean not null default false;
create unique index vip_invites_one_global on public.vip_invites ((true)) where is_global and revoked_at is null;

alter table public.vip_programmes
  add column is_default boolean not null default false,
  add column accent text check (accent is null or accent ~ '^#[0-9a-fA-F]{6}$'),
  add column tagline text check (tagline is null or char_length(tagline) <= 120),
  add column welcome_message text check (welcome_message is null or char_length(welcome_message) <= 1000);
create unique index vip_programmes_one_default on public.vip_programmes ((true)) where is_default;

alter table public.vip_members
  add column auto_home boolean not null default false,
  add column headline text check (headline is null or char_length(headline) <= 80),
  add column accent text check (accent is null or accent ~ '^#[0-9a-fA-F]{6}$'),
  add column own_goal_views bigint check (own_goal_views is null or own_goal_views > 0),
  add column show_on_map boolean not null default true;

update public.vip_programmes set is_default = true where name = 'VIP Spain';

-- ------------------------------------------------------------------------------------ 1. who may SEE
create or replace function public.vip_can_see(p_programme uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.vip_has_access()
$$;

-- who may change something in a scope: nobody but the owner for "every market" (null), else that programme's manager
create or replace function public.vip_scope_ok(p_programme uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case when p_programme is null then public.is_owner() else public.vip_can_manage(p_programme) end
$$;

do $$
declare r record; d text; d2 text;
begin
  for r in select p.oid, p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where s.nspname = 'public' and p.proname in ('vip_admin_overview', 'vip_admin_videos', 'vip_analytics', 'vip_attention',
                  'vip_kpi_actuals', 'vip_month_review', 'vip_suggestions', 'vip_timeline', 'vip_trends') loop
    d := pg_get_functiondef(r.oid);
    d2 := replace(d, 'vip_can_manage(', 'vip_can_see(');
    if d2 = d then raise exception '% did not contain vip_can_manage', r.proname; end if;
    execute d2;
  end loop;
  for r in select tablename, policyname, qual from pg_policies
            where schemaname = 'public' and cmd = 'SELECT' and qual like '%vip_can_manage(%' loop
    execute format('alter policy %I on public.%I using (%s)', r.policyname, r.tablename, replace(r.qual, 'vip_can_manage(', 'vip_can_see('));
  end loop;
end $$;

-- the VIP rooms: a VIP of that market (or the worldwide lounge), or anybody on the access list, for every market
create or replace function public.vip_room_ok(p_community uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.vip_members m
      join public.vip_programmes p on p.id = m.programme_id
     where m.profile_id = auth.uid() and m.status = 'active'
       and (p.community_id = p_community
            or exists (select 1 from public.communities c where c.id = p_community and c.kind = 'network')))
  or public.vip_has_access()
$$;

-- ------------------------------------------------------------------------------ 2. market standings
create or replace function public.vip_market_standings()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_all boolean := public.vip_has_access(); p record; mo public.vip_months; pm public.vip_months;
  v_members int; v_videos int; v_views bigint; v_prev bigint; v_spend numeric; v_top_name text; v_top_views bigint;
  v_out jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not (v_all or public.is_active_vip()) then return '[]'::jsonb; end if;
  for p in select pr.*, c.slug as cslug, c.country_codes as ccodes, c.language as clang
             from public.vip_programmes pr join public.communities c on c.id = pr.community_id
            where pr.active order by pr.name loop
    mo := public.vip_ensure_month(p.id);
    select * into pm from public.vip_months where programme_id = p.id and (year * 12 + month) = (mo.year * 12 + mo.month) - 1;
    select count(*) filter (where m.status = 'active'), coalesce(sum(s.videos), 0), coalesce(sum(s.views), 0),
           coalesce(sum(least(coalesce(m.monthly_cap, p.monthly_cap, 1e12), public.vip_views_pay(coalesce(s.views, 0), p.cpm, p.tiers, m.cpm))), 0)
      into v_members, v_videos, v_views, v_spend
      from public.vip_members m
      join public.profiles pf on pf.id = m.profile_id and (not pf.is_test or v_all)
      left join public.vip_month_stats(mo.id) s on s.profile_id = m.profile_id
     where m.programme_id = p.id and m.status <> 'left';
    v_prev := 0;
    if pm.id is not null then
      select coalesce(sum(s.views), 0) into v_prev from public.vip_month_stats(pm.id) s;
    end if;
    select split_part(pf.name, ' ', 1), s.views into v_top_name, v_top_views
      from public.vip_month_stats(mo.id) s join public.profiles pf on pf.id = s.profile_id and (not pf.is_test or v_all)
      join public.vip_members m on m.profile_id = s.profile_id and m.status = 'active' and m.programme_id = p.id
     order by s.views desc limit 1;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'programme_id', p.id, 'name', p.name, 'slug', p.cslug, 'country_codes', p.ccodes, 'language', p.clang,
      'accent', p.accent, 'tagline', p.tagline, 'mine', p.id = public.vip_my_programme(),
      'members', v_members, 'videos', v_videos, 'views', v_views, 'prev_views', v_prev,
      'avg_views', case when v_members > 0 then round(v_views::numeric / v_members) else 0 end,
      'month', mo.month, 'year', mo.year,
      'top_name', v_top_name, 'top_views', coalesce(v_top_views, 0),
      'spend', case when v_all then v_spend end, 'budget', case when v_all then p.budget_monthly end, 'currency', p.currency));
  end loop;
  return v_out;
end $$;

-- -------------------------------------------------------------------------------------- 3. one link
create or replace function public.vip_global_link()
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare i public.vip_invites;
begin
  if not public.vip_has_access() then raise exception 'Only the people who run the VIP programme can see the sign-up link.'; end if;
  select * into i from public.vip_invites where is_global and revoked_at is null;
  if i.id is null then
    insert into public.vip_invites (token, programme_id, label, is_global, created_by)
    values (translate(encode(gen_random_bytes(9), 'base64'), '+/=', '-_'), null, 'The VIP sign-up link', true, auth.uid())
    returning * into i;
  end if;
  return jsonb_build_object('token', i.token, 'uses', i.uses, 'created_at', i.created_at);
end $$;

-- a fresh link when the old one has leaked: the owner only. People who joined through the old one stay VIPs.
create or replace function public.vip_renew_global_link()
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_owner() then raise exception 'Only the owner can replace the VIP sign-up link.'; end if;
  update public.vip_invites set revoked_at = now() where is_global and revoked_at is null;
  return public.vip_global_link();
end $$;

create or replace function public.vip_set_default_programme(p_programme uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Only the owner can choose the default VIP programme.'; end if;
  if not exists (select 1 from public.vip_programmes where id = p_programme and active) then raise exception 'That programme is not running.'; end if;
  update public.vip_programmes set is_default = false where is_default;
  update public.vip_programmes set is_default = true where id = p_programme;
end $$;

create or replace function public.vip_invite_check(p_token text)
returns table (valid boolean, programme text, label text, language text)
language sql stable security definer set search_path = public as $$
  with i as (
    select x.*, (x.revoked_at is null and (x.expires_at is null or x.expires_at > now())
                 and (x.max_uses is null or x.uses < x.max_uses)) as ok
      from public.vip_invites x where x.token = p_token)
  select i.ok,
         case when not i.ok then null when i.programme_id is null then 'the Tryp.com VIP creators' else p.name end,
         case when i.ok then i.label end,
         case when i.ok then c.language end
    from i
    left join public.vip_programmes p on p.id = i.programme_id
    left join public.communities c on c.id = p.community_id
$$;

create or replace function public.claim_vip_invite(p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
declare i public.vip_invites; v_prog uuid; v_comm uuid; v_auto boolean := false;
begin
  if auth.uid() is null then return false; end if;
  if exists (select 1 from public.vip_members where profile_id = auth.uid() and status = 'active') then return true; end if;
  select * into i from public.vip_invites where token = p_token;
  if i.id is null or i.revoked_at is not null or (i.expires_at is not null and i.expires_at < now())
     or (i.max_uses is not null and i.uses >= i.max_uses) then
    return false;
  end if;
  if i.programme_id is null then
    -- the one link: the VIP programme of a market they already belong to, else the default one until they are placed
    select pr.id into v_prog from public.community_members cm
      join public.vip_programmes pr on pr.community_id = cm.community_id and pr.active
     where cm.profile_id = auth.uid() and cm.status = 'active' and cm.role <> 'manager' limit 1;
    if v_prog is null then
      select id into v_prog from public.vip_programmes where is_default and active;
      v_auto := true;
    end if;
    if v_prog is null then select id into v_prog from public.vip_programmes where active order by name limit 1; v_auto := true; end if;
  else
    v_prog := i.programme_id;
  end if;
  if v_prog is null then return false; end if;
  insert into public.vip_members (profile_id, programme_id, status, source, created_by, auto_home)
  values (auth.uid(), v_prog, 'active', 'invite', i.created_by, v_auto)
  on conflict (profile_id) do update set programme_id = excluded.programme_id, status = 'active', left_on = null, auto_home = excluded.auto_home;
  if i.programme_id is not null then
    select community_id into v_comm from public.vip_programmes where id = v_prog;
    insert into public.community_members (community_id, profile_id, role, status)
    values (v_comm, auth.uid(), 'creator', 'active')
    on conflict (community_id, profile_id) do update set status = 'active' where community_members.status <> 'active';
  end if;
  update public.vip_invites set uses = uses + 1 where id = i.id;
  perform public.vip_ensure_month(v_prog);
  return true;
end $$;

-- Placed in a market (approved into it) -> their VIP programme becomes that market's, once.
create or replace function public.vip_rehome()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_prog uuid;
begin
  if new.status <> 'active' or new.role = 'manager' then return null; end if;
  select pr.id into v_prog from public.vip_programmes pr where pr.community_id = new.community_id and pr.active;
  if v_prog is null then return null; end if;
  update public.vip_members set programme_id = v_prog, auto_home = false
   where profile_id = new.profile_id and auto_home and status = 'active';
  return null;
end $$;
create trigger trg_vip_rehome after insert or update of status on public.community_members
  for each row execute function public.vip_rehome();

-- moving from the default programme to their own market: tell them, and tell that market's managers, instead of a second welcome
create or replace function public.vip_notify_joined()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_prog text; v_name text;
begin
  select name into v_prog from public.vip_programmes where id = new.programme_id;
  select name into v_name from public.profiles where id = new.profile_id;
  if tg_op = 'UPDATE' and old.auto_home and not new.auto_home and new.programme_id is distinct from old.programme_id then
    insert into public.notifications (recipient_id, type, title, body, link)
    values (new.profile_id, 'vip', 'You are in ' || coalesce(v_prog, 'your VIP programme'),
            'Your VIP place now sits with your own market, so your rooms, board and payouts are theirs.', '/vip');
    insert into public.notifications (recipient_id, type, title, body, link)
    select mgr, 'vip', coalesce(v_name, 'Someone') || ' joined ' || coalesce(v_prog, 'the VIP programme'), 'They signed up with the VIP link and were approved into your market.', '/admin/vip?tab=members'
      from public.vip_manager_ids(new.programme_id) mgr where mgr <> new.profile_id;
    return null;
  end if;
  if (tg_op = 'INSERT' and new.status = 'active')
     or (tg_op = 'UPDATE' and new.status = 'active' and (old.status = 'left' or old.programme_id is distinct from new.programme_id)) then
    insert into public.notifications (recipient_id, type, title, body, link)
    values (new.profile_id, 'vip', 'Welcome to ' || coalesce(v_prog, 'the VIP programme'),
            coalesce(nullif((select welcome_message from public.vip_programmes where id = new.programme_id), ''),
                     'You are paid by the views your videos bring. Add your first video to start your month.'), '/vip');
    if tg_op = 'INSERT' and new.source = 'invite' then
      insert into public.notifications (recipient_id, type, title, body, link)
      select mgr, 'vip', coalesce(v_name, 'Someone') || ' joined ' || coalesce(v_prog, 'the VIP programme'), 'They signed up with the VIP link.', '/admin/vip?tab=members'
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

-- ------------------------------------------------------------------------ application funnel
create or replace function public.vip_funnel()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_out jsonb;
begin
  if not public.vip_has_access() then raise exception 'Not yours to see.'; end if;
  select jsonb_build_object(
      'joined', count(*),
      'active', count(*) filter (where pf.status = 'active'),
      'pending', count(*) filter (where pf.status = 'pending' and pf.onboarded),
      'unfinished', count(*) filter (where pf.status = 'pending' and not pf.onboarded))
    into v_out
    from public.vip_members m join public.profiles pf on pf.id = m.profile_id
   where m.source = 'invite' and m.status <> 'left' and not pf.is_test;
  return v_out || jsonb_build_object('people', coalesce((
    select jsonb_agg(jsonb_build_object('id', pf.id, 'name', pf.name, 'photo', pf.photo_url, 'country', pf.country, 'city', pf.city,
             'onboarded', pf.onboarded, 'applied_at', pf.created_at, 'programme', pr.name) order by pf.created_at desc)
      from (select m.profile_id, m.programme_id from public.vip_members m join public.profiles p2 on p2.id = m.profile_id
             where m.source = 'invite' and m.status <> 'left' and p2.status = 'pending' and not p2.is_test
             order by p2.created_at desc limit 20) x
      join public.profiles pf on pf.id = x.profile_id
      join public.vip_programmes pr on pr.id = x.programme_id), '[]'::jsonb));
end $$;

-- --------------------------------------------------------------------------- 4. monthly challenges
create table public.vip_briefs (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid references public.vip_programmes(id) on delete cascade,   -- null = every market
  year int not null,
  month int not null check (month between 1 and 12),
  title text not null check (char_length(title) between 1 and 120),
  theme text check (theme is null or char_length(theme) <= 60),
  body text not null default '' check (char_length(body) <= 4000),
  hooks text[] not null default '{}',
  metric text not null default 'views' check (metric in ('views', 'videos', 'best_video')),
  target bigint check (target is null or target >= 0),
  prize text check (prize is null or char_length(prize) <= 300),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vip_briefs_month_idx on public.vip_briefs (year, month);
alter table public.vip_briefs enable row level security;
create policy "vip briefs: read" on public.vip_briefs for select
  using (public.vip_has_access() or (public.is_active_vip() and (programme_id is null or programme_id = public.vip_my_programme())));

create or replace function public.vip_save_brief(
  p_id uuid, p_programme uuid, p_year int, p_month int, p_title text, p_theme text, p_body text,
  p_hooks text[], p_metric text, p_target bigint, p_prize text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_new boolean := false; v_hooks text[];
begin
  if not public.vip_scope_ok(p_programme) then raise exception 'Only the owner can post a challenge to every market; market leads post to their own.'; end if;
  if btrim(coalesce(p_title, '')) = '' then raise exception 'Give the challenge a title.'; end if;
  if p_year is null or p_month is null or p_month not between 1 and 12 then raise exception 'Pick the month it is for.'; end if;
  select coalesce(array_agg(left(btrim(h), 240)) filter (where btrim(h) <> ''), '{}') into v_hooks from unnest(coalesce(p_hooks, '{}')) h;
  if p_id is null then
    insert into public.vip_briefs (programme_id, year, month, title, theme, body, hooks, metric, target, prize, created_by)
    values (p_programme, p_year, p_month, left(btrim(p_title), 120), nullif(left(btrim(coalesce(p_theme, '')), 60), ''), left(coalesce(p_body, ''), 4000),
            v_hooks, coalesce(p_metric, 'views'), p_target, nullif(left(btrim(coalesce(p_prize, '')), 300), ''), auth.uid())
    returning id into v_id;
    v_new := true;
  else
    update public.vip_briefs set year = p_year, month = p_month, title = left(btrim(p_title), 120),
           theme = nullif(left(btrim(coalesce(p_theme, '')), 60), ''), body = left(coalesce(p_body, ''), 4000), hooks = v_hooks,
           metric = coalesce(p_metric, 'views'), target = p_target, prize = nullif(left(btrim(coalesce(p_prize, '')), 300), ''), updated_at = now()
     where id = p_id and programme_id is not distinct from p_programme returning id into v_id;
    if v_id is null then raise exception 'That challenge is not yours to change.'; end if;
  end if;
  if v_new and (p_year * 12 + p_month) >= (extract(year from now())::int * 12 + extract(month from now())::int) then
    insert into public.notifications (recipient_id, type, title, body, link)
    select m.profile_id, 'vip', 'New VIP challenge: ' || left(btrim(p_title), 100),
           left(coalesce(nullif(btrim(coalesce(p_theme, '')), ''), btrim(coalesce(p_body, ''))), 140), '/vip'
      from public.vip_members m
     where m.status = 'active' and (p_programme is null or m.programme_id = p_programme);
  end if;
  return v_id;
end $$;

create or replace function public.vip_delete_brief(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_prog uuid; v_found boolean;
begin
  select programme_id, true into v_prog, v_found from public.vip_briefs where id = p_id;
  if not coalesce(v_found, false) or not public.vip_scope_ok(v_prog) then raise exception 'Not yours to delete.'; end if;
  delete from public.vip_briefs where id = p_id;
end $$;

create or replace function public.vip_brief_standings(p_brief uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.vip_briefs; v_all boolean := public.vip_has_access();
begin
  select * into b from public.vip_briefs where id = p_brief;
  if b.id is null then return '[]'::jsonb; end if;
  if not v_all and not (public.is_active_vip() and (b.programme_id is null or b.programme_id = public.vip_my_programme())) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('rank', y.rk, 'name', case when v_all then pf.name else split_part(pf.name, ' ', 1) end,
             'photo', pf.photo_url, 'value', y.val, 'me', y.profile_id = auth.uid(), 'programme', y.pname) order by y.rk)
      from (
        select z.*, row_number() over (order by z.val desc, z.profile_id) rk
          from (
            select s.profile_id, pr.name as pname,
                   case b.metric
                     when 'videos' then s.videos::bigint
                     when 'best_video' then coalesce((select max(public.vip_video_counted(v, mo)) from public.vip_videos v
                                                      where v.profile_id = s.profile_id and v.status = 'tracking'), 0)
                     else s.views end as val
              from public.vip_months mo
              join public.vip_programmes pr on pr.id = mo.programme_id
              cross join lateral public.vip_month_stats(mo.id) s
              join public.vip_members vm on vm.profile_id = s.profile_id and vm.status = 'active' and vm.programme_id = mo.programme_id
              join public.profiles pf2 on pf2.id = s.profile_id
             where mo.year = b.year and mo.month = b.month and (b.programme_id is null or mo.programme_id = b.programme_id)
               and (not pf2.is_test or v_all)) z
         where z.val > 0) y
      join public.profiles pf on pf.id = y.profile_id
     where y.rk <= 25), '[]'::jsonb);
end $$;

-- ------------------------------------------------------------------------ 5. perks and trips
create table public.vip_perks (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid references public.vip_programmes(id) on delete cascade,   -- null = every market
  kind text not null default 'perk' check (kind in ('perk', 'trip', 'milestone')),
  title text not null check (char_length(title) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  image_url text,
  metric text not null default 'lifetime_views'
    check (metric in ('lifetime_views', 'lifetime_videos', 'months_active', 'best_video_views', 'streak_months', 'manual')),
  threshold bigint not null default 0 check (threshold >= 0),
  sort int not null default 0,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.vip_perk_awards (
  perk_id uuid not null references public.vip_perks(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'earned' check (status in ('earned', 'claimed', 'delivered')),
  earned_at timestamptz not null default now(),
  claimed_at timestamptz,
  delivered_at timestamptz,
  note text check (note is null or char_length(note) <= 500),
  primary key (perk_id, profile_id)
);
create index vip_perk_awards_profile_idx on public.vip_perk_awards (profile_id);
alter table public.vip_perks enable row level security;
alter table public.vip_perk_awards enable row level security;
create policy "vip perks: read" on public.vip_perks for select
  using (public.vip_has_access() or (active and public.is_active_vip() and (programme_id is null or programme_id = public.vip_my_programme())));
create policy "vip perk awards: read" on public.vip_perk_awards for select
  using (profile_id = (select auth.uid()) or public.vip_has_access());

-- "how far along is this person" for each kind of perk
create or replace function public.vip_metric(p_profile uuid, p_metric text)
returns bigint language plpgsql stable security definer set search_path = public as $$
declare v bigint := 0; r record;
begin
  if p_metric = 'lifetime_views' then
    select coalesce(sum(logged_views), 0) into v from public.vip_videos where profile_id = p_profile and status = 'tracking';
  elsif p_metric = 'lifetime_videos' then
    select count(*) into v from public.vip_videos where profile_id = p_profile and status = 'tracking';
  elsif p_metric = 'best_video_views' then
    select coalesce(max(logged_views), 0) into v from public.vip_videos where profile_id = p_profile and status = 'tracking';
  elsif p_metric = 'months_active' then
    select greatest(0, (extract(year from age(current_date, joined_on)) * 12 + extract(month from age(current_date, joined_on)))::bigint)
      into v from public.vip_members where profile_id = p_profile;
  elsif p_metric = 'streak_months' then
    v := 0;
    for r in select s.videos from public.vip_statements s join public.vip_months mo on mo.id = s.month_id
              where s.profile_id = p_profile and s.status <> 'void' and mo.status = 'closed' order by mo.year desc, mo.month desc loop
      exit when r.videos < 1;
      v := v + 1;
    end loop;
  end if;
  return coalesce(v, 0);
end $$;

create or replace function public.vip_my_perks()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m public.vip_members;
begin
  select * into m from public.vip_members where profile_id = auth.uid();
  if m.profile_id is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', q.id, 'kind', q.kind, 'title', q.title, 'description', q.description, 'image_url', q.image_url,
        'metric', q.metric, 'threshold', q.threshold, 'value', q.val,
        'earned', a.perk_id is not null or (q.metric <> 'manual' and q.val >= q.threshold),
        'status', coalesce(a.status, case when q.metric <> 'manual' and q.val >= q.threshold then 'earned' end),
        'earned_at', a.earned_at, 'delivered_at', a.delivered_at, 'note', a.note)
        order by q.sort, q.threshold, q.title)
      from (select pk.*, public.vip_metric(auth.uid(), pk.metric) as val from public.vip_perks pk
             where pk.active and (pk.programme_id is null or pk.programme_id = m.programme_id)) q
      left join public.vip_perk_awards a on a.perk_id = q.id and a.profile_id = auth.uid()), '[]'::jsonb);
end $$;

create or replace function public.vip_award_perks()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select m.profile_id, m.programme_id, pk.id as perk_id, pk.title, pk.kind, pf.name as pname
             from public.vip_members m
             join public.profiles pf on pf.id = m.profile_id
             join public.vip_perks pk on pk.active and pk.metric <> 'manual' and (pk.programme_id is null or pk.programme_id = m.programme_id)
            where m.status = 'active'
              and not exists (select 1 from public.vip_perk_awards a where a.perk_id = pk.id and a.profile_id = m.profile_id)
              and public.vip_metric(m.profile_id, pk.metric) >= pk.threshold loop
    insert into public.vip_perk_awards (perk_id, profile_id) values (r.perk_id, r.profile_id) on conflict do nothing;
    if found then
      insert into public.notifications (recipient_id, type, title, body, link)
      values (r.profile_id, 'vip', 'Unlocked: ' || r.title,
              case when r.kind = 'trip' then 'Open your VIP page to claim it. Your market lead will be in touch to plan it with you.'
                   else 'Open your VIP page to see it and claim it.' end, '/vip?tab=perks');
      insert into public.notifications (recipient_id, type, title, body, link)
      select mgr, 'vip', coalesce(r.pname, 'A VIP') || ' unlocked ' || r.title, 'Mark it delivered once it has been sorted.', '/admin/vip?tab=content&part=perks'
        from public.vip_manager_ids(r.programme_id) mgr where mgr <> r.profile_id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
select cron.schedule('vip-award-perks', '50 * * * *', 'select public.vip_award_perks()');

create or replace function public.vip_claim_perk(p_perk uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a public.vip_perk_awards; pk public.vip_perks; m public.vip_members; v_name text;
begin
  select * into m from public.vip_members where profile_id = auth.uid();
  if m.profile_id is null then raise exception 'You are not in the VIP programme.'; end if;
  select * into pk from public.vip_perks where id = p_perk and active and (programme_id is null or programme_id = m.programme_id);
  if pk.id is null then raise exception 'That is not available to you.'; end if;
  select * into a from public.vip_perk_awards where perk_id = p_perk and profile_id = auth.uid();
  if a.perk_id is null then
    if pk.metric = 'manual' or public.vip_metric(auth.uid(), pk.metric) < pk.threshold then raise exception 'You have not unlocked that yet.'; end if;
    insert into public.vip_perk_awards (perk_id, profile_id) values (p_perk, auth.uid()) on conflict do nothing;
    a.status := 'earned';
  end if;
  if a.status <> 'earned' then return; end if;
  update public.vip_perk_awards set status = 'claimed', claimed_at = now() where perk_id = p_perk and profile_id = auth.uid();
  select name into v_name from public.profiles where id = auth.uid();
  insert into public.notifications (recipient_id, type, title, body, link)
  select mgr, 'vip', coalesce(v_name, 'A VIP') || ' wants to claim ' || pk.title, 'Get in touch with them to arrange it.', '/admin/vip?tab=content&part=perks'
    from public.vip_manager_ids(m.programme_id) mgr where mgr <> auth.uid();
end $$;

create or replace function public.vip_set_perk_award(p_perk uuid, p_profile uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_prog uuid; v_title text; v_new boolean;
begin
  select programme_id into v_prog from public.vip_members where profile_id = p_profile;
  if v_prog is null or not public.vip_can_manage(v_prog) then raise exception 'Not yours to change.'; end if;
  select title into v_title from public.vip_perks where id = p_perk;
  if v_title is null then raise exception 'That perk does not exist.'; end if;
  if p_status = 'none' then
    delete from public.vip_perk_awards where perk_id = p_perk and profile_id = p_profile;
    return;
  end if;
  if p_status not in ('earned', 'claimed', 'delivered') then raise exception 'Unknown status.'; end if;
  insert into public.vip_perk_awards (perk_id, profile_id, status, claimed_at, delivered_at, note)
  values (p_perk, p_profile, p_status, case when p_status in ('claimed', 'delivered') then now() end,
          case when p_status = 'delivered' then now() end, nullif(left(btrim(coalesce(p_note, '')), 500), ''))
  on conflict (perk_id, profile_id) do update
    set status = excluded.status,
        claimed_at = coalesce(vip_perk_awards.claimed_at, excluded.claimed_at),
        delivered_at = case when excluded.status = 'delivered' then coalesce(vip_perk_awards.delivered_at, now()) else null end,
        note = coalesce(nullif(left(btrim(coalesce(p_note, '')), 500), ''), vip_perk_awards.note)
  returning (xmax = 0) into v_new;
  if v_new then
    insert into public.notifications (recipient_id, type, title, body, link)
    values (p_profile, 'vip', 'Unlocked: ' || v_title, 'Open your VIP page to see it.', '/vip?tab=perks');
  elsif p_status = 'delivered' then
    insert into public.notifications (recipient_id, type, title, body, link)
    values (p_profile, 'vip', 'Sorted: ' || v_title, 'The team has marked it as done. Enjoy it.', '/vip?tab=perks');
  end if;
end $$;

create or replace function public.vip_perk_board(p_programme uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.vip_can_see(p_programme) then raise exception 'Not yours to see.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('perk_id', a.perk_id, 'title', pk.title, 'kind', pk.kind, 'profile_id', a.profile_id,
             'name', pf.name, 'photo', pf.photo_url, 'status', a.status, 'earned_at', a.earned_at, 'claimed_at', a.claimed_at,
             'delivered_at', a.delivered_at, 'note', a.note)
           order by case a.status when 'claimed' then 0 when 'earned' then 1 else 2 end, a.earned_at desc)
      from public.vip_perk_awards a
      join public.vip_perks pk on pk.id = a.perk_id
      join public.vip_members m on m.profile_id = a.profile_id and m.programme_id = p_programme
      join public.profiles pf on pf.id = a.profile_id), '[]'::jsonb);
end $$;

create or replace function public.vip_save_perk(
  p_id uuid, p_programme uuid, p_kind text, p_title text, p_description text, p_image text,
  p_metric text, p_threshold bigint, p_sort int, p_active boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.vip_scope_ok(p_programme) then raise exception 'Only the owner can change perks for every market; market leads change their own.'; end if;
  if btrim(coalesce(p_title, '')) = '' then raise exception 'Give it a name.'; end if;
  if p_id is null then
    insert into public.vip_perks (programme_id, kind, title, description, image_url, metric, threshold, sort, active, created_by)
    values (p_programme, coalesce(p_kind, 'perk'), left(btrim(p_title), 120), nullif(left(btrim(coalesce(p_description, '')), 1000), ''),
            nullif(btrim(coalesce(p_image, '')), ''), coalesce(p_metric, 'lifetime_views'), greatest(0, coalesce(p_threshold, 0)),
            coalesce(p_sort, 0), coalesce(p_active, true), auth.uid())
    returning id into v_id;
  else
    update public.vip_perks set kind = coalesce(p_kind, kind), title = left(btrim(p_title), 120),
           description = nullif(left(btrim(coalesce(p_description, '')), 1000), ''), image_url = nullif(btrim(coalesce(p_image, '')), ''),
           metric = coalesce(p_metric, metric), threshold = greatest(0, coalesce(p_threshold, threshold)), sort = coalesce(p_sort, sort),
           active = coalesce(p_active, active)
     where id = p_id and programme_id is not distinct from p_programme returning id into v_id;
    if v_id is null then raise exception 'That is not yours to change.'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.vip_delete_perk(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_prog uuid; v_found boolean;
begin
  select programme_id, true into v_prog, v_found from public.vip_perks where id = p_id;
  if not coalesce(v_found, false) or not public.vip_scope_ok(v_prog) then raise exception 'Not yours to delete.'; end if;
  delete from public.vip_perks where id = p_id;
end $$;

-- --------------------------------------------------------------------------------------- 6. guides
create table public.vip_guides (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid references public.vip_programmes(id) on delete cascade,   -- null = every market
  category text not null default 'Filming' check (char_length(category) between 1 and 40),
  title text not null check (char_length(title) between 1 and 140),
  body text not null default '' check (char_length(body) <= 12000),
  sort int not null default 0,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.vip_guides enable row level security;
create policy "vip guides: read" on public.vip_guides for select
  using (public.vip_has_access() or (active and public.is_active_vip() and (programme_id is null or programme_id = public.vip_my_programme())));

create or replace function public.vip_save_guide(p_id uuid, p_programme uuid, p_category text, p_title text, p_body text, p_sort int, p_active boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.vip_scope_ok(p_programme) then raise exception 'Only the owner can change guides for every market; market leads change their own.'; end if;
  if btrim(coalesce(p_title, '')) = '' then raise exception 'Give the guide a title.'; end if;
  if p_id is null then
    insert into public.vip_guides (programme_id, category, title, body, sort, active, created_by)
    values (p_programme, left(coalesce(nullif(btrim(coalesce(p_category, '')), ''), 'Filming'), 40), left(btrim(p_title), 140),
            left(coalesce(p_body, ''), 12000), coalesce(p_sort, 0), coalesce(p_active, true), auth.uid())
    returning id into v_id;
  else
    update public.vip_guides set category = left(coalesce(nullif(btrim(coalesce(p_category, '')), ''), category), 40), title = left(btrim(p_title), 140),
           body = left(coalesce(p_body, ''), 12000), sort = coalesce(p_sort, sort), active = coalesce(p_active, active), updated_at = now()
     where id = p_id and programme_id is not distinct from p_programme returning id into v_id;
    if v_id is null then raise exception 'That is not yours to change.'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.vip_delete_guide(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_prog uuid; v_found boolean;
begin
  select programme_id, true into v_prog, v_found from public.vip_guides where id = p_id;
  if not coalesce(v_found, false) or not public.vip_scope_ok(v_prog) then raise exception 'Not yours to delete.'; end if;
  delete from public.vip_guides where id = p_id;
end $$;

-- ---------------------------------------------------------------------- 7. a VIP's own settings
create or replace function public.vip_update_my_settings(p_headline text, p_accent text, p_goal bigint, p_on_map boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.vip_members where profile_id = auth.uid()) then raise exception 'You are not in the VIP programme.'; end if;
  if p_accent is not null and p_accent !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Pick a colour.'; end if;
  update public.vip_members
     set headline = nullif(left(btrim(coalesce(p_headline, '')), 80), ''),
         accent = p_accent,
         own_goal_views = case when coalesce(p_goal, 0) > 0 then p_goal end,
         show_on_map = coalesce(p_on_map, show_on_map)
   where profile_id = auth.uid();
end $$;

-- ------------------------------------------------------------------------------------- 8. the map
create or replace function public.vip_map()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_all boolean := public.vip_has_access();
begin
  if not (v_all or public.is_active_vip()) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', pf.id, 'name', pf.name, 'photo_url', pf.photo_url, 'city', pf.city, 'country', pf.country,
        'city_lat', pf.city_lat, 'city_lng', pf.city_lng, 'countries_visited', pf.countries_visited,
        'headline', m.headline, 'programme', pr.name, 'accent', m.accent))
      from public.vip_members m
      join public.vip_programmes pr on pr.id = m.programme_id
      join public.profiles pf on pf.id = m.profile_id
     where m.status = 'active' and m.show_on_map and pf.show_on_map is not false and pf.status = 'active'
       and (not pf.is_test or v_all)), '[]'::jsonb);
end $$;

-- ------------------------------------------------------------------------------------ the recap
create or replace function public.vip_my_recap(p_year int default null, p_month int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.vip_members; p public.vip_programmes; mo public.vip_months; st public.vip_statements;
  v_views bigint := 0; v_videos int := 0; v_base numeric; v_rank int; v_of int; v_grank int; v_gof int;
  v_best jsonb; v_plat jsonb; v_next jsonb; v_total numeric;
begin
  select * into m from public.vip_members where profile_id = auth.uid();
  if m.profile_id is null then return null; end if;
  select * into p from public.vip_programmes where id = m.programme_id;
  if p_year is null then
    select x.* into mo from public.vip_months x
      join public.vip_statements s on s.month_id = x.id and s.profile_id = auth.uid() and s.status <> 'void'
     where x.programme_id = p.id and x.status = 'closed' order by x.year desc, x.month desc limit 1;
    if mo.id is null then mo := public.vip_ensure_month(p.id); end if;
  else
    select * into mo from public.vip_months where programme_id = p.id and year = p_year and month = p_month;
    if mo.id is null then return null; end if;
  end if;

  select s.videos, s.views into v_videos, v_views from public.vip_month_stats(mo.id) s where s.profile_id = auth.uid();
  v_views := coalesce(v_views, 0); v_videos := coalesce(v_videos, 0);
  v_base := least(coalesce(m.monthly_cap, p.monthly_cap, 1e12), public.vip_views_pay(v_views, p.cpm, p.tiers, m.cpm));
  select * into st from public.vip_statements where month_id = mo.id and profile_id = auth.uid() and status <> 'void';
  v_total := coalesce(st.total, v_base);

  select z.rk, z.n into v_rank, v_of from (
    select s.profile_id, row_number() over (order by s.views desc, s.profile_id) rk, count(*) over () n
      from public.vip_month_stats(mo.id) s) z where z.profile_id = auth.uid();
  select q.rk, q.n into v_grank, v_gof from (
    select z.profile_id, row_number() over (order by z.views desc, z.profile_id) rk, count(*) over () n
      from (select s.profile_id, s.views from public.vip_months x cross join lateral public.vip_month_stats(x.id) s
              join public.vip_members vm on vm.profile_id = s.profile_id and vm.status <> 'left'
              join public.profiles pf on pf.id = s.profile_id
             where x.year = mo.year and x.month = mo.month and (not pf.is_test or pf.id = auth.uid())) z) q
   where q.profile_id = auth.uid();

  select jsonb_build_object('id', v.id, 'platform', v.platform, 'url', v.video_url, 'thumb', v.thumbnail_url, 'caption', v.caption,
           'views', public.vip_video_counted(v, mo)) into v_best
    from public.vip_videos v where v.profile_id = auth.uid() and v.status = 'tracking' and public.vip_video_counted(v, mo) > 0
   order by public.vip_video_counted(v, mo) desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object('platform', x.platform, 'views', x.views, 'videos', x.n) order by x.views desc), '[]'::jsonb) into v_plat
    from (select v.platform, count(*) n, sum(public.vip_video_counted(v, mo))::bigint views from public.vip_videos v
           where v.profile_id = auth.uid() and v.status = 'tracking' group by v.platform
          having sum(public.vip_video_counted(v, mo)) > 0) x;

  select jsonb_build_object('title', q.title, 'kind', q.kind, 'value', q.val, 'threshold', q.threshold) into v_next
    from (select pk.title, pk.kind, pk.threshold, public.vip_metric(auth.uid(), pk.metric) as val
            from public.vip_perks pk where pk.active and pk.metric <> 'manual' and (pk.programme_id is null or pk.programme_id = p.id)) q
   where q.val < q.threshold order by (q.threshold - q.val)::numeric / greatest(q.threshold, 1) limit 1;

  return jsonb_build_object(
    'programme', p.name, 'currency', p.currency, 'accent', coalesce(m.accent, p.accent), 'headline', m.headline,
    'month', jsonb_build_object('id', mo.id, 'year', mo.year, 'month', mo.month, 'status', mo.status),
    'views', v_views, 'videos', v_videos, 'base', v_base, 'total', v_total, 'statement_status', st.status,
    'bonuses', coalesce(st.bonuses, '[]'::jsonb),
    'rank', v_rank, 'of', v_of, 'global_rank', v_grank, 'global_of', v_gof,
    'best', v_best, 'platforms', v_plat, 'next', v_next,
    'streak_months', public.vip_metric(auth.uid(), 'streak_months'),
    'lifetime_views', public.vip_metric(auth.uid(), 'lifetime_views'),
    'lifetime_videos', public.vip_metric(auth.uid(), 'lifetime_videos'),
    'months_active', public.vip_metric(auth.uid(), 'months_active'));
end $$;

-- ---------------------------------------------------------------------------------- grants
revoke all on function public.vip_can_see(uuid), public.vip_scope_ok(uuid), public.vip_market_standings(), public.vip_global_link(),
  public.vip_renew_global_link(), public.vip_set_default_programme(uuid), public.vip_rehome(), public.vip_funnel(),
  public.vip_save_brief(uuid, uuid, int, int, text, text, text, text[], text, bigint, text), public.vip_delete_brief(uuid),
  public.vip_brief_standings(uuid), public.vip_metric(uuid, text), public.vip_my_perks(), public.vip_award_perks(),
  public.vip_claim_perk(uuid), public.vip_set_perk_award(uuid, uuid, text, text), public.vip_perk_board(uuid),
  public.vip_save_perk(uuid, uuid, text, text, text, text, text, bigint, int, boolean), public.vip_delete_perk(uuid),
  public.vip_save_guide(uuid, uuid, text, text, text, int, boolean), public.vip_delete_guide(uuid),
  public.vip_update_my_settings(text, text, bigint, boolean), public.vip_map(), public.vip_my_recap(int, int) from public, anon;
grant execute on function public.vip_can_see(uuid), public.vip_market_standings(), public.vip_global_link(),
  public.vip_renew_global_link(), public.vip_set_default_programme(uuid), public.vip_funnel(),
  public.vip_save_brief(uuid, uuid, int, int, text, text, text, text[], text, bigint, text), public.vip_delete_brief(uuid),
  public.vip_brief_standings(uuid), public.vip_my_perks(), public.vip_claim_perk(uuid),
  public.vip_set_perk_award(uuid, uuid, text, text), public.vip_perk_board(uuid),
  public.vip_save_perk(uuid, uuid, text, text, text, text, text, bigint, int, boolean), public.vip_delete_perk(uuid),
  public.vip_save_guide(uuid, uuid, text, text, text, int, boolean), public.vip_delete_guide(uuid),
  public.vip_update_my_settings(text, text, bigint, boolean), public.vip_map(), public.vip_my_recap(int, int) to authenticated;
revoke all on function public.vip_scope_ok(uuid), public.vip_rehome(), public.vip_metric(uuid, text), public.vip_award_perks() from authenticated;

-- ------------------------------------------------------------------------ starter content
-- Guides: advice for filming trips and writing hooks. Plain craft, nothing promised. The team edits or removes any of it.
insert into public.vip_guides (category, title, sort, body) values
('Filming', 'How to record the best trip videos', 10, $g$Shoot the journey, not just the destination. The best trip videos feel like you took the viewer with you.

**Get these shots on every trip**
- The arrival: stepping off the plane, train or boat
- The hero view: the one thing everybody comes for, filmed wide
- The small detail: food, signs, hands, textures
- You, reacting: a real face beats a perfect one
- The price moment: what it cost, on screen, in the moment

**Habits that make editing easy**
- Film vertically, steady, in natural light where you can
- Hold every shot for five seconds, even if it feels long
- Say the place name out loud once, so the clip can be found later
- Take one extra clip of the walk to and from: it is the best transition you will ever have$g$),
('Filming', 'Shoot for the edit: a five-minute routine', 20, $g$Before you leave a spot, spend five minutes thinking about the edit.

- **One wide, one medium, one close.** Three angles of the same thing is a whole sequence.
- **Move with purpose.** Walk into the frame, turn the camera with you, reveal something.
- **Record sound.** Waves, markets, trams: ten seconds of ambience makes a video feel real.
- **Always film a clean ending.** A shot you can finish on saves a weak last line.

If it is crowded, get low or get high. Nobody films the top of the stairs.$g$),
('Hooks', 'Write the first three seconds first', 30, $g$Most people decide in about three seconds whether to keep watching. Write the opening before you film anything else.

A good hook does one of three things: it promises something, it asks a question, or it breaks a pattern.

- Put the hook on screen as text AND say it out loud
- Start in the middle of the action, not with "hi guys"
- Make the payoff specific: a price, a place, a number

Use the hook generator on this page when you are stuck, then change the words so they sound like you.$g$),
('Hooks', 'Five hook formulas that keep working', 40, $g$1. **The price hook**: "A weekend in [city] for under [price]: here is exactly how."
2. **The mistake hook**: "Do not book [thing] before you watch this."
3. **The hidden gem**: "Nobody talks about this part of [place]."
4. **The list**: "Three things I wish I knew before [trip]."
5. **The point of view**: "POV: you finally booked the trip you kept putting off."

Swap in your own city, price and story. The formula is the skeleton, your detail is what makes it yours.$g$),
('Editing', 'Cut it tight', 50, $g$Short, fast and clear wins on every platform.

- Cut every pause and every "um". If a clip does not add anything, it goes.
- Change the shot every two to four seconds
- Add captions. Many people watch with the sound off
- Match cuts to the beat if you use music
- Finish on a line that makes people watch again, or follow you for the next part

Watch your video once without touching it. Wherever you want to look away, cut.$g$),
('Posting', 'When to post, and how often', 60, $g$Consistency beats perfection. Three decent videos a week will teach you more than one perfect one a month.

- Post natively on each platform, not a screenshot of another one
- Add every video to your VIP page as soon as it is live, so its views count from the start
- Reply to comments in the first hour: it helps the video and it builds your audience
- Keep a rough schedule and stick to it for a month before you change anything

Check your stats each week and note which video did best. Then make something like it.$g$),
('Growing', 'Turn one good video into five', 70, $g$When a video works, do not move on. Use it.

- Make a part two answering the most common question in the comments
- Cut a shorter, punchier version for another platform
- Pull out one moment as its own clip
- Post a behind-the-scenes of how you filmed it
- Turn the key fact into a text-only post

One idea, five posts, a week of content.$g$),
('Planning', 'Plan a month in one hour', 80, $g$Sit down once a month with your VIP challenge and your calendar.

1. Read this month's challenge and theme
2. List every trip, outing or place you will be at
3. Give each one a hook from the library
4. Pick three posting days a week and put a video idea on each
5. Leave one empty slot for something unexpected

You will spend less time deciding what to film, and more time filming.$g$),
('Tryp.com', 'Show the booking, not just the view', 90, $g$People who watch travel videos are already thinking about going. Help them take the next step.

- Show a real price or a real deal, on screen, in the moment
- Mention or tag Tryp.com the way you agreed with the team, in the video and the caption
- Explain why the option you picked is good value: people trust the reason
- Be honest. If something was not worth it, say so: it makes your recommendations worth more

Always check the terms on your VIP page for how a video must mention Tryp.com to count.$g$),
('Tryp.com', 'Keep your views honest', 100, $g$Your payout is based on real views, and the programme only works if they are real.

- Never buy views, followers or engagement
- Do not repost an old video as a new one
- Post on your own account, publicly, so the views can be read

Views that look artificial mean videos can be removed from your total, and may end your place in the programme. Real audiences last, and so does your payout.$g$);

-- Perks and trips: DRAFTS ONLY (inactive), so nothing is promised until the team has edited and switched it on.
insert into public.vip_perks (kind, title, description, metric, threshold, sort, active) values
('milestone', '100,000 views', 'A shout-out to the whole VIP group and on the Tryp.com creator channels.', 'lifetime_views', 100000, 10, false),
('milestone', '500,000 views', 'A feature in the Tryp.com creator spotlight.', 'lifetime_views', 500000, 20, false),
('trip', '1 million views: your trip', 'A trip to a destination planned with your market lead.', 'lifetime_views', 1000000, 30, false),
('perk', 'Three months in a row', 'A welcome pack from the team, for posting every month for a quarter.', 'streak_months', 3, 40, false),
('perk', 'Six months as a VIP', 'Early access to new Tryp.com features and deals.', 'months_active', 6, 50, false);
