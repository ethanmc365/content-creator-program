-- EVERY SCHEDULED JOB AND EVERY BROADCAST HELPER WAS CALLABLE BY ANY CREATOR.
--
-- Found by a hands-on test, 2 Sep 2026: set `request.jwt.claims` to a real,
-- ordinary, non-admin creator and call things. Twenty-two functions were tried;
-- the twelve genuinely privileged admin RPCs all refused correctly ("Admins
-- only", "Only the Tryp.com team can...") - that part of the platform is sound.
-- These did not.
--
-- **PROVEN, NOT SUSPECTED.** As a plain creator, inside a transaction that was
-- rolled back:
--
--     select public.notify_all(me,'announcement','Tryp.com security',
--                              'Click here','https://evil.example/phish');
--     -->  58 rows written to public.notifications
--
--     select public.notify_community(market, me, 'announcement', ...);
--     -->  50 rows
--
-- A notifications row becomes a WEB PUSH with that title, body and link. So any
-- creator - or anybody who phished one creator's login - could push a message
-- carrying a link of their choosing to every person on the platform, delivered
-- through the channel the community has been taught to trust. That is the same
-- class of hole migration 110 closed for `notify_community`; the fix did not
-- survive, and `notify_all` and `notify_user` were never covered at all.
--
-- The rest were allowed too: `run_view_sync` (fires the scraper at TikTok and
-- Instagram on demand), `purge_old_audit_log` (deletes the audit trail - an
-- attacker tidying up after themselves), `purge_deleted_creators`,
-- `purge_sandbox_sessions` (logs the demo account out), `post_birthday_cards`
-- and `post_scheduled_announcements` (post into chat), and every reminder.
--
-- WHY THE GRANT AND NOT AN `is_admin()` CHECK. Checked, and it matters: every
-- caller of `notify_all`/`notify_community` is a SECURITY DEFINER TRIGGER
-- (`on_announcement`, `on_challenge_live`, `on_event_created`,
-- `on_event_poll_created`, `on_job_opened`, `on_wall_published`,
-- `send_deadline_reminders`). Those fire while an ORDINARY CREATOR is the
-- acting user - somebody posts an announcement, everybody gets told - so an
-- in-function `is_admin()` guard would have broken announcements, events and
-- job postings. A definer function calls the next one as its OWNER, so removing
-- `authenticated`'s EXECUTE stops the direct PostgREST call and leaves every
-- legitimate internal caller working. pg_cron runs as the owner too.
--
-- AND IT IS A TABLE, NOT A REVOKE. Hand-written revokes in this schema have
-- been silently undone FOUR TIMES (see migration 170). `owner_only_rpcs` joins
-- `public_rpc_allowlist` as declared policy that the existing event trigger
-- `no_new_function_is_public` re-applies on every CREATE/ALTER FUNCTION.
-- VERIFIED: recreating `notify_user` leaves it locked, and a brand new definer
-- function is still born anon=false / authenticated=true.

create table if not exists public.owner_only_rpcs (
  proname text primary key,
  why     text not null
);
-- Deny-all by design, like `public_rpc_allowlist` and `auth_attempts`: RLS on,
-- no policy. Only the owner and definer functions read it.
alter table public.owner_only_rpcs enable row level security;

insert into public.owner_only_rpcs (proname, why) values
  ('notify_all',                   'mass notification: PROVEN to write 58 push rows for a plain creator, attacker-chosen link'),
  ('notify_community',             'mass notification to a market: PROVEN to write 50 rows for a plain creator'),
  ('notify_user',                  'targeted notification to any creator with an arbitrary title, body and link'),
  ('notify_inactive_creators',     'notification sender (cron)'),
  ('send_challenge_reminders',     'notification sender (cron)'),
  ('send_daily_puzzle_reminders',  'notification sender (cron)'),
  ('send_event_reminders',         'notification sender (cron)'),
  ('send_deadline_reminders',      'notification sender, called by the reminder cron'),
  ('post_birthday_cards',          'posts into chat (cron)'),
  ('post_scheduled_announcements', 'posts into chat (cron)'),
  ('publish_scheduled_challenges', 'changes challenge state (cron)'),
  ('archive_ended_challenges',     'changes challenge state (cron)'),
  ('purge_deleted_creators',       'deletes accounts (cron)'),
  ('purge_old_audit_log',          'deletes the audit trail - anti-forensics if a creator can call it (cron)'),
  ('purge_sandbox_sessions',       'revokes the demo account''s sessions (cron)'),
  ('reconcile_milestones',         'bulk recompute (cron)'),
  ('reconcile_stale_leaderboards', 'bulk recompute (cron)'),
  ('run_view_sync',                'fires the view scraper at TikTok/Instagram over pg_net (cron)'),
  ('creator_activity',             'last_sign_in_at and last_seen_at for EVERY account; the app uses admin_list_activity instead'),
  ('sandbox_joins_every_market',   'internal maintenance for the preview account')
on conflict (proname) do update set why = excluded.why;

-- The classifier gains a fourth bucket. Order matters: the allowlist wins, then
-- owner-only, then triggers/internals, then the ordinary signed-in case.
create or replace function public.lock_down_definer_functions()
 returns table(fn text, action text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r record;
begin
  for r in
    select p.oid,
           p.proname,
           p.oid::regprocedure::text as sig,
           pg_get_function_result(p.oid) in ('trigger', 'event_trigger') as is_trigger,
           p.proname like '%\_internal' as is_internal,
           exists (select 1 from public.public_rpc_allowlist a where a.proname = p.proname) as allowed,
           exists (select 1 from public.owner_only_rpcs o where o.proname = p.proname) as owner_only
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
  loop
    if r.allowed then
      execute format('grant execute on function %s to anon, authenticated', r.sig);
      fn := r.sig; action := 'kept public (allowlisted)'; return next;
    elsif r.owner_only or r.is_trigger or r.is_internal then
      execute format('revoke all on function %s from public, anon, authenticated', r.sig);
      fn := r.sig; action := 'locked to owner'; return next;
    else
      execute format('revoke all on function %s from public, anon', r.sig);
      execute format('grant execute on function %s to authenticated', r.sig);
      fn := r.sig; action := 'signed-in only'; return next;
    end if;
  end loop;
end $function$;

-- A CREATOR'S NUMBERS ARE THEIR OWN, OR THE TEAM'S.
--
-- `creator_metrics(uuid)` took any profile id and returned that person's entry
-- count, total views, referral count and challenge history to any signed-in
-- caller. Unlike `milestone_progress` - whose whole job is to draw somebody
-- else's route on their public profile, by design - this one is only ever
-- called with your own id, or with an id an ADMIN chose via `?as=` (useViewAs
-- returns the parameter only for an admin). So the guard costs nothing.
create or replace function public.creator_metrics(p_profile uuid)
 returns table(videos numeric, views numeric, referrals numeric, challenges numeric, days numeric, podiums numeric, best_video numeric)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    (select count(*) from public.submissions where creator_id = p_profile)::numeric,
    (select coalesce(sum(coalesce(logged_views, 0)), 0) from public.submissions where creator_id = p_profile)::numeric,
    (select count(distinct r.id) from public.profiles r
       join public.submissions s on s.creator_id = r.id
      where r.referred_by = p_profile and r.status = 'active')::numeric,
    (select count(distinct challenge_id) from public.submissions where creator_id = p_profile)::numeric,
    (select greatest(0, extract(epoch from (now() - coalesce(accepted_at, created_at))) / 86400)
       from public.profiles where id = p_profile)::numeric,
    (select count(*) from public.results where creator_id = p_profile and rank between 1 and 3)::numeric,
    (select coalesce(max(coalesce(logged_views, 0)), 0) from public.submissions where creator_id = p_profile)::numeric
  where p_profile = (select auth.uid()) or public.is_admin();
$function$;

-- Apply the policy now, across the whole schema.
select count(*) from public.lock_down_definer_functions();
