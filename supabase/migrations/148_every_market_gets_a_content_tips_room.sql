-- CONTENT TIPS IS THE ROOM THE PROGRAMME IS ACTUALLY FOR.
--
-- Worldwide has had one since it opened. The six market chapters got General,
-- Announcements and Meetups and nothing else, so "what is working on TikTok in
-- Spain right now" had nowhere local to go: either into Spain's General, where
-- it scrolls past a meetup thread, or into the worldwide room, where the advice
-- is not about Spain. Ethan asked for one in every market and he is right - the
-- tips are the most market-specific thing the community produces, because the
-- algorithm, the season and the deals all differ by country.
--
-- Order in the sidebar ends up general, announcements, content tips, meetups.
insert into public.channels (community_id, key, label, hint, icon, post_policy, visibility, position)
select c.id,
       'content_tips',
       'Content tips',
       'What is working right now in ' || c.name || ', from people doing it.',
       'bulb',
       'all',
       'scope',
       0
  from public.communities c
 where c.kind = 'chapter'
on conflict (community_id, key) do nothing;

-- Meetups moves down one so the new room is not sitting under it.
update public.channels ch
   set position = 1
  from public.communities c
 where c.id = ch.community_id
   and c.kind = 'chapter'
   and ch.key = 'meetups';

-- And a market opened NEXT month gets one without anybody remembering to ask.
-- Body copied verbatim from pg_get_functiondef and edited in four places (the
-- default p_rooms array, the required-rooms array, and the three case arms),
-- rather than retyped from memory - see the note in the migrations README about
-- what retyping a live function body cost us in August.
CREATE OR REPLACE FUNCTION public.create_market(p_slug text, p_name text, p_country_codes text[], p_currency text DEFAULT 'EUR'::text, p_timezone text DEFAULT 'UTC'::text, p_lead uuid DEFAULT NULL::uuid, p_cpm_target numeric DEFAULT 0.50, p_tagline text DEFAULT NULL::text, p_join_policy text DEFAULT 'country'::text, p_rooms text[] DEFAULT ARRAY['general'::text, 'announcements'::text, 'content_tips'::text, 'meetups'::text], p_open_now boolean DEFAULT false, p_settings jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id    uuid;
  v_key   text;
  v_pos   int := 0;
  v_rooms text[];
begin
  if not public.is_global_admin() then
    raise exception 'Only a global admin can open a new market';
  end if;

  if p_slug !~ '^[a-z0-9-]{2,32}$' then
    raise exception 'Slug must be 2-32 characters, lowercase letters, numbers and hyphens only';
  end if;

  if exists (select 1 from public.communities where slug = p_slug) then
    raise exception 'A market with the slug "%" already exists', p_slug;
  end if;

  insert into public.communities
    (slug, name, kind, country_codes, currency, timezone, lead_id, cpm_target,
     is_active, tagline, join_policy, settings)
  values
    (p_slug, p_name, 'chapter', coalesce(p_country_codes, '{}'), p_currency, p_timezone,
     p_lead, p_cpm_target, coalesce(p_open_now, false), p_tagline,
     coalesce(p_join_policy, 'country'), coalesce(p_settings, '{}'::jsonb))
  returning id into v_id;

  -- content_tips joins general and announcements as a room a market cannot be
  -- opened without: they are the three that make a chapter a place.
  select array(
    select distinct e
    from unnest(array['general', 'announcements', 'content_tips'] || coalesce(p_rooms, '{}')) e
  ) into v_rooms;

  foreach v_key in array v_rooms
  loop
    insert into public.channels (community_id, key, label, hint, icon, post_policy, visibility, position)
    values (
      v_id, v_key,
      case v_key
        when 'general'       then 'General'
        when 'announcements' then 'Announcements'
        when 'content_tips'  then 'Content tips'
        when 'meetups'       then 'Meetups'
        when 'feedback'      then 'Feedback'
        when 'introductions' then 'Introductions'
        else initcap(replace(v_key, '-', ' '))
      end,
      case v_key
        when 'general'       then 'The main room. Everything going on in ' || p_name || '.'
        when 'announcements' then 'News for ' || p_name || ' from the team.'
        when 'content_tips'  then 'What is working right now in ' || p_name || ', from people doing it.'
        when 'meetups'       then 'Who is filming where, and when.'
        when 'feedback'      then 'Tell the team what would help.'
        when 'introductions' then 'New here? Say hello.'
        else null
      end,
      case v_key
        when 'general'       then 'chat'
        when 'announcements' then 'megaphone'
        when 'content_tips'  then 'bulb'
        when 'meetups'       then 'calendar'
        when 'feedback'      then 'bulb'
        when 'introductions' then 'users'
        else 'chat'
      end,
      case when v_key = 'announcements' then 'staff' else 'all' end,
      'scope',
      case v_key when 'general' then -2 when 'announcements' then -1 when 'content_tips' then 0 else v_pos + 1 end
    )
    on conflict (community_id, key) do nothing;
    v_pos := v_pos + 1;
  end loop;

  if p_lead is not null then
    insert into public.community_members (community_id, profile_id, role, is_home, status)
    values (v_id, p_lead, 'manager',
            not exists (
              select 1 from public.community_members m
              join public.communities c on c.id = m.community_id
              where m.profile_id = p_lead and m.is_home and c.kind = 'chapter'
            ),
            'active')
    on conflict (community_id, profile_id) do update set role = 'manager';
  end if;

  return v_id;
end;
$function$;

notify pgrst, 'reload schema';
