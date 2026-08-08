-- 082: let a creator mute one market without muting the network.
--
-- A creator can be in more than one market. Today every market that notifies
-- them reaches them the same way, so the only lever is the global notification
-- switch, which is the wrong shape: somebody who lives in the UK and helps out
-- in Spain wants the UK's briefs and not Spain's room chatter, and their only
-- current option is silence or all of it.
--
-- WHERE THE PREFERENCE LIVES
--
-- `profiles.notif_prefs` is already the jsonb bag of notification switches, so
-- this is one more key in it rather than a new table: the set is small, it is
-- read on exactly one code path, and a row per creator per market would be a
-- join on the hot path of every notification insert to store a boolean.
--
--   notif_prefs->'muted_markets'  ->  ["<community uuid>", ...]
--
-- ABSENT MEANS ON. A creator who has never touched this gets every notification
-- they got yesterday, which is what makes this safe to ship to a live network.
--
-- Reversal: restore 076's notify_community body (drop the `not exists` clause).

create or replace function public.notify_community(
  p_community uuid,
  p_except    uuid,
  p_type      text,
  p_title     text,
  p_body      text,
  p_link      text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.notifications (recipient_id, type, title, body, link)
  select m.profile_id, p_type, p_title, p_body, p_link
  from public.community_members m
  join public.profiles p on p.id = m.profile_id
  where m.community_id = p_community
    and m.status = 'active'
    and p.status = 'active'
    and (p_except is null or p.id <> p_except)
    -- Muted for THIS market only. jsonb containment against a text array of
    -- ids; a missing key yields null, and `not (null)` is null, so the clause
    -- is written as an explicit `not exists` to keep absent meaning "notify".
    and not (
      coalesce(p.notif_prefs -> 'muted_markets', '[]'::jsonb)
        @> to_jsonb(p_community::text)
    );
end;
$$;

comment on function public.notify_community(uuid, uuid, text, text, text, text) is
  'Notify every active member of a community, skipping anyone who has that community id in notif_prefs->muted_markets. An absent key means notify.';
