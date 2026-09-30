-- 292: KPI goals broadcast their changes (1 Oct 2026).
--
-- Ethan: Germany showed "0 out of 500k views" with no KPI set, and a UK goal showed up once after it
-- was deleted - "Everything should update." The KPI tracker now listens for changes to kpi_targets
-- and re-reads every chart on the page. Realtime respects RLS, so only admins (who can read the
-- table) receive the events.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kpi_targets') then
    alter publication supabase_realtime add table public.kpi_targets;
  end if;
end $$;
