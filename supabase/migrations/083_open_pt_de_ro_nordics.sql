-- Open Portugal, Germany, Romania and the Nordics.
--
-- The four rows already existed (created inactive). This gives each one the
-- things a market needs before a creator should ever see it: a tagline that
-- introduces it, the Meetups room that Spain and the UK already have, and the
-- open flag.
--
-- Nothing here reaches a UK creator. /global and /c/:slug sit behind
-- NetworkRoute, which requires the device-local preview flag AND is_admin, and
-- there is no trigger on communities or channels, so opening a market sends no
-- notification to anybody.
--
-- The Nordics country list is exactly the four asked for. Iceland was in the
-- seed row and is removed: nobody is a member, and a market should claim only
-- the countries it is actually being run for.

update public.communities set
  country_codes = array['SE','NO','FI','DK']::bpchar[],
  tagline       = 'Four countries, one market. Northern light, long summers and the best coffee stops in Europe.',
  currency      = 'EUR',
  join_policy   = 'country',
  is_active     = true
where slug = 'nordics';

update public.communities set
  tagline     = 'Lisbon, Porto, the Algarve and the islands. Where Tryp.com is based.',
  join_policy = 'country',
  is_active   = true
where slug = 'portugal';

update public.communities set
  tagline     = 'City breaks, Christmas markets and the best rail network in Europe.',
  join_policy = 'country',
  is_active   = true
where slug = 'germany';

update public.communities set
  tagline     = 'Bucharest, Brasov and the Carpathians. Europe''s most underrated country.',
  join_policy = 'country',
  is_active   = true
where slug = 'romania';

-- The Meetups room, to match Spain and the UK. A market opening with two rooms
-- while the others have three is the kind of drift that makes a network feel
-- assembled rather than designed.
insert into public.channels
  (community_id, key, label, hint, icon, post_policy, visibility, position)
select c.id, 'meetups', 'Meetups', 'Who is filming where, and when.', 'calendar', 'all', 'scope', 0
from public.communities c
where c.slug in ('portugal', 'germany', 'romania', 'nordics')
on conflict (community_id, key) do nothing;
