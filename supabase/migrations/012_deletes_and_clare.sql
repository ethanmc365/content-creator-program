-- ============================================================================
-- 012 - more delete controls + a pre-approved admin tester
-- ============================================================================
set check_function_bodies = off;

-- Admins can delete game leaderboard scores (moderation/cleanup).
drop policy if exists "game_scores: admin delete" on public.game_scores;
create policy "game_scores: admin delete" on public.game_scores for delete to authenticated
  using (public.is_admin());

-- Anyone can fully delete one of their own conversations (its messages cascade).
drop policy if exists "conversations: participants delete" on public.conversations;
create policy "conversations: participants delete" on public.conversations for delete to authenticated
  using (participant_a = auth.uid() or participant_b = auth.uid());

-- ----------------------------------------------------------------------------
-- New signups await review, EXCEPT pre-approved testers/owners who come in as
-- active admins. clarehamilton12@gmail.com is approved to test the site.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.email in ('clarehamilton12@gmail.com', 'ethanmc365@gmail.com') then
    insert into public.profiles (id, name, is_admin, status)
    values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)), true, 'active');
  else
    insert into public.profiles (id, name, status)
    values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)), 'pending');
  end if;
  return new;
end;
$$;
