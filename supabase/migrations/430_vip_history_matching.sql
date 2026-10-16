-- 430: WHO IS WHO IN THE SHEET, DECIDED BY THE TEAM; AND EVERY CREATOR'S OWN EARNINGS (16 Oct 2026).
--
-- 429 copied the "CPM VIP ES" sheet and matched its short names to profiles by guesswork (Mary = Mariam, Noeta = Noa,
-- Ariadna = Ariakna, Sara = Sara Garcia Nicolau). Ethan: "just add something that Marta, who knows them all, can match
-- the names, or maybe it's someone that is no longer with us, and in that case we should just have the history data."
--
-- So a name's match is now a DECISION with a status, one row per sheet name per market (`vip_history_names`):
--   suggested  the guess from 429. The team's analytics show it as a suggestion; the creator sees nothing yet.
--   confirmed  the team said this is them. Only now does the history count as theirs, everywhere.
--   former     somebody no longer with us: the history stays, under the sheet's name, with nobody's profile.
--   unmatched  not decided (Fatima and Ana, who are not on the platform).
-- `vip_earnings_history.profile_id` is kept equal to the CONFIRMED match only, so nothing reads a guess as a fact.
--
-- `vip_my_earnings()` is a creator's own all-time money: their confirmed sheet months plus every platform month after,
-- as `vip_who()` (so "See as a VIP" shows exactly what they see, through `vip_preview(..., 'earnings')`).

create table if not exists public.vip_history_names (
  community_id uuid not null references public.communities(id) on delete cascade,
  creator_name text not null,
  profile_id uuid references public.profiles(id) on delete set null,
  status text not null default 'unmatched' check (status in ('suggested', 'confirmed', 'former', 'unmatched')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  primary key (community_id, creator_name)
);
alter table public.vip_history_names enable row level security;
revoke all on public.vip_history_names from anon, authenticated;

insert into public.vip_history_names (community_id, creator_name, profile_id, status)
select p.community_id, h.creator_name, max(h.profile_id::text)::uuid,
       case when max(h.profile_id::text) is null then 'unmatched' else 'suggested' end
  from public.vip_earnings_history h join public.vip_programmes p on p.id = h.programme_id
 group by p.community_id, h.creator_name
on conflict do nothing;

-- Nothing is anybody's until the team confirms it.
update public.vip_earnings_history h set profile_id = null where h.profile_id is not null;

-- The names of a market's sheet, what each adds up to, who it is matched to, and who it could be.
create or replace function public.vip_history_names_list(p_programme uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_comm uuid; v_names jsonb; v_people jsonb;
begin
  if not public.vip_can_manage(p_programme) then raise exception 'Only the team running this market can match names.'; end if;
  select community_id into v_comm from public.vip_programmes where id = p_programme;

  select coalesce(jsonb_agg(jsonb_build_object(
           'name', n.creator_name, 'status', n.status, 'profile_id', n.profile_id,
           'profile_name', pf.name, 'photo_url', pf.photo_url,
           'decided_by', db.name, 'decided_at', n.decided_at,
           'months', t.months, 'views', t.views, 'earned', t.earned, 'first', t.first_m, 'last', t.last_m, 'series', t.series
         ) order by t.earned desc, n.creator_name), '[]'::jsonb)
    into v_names
    from public.vip_history_names n
    left join public.profiles pf on pf.id = n.profile_id
    left join public.profiles db on db.id = n.decided_by
    cross join lateral (
      select count(*) months, coalesce(sum(h.views), 0) views, coalesce(sum(h.earned), 0) earned,
             min(h.year * 100 + h.month) first_m, max(h.year * 100 + h.month) last_m,
             coalesce(jsonb_agg(jsonb_build_object('y', h.year, 'm', h.month, 'views', h.views, 'earned', h.earned) order by h.year, h.month), '[]'::jsonb) series
        from public.vip_earnings_history h join public.vip_programmes hp on hp.id = h.programme_id
       where hp.community_id = n.community_id and h.creator_name = n.creator_name
    ) t
   where n.community_id = v_comm;

  -- Everybody who is or was a paid creator in this market, in either programme, so a name can be matched to someone
  -- who has since moved to the official creators (Julia) or left.
  select coalesce(jsonb_agg(distinct jsonb_build_object('id', pf.id, 'name', pf.name, 'photo_url', pf.photo_url,
           'kind', p.kind, 'status', m.status)), '[]'::jsonb)
    into v_people
    from public.vip_members m
    join public.vip_programmes p on p.id = m.programme_id
    join public.profiles pf on pf.id = m.profile_id
   where p.community_id = v_comm and not coalesce(pf.is_test, false) and not coalesce(pf.is_sandbox, false);

  return jsonb_build_object('names', v_names, 'people', v_people);
end $$;

-- One decision about one name. Confirmed needs a profile from this market; former and unmatched clear it.
create or replace function public.vip_history_match(p_programme uuid, p_name text, p_profile uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_comm uuid; v_other text;
begin
  if not public.vip_can_manage(p_programme) then raise exception 'Only the team running this market can match names.'; end if;
  if p_status not in ('confirmed', 'former', 'unmatched', 'suggested') then raise exception 'Unknown status.'; end if;
  select community_id into v_comm from public.vip_programmes where id = p_programme;
  if not exists (select 1 from public.vip_history_names where community_id = v_comm and creator_name = p_name) then
    raise exception 'That name is not in this market''s history.';
  end if;
  if p_status in ('confirmed', 'suggested') then
    if p_profile is null then raise exception 'Pick who this is.'; end if;
    if not exists (select 1 from public.vip_members m join public.vip_programmes p on p.id = m.programme_id
                    where m.profile_id = p_profile and p.community_id = v_comm) then
      raise exception 'That person is not a paid creator in this market.';
    end if;
    select creator_name into v_other from public.vip_history_names
     where community_id = v_comm and profile_id = p_profile and status = 'confirmed' and creator_name <> p_name limit 1;
    if v_other is not null and p_status = 'confirmed' then
      raise exception 'They are already matched to "%". Unmatch that name first.', v_other;
    end if;
  end if;

  update public.vip_history_names
     set profile_id = case when p_status in ('confirmed', 'suggested') then p_profile end,
         status = p_status, decided_by = auth.uid(), decided_at = now()
   where community_id = v_comm and creator_name = p_name;

  update public.vip_earnings_history h
     set profile_id = case when p_status = 'confirmed' then p_profile end
    from public.vip_programmes hp
   where hp.id = h.programme_id and hp.community_id = v_comm and h.creator_name = p_name;
end $$;

-- A creator's own months, all time: confirmed sheet months, then the platform's after the sheet ends in that market.
create or replace function public.vip_my_earnings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_me uuid := public.vip_who(); v_rows jsonb; v_cpm numeric;
begin
  if v_me is null then return null; end if;
  if not exists (select 1 from public.vip_members where profile_id = v_me) then return null; end if;
  select coalesce(m.cpm, p.cpm) into v_cpm
    from public.vip_members m join public.vip_programmes p on p.id = m.programme_id
   where m.profile_id = v_me order by (m.status = 'active') desc limit 1;

  with progs as (
    select p.id, p.community_id, p.kind,
           (select max(h.year * 12 + h.month) from public.vip_earnings_history h
              join public.vip_programmes hp on hp.id = h.programme_id where hp.community_id = p.community_id) cut
      from public.vip_programmes p
     where p.id in (select programme_id from public.vip_members where profile_id = v_me)
  ), hist as (
    select h.year, h.month, h.views, h.earned pay, 0::numeric extra, h.rate, 'sheet'::text src, false live
      from public.vip_earnings_history h
      join public.vip_history_names n on n.creator_name = h.creator_name
      join public.vip_programmes hp on hp.id = h.programme_id and hp.community_id = n.community_id
     where n.status = 'confirmed' and n.profile_id = v_me
  ), plat as (
    select r.year, r.month, r.views, coalesce(r.base, 0) pay, coalesce(r.bonus, 0) extra,
           case when r.views > 0 then round(coalesce(r.base, 0) / r.views * 1000, 4) end rate, 'platform'::text src,
           (r.month_status = 'open') live
      from progs pr cross join lateral public.vip_month_rows(array[pr.id]) r
     where r.profile_id = v_me and r.year * 12 + r.month > coalesce(pr.cut, 0)
  ), allrows as (select * from hist union all select * from plat)
  select coalesce(jsonb_agg(jsonb_build_object('year', a.year, 'month', a.month, 'views', a.views, 'pay', a.pay,
           'extra', a.extra, 'rate', a.rate, 'source', a.src, 'live', a.live) order by a.year, a.month), '[]'::jsonb)
    into v_rows from allrows a;
  return jsonb_build_object('currency', 'EUR', 'cpm', v_cpm, 'rows', v_rows);
end $$;

-- The team's analytics read a sheet month as somebody's only once the match is confirmed; until then it stays under
-- the sheet's name, with the decision beside it.
create or replace function public.admin_vip_earnings(p_market uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_out jsonb;
begin
  if not public.is_admin() or not public.vip_has_access() then
    raise exception 'Admins with VIP access only';
  end if;
  select array_agg(p.id) into v_ids
    from public.vip_programmes p
   where p.active and (p_market is null or p.community_id = p_market);
  if v_ids is null then return jsonb_build_object('rows', '[]'::jsonb, 'currency', 'EUR'); end if;

  with progs as (
    select p.id, p.community_id, p.kind, p.cpm, c.name market,
           (select max(h.year * 12 + h.month) from public.vip_earnings_history h
              join public.vip_programmes hp on hp.id = h.programme_id
             where hp.community_id = p.community_id) cut
      from public.vip_programmes p join public.communities c on c.id = p.community_id
     where p.id = any (v_ids)
  ), hist as (
    select h.profile_id, h.creator_name, pr.kind, pr.market, h.year, h.month, h.views, h.earned pay, 0::numeric extra,
           h.rate, 'sheet'::text src, false live, coalesce(n.status, 'unmatched') match
      from public.vip_earnings_history h join progs pr on pr.id = h.programme_id
      left join public.vip_history_names n on n.community_id = pr.community_id and n.creator_name = h.creator_name
  ), plat as (
    select r.profile_id, null::text creator_name, pr.kind, pr.market, r.year, r.month, r.views, coalesce(r.base, 0) pay,
           coalesce(r.bonus, 0) extra,
           case when r.views > 0 then round(coalesce(r.base, 0) / r.views * 1000, 4) end rate, 'platform'::text src,
           (r.month_status = 'open') live, 'platform'::text match
      from progs pr
      cross join lateral public.vip_month_rows(array[pr.id]) r
     where r.year * 12 + r.month > coalesce(pr.cut, 0)
  ), allrows as (select * from hist union all select * from plat)
  select jsonb_build_object(
           'currency', 'EUR',
           'rows', coalesce(jsonb_agg(jsonb_build_object(
             'key', coalesce(a.profile_id::text, 'name:' || a.creator_name),
             'profile_id', a.profile_id,
             'name', coalesce(nullif(trim(p.name), ''), a.creator_name),
             'short', a.creator_name,
             'photo_url', p.photo_url,
             'kind', coalesce(p.vip_kind, a.kind),
             'market', a.market,
             'year', a.year, 'month', a.month,
             'views', a.views, 'pay', a.pay, 'extra', a.extra, 'rate', a.rate,
             'source', a.src, 'live', a.live, 'match', a.match
           ) order by a.year, a.month), '[]'::jsonb))
    into v_out
    from allrows a left join public.profiles p on p.id = a.profile_id;
  return v_out;
end;
$$;

revoke all on function public.vip_history_names_list(uuid) from public, anon;
revoke all on function public.vip_history_match(uuid, text, uuid, text) from public, anon;
revoke all on function public.vip_my_earnings() from public, anon;
grant execute on function public.vip_history_names_list(uuid) to authenticated;
grant execute on function public.vip_history_match(uuid, text, uuid, text) to authenticated;
grant execute on function public.vip_my_earnings() to authenticated;

-- "See as a VIP" shows the creator's earnings too (patched from the live body).
CREATE OR REPLACE FUNCTION public.vip_preview(p_who uuid, p_what text, p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_prog uuid; r jsonb;
begin
  if p_what not in ('overview', 'statements', 'trends', 'perks', 'board', 'wallet', 'earnings') then raise exception 'Unknown preview.'; end if;
  select programme_id into v_prog from public.vip_members where profile_id = p_who;
  if v_prog is null then raise exception 'That creator is not a VIP.'; end if;
  if not public.vip_can_manage(v_prog) then raise exception 'Only the market lead or the team can preview a VIP page.'; end if;
  perform set_config('vip.preview_as', p_who::text, true);
  r := case p_what
    when 'overview' then public.vip_my_overview() || jsonb_build_object('preview', true)
    when 'statements' then public.vip_my_statements()
    when 'trends' then public.vip_my_trends(coalesce(p_days, 30))
    when 'perks' then public.vip_my_perks()
    when 'board' then public.vip_board()
    when 'wallet' then public.vip_my_wallet()
    when 'earnings' then public.vip_my_earnings()
    else null end;
  perform set_config('vip.preview_as', '', true);
  return r;
end $function$;
