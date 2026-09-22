-- 248 (22 Sep 2026)
--
-- 1. "EUR 290 WON BY CREATORS SO FAR" WAS ONLY THE PLATFORM'S OWN REWARDS.
--    The 47 pre-platform challenges in `challenge_history` (EUR 8,845) are the
--    bulk of what creators have actually won, and creators cannot read that
--    table (admins only). `prizes_won_total()` returns the per-currency total
--    of both, for anyone signed in. A history row linked to a platform
--    challenge (`challenge_id`) is skipped, because that challenge's prizes
--    are already in `rewards`.
--
-- 2. ONE VIDEO, ONE ENTRY. Andrea's TikTok 7688089012719930656 was entered
--    twice a minute apart, and both copies counted towards her total views.
--    A BEFORE INSERT guard now refuses the same video twice in one challenge
--    (matched on the platform's own video id, so ?is_from_webapp=... and
--    other tracking junk on the link does not make it look new), and the
--    later duplicate is disqualified, silently, with a reason that says why.

create or replace function public.prizes_won_total()
returns table (currency text, amount numeric)
language sql stable security definer set search_path = public as $$
  select currency, sum(amount) from (
    select coalesce(r.currency, 'GBP') as currency, r.amount
      from public.rewards r
      join public.profiles p on p.id = r.creator_id
     where not coalesce(p.is_test, false) and not coalesce(p.is_sandbox, false)
    union all
    select coalesce(h.prize_currency, 'EUR'), coalesce(h.prize_total, 0)
      from public.challenge_history h
     where h.challenge_id is null
  ) t
  group by currency
$$;
revoke all on function public.prizes_won_total() from public, anon;
grant execute on function public.prizes_won_total() to authenticated;

-- The platform's own id for a video link, or the link without its query.
create or replace function public.video_identity(p_platform text, p_url text)
returns text language sql immutable as $$
  select coalesce(
    case
      when p_platform = 'TikTok' then (regexp_match(coalesce(p_url, ''), '/(?:video|photo)/(\d{15,20})'))[1]
      when p_platform = 'Instagram' then (regexp_match(coalesce(p_url, ''), 'instagram\.com/(?:[A-Za-z0-9_.]+/)?(?:reels?|p|tv)/([A-Za-z0-9_-]{8,14})'))[1]
      when p_platform = 'YouTube' then coalesce(
        (regexp_match(coalesce(p_url, ''), '[?&]v=([A-Za-z0-9_-]{11})'))[1],
        (regexp_match(coalesce(p_url, ''), 'youtu\.be/([A-Za-z0-9_-]{11})'))[1],
        (regexp_match(coalesce(p_url, ''), '/(?:shorts|embed|live|v)/([A-Za-z0-9_-]{11})'))[1])
    end,
    lower(rtrim(split_part(split_part(coalesce(p_url, ''), '?', 1), '#', 1), '/'))
  )
$$;

create or replace function public.submission_one_video_one_entry()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_key text;
begin
  v_key := public.video_identity(new.platform, new.video_url);
  if v_key is null or v_key = '' then return new; end if;
  if exists (
    select 1 from public.submissions s
     where s.challenge_id = new.challenge_id
       and s.id is distinct from new.id
       and (public.video_identity(s.platform, s.video_url) = v_key
            or s.platform_video_id = v_key
            or (new.platform_video_id is not null and s.platform_video_id = new.platform_video_id))
  ) then
    raise exception 'This video has already been entered in this challenge.' using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_one_video_one_entry on public.submissions;
create trigger trg_one_video_one_entry
  before insert on public.submissions
  for each row execute function public.submission_one_video_one_entry();

-- Take the existing duplicates off the board (keep the earliest of each).
do $$
declare d record;
begin
  for d in
    select id, challenge_id, creator_id from (
      select s.*, row_number() over (
               partition by s.challenge_id, public.video_identity(s.platform, s.video_url)
               order by s.submitted_at, s.id) as rn
        from public.submissions s
        join public.challenges c on c.id = s.challenge_id and c.status = 'active'
    ) x where rn > 1
  loop
    insert into public.submission_disqualifications (id, challenge_id, creator_id, snapshot, reason, disqualified_by)
    select s.id, s.challenge_id, s.creator_id, to_jsonb(s),
           'Duplicate entry: the same video was entered twice. The first entry still counts.', null
      from public.submissions s where s.id = d.id
    on conflict (id) do nothing;
    delete from public.submissions where id = d.id;
  end loop;
end $$;
