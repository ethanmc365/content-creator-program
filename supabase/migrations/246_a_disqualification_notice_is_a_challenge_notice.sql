-- 246: A DISQUALIFICATION NOTICE IS A 'challenge' NOTIFICATION (22 Sep 2026).
-- 245 sent it as 'submission', which is also an ADMIN alert type that is off by
-- default - so a creator's push for it could be gated by a switch meant for the
-- team. 'challenge' is a creator category that defaults on.

create or replace function public.disqualify_submission(p_submission uuid, p_reason text, p_notify boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare s public.submissions%rowtype; v_title text;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and is_sandbox) then
    raise exception 'SANDBOX_READ_ONLY: this demo account cannot disqualify entries.';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required.'; end if;
  select * into s from public.submissions where id = p_submission for update;
  if not found then raise exception 'That entry no longer exists.'; end if;

  insert into public.submission_disqualifications (id, challenge_id, creator_id, snapshot, reason, disqualified_by)
  values (s.id, s.challenge_id, s.creator_id, to_jsonb(s), trim(p_reason), auth.uid())
  on conflict (id) do update set snapshot = excluded.snapshot, reason = excluded.reason,
    disqualified_by = excluded.disqualified_by, disqualified_at = now();

  delete from public.submissions where id = s.id;

  if p_notify then
    select title into v_title from public.challenges where id = s.challenge_id;
    perform public.notify_user(s.creator_id, 'challenge',
      'An entry was removed from ' || coalesce(v_title, 'the challenge'),
      left(trim(p_reason), 200),
      '/challenges/' || s.challenge_id);
  end if;
end;
$$;
