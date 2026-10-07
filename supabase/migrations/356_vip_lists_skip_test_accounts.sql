-- 356: the test VIP is never on a VIP list (7 Oct 2026).
--
-- Ethan: "the test VIP is still showing up in some of the VIP communities." "Test VIP Account" (is_test, sandbox) is a
-- member of VIP Spain so the team can sign in as a VIP; a handful of VIP functions filter test accounts out (the map,
-- standings, recap) and most did not (the board, the stay-in list, staff overview counts, analytics, wallets...).
--
-- Rather than retype a dozen live bodies (the rule since the 25 Aug invoice outage), every listing/reporting function
-- reads members through `vip_members_live`, the same table without test accounts, by a mechanical rename of
-- `public.vip_members` in its live definition. The view is a simple single-table view, so it stays auto-updatable for
-- the two nudge functions that touch a column. Functions that act on one named person (add, update, move, the person's
-- own overview, the statement run) are left on the table.
create or replace view public.vip_members_live as
  select m.* from public.vip_members m
   where not exists (select 1 from public.profiles p where p.id = m.profile_id and (coalesce(p.is_test, false) or coalesce(p.is_sandbox, false)));
revoke all on public.vip_members_live from anon, authenticated;

do $$
declare f record; v_def text;
begin
  for f in
    select p.oid from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('vip_admin_overview', 'vip_analytics', 'vip_attention', 'vip_board', 'vip_cpm_sheet', 'vip_kpi_actuals',
                         'vip_metric', 'vip_milestones', 'vip_month_rows', 'vip_perk_board', 'vip_range_analytics', 'vip_requirements',
                         'vip_staff_board', 'vip_staff_overview', 'vip_wallets', 'vip_weekly_digest', 'vip_nudges', 'vip_requirement_nudges')
  loop
    v_def := pg_get_functiondef(f.oid);
    if v_def ~ 'public\.vip_members\y' then
      execute regexp_replace(v_def, 'public\.vip_members\y(?!_live)', 'public.vip_members_live', 'g');
    end if;
  end loop;
end $$;
