-- 444: the demo account (is_sandbox) can read the targets and profit plan but not change it, like every other money
-- table (sandbox_is_read_only).
drop trigger if exists trg_sandbox_read_only on public.ccc_targets;
create trigger trg_sandbox_read_only before insert or update or delete on public.ccc_targets
  for each row execute function public.sandbox_is_read_only();
