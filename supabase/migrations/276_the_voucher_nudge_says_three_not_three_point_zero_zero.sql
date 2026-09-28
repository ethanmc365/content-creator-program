-- "3.00 points from your voucher" is not a sentence anybody writes.
--
-- `challenge_standings.points` is numeric, so the shortfall interpolated with
-- its scale attached. This is NOT a cast to an integer - points really can be
-- fractional - it is a format that drops a trailing zero and keeps a real half
-- point, and then strips the bare decimal point `FM` leaves behind:
--
--   3.00 -> "3"      2.50 -> "2.5"      18 -> "18"      1.00 -> "1"
--
-- Two goes at this: `to_char(3.00, 'FM9999990.99')` is "3." - `FM` suppresses
-- the padding but not the point itself - so the rtrim is the half that matters.
--
-- This is the function as it runs. See 275 for the table, the cron and the
-- rules about who is nudged.

create or replace function public.send_voucher_nudges()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c record;
  r record;
  v_reach numeric;
  v_short numeric;
  v_unit text;
  v_n text;
begin
  for c in
    select id, title, end_date, community_id, participation_prize,
           participation_threshold, coalesce(participation_basis, 'points') as basis
      from public.challenges
     where status = 'active'
       and end_date > now() + interval '1 day'
       and participation_threshold is not null
       and participation_threshold > 0
       and coalesce(participation_prize, '') <> ''
  loop
    -- Striking distance: a third of the target, never more than five. On an
    -- 18-point voucher that is five points; on a 3-video one it is one video.
    v_reach := least(5, greatest(1, ceil(c.participation_threshold / 3.0)));
    v_unit := case when c.basis = 'videos' then 'video' else 'point' end;

    for r in
      select s.creator_id,
             case when c.basis = 'videos'
                  then (select count(*) from public.submissions sub
                         where sub.challenge_id = c.id and sub.creator_id = s.creator_id)
                  else s.points end as score
        from public.challenge_standings s
        join public.profiles p on p.id = s.creator_id
       where s.challenge_id = c.id
         and p.status = 'active'
         and not p.is_admin
         and not coalesce(p.is_test, false)
         and p.deletion_requested_at is null
         and not exists (select 1 from public.voucher_nudges_sent n
                          where n.challenge_id = c.id and n.creator_id = s.creator_id)
    loop
      -- Already there, or not started: neither of those is a nudge.
      continue when r.score is null or r.score <= 0 or r.score >= c.participation_threshold;
      v_short := c.participation_threshold - r.score;
      continue when v_short > v_reach;
      v_n := rtrim(to_char(v_short, 'FM9999990.99'), '.');

      insert into public.notifications (recipient_id, type, title, body, link)
      values (
        r.creator_id,
        'reward',
        case when v_short = 1
             then 'One ' || v_unit || ' from your voucher'
             else v_n || ' ' || v_unit || 's from your voucher' end,
        'You are ' || v_n || ' ' || v_unit ||
          (case when v_short = 1 then '' else 's' end) ||
          ' away from the ' || c.participation_prize || ' in "' || c.title ||
          '". There is still time.',
        '/challenges/' || c.id
      );

      insert into public.voucher_nudges_sent (challenge_id, creator_id, points_short)
      values (c.id, r.creator_id, v_short);
    end loop;
  end loop;
end;
$function$;

revoke all on function public.send_voucher_nudges() from public, anon, authenticated;
