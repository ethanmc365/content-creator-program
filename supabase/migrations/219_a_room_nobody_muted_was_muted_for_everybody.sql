-- 219. A ROOM NOBODY HAD MUTED WAS MUTED FOR EVERYBODY.
--
-- Migration 217 exists to make a market room notify its members, and applied on
-- its own it still notified nobody. The hole is one line of `room_muted`:
--
--     when jsonb_typeof(prefs -> 'muted_rooms') <> 'array' then false
--
-- `prefs -> 'muted_rooms'` is SQL NULL for a creator who has never switched a
-- room off, `jsonb_typeof(NULL)` is NULL, and `NULL <> 'array'` is NULL - not
-- true. So that arm does not fire, the CASE falls through to its ELSE, and the
-- ELSE is `(prefs -> 'muted_rooms') ? ch`, which on a NULL left-hand side is
-- NULL as well. `room_muted` therefore answered NULL - neither true nor false -
-- for every creator who had never touched the setting.
--
-- The audience filter reads `and not public.room_muted(...)`, and `not NULL` is
-- NULL, which a WHERE clause treats as "no". So the one predicate written to let
-- a creator switch ONE room off switched EVERY room off, for everybody, the
-- moment 217 landed. Measured on production before this migration: 93 of the 94
-- profiles have no `muted_rooms` key, `room_muted('{"chat":true}', ...)` returns
-- NULL, and a rehearsed insert into `romania:general` - eleven active members,
-- nine of them eligible on every other predicate - produced an audience of zero
-- and not one notification row.
--
-- The rule this file exists to write down: A PREDICATE THAT CAN ANSWER NULL IS A
-- PREDICATE THAT SAYS NO. `room_muted` returns boolean and is consumed under a
-- `not`, so every arm of it has to be a real boolean for every input, including
-- the input that is overwhelmingly the common case - the creator who has never
-- opened the setting at all. `coalesce` around `jsonb_typeof` is the whole fix;
-- the ELSE keeps its own `coalesce` so an explicit `null` inside the JSON cannot
-- reintroduce the same thing by a different route.
--
-- Every other arm was already right, and the tests below pin all of them so this
-- cannot regress quietly a third time: announcements are never mutable whatever
-- the array says, null prefs are not muted, an empty array is not muted, and a
-- room named in the array IS muted.

create or replace function public.room_muted(prefs jsonb, ch text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select case
    -- Announcements is never mutable. It is how the programme reaches people,
    -- and it is the one room Ethan named as off limits. Checked on the room's
    -- KEY, so it holds for every market's announcements room including the
    -- markets that do not exist yet.
    when public.channel_key(ch) = 'announcements' then false
    when prefs is null then false
    -- COALESCE, BECAUSE AN ABSENT KEY IS THE COMMON CASE AND NOT AN ERROR.
    -- Without it this arm is NULL rather than true for every creator who has
    -- never muted anything, and the whole function answers NULL. See the header.
    when coalesce(jsonb_typeof(prefs -> 'muted_rooms'), 'null') <> 'array' then false
    -- And the same belt on the way out: `?` on a NULL left-hand side is NULL.
    else coalesce((prefs -> 'muted_rooms') ? ch, false)
  end;
$$;

comment on function public.room_muted(jsonb, text) is
  'True when notif_prefs.muted_rooms names this channel. Always FALSE - never null - for a creator who has muted nothing, and always false for an announcements room, which cannot be switched off.';

grant execute on function public.room_muted(jsonb, text) to authenticated;

-- ----------------------------------------------------------------- the tests
--
-- Run at migration time and raise on the first wrong answer, so a deploy that
-- reintroduces the NULL cannot complete. These are the four states the audience
-- filter actually meets in production.
do $checks$
declare
  bad text := '';
begin
  if public.room_muted('{"chat":true}'::jsonb, 'romania:general') is distinct from false then
    bad := bad || ' [no muted_rooms key should be FALSE, got ' ||
           coalesce(public.room_muted('{"chat":true}'::jsonb, 'romania:general')::text, 'NULL') || ']';
  end if;
  if public.room_muted('{"muted_rooms":null}'::jsonb, 'romania:general') is distinct from false then
    bad := bad || ' [explicit json null should be FALSE]';
  end if;
  if public.room_muted('{"muted_rooms":[]}'::jsonb, 'romania:general') is distinct from false then
    bad := bad || ' [empty array should be FALSE]';
  end if;
  if public.room_muted(null, 'romania:general') is distinct from false then
    bad := bad || ' [null prefs should be FALSE]';
  end if;
  if public.room_muted('{"muted_rooms":["romania:general"]}'::jsonb, 'romania:general') is distinct from true then
    bad := bad || ' [a named room should be TRUE]';
  end if;
  if public.room_muted('{"muted_rooms":["romania:announcements"]}'::jsonb, 'romania:announcements') is distinct from false then
    bad := bad || ' [announcements is never mutable]';
  end if;
  if bad <> '' then
    raise exception 'room_muted is still wrong:%', bad;
  end if;
end $checks$;

notify pgrst, 'reload schema';
