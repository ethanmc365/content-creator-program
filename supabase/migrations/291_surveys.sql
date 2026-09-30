-- 291: surveys the team can put in front of creators.
--
-- Ethan, 30 Sep 2026: "Maybe we should have a survey thing or feedback page on the admin panel ...
-- post forms that will give a pop-up to the creators to fill in. We can ask them for ideas or feedback
-- on the platform ... This could be a persistent pop-up until every creator does it, or persistent
-- every time they open the app. Obviously, they might have other persistent pop-ups, so it's just
-- structuring it well ... Maybe a button saying 'I don't want to take part'."
--
-- surveys            one form: questions (jsonb), who it is for, how hard it asks, when it runs.
--   audience         'everyone' | 'markets' (community_ids) | 'challenge' (entrants of challenge_id,
--                    shown once that challenge has ended - the end-of-challenge feedback form)
--   mode             'until_done'  shown every time the app opens until answered or declined
--                    'once'        shown once; closing it counts as a no
--   allow_decline    shows "I don't want to take part"
-- survey_responses   one row per person per survey: their answers, or declined = true.
--
-- RLS is the boundary: a creator can read only LIVE surveys meant for them, can write only their own
-- single response, and can read only their own. Admins read and manage everything. Test accounts can
-- answer (so the flow can be tried) and are left out of the results page by the app.

create table if not exists public.surveys (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 120),
  intro text,
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  audience text not null default 'everyone' check (audience in ('everyone', 'markets', 'challenge')),
  community_ids uuid[] not null default '{}',
  challenge_id uuid references public.challenges(id) on delete set null,
  mode text not null default 'until_done' check (mode in ('until_done', 'once')),
  allow_decline boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'live', 'closed')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  declined boolean not null default false,
  created_at timestamptz not null default now(),
  unique (survey_id, profile_id)
);
create index if not exists survey_responses_by_survey on public.survey_responses (survey_id, created_at desc);

alter table public.surveys enable row level security;
alter table public.survey_responses enable row level security;

-- Is this survey live, in its window, and meant for this person?
create or replace function public.survey_is_for(p_survey uuid, p_profile uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.surveys s
    where s.id = p_survey
      and s.status = 'live'
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

drop policy if exists "surveys: admins manage" on public.surveys;
create policy "surveys: admins manage" on public.surveys
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "surveys: creators read their live ones" on public.surveys;
create policy "surveys: creators read their live ones" on public.surveys
  for select to authenticated using (public.survey_is_for(id, (select auth.uid())));

drop policy if exists "survey responses: admins read" on public.survey_responses;
create policy "survey responses: admins read" on public.survey_responses
  for select to authenticated using ((select public.is_admin()));
drop policy if exists "survey responses: admins delete" on public.survey_responses;
create policy "survey responses: admins delete" on public.survey_responses
  for delete to authenticated using ((select public.is_admin()));
drop policy if exists "survey responses: read own" on public.survey_responses;
create policy "survey responses: read own" on public.survey_responses
  for select to authenticated using (profile_id = (select auth.uid()));
drop policy if exists "survey responses: answer once" on public.survey_responses;
create policy "survey responses: answer once" on public.survey_responses
  for insert to authenticated
  with check (profile_id = (select auth.uid()) and public.survey_is_for(survey_id, (select auth.uid())));

grant select, insert, update, delete on public.surveys to authenticated;
grant select, insert, delete on public.survey_responses to authenticated;
revoke all on public.surveys from anon;
revoke all on public.survey_responses from anon;

create or replace function public.surveys_touch()
returns trigger language plpgsql set search_path to 'public' as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists surveys_touch on public.surveys;
create trigger surveys_touch before update on public.surveys for each row execute function public.surveys_touch();

-- How many people a survey is for, for the results page's response rate.
create or replace function public.survey_audience_size(p_survey uuid)
returns integer
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  s record;
  n integer;
begin
  if not public.is_admin() then raise exception 'Not authorised.'; end if;
  select * into s from public.surveys where id = p_survey;
  if not found then return 0; end if;
  if s.audience = 'markets' then
    select count(distinct p.id) into n from public.profiles p
    join public.community_members m on m.profile_id = p.id and m.community_id = any(s.community_ids)
    where p.status = 'active' and not coalesce(p.is_test, false) and not coalesce(p.is_admin, false);
  elsif s.audience = 'challenge' then
    select count(distinct sub.creator_id) into n from public.submissions sub
    join public.profiles p on p.id = sub.creator_id
    where sub.challenge_id = s.challenge_id and not coalesce(p.is_test, false);
  else
    select count(*) into n from public.profiles p
    where p.status = 'active' and not coalesce(p.is_test, false) and not coalesce(p.is_admin, false);
  end if;
  return coalesce(n, 0);
end $$;
revoke all on function public.survey_audience_size(uuid) from public, anon;
grant execute on function public.survey_audience_size(uuid) to authenticated;
