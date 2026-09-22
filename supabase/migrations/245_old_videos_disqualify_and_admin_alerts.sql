-- 245: WHEN WAS IT POSTED, DISQUALIFYING AN ENTRY, AND ADMIN ALERTS (22 Sep 2026).
--
-- ============================================================ 1. posted_at
-- Ethan: "the Spanish creators [are] posting old videos... can you see when the
-- video was posted? ... Anything posted before [the start] you should
-- highlight, and then I can delete it or disqualify it."
--
-- The date is IN THE ID on two of the four platforms, so it needs no scraper:
--   TikTok     video id >> 32 is the Unix second it was created.
--   Instagram  the shortcode is base64 (A-Z a-z 0-9 - _) of the media id, and
--              media id >> 23 is milliseconds since 2011-08-24 21:07:01.721 UTC.
-- A TikTok short link (vm.tiktok.com) carries no id until view-sync resolves it
-- and writes `platform_video_id`; this trigger fires on that write too.
-- YouTube's `publishedAt` comes from the API and view-sync writes it.
-- A decoded date wins over one written by hand; anything outside 2011..now+1d
-- is treated as "could not tell", never as a date.

alter table public.submissions add column if not exists posted_at timestamptz;

create or replace function public.video_posted_at(p_platform text, p_url text, p_id text)
returns timestamptz language plpgsql immutable as $$
declare
  v_id text;
  v_n numeric := 0;
  v_ts timestamptz;
  c text;
  i int;
  alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
begin
  if p_platform = 'TikTok' then
    v_id := coalesce(
      case when p_id ~ '^\d{15,20}$' then p_id end,
      (regexp_match(coalesce(p_url, ''), '/(?:video|photo)/(\d{15,20})'))[1]);
    if v_id is null then return null; end if;
    v_ts := to_timestamp(floor(v_id::numeric / 4294967296));
  elsif p_platform = 'Instagram' then
    v_id := (regexp_match(coalesce(p_url, ''), 'instagram\.com/(?:[A-Za-z0-9_.]+/)?(?:reels?|p|tv)/([A-Za-z0-9_-]{8,14})'))[1];
    if v_id is null then return null; end if;
    for i in 1..length(v_id) loop
      c := substr(v_id, i, 1);
      v_n := v_n * 64 + (strpos(alphabet, c) - 1);
    end loop;
    v_ts := to_timestamp((floor(v_n / 8388608) + 1314220021721) / 1000.0);
  else
    return null;
  end if;
  if v_ts < '2011-01-01' or v_ts > now() + interval '1 day' then return null; end if;
  return v_ts;
end;
$$;

create or replace function public.submission_posted_at_fill()
returns trigger language plpgsql as $$
declare v timestamptz;
begin
  v := public.video_posted_at(new.platform, new.video_url, new.platform_video_id);
  if v is not null then new.posted_at := v; end if;
  return new;
end;
$$;

drop trigger if exists trg_submission_posted_at on public.submissions;
create trigger trg_submission_posted_at
  before insert or update of platform_video_id, video_url, platform on public.submissions
  for each row execute function public.submission_posted_at_fill();

-- Everything already in.
update public.submissions
   set posted_at = public.video_posted_at(platform, video_url, platform_video_id)
 where posted_at is null and public.video_posted_at(platform, video_url, platform_video_id) is not null;

-- The moment a challenge opens: midnight of its start date in its OWN
-- market's timezone (the same rule archive_ended_challenges uses at the other
-- end). The Global Challenge opened 21 Sep 00:00 London = 20 Sep 23:00 UTC.
create or replace function public.challenge_starts_at(p_challenge uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select (c.start_date::timestamp) at time zone coalesce(m.timezone, 'Europe/London')
    from public.challenges c left join public.communities m on m.id = c.community_id
   where c.id = p_challenge
$$;
grant execute on function public.challenge_starts_at(uuid) to authenticated;

-- ===================================================== 2. disqualifying
-- A DISQUALIFIED ENTRY LEAVES THE CONTEST AND KEEPS ITS RECORD. The row moves
-- into `submission_disqualifications` (a full snapshot, the reason, who and
-- when) and is deleted from `submissions`, so every score, board, voucher and
-- CPM that reads entries is right without any of them learning a new flag - the
-- existing delete triggers already recalculate points and rebuild the results.
-- Reinstating puts the same row back under the same id.

create table if not exists public.submission_disqualifications (
  id uuid primary key,                       -- the submission's own id
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  snapshot jsonb not null,
  reason text not null,
  disqualified_by uuid references public.profiles(id) on delete set null,
  disqualified_at timestamptz not null default now()
);
alter table public.submission_disqualifications enable row level security;
drop policy if exists "disqualifications: admins read" on public.submission_disqualifications;
create policy "disqualifications: admins read" on public.submission_disqualifications
  for select to authenticated using (public.is_admin());

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
    perform public.notify_user(s.creator_id, 'submission',
      'An entry was removed from ' || coalesce(v_title, 'the challenge'),
      left(trim(p_reason), 200),
      '/challenges/' || s.challenge_id);
  end if;
end;
$$;
revoke all on function public.disqualify_submission(uuid, text, boolean) from public, anon;
grant execute on function public.disqualify_submission(uuid, text, boolean) to authenticated;

create or replace function public.reinstate_submission(p_submission uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.submission_disqualifications%rowtype;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and is_sandbox) then
    raise exception 'SANDBOX_READ_ONLY: this demo account cannot reinstate entries.';
  end if;
  select * into d from public.submission_disqualifications where id = p_submission for update;
  if not found then raise exception 'No disqualified entry with that id.'; end if;
  insert into public.submissions select * from jsonb_populate_record(null::public.submissions, d.snapshot);
  delete from public.submission_disqualifications where id = d.id;
end;
$$;
revoke all on function public.reinstate_submission(uuid) from public, anon;
grant execute on function public.reinstate_submission(uuid) to authenticated;

-- ===================================================== 3. admin alerts
-- Ethan: "I'm getting tonnes of notifications whenever people submit an entry...
-- we could get hundreds of entries a day." Last 7 days, to admins: 370 entry,
-- 325 new-member and 279 application alerts.
--
-- The switches in Settings -> Admin settings only ever gated device PUSH (in
-- notify-dispatch), and had no defaults, so the bell filled up whatever they
-- said. Now an admin alert that is switched off is never WRITTEN: no bell row,
-- no push. One filter on `notifications`, instead of editing the dozen
-- triggers that write them. Only for recipients who are admins, and only for
-- the admin-audience types; `referral` and `application` also reach creators
-- about their OWN things and those are untouched.
--
-- Defaults (a key nobody has saved): entries, new members and inactive
-- creators OFF; applications, feedback, deletions, referrals ON.
create or replace function public.admin_alert_default(p_type text)
returns boolean language sql immutable as $$
  select case p_type
    when 'submission' then false
    when 'new_member' then false
    when 'inactive' then false
    else true end
$$;

create or replace function public.admin_alert_filter()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_prefs jsonb; v_admin boolean;
begin
  if new.type not in ('submission', 'new_member', 'application', 'referral', 'deletion', 'inactive', 'feedback') then
    return new;
  end if;
  select is_admin, notif_prefs into v_admin, v_prefs from public.profiles where id = new.recipient_id;
  if not coalesce(v_admin, false) then return new; end if;
  -- A disqualification notice to an admin who also entered is about THEIR
  -- entry, not an alert; it carries a different title.
  if new.type = 'submission' and new.title not like 'New challenge entry%' then return new; end if;
  if coalesce((v_prefs ->> new.type)::boolean, public.admin_alert_default(new.type)) then
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_admin_alert_filter on public.notifications;
create trigger trg_admin_alert_filter before insert on public.notifications
  for each row execute function public.admin_alert_filter();
