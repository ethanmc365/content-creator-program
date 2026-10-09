-- 376: OFFICIAL TRYP.COM CREATORS ARE THEIR OWN PROGRAMME (10 Oct 2026).
--
-- Ethan: the creators marked "team" "are on a bit of a different contract, we really want to separate the team from the
-- VIP ... a separate podium, leaderboard etc that anyone marked as team can see, they won't see the other leaderboards,
-- only the one they are in, but Marta and any admins with access should be able to see both and set challenges for both
-- ... separated analytics". And: call them "official Tryp.com content creator rather than team, as team implies they
-- should have admin access when they really shouldn't".
--
-- THE SHAPE: a programme has a KIND, 'vip' or 'official'. Every VIP mechanism is already per programme - the month, the
-- board, bonuses, statements and invoices, rooms, announcements, briefs, guides, analytics - so an official programme
-- gets all of it, separately, for free. What is NOT per programme is the handful of places that mean "every VIP": the
-- Worldwide lounge, bonuses set for every VIP (audience 'all'), "everywhere" announcements, briefs/guides/perks with no
-- programme, the market-picking lookups, analytics over "all". Each of those now means every programme OF THE SAME KIND.
--
-- `vip_members.is_team` stays as a mirror (true exactly for members of an official programme) so nothing reading it breaks.
-- `profiles.vip_kind` sits beside the read-only `profiles.is_vip` so the app can label the tab without another query.
-- Official creators keep `is_vip`: they are paid creators, so the community challenge fences still apply to them.

alter table public.vip_programmes add column if not exists kind text not null default 'vip';
do $$ begin
  alter table public.vip_programmes add constraint vip_programmes_kind_check check (kind in ('vip', 'official'));
exception when duplicate_object then null; end $$;
comment on column public.vip_programmes.kind is 'vip = the VIP community of a market; official = the official Tryp.com content creators of a market (own contract, own board, own bonuses).';
alter table public.vip_programmes drop constraint if exists vip_programmes_community_id_key;
create unique index if not exists vip_programmes_one_per_kind on public.vip_programmes (community_id, kind);

alter table public.profiles add column if not exists vip_kind text;
comment on column public.profiles.vip_kind is 'Read-only mirror: the kind of the paid programme this creator is active in (vip | official), or null.';

alter table public.vip_members add column if not exists invoice_outside boolean not null default false;
comment on column public.vip_members.invoice_outside is 'Paid outside the platform (their own invoice to the team). Views are tracked; no monthly statement is drafted.';

-- The caller's programme kind, for policies. Null for anybody who is not an active member.
create or replace function public.vip_my_kind()
returns text language sql stable security definer set search_path = public as $$
  select p.kind from public.vip_members m join public.vip_programmes p on p.id = m.programme_id
   where m.profile_id = auth.uid() and m.status = 'active'
$$;

create or replace function public.vip_kind_of(p_profile uuid)
returns text language sql stable security definer set search_path = public as $$
  select p.kind from public.vip_members m join public.vip_programmes p on p.id = m.programme_id
   where m.profile_id = p_profile and m.status = 'active'
$$;

CREATE OR REPLACE FUNCTION public.vip_member_flag()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid := coalesce(new.profile_id, old.profile_id);
begin
  perform set_config('tryp.vip_write', 'on', true);
  update public.profiles
     set is_vip = exists (select 1 from public.vip_members where profile_id = v_id and status = 'active'),
         vip_kind = public.vip_kind_of(v_id)
   where id = v_id;
  perform set_config('tryp.vip_write', 'off', true);
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.vip_protect_flag()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.is_vip is distinct from old.is_vip
     and auth.uid() is not null
     and coalesce(current_setting('tryp.vip_write', true), '') <> 'on' then
    new.is_vip := old.is_vip;
  end if;
  if new.vip_kind is distinct from old.vip_kind
     and auth.uid() is not null
     and coalesce(current_setting('tryp.vip_write', true), '') <> 'on' then
    new.vip_kind := old.vip_kind;
  end if;
  return new;
end $function$;


-- ROOMS: an official creator sees introductions and the official room of their market, never a VIP room; a VIP never
-- sees the official room. The team with VIP access sees both. (Restrictive policies on channels and messages already
-- call this with the room's key.)
create or replace function public.vip_room_key_ok(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when coalesce(p_key, '') like 'official%' then public.vip_has_access() or public.vip_my_kind() = 'official'
    when coalesce(p_key, '') in ('vip', 'vip_announcements', 'vip_global') and public.vip_my_kind() = 'official'
         and not public.vip_has_access() then false
    else not public.vip_hides_announcements()
         or coalesce(p_key, '') in ('introductions', 'vip', 'vip_announcements', 'vip_global', 'official')
  end
$$;

CREATE OR REPLACE FUNCTION public.vip_room_ok(p_community uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.vip_members m
      join public.vip_programmes p on p.id = m.programme_id
     where m.profile_id = auth.uid() and m.status = 'active'
       and (p.community_id = p_community
            or (p.kind = 'vip' and exists (select 1 from public.communities c where c.id = p_community and c.kind = 'network'))))
  or public.vip_has_access()
$function$;

CREATE OR REPLACE FUNCTION public.vip_ensure_rooms(p_programme uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_comm uuid; v_name text; v_kind text;
begin
  select community_id, name, kind into v_comm, v_name, v_kind from public.vip_programmes where id = p_programme;
  if v_kind = 'official' then
    insert into public.channels (community_id, key, label, hint, icon, post_policy, visibility, position)
    values (v_comm, 'official', 'Official creators', 'Only for the official Tryp.com creators of this market and the team.', 'badge', 'all', 'vip', 6)
    on conflict do nothing;
    return;
  end if;
  insert into public.channels (community_id, key, label, hint, icon, post_policy, visibility, position)
  values (v_comm, 'vip', 'VIP room', 'Only for the VIP creators of this market and the team.', 'star', 'all', 'vip', 5)
  on conflict do nothing;
end $function$;

CREATE OR REPLACE FUNCTION public.vip_no_challenge_notices()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_key text;
begin
  if not public.vip_fenced(new.recipient_id) then return new; end if;
  if new.type in ('challenge', 'results', 'deadline', 'submission') then return null; end if;
  if coalesce(new.link, '') ~ '^/(challenges|leaderboard|milestones|c/[^/]+/challenges)' then return null; end if;
  v_key := public.notice_room_key(new.link);
  -- 376: an official creator hears their own room and no VIP room; a VIP never hears the official room.
  if v_key is not null and v_key not in ('introductions', 'vip', 'vip_announcements', 'vip_global', 'official') then return null; end if;
  if v_key = 'official' and public.vip_kind_of(new.recipient_id) is distinct from 'official' then return null; end if;
  if v_key in ('vip', 'vip_announcements', 'vip_global') and public.vip_kind_of(new.recipient_id) = 'official' then return null; end if;
  if new.type = 'application' and new.title like 'You''re in!%' then return null; end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.vip_home_for(p_country_code text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object('programme_id', pr.id, 'name', pr.name, 'slug', c.slug, 'country_codes', c.country_codes,
                            'worldwide', c.kind = 'network',
                            'matched', c.kind = 'chapter' and upper(coalesce(p_country_code, '')) = any (coalesce(c.country_codes, '{}')))
    from public.vip_programmes pr join public.communities c on c.id = pr.community_id
   where pr.active and pr.kind = 'vip'
   order by (c.kind = 'chapter' and upper(coalesce(p_country_code, '')) = any (coalesce(c.country_codes, '{}'))) desc, pr.is_default desc, pr.name
   limit 1
$function$;

CREATE OR REPLACE FUNCTION public.vip_programme_options()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.name, 'slug', c.slug, 'country_codes', c.country_codes,
                                        'worldwide', c.kind = 'network', 'is_default', pr.is_default, 'kind', pr.kind)
                     order by (c.kind = 'network'), pr.name)
      from public.vip_programmes pr join public.communities c on c.id = pr.community_id
     where pr.active and pr.kind = 'vip'), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.claim_vip_invite(p_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare i public.vip_invites; v_prog uuid; v_comm uuid; v_auto boolean := false;
begin
  if auth.uid() is null then return false; end if;
  if public.vip_claim_blocked() then return false; end if;
  if exists (select 1 from public.vip_members where profile_id = auth.uid() and status = 'active') then return true; end if;
  select * into i from public.vip_invites where token = p_token;
  if i.id is null then return false; end if;
  if not i.is_global and (i.revoked_at is not null or (i.expires_at is not null and i.expires_at < now())
     or (i.max_uses is not null and i.uses >= i.max_uses)) then
    return false;
  end if;
  if i.programme_id is null then
    select pr.id into v_prog from public.community_members cm
      join public.communities cc on cc.id = cm.community_id and cc.kind = 'chapter'
      join public.vip_programmes pr on pr.community_id = cm.community_id and pr.active and pr.kind = 'vip'
     where cm.profile_id = auth.uid() and cm.status = 'active' and cm.role <> 'manager' limit 1;
    if v_prog is null then
      select id into v_prog from public.vip_programmes where is_default and active and kind = 'vip';
      v_auto := true;
    end if;
    if v_prog is null then select id into v_prog from public.vip_programmes where active and kind = 'vip' order by name limit 1; v_auto := true; end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.vip_open_programme(p_community uuid, p_name text DEFAULT NULL::text, p_cpm numeric DEFAULT 0.25, p_tiers jsonb DEFAULT NULL::jsonb, p_monthly_cap numeric DEFAULT NULL::numeric, p_min_payout numeric DEFAULT 0, p_budget numeric DEFAULT NULL::numeric, p_tagline text DEFAULT NULL::text, p_welcome text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c public.communities; v_id uuid;
begin
  if not public.is_owner() and not public.is_global_admin() then raise exception 'Only a global admin can open a VIP market.'; end if;
  select * into c from public.communities where id = p_community;
  if c.id is null or c.kind <> 'chapter' then raise exception 'Pick a market to open the VIP market in.'; end if;
  if exists (select 1 from public.vip_programmes where community_id = p_community and kind = 'vip') then
    raise exception '% already has a VIP market.', c.name;
  end if;
  if coalesce(p_cpm, -1) < 0 then raise exception 'The rate cannot be negative.'; end if;
  insert into public.vip_programmes (community_id, name, currency, cpm, tiers, monthly_cap, min_payout, budget_monthly,
                                     tagline, welcome_message, active)
  values (p_community, coalesce(nullif(btrim(p_name), ''), 'VIP ' || c.name), coalesce(c.currency, 'EUR'), p_cpm,
          case when jsonb_typeof(p_tiers) = 'array' and jsonb_array_length(p_tiers) > 0 then p_tiers end,
          p_monthly_cap, coalesce(p_min_payout, 0), p_budget, nullif(btrim(p_tagline), ''), nullif(btrim(p_welcome), ''), true)
  returning id into v_id;
  perform public.vip_ensure_rooms(v_id);
  insert into public.channels (community_id, key, label, hint, icon, post_policy, visibility, position)
  values (p_community, 'vip_announcements', 'VIP announcements', 'News for the VIP creators of this market, from the team.',
          'megaphone', 'staff', 'vip', 4)
  on conflict do nothing;
  perform public.vip_ensure_month(v_id);
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.vip_rehome()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_prog uuid;
begin
  if new.status <> 'active' or new.role = 'manager' then return null; end if;
  select pr.id into v_prog from public.vip_programmes pr where pr.community_id = new.community_id and pr.active and pr.kind = 'vip';
  if v_prog is null then return null; end if;
  update public.vip_members set programme_id = v_prog, auto_home = false
   where profile_id = new.profile_id and auto_home and status = 'active'
     and programme_id in (select id from public.vip_programmes where kind = 'vip');
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.agreement_render(p_body text, p_profile uuid, p_programme uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_name text; v_market text; v_country text; pr public.vip_programmes; m public.vip_members; v_rate numeric; v_cap numeric;
  v text := coalesce(p_body, '');
begin
  select coalesce(nullif(btrim(name), ''), 'the Creator'), nullif(btrim(country), '') into v_name, v_country from public.profiles where id = p_profile;
  -- 366: the markets they are a CREATOR in today (a left or managed market is not where they are a member), joined
  -- "Portugal and Spain". Nobody but Worldwide reads "Worldwide" (see the Community Terms parties line).
  select regexp_replace(string_agg(c.name, ', ' order by c.name), ', ([^,]+)$', ' and \1') into v_market
    from public.community_members cm join public.communities c on c.id = cm.community_id
   where cm.profile_id = p_profile and c.slug <> 'worldwide' and c.retired_at is null
     and cm.status = 'active' and cm.role = 'creator';
  select * into m from public.vip_members where profile_id = p_profile;
  select * into pr from public.vip_programmes where id = coalesce(p_programme, m.programme_id);
  if pr.id is null then select * into pr from public.vip_programmes where is_default and active and kind = 'vip' limit 1; end if;
  v_rate := coalesce(m.cpm, pr.cpm);
  v_cap := coalesce(m.monthly_cap, pr.monthly_cap);
  v := replace(v, '{{creator_name}}', coalesce(v_name, '[Creator name]'));
  v := replace(v, '{{creator_market}}', coalesce(v_market, case when p_profile is null then '[their market]' else 'Worldwide' end));
  v := replace(v, '{{creator_country}}', coalesce(v_country, case when p_profile is null then '[their country]' else 'your country' end));
  v := replace(v, '{{market}}', coalesce(pr.name, 'your VIP market'));
  v := replace(v, '{{rate}}', case when v_rate is null then '[rate]' else
         case upper(coalesce(pr.currency, 'EUR')) when 'GBP' then '£' else '€' end || case when round(v_rate, 2) = v_rate then to_char(v_rate, 'FM990D00') else to_char(v_rate, 'FM990D000') end end);
  v := replace(v, '{{min_payout}}', coalesce(public.agreement_money(pr.min_payout, pr.currency), '[minimum]'));
  v := replace(v, '{{voucher_min}}', coalesce(public.agreement_money(pr.voucher_min, pr.currency), '[voucher minimum]'));
  v := replace(v, '{{window_days}}', coalesce(pr.window_days::text, '60'));
  v := replace(v, '{{payment_cap}}', case
         when v_cap is not null then 'Payments under this Agreement are capped at ' || public.agreement_money(v_cap, pr.currency)
              || ' per monthly period. If you go beyond it, Tryp.com may, at its discretion, discuss additional compensation with you, such as a monthly retainer or a longer collaboration.'
         else 'Your market currently has no monthly payment cap. Tryp.com may introduce one for future months with at least 14 days'' notice.' end);
  v := replace(v, '{{stay_in}}', case
         when coalesce(pr.req_on, false) then 'To remain part of the VIP group, in each calendar month you must either publish at least '
              || pr.req_videos || ' eligible videos, or have at least one eligible video reach '
              || to_char(pr.req_single_views, 'FM999G999G990') || ' views. Creators who do not meet this may be removed from the VIP group.'
         else 'Your market currently has no minimum posting requirement. Tryp.com may introduce one for future months with at least 14 days'' notice.' end);
  v := replace(v, '{{today}}', to_char(now() at time zone 'Europe/Copenhagen', 'FMDD FMMonth YYYY'));
  return v;
end $function$;

CREATE OR REPLACE FUNCTION public.vip_range_analytics(p_programme uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ids uuid[]; v_len int; v_pf date; v_pt date;
  v_daily jsonb; v_cur jsonb; v_prev jsonb; v_plat jsonb; v_creators jsonb; v_top jsonb; v_before int; v_now int;
begin
  if not public.vip_can_see(p_programme) then raise exception 'Not yours to see.'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Pick a start day and an end day after it.'; end if;
  v_len := (p_to - p_from) + 1;
  if v_len > 800 then raise exception 'That is more than two years of days. Pick a shorter stretch.'; end if;
  v_ids := case when p_programme is null then (select array_agg(id) from public.vip_programmes where active and kind = 'vip') else array[p_programme] end;
  v_pf := p_from - v_len; v_pt := p_from - 1;

  create temporary table if not exists _vip_rg (d date, profile_id uuid, video_id uuid, programme_id uuid, gained numeric) on commit drop;
  truncate _vip_rg;
  insert into _vip_rg select * from public.vip_daily_gained(v_ids, null, v_pf, p_to);

  select coalesce(jsonb_agg(jsonb_build_object('d', s.d, 'views', round(coalesce(g.views, 0))::bigint, 'creators', coalesce(g.creators, 0),
           'videos', coalesce(pv.n, 0), 'joined', coalesce(jn.n, 0)) order by s.d), '[]'::jsonb) into v_daily
    from (select generate_series(p_from, p_to, interval '1 day')::date d) s
    left join (select d, sum(gained) views, count(distinct profile_id) filter (where gained > 0) creators from _vip_rg where d between p_from and p_to group by d) g on g.d = s.d
    left join (select (coalesce(x.posted_at, x.submitted_at) at time zone coalesce(c.timezone, 'UTC'))::date d, count(*) n
                 from public.vip_videos x join public.vip_programmes p on p.id = x.programme_id left join public.communities c on c.id = p.community_id
                where x.programme_id = any (v_ids) and x.status <> 'removed' and not public.vip_hidden_profile(x.profile_id) group by 1) pv on pv.d = s.d
    left join (select vm.joined_on d, count(*) n from public.vip_members_live vm
                where vm.programme_id = any (v_ids) and not public.vip_hidden_profile(vm.profile_id) group by 1) jn on jn.d = s.d;

  select jsonb_build_object(
      'views', round(coalesce(sum(r.gained), 0))::bigint,
      'creators', count(distinct r.profile_id) filter (where r.gained > 0),
      'pay', round(coalesce(sum(r.gained / 1000.0 * coalesce(vm.cpm, p.cpm)), 0), 2))
    into v_cur
    from _vip_rg r join public.vip_programmes p on p.id = r.programme_id left join public.vip_members_live vm on vm.profile_id = r.profile_id
   where r.d between p_from and p_to;
  select jsonb_build_object(
      'views', round(coalesce(sum(r.gained), 0))::bigint,
      'creators', count(distinct r.profile_id) filter (where r.gained > 0),
      'pay', round(coalesce(sum(r.gained / 1000.0 * coalesce(vm.cpm, p.cpm)), 0), 2))
    into v_prev
    from _vip_rg r join public.vip_programmes p on p.id = r.programme_id left join public.vip_members_live vm on vm.profile_id = r.profile_id
   where r.d between v_pf and v_pt;
  v_cur := v_cur || jsonb_build_object(
    'videos', (select count(*) from public.vip_videos x where x.programme_id = any (v_ids) and x.status <> 'removed' and not public.vip_hidden_profile(x.profile_id)
                 and coalesce(x.posted_at, x.submitted_at)::date between p_from and p_to),
    'joined', (select count(*) from public.vip_members_live vm where vm.programme_id = any (v_ids) and not public.vip_hidden_profile(vm.profile_id) and vm.joined_on between p_from and p_to));
  v_prev := v_prev || jsonb_build_object(
    'videos', (select count(*) from public.vip_videos x where x.programme_id = any (v_ids) and x.status <> 'removed' and not public.vip_hidden_profile(x.profile_id)
                 and coalesce(x.posted_at, x.submitted_at)::date between v_pf and v_pt),
    'joined', (select count(*) from public.vip_members_live vm where vm.programme_id = any (v_ids) and not public.vip_hidden_profile(vm.profile_id) and vm.joined_on between v_pf and v_pt));

  select coalesce(jsonb_agg(jsonb_build_object('platform', platform, 'videos', n, 'views', round(views)::bigint) order by views desc), '[]'::jsonb) into v_plat
    from (select x.platform, count(distinct r.video_id) n, sum(r.gained) views
            from _vip_rg r join public.vip_videos x on x.id = r.video_id where r.d between p_from and p_to group by x.platform) t;

  select coalesce(jsonb_agg(row_to_json(c)::jsonb order by c.views desc, c.name), '[]'::jsonb) into v_creators from (
    select vm.profile_id, pr.name, pr.photo_url photo, vm.programme_id, p.name programme, p.currency, vm.status, vm.joined_on,
           round(coalesce((select sum(r.gained) from _vip_rg r where r.profile_id = vm.profile_id and r.d between p_from and p_to), 0))::bigint views,
           round(coalesce((select sum(r.gained) from _vip_rg r where r.profile_id = vm.profile_id and r.d between v_pf and v_pt), 0))::bigint prev_views,
           (select count(*) from public.vip_videos x where x.profile_id = vm.profile_id and x.status <> 'removed' and coalesce(x.posted_at, x.submitted_at)::date between p_from and p_to) videos,
           round(coalesce((select sum(r.gained) from _vip_rg r where r.profile_id = vm.profile_id and r.d between p_from and p_to), 0) / 1000.0 * coalesce(vm.cpm, p.cpm), 2) pay,
           (select max(coalesce(x.posted_at, x.submitted_at)) from public.vip_videos x where x.profile_id = vm.profile_id and x.status <> 'removed') last_post,
           (select count(*) from public.push_subscriptions ps where ps.user_id = vm.profile_id) push_devices,
           coalesce((pr.notif_prefs ->> 'chat')::boolean, true) chat_push_on,
           pr.last_seen_at,
           public.vip_payment_ready(vm.profile_id, p.currency) payment_ready,
           public.vip_terms_ok(vm.profile_id) terms_ok
      from public.vip_members_live vm
      join public.profiles pr on pr.id = vm.profile_id
      join public.vip_programmes p on p.id = vm.programme_id
     where vm.programme_id = any (v_ids) and vm.status in ('active', 'paused') and not public.vip_hidden_profile(vm.profile_id)
  ) c;

  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'url', t.video_url, 'platform', t.platform, 'thumb', t.thumbnail_url, 'name', t.name, 'photo', t.photo, 'views', t.views)), '[]'::jsonb) into v_top from (
    select x.id, x.video_url, x.platform, x.thumbnail_url, pr.name, pr.photo_url photo, round(sum(r.gained))::bigint views
      from _vip_rg r join public.vip_videos x on x.id = r.video_id join public.profiles pr on pr.id = x.profile_id
     where r.d between p_from and p_to group by x.id, pr.name, pr.photo_url order by sum(r.gained) desc limit 6
  ) t;

  select count(*) into v_before from public.vip_members_live vm where vm.programme_id = any (v_ids) and vm.status <> 'left' and not public.vip_hidden_profile(vm.profile_id) and vm.joined_on < p_from;
  select count(*) into v_now from public.vip_members_live vm where vm.programme_id = any (v_ids) and vm.status = 'active' and not public.vip_hidden_profile(vm.profile_id);

  return jsonb_build_object('from', p_from, 'to', p_to, 'days', v_len, 'daily', v_daily, 'totals', v_cur, 'prev', v_prev,
    'platforms', v_plat, 'creators', v_creators, 'top_videos', v_top, 'members_before', v_before, 'members_now', v_now);
end $function$;

CREATE OR REPLACE FUNCTION public.vip_analytics(p_programme uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_months jsonb; v_top jsonb; v_ids uuid[];
begin
  if p_programme is null then
    select array_agg(id) into v_ids from public.vip_programmes where public.vip_can_see(id) and kind = 'vip';
    if v_ids is null then raise exception 'Not yours to see.'; end if;
  else
    if not public.vip_can_see(p_programme) then raise exception 'Not yours to see.'; end if;
    v_ids := array[p_programme];
  end if;

  create temporary table if not exists _vip_mr (year int, month int, month_status text, profile_id uuid, views bigint, videos int, base numeric, bonus numeric, live boolean) on commit drop;
  truncate _vip_mr;
  insert into _vip_mr select * from public.vip_month_rows(v_ids);

  select coalesce(jsonb_agg(jsonb_build_object(
      'year', y, 'month', mth, 'live', live,
      'views', views, 'cost', cost, 'members', members, 'videos', videos,
      'cpm', case when views > 0 then round(cost / (views / 1000.0), 4) end,
      'rate', case when views > 0 then round(base / (views / 1000.0), 4) end,
      'base', base, 'bonus', cost - base, 'new_members', new_members, 'top', top) order by y, mth), '[]'::jsonb)
    into v_months
    from (
      select u.year y, u.month mth, bool_or(u.live and u.month_status = 'open') live,
             coalesce(sum(u.views), 0) views, coalesce(sum(u.base + u.bonus), 0) cost,
             count(distinct u.profile_id) filter (where u.views > 0) members,
             coalesce(sum(u.videos), 0) videos, coalesce(sum(u.base), 0) base,
             (select count(*) from public.vip_members_live vm where vm.programme_id = any (v_ids) and not public.vip_hidden_profile(vm.profile_id)
                 and vm.joined_on >= make_date(u.year, u.month, 1) and vm.joined_on < make_date(u.year, u.month, 1) + interval '1 month') new_members,
             (select jsonb_build_object('name', pr2.name, 'views', u2.views) from _vip_mr u2
                join public.profiles pr2 on pr2.id = u2.profile_id
               where u2.year = u.year and u2.month = u.month and u2.views > 0 order by u2.views desc limit 1) top
        from _vip_mr u
       group by u.year, u.month
       order by u.year desc, u.month desc limit 12
    ) t;

  select coalesce(jsonb_agg(jsonb_build_object('profile_id', profile_id, 'name', name, 'photo', photo, 'views', views, 'earned', earned, 'months', months, 'videos', videos, 'bonus', bonus)
                            order by views desc), '[]'::jsonb)
    into v_top from (
      select u.profile_id, pr.name, pr.photo_url photo, sum(u.views) views, sum(u.base + u.bonus) earned,
             count(*) filter (where u.views > 0) months, sum(u.videos) videos, sum(u.bonus) bonus
        from _vip_mr u join public.profiles pr on pr.id = u.profile_id
       group by u.profile_id, pr.name, pr.photo_url order by sum(u.views) desc limit 40
    ) z;

  return jsonb_build_object('months', v_months, 'top', v_top,
    'members', (select count(*) from public.vip_members_live where programme_id = any (v_ids) and status = 'active' and not public.vip_hidden_profile(profile_id)),
    'totals', (select jsonb_build_object('views', coalesce(sum(u.views), 0), 'cost', coalesce(sum(u.base + u.bonus), 0), 'videos', coalesce(sum(u.videos), 0))
                 from _vip_mr u));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_views_gained(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_len int; v_pf date; v_pt date;
  v_vip_ok boolean; v_ids uuid[];
  v_daily jsonb; v_cur jsonb; v_prev jsonb; v_markets jsonb; v_top jsonb;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Pick a start day and an end day after it.'; end if;
  v_len := (p_to - p_from) + 1;
  if v_len > 400 then raise exception 'That is more than a year of days. Pick a shorter stretch.'; end if;
  v_pf := p_from - v_len; v_pt := p_from - 1;
  v_vip_ok := public.vip_has_access();
  v_ids := case when v_vip_ok then (select array_agg(id) from public.vip_programmes where active and kind = 'vip') else null end;

  create temporary table if not exists _vg_c (d date, submission_id uuid, creator uuid, market uuid, gained numeric) on commit drop;
  truncate _vg_c;
  insert into _vg_c
  with sub as (
    select s.id, s.creator_id, s.submitted_at,
           coalesce((select cm.community_id from public.community_members cm join public.communities c2 on c2.id = cm.community_id and c2.kind = 'chapter'
                      where cm.profile_id = s.creator_id and cm.status = 'active' order by cm.is_home desc, cm.joined_at limit 1), ch.community_id) market
      from public.submissions s
      join public.profiles p on p.id = s.creator_id
      left join public.challenges ch on ch.id = s.challenge_id
     where not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false)
  ), day_end as (
    select sn.submission_id, (sn.captured_at at time zone 'UTC')::date d, max(sn.views) v
      from public.view_snapshots sn join sub on sub.id = sn.submission_id
     where sn.captured_at >= (v_pf::timestamp - interval '1 day') and sn.captured_at < (p_to::timestamp + interval '1 day')
     group by 1, 2
  ), ordered as (
    select de.*, lag(de.v) over (partition by de.submission_id order by de.d) prev_v,
           row_number() over (partition by de.submission_id order by de.d) rn
      from day_end de
  )
  select o.d, o.submission_id, sub.creator_id, sub.market,
         greatest(o.v - coalesce(
           o.prev_v,
           (select max(y.views) from public.view_snapshots y where y.submission_id = o.submission_id and y.captured_at < (o.d::timestamp)),
           case when sub.submitted_at >= (o.d::timestamp - interval '3 days') then 0 else o.v end
         ), 0)::numeric
    from ordered o join sub on sub.id = o.submission_id
   where o.d between v_pf and p_to;

  create temporary table if not exists _vg_v (d date, profile_id uuid, video_id uuid, programme_id uuid, gained numeric, market uuid) on commit drop;
  truncate _vg_v;
  if v_vip_ok and v_ids is not null then
    insert into _vg_v
    select g.d, g.profile_id, g.video_id, g.programme_id, g.gained, vp.community_id
      from public.vip_daily_gained(v_ids, null, v_pf, p_to) g
      join public.vip_programmes vp on vp.id = g.programme_id
      join public.profiles p on p.id = g.profile_id
     where not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('d', s.d, 'community', round(coalesce(c.g, 0))::bigint, 'vip', round(coalesce(v.g, 0))::bigint) order by s.d), '[]'::jsonb)
    into v_daily
    from (select generate_series(p_from, p_to, interval '1 day')::date d) s
    left join (select d, sum(gained) g from _vg_c where d between p_from and p_to group by d) c on c.d = s.d
    left join (select d, sum(gained) g from _vg_v where d between p_from and p_to group by d) v on v.d = s.d;

  select jsonb_build_object(
      'community', round(coalesce((select sum(gained) from _vg_c where d between p_from and p_to), 0))::bigint,
      'vip', round(coalesce((select sum(gained) from _vg_v where d between p_from and p_to), 0))::bigint,
      'videos', (select count(*) from public.submissions s join public.profiles p on p.id = s.creator_id
                  where not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false) and s.submitted_at::date between p_from and p_to),
      'vip_videos', case when v_vip_ok then (select count(*) from public.vip_videos x join public.profiles p on p.id = x.profile_id
                  where not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false) and x.status <> 'removed' and coalesce(x.posted_at, x.submitted_at)::date between p_from and p_to) else 0 end,
      'active_creators', (select count(distinct creator) from _vg_c where d between p_from and p_to and gained > 0)
                          + (select count(distinct profile_id) from _vg_v where d between p_from and p_to and gained > 0),
      'new_members', (select count(*) from public.profiles p where p.status = 'active' and not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false)
                       and p.accepted_at::date between p_from and p_to))
    into v_cur;
  select jsonb_build_object(
      'community', round(coalesce((select sum(gained) from _vg_c where d between v_pf and v_pt), 0))::bigint,
      'vip', round(coalesce((select sum(gained) from _vg_v where d between v_pf and v_pt), 0))::bigint,
      'videos', (select count(*) from public.submissions s join public.profiles p on p.id = s.creator_id
                  where not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false) and s.submitted_at::date between v_pf and v_pt),
      'vip_videos', case when v_vip_ok then (select count(*) from public.vip_videos x join public.profiles p on p.id = x.profile_id
                  where not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false) and x.status <> 'removed' and coalesce(x.posted_at, x.submitted_at)::date between v_pf and v_pt) else 0 end,
      'new_members', (select count(*) from public.profiles p where p.status = 'active' and not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false)
                       and p.accepted_at::date between v_pf and v_pt))
    into v_prev;

  select coalesce(jsonb_agg(row_to_json(m)::jsonb order by m.combined desc, m.name), '[]'::jsonb) into v_markets from (
    select c.id, c.name, c.slug,
           round(coalesce((select sum(g.gained) from _vg_c g where g.market = c.id and g.d between p_from and p_to), 0))::bigint community,
           round(coalesce((select sum(g.gained) from _vg_v g where g.market = c.id and g.d between p_from and p_to), 0))::bigint vip,
           round(coalesce((select sum(g.gained) from _vg_c g where g.market = c.id and g.d between p_from and p_to), 0)
               + coalesce((select sum(g.gained) from _vg_v g where g.market = c.id and g.d between p_from and p_to), 0))::bigint combined,
           round(coalesce((select sum(g.gained) from _vg_c g where g.market = c.id and g.d between v_pf and v_pt), 0)
               + coalesce((select sum(g.gained) from _vg_v g where g.market = c.id and g.d between v_pf and v_pt), 0))::bigint prev_combined,
           (select count(*) from public.submissions s join public.profiles p on p.id = s.creator_id
             where not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false) and s.submitted_at::date between p_from and p_to
               and (select cm.community_id from public.community_members cm join public.communities c2 on c2.id = cm.community_id and c2.kind = 'chapter'
                     where cm.profile_id = s.creator_id and cm.status = 'active' order by cm.is_home desc, cm.joined_at limit 1) = c.id) videos,
           (select count(*) from public.profiles p where p.status = 'active' and not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false)
              and p.accepted_at::date between p_from and p_to
              and (select cm.community_id from public.community_members cm join public.communities c2 on c2.id = cm.community_id and c2.kind = 'chapter'
                    where cm.profile_id = p.id and cm.status = 'active' order by cm.is_home desc, cm.joined_at limit 1) = c.id) new_members,
           (select count(distinct x.creator) from (select creator, market from _vg_c where d between p_from and p_to and gained > 0
                                                   union select profile_id, market from _vg_v where d between p_from and p_to and gained > 0) x where x.market = c.id) active_creators
      from public.communities c where c.kind = 'chapter'
  ) m;

  select coalesce(jsonb_agg(t order by t.views desc), '[]'::jsonb) into v_top from (
    select * from (
      select s.id, s.video_url url, s.platform, s.thumbnail_url thumb, pr.name, round(sum(g.gained))::bigint views, false vip
        from _vg_c g join public.submissions s on s.id = g.submission_id join public.profiles pr on pr.id = s.creator_id
       where g.d between p_from and p_to group by s.id, pr.name
      union all
      select x.id, x.video_url, x.platform, x.thumbnail_url, pr.name, round(sum(g.gained))::bigint, true
        from _vg_v g join public.vip_videos x on x.id = g.video_id join public.profiles pr on pr.id = x.profile_id
       where g.d between p_from and p_to group by x.id, pr.name
    ) u order by u.views desc limit 6
  ) t;

  return jsonb_build_object('from', p_from, 'to', p_to, 'days', v_len, 'vip_visible', v_vip_ok,
    'daily', v_daily, 'totals', v_cur, 'prev', v_prev, 'markets', v_markets, 'top_videos', v_top);
end $function$;

CREATE OR REPLACE FUNCTION public.vip_announce(p_programme uuid, p_title text, p_body text, p_pinned boolean DEFAULT true, p_days integer DEFAULT NULL::integer, p_everywhere boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_recent int; v_group uuid := gen_random_uuid(); v_ends timestamptz; v_prog uuid; v_title text; v_first uuid;
        v_kind text := coalesce((select kind from public.vip_programmes where id = p_programme), 'vip');
begin
  if btrim(coalesce(p_body, '')) = '' then raise exception 'Write a message.'; end if;
  if p_everywhere then
    if not public.vip_scope_ok(null) then raise exception 'Only the owner and the VIP Worldwide lead can post to every VIP creator at once.'; end if;
  elsif not public.vip_can_manage(p_programme) then
    raise exception 'Only the team members who manage this programme can post to its VIPs.';
  end if;
  v_title := nullif(left(btrim(coalesce(p_title, '')), 120), '');
  v_ends := case when coalesce(p_days, 0) > 0 then now() + make_interval(days => least(p_days, 365)) end;
  for v_prog in select id from public.vip_programmes where (p_everywhere and active and kind = v_kind) or id = p_programme loop
    select count(*) into v_recent from public.vip_announcements where programme_id = v_prog and created_at > now() - interval '1 hour';
    if v_recent >= 10 then raise exception 'That is a lot of announcements in an hour. Please wait a little.'; end if;
    insert into public.vip_announcements (programme_id, title, body, pinned, created_by, expires_at, everywhere)
    values (v_prog, v_title, left(btrim(p_body), 2000), true, auth.uid(), v_ends, case when p_everywhere then v_group end)
    returning id into v_id;
    v_first := coalesce(v_first, v_id);
    insert into public.notifications (recipient_id, type, title, body, link)
    select m.profile_id, 'vip', coalesce(v_title, 'A note from the team'), left(btrim(p_body), 140), '/vip'
      from public.vip_members m
     where m.programme_id = v_prog and m.status in ('active', 'paused');
  end loop;
  return v_first;
end $function$;

CREATE OR REPLACE FUNCTION public.vip_save_brief(p_id uuid, p_programme uuid, p_year integer, p_month integer, p_title text, p_theme text, p_body text, p_hooks text[], p_metric text, p_target bigint, p_prize text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    select m.profile_id, 'vip', case when (select kind from public.vip_programmes where id = p_programme) = 'official' then 'New challenge: ' else 'New VIP challenge: ' end || left(btrim(p_title), 100),
           left(coalesce(nullif(btrim(coalesce(p_theme, '')), ''), btrim(coalesce(p_body, ''))), 140), '/vip'
      from public.vip_members m
     where m.status = 'active' and (m.programme_id = p_programme
        or (p_programme is null and m.programme_id in (select id from public.vip_programmes where kind = 'vip')));
  end if;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.vip_map()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_all boolean := public.vip_has_access(); v_kind text := public.vip_my_kind();
begin
  if not (v_all or public.is_active_vip()) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', pf.id, 'name', pf.name, 'photo_url', pf.photo_url, 'city', pf.city, 'country', pf.country,
        'city_lat', pf.city_lat, 'city_lng', pf.city_lng, 'countries_visited', pf.countries_visited,
        'headline', m.headline, 'programme', pr.name, 'accent', m.accent, 'kind', pr.kind))
      from public.vip_members m
      join public.vip_programmes pr on pr.id = m.programme_id
      join public.profiles pf on pf.id = m.profile_id
     where m.status = 'active' and m.show_on_map and pf.show_on_map is not false and pf.status = 'active'
       and (not pf.is_test or v_all)
       and (v_all or pr.kind = v_kind)
       and not public.vip_hidden_profile(pf.id)), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.on_announcement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  place_name text;
  route      text;
  rec        record;
  v_key      text := public.channel_key(coalesce(new.channel, ''));
begin
  if v_key not in ('announcements', 'vip_announcements') then return new; end if;
  if coalesce(new.deleted, false) then return new; end if;
  if coalesce(new.body, '') = '' and new.image_url is null and new.video_url is null then
    return new;
  end if;

  route := public.channel_route(new.channel);
  select name into place_name from public.communities where id = new.community_id;

  if v_key = 'vip_announcements' then
    -- The VIPs of this market (active or paused), and nobody else.
    for rec in
      select vm.profile_id as id
        from public.vip_members vm
        join public.vip_programmes pr on pr.id = vm.programme_id
        join public.profiles p on p.id = vm.profile_id
       where pr.community_id = new.community_id and pr.kind = 'vip' and vm.status in ('active', 'paused')
         and vm.profile_id is distinct from new.sender_id
         and p.status = 'active' and not coalesce(p.is_test, false)
    loop
      perform public.notify_user(rec.id, 'announcement', 'New VIP announcement',
        left(coalesce(nullif(trim(regexp_replace(new.body, '\*\*', '', 'g')), ''), 'Open the room to read it'), 140), route);
    end loop;
    return new;
  end if;

  -- NOT notify_all: an announcement in a market is an announcement to that market. And not to its active VIPs,
  -- who have their own announcements room (migration 307).
  for rec in
    select p.id
    from public.profiles p
    where p.id is distinct from new.sender_id
      and p.status = 'active'
      and not coalesce(p.is_test, false)
      and (p.is_admin or not exists (select 1 from public.vip_members vm where vm.profile_id = p.id and vm.status = 'active'))
      and (
        new.community_id is null
        or exists (
          select 1 from public.community_members cm
          where cm.community_id = new.community_id
            and cm.profile_id = p.id
            and cm.status = 'active'
        )
      )
  loop
    perform public.notify_user(
      rec.id,
      'announcement',
      case when place_name is null or place_name = 'Worldwide'
        then 'New announcement'
        else 'New announcement in ' || place_name end,
      left(coalesce(nullif(trim(new.body), ''), 'Open the room to read it'), 140),
      route
    );
  end loop;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.vip_market_standings()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_all boolean := public.vip_has_access(); p record; mo public.vip_months; pm public.vip_months;
  v_members int; v_videos int; v_views bigint; v_prev bigint; v_spend numeric; v_top_name text; v_top_views bigint;
  v_out jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not (v_all or public.is_active_vip()) then return '[]'::jsonb; end if;
  for p in select pr.*, c.slug as cslug, c.country_codes as ccodes, c.language as clang
             from public.vip_programmes pr join public.communities c on c.id = pr.community_id
            where (pr.active or public.is_owner()) and (v_all or pr.id = public.vip_my_programme()) order by pr.name loop
    mo := public.vip_ensure_month(p.id);
    select * into pm from public.vip_months where programme_id = p.id and (year * 12 + month) = (mo.year * 12 + mo.month) - 1;
    select count(*) filter (where m.status = 'active'), coalesce(sum(s.videos), 0), coalesce(sum(s.views), 0),
           coalesce(sum(least(coalesce(m.monthly_cap, p.monthly_cap, 1e12), public.vip_views_pay(coalesce(s.views, 0), coalesce(m.cpm, p.cpm), coalesce(m.tiers, p.tiers), case when m.tiers is null then m.cpm end))), 0)
      into v_members, v_videos, v_views, v_spend
      from public.vip_members m
      join public.profiles pf on pf.id = m.profile_id and (not pf.is_test or v_all) and not public.vip_hidden_profile(pf.id)
      left join public.vip_month_stats(mo.id) s on s.profile_id = m.profile_id
     where m.programme_id = p.id and m.status <> 'left';
    v_prev := 0;
    if pm.id is not null then
      select coalesce(sum(s.views), 0) into v_prev from public.vip_month_stats(pm.id) s
       where not public.vip_hidden_profile(s.profile_id);
    end if;
    v_top_name := null; v_top_views := null;
    select split_part(pf.name, ' ', 1), s.views into v_top_name, v_top_views
      from public.vip_month_stats(mo.id) s
      join public.profiles pf on pf.id = s.profile_id and (not pf.is_test or v_all) and not public.vip_hidden_profile(pf.id)
      join public.vip_members m on m.profile_id = s.profile_id and m.status = 'active' and m.programme_id = p.id
     order by s.views desc limit 1;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'programme_id', p.id, 'name', p.name, 'slug', p.cslug, 'country_codes', p.ccodes, 'language', p.clang,
      'accent', p.accent, 'tagline', p.tagline, 'mine', p.id = public.vip_my_programme(), 'kind', p.kind,
      'members', v_members, 'videos', v_videos, 'views', v_views, 'prev_views', v_prev,
      'avg_views', case when v_members > 0 then round(v_views::numeric / v_members) else 0 end,
      'month', mo.month, 'year', mo.year,
      'top_name', v_top_name, 'top_views', coalesce(v_top_views, 0),
      'spend', case when v_all then v_spend end, 'budget', case when v_all then p.budget_monthly end, 'currency', p.currency));
  end loop;
  return v_out;
end $function$;

CREATE OR REPLACE FUNCTION public.vip_my_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m public.vip_members; p public.vip_programmes; mo public.vip_months;
  v_views bigint := 0; v_videos int := 0; v_base numeric; v_cap numeric; v_f numeric; v_proj_views numeric;
  v_videos_json jsonb; v_life record; v_rank int; v_total int; v_pay boolean;
begin
  select * into m from public.vip_members where profile_id = public.vip_who();
  if m is null then return null; end if;
  select * into p from public.vip_programmes where id = m.programme_id;
  mo := public.vip_ensure_month(p.id);

  select s.videos, s.views into v_videos, v_views from public.vip_month_stats(mo.id) s where s.profile_id = public.vip_who();
  v_views := coalesce(v_views, 0); v_videos := coalesce(v_videos, 0);
  v_base := public.vip_views_pay(v_views, coalesce(m.cpm, p.cpm), coalesce(m.tiers, p.tiers), case when m.tiers is null then m.cpm end);
  v_cap := coalesce(m.monthly_cap, p.monthly_cap);
  if v_cap is not null and v_base > v_cap then v_base := v_cap; end if;

  v_f := greatest(0.0001, least(1, extract(epoch from (now() - mo.starts_at)) / nullif(extract(epoch from (mo.ends_at - mo.starts_at)), 0)));
  v_proj_views := case when v_f >= 0.08 then round(v_views / v_f) else null end;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', v.id, 'platform', v.platform, 'url', v.video_url, 'caption', v.caption, 'thumb', v.thumbnail_url,
      'posted_at', v.posted_at, 'submitted_at', v.submitted_at, 'views_total', v.logged_views,
      'views_counted', public.vip_video_counted(v, mo), 'status', v.status, 'reason', v.disqualified_reason,
      'synced_at', v.views_synced_at, 'error', v.views_sync_error, 'approx', v.views_approx)
      order by v.submitted_at desc), '[]'::jsonb)
    into v_videos_json from public.vip_videos v where v.profile_id = public.vip_who();

  select coalesce(sum(s.views), 0) as views, coalesce(sum(s.videos), 0) as videos, coalesce(max(s.base), 0) as best, coalesce(max(s.views), 0) as best_views
    into v_life from public.vip_statements s where s.profile_id = public.vip_who() and s.status <> 'void' and s.month_id <> mo.id;

  select rk, n into v_rank, v_total from (
    select profile_id, row_number() over (order by views desc, profile_id) rk, count(*) over () n
      from public.vip_month_stats(mo.id)) z where z.profile_id = public.vip_who();

  v_pay := public.vip_payment_ready(public.vip_who(), p.currency);

  return jsonb_build_object(
    'programme', jsonb_build_object('id', p.id, 'name', p.name, 'currency', p.currency, 'cpm', p.cpm, 'tiers', p.tiers,
        'min_payout', p.min_payout, 'monthly_cap', p.monthly_cap, 'window_days', p.window_days,
        'terms', p.terms, 'terms_version', p.terms_version, 'community_id', p.community_id, 'kind', p.kind),
    'member', jsonb_build_object('status', m.status, 'cpm', m.cpm, 'monthly_cap', m.monthly_cap,
        'target_videos', m.target_videos, 'target_views', m.target_views, 'own_goal_views', m.own_goal_views, 'tiers', m.tiers, 'monthly_fee', m.monthly_fee,
        'fee_min_videos', m.fee_min_videos, 'bonuses_on', m.bonuses_on, 'joined_on', m.joined_on, 'invoice_outside', m.invoice_outside,
        'terms_ok', public.vip_terms_ok(m.profile_id)),
    'month', jsonb_build_object('id', mo.id, 'year', mo.year, 'month', mo.month, 'starts_at', mo.starts_at,
        'ends_at', mo.ends_at, 'status', mo.status),
    'stats', jsonb_build_object('views', v_views, 'videos', v_videos, 'base', v_base,
        'effective_cpm', coalesce(m.cpm, p.cpm), 'projected_views', v_proj_views,
        'projected_base', case when v_proj_views is null then null
                               else least(coalesce(v_cap, 1e12), public.vip_views_pay(v_proj_views::bigint, coalesce(m.cpm, p.cpm), coalesce(m.tiers, p.tiers), case when m.tiers is null then m.cpm end)) end,
        'rank', v_rank, 'of', v_total),
    'lifetime', jsonb_build_object('views', v_life.views + v_views, 'videos', v_life.videos + v_videos, 'best_month', greatest(v_life.best, v_base), 'best_month_views', greatest(v_life.best_views, v_views)),
    'videos', v_videos_json,
    'payment_ready', v_pay);
end $function$;

CREATE OR REPLACE FUNCTION public.vip_staff_overview(p_programme uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p public.vip_programmes; mo public.vip_months;
  v_views bigint := 0; v_videos int := 0; v_base numeric := 0; v_members int := 0; v_posting int := 0;
  v_f numeric; v_proj numeric; v_progs jsonb;
begin
  if not public.vip_has_access() then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', pr.id, 'name', pr.name, 'kind', pr.kind, 'community_id', pr.community_id, 'country_codes', c.country_codes, 'slug', c.slug,
      'members', (select count(*) from public.vip_members_live m where m.programme_id = pr.id and m.status = 'active'
                    and not public.vip_hidden_profile(m.profile_id)))
      order by pr.kind desc, pr.name), '[]'::jsonb)
    into v_progs
    from public.vip_programmes pr
    left join public.communities c on c.id = pr.community_id
   where pr.active and public.vip_can_manage(pr.id);

  select * into p from public.vip_programmes pr
   where pr.active and public.vip_can_manage(pr.id) and (p_programme is null or pr.id = p_programme)
   order by pr.kind desc, pr.name limit 1;
  if p.id is null then return null; end if;

  mo := public.vip_ensure_month(p.id);

  select coalesce(sum(s.views), 0), coalesce(sum(s.videos), 0),
         coalesce(sum(least(coalesce(m.monthly_cap, p.monthly_cap, 1e12), public.vip_views_pay(s.views, coalesce(m.cpm, p.cpm), coalesce(m.tiers, p.tiers), case when m.tiers is null then m.cpm end))), 0),
         count(*) filter (where s.videos > 0)
    into v_views, v_videos, v_base, v_posting
    from public.vip_month_stats(mo.id) s
    join public.vip_members_live m on m.profile_id = s.profile_id and m.programme_id = p.id and m.status = 'active'
   where not public.vip_hidden_profile(s.profile_id);

  select count(*) into v_members from public.vip_members_live m
   where m.programme_id = p.id and m.status = 'active' and not public.vip_hidden_profile(m.profile_id);

  v_f := greatest(0.0001, least(1, extract(epoch from (now() - mo.starts_at)) / nullif(extract(epoch from (mo.ends_at - mo.starts_at)), 0)));
  v_proj := case when v_f >= 0.08 and v_f < 1 then round(v_base / v_f, 2) else null end;

  return jsonb_build_object(
    'staff', true,
    'programmes', v_progs,
    'programme', jsonb_build_object('id', p.id, 'name', p.name, 'currency', p.currency, 'cpm', p.cpm, 'tiers', p.tiers,
        'min_payout', p.min_payout, 'monthly_cap', p.monthly_cap, 'window_days', p.window_days,
        'terms', p.terms, 'terms_version', p.terms_version, 'community_id', p.community_id, 'kind', p.kind),
    'member', jsonb_build_object('status', 'active', 'cpm', null, 'monthly_cap', null, 'target_videos', null,
        'target_views', null, 'joined_on', null, 'terms_ok', true),
    'month', jsonb_build_object('id', mo.id, 'year', mo.year, 'month', mo.month, 'starts_at', mo.starts_at,
        'ends_at', mo.ends_at, 'status', mo.status),
    'stats', jsonb_build_object('views', v_views, 'videos', v_videos, 'base', v_base, 'effective_cpm', p.cpm,
        'projected_views', null, 'projected_base', v_proj, 'rank', null, 'of', v_members,
        'members', v_members, 'posting', v_posting),
    'lifetime', jsonb_build_object('views', v_views, 'videos', v_videos, 'best_month', v_base),
    'videos', '[]'::jsonb,
    'payment_ready', true);
end $function$;

CREATE OR REPLACE FUNCTION public.vip_compute_statements(p_month uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m public.vip_months; p public.vip_programmes; mem record; st record; rl record;
  v_count int := 0;
  v_views bigint; v_videos int; v_cpm numeric; v_base numeric; v_cap numeric; v_capped boolean;
  v_bonuses jsonb; v_cash numeric; v_adj jsonb; v_adj_sum numeric; v_roll_in numeric; v_total numeric; v_roll_out numeric;
  v_flags jsonb; v_rank int; v_places jsonb; v_pl jsonb; v_amt numeric; v_ok boolean;
  v_need_v int; v_need_w bigint; v_life bigint; v_lifev int; v_best numeric;
  v_prev uuid; v_months int; v_streak_ok boolean; v_bv uuid; v_bvviews bigint;
  v_existing record; v_has boolean; v_default uuid;
begin
  select * into m from public.vip_months where id = p_month;
  if m is null then raise exception 'No such month.'; end if;
  if auth.uid() is not null and not public.vip_can_manage(m.programme_id) then
    raise exception 'Only the market lead or the team can do that.';
  end if;
  select * into p from public.vip_programmes where id = m.programme_id;
  -- 376: bonuses set for every VIP live on the default VIP programme and reach VIP programmes only; an official
  -- programme runs its own bonuses and is never ranked against the VIPs.
  select id into v_default from public.vip_programmes where is_default and kind = p.kind limit 1;

  create temporary table if not exists _vip_stats (profile_id uuid, videos int, views bigint, programme_id uuid) on commit drop;
  truncate _vip_stats;
  insert into _vip_stats select s.profile_id, s.videos, s.views, m.programme_id from public.vip_month_stats(p_month) s;
  insert into _vip_stats select vm.profile_id, 0, 0, m.programme_id from public.vip_members vm
   where vm.programme_id = m.programme_id and vm.status = 'active'
     and not exists (select 1 from _vip_stats x where x.profile_id = vm.profile_id);

  for mem in
    select vm.*, pr.name as person from public.vip_members vm
      join public.profiles pr on pr.id = vm.profile_id
     where vm.programme_id = m.programme_id
       and vm.profile_id in (select profile_id from _vip_stats)
       and not coalesce(vm.invoice_outside, false)
  loop
    select * into v_existing from public.vip_statements where month_id = p_month and profile_id = mem.profile_id;
    v_has := found;
    if v_has and v_existing.status <> 'draft' then continue; end if;

    select x.videos, x.views into v_videos, v_views from _vip_stats x where x.profile_id = mem.profile_id;
    v_views := coalesce(v_views, 0); v_videos := coalesce(v_videos, 0);
    v_cpm := coalesce(mem.cpm, p.cpm);
    v_base := public.vip_views_pay(v_views, coalesce(mem.cpm, p.cpm), coalesce(mem.tiers, p.tiers), case when mem.tiers is null then mem.cpm end);
    v_cap := coalesce(mem.monthly_cap, p.monthly_cap);
    v_capped := false;
    if v_cap is not null and v_base > v_cap then v_base := v_cap; v_capped := true; end if;

    if v_has then delete from public.vip_bonus_awards where statement_id = v_existing.id; end if;

    v_bonuses := '[]'::jsonb;
    for rl in
      select * from public.vip_bonus_rules r
       where r.active and coalesce(mem.bonuses_on, true)
         and (r.programme_id = m.programme_id or (r.audience = 'all' and r.programme_id = v_default))
         and (r.month_id = p_month
              or (r.month_id is null and (r.for_year is null or (m.year = r.for_year and m.month = r.for_month)))
              or (r.audience = 'all' and r.month_id is not null and exists (select 1 from public.vip_months rm where rm.id = r.month_id and rm.year = m.year and rm.month = m.month)))
       order by r.created_at
    loop
      v_ok := false; v_amt := rl.amount;

      if rl.kind = 'target' then
        v_need_v := case when coalesce((rl.conditions ->> 'own')::boolean, true) then mem.target_videos end;
        v_need_w := case when coalesce((rl.conditions ->> 'own')::boolean, true) then mem.target_views end;
        if v_need_v is null then v_need_v := nullif((rl.conditions ->> 'videos'), '')::int; end if;
        if v_need_w is null then v_need_w := nullif((rl.conditions ->> 'views'), '')::bigint; end if;
        if v_need_v is not null or v_need_w is not null then
          v_ok := (v_need_v is null or v_videos >= v_need_v) and (v_need_w is null or v_views >= v_need_w);
        end if;
        if v_ok and rl.multiplier is not null then v_amt := v_amt + round(v_base * (rl.multiplier - 1), 2); end if;
        if v_ok and v_amt > 0 then
          v_bonuses := v_bonuses || jsonb_build_object('rule_id', rl.id, 'label', rl.label, 'kind', rl.kind, 'reward', rl.reward, 'amount', v_amt);
        end if;

      elsif rl.kind = 'top_n' then
        v_places := rl.places;
        if rl.scope = 'global' or rl.audience = 'all' then
          select rk into v_rank from (
            select profile_id, row_number() over (order by views desc, profile_id) rk
              from (
                select s.profile_id, s.views from public.vip_months mm
                  cross join lateral public.vip_month_stats(mm.id) s
                 where mm.year = m.year and mm.month = m.month and s.views > 0
                   and mm.programme_id in (select id from public.vip_programmes where kind = p.kind)
              ) g
          ) z where z.profile_id = mem.profile_id;
        else
          select rk into v_rank from (
            select profile_id, row_number() over (order by views desc, profile_id) rk
              from _vip_stats where views > 0
          ) z where z.profile_id = mem.profile_id;
        end if;
        if v_rank is not null then
          for v_pl in select * from jsonb_array_elements(v_places) loop
            if (v_pl ->> 'place')::int = v_rank and coalesce((v_pl ->> 'amount')::numeric, 0) > 0 then
              v_bonuses := v_bonuses || jsonb_build_object('rule_id', rl.id,
                'label', rl.label || ' (' || v_rank || case v_rank when 1 then 'st' when 2 then 'nd' when 3 then 'rd' else 'th' end || ')',
                'kind', rl.kind, 'reward', coalesce(v_pl ->> 'reward', rl.reward), 'amount', (v_pl ->> 'amount')::numeric);
            end if;
          end loop;
        end if;

      elsif rl.kind = 'best_video' then
        if rl.scope = 'global' or rl.audience = 'all' then
          select v.profile_id, public.vip_video_counted(v, mm) into v_bv, v_bvviews
            from public.vip_months mm join public.vip_videos v on v.programme_id = mm.programme_id
           where mm.year = m.year and mm.month = m.month
             and mm.programme_id in (select id from public.vip_programmes where kind = p.kind)
           order by public.vip_video_counted(v, mm) desc limit 1;
        else
          select v.profile_id, public.vip_video_counted(v, m) into v_bv, v_bvviews
            from public.vip_videos v where v.programme_id = m.programme_id
           order by public.vip_video_counted(v, m) desc limit 1;
        end if;
        if v_bv = mem.profile_id and coalesce(v_bvviews, 0) > 0 and rl.amount > 0 then
          v_bonuses := v_bonuses || jsonb_build_object('rule_id', rl.id, 'label', rl.label, 'kind', rl.kind, 'reward', rl.reward, 'amount', rl.amount);
        end if;

      elsif rl.kind = 'streak' then
        v_months := greatest(2, coalesce((rl.conditions ->> 'months')::int, 3));
        v_need_v := greatest(1, coalesce((rl.conditions ->> 'min_videos')::int, 1));
        v_streak_ok := true;
        for st in
          select mm.id from public.vip_months mm
           where mm.programme_id = m.programme_id and mm.starts_at <= m.starts_at
           order by mm.starts_at desc limit v_months
        loop
          if coalesce((select s.videos from public.vip_month_stats(st.id) s where s.profile_id = mem.profile_id), 0) < v_need_v then
            v_streak_ok := false;
          end if;
          v_months := v_months - 1;
        end loop;
        if v_streak_ok and v_months = 0 then
          v_amt := round(v_base * coalesce((rl.conditions ->> 'pct')::numeric, 10) / 100.0, 2) + rl.amount;
          if v_amt > 0 then
            v_bonuses := v_bonuses || jsonb_build_object('rule_id', rl.id, 'label', rl.label, 'kind', rl.kind, 'reward', rl.reward, 'amount', v_amt);
          end if;
        end if;

      elsif rl.kind = 'milestone' then
        if not exists (select 1 from public.vip_bonus_awards a where a.rule_id = rl.id and a.profile_id = mem.profile_id) then
          select coalesce(sum(s.views), 0), coalesce(sum(s.videos), 0), coalesce(max(s.base), 0)
            into v_life, v_lifev, v_best
            from public.vip_statements s
           where s.profile_id = mem.profile_id and s.status <> 'void' and s.month_id <> p_month;
          v_ok := case coalesce(rl.conditions ->> 'metric', 'lifetime_views')
            when 'lifetime_views' then (v_life + v_views) >= coalesce((rl.conditions ->> 'threshold')::numeric, 1e18)
            when 'lifetime_videos' then (v_lifev + v_videos) >= coalesce((rl.conditions ->> 'threshold')::numeric, 1e18)
            when 'month_earnings' then v_base >= coalesce((rl.conditions ->> 'threshold')::numeric, 1e18)
            when 'month_views' then v_views >= coalesce((rl.conditions ->> 'threshold')::numeric, 1e18)
            when 'month_videos' then v_videos >= coalesce((rl.conditions ->> 'threshold')::numeric, 1e18)
            when 'best_video_views' then public.vip_metric(mem.profile_id, 'best_video_views') >= coalesce((rl.conditions ->> 'threshold')::numeric, 1e18)
            when 'lifetime_earnings' then (select coalesce(sum(s.base), 0) from public.vip_statements s where s.profile_id = mem.profile_id and s.status <> 'void' and s.month_id <> p_month) + v_base >= coalesce((rl.conditions ->> 'threshold')::numeric, 1e18)
            when 'months_active' then public.vip_metric(mem.profile_id, 'months_active') >= coalesce((rl.conditions ->> 'threshold')::numeric, 1e18)
            when 'streak_months' then (public.vip_metric(mem.profile_id, 'streak_months') + case when v_videos >= 1 then 1 else 0 end) >= coalesce((rl.conditions ->> 'threshold')::numeric, 1e18)
            else false end;
          if v_ok and rl.amount > 0 then
            v_bonuses := v_bonuses || jsonb_build_object('rule_id', rl.id, 'label', rl.label, 'kind', rl.kind, 'reward', rl.reward, 'amount', rl.amount);
          end if;
        end if;
      end if;
    end loop;

    -- THE MONTHLY FEE (migration 311): a fixed cash line, paid to an active VIP who posted at least the videos
    -- it asks for (none, unless set).
    if coalesce(mem.monthly_fee, 0) > 0 and mem.status = 'active' and v_videos >= coalesce(mem.fee_min_videos, 0) then
      v_bonuses := v_bonuses || jsonb_build_object('rule_id', null, 'label', 'Monthly fee', 'kind', 'fee', 'reward', 'cash', 'amount', mem.monthly_fee);
    end if;
    select coalesce(sum((b ->> 'amount')::numeric) filter (where coalesce(b ->> 'reward', 'cash') = 'cash'), 0)
      into v_cash from jsonb_array_elements(v_bonuses) b;
    v_adj := case when v_has then coalesce(v_existing.adjustments, '[]'::jsonb) else '[]'::jsonb end;
    select coalesce(sum((a ->> 'amount')::numeric), 0) into v_adj_sum from jsonb_array_elements(v_adj) a;
    select coalesce(s.rollover_out, 0) into v_roll_in
      from public.vip_statements s
      join public.vip_months pm on pm.id = s.month_id
     where s.profile_id = mem.profile_id and s.status <> 'void' and pm.programme_id = m.programme_id and pm.starts_at < m.starts_at
     order by pm.starts_at desc limit 1;
    -- THE BALANCE CARRIES MONEY FORWARD NOW (migration 312), so a statement is what the month earned, in full.
    v_roll_in := 0;
    v_total := round(v_base + v_cash + v_adj_sum, 2);
    v_roll_out := 0;

    v_flags := '[]'::jsonb;
    if not public.vip_payment_ready(mem.profile_id, p.currency) then v_flags := v_flags || '"no_payment_details"'::jsonb; end if;
    if mem.status <> 'active' then v_flags := v_flags || '"not_active"'::jsonb; end if;
    if v_views = 0 then v_flags := v_flags || '"no_views"'::jsonb; end if;
    if mem.status = 'active' and not coalesce((public.vip_req_check(mem.profile_id, p_month) ->> 'met')::boolean, true) then
      v_flags := v_flags || '"missed_requirement"'::jsonb;
    end if;
    if exists (select 1 from public.vip_videos x where x.profile_id = mem.profile_id and x.status = 'disqualified'
                and x.disqualified_at >= m.starts_at) then
      v_flags := v_flags || '"video_disqualified"'::jsonb;
    end if;
    if exists (select 1 from public.vip_videos x where x.profile_id = mem.profile_id and x.status = 'tracking'
                and x.views_sync_error is not null) then
      v_flags := v_flags || '"unreadable_video"'::jsonb;
    end if;

    insert into public.vip_statements as s (programme_id, month_id, profile_id, views, videos, cpm, base, cap, cap_applied,
        bonuses, adjustments, rollover_in, rollover_out, total, currency, flags, status, updated_at)
    values (m.programme_id, p_month, mem.profile_id, v_views, v_videos, v_cpm, v_base, v_cap, v_capped,
        v_bonuses, v_adj, v_roll_in, v_roll_out, v_total, p.currency, v_flags, 'draft', now())
    on conflict (month_id, profile_id) do update set
        views = excluded.views, videos = excluded.videos, cpm = excluded.cpm, base = excluded.base, cap = excluded.cap,
        cap_applied = excluded.cap_applied, bonuses = excluded.bonuses, rollover_in = excluded.rollover_in,
        rollover_out = excluded.rollover_out, total = excluded.total, currency = excluded.currency,
        flags = excluded.flags, updated_at = now()
      where s.status = 'draft'
    returning id into v_prev;

    insert into public.vip_bonus_awards (rule_id, profile_id, statement_id)
    select (b ->> 'rule_id')::uuid, mem.profile_id, v_prev
      from jsonb_array_elements(v_bonuses) b
     where b ->> 'kind' = 'milestone'
    on conflict do nothing;

    v_count := v_count + 1;
  end loop;
  return v_count;
end $function$;

CREATE OR REPLACE FUNCTION public.vip_notify_joined()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_prog text; v_name text; v_sent boolean; v_status text;
begin
  -- 376: a move made by vip_set_team sends its own notice.
  if coalesce(current_setting('tryp.vip_quiet', true), '') = 'on' then return null; end if;
  select name into v_prog from public.vip_programmes where id = new.programme_id;
  select name, coalesce(onboarded, false), status into v_name, v_sent, v_status from public.profiles where id = new.profile_id;

  if (tg_op = 'INSERT' and new.status = 'active')
     or (tg_op = 'UPDATE' and new.status = 'active' and (old.status = 'left' or old.programme_id is distinct from new.programme_id)) then
    if not coalesce(v_sent, false) then
      update public.vip_members set join_notice_pending = true where profile_id = new.profile_id;
      return null;
    end if;
    if tg_op = 'UPDATE' and old.auto_home and not new.auto_home and new.programme_id is distinct from old.programme_id then
      insert into public.notifications (recipient_id, type, title, body, link)
      values (new.profile_id, 'vip', 'You are in ' || coalesce(v_prog, 'your VIP programme'),
              'Your VIP place now sits with your own market, so your rooms, board and payouts are theirs.', '/vip');
      if v_status = 'active' then
        insert into public.notifications (recipient_id, type, title, body, link)
        select mgr, 'vip', coalesce(v_name, 'Someone') || ' joined ' || coalesce(v_prog, 'the VIP programme'),
               'They were approved into your market.', '/admin/vip?tab=members'
          from public.vip_manager_ids(new.programme_id) mgr where mgr <> new.profile_id;
      end if;
      return null;
    end if;
    perform public.vip_send_join_notices(new.profile_id);
  elsif tg_op = 'UPDATE' and new.status = 'left' and old.status <> 'left' then
    insert into public.notifications (recipient_id, type, title, body, link)
    values (new.profile_id, 'vip', 'You are back with the community creators',
            'Your VIP place has ended. The challenges, points and leaderboard are yours again, and past payouts are still paid.', '/challenges');
  elsif tg_op = 'UPDATE' and new.status = 'paused' and old.status = 'active' then
    insert into public.notifications (recipient_id, type, title, body, link)
    values (new.profile_id, 'vip', 'Your VIP place is paused', 'New views are not being counted while it is paused. Ask your market lead if that is a surprise.', '/vip');
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.vip_send_join_notices(p_profile uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m public.vip_members; v_prog text; v_kind text;
begin
  select * into m from public.vip_members where profile_id = p_profile and status = 'active';
  if m.profile_id is null then return; end if;
  select name, kind into v_prog, v_kind from public.vip_programmes where id = m.programme_id;
  if m.auto_home then
    insert into public.notifications (recipient_id, type, title, body, link)
    values (m.profile_id, 'vip', 'Welcome to the Tryp.com VIP creators',
            'Your application is with the team. Once you are approved you are placed in your VIP market.', '/vip');
  else
    insert into public.notifications (recipient_id, type, title, body, link)
    values (m.profile_id, 'vip', 'Welcome to ' || coalesce(v_prog, 'the VIP programme'),
            coalesce(nullif((select welcome_message from public.vip_programmes where id = m.programme_id), ''),
                     case when v_kind = 'official' then 'Your monthly fee and views pay, your board and your challenges are all on this page. Add your first video to start your month.'
                          else 'You are paid by the views your videos bring. Add your first video to start your month.' end), '/vip');
  end if;
  update public.vip_members set join_notice_pending = false where profile_id = p_profile;
end $function$;

CREATE OR REPLACE FUNCTION public.vip_nudges()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_quiet int := 0; v_end int := 0;
begin
  with quiet as (
    select m.profile_id from public.vip_members_live m
      join public.vip_programmes p on p.id = m.programme_id and p.active
     where m.status = 'active' and m.joined_on < current_date - 10
       and not exists (select 1 from public.vip_videos v where v.profile_id = m.profile_id and v.submitted_at > now() - interval '10 days')
       and not exists (select 1 from public.notifications n where n.recipient_id = m.profile_id and n.type = 'vip'
                        and n.title in ('Your VIP month is waiting for a video', 'Your month is waiting for a video') and n.created_at > now() - interval '10 days')
  ), ins as (
    insert into public.notifications (recipient_id, type, title, body, link)
    select profile_id, 'vip', case when public.vip_kind_of(profile_id) = 'official' then 'Your month is waiting for a video' else 'Your VIP month is waiting for a video' end, 'You have not added a video in ten days. Views only count while a video is tracked.', '/vip?tab=videos'
      from quiet returning 1)
  select count(*) into v_quiet from ins;

  with ending as (
    select m.profile_id, mo.id month_id, mo.ends_at from public.vip_members_live m
      join public.vip_months mo on mo.programme_id = m.programme_id and mo.status = 'open'
     where m.status = 'active' and mo.ends_at between now() and now() + interval '3 days'
       and not exists (select 1 from public.notifications n where n.recipient_id = m.profile_id and n.type = 'vip'
                        and n.title in ('Three days left in the VIP month', 'Three days left in the month') and n.created_at > mo.ends_at - interval '4 days')
  ), ins as (
    insert into public.notifications (recipient_id, type, title, body, link)
    select profile_id, 'vip', case when public.vip_kind_of(profile_id) = 'official' then 'Three days left in the month' else 'Three days left in the VIP month' end, 'See how far you have got and what it is worth so far.', '/vip'
      from ending returning 1)
  select count(*) into v_end from ins;
  return jsonb_build_object('quiet', v_quiet, 'ending', v_end);
end $function$;

CREATE OR REPLACE FUNCTION public.vip_weekly_digest()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p record; v_views bigint; v_new int; v_quiet int; v_n int := 0;
begin
  for p in select pr.id, pr.name from public.vip_programmes pr where pr.active
            and exists (select 1 from public.vip_members_live m where m.programme_id = pr.id and m.status = 'active') loop
    select coalesce(sum((d ->> 'views')::bigint), 0) into v_views
      from jsonb_array_elements(public.vip_trend_core(p.id, null, 7) -> 'daily') d;
    select count(*) into v_new from public.vip_videos where programme_id = p.id and submitted_at > now() - interval '7 days';
    select count(*) into v_quiet from public.vip_members_live m where m.programme_id = p.id and m.status = 'active'
       and m.joined_on < current_date - 10
       and not exists (select 1 from public.vip_videos v where v.profile_id = m.profile_id and v.submitted_at > now() - interval '10 days');
    insert into public.notifications (recipient_id, type, title, body, link)
    select mgr, 'vip', p.name || ': your week',
           to_char(v_views, 'FM999G999G999') || ' views gained, ' || v_new || ' videos added, ' || v_quiet || ' creators quiet for ten days.', '/vip?mode=tools'
      from public.vip_manager_ids(p.id) mgr;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$;

CREATE OR REPLACE FUNCTION public.vip_team_people()
 RETURNS TABLE(profile_id uuid, programme_id uuid, programme text, kind text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select m.profile_id, m.programme_id, p.name, 'staff'::text
    from public.vip_managers m
    join public.vip_programmes p on p.id = m.programme_id
   where public.vip_has_access() and not public.vip_hidden_profile(m.profile_id)
     and not coalesce((select is_test from public.profiles where id = m.profile_id), false)
  union all
  select v.profile_id, v.programme_id, p.name, 'creator'::text
    from public.vip_members v
    join public.vip_programmes p on p.id = v.programme_id
   where p.kind = 'official' and v.status <> 'left' and public.vip_has_access() and not public.vip_hidden_profile(v.profile_id)
     and not coalesce((select is_test from public.profiles where id = v.profile_id), false)
$function$;


-- MAKING SOMEBODY AN OFFICIAL CREATOR, OR TAKING THEM BACK TO THE VIPS. The old switch (migration 365) only set a label;
-- now it MOVES them: to the official programme of the same market (opened on first use, same managers as the VIP one),
-- with this month's videos, so their views, board place and pay go with them. Closed months stay where they were paid.
create or replace function public.vip_official_programme(p_community uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_vip public.vip_programmes; c public.communities;
begin
  select id into v_id from public.vip_programmes where community_id = p_community and kind = 'official';
  if v_id is not null then return v_id; end if;
  select * into c from public.communities where id = p_community;
  if c.id is null then raise exception 'No such market.'; end if;
  select * into v_vip from public.vip_programmes where community_id = p_community and kind = 'vip';
  insert into public.vip_programmes (community_id, kind, name, currency, cpm, min_payout, voucher_min, window_days, req_on,
                                     tagline, welcome_message, active, accent)
  values (p_community, 'official', 'Tryp.com Official ' || c.name, coalesce(v_vip.currency, c.currency, 'EUR'),
          coalesce(v_vip.cpm, 0.25), 0, 0, coalesce(v_vip.window_days, 60), false,
          'The official Tryp.com content creators', null, true, null)
  returning id into v_id;
  insert into public.vip_managers (profile_id, programme_id, added_by)
  select m.profile_id, v_id, m.added_by from public.vip_managers m where m.programme_id = v_vip.id
  on conflict do nothing;
  perform public.vip_ensure_rooms(v_id);
  perform public.vip_ensure_month(v_id);
  return v_id;
end $$;
create or replace function public.vip_set_team(p_profile uuid, p_programme uuid, p_team boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare m public.vip_members; cur public.vip_programmes; v_to uuid; mo public.vip_months; v_name text;
begin
  select * into m from public.vip_members where profile_id = p_profile;
  if m.profile_id is null then raise exception 'They are not in a VIP or official programme.'; end if;
  select * into cur from public.vip_programmes where id = m.programme_id;
  if not public.vip_can_manage(cur.id) then
    raise exception 'Only the team running this programme can change that.';
  end if;
  if coalesce(p_team, false) = (cur.kind = 'official') then return coalesce(p_team, false); end if;
  if p_team then
    v_to := public.vip_official_programme(cur.community_id);
  else
    select id into v_to from public.vip_programmes where community_id = cur.community_id and kind = 'vip';
    if v_to is null then raise exception 'This market has no VIP community to move them to.'; end if;
  end if;
  if not public.vip_can_manage(v_to) then raise exception 'You do not run the programme they would move to.'; end if;
  mo := public.vip_ensure_month(cur.id);
  perform set_config('tryp.vip_quiet', 'on', true);
  update public.vip_members set programme_id = v_to, is_team = coalesce(p_team, false), auto_home = false
   where profile_id = p_profile;
  update public.vip_videos set programme_id = v_to
   where profile_id = p_profile and programme_id = cur.id and coalesce(posted_at, submitted_at) >= mo.starts_at;
  perform set_config('tryp.vip_quiet', 'off', true);
  perform public.vip_ensure_month(v_to);
  select name into v_name from public.vip_programmes where id = v_to;
  insert into public.notifications (recipient_id, type, title, body, link)
  values (p_profile, 'vip',
          case when p_team then 'You are an official Tryp.com creator' else 'You are with the VIP creators' end,
          case when p_team then 'Your page, board, challenges and room are now the official creators'' own. This month''s videos came with you.'
               else 'Your page, board and room are the VIP community''s again. This month''s videos came with you.' end,
          '/vip');
  return coalesce(p_team, false);
end $$;

-- POLICIES: things set for "every VIP" (no programme, or audience 'all') are for VIPs, not for official creators.
drop policy if exists "vip briefs: read" on public.vip_briefs;
create policy "vip briefs: read" on public.vip_briefs for select using (
  (select public.vip_has_access() as gate)
  or ((select public.is_active_vip() as gate)
      and ((programme_id is null and (select public.vip_my_kind() as gate) = 'vip') or programme_id = (select public.vip_my_programme() as gate))));
drop policy if exists "vip guides: read" on public.vip_guides;
create policy "vip guides: read" on public.vip_guides for select using (
  (select public.vip_has_access() as gate)
  or (active and (select public.is_active_vip() as gate)
      and ((programme_id is null and (select public.vip_my_kind() as gate) = 'vip') or programme_id = (select public.vip_my_programme() as gate))));
drop policy if exists "vip perks: read" on public.vip_perks;
create policy "vip perks: read" on public.vip_perks for select using (
  (select public.vip_has_access() as gate)
  or (active and (select public.is_active_vip() as gate)
      and ((programme_id is null and (select public.vip_my_kind() as gate) = 'vip') or programme_id = (select public.vip_my_programme() as gate))));
drop policy if exists "vip rules: read" on public.vip_bonus_rules;
create policy "vip rules: read" on public.vip_bonus_rules for select using (
  public.vip_can_see(programme_id) or programme_id = (select public.vip_my_programme() as gate)
  or (audience = 'all' and (select public.vip_my_kind() as gate) = 'vip'));

-- AGREEMENTS: an official programme's own agreement, never the general VIP one. (agreement_for picks a programme's own
-- version first; an official creator with no official version published has nothing to sign rather than the VIP text.)
create or replace function public.agreement_for(p_audience text, p_profile uuid)
returns public.agreements language sql stable security definer set search_path = public as $$
  select a.* from public.agreements a
   where a.audience = p_audience and a.published_at is not null and a.published_at <= now()
     and ((a.programme_id is null and (p_audience <> 'vip' or coalesce(public.vip_kind_of(p_profile), 'vip') = 'vip'))
          or a.programme_id = (select programme_id from public.vip_members where profile_id = p_profile and status = 'active'))
   order by (a.programme_id is not null) desc, a.version desc
   limit 1
$$;


-- THE SIX: Marta del Valle, Paula Enamorado, Ariakna Valen, Yaiza, Sara Garcia Nunez and Julia Flores, all VIP Spain
-- with is_team set (migration 365). They move to Tryp.com Official Spain with their October videos (they have no
-- statements yet). Rates from Ethan, 10 Oct 2026: Marta D EUR 80 + 0.30, Ariakna EUR 100 + 0.30, Sara EUR 100 + 0.25,
-- Yaiza EUR 50 + 0.20. Paula and Julia invoice the team themselves, so their months are not drafted here.
-- Ariakna's signed agreement (25 Mar 2026): the EUR 100 is for 30 videos in the month and views pay is capped at EUR 900.
do $$
declare v_off uuid; v_spain uuid; mo public.vip_months;
begin
  select community_id into v_spain from public.vip_programmes where name = 'VIP Spain' and kind = 'vip';
  if v_spain is null then return; end if;
  v_off := public.vip_official_programme(v_spain);
  update public.vip_programmes set cpm = 0.30, name = 'Tryp.com Official Spain' where id = v_off;
  mo := public.vip_ensure_month((select id from public.vip_programmes where community_id = v_spain and kind = 'vip'));
  perform set_config('tryp.vip_quiet', 'on', true);
  update public.vip_videos v set programme_id = v_off
   where v.profile_id in (select profile_id from public.vip_members where is_team)
     and v.programme_id = (select id from public.vip_programmes where community_id = v_spain and kind = 'vip')
     and coalesce(v.posted_at, v.submitted_at) >= mo.starts_at;
  update public.vip_members set programme_id = v_off, auto_home = false where is_team;
  update public.vip_members set monthly_fee = 80, cpm = 0.30 where is_team and profile_id = '09e28d3f-16ff-499b-806c-373beca25719';
  update public.vip_members set monthly_fee = 100, cpm = 0.30, fee_min_videos = 30, monthly_cap = 900 where is_team and profile_id = '0226b2d0-7dbe-4e11-ade3-b69f1842073e';
  update public.vip_members set monthly_fee = 100, cpm = 0.25 where is_team and profile_id = '962ed464-9d76-4246-bcd6-a8987a5f845d';
  update public.vip_members set monthly_fee = 50, cpm = 0.20 where is_team and profile_id = '1c848370-954d-4d65-aeca-da5517af9953';
  update public.vip_members set invoice_outside = true where is_team and profile_id in ('279d3fd1-e435-4333-875a-07fb02d1fd83', '7d78652a-7039-4290-948c-44200bd54658');
  perform set_config('tryp.vip_quiet', 'off', true);
  perform public.vip_ensure_month(v_off);
  update public.profiles p set vip_kind = public.vip_kind_of(p.id) where p.is_vip or p.vip_kind is not null;
end $$;


-- vip_my_kind is read by policies, so it stays callable by signed-in people (it only answers about the caller).
insert into public.owner_only_rpcs (proname, why) values
  ('vip_kind_of',            'any creator''s programme kind (internal lookup)'),
  ('vip_official_programme', 'opens an official programme (called by vip_set_team only)')
on conflict (proname) do nothing;
select count(*) from public.lock_down_definer_functions();
revoke all on function public.vip_my_kind() from anon;
