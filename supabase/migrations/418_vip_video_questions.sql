-- 418: QUESTIONS ON EVERY VIP VIDEO, AND VIP VIDEOS ON A PROFILE (14 Oct 2026).
--
-- Marta: every time a VIP submits a link (challenge or not) they tick what it is - "This is a flight and hotel video" -
-- and she tracks the answers in a Videos page. She decides the question, its options (none = yes/no; one choice or
-- several), whether it must be answered, and who sees it (everyone in the programme, or chosen creators). Unlike a bonus
-- question (vip_bonus_rules.prompt) it pays nothing; it is a label the team can count and filter on.
--
-- A question belongs to one programme, or (programme_id null) to every programme of its kind ('vip' | 'official').

create table if not exists vip_video_questions (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid references vip_programmes(id) on delete cascade,
  kind text not null default 'vip' check (kind in ('vip', 'official')),
  question text not null check (length(btrim(question)) between 3 and 200),
  options text[] not null default '{}',
  multiple boolean not null default false,
  required boolean not null default true,
  audience text not null default 'all' check (audience in ('all', 'some')),
  profile_ids uuid[] not null default '{}',
  active boolean not null default true,
  position integer not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vip_video_answers (
  video_id uuid not null references vip_videos(id) on delete cascade,
  question_id uuid not null references vip_video_questions(id) on delete cascade,
  answers text[] not null default '{}',
  answered_at timestamptz not null default now(),
  primary key (video_id, question_id)
);
create index if not exists vip_video_answers_question_idx on vip_video_answers(question_id);

alter table vip_video_questions enable row level security;
alter table vip_video_answers enable row level security;

-- The team: a programme's managers (or the owner) manage its questions; a question for every programme is the owner's.
drop policy if exists vip_video_questions_staff on vip_video_questions;
create policy vip_video_questions_staff on vip_video_questions for all to authenticated
  using (case when programme_id is null then (select is_owner()) or (select vip_has_access()) else vip_can_manage(programme_id) end)
  with check (case when programme_id is null then (select is_owner()) else vip_can_manage(programme_id) end);

-- Answers: the creator reads their own, the team reads the programme's. Writes only through vip_answer_video.
drop policy if exists vip_video_answers_read on vip_video_answers;
create policy vip_video_answers_read on vip_video_answers for select to authenticated
  using (exists (select 1 from vip_videos v where v.id = video_id and (v.profile_id = (select auth.uid()) or vip_can_see(v.programme_id))));

-- The questions the signed-in creator is asked when they submit.
create or replace function vip_my_video_questions()
returns setof vip_video_questions
language sql
stable
security definer
set search_path = public
as $$
  select q.* from vip_video_questions q
    join vip_members m on m.profile_id = auth.uid() and m.status = 'active'
    join vip_programmes p on p.id = m.programme_id
   where q.active
     and (q.programme_id = m.programme_id or (q.programme_id is null and q.kind = coalesce(p.kind, 'vip')))
     and (q.audience = 'all' or auth.uid() = any(q.profile_ids))
   order by q.position, q.created_at
$$;

-- Answer (or change the answers on) one of your own videos. `p_answers` = {"<question id>": ["option", ...]}; a yes/no
-- question answers ["Yes"] or ["No"].
create or replace function vip_answer_video(p_video uuid, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
  vals text[];
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not exists (select 1 from vip_videos where id = p_video and profile_id = auth.uid()) then raise exception 'NOT_YOUR_VIDEO'; end if;
  for k in select jsonb_object_keys(coalesce(p_answers, '{}'::jsonb)) loop
    if not exists (select 1 from vip_my_video_questions() q where q.id = k::uuid) then continue; end if;
    select coalesce(array_agg(x), '{}') into vals from jsonb_array_elements_text(p_answers -> k) x where length(btrim(x)) > 0;
    if cardinality(vals) = 0 then
      delete from vip_video_answers where video_id = p_video and question_id = k::uuid;
    else
      insert into vip_video_answers (video_id, question_id, answers, answered_at) values (p_video, k::uuid, vals, now())
      on conflict (video_id, question_id) do update set answers = excluded.answers, answered_at = now();
    end if;
  end loop;
end $$;

-- A VIP's videos on their profile's content showcase (they never had any: the showcase read challenge entries only).
-- Only what the post itself shows publicly: link, platform, picture, views, date. Removed and disqualified videos never.
create or replace function profile_vip_videos(p_profile uuid, p_limit integer default 24)
returns table (id uuid, video_url text, platform text, thumbnail_url text, views bigint, posted_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.video_url, v.platform, v.thumbnail_url, v.logged_views::bigint, coalesce(v.posted_at, v.submitted_at)
    from vip_videos v
    join profiles p on p.id = v.profile_id
   where v.profile_id = p_profile
     and v.status not in ('removed', 'disqualified')
     and auth.uid() is not null
     and not coalesce(p.is_sandbox, false)
   order by coalesce(v.logged_views, 0) desc, coalesce(v.posted_at, v.submitted_at) desc
   limit least(coalesce(p_limit, 24), 60)
$$;

revoke all on function vip_my_video_questions() from public, anon;
revoke all on function vip_answer_video(uuid, jsonb) from public, anon;
revoke all on function profile_vip_videos(uuid, integer) from public, anon;
grant execute on function vip_my_video_questions() to authenticated;
grant execute on function vip_answer_video(uuid, jsonb) to authenticated;
grant execute on function profile_vip_videos(uuid, integer) to authenticated;
