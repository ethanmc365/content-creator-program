-- 315: vip_cpm_sheet emptied its scratch table with a bare DELETE, which the API role refuses ("DELETE requires a WHERE
-- clause", pg_safeupdate). 312's file now says TRUNCATE; this puts the same change into the live function.
do $$
declare d text; n text;
begin
  select pg_get_functiondef('public.vip_cpm_sheet(uuid,integer)'::regprocedure) into d;
  n := replace(d, E'  delete from _sheet;\n', E'  truncate _sheet;\n');
  assert n <> d, 'vip_cpm_sheet: anchor not found';
  execute n;
end $$;

-- The same bare DELETE was in vip_compute_statements, which "Recalculate" on the Month end tab calls through the API:
-- it has failed for every manager since migration 294 (only the cron job, which runs as the owner, got through).
do $$
declare d text; n text;
begin
  select pg_get_functiondef('public.vip_compute_statements(uuid)'::regprocedure) into d;
  n := replace(d, E'  delete from _vip_stats;\n', E'  truncate _vip_stats;\n');
  assert n <> d, 'vip_compute_statements: anchor not found';
  execute n;
end $$;
