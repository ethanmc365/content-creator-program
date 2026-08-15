-- The board feed carries the answers themselves, not only a count of them.
--
-- WHY. The notes on the board are pinned questions, and a pinned question with
-- "3 answers" written on it is a filing card: you have to open it to find out
-- whether the answer is any use. Ethan asked for the answers to show under the
-- question on the note itself, with the long ones behind a click - which means
-- the feed has to return the text, and it was returning a bigint.
--
-- CAPPED AT THREE, AND TRIMMED TO 400 CHARACTERS. Both caps are about the wire,
-- not the layout. A board of fifty questions with every answer in full is a
-- megabyte of JSON to draw two lines of each; the card clamps as well, and
-- `truncated` tells it when it is looking at a stub so it can say so rather
-- than ending a sentence mid-word and pretending that was the whole answer.
--
-- The function had to be DROPped rather than replaced: adding an OUT column
-- changes the row type, and `create or replace` cannot do that.
--
-- Applied to production 15 Aug 2026.

drop function if exists public.board_feed(text, text, text, integer, integer);

create function public.board_feed(
  q_search text default null,
  q_tag text default null,
  q_state text default null,
  q_limit integer default 50,
  q_offset integer default 0
)
returns table (
  id uuid, title text, body text, tag text, country text,
  created_at timestamptz, author_id uuid, author_name text, author_photo text,
  answer_count bigint, last_answer_at timestamptz, answerers json, answers json
)
language sql
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
         ), '[]'::json) as answerers,
         coalesce((
           select json_agg(row_to_json(y)) from (
             select a.id, left(a.body, 400) as body, a.created_at,
                    ap.name as author_name, ap.photo_url as author_photo,
                    (length(a.body) > 400) as truncated
             from public.board_answers a
             join public.profiles ap on ap.id = a.author_id
             where a.question_id = c.id and not a.deleted
             order by a.created_at asc
             limit 3
           ) y
         ), '[]'::json) as answers
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
  order by c.created_at desc
  limit greatest(1, least(coalesce(q_limit, 50), 100))
  offset greatest(0, coalesce(q_offset, 0));
$$;

-- A DROP takes the grants with it, so they have to be restated - and `anon`
-- has to be revoked by name again for the reason in migration 101.
revoke all on function public.board_feed(text, text, text, integer, integer) from public;
revoke all on function public.board_feed(text, text, text, integer, integer) from anon;
grant execute on function public.board_feed(text, text, text, integer, integer) to authenticated;
