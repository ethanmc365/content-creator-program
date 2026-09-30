-- 293: surveys, second pass (1 Oct 2026).
--
-- Ethan: "I think we don't need the ask ones. It should just automatically keep asking until the
-- answer, or if they select 'I don't want to take part' ... We have the closes, but I guess it
-- shouldn't close ... There should be a really nice page ... where we actually view the results ...
-- Maybe create a test of that that I can actually see as well here. I'll have the ability to delete
-- it because it's just a test one." And: "Whenever I set it for a challenge, I want it to show up at
-- the end of the challenge ... There could just be one I want to show up randomly to ask a specific
-- thing."
--
--   surveys.is_test        a survey for trying the tool out: never shown to any creator, badged
--                          "Test" on the admin page, deletable in one press.
--   surveys.thanks         the line a creator sees after sending (optional).
--   surveys.timing         'now'     from the moment it goes live
--                          'date'    from starts_at
--                          'random'  on a random app open (the app decides, roughly one open in three)
--                          A challenge survey is always shown once the challenge has ended, whatever
--                          this says - that rule already lives in survey_is_for.
--   survey_responses.sample_name / sample_market
--                          a made-up respondent for a TEST survey only, so the results page can be
--                          seen with a realistic spread of answers without inventing answers for real
--                          people. profile_id is null on those rows; a real answer still needs one.
--
-- `mode` and `allow_decline` stay as columns (old rows keep their values) but the app no longer
-- offers them: every survey keeps asking until answered and always offers a way to say no.

alter table public.surveys add column if not exists is_test boolean not null default false;
alter table public.surveys add column if not exists thanks text;
alter table public.surveys add column if not exists timing text not null default 'now';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'surveys_timing_check') then
    alter table public.surveys add constraint surveys_timing_check check (timing in ('now', 'date', 'random'));
  end if;
end $$;

alter table public.survey_responses alter column profile_id drop not null;
alter table public.survey_responses add column if not exists sample_name text;
alter table public.survey_responses add column if not exists sample_market text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'survey_responses_who_check') then
    alter table public.survey_responses add constraint survey_responses_who_check
      check (profile_id is not null or sample_name is not null);
  end if;
end $$;

-- A sample row may only belong to a test survey.
create or replace function public.survey_sample_guard()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.profile_id is null and not exists (select 1 from public.surveys s where s.id = new.survey_id and s.is_test) then
    raise exception 'Sample answers are only allowed on a test survey.';
  end if;
  return new;
end $$;
drop trigger if exists survey_sample_guard on public.survey_responses;
create trigger survey_sample_guard before insert or update on public.survey_responses
  for each row execute function public.survey_sample_guard();

-- Test surveys are never for anybody.
create or replace function public.survey_is_for(p_survey uuid, p_profile uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.surveys s
    where s.id = p_survey
      and s.status = 'live'
      and not s.is_test
      and (s.starts_at is null or s.starts_at <= now())
      and (s.ends_at is null or s.ends_at > now())
      and case s.audience
        when 'everyone' then true
        when 'markets' then exists (
          select 1 from public.community_members m
          where m.profile_id = p_profile and m.community_id = any(s.community_ids))
        when 'challenge' then exists (
          select 1 from public.challenges c
          join public.submissions sub on sub.challenge_id = c.id and sub.creator_id = p_profile
          where c.id = s.challenge_id and (c.end_date is null or c.end_date <= now()))
        else false
      end
  )
$$;
revoke all on function public.survey_is_for(uuid, uuid) from public, anon;
grant execute on function public.survey_is_for(uuid, uuid) to authenticated;

-- The results page updates as answers arrive. Realtime respects RLS: admins read every response,
-- a creator only their own.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'survey_responses') then
    alter publication supabase_realtime add table public.survey_responses;
  end if;
end $$;
