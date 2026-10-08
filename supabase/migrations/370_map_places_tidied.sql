-- 370: the creator map's wrong, misspelt and unplaceable towns, fixed by hand (9 Oct 2026).
--
-- Ethan: "fix all those typos so they properly show on the map ... Cassandra says Marseille, Sweden ... Tripando Mundo says
-- France, country Brazil ... one of them says Florence, United States, just pick one ... for anyone that has filled in something
-- incorrectly it shouldn't be constantly trying to place them." Every row below was read, not guessed; the coordinates are the
-- towns' own, so the map no longer needs to ask a geocoder for any of them.
--
-- Country spellings (Uk / UK / Uk / Scotland, US, trailing spaces) become the platform's own names. A town typed in lower case
-- gets its capitals. Nobody's market membership is touched: this is only what the profile SAYS and where the pin sits.

-- Country spellings, from the code each profile already carries.
update public.profiles set country = 'United Kingdom' where country_code = 'GB' and country is distinct from 'United Kingdom';
update public.profiles set country = 'United States' where country_code = 'US' and country is distinct from 'United States';
update public.profiles set country = btrim(country) where country is not null and country <> btrim(country);

-- Lower-case towns, capitalised.
update public.profiles set city = 'Alicante' where id = '684d3636-40ec-4fa8-a212-00b988b6d600' and city = 'alicante';
update public.profiles set city = 'Barcelona' where id = 'c17cbad6-f410-475b-b294-49b9fd7be922' and city = 'barcelona';
update public.profiles set city = 'Batam' where id = 'f310ae35-d08c-40e1-b11a-4fd70420a88c' and city = 'batam';
update public.profiles set city = 'Guarda' where id = 'c50ebe08-6356-4599-bfeb-f921f5c403f2' and city = 'guarda';
update public.profiles set city = 'Málaga' where id = '8715404d-086d-4e66-bdcb-783481e112a8' and city = 'malaga';
update public.profiles set city = 'Munich' where id = '177dd9ee-ddcd-46d1-ad04-274acb891e17' and city = 'munich';
update public.profiles set city = 'Palma de Mallorca' where id = '09fdc464-62f4-4bf1-9029-e0bb78b62b07' and city = 'palma de mallorca';
update public.profiles set city = 'Farmington, Minnesota' where id = 'a42d4b5a-a87a-4685-8e39-4699915d7e4c' and city = 'farmington, minnesota';
update public.profiles set city = 'Belo Horizonte' where id = '9f425803-2af5-45d7-a2e6-e9cf3fb9101d' and city = 'belo horizonte';

-- Typos and wrong towns: the right name AND the right coordinates.
update public.profiles set city = 'Melbourne', city_lat = -37.8136, city_lng = 144.9631 where id = '1a307f71-d41b-4f65-b956-ba08ce092529';
update public.profiles set city = 'Canggu', city_lat = -8.6478, city_lng = 115.1385 where id = 'efa2c367-7371-4bf3-b3df-f990c7c393f7';
update public.profiles set city = 'Dubai', city_lat = 25.2048, city_lng = 55.2708 where id = '09fb60a4-c7b0-45c5-8816-a3ebba647a82';
-- A postcode typed as a town: 28821 is Coslada, which is where the pin already sat.
update public.profiles set city = 'Coslada', city_lat = 40.4238, city_lng = -3.5613 where id = 'c194da62-f598-4a09-a876-e73424a86d42' and city = '28821';
-- Pinned to the wrong place by an earlier geocode.
update public.profiles set city = 'Gold Coast', city_lat = -28.0167, city_lng = 153.4000 where id = '962ed464-9d76-4246-bcd6-a8987a5f845d';
update public.profiles set city = 'Chiclana de la Frontera', city_lat = 36.4192, city_lng = -6.1470 where id = 'cf5951f9-4a53-4aaf-82fc-8deabfcd0869';
update public.profiles set city_lat = 34.2257, city_lng = -77.9447 where id = 'ed0ed493-88ea-43c3-ad94-2c0bc9d0169a';  -- Wilmington, North Carolina (was Delaware)
-- Never placed at all.
update public.profiles set city_lat = 39.0917, city_lng = -9.2586 where id = '0ffb5a8e-7838-4f18-9266-2ec6bd55e610' and city_lat is null;  -- Torres Vedras
update public.profiles set city_lat = 39.4699, city_lng = -0.3763 where id = '01e29a38-6b52-4054-b4ef-de79ce0d7a3e' and city_lat is null;  -- Valencia

-- Casandra lives in Marseille (originally from Sweden), so the town and its country now agree.
update public.profiles set city = 'Marseille', country = 'France', country_code = 'FR', city_lat = 43.2965, city_lng = 5.3698 where id = 'd658a1e4-15b2-416c-b3bb-4d3bd20c07c6';
-- Tripando Mundo: "France" was typed as the town and Brazil as the country, and the pin sat in Guadeloupe. They travel Europe in a
-- motorhome, so France it is, with no town to chase, pinned in the middle of the country.
update public.profiles set city = null, country = 'France', country_code = 'FR', city_lat = 46.6034, city_lng = 1.8883 where id = 'c538b8aa-9c51-4fb9-866d-1c1d1b9791ec';
-- Nia's "Florence, United States": the biggest Florence in the States is Florence, Alabama.
update public.profiles set city = 'Florence, Alabama', city_lat = 34.7998, city_lng = -87.6773 where id = '06d95034-c7cb-45eb-842f-dd811414da51';
-- Madhvi typed a dash. No town, no lookup: the map falls back to her country.
update public.profiles set city = null where id = 'dd10418a-b2da-44a1-9d62-1b53c27f209b' and city = '-';
