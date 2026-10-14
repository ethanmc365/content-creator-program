-- 412: A BONUS WINDOW SITS INSIDE ITS CHALLENGE (14 Oct 2026).
--
-- Marta's "Bonus Spooky Season" on RETO OCTUBRE ESPANA was saved ending 2029-10-14 (a typed year), so the creator card
-- said it ran "until Sunday" (14 Oct 2029 is a Sunday; 14 Oct 2026 is a Wednesday) and it would never have ended.
-- 1. The row is corrected to the date she meant: the end of 14 Oct 2026, Madrid time.
-- 2. A trigger refuses any bonus window that starts or ends more than a day outside its challenge, so a typo like this
--    fails on save instead of reaching creators. The editor now bounds both date fields the same way.

update point_rules r
   set ends_at = '2026-10-14 21:59:00+00'
  from challenges c
 where c.id = r.challenge_id
   and r.label = 'Bonus Spooky Season'
   and r.ends_at = '2029-10-14 21:59:00+00';

create or replace function point_rule_window_inside_challenge()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  c_start timestamptz;
  c_end timestamptz;
begin
  if new.starts_at is null and new.ends_at is null then return new; end if;
  select start_date, end_date into c_start, c_end from challenges where id = new.challenge_id;
  if c_start is null or c_end is null then return new; end if;
  if new.starts_at is not null and (new.starts_at < c_start - interval '1 day' or new.starts_at > c_end + interval '1 day') then
    raise exception 'BONUS_WINDOW_OUTSIDE_CHALLENGE: the bonus starts outside the challenge dates';
  end if;
  if new.ends_at is not null and (new.ends_at < c_start - interval '1 day' or new.ends_at > c_end + interval '1 day') then
    raise exception 'BONUS_WINDOW_OUTSIDE_CHALLENGE: the bonus ends outside the challenge dates';
  end if;
  return new;
end $$;

drop trigger if exists trg_point_rule_window_inside on point_rules;
create trigger trg_point_rule_window_inside
  before insert or update of starts_at, ends_at on point_rules
  for each row execute function point_rule_window_inside_challenge();
