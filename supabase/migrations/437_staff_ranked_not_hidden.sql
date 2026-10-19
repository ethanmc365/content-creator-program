-- 437: "ON THE BOARD" MEANS RANKINGS AND PRIZES, NOT BEING COUNTED (19 Oct 2026).
--
-- The team, of the switch 436 added: "this should actually be tracked and count towards the official creators... does
-- that mean for the prizes? Maybe she doesn't want to be in the prizes, but she needs to be part of it."
-- So a member with on_board = false is no longer hidden: their videos and views count in every total, analytics list,
-- market comparison and KPI like anybody's. They are only left out of what RANKS people and hands out prizes - the
-- leaderboards (vip_board, vip_staff_board), the bonus standings (vip_rule_standings) and the monthly challenge
-- standings (vip_brief_standings) - and `bonuses_on` (set with it by vip_staff_self) keeps them out of bonus money.

create or replace function public.vip_hidden_profile(p_profile uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce((select pf.is_sandbox from public.profiles pf where pf.id = p_profile), false)
     and p_profile is distinct from auth.uid()
$function$;

create or replace function public.vip_unranked(p_profile uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from public.vip_members m where m.profile_id = p_profile and not m.on_board)
$function$;

do $mig$
declare f text; d text; n int; a text; b text;
begin
  foreach f in array array['vip_board', 'vip_staff_board', 'vip_brief_standings', 'vip_rule_standings'] loop
    select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f;
    n := (length(d) - length(replace(d, 'not public.vip_hidden_profile(', ''))) / length('not public.vip_hidden_profile(');
    if n = 0 then raise exception '437: % drifted', f; end if;
    -- every "not hidden(x)" in these becomes "not hidden(x) and not unranked(x)"
    d := regexp_replace(d, 'not public\.vip_hidden_profile\(([a-z0-9_.]+)\)', 'not public.vip_hidden_profile(\1) and not public.vip_unranked(\1)', 'g');
    execute d;
  end loop;

  d := pg_get_functiondef('public.vip_range_analytics(uuid, date, date)'::regprocedure);
  a := 'public.vip_terms_ok(vm.profile_id) terms_ok,';
  b := 'public.vip_terms_ok(vm.profile_id) terms_ok, not public.vip_unranked(vm.profile_id) ranked,';
  if position(a in d) = 0 then raise exception '437: vip_range_analytics drifted'; end if;
  execute replace(d, a, b);
end $mig$;
