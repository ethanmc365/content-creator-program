-- 353: becoming a VIP takes you off the boards of challenges you have not entered (7 Oct 2026).
--
-- Migration 344 stopped VIPs being DEALT onto challenge boards, but somebody placed on a board as a creator and made a
-- VIP afterwards stayed on it: Jessica Nieto and Yaiza were still on RETO OCTUBRE ESPAÑA's boards, with no entries.
-- A VIP cannot see challenges or enter them, so the seat is empty and it distorts the board. Somebody who already has
-- an entry keeps their place - their points are real.
create or replace function public.vip_leaves_challenge_boards()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    delete from public.challenge_group_members gm
     using public.challenge_groups g, public.challenges c
     where gm.group_id = g.id and c.id = g.challenge_id and gm.creator_id = new.profile_id
       and c.status in ('active', 'draft', 'scheduled')
       and not exists (select 1 from public.submissions s where s.challenge_id = c.id and s.creator_id = new.profile_id);
  end if;
  return null;
exception when others then
  raise warning 'vip_leaves_challenge_boards: %', sqlerrm;
  return null;
end $$;
drop trigger if exists trg_vip_leaves_challenge_boards on public.vip_members;
create trigger trg_vip_leaves_challenge_boards after insert or update of status on public.vip_members
  for each row execute function public.vip_leaves_challenge_boards();
revoke execute on function public.vip_leaves_challenge_boards() from public, anon, authenticated;

-- The ones already there.
delete from public.challenge_group_members gm
 using public.challenge_groups g, public.challenges c, public.vip_members m
 where gm.group_id = g.id and c.id = g.challenge_id and m.profile_id = gm.creator_id and m.status = 'active'
   and c.status in ('active', 'draft', 'scheduled')
   and not exists (select 1 from public.submissions s where s.challenge_id = c.id and s.creator_id = gm.creator_id);
