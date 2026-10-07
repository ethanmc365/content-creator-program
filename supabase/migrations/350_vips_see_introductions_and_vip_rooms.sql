-- 350: a VIP creator's rooms are Introductions and their VIP rooms.
--
-- Ethan (7 Oct 2026): VIPs could see every general room "which I thought was a good idea because then they could
-- connect with each other. The problem is they then see we talk about stuff for the community challenges in these
-- general groups and they're confused ... They shouldn't see the general, content tips, announcements or general
-- one, just the introductions and the VIP room."
--
-- So for an active VIP who is not on the team (the same test as `vip_hides_announcements`, migration 307: admins and
-- VIP managers are never fenced), the only rooms that exist are:
--   * Introductions (worldwide) - meeting other creators has nothing to do with challenges;
--   * their market's VIP room and VIP announcements (already limited to their own market by vip_room_ok).
-- General, Announcements, Content tips, Meetups and Feedback, in every market and worldwide, are hidden: from the
-- room list (channels) and from the messages themselves, so a deep link or search cannot reach them either.
-- Restrictive, so it narrows whatever the permissive policies allow and touches nobody else.
create or replace function public.vip_room_key_ok(p_key text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select not public.vip_hides_announcements()
      or coalesce(p_key, '') in ('introductions', 'vip', 'vip_announcements', 'vip_global')
$$;

drop policy if exists "vips see introductions and vip rooms" on public.channels;
create policy "vips see introductions and vip rooms" on public.channels
  as restrictive for select to authenticated
  using ((select public.vip_room_key_ok(key)));

drop policy if exists "vips see introductions and vip rooms" on public.messages;
create policy "vips see introductions and vip rooms" on public.messages
  as restrictive for select to authenticated
  using (public.vip_room_key_ok(public.channel_key(channel)));

drop policy if exists "vips post in introductions and vip rooms" on public.messages;
create policy "vips post in introductions and vip rooms" on public.messages
  as restrictive for insert to authenticated
  with check (public.vip_room_key_ok(public.channel_key(channel)));
