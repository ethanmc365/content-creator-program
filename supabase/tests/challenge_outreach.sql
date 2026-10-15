-- Run after migration 425 inside a transaction; no real notifications are sent.
-- Test account ids are resolved before switching to the authenticated API role.
select set_config('test.qa_admin', (select id::text from auth.users where email = 'qa-admin@trypcreators.test'), true);
select set_config('test.qa_creator', (select id::text from auth.users where email = 'qa-creator@trypcreators.test'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.qa_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $test$
declare ch uuid; audience jsonb; posted text[]; waiting text[]; sent int;
begin
  if not public.is_admin() then raise exception 'Missing QA admin account'; end if;
  select id into ch from public.challenges where status = 'active' order by start_date limit 1;
  if ch is null then raise exception 'An active challenge is needed for this rehearsal'; end if;
  audience := public.challenge_reach(ch);
  if not (audience->>'can_thank_posted')::boolean then raise exception 'Posted audience capability is missing'; end if;
  posted := public.challenge_reach_emails(ch, 'posted');
  waiting := public.challenge_reach_emails(ch, 'all');
  if exists (select 1 from unnest(posted) a join unnest(waiting) b on a=b) then raise exception 'Posted and reminder audiences overlap'; end if;
  if cardinality(posted) > (audience->>'posted')::int then raise exception 'Thank-you list includes non-entrants'; end if;
  if cardinality(waiting) > (audience->>'audience')::int - (audience->>'posted')::int then raise exception 'Reminder list includes entrants'; end if;
  -- An impossible market makes this a validation-only call: zero inserts, no mail, no push.
  sent := public.challenge_nudge(ch, 'posted', 'QA rehearsal', 'No recipients', '__qa_no_such_market__');
  if sent <> 0 then raise exception 'Unexpected recipients'; end if;
  begin
    perform public.challenge_nudge(ch, 'invalid', 'QA rehearsal', 'No recipients', '__qa_no_such_market__');
    raise exception 'Invalid segment was accepted';
  exception when others then
    if sqlerrm <> 'Unknown group.' then raise; end if;
  end;
  raise notice 'Admin passed: % posted emails and % reminder emails; no overlap; zero notifications sent', cardinality(posted), cardinality(waiting);
end $test$;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.qa_creator'), 'role', 'authenticated')::text, true);
do $test$
begin
  if public.is_admin() then raise exception 'Expected a non-admin QA creator'; end if;
  begin
    perform public.challenge_reach_emails('00000000-0000-0000-0000-000000000000', 'posted');
    raise exception 'Creator could read the email audience';
  exception when others then
    if sqlerrm <> 'Only the team can see this.' then raise; end if;
  end;
  begin
    perform public.challenge_nudge('00000000-0000-0000-0000-000000000000', 'posted', 'QA', 'QA');
    raise exception 'Creator could send notifications';
  exception when others then
    if sqlerrm <> 'Only the team can send this.' then raise; end if;
  end;
end $test$;
reset role;
-- The Management API returns this expected error as proof; it also rolls the function edits back.
do $test$ begin raise exception 'REHEARSAL PASSED: admin audience checks, creator denials, no notifications sent; all changes rolled back'; end $test$;
