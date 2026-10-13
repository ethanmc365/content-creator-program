-- 411: the unread badges asked for the 400 newest messages across every room the reader is in, to keep the newest one
-- per room (UnreadContext). In production that averaged ~100 ms over 1,365 calls a day. This returns exactly one row
-- per room: the newest message the reader may see, read through the (channel, created_at) index.
--
-- SECURITY INVOKER on purpose: the messages policies decide what the reader can see, exactly as the table query did.
-- At most 80 rooms per call.
create or replace function public.latest_message_per_room(p_channels text[])
 returns table(channel text, body text, created_at timestamptz, sender_id uuid, image_url text, video_url text, profiles jsonb)
 language sql
 stable
 set search_path to 'public'
as $function$
  select m.channel, m.body, m.created_at, m.sender_id, m.image_url, m.video_url,
         (select jsonb_build_object('name', p.name, 'photo_url', p.photo_url) from public.profiles p where p.id = m.sender_id)
    from (select distinct c from unnest(p_channels[1:80]) as u(c)) ch
    cross join lateral (
      select * from public.messages mm
       where mm.channel = ch.c and mm.deleted = false
       order by mm.created_at desc
       limit 1
    ) m;
$function$;
