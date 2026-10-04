-- ONE VIDEO, ONE ENTRY - NOW ACROSS CHALLENGES (4 Oct 2026).
--
-- Several challenges run at once (the global one plus a market's own), and the
-- guard from 248 only looked inside ONE challenge. So a video entered in the
-- Spanish challenge could be entered again in the global one, and its views
-- counted twice.
--
-- The rule is now:
--   * the same video cannot be entered twice in a challenge, by anyone (as before);
--   * the same creator cannot enter one video in two challenges, active OR ended -
--     reusing an old video's views in a new challenge is exactly what this stops.
-- (Two creators in two challenges is left alone: that is a collab post, and a
-- collab is credited to both through the collab bonus, not by entering it twice.)
--
-- The refusal carries what a creator needs to act on it, in fields the client
-- can read instead of parsing a sentence: DETAIL is the other challenge's title
-- and HINT is 'same' (this challenge) or 'other' (a different one).

create or replace function public.submission_one_video_one_entry()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_key text;
  v_hit record;
begin
  v_key := public.video_identity(new.platform, new.video_url);
  if (v_key is null or v_key = '') and new.platform_video_id is null then return new; end if;

  select s.id, s.challenge_id, c.title,
         (s.challenge_id = new.challenge_id) as same_challenge
    into v_hit
    from public.submissions s
    join public.challenges c on c.id = s.challenge_id
   where s.id is distinct from new.id
     and (s.challenge_id = new.challenge_id or s.creator_id = new.creator_id)
     and (
          (v_key is not null and v_key <> '' and (public.video_identity(s.platform, s.video_url) = v_key
                                                  or s.platform_video_id = v_key))
          or (new.platform_video_id is not null and s.platform_video_id = new.platform_video_id)
         )
   order by (s.challenge_id = new.challenge_id) desc, s.submitted_at
   limit 1;

  if found then
    raise exception 'This video has already been submitted.' using
      errcode = '23505',
      detail  = v_hit.title,
      hint    = case when v_hit.same_challenge then 'same' else 'other' end;
  end if;
  return new;
end;
$$;

-- THE LATE CATCH, ACROSS CHALLENGES. A vm.tiktok.com short link only reveals its
-- real video id when view-sync resolves it, so a repeat in another challenge can
-- slip past the door. When the id lands, the same creator's LATER entry of that
-- video (in any other challenge) is archived - kept, explained, reversible, like
-- the within-challenge case - and the creator is told which challenge it was
-- already in.
create or replace function public.submission_drop_resolved_cross_challenge()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_first  record;
  v_title  text;
begin
  if new.platform_video_id is null or new.platform_video_id = '' then return new; end if;

  select s.id, s.challenge_id, c.title into v_first
    from public.submissions s
    join public.challenges c on c.id = s.challenge_id
   where s.creator_id = new.creator_id
     and s.challenge_id <> new.challenge_id
     and s.platform_video_id = new.platform_video_id
     and (s.submitted_at, s.id) < (new.submitted_at, new.id)
   order by s.submitted_at, s.id
   limit 1;

  if v_first.id is null then return new; end if;

  select title into v_title from public.challenges where id = new.challenge_id;

  insert into public.submission_duplicates
    (id, challenge_id, creator_id, platform_video_id, kept_submission_id, snapshot)
  values (new.id, new.challenge_id, new.creator_id, new.platform_video_id, v_first.id, to_jsonb(new))
  on conflict (id) do nothing;

  begin
    insert into public.notifications (recipient_id, type, title, body, link)
    values (
      new.creator_id, 'submission', 'We removed a repeated entry',
      'One of your videos was entered in ' || coalesce(v_title, 'a challenge') || ' and in '
        || coalesce(v_first.title, 'another challenge') || '. A video can only count in one challenge, '
        || 'so the first entry stays and the repeat was removed.',
      '/challenges/' || new.challenge_id);
  exception when others then
    raise warning 'could not notify % about cross-challenge duplicate %: %', new.creator_id, new.id, sqlerrm;
  end;

  delete from public.submissions where id = new.id;
  return null;
end;
$$;

drop trigger if exists trg_drop_resolved_cross_challenge on public.submissions;
create trigger trg_drop_resolved_cross_challenge
  after update of platform_video_id on public.submissions
  for each row
  when (new.platform_video_id is not null and new.platform_video_id is distinct from old.platform_video_id)
  execute function public.submission_drop_resolved_cross_challenge();

revoke all on function public.submission_drop_resolved_cross_challenge() from public, anon, authenticated;
revoke all on function public.submission_one_video_one_entry() from public, anon, authenticated;
