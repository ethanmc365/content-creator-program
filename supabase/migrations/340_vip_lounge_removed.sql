-- 340 - THE WORLDWIDE "VIP LOUNGE" IS GONE (5 Oct 2026).
--
-- Ethan: "we also have the VIP lounge, which is unnecessary. It should just be VIP announcements and VIP room" - the two rooms every VIP
-- already shares on Worldwide. The lounge held no messages. `vip_ensure_rooms` re-created it every time a market's VIP programme was
-- opened, so the function stops doing that first, then the room goes (its read marks and message links go with it).
--
-- The body below is the live one, read with pg_get_functiondef, minus the lounge insert.
create or replace function public.vip_ensure_rooms(p_programme uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_comm uuid; v_name text;
begin
  select community_id, name into v_comm, v_name from public.vip_programmes where id = p_programme;
  insert into public.channels (community_id, key, label, hint, icon, post_policy, visibility, position)
  values (v_comm, 'vip', 'VIP room', 'Only for the VIP creators of this market and the team.', 'star', 'all', 'vip', 5)
  on conflict do nothing;
end $$;

-- Only if nobody ever posted in it: a lounge with history would be archived by hand, not deleted by a migration.
delete from public.channels ch
 using public.communities c
 where c.id = ch.community_id and c.kind = 'network' and ch.key = 'vip_global'
   and not exists (select 1 from public.messages m where m.channel_id = ch.id);
