-- 243: A REACTION TELLS THE PERSON WHOSE MESSAGE IT IS (22 Sep 2026).
--
-- Ethan: "Notifications when someone reacts specifically to your message."
-- Nothing fired on `reactions` or `dm_reactions` at all.
--
-- Type 'reaction'. The in-app row always lands; device push is gated by
-- notif_prefs.reaction in notify-dispatch like every other type, and the
-- Settings list carries a switch for it.
--
-- NOT A STREAM. One unread 'reaction' row per message: a second reaction to the
-- same message while the first notification is still unread UPDATES that row
-- ("Ana and 2 others reacted") instead of buzzing again, and somebody toggling
-- a heart on and off does not ping anybody twice within ten minutes.
-- Never for your own message, never from a test or sandbox account (the sandbox
-- trigger refuses a notification written on its behalf, which would fail the
-- reaction itself).

create or replace function public.notify_reaction_internal(
  p_author uuid, p_reactor uuid, p_emoji text, p_preview text, p_link text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_name   text;
  v_skip   boolean;
  v_row    public.notifications%rowtype;
  v_others int;
begin
  if p_author is null or p_reactor is null or p_author = p_reactor then return; end if;
  select name, coalesce(is_test, false) or coalesce(is_sandbox, false)
    into v_name, v_skip from public.profiles where id = p_reactor;
  if v_skip then return; end if;
  if exists (select 1 from public.profiles where id = p_author
              and (status not in ('active', 'muted') or coalesce(is_test, false))) then
    return;
  end if;

  -- Already told about this message and not read yet: fold this one in.
  select * into v_row from public.notifications
   where recipient_id = p_author and type = 'reaction' and link = p_link and not read
   order by created_at desc limit 1;
  if found then
    if v_row.title like coalesce(v_name, 'Someone') || ' %' then return; end if;
    v_others := coalesce((regexp_match(v_row.title, 'and (\d+) others?'))[1]::int, 0) + 1;
    update public.notifications
       set title = format('%s and %s %s reacted %s to your message',
                          coalesce(v_name, 'Someone'), v_others,
                          case when v_others = 1 then 'other' else 'others' end, p_emoji),
           created_at = now()
     where id = v_row.id;
    return;
  end if;

  -- The same person, the same message, a few minutes ago: a toggle, not news.
  if exists (select 1 from public.notifications
              where recipient_id = p_author and type = 'reaction' and link = p_link
                and title like coalesce(v_name, 'Someone') || ' %'
                and created_at > now() - interval '10 minutes') then
    return;
  end if;

  perform public.notify_user(
    p_author, 'reaction',
    format('%s reacted %s to your message', coalesce(v_name, 'Someone'), p_emoji),
    left(coalesce(nullif(trim(p_preview), ''), 'Your message'), 140),
    p_link);
end;
$$;
revoke all on function public.notify_reaction_internal(uuid, uuid, text, text, text) from public, anon, authenticated;

create or replace function public.on_room_reaction()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m public.messages%rowtype;
  v_preview text;
begin
  select * into m from public.messages where id = new.message_id;
  if not found or coalesce(m.deleted, false) then return new; end if;
  v_preview := nullif(trim(coalesce(m.body, '')), '');
  if v_preview is null then
    v_preview := case when m.video_url is not null then 'Your video' when m.image_url is not null then 'Your photo' else 'Your message' end;
  end if;
  perform public.notify_reaction_internal(
    m.sender_id, new.creator_id, new.emoji, v_preview,
    public.channel_route(coalesce(m.channel, 'general')));
  return new;
exception when others then
  -- A notification is never worth losing the reaction over.
  return new;
end;
$$;

create or replace function public.on_dm_reaction()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m public.direct_messages%rowtype;
  v_preview text;
begin
  select * into m from public.direct_messages where id = new.message_id;
  if not found then return new; end if;
  v_preview := nullif(trim(coalesce(m.body, '')), '');
  if v_preview is null then
    v_preview := case when m.image_url is not null then 'Your photo' else 'Your message' end;
  end if;
  perform public.notify_reaction_internal(
    m.sender_id, new.creator_id, new.emoji, v_preview,
    '/messages/' || m.conversation_id);
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_on_room_reaction on public.reactions;
create trigger trg_on_room_reaction after insert on public.reactions
  for each row execute function public.on_room_reaction();

drop trigger if exists trg_on_dm_reaction on public.dm_reactions;
create trigger trg_on_dm_reaction after insert on public.dm_reactions
  for each row execute function public.on_dm_reaction();
