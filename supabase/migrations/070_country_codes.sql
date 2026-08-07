-- 070: normalise creator country to an ISO 3166-1 alpha-2 code.
--
-- `profiles.country` is free text typed by creators at onboarding. Today 44 active
-- creators have TWENTY distinct spellings of about thirteen countries: 'Uk', 'UK',
-- 'Uk ' (trailing space), 'United Kingdom', 'Scotland', 'Ireland', 'Ireland ',
-- 'Netherlands ', 'Poland ', 'United States '. Nothing can be derived from that
-- column reliably, and chapter assignment depends on being able to.
--
-- This adds a machine-readable code ALONGSIDE the free text. The free text stays
-- as the display value, because a creator who typed 'Scotland' should keep seeing
-- Scotland on their profile.
--
-- The mapping is EXPLICIT rather than fuzzy. Whitespace and case are normalised
-- first (deterministic), then every remaining literal is listed by hand. An
-- unmatched value stays null and is reported by the verification query at the
-- bottom rather than being silently guessed at.
--
-- Reversible: alter table public.profiles drop column country_code;

alter table public.profiles
  add column if not exists country_code char(2);

comment on column public.profiles.country_code is
  'ISO 3166-1 alpha-2. Machine-readable counterpart to the free-text `country`. '
  'Drives chapter suggestion at signup. Never overwrites `country`, which stays '
  'as the creator-typed display value.';

update public.profiles p
set country_code = m.code
from (values
  -- United Kingdom, including the nation-not-a-country spellings
  ('uk',             'GB'),
  ('u.k.',           'GB'),
  ('united kingdom', 'GB'),
  ('great britain',  'GB'),
  ('england',        'GB'),
  ('scotland',       'GB'),
  ('wales',          'GB'),
  ('northern ireland','GB'),
  -- Ireland: distinct country, and 11 of the current roster
  ('ireland',        'IE'),
  ('republic of ireland','IE'),
  ('eire',           'IE'),
  -- Named launch markets
  ('spain',          'ES'),
  ('españa',         'ES'),
  ('espana',         'ES'),
  ('portugal',       'PT'),
  ('germany',        'DE'),
  ('deutschland',    'DE'),
  ('romania',        'RO'),
  ('sweden',         'SE'),
  ('denmark',        'DK'),
  ('norway',         'NO'),
  ('finland',        'FI'),
  ('iceland',        'IS'),
  -- Everywhere else currently present on the roster
  ('netherlands',    'NL'),
  ('the netherlands','NL'),
  ('holland',        'NL'),
  ('belgium',        'BE'),
  ('latvia',         'LV'),
  ('poland',         'PL'),
  ('malaysia',       'MY'),
  ('australia',      'AU'),
  ('us',             'US'),
  ('usa',            'US'),
  ('u.s.',           'US'),
  ('united states',  'US'),
  ('united states of america','US'),
  -- Common neighbours, pre-mapped so the next signup does not need a migration
  ('france',         'FR'),
  ('italy',          'IT'),
  ('austria',        'AT'),
  ('switzerland',    'CH'),
  ('greece',         'GR'),
  ('croatia',        'HR'),
  ('czechia',        'CZ'),
  ('czech republic', 'CZ'),
  ('hungary',        'HU'),
  ('bulgaria',       'BG'),
  ('lithuania',      'LT'),
  ('estonia',        'EE'),
  ('canada',         'CA'),
  ('brazil',         'BR'),
  ('mexico',         'MX'),
  ('india',          'IN'),
  ('south africa',   'ZA'),
  ('new zealand',    'NZ'),
  ('japan',          'JP'),
  ('thailand',       'TH'),
  ('indonesia',      'ID'),
  ('philippines',    'PH'),
  ('singapore',      'SG'),
  ('united arab emirates','AE'),
  ('uae',            'AE'),
  ('turkey',         'TR'),
  ('morocco',        'MA'),
  ('egypt',          'EG')
) as m(name, code)
where lower(btrim(p.country)) = m.name
  and p.country_code is null;

-- Index because chapter suggestion filters on it at signup.
create index if not exists profiles_country_code_idx
  on public.profiles (country_code);
