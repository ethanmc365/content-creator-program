-- THE MARKET MANAGERS, WHERE ETHAN SAID THEY ARE (26 Sep 2026).
--
-- "Meriem is the German manager, Maxime is the Romanian manager, Martha is the
-- Spanish manager, Hannah is the USA manager, which we don't have yet, so she
-- should just be in the worldwide team, Adina is the Romanian manager,
-- Cassandra is the Nordics manager, Bruno is the Portugal manager ... and
-- obviously I'm also a manager in all of them." Every one of them was already
-- a global admin; none was a manager of any market, so the Teams page listed
-- them all under Worldwide and every market as run by Ethan alone.
with wanted(profile_id, slug) as (values
  ('63d316d3-1636-4d72-9dfd-87e95a81f47f'::uuid, 'germany'),   -- Miriam Greibich
  ('73bf348b-6106-43f7-a8c8-b0d7351147ac'::uuid, 'romania'),   -- Maxime
  ('d8f0c943-3369-4d7a-94da-dd93aa52c095'::uuid, 'romania'),   -- Chiroiu Adina
  ('ff5460bc-91d3-46f1-8733-8a2ef846b3b5'::uuid, 'spain'),     -- Marta Lara
  ('d658a1e4-15b2-416c-b3bb-4d3bd20c07c6'::uuid, 'nordics'),   -- Casandra Werecki
  ('295028ce-668d-47ed-bb39-bb4b65cb9132'::uuid, 'portugal')   -- Bruna Guimaraes
)
insert into public.community_members (community_id, profile_id, role, status)
select c.id, w.profile_id, 'manager', 'active'
  from wanted w join public.communities c on c.slug = w.slug
on conflict (community_id, profile_id) do update set role = 'manager', status = 'active';
