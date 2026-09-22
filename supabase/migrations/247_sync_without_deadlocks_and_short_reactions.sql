-- 247 (22 Sep 2026): two fixes Ethan hit on the day the Global Challenge went live.
--
-- 1. "IT SAYS 4 CANNOT BE READ ... NOW IT SAYS 1". Not unreadable videos: DEADLOCKS.
--    view-sync writes several entries at once, and every write to
--    submissions.logged_views fires trg_recalc_points, which deletes and
--    re-inserts EVERY auto point award for the whole challenge and rebuilds the
--    results. Two of those running together lock the same rows in different
--    orders; Postgres kills one ("deadlock detected", in the logs at the exact
--    minute of each sync) and that entry's update fails, which view-sync counts
--    as "could not be read". The number changed from press to press because it
--    is a race. Fix: the recalculation takes a per-challenge transaction lock
--    first, so concurrent writes to one challenge queue instead of colliding.
--    Different challenges still run in parallel.
--
-- 2. A reaction notification carried up to 140 characters of the message, which
--    on a phone is a four-line banner. It now carries the FIRST LINE only,
--    markdown stripped, capped at 60 characters.

create or replace function public.trg_recalc_points()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_challenge uuid;
begin
  v_challenge := coalesce(new.challenge_id, old.challenge_id);
  if exists (select 1 from public.challenges where id = v_challenge and scoring = 'points') then
    perform pg_advisory_xact_lock(hashtext('recalc_points:' || v_challenge::text));
    perform public.recalc_challenge_points_internal(v_challenge);
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.trg_results_follow_manual_award()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_challenge uuid;
begin
  if coalesce(new.is_auto, old.is_auto, true) then return coalesce(new, old); end if;
  v_challenge := coalesce(new.challenge_id, old.challenge_id);
  if v_challenge is null then return coalesce(new, old); end if;
  if exists (select 1 from public.challenges where id = v_challenge and scoring = 'points') then
    perform pg_advisory_xact_lock(hashtext('recalc_points:' || v_challenge::text));
    perform public.rebuild_challenge_results(v_challenge);
  end if;
  return coalesce(new, old);
end;
$$;

-- The first line of a message, as a notification should show it.
create or replace function public.notification_snippet(p_text text, p_max int default 60)
returns text language sql immutable as $$
  with first_line as (
    select trim(regexp_replace(
             regexp_replace(
               coalesce((select l from regexp_split_to_table(coalesce(p_text, ''), E'\\r?\\n') as l
                          where trim(l) <> '' limit 1), ''),
               '^\s*(#{1,6}\s+|>\s*|[-*]\s+)', ''),
             '(\*\*|__|\*|~~|`)', '', 'g')) as s
  )
  select case
           when s = '' then null
           when char_length(s) > p_max then rtrim(left(s, p_max - 1)) || '…'
           else s
         end
  from first_line;
$$;

create or replace function public.notify_reaction_internal(p_author uuid, p_reactor uuid, p_emoji text, p_preview text, p_link text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_name   text;
  v_skip   boolean;
  v_row    public.notifications%rowtype;
  v_others int;
begin
  if p_author is null or p_reactor is null or p_author = p_reactor then return; end if;
  select name, coalesce(is_test, false) or coalesce(is_sandbox, false)
    into v_name, v_skip from public.profiles where id = p_reactor;
  if v_skip then return; end if;
  if exists (select 1 from public.profiles where id = p_author
              and (status not in ('active', 'muted') or coalesce(is_test, false))) then
    return;
  end if;

  select * into v_row from public.notifications
   where recipient_id = p_author and type = 'reaction' and link = p_link and not read
   order by created_at desc limit 1;
  if found then
    if v_row.title like coalesce(v_name, 'Someone') || ' %' then return; end if;
    v_others := coalesce((regexp_match(v_row.title, 'and (\d+) others?'))[1]::int, 0) + 1;
    update public.notifications
       set title = format('%s and %s %s reacted %s to your message',
                          coalesce(v_name, 'Someone'), v_others,
                          case when v_others = 1 then 'other' else 'others' end, p_emoji),
           created_at = now()
     where id = v_row.id;
    return;
  end if;

  if exists (select 1 from public.notifications
              where recipient_id = p_author and type = 'reaction' and link = p_link
                and title like coalesce(v_name, 'Someone') || ' %'
                and created_at > now() - interval '10 minutes') then
    return;
  end if;

  perform public.notify_user(
    p_author, 'reaction',
    format('%s reacted %s to your message', coalesce(v_name, 'Someone'), p_emoji),
    coalesce(public.notification_snippet(p_preview, 60), 'Your message'),
    p_link);
end;
$$;

-- Existing long ones, tidied so the bell list matches.
update public.notifications
   set body = coalesce(public.notification_snippet(body, 60), body)
 where type = 'reaction' and body is not null and (body like E'%\n%' or char_length(body) > 60);
