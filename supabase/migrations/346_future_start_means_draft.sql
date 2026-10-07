-- 346 (7 Oct 2026): A CHALLENGE WHOSE START IS IN THE FUTURE IS NOT LIVE.
-- A live German challenge had its dates moved later and stayed 'active' (visible, open for entries). Whatever the screen does,
-- the database now sends an 'active' challenge with a future start back to 'draft' and schedules it (publish_at = start_date),
-- so publish_scheduled_challenges opens it when it really starts.
create or replace function public.challenge_future_start_is_draft()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.status = 'active' and new.start_date is not null and new.start_date > now() then
    new.status := 'draft';
    new.publish_at := new.start_date;
  end if;
  return new;
end $$;
revoke all on function public.challenge_future_start_is_draft() from public;
revoke all on function public.challenge_future_start_is_draft() from anon;
revoke all on function public.challenge_future_start_is_draft() from authenticated;

drop trigger if exists trg_challenge_future_start_is_draft on public.challenges;
create trigger trg_challenge_future_start_is_draft before insert or update of status, start_date on public.challenges
  for each row execute function public.challenge_future_start_is_draft();
