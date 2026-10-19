-- 436: THE TEAM'S OWN VIDEOS, AND THE BOARD BY PLATFORM (19 Oct 2026).
--
-- Marta Lara runs VIP Spain and Official Spain and posts her own videos too. She (and Ethan, to test) can now track
-- her own videos as an official creator from /vip > My videos, without becoming a second person anywhere:
--   * `vip_staff_self(programme, track, on_board)` puts the caller into an official programme they run, as a member
--     with source 'staff': rate 0, invoiced outside (no statements, no payouts), not on the creator map, no join notices.
--     Turning it off marks the row 'left'; nothing is deleted.
--   * `vip_members.on_board` - "count me on the board and in the bonuses". Off = `vip_hidden_profile` hides them from
--     every board, list and total other people see (the same door the sandbox accounts already go through), and their
--     bonus place is off. Their own page still shows everything.
--   * A staff member never needs to sign the creator agreement (`vip_terms_ok`).
-- And `vip_range_analytics` gives each creator their videos and views per platform, and leaves hidden people out of the
-- totals too (so the headline equals the sum of the rows).

alter table public.vip_members add column if not exists on_board boolean not null default true;
alter table public.vip_members drop constraint if exists vip_members_source_check;
alter table public.vip_members add constraint vip_members_source_check check (source = any (array['admin', 'invite', 'transfer', 'staff']));

create or replace function public.vip_hidden_profile(p_profile uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select (coalesce((select pf.is_sandbox from public.profiles pf where pf.id = p_profile), false)
          or exists (select 1 from public.vip_members m where m.profile_id = p_profile and not m.on_board))
     and p_profile is distinct from auth.uid()
$function$;

do $mig$
declare d text; a text; b text;
begin
  -- vip_terms_ok: the team's own row needs no creator agreement.
  d := pg_get_functiondef('public.vip_terms_ok(uuid)'::regprocedure);
  a := E'select case\n           when (public.agreement_for(''vip'', p_profile)).id is null then true';
  b := E'select case\n           when exists (select 1 from public.vip_members s where s.profile_id = p_profile and s.source = ''staff'') then true\n           when (public.agreement_for(''vip'', p_profile)).id is null then true';
  if position(a in d) = 0 then raise exception '436: vip_terms_ok drifted'; end if;
  execute replace(d, a, b);

  -- vip_my_overview: say whether this is the team's own row and whether it is on the board.
  d := pg_get_functiondef('public.vip_my_overview()'::regprocedure);
  a := E'''invoice_outside'', m.invoice_outside,';
  b := E'''invoice_outside'', m.invoice_outside, ''on_board'', m.on_board, ''staff_self'', m.source = ''staff'',';
  if position(a in d) = 0 then raise exception '436: vip_my_overview drifted'; end if;
  execute replace(d, a, b);

  -- vip_range_analytics: hidden people out of the totals, and a per-platform split for every creator.
  d := pg_get_functiondef('public.vip_range_analytics(uuid, date, date)'::regprocedure);
  a := 'insert into _vip_rg select * from public.vip_daily_gained(v_ids, null, v_pf, p_to);';
  b := 'insert into _vip_rg select g.* from public.vip_daily_gained(v_ids, null, v_pf, p_to) g
   where g.profile_id <> all (array(select hm.profile_id from public.vip_members hm where public.vip_hidden_profile(hm.profile_id)));';
  if position(a in d) = 0 then raise exception '436: vip_range_analytics insert drifted'; end if;
  d := replace(d, a, b);
  a := 'public.vip_terms_ok(vm.profile_id) terms_ok';
  b := 'public.vip_terms_ok(vm.profile_id) terms_ok,
           (select coalesce(jsonb_agg(jsonb_build_object(''platform'', t.platform, ''videos'', t.videos, ''views'', t.views)
                                      order by t.views desc, t.videos desc, t.platform), ''[]''::jsonb)
              from (select x.platform,
                           count(*) filter (where coalesce(x.posted_at, x.submitted_at)::date between p_from and p_to) videos,
                           round(coalesce(sum(gx.v), 0))::bigint views
                      from public.vip_videos x
                      left join (select r.video_id, sum(r.gained) v from _vip_rg r
                                  where r.profile_id = vm.profile_id and r.d between p_from and p_to group by r.video_id) gx on gx.video_id = x.id
                     where x.profile_id = vm.profile_id and x.status <> ''removed''
                     group by x.platform) t
             where t.videos > 0 or t.views > 0) platforms';
  if position(a in d) = 0 then raise exception '436: vip_range_analytics creators drifted'; end if;
  execute replace(d, a, b);
end $mig$;

create or replace function public.vip_staff_self(p_programme uuid, p_track boolean, p_on_board boolean default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare p public.vip_programmes; m public.vip_members; v_uid uuid := auth.uid(); v_on boolean;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  select * into p from public.vip_programmes where id = p_programme;
  if p.id is null or p.kind <> 'official' then raise exception 'Your own videos are tracked in an official creators programme.'; end if;
  if not public.vip_can_manage(p.id) then raise exception 'Only the team running this programme can track their own videos in it.'; end if;
  select * into m from public.vip_members where profile_id = v_uid;
  if m.profile_id is not null and m.source <> 'staff' and m.status <> 'left' then
    raise exception 'You are already a creator in a programme, so your videos are tracked there.';
  end if;
  v_on := coalesce(p_on_board, m.on_board, true);
  perform set_config('tryp.vip_quiet', 'on', true);
  if coalesce(p_track, false) then
    if m.profile_id is null then
      insert into public.vip_members (profile_id, programme_id, status, cpm, source, is_team, invoice_outside, auto_payout,
                                      bonuses_on, on_board, show_on_map, created_by)
      values (v_uid, p.id, 'active', 0, 'staff', true, true, false, v_on, v_on, false, v_uid);
    else
      update public.vip_members
         set programme_id = p.id, status = 'active', left_on = null, cpm = 0, source = 'staff', is_team = true,
             invoice_outside = true, auto_payout = false, monthly_fee = null, tiers = null, monthly_cap = null,
             show_on_map = false, on_board = v_on, bonuses_on = v_on, auto_home = false
       where profile_id = v_uid;
    end if;
  elsif m.profile_id is not null and m.status <> 'left' then
    update public.vip_members set status = 'left', left_on = current_date where profile_id = v_uid;
  end if;
  perform set_config('tryp.vip_quiet', 'off', true);
  return (select jsonb_build_object('tracking', x.status = 'active', 'on_board', x.on_board, 'programme_id', x.programme_id)
            from public.vip_members x where x.profile_id = v_uid);
end $function$;
