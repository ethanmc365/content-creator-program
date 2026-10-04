-- 330 (4 Oct 2026): "TELL YOUR VIPs SOMETHING" NO LONGER POSTS IN THE ANNOUNCEMENTS ROOM.
--
-- Ethan: "whenever I say 'tell your VIP something' I don't want it to go to the actual announcements on the room. The announcements on
-- the room are different. It should just appear on the VIP page and as a notification to them."
--
-- vip_announce wrote a message into the market's `vip_announcements` room (whose trigger then notified the VIPs). It now writes the
-- announcement row (the card at the top of the VIP page) and sends the notification itself, to every active or paused VIP of the
-- market, and never touches a room. Pinning is gone from the screen, so a note is always pinned while it lasts.
create or replace function public.vip_announce(p_programme uuid, p_title text, p_body text, p_pinned boolean default true,
                                               p_days integer default null, p_everywhere boolean default false)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_id uuid; v_recent int; v_group uuid := gen_random_uuid(); v_ends timestamptz; v_prog uuid; v_title text; v_first uuid;
begin
  if btrim(coalesce(p_body, '')) = '' then raise exception 'Write a message.'; end if;
  if p_everywhere then
    if not public.is_owner() then raise exception 'Only the owner can post to every VIP market at once.'; end if;
  elsif not public.vip_can_manage(p_programme) then
    raise exception 'Only the team members who manage this programme can post to its VIPs.';
  end if;
  v_title := nullif(left(btrim(coalesce(p_title, '')), 120), '');
  v_ends := case when coalesce(p_days, 0) > 0 then now() + make_interval(days => least(p_days, 365)) end;
  for v_prog in select id from public.vip_programmes where (p_everywhere and active) or id = p_programme loop
    select count(*) into v_recent from public.vip_announcements where programme_id = v_prog and created_at > now() - interval '1 hour';
    if v_recent >= 10 then raise exception 'That is a lot of announcements in an hour. Please wait a little.'; end if;
    insert into public.vip_announcements (programme_id, title, body, pinned, created_by, expires_at, everywhere)
    values (v_prog, v_title, left(btrim(p_body), 2000), true, auth.uid(), v_ends, case when p_everywhere then v_group end)
    returning id into v_id;
    v_first := coalesce(v_first, v_id);
    insert into public.notifications (recipient_id, type, title, body, link)
    select m.profile_id, 'vip', coalesce(v_title, 'A note from the team'), left(btrim(p_body), 140), '/vip'
      from public.vip_members m
     where m.programme_id = v_prog and m.status in ('active', 'paused');
  end loop;
  return v_first;
end $function$;
revoke execute on function public.vip_announce(uuid, text, text, boolean, integer, boolean) from public, anon;
grant execute on function public.vip_announce(uuid, text, text, boolean, integer, boolean) to authenticated;
