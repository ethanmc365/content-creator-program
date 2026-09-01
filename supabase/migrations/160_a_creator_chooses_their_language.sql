-- A CREATOR CHOOSES THEIR LANGUAGE, AND THE CHOICE FOLLOWS THEM.
--
-- Ethan: "create the full Spanish translation for the entire platform... this
-- needs to be toggleable in settings."
--
-- PER ACCOUNT, NOT PER DEVICE, and that is the whole reason this column exists
-- rather than the setting living only in localStorage. Somebody who picks
-- Spanish on their phone and then opens the app on a laptop has not changed
-- their mind about which language they read. `lib/i18n` still keeps a
-- per-device copy so the screen changes on the same frame as the tap instead of
-- after a round trip - the device copy wins where the two disagree, because a
-- switch you have just made must not be undone a second later by a profile
-- fetch. See `adoptProfileLocale`.
--
-- NULL MEANS "NEVER CHOSEN", which is not the same as English: a creator in
-- Madrid whose browser is in Spanish should get Spanish the first time they
-- open the app, and only a null here lets the browser answer. Defaulting the
-- column to 'en' would take that away from every creator who already exists.
--
-- The CHECK is deliberately a list rather than a free-text column. A locale
-- this build has no dictionary for renders as English anyway, so storing one
-- would be recording a preference the app cannot honour; the constraint fails
-- loudly at the write instead, which is where a bug like that is cheap.

alter table public.profiles
  add column if not exists locale text;

comment on column public.profiles.locale is
  'The language this creator has chosen for the app (''en'', ''es''). Null means they have never chosen and the browser decides. Per ACCOUNT, so the choice follows them from a phone to a laptop; lib/i18n also keeps a per-device copy so the screen changes before the round trip.';

alter table public.profiles
  drop constraint if exists profiles_locale_check;
alter table public.profiles
  add constraint profiles_locale_check check (locale is null or locale in ('en', 'es'));
