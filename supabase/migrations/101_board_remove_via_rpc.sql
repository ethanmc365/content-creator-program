-- The Remove button on the community board did nothing, and this is why.
--
-- THE BUG. Removing a question or an answer is a SOFT delete - `update ... set
-- deleted = true` - and both tables have exactly the policies you would write:
--
--   read    using (not deleted and <you are a member>)
--   update  using ((author_id = auth.uid()) or is_admin())
--           with check ((author_id = auth.uid()) or is_admin())
--
-- Every one of those is satisfied by the author flipping `deleted`. The update
-- is nevertheless refused with `42501: new row violates row-level security
-- policy for table "board_questions"`, and it is refused ONLY when the column
-- being set is `deleted`: setting `updated_at` on the same row in the same
-- session succeeds. Reproduced directly against production before writing this.
--
-- The reason is that the new row has to remain VISIBLE, and the read policy is
-- `not deleted`. Setting the flag makes the row fail the very policy that lets
-- you see it, so the statement that hides a row is the one statement RLS will
-- not let you run. A soft delete and a `not deleted` read policy cannot both be
-- expressed as plain table writes.
--
-- And it failed SILENTLY, which is why it read as "the remove button didn't
-- seem to work" rather than as an error: `removeQuestion` returned the builder
-- without inspecting `error`, and the page navigated away regardless.
--
-- THE FIX IS AN RPC, WHICH IS ALSO THE RULE THIS REPO ALREADY HAS. "UPDATE is
-- not column-aware, so anything that should only move one field is an RPC,
-- never an UPDATE policy" - `edit_message` and `acknowledge_collab_interest`
-- are the same shape. A definer function does the authorship check itself, and
-- touches exactly one column.
--
-- Removing a QUESTION now takes its answers with it in the same statement.
-- They were being left behind as live rows attached to a question nobody could
-- reach, which is a slow leak of orphans and, more to the point, an answer
-- somebody wrote that is neither visible nor gone.
--
-- Applied to production 15 Aug 2026.

create or replace function public.board_remove_question(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select author_id into v_author from public.board_questions where id = p_id and deleted = false;
  if not found then raise exception 'That question is not on the board'; end if;
  if v_author <> auth.uid() and not public.is_admin() then
    raise exception 'You can only remove your own question';
  end if;
  update public.board_questions set deleted = true, updated_at = now() where id = p_id;
  update public.board_answers set deleted = true where question_id = p_id and deleted = false;
end $$;

create or replace function public.board_remove_answer(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select author_id into v_author from public.board_answers where id = p_id and deleted = false;
  if not found then raise exception 'That answer is not on the board'; end if;
  if v_author <> auth.uid() and not public.is_admin() then
    raise exception 'You can only remove your own answer';
  end if;
  update public.board_answers set deleted = true where id = p_id;
end $$;

-- REVOKE FROM ANON EXPLICITLY. Supabase's ALTER DEFAULT PRIVILEGES grants
-- EXECUTE on every new function to anon BY NAME, and `revoke ... from public`
-- does not remove a named grant. Migrations 081 and 097 both shipped
-- anon-callable definer functions because of this.
revoke all on function public.board_remove_question(uuid) from public;
revoke all on function public.board_remove_question(uuid) from anon;
grant execute on function public.board_remove_question(uuid) to authenticated;

revoke all on function public.board_remove_answer(uuid) from public;
revoke all on function public.board_remove_answer(uuid) from anon;
grant execute on function public.board_remove_answer(uuid) to authenticated;
