-- Creator map directory: pin every creator on a world map at their home town.
-- We store the geocoded coordinates of profiles.city so the map can render
-- precise pins without geocoding on every page load. Coordinates are filled in
-- by the `geocode` edge function on save (Onboarding / EditProfile) and were
-- backfilled once for existing members. Nullable: a creator with an
-- ungeocodable town simply doesn't appear on the map (they still show as a card).

alter table public.profiles
  add column if not exists city_lat double precision,
  add column if not exists city_lng double precision;

comment on column public.profiles.city_lat is 'Latitude of profiles.city, geocoded via the geocode edge function.';
comment on column public.profiles.city_lng is 'Longitude of profiles.city, geocoded via the geocode edge function.';
