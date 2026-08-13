-- 096: the community board.
--
-- WHAT IT IS FOR
--
-- A creator with a question about Japan has three bad options today: post it in
-- a room where it scrolls away in an hour, DM one person and get one person's
-- answer, or not ask. The board is the fourth: a question stays put, anybody can
-- answer it, and the answer is still there for the next person who asks the same
-- thing in March.
--
-- THE MODEL IS DELIBERATELY SMALL
--
--   board_questions   title, body, one tag, an author.
--   board_answers     many per question, one author each. No nesting. A thread
--                     of replies-to-replies is a conversation, and a
--                     conversation belongs in a room; this is a question and its
--                     answers.
--
-- "ANSWERED" IS DERIVED, NEVER STORED. A question is answered when it has an
-- answer. There is no "mark as resolved" button, because a flag somebody has to
-- remember to set is a flag that is wrong within a week, and the board's whole
-- promise is that "unanswered" means somebody is actually waiting.
--
-- SEARCH COVERS THE ANSWERS TOO. Somebody searching "visa" wants the thread
-- where the visa answer is, not only the threads that happened to put the word
-- in the title.

-- ------------------------------------------------------------------ questions
create table if not exists public.board_questions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(btrim(title)) between 5 and 160),
  body text not null default '' check (length(body) <= 4000),
  -- Four buckets, and 'other' is one of them on purpose: a tag list with no
  -- escape hatch produces mis-tagged posts, not better tags.
  tag text not null default 'other'
    check (tag in ('country', 'travelling', 'other_things', 'other')),
  -- The country a "question about a country" is about, when the asker names
  -- one. Free text, matched with the same alias table everything else uses.
  country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create index if not exists board_questions_created_idx on public.board_questions (created_at desc);
create index if not exists board_questions_tag_idx on public.board_questions (tag);
create index if not exists board_questions_author_idx on public.board_questions (author_id);

-- ------------------------------------------------------------------- answers
create table if not exists public.board_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.board_questions(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  deleted boolean not null default false
);

create index if not exists board_answers_question_idx on public.board_answers (question_id, created_at);
create index if not exists board_answers_author_idx on public.board_answers (author_id);

-- --------------------------------------------------------------------- search
-- One generated column per table holding the searchable text, indexed with GIN.
-- Generated rather than maintained by a trigger: a trigger can be missed by a
-- bulk update, and a search index that is silently one row stale is worse than
-- one that is obviously missing.
alter table public.board_questions
  add column if not exists search tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(country, '')), 'B')
  ) stored;

alter table public.board_answers
  add column if not exists search tsvector
  generated always as (to_tsvector('english', coalesce(body, ''))) stored;

create index if not exists board_questions_search_idx on public.board_questions using gin (search);
create index if not exists board_answers_search_idx on public.board_answers using gin (search);

-- ------------------------------------------------------------------------ RLS
alter table public.board_questions enable row level security;
alter table public.board_answers enable row level security;

-- Everybody in the programme reads everything. The board is worthless if a
-- question is only visible to the people who already knew about it, and it is
-- network-wide by design - a question about Japan is not a UK question.
-- `status in ('active','muted')`: a muted creator can still read.
drop policy if exists board_questions_read on public.board_questions;
create policy board_questions_read on public.board_questions
  for select to authenticated
  using (
    not deleted
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.status in ('active', 'muted')
    )
  );

drop policy if exists board_questions_insert on public.board_questions;
create policy board_questions_insert on public.board_questions
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'active'
    )
  );

-- Edit your own; admins can edit anything (moderation).
drop policy if exists board_questions_update on public.board_questions;
create policy board_questions_update on public.board_questions
  for update to authenticated
  using (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());

drop policy if exists board_answers_read on public.board_answers;
create policy board_answers_read on public.board_answers
  for select to authenticated
  using (
    not deleted
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.status in ('active', 'muted')
    )
  );

drop policy if exists board_answers_insert on public.board_answers;
create policy board_answers_insert on public.board_answers
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'active'
    )
    -- You cannot answer a question that has been removed.
    and exists (
      select 1 from public.board_questions q
      where q.id = question_id and not q.deleted
    )
  );

drop policy if exists board_answers_update on public.board_answers;
create policy board_answers_update on public.board_answers
  for update to authenticated
  using (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());

-- ------------------------------------------------------------- the board feed
-- ONE QUERY FOR THE WHOLE PAGE.
--
-- The board needs, per question: the asker, how many answers, who answered
-- (faces), and when the last one landed. Doing that from the client is one
-- query for the questions and then one per question for its answers - forty
-- round trips to draw a list. This returns it assembled.
--
-- `q_search` is optional. When it is given, a question matches if the question
-- OR ANY OF ITS ANSWERS matches, because somebody searching for "eSIM" wants
-- the thread where the eSIM answer is.
create or replace function public.board_feed(
  q_search text default null,
  q_tag text default null,
  q_state text default null,   -- 'answered' | 'unanswered' | null for both
  q_limit int default 50,
  q_offset int default 0
)
returns table (
  id uuid,
  title text,
  body text,
  tag text,
  country text,
  created_at timestamptz,
  author_id uuid,
  author_name text,
  author_photo text,
  answer_count bigint,
  last_answer_at timestamptz,
  answerers json
)
language sql
security invoker
stable
set search_path = public
as $$
  with q as (
    select bq.*,
           case when coalesce(btrim(q_search), '') = '' then null
                else websearch_to_tsquery('english', q_search) end as tsq
    from public.board_questions bq
    where not bq.deleted
  ),
  counted as (
    select q.*,
           (select count(*) from public.board_answers a
             where a.question_id = q.id and not a.deleted) as answer_count,
           (select max(a.created_at) from public.board_answers a
             where a.question_id = q.id and not a.deleted) as last_answer_at
    from q
  )
  select c.id, c.title, c.body, c.tag, c.country, c.created_at,
         c.author_id, p.name as author_name, p.photo_url as author_photo,
         c.answer_count, c.last_answer_at,
         coalesce((
           select json_agg(row_to_json(x)) from (
             select distinct on (ap.id) ap.id, ap.name, ap.photo_url
             from public.board_answers a
             join public.profiles ap on ap.id = a.author_id
             where a.question_id = c.id and not a.deleted
             order by ap.id
           ) x
         ), '[]'::json) as answerers
  from counted c
  join public.profiles p on p.id = c.author_id
  where (c.tsq is null
         or c.search @@ c.tsq
         or exists (
           select 1 from public.board_answers a
           where a.question_id = c.id and not a.deleted and a.search @@ c.tsq
         ))
    and (q_tag is null or c.tag = q_tag)
    and (q_state is null
         or (q_state = 'answered' and c.answer_count > 0)
         or (q_state = 'unanswered' and c.answer_count = 0))
  -- Unanswered questions that have been waiting longest are the ones the board
  -- exists to surface, but the default order is still newest-first: a board
  -- sorted by desperation is a board that always looks like a pile of problems.
  -- The UI asks for the unanswered ones explicitly when it wants them.
  order by c.created_at desc
  limit greatest(1, least(coalesce(q_limit, 50), 100))
  offset greatest(0, coalesce(q_offset, 0));
$$;

grant execute on function public.board_feed(text, text, text, int, int) to authenticated;

-- ------------------------------------------------------------ notifications
-- SOMEBODY ANSWERED YOU.
--
-- The one notification this feature needs. Not "somebody posted a question" -
-- 44 people being buzzed every time anybody wonders anything is how a board
-- gets muted in week one - and not "somebody else answered a question you
-- answered", which is a thread subscription and a different, bigger idea.
-- `notifications.type` is a CHECK list, so a new kind has to be admitted before
-- anything can insert one. Widened rather than replaced: dropping and recreating
-- the constraint from a hand-typed list is how an existing type gets left out.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type = any (array[
    'challenge','announcement','results','reward','deadline','connection','dm',
    'event','application','chat','submission','deletion','referral','new_member',
    'inactive','feedback','collab','mention','daily_streak','daily_reminder',
    'board_answer'
  ])
);

create or replace function public.on_board_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  asker uuid;
  q_title text;
  answerer text;
begin
  select author_id, title into asker, q_title
  from public.board_questions where id = new.question_id;
  if asker is null or asker = new.author_id then return new; end if;

  select name into answerer from public.profiles where id = new.author_id;

  perform public.notify_user(
    asker,
    'board_answer',
    coalesce(answerer, 'Someone') || ' answered your question',
    left(new.body, 140),
    '/board/' || new.question_id
  );
  return new;
end $$;

revoke all on function public.on_board_answer() from public, anon, authenticated;

drop trigger if exists trg_on_board_answer on public.board_answers;
create trigger trg_on_board_answer after insert on public.board_answers
  for each row execute function public.on_board_answer();
