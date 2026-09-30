-- 296: WHO MAY SEE THE VIP PROGRAMME, AND THE AUTOMATIONS AROUND IT (30 Sep 2026).
--
-- Ethan: "The entire Tryp.com team should not be able to see it but I should, and I should be able to add other
-- managers to it, for example Marta who is leading the Spanish VIP programme."
--
-- 294 let every admin, and every manager of the market, run the VIP tools (`vip_can_manage` = is_admin() or market
-- manager). VIP money and VIP rooms are more sensitive than that, so access is now an explicit list:
--   * the OWNER platform role always has it;
--   * anybody else needs a row in `vip_managers` (one per person per programme), which only the owner writes.
-- The same rule decides who may read or post in the VIP rooms, which used to be open to every admin and every
-- market manager. Nothing else about how a VIP is treated changes.
--
-- Also here: the automations a VIP programme was missing - a welcome, a "your statement is approved", a bonus
-- notice, a quiet-VIP nudge and a month-end reminder - and managers are told about a month that is ready by the
-- access list, not by job title.

-- ------------------------------------------------------------------------------------------ the list
create table public.vip_managers (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  programme_id uuid not null references public.vip_programmes(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (profile_id, programme_id)
);
create index vip_managers_programme_idx on public.vip_managers (programme_id);
alter table public.vip_managers enable row level security;
create policy "vip managers: read own or owner" on public.vip_managers for select
  using (profile_id = (select auth.uid()) or public.is_owner());
-- no write policies: only vip_add_manager / vip_remove_manager (owner only) touch it.

create or replace function public.vip_can_manage(p_programme uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_owner() or exists (
    select 1 from public.vip_managers m where m.profile_id = auth.uid() and m.programme_id = p_programme)
$$;

-- "Does this person get the VIP tools at all?" - drives the door in the header and the admin panel.
create or replace function public.vip_has_access()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_owner() or exists (select 1 from public.vip_managers m where m.profile_id = auth.uid())
$$;

-- who is told when a month is ready, and so on
create or replace function public.vip_manager_ids(p_programme uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select pf.id from public.profiles pf where pf.platform_role = 'owner' and pf.is_test = false
  union
  select m.profile_id from public.vip_managers m join public.profiles pf on pf.id = m.profile_id
   where m.programme_id = p_programme and pf.is_test = false
$$;

create or replace function public.vip_add_manager(p_profile uuid, p_programme uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not public.is_owner() then raise exception 'Only the owner can give someone access to the VIP tools.'; end if;
  select name into v_name from public.vip_programmes where id = p_programme;
  if v_name is null then raise exception 'That programme does not exist.'; end if;
  if not exists (select 1 from public.profiles where id = p_profile) then raise exception 'That person does not exist.'; end if;
  insert into public.vip_managers (profile_id, programme_id, added_by) values (p_profile, p_programme, auth.uid())
  on conflict do nothing;
  if found and p_profile <> auth.uid() then
    insert into public.notifications (recipient_id, type, title, body, link)
    values (p_profile, 'vip', 'You can now manage ' || v_name, 'Members, bonuses, month-end payouts and numbers are in the VIP tools.', '/admin/vip');
  end if;
end $$;

create or replace function public.vip_remove_manager(p_profile uuid, p_programme uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Only the owner can change who has access to the VIP tools.'; end if;
  delete from public.vip_managers where profile_id = p_profile and programme_id = p_programme;
end $$;

create or replace function public.vip_managers_list()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Only the owner can see this.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'profile_id', m.profile_id, 'name', pf.name, 'photo_url', pf.photo_url, 'role_title', pf.role_title,
        'programme_id', m.programme_id, 'programme', p.name, 'added_at', m.created_at) order by pf.name, p.name)
      from public.vip_managers m
      join public.profiles pf on pf.id = m.profile_id
      join public.vip_programmes p on p.id = m.programme_id), '[]'::jsonb);
end $$;

-- ------------------------------------------------------------------- the two other admin checks
do $$
declare d text; d2 text;
begin
  d := pg_get_functiondef('public.vip_analytics(uuid)'::regprocedure);
  d2 := replace(d, $q$    if not public.is_admin() then raise exception 'Only the team can see every programme.'; end if;
    select array_agg(id) into v_ids from public.vip_programmes;$q$,
$q$    select array_agg(id) into v_ids from public.vip_programmes where public.vip_can_manage(id);
    if v_ids is null then raise exception 'Not yours to see.'; end if;$q$);
  if d2 = d then raise exception 'vip_analytics did not match the expected text'; end if;
  execute d2;
end $$;

drop policy "vip programmes: admin create" on public.vip_programmes;
create policy "vip programmes: owner create" on public.vip_programmes for insert with check (public.is_owner());

-- ---------------------------------------------------------------------------- the rooms
-- One place decides: an active VIP of that market (or the worldwide lounge), or somebody on the access list.
create or replace function public.vip_room_ok(p_community uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.vip_members m
      join public.vip_programmes p on p.id = m.programme_id
     where m.profile_id = auth.uid() and m.status = 'active'
       and (p.community_id = p_community
            or exists (select 1 from public.communities c where c.id = p_community and c.kind = 'network')))
  or public.is_owner()
  or exists (
    select 1 from public.vip_managers vm
      join public.vip_programmes p on p.id = vm.programme_id
     where vm.profile_id = auth.uid()
       and (p.community_id = p_community
            or exists (select 1 from public.communities c where c.id = p_community and c.kind = 'network')))
$$;

drop policy if exists channels_read on public.channels;
create policy channels_read on public.channels for select using (
  community_id in (select public.my_scopes())
  and (visibility = 'scope'
       or (visibility <> 'vip' and community_id in (select public.my_managed_scopes()))
       or (visibility = 'vip' and public.vip_room_ok(community_id))));

drop policy if exists "messages: read in rooms you can open" on public.messages;
create policy "messages: read in rooms you can open" on public.messages for select using (
  (public.is_admin() and not public.channel_is_vip(channel_id))
  or (public.channel_is_vip(channel_id) and public.vip_room_ok(public.channel_community_of(channel_id)))
  or (
    community_id in (select public.my_scopes())
    and (channel_id is null or exists (
      select 1 from public.channels ch
       where ch.id = messages.channel_id
         and (ch.visibility = 'scope'
              or (ch.visibility <> 'vip' and ch.community_id in (select public.my_managed_scopes()))
              or (ch.visibility = 'vip' and public.vip_room_ok(ch.community_id)))))));

drop policy if exists "messages: vip rooms need a vip" on public.messages;
create policy "messages: vip rooms need a vip" on public.messages as restrictive for insert
  with check (
    case when channel_id is null then coalesce(channel, '') <> all (array['vip', 'vip_global'])
         else (not public.channel_is_vip(channel_id))
              or (public.vip_room_ok(public.channel_community_of(channel_id))
                  and public.channel_community_of(channel_id) in (select public.my_scopes()))
    end);

-- ------------------------------------------------------------------ month-end: tell the right people
create or replace function public.vip_close_due()
returns jsonb language plpgsql security definer set search_path = public as $$
declare p record; m record; v_closed int := 0; v_synced int := 0; v_n int;
begin
  for p in select id from public.vip_programmes where active loop
    perform public.vip_ensure_month(p.id);
  end loop;

  for m in select * from public.vip_months where status = 'open' and final_sync_at is null and now() >= ends_at - interval '25 minutes' loop
    perform public.vip_run_sync(true, m.programme_id);
    update public.vip_months set final_sync_at = now(), status = 'closing' where id = m.id;
    v_synced := v_synced + 1;
  end loop;

  -- the forced read can be turned away (busy) or fail; ask again on each tick until 20 minutes past the end
  for m in select * from public.vip_months where status = 'closing' and now() < ends_at + interval '20 minutes' loop
    perform public.vip_run_sync(true, m.programme_id);
  end loop;

  for m in select * from public.vip_months
            where status = 'closing' and now() >= ends_at + interval '30 minutes'
              and now() >= final_sync_at + interval '30 minutes' loop
    v_n := public.vip_compute_statements(m.id);
    update public.vip_months set status = 'closed', closed_at = now() where id = m.id;
    perform public.vip_ensure_month(m.programme_id, m.ends_at + interval '1 hour');
    insert into public.notifications (recipient_id, type, title, body, link)
    select mgr, 'vip', 'A VIP month is ready to review',
           to_char(make_date(m.year, m.month, 1), 'FMMonth YYYY') || ': ' || v_n || ' statements are drafted.',
           '/admin/vip?tab=close'
      from public.vip_manager_ids(m.programme_id) mgr;
    v_closed := v_closed + 1;
  end loop;
  return jsonb_build_object('synced', v_synced, 'closed', v_closed);
end $$;

-- --------------------------------------------------------------------------- the automations
-- 1. welcome (and tell the managers when somebody joined by a link)
create or replace function public.vip_notify_joined()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_prog text; v_name text;
begin
  if new.status <> 'active' then return null; end if;
  select name into v_prog from public.vip_programmes where id = new.programme_id;
  select name into v_name from public.profiles where id = new.profile_id;
  insert into public.notifications (recipient_id, type, title, body, link)
  values (new.profile_id, 'vip', 'Welcome to ' || coalesce(v_prog, 'the VIP programme'),
          'You are paid by the views your videos bring. Add your first video to start your month.', '/vip');
  if new.source = 'invite' then
    insert into public.notifications (recipient_id, type, title, body, link)
    select mgr, 'vip', coalesce(v_name, 'Someone') || ' joined ' || coalesce(v_prog, 'the VIP programme'), 'They signed up with a VIP link.', '/admin/vip?tab=members'
      from public.vip_manager_ids(new.programme_id) mgr where mgr <> new.profile_id;
  end if;
  return null;
end $$;
create trigger trg_vip_notify_joined after insert on public.vip_members
  for each row execute function public.vip_notify_joined();

-- 2. the statement was approved
create or replace function public.vip_notify_statement()
returns trigger language plpgsql security definer set search_path = public as $$
declare mo record;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' and new.total > 0 then
    select year, month into mo from public.vip_months where id = new.month_id;
    insert into public.notifications (recipient_id, type, title, body, link)
    values (new.profile_id, 'vip', 'Your ' || to_char(make_date(mo.year, mo.month, 1), 'FMMonth') || ' VIP payout is approved',
            new.currency || ' ' || to_char(new.total, 'FM999G990D00') || ' for ' || new.views || ' views.', '/vip?tab=payouts');
  end if;
  return null;
end $$;
create trigger trg_vip_notify_statement after update of status on public.vip_statements
  for each row execute function public.vip_notify_statement();

-- 3. a bonus was earned
create or replace function public.vip_notify_bonus()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (recipient_id, type, title, body, link)
  values (new.profile_id, 'vip', 'You earned a VIP bonus', 'It is on your month''s statement.', '/vip?tab=payouts');
  return null;
end $$;
create trigger trg_vip_notify_bonus after insert on public.vip_bonus_awards
  for each row execute function public.vip_notify_bonus();

-- 4. the daily nudges: a VIP who has gone quiet, and the last days of a month. Once each, never repeated.
create or replace function public.vip_nudges()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_quiet int := 0; v_end int := 0;
begin
  with quiet as (
    select m.profile_id from public.vip_members m
      join public.vip_programmes p on p.id = m.programme_id and p.active
     where m.status = 'active' and m.joined_on < current_date - 10
       and not exists (select 1 from public.vip_videos v where v.profile_id = m.profile_id and v.submitted_at > now() - interval '10 days')
       and not exists (select 1 from public.notifications n where n.recipient_id = m.profile_id and n.type = 'vip'
                        and n.title = 'Your VIP month is waiting for a video' and n.created_at > now() - interval '10 days')
  ), ins as (
    insert into public.notifications (recipient_id, type, title, body, link)
    select profile_id, 'vip', 'Your VIP month is waiting for a video', 'You have not added a video in ten days. Views only count while a video is tracked.', '/vip?tab=videos'
      from quiet returning 1)
  select count(*) into v_quiet from ins;

  with ending as (
    select m.profile_id, mo.id month_id from public.vip_members m
      join public.vip_months mo on mo.programme_id = m.programme_id and mo.status = 'open'
     where m.status = 'active' and mo.ends_at between now() and now() + interval '3 days'
       and not exists (select 1 from public.notifications n where n.recipient_id = m.profile_id and n.type = 'vip'
                        and n.title = 'Three days left in the VIP month' and n.created_at > mo.ends_at - interval '4 days')
  ), ins as (
    insert into public.notifications (recipient_id, type, title, body, link)
    select profile_id, 'vip', 'Three days left in the VIP month', 'See how far you have got and what it is worth so far.', '/vip'
      from ending returning 1)
  select count(*) into v_end from ins;
  return jsonb_build_object('quiet', v_quiet, 'ending', v_end);
end $$;
select cron.schedule('vip-nudges', '15 9 * * *', 'select public.vip_nudges()');

-- ------------------------------------------------------------------------------------ grants
-- (traps from 294: an anon grant is its own statement, and default privileges re-grant `authenticated`
--  on new definer functions, so the internal ones are revoked in a separate statement afterwards.)
revoke all on function public.vip_has_access(), public.vip_add_manager(uuid, uuid), public.vip_remove_manager(uuid, uuid),
  public.vip_managers_list(), public.vip_manager_ids(uuid), public.vip_notify_joined(), public.vip_notify_statement(),
  public.vip_notify_bonus(), public.vip_nudges() from public, anon;
grant execute on function public.vip_has_access(), public.vip_add_manager(uuid, uuid), public.vip_remove_manager(uuid, uuid),
  public.vip_managers_list() to authenticated;
revoke all on function public.vip_manager_ids(uuid), public.vip_notify_joined(), public.vip_notify_statement(),
  public.vip_notify_bonus(), public.vip_nudges() from authenticated;
