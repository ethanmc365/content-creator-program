-- LinkedIn joins the four named social columns.
--
-- It was already possible to add a LinkedIn profile through `other_links`, but
-- that meant it rendered as a generic chain-link labelled whatever the creator
-- typed, next to four platforms that got a proper mark. Ethan asked for the
-- icon; the icon needs a column, because "which of your free-form links is the
-- LinkedIn one" is a guess and the other four are not.
--
-- Nullable with no default and no backfill: nobody has one yet, and an empty
-- string would render as a link to nowhere.
alter table public.profiles add column if not exists linkedin_url text;

comment on column public.profiles.linkedin_url is
  'Public LinkedIn profile URL. Same shape and same RLS as instagram_url etc.';

notify pgrst, 'reload schema';
