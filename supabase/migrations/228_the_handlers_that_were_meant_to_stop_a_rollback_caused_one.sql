-- THE EXCEPTION HANDLERS WERE THEMSELVES BROKEN, WHICH IS THE WORST VERSION.
--
-- APPLIED 16 Sep 2026 as
-- `the_handlers_that_were_meant_to_stop_a_rollback_caused_one`.
--
-- Migration 222 wraps each automatic award in
-- `exception when others then perform report_system_error(...)`, on this
-- folder's rule that a bookkeeping side-effect must never abort the thing it is
-- bookkeeping. Every one of them called it with TWO arguments. It takes three:
--
--     report_system_error(p_source text, p_key text, p_message text, ...)
--
-- So the handler raised `function does not exist` INSIDE the handler, the
-- exception propagated after all, and the transaction rolled back - which is
-- exactly the outcome the handler existed to prevent. A certificate design with
-- a bad placeholder would have taken a prize payout down with it.
--
-- HOW IT WAS FOUND, which is the part worth keeping: not by reading, but by
-- pressing the button. The backfill of eleven participation certificates failed
-- with `report_system_error(unknown, text) does not exist` surfacing to the
-- admin, where it should have surfaced nothing at all.
--
-- THE LESSON, WHICH THE README ALREADY HALF-CONTAINS: a catch-all handler is
-- only as good as the call inside it, and nothing type-checks a plpgsql
-- `perform` until it runs. **AN EXCEPTION HANDLER NEEDS A TEST THAT FIRES IT.**
-- `certificate_selftest()` is that test - a function rather than a comment, so
-- it can be run again after any change to these three. It returns a row per
-- handler; all three must say `survived = true`.
--
-- This also generalises to the note in 204 about `client_errors`: a reporting
-- path that cannot throw needs a test that a row lands. So does one that is
-- only ever reached when something else already went wrong.

create or replace function public.on_milestone_certificate()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    insert into public.certificate_awards
      (design_id, profile_id, milestone_id, facts, serial)
    select d.id, new.profile_id, new.milestone_id,
           jsonb_strip_nulls(jsonb_build_object(
             'name', p.name, 'milestone', m.title, 'date', new.reached_at
           )),
           public.certificate_serial()
    from public.certificate_designs d
    join public.profiles p on p.id = new.profile_id
    join public.milestones m on m.id = new.milestone_id
    where d.is_active and d.award_on = 'milestone' and d.milestone_id = new.milestone_id
    on conflict do nothing;
  exception when others then
    perform public.report_system_error(
      'certificates', 'milestone-award',
      'Could not award a milestone certificate: ' || coalesce(sqlerrm, 'unknown'));
  end;
  return new;
end $$;

create or replace function public.on_winners_certificates()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.winners_published_at is not null
     and (tg_op = 'INSERT' or old.winners_published_at is distinct from new.winners_published_at) then
    begin
      perform public.award_challenge_certificates_internal(new.id);
    exception when others then
      perform public.report_system_error(
        'certificates', 'challenge-award',
        'Could not award certificates for "' || coalesce(new.title, '?') || '": ' || coalesce(sqlerrm, 'unknown'));
    end;
  end if;
  return new;
end $$;

-- A CERTIFICATE NOBODY IS TOLD ABOUT IS A ROW IN A TABLE.
--
-- The whole value of these is that a creator POSTS one, and a creator who does
-- not know they have one posts nothing.
--
-- TYPE `reward`, NOT A NEW `certificate` TYPE, and that is a deliberate refusal
-- to add one. `notifications.type` is behind a CHECK constraint and every value
-- in it is also a row in the creator's notification PREFERENCES; a new type
-- means a migration, a new preference, a new line of copy, and a creator who
-- has to decide about one more thing. There is nothing to decide: the existing
-- preference reads "When a reward or payout comes your way", a certificate is
-- one, and somebody who turned rewards off has already said what they think.
--
-- VERIFIED end to end: a backfill of eleven awards from a SANDBOX admin account
-- produced eleven awards, eleven blocked notifications (migration 172's
-- read-only fence, working correctly) and one system-error row - and did not
-- roll back a single award. That is the whole promise of these handlers, tested
-- rather than asserted.
create or replace function public.on_certificate_awarded()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  design_title text;
begin
  begin
    select d.title into design_title
    from public.certificate_designs d where d.id = new.design_id;
    perform public.notify_user(
      new.profile_id, 'reward',
      coalesce(design_title, 'You have a new certificate'),
      case
        when new.facts ? 'challenge' then
          'For ' || (new.facts->>'challenge') || '. Open it to download the picture.'
        when new.facts ? 'milestone' then
          'For reaching ' || (new.facts->>'milestone') || '. Open it to download the picture.'
        else 'Open it to download the picture and put it on your story.'
      end,
      '/rewards');
  exception when others then
    perform public.report_system_error(
      'certificates', 'notify',
      'Could not notify a creator about a certificate: ' || coalesce(sqlerrm, 'unknown'));
  end;
  return new;
end $$;

drop trigger if exists certificate_awarded_notifies on public.certificate_awards;
create trigger certificate_awarded_notifies
  after insert on public.certificate_awards
  for each row execute function public.on_certificate_awarded();

-- FIRE EVERY HANDLER ON PURPOSE AND SEE THAT IT SURVIVES.
create or replace function public.certificate_selftest()
returns table (handler text, survived boolean, note text)
language plpgsql volatile security definer set search_path to 'public' as $$
begin
  begin
    perform public.report_system_error('certificates', 'selftest', 'Self test, ignore.');
    perform public.clear_system_error('certificates', 'selftest');
    handler := 'report_system_error'; survived := true; note := 'callable with 3 args';
  exception when others then
    handler := 'report_system_error'; survived := false; note := sqlerrm;
  end;
  return next;

  begin
    perform public.award_challenge_certificates_internal('00000000-0000-0000-0000-000000000000');
    handler := 'award_challenge_certificates_internal'; survived := true; note := 'unknown challenge is a no-op';
  exception when others then
    handler := 'award_challenge_certificates_internal'; survived := false; note := sqlerrm;
  end;
  return next;

  begin
    perform * from public.certificate_candidates('00000000-0000-0000-0000-000000000000');
    handler := 'certificate_candidates'; survived := true; note := 'unknown design returns nothing';
  exception when others then
    handler := 'certificate_candidates'; survived := false; note := sqlerrm;
  end;
  return next;
end $$;
