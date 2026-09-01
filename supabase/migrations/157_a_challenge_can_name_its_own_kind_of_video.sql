-- "WHAT KIND OF VIDEO", WHEN NONE OF THE FIVE ANSWERS IS THE ANSWER.
--
-- `content_type` is a small fixed list (their own idea / from suggested videos
-- / talking to camera / built on a hook / something else) and reporting groups
-- on it, so it has to stay small. But "something else" on its own tells the
-- next person reading the brief nothing at all. Ethan: "give them the ability
-- for the admin to actually enter in something as well."
--
-- So the list stays the thing you report on and this is the thing you read.
alter table public.challenges
  add column if not exists content_note text;

comment on column public.challenges.content_note is
  'Free text for content_type = ''other'': the admin names the kind of video this brief wants when none of the fixed options fits. Reporting groups on content_type; this is what a person reads.';

-- AND THE INTRODUCTIONS ROOM WAVES INSTEAD OF SMILING.
--
-- Ethan: "change the icon for introductions from the smiley face to a wave,
-- like a hand waving." The icon is a column on `channels`, not a constant, so
-- this is data. `wave` is a new entry in Icon.jsx (Heroicons "hand-raised").
-- Nothing seeds 'smile' - `create_market` does not name it - so this cannot
-- come back on its own.
update public.channels set icon = 'wave' where key = 'introductions' and icon = 'smile';
