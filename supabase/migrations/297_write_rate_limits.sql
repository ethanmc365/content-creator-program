-- 297: RATE LIMITS AT THE DATABASE (30 Sep 2026).
--
-- THE GAP. The app rate-limits sign-in and uploads in edge functions (auth-gate, upload), but every table an
-- approved creator can write to is also reachable straight through PostgREST with their own token, where nothing
-- limited them: a script could post thousands of chat messages, DMs, connection requests or reactions a minute.
--
-- THE FIX is a BEFORE INSERT trigger that counts what the same person inserted in the last window and refuses the
-- next row once they pass a ceiling set far above anything a human does (the ceilings are written next to each
-- trigger). It applies to signed-in people only: the service role, cron jobs and the definer functions the team's
-- own tools run under have no auth.uid() and are never limited, and admins are exempt so bulk team tools cannot trip it.
-- The message is a sentence a person can read.
--
-- Also here: eight functions that had a role-mutable search_path (Supabase advisor `function_search_path_mutable`).

create or replace function public.enforce_write_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_owner_col text := tg_argv[0];
  v_ts_col text := tg_argv[1];
  v_max int := tg_argv[2]::int;
  v_secs int := tg_argv[3]::int;
  v_who uuid;
  v_n int;
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  v_who := (to_jsonb(new) ->> v_owner_col)::uuid;
  if v_who is distinct from auth.uid() then return new; end if;   -- only ever limit the person themselves
  execute format('select count(*) from (select 1 from %I.%I where %I = $1 and %I > now() - make_interval(secs => $2) limit $3) s',
                 tg_table_schema, tg_table_name, v_owner_col, v_ts_col)
    into v_n using v_who, v_secs, v_max;
  if v_n >= v_max then
    raise exception 'You are doing that a lot. Please wait a minute and try again.' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ceilings: (owner column, timestamp column, rows, seconds)
create trigger trg_limit_messages         before insert on public.messages         for each row execute function public.enforce_write_limit('sender_id',   'created_at',   60, 60);
create trigger trg_limit_direct_messages  before insert on public.direct_messages  for each row execute function public.enforce_write_limit('sender_id',   'created_at',   60, 60);
create trigger trg_limit_reactions        before insert on public.reactions        for each row execute function public.enforce_write_limit('creator_id',  'created_at',  120, 60);
create trigger trg_limit_connections      before insert on public.connections      for each row execute function public.enforce_write_limit('creator_id',  'created_at',   40, 600);
create trigger trg_limit_submissions      before insert on public.submissions      for each row execute function public.enforce_write_limit('creator_id',  'submitted_at', 30, 600);
create trigger trg_limit_vip_videos       before insert on public.vip_videos       for each row execute function public.enforce_write_limit('profile_id',  'submitted_at', 30, 600);
create trigger trg_limit_feedback         before insert on public.feedback         for each row execute function public.enforce_write_limit('creator_id',  'created_at',   10, 600);
create trigger trg_limit_message_reports  before insert on public.message_reports  for each row execute function public.enforce_write_limit('reporter_id', 'created_at',   20, 600);
create trigger trg_limit_board_answers    before insert on public.board_answers    for each row execute function public.enforce_write_limit('author_id',   'created_at',   30, 600);
create trigger trg_limit_collab_interests before insert on public.collab_interests for each row execute function public.enforce_write_limit('creator_id',  'created_at',   30, 600);
create trigger trg_limit_flights          before insert on public.flights           for each row execute function public.enforce_write_limit('creator_id',  'created_at',   60, 600);

revoke all on function public.enforce_write_limit() from public, anon;
revoke all on function public.enforce_write_limit() from authenticated;

-- advisor: function_search_path_mutable
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as fn from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and p.proname in ('video_identity', 'video_posted_at', 'notification_snippet', 'submission_posted_at_fill',
                                'vip_protect_flag', 'admin_alert_default', 'vip_month_bounds', 'vip_views_pay') loop
    execute format('alter function %s set search_path = public', r.fn);
  end loop;
end $$;
