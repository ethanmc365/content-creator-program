-- 364 (8 Oct 2026): EVERY RLS GATE FUNCTION RUNS ONCE PER QUERY, NOT ONCE PER ROW.
--
-- A policy that says `is_admin() or creator_id = auth.uid()` calls both functions for EVERY row it looks at, and
-- is_admin()/is_member()/can_post() each read profiles. Counting the ~50 rows of submissions as a creator took 76 ms.
-- Written as `(select is_admin())` the planner evaluates it once as an InitPlan and reuses the answer - the same
-- answer, because none of these functions takes an argument or looks at the row. This rewrites every public policy
-- mechanically: a zero-argument, non-set-returning gate function not already inside a SELECT gets wrapped. It is
-- idempotent (an already wrapped call is skipped) and touches nothing else in the expression.
do $rewrite$
declare
  p      record;
  v_fns  constant text := '(auth\.uid|is_admin|is_member|can_post|vip_my_programme|is_active_vip|is_global_admin|vip_has_access|is_owner|vip_hides_announcements|test_creator_ids|certificates_live)';
  v_re   text;
  v_qual text;
  v_chk  text;
  v_sql  text;
  n      integer := 0;
begin
  v_re := '(?<!SELECT )(?<![A-Za-z0-9_.])(public\.)?' || v_fns || '\(\)';
  for p in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (coalesce(qual, '') ~ v_re or coalesce(with_check, '') ~ v_re)
  loop
    v_qual := regexp_replace(p.qual, v_re, '( SELECT \2() AS gate)', 'g');
    v_chk  := regexp_replace(p.with_check, v_re, '( SELECT \2() AS gate)', 'g');
    -- An array gate inside  would read as a row set once it is a subquery; the cast keeps it a value.
    v_qual := replace(v_qual, '( SELECT test_creator_ids() AS gate)', '(( SELECT test_creator_ids() AS gate))::uuid[]');
    v_chk  := replace(v_chk,  '( SELECT test_creator_ids() AS gate)', '(( SELECT test_creator_ids() AS gate))::uuid[]');
    v_sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if p.qual is not null then v_sql := v_sql || ' using (' || v_qual || ')'; end if;
    if p.with_check is not null then v_sql := v_sql || ' with check (' || v_chk || ')'; end if;
    execute v_sql;
    n := n + 1;
  end loop;
  raise notice '364: % policies rewritten', n;
end $rewrite$;
