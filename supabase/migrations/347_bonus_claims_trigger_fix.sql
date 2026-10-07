-- 347: bonus claims stopped working on 6 Oct.
--
-- 345 taught trg_recalc_points to queue view-sync's view-only updates instead
-- of rescoring the whole challenge per row. Its test compared old.logged_views
-- with new.logged_views in ONE boolean expression. PL/pgSQL resolves every
-- record field in an expression before it evaluates any of it, so `tg_op =
-- 'UPDATE' and ...` does not short-circuit the lookup, and the same function
-- also runs on submission_bonus_claims, which has no logged_views column.
-- Every claim (from the entry form and from the entry card) has failed with
-- 42703 "record old has no field logged_views" since, and so has deleting one.
--
-- The fix keeps the queue and only looks at submission columns when the
-- trigger is on submissions.
create or replace function public.trg_recalc_points()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_challenge uuid;
begin
  v_challenge := coalesce(new.challenge_id, old.challenge_id);
  if exists (select 1 from public.challenges where id = v_challenge and scoring = 'points') then
    if tg_op = 'UPDATE' and tg_table_name = 'submissions' and auth.uid() is null then
      if public.recalc_is_view_only(to_jsonb(old), to_jsonb(new)) then
        insert into public.points_recalc_queue (challenge_id) values (v_challenge) on conflict do nothing;
        return new;
      end if;
    end if;
    perform pg_advisory_xact_lock(hashtext('recalc_points:' || v_challenge::text));
    perform public.recalc_challenge_points_internal(v_challenge);
  end if;
  return coalesce(new, old);
end;
$function$;

-- jsonb keeps the comparison free of compile-time field resolution.
create or replace function public.recalc_is_view_only(o jsonb, n jsonb)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select (o->'logged_views') is distinct from (n->'logged_views')
     and (o->'submitted_at') is not distinct from (n->'submitted_at')
     and (o->'challenge_id') is not distinct from (n->'challenge_id')
     and (o->'creator_id')   is not distinct from (n->'creator_id')
     and (o->'platform')     is not distinct from (n->'platform')
$$;
revoke execute on function public.recalc_is_view_only(jsonb, jsonb) from public, anon, authenticated;
