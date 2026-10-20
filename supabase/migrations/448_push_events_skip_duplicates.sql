-- 448 (20 Oct 2026): the push ledger lost whole batches. notify-dispatch writes one 'sent' row PER DEVICE, but
-- push_events_one_per_event allows one (notification, event); a creator with push on two devices made the single
-- multi-row insert fail with a unique violation (409, about 20 a day, the Sentry alerts), so every receipt in that batch
-- was dropped and push analytics under-counted. Pushes themselves were unaffected. A BEFORE INSERT trigger now skips a
-- row whose (notification, event) is already there, which includes rows written earlier in the same statement, so the
-- rest of the batch lands. push-track's upsert (ON CONFLICT DO NOTHING) is unchanged.
create or replace function public.push_events_skip_duplicate() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  if new.notification_id is not null and exists (
    select 1 from public.push_events p where p.notification_id = new.notification_id and p.event = new.event
  ) then
    return null;
  end if;
  return new;
end $$;
drop trigger if exists trg_push_events_skip_duplicate on public.push_events;
create trigger trg_push_events_skip_duplicate before insert on public.push_events
  for each row execute function public.push_events_skip_duplicate();
