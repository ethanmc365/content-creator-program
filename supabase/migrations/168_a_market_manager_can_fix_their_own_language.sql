-- 168: the platform's words, editable by the people who speak the language.
--
-- Ethan: "can we have the ability for a country manager to edit this like an
-- admin? So if the Spanish country manager notices something wrong with the
-- Spanish translations, there could be a section on the admin panel for
-- languages where they can then edit the translation across the entire platform
-- just for Spanish, obviously - or the language they selected if we have more
-- languages in the future."
--
-- HOW THIS FITS WHAT ALREADY EXISTS. The dictionary is `src/locales/es.js`,
-- keyed on the ENGLISH SENTENCE (see lib/i18n for why there are no
-- `settings.account.title` keys and never will be). That file ships with the
-- build, so changing a word is a developer, a commit and a deploy - which for a
-- typo in somebody else's language is three of the wrong things.
--
-- This table is an OVERRIDE LAYER over that file, on exactly the same keys. The
-- app loads it at boot and merges it on top, so:
--   * the bundled file stays the baseline, and a market with no manager and no
--     edits behaves precisely as it does today;
--   * an override is one row, it takes effect on the next load for everybody,
--     and deleting it falls back to the bundled word rather than to nothing;
--   * a new language starts as an empty override set over English, which is a
--     usable screen from the first minute.
--
-- WHO MAY EDIT WHICH LANGUAGE. A platform admin may edit any. A market MANAGER
-- may edit the language their market reads in and no other - which is the whole
-- point of the ask, and is why `communities` gains a `locale`. Spain is the one
-- market on anything but English today.
-- NOTE: this shipped adding a `locale` column, and migration 169 removes it
-- again the same day: `communities.language` already existed, unused and
-- defaulted to 'en', and two columns for one idea is how a product ends up
-- asking which of them is true. Read 169 with this.
create or replace function public.can_edit_locale(p_locale text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(public.is_global_admin(), false)
      or exists (
        select 1
          from public.communities c
          join public.community_members m on m.community_id = c.id
         where m.profile_id = auth.uid()
           and m.status = 'active'
           and m.role = 'manager'
           and c.language = p_locale
      );
$function$;

create table if not exists public.translations (
  locale text not null,
  source text not null,
  value text not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (locale, source)
);

comment on table public.translations is
  'Runtime overrides on top of the bundled dictionaries in src/locales. Keyed on the English source sentence. See migration 168.';

alter table public.translations enable row level security;

drop policy if exists "translations: everyone reads" on public.translations;
create policy "translations: everyone reads"
  on public.translations for select
  using (true);

drop policy if exists "translations: managers of that language write" on public.translations;
create policy "translations: managers of that language write"
  on public.translations for all
  using (public.can_edit_locale(locale))
  with check (public.can_edit_locale(locale));

grant select on public.translations to anon, authenticated;
grant insert, update, delete on public.translations to authenticated;
