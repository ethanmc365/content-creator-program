-- 321 (3 Oct 2026): SIGN-UP WAS REFUSED FOR ANYONE READING THE APP IN PORTUGUESE, GERMAN OR ROMANIAN.
-- A creator got "Your application could not be saved: new row for relation profiles violates check constraint
-- profiles_locale_check". Onboarding writes `locale: getLocale()`, and the constraint still only allowed 'en' and 'es'
-- from when Spanish was the one translation. It now allows every language in lib/i18n LOCALES. Add a new language
-- here as well as there.
alter table public.profiles drop constraint if exists profiles_locale_check;
alter table public.profiles add constraint profiles_locale_check check (locale is null or locale in ('en', 'es', 'pt', 'de', 'ro'));
