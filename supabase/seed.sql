-- ============================================================================
-- Tryp.com Creator Program, demo seed data
-- ============================================================================
-- Run AFTER 001_initial_schema.sql, in the Supabase SQL Editor.
--
-- Creates 10 demo accounts (1 admin + 9 creators), challenges, submissions,
-- results, a published Wall of Fame, rewards, chat, DMs, resources, events
-- and notifications. Dates are RELATIVE to now() so the demo always looks
-- alive (the active challenge always has a live countdown).
--
-- Every demo account's password is:  TrypDemo123!
--   Admin login:    ethan@tryp-demo.com
--   Creator login:  amelia@tryp-demo.com (or any other creator below)
--
-- Safe to re-run? No, designed for a fresh database. Reset first if needed.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Demo users (auth.users + auth.identities)
-- ----------------------------------------------------------------------------
-- The trg_on_auth_user_created trigger auto-creates a profiles row for each.
do $$
declare
  demo_users constant jsonb := '[
    {"id":"a0000000-0000-0000-0000-000000000001","email":"ethan@tryp-demo.com","name":"Ethan McAllister"},
    {"id":"a0000000-0000-0000-0000-000000000002","email":"amelia@tryp-demo.com","name":"Amelia Hart"},
    {"id":"a0000000-0000-0000-0000-000000000003","email":"jack@tryp-demo.com","name":"Jack O''Donnell"},
    {"id":"a0000000-0000-0000-0000-000000000004","email":"priya@tryp-demo.com","name":"Priya Sharma"},
    {"id":"a0000000-0000-0000-0000-000000000005","email":"callum@tryp-demo.com","name":"Callum Murray"},
    {"id":"a0000000-0000-0000-0000-000000000006","email":"saoirse@tryp-demo.com","name":"Saoirse Byrne"},
    {"id":"a0000000-0000-0000-0000-000000000007","email":"tom@tryp-demo.com","name":"Tom Whitfield"},
    {"id":"a0000000-0000-0000-0000-000000000008","email":"niamh@tryp-demo.com","name":"Niamh Kelly"},
    {"id":"a0000000-0000-0000-0000-000000000009","email":"zofia@tryp-demo.com","name":"Zofia Nowak"},
    {"id":"a0000000-0000-0000-0000-000000000010","email":"marcus@tryp-demo.com","name":"Marcus Boateng"}
  ]'::jsonb;
  u jsonb;
begin
  for u in select * from jsonb_array_elements(demo_users) loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values (
      '00000000-0000-0000-0000-000000000000',
      (u ->> 'id')::uuid,
      'authenticated',
      'authenticated',
      u ->> 'email',
      crypt('TrypDemo123!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', u ->> 'name'),
      now() - interval '120 days',
      now(),
      '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(),
      (u ->> 'id')::uuid,
      u ->> 'id',
      jsonb_build_object('sub', u ->> 'id', 'email', u ->> 'email'),
      'email',
      now(), now(), now()
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Profiles, fill in the details the trigger couldn't know
-- ----------------------------------------------------------------------------
-- Stagger join dates so the admin "creator growth" chart has a story to tell.
update public.profiles set created_at = now() - interval '150 days', onboarded = true, is_admin = true,
  age = 27, photo_url = 'https://i.pravatar.cc/300?img=12',
  bio = 'UK Country Manager @ Tryp.com, I run the Creator Program.',
  about = 'I started the Tryp.com Content Creator Program to build a real community of travel creators around the world. Message me any time, my door is always open.',
  instagram_url = 'https://instagram.com/tryp.com_official',
  languages = '{English}', countries_visited = '{United Kingdom,Ireland,Spain,France,Italy,Portugal,Greece,Netherlands,Germany,United States of America,Thailand,Australia}'
where id = 'a0000000-0000-0000-0000-000000000001';

update public.profiles set created_at = now() - interval '140 days', onboarded = true,
  age = 24, photo_url = 'https://i.pravatar.cc/300?img=47',
  bio = 'London-based travel storyteller ✈️ Budget trips, big views.',
  about = 'I quit my desk job in 2024 to film budget city breaks. My niche is "champagne views on a lemonade budget", flight hacks, cheap eats and hidden viewpoints. Always keen to collab on European city content!',
  instagram_url = 'https://instagram.com/amelia.travels', tiktok_url = 'https://tiktok.com/@amelia.travels',
  languages = '{English,French}', countries_visited = '{United Kingdom,France,Spain,Italy,Greece,Portugal,Netherlands,Croatia,Morocco,Thailand,Vietnam,Japan,Mexico,United States of America}'
where id = 'a0000000-0000-0000-0000-000000000002';

update public.profiles set created_at = now() - interval '130 days', onboarded = true,
  age = 26, photo_url = 'https://i.pravatar.cc/300?img=13',
  bio = 'Dublin lad documenting cheap flights & weekend escapes 🍀',
  about = 'TikTok is my home turf, fast cuts, honest reviews, zero filter. I specialise in "how far can €50 get you from Dublin" content. 120k followers and counting.',
  tiktok_url = 'https://tiktok.com/@jackflieskeep', instagram_url = 'https://instagram.com/jackflies',
  languages = '{English,Irish}', countries_visited = '{Ireland,United Kingdom,Spain,Portugal,France,Belgium,Poland,Hungary,Iceland,United States of America}'
where id = 'a0000000-0000-0000-0000-000000000003';

update public.profiles set created_at = now() - interval '110 days', onboarded = true,
  age = 23, photo_url = 'https://i.pravatar.cc/300?img=31',
  bio = 'Manchester ➜ everywhere. Solo female travel & food finds 🌏',
  about = 'I film solo travel guides aimed at first-time solo travellers, safety tips, itineraries and street food deep-dives. Reels are my strength but I''m growing fast on TikTok too.',
  instagram_url = 'https://instagram.com/priya.wanders', tiktok_url = 'https://tiktok.com/@priya.wanders',
  languages = '{English,Hindi,Punjabi}', countries_visited = '{United Kingdom,India,Thailand,Vietnam,Indonesia,Japan,Spain,Italy,Greece,Türkiye,Egypt,Morocco}'
where id = 'a0000000-0000-0000-0000-000000000004';

update public.profiles set created_at = now() - interval '95 days', onboarded = true,
  age = 29, photo_url = 'https://i.pravatar.cc/300?img=53',
  bio = 'Edinburgh filmmaker. Cinematic travel films & drone shots 🎥',
  about = 'Long-form YouTube is my craft, 10-minute cinematic travel films. I bring high production value to every brand I work with, and I''m happy to share editing tips with other creators here.',
  youtube_url = 'https://youtube.com/@callumcaptures', instagram_url = 'https://instagram.com/callum.captures',
  languages = '{English}', countries_visited = '{United Kingdom,Ireland,Norway,Sweden,Denmark,Iceland,Switzerland,Austria,Italy,France,Canada,United States of America,Japan,Australia}'
where id = 'a0000000-0000-0000-0000-000000000005';

update public.profiles set created_at = now() - interval '80 days', onboarded = true,
  age = 22, photo_url = 'https://i.pravatar.cc/300?img=44',
  bio = 'Cork girl chasing sunsets ☀️ TikTok travel diaries.',
  about = 'My TikToks are diary-style, raw, funny, and honest about what travel actually costs. My audience is mostly Irish students looking for affordable sun.',
  tiktok_url = 'https://tiktok.com/@saoirsesunsets',
  languages = '{English,Irish}', countries_visited = '{Ireland,Spain,Portugal,France,Italy,Greece,Croatia,Netherlands}'
where id = 'a0000000-0000-0000-0000-000000000006';

update public.profiles set created_at = now() - interval '60 days', onboarded = true,
  age = 31, photo_url = 'https://i.pravatar.cc/300?img=59',
  bio = 'Leeds. Family travel on a budget, 2 kids, 1 carry-on 🧳',
  about = 'I show real family travel: package holidays, kid-friendly city breaks and how to keep costs sane. Parents trust my reviews because I never sugar-coat.',
  instagram_url = 'https://instagram.com/whitfieldsaway',
  languages = '{English}', countries_visited = '{United Kingdom,Spain,Portugal,France,Greece,Türkiye,Egypt,United States of America}'
where id = 'a0000000-0000-0000-0000-000000000007';

update public.profiles set created_at = now() - interval '45 days', onboarded = true,
  age = 25, photo_url = 'https://i.pravatar.cc/300?img=26',
  bio = 'Galway adventurer 🌊 Hikes, coasts & hidden Ireland.',
  about = 'Half my content is wild-Atlantic-way Ireland, half is European adventure trips. Strong engagement from outdoorsy audiences in Ireland and the UK.',
  instagram_url = 'https://instagram.com/niamh.explores', tiktok_url = 'https://tiktok.com/@niamh.explores',
  languages = '{English,Irish}', countries_visited = '{Ireland,United Kingdom,Norway,Iceland,Switzerland,Austria,France,Spain,Slovenia}'
where id = 'a0000000-0000-0000-0000-000000000008';

update public.profiles set created_at = now() - interval '30 days', onboarded = true,
  age = 27, photo_url = 'https://i.pravatar.cc/300?img=20',
  bio = 'Belfast ✈️ Warsaw and back again. Bilingual travel content 🇵🇱',
  about = 'I make travel content in English and Polish, which gives my videos a double audience. Big on night trains, layover guides and Central European city breaks.',
  tiktok_url = 'https://tiktok.com/@zofia.onamove', instagram_url = 'https://instagram.com/zofia.onamove',
  languages = '{English,Polish}', countries_visited = '{United Kingdom,Ireland,Poland,Germany,Czechia,Austria,Hungary,Slovakia,Croatia,Italy}'
where id = 'a0000000-0000-0000-0000-000000000009';

update public.profiles set created_at = now() - interval '14 days', onboarded = true,
  age = 28, photo_url = 'https://i.pravatar.cc/300?img=68',
  bio = 'Birmingham. Aviation nerd & points-and-miles tips 🛫',
  about = 'I break down flight deals, airline reviews and points hacks. My YouTube deep-dives convert really well, viewers actually book the deals I cover.',
  youtube_url = 'https://youtube.com/@marcusflies', tiktok_url = 'https://tiktok.com/@marcusflies',
  languages = '{English}', countries_visited = '{United Kingdom,United States of America,United Arab Emirates,Singapore,Japan,South Africa,Ghana,Spain,Germany,Netherlands}'
where id = 'a0000000-0000-0000-0000-000000000010';

-- ----------------------------------------------------------------------------
-- 3. Challenges, 1 active (live countdown!) + 2 archived
-- ----------------------------------------------------------------------------
insert into public.challenges (
  id, title, description, rules, hashtags, platforms, prize_structure,
  start_date, end_date, status, created_by, created_at
) values
(
  'c0000000-0000-0000-0000-000000000001',
  'Summer Escapes Challenge',
  E'Show your audience how Tryp.com makes summer travel cheaper.\n\nCreate a short-form video (Reel or TikTok) featuring a summer destination you can reach with a Tryp.com flight or package deal. Highlight the savings angle, "same trip, less money". The video with the most views when the challenge closes wins.',
  E'• One entry per platform (max 2 total)\n• Mention or tag Tryp.com in the caption\n• Use at least one of the challenge hashtags\n• Content must be your own original footage\n• Keep it authentic, no misleading price claims',
  '#TrypCreators #SameTripLessMoney #SummerEscapes',
  '{Instagram,TikTok}',
  '[{"place":"1st","prize":"£150 cash"},{"place":"2nd","prize":"£100 cash"},{"place":"3rd","prize":"£75 cash"},{"place":"All valid entries","prize":"£25 Tryp.com voucher"}]'::jsonb,
  now() - interval '10 days', now() + interval '18 days',
  'active', 'a0000000-0000-0000-0000-000000000001', now() - interval '12 days'
),
(
  'c0000000-0000-0000-0000-000000000002',
  'Hidden Gems Challenge',
  E'Reveal an underrated destination your followers have never thought of, and show how cheaply Tryp.com can get them there. The most-viewed video wins.',
  E'• One entry per platform\n• Tag Tryp.com and use the challenge hashtags\n• Destination must be reachable via Tryp.com flights or packages',
  '#TrypCreators #HiddenGems',
  '{Instagram,TikTok}',
  '[{"place":"1st","prize":"£150 cash"},{"place":"2nd","prize":"£100 cash"},{"place":"3rd","prize":"£75 cash"},{"place":"All valid entries","prize":"£25 Tryp.com voucher"}]'::jsonb,
  now() - interval '75 days', now() - interval '45 days',
  'archived', 'a0000000-0000-0000-0000-000000000001', now() - interval '80 days'
),
(
  'c0000000-0000-0000-0000-000000000003',
  'City Break Showdown',
  E'48 hours, one European city, one unforgettable video. Show your followers the perfect Tryp.com city break, flights, stay and itinerary.',
  E'• One entry per platform\n• Tag Tryp.com and use the challenge hashtags\n• Must feature a real itinerary your followers could copy',
  '#TrypCreators #CityBreakShowdown',
  '{Instagram,TikTok,YouTube}',
  '[{"place":"1st","prize":"£200 cash"},{"place":"2nd","prize":"£100 cash"},{"place":"3rd","prize":"£50 Tryp.com voucher"}]'::jsonb,
  now() - interval '130 days', now() - interval '100 days',
  'archived', 'a0000000-0000-0000-0000-000000000001', now() - interval '135 days'
);

-- The "challenge is live" trigger just notified everyone about Summer Escapes.
-- That's exactly what we want for the demo. 🎉

-- ----------------------------------------------------------------------------
-- 4. Submissions
-- ----------------------------------------------------------------------------
-- Active challenge, no logged_views yet (admin reviews at the end).
insert into public.submissions (creator_id, challenge_id, platform, video_url, caption, submitted_at) values
('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Instagram', 'https://www.instagram.com/reel/DEMO-amelia-summer/', 'Santorini for under £180?! Tryp.com came through 😍 #TrypCreators #SummerEscapes', now() - interval '6 days'),
('a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'TikTok', 'https://www.tiktok.com/@jackflieskeep/video/demo-summer-1', 'POV: Dublin to the Algarve for less than a night out 🍹 #SameTripLessMoney', now() - interval '5 days'),
('a0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 'Instagram', 'https://www.instagram.com/reel/DEMO-priya-summer/', 'Solo girl summer in Crete, full Tryp.com breakdown in the caption ☀️ #TrypCreators', now() - interval '4 days'),
('a0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000001', 'TikTok', 'https://www.tiktok.com/@saoirsesunsets/video/demo-summer-2', 'Rating every beach in Malaga so you don''t have to 🏖️ flights via @tryp.com #SummerEscapes', now() - interval '2 days'),
('a0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000001', 'Instagram', 'https://www.instagram.com/reel/DEMO-niamh-summer/', 'Croatia''s coast >>> everywhere else. Booked with Tryp.com ⚓ #TrypCreators #SummerEscapes', now() - interval '1 day');

-- Hidden Gems (archived), views logged by Ethan at review time.
insert into public.submissions (creator_id, challenge_id, platform, video_url, caption, logged_views, submitted_at) values
('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'TikTok', 'https://www.tiktok.com/@amelia.travels/video/demo-gems-1', 'Nobody talks about Puglia and it''s a crime 🇮🇹 #HiddenGems', 284000, now() - interval '60 days'),
('a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'TikTok', 'https://www.tiktok.com/@jackflieskeep/video/demo-gems-2', 'The Polish city that costs HALF of Prague 🇵🇱 #HiddenGems #TrypCreators', 192500, now() - interval '58 days'),
('a0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', 'Instagram', 'https://www.instagram.com/reel/DEMO-priya-gems/', 'Kotor, Montenegro, the fjord you can fly to for £60 return 😮 #HiddenGems', 156000, now() - interval '55 days'),
('a0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002', 'Instagram', 'https://www.instagram.com/reel/DEMO-callum-gems/', 'I filmed the Faroe Islands for 3 days. Cinematic cut 🎥 #HiddenGems', 98000, now() - interval '52 days'),
('a0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000002', 'Instagram', 'https://www.instagram.com/reel/DEMO-tom-gems/', 'Hidden gem for families: the quiet side of the Algarve 🧒 #HiddenGems', 61000, now() - interval '50 days'),
('a0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000002', 'TikTok', 'https://www.tiktok.com/@saoirsesunsets/video/demo-gems-3', 'A Greek island with NO crowds?? Folegandros diaries 🇬🇷 #HiddenGems', 87500, now() - interval '49 days');

-- City Break Showdown (archived).
insert into public.submissions (creator_id, challenge_id, platform, video_url, caption, logged_views, submitted_at) values
('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003', 'Instagram', 'https://www.instagram.com/reel/DEMO-amelia-city/', '48 hours in Porto, every penny counted 🇵🇹 #CityBreakShowdown', 174000, now() - interval '110 days'),
('a0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000003', 'YouTube', 'https://www.youtube.com/watch?v=DEMO-callum-city', 'COPENHAGEN IN 48 HOURS, a cinematic city break film', 88000, now() - interval '108 days'),
('a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 'TikTok', 'https://www.tiktok.com/@jackflieskeep/video/demo-city-1', 'Budapest on €100 TOTAL, challenge accepted 🇭🇺 #CityBreakShowdown', 142000, now() - interval '105 days');

-- ----------------------------------------------------------------------------
-- 5. Results, final standings for the two archived challenges
-- ----------------------------------------------------------------------------
insert into public.results (challenge_id, creator_id, final_views, rank, created_at) values
-- Hidden Gems
('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 284000, 1, now() - interval '43 days'),
('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 192500, 2, now() - interval '43 days'),
('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 156000, 3, now() - interval '43 days'),
('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', 98000, 4, now() - interval '43 days'),
('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000006', 87500, 5, now() - interval '43 days'),
('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000007', 61000, 6, now() - interval '43 days'),
-- City Break Showdown
('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 174000, 1, now() - interval '98 days'),
('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 142000, 2, now() - interval '98 days'),
('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000005', 88000, 3, now() - interval '98 days');

-- ----------------------------------------------------------------------------
-- 6. Wall of Fame, published for both archived challenges
-- ----------------------------------------------------------------------------
insert into public.wall_of_fame (challenge_id, featured_spots, admin_note, published, published_at, updated_by) values
(
  'c0000000-0000-0000-0000-000000000002',
  '[
    {"creator_id":"a0000000-0000-0000-0000-000000000002","note":"284k views, Puglia content that genuinely converted bookings. Outstanding."},
    {"creator_id":"a0000000-0000-0000-0000-000000000003","note":"192k views and the comment section was pure gold."},
    {"creator_id":"a0000000-0000-0000-0000-000000000004","note":"156k views, Kotor is now on everyone''s list."},
    {"creator_id":"a0000000-0000-0000-0000-000000000005","note":"Admin''s pick 🎬, the Faroe Islands edit was the most beautiful film of the round."}
  ]'::jsonb,
  'Our best round yet, over 880k combined views. Thank you all for the incredible energy!',
  true, now() - interval '42 days', 'a0000000-0000-0000-0000-000000000001'
),
(
  'c0000000-0000-0000-0000-000000000003',
  '[
    {"creator_id":"a0000000-0000-0000-0000-000000000002","note":"Porto on a budget, 174k views and our most-shared video to date."},
    {"creator_id":"a0000000-0000-0000-0000-000000000003","note":"Budapest on €100. Madness. 142k views."},
    {"creator_id":"a0000000-0000-0000-0000-000000000005","note":"Copenhagen film, long-form excellence, 88k views."}
  ]'::jsonb,
  'The challenge that started it all. City breaks are our bread and butter, these three nailed it.',
  true, now() - interval '97 days', 'a0000000-0000-0000-0000-000000000001'
);

-- ----------------------------------------------------------------------------
-- 7. Rewards
-- ----------------------------------------------------------------------------
insert into public.rewards (creator_id, challenge_id, reward_type, amount, currency, status, payment_notes, distributed_at, created_at) values
-- Hidden Gems payouts (all distributed)
('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'cash', 150.00, 'GBP', 'distributed', 'Bank transfer, paid 3 days after results', now() - interval '39 days', now() - interval '42 days'),
('a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'cash', 100.00, 'GBP', 'distributed', 'Revolut transfer', now() - interval '39 days', now() - interval '42 days'),
('a0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', 'cash',  75.00, 'GBP', 'distributed', 'Bank transfer', now() - interval '38 days', now() - interval '42 days'),
('a0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002', 'voucher', 25.00, 'GBP', 'distributed', 'Voucher code emailed', now() - interval '38 days', now() - interval '42 days'),
('a0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000002', 'voucher', 25.00, 'GBP', 'distributed', 'Voucher code emailed', now() - interval '38 days', now() - interval '42 days'),
('a0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000002', 'voucher', 25.00, 'GBP', 'pending', 'Awaiting bank details from Tom', null, now() - interval '42 days'),
-- City Break Showdown payouts (all distributed)
('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003', 'cash', 200.00, 'GBP', 'distributed', 'Bank transfer', now() - interval '95 days', now() - interval '97 days'),
('a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 'cash', 100.00, 'GBP', 'distributed', 'Revolut transfer', now() - interval '95 days', now() - interval '97 days'),
('a0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000003', 'voucher', 50.00, 'GBP', 'distributed', 'Voucher code emailed', now() - interval '94 days', now() - interval '97 days');

-- ----------------------------------------------------------------------------
-- 8. Group chat, general, announcements, content tips
-- ----------------------------------------------------------------------------
insert into public.messages (channel, sender_id, body, created_at) values
('general', 'a0000000-0000-0000-0000-000000000001', 'Welcome to the new Tryp.com Creator Platform everyone! 🎉 This replaces the WhatsApp group, chat, challenges, results and resources all live here now.', now() - interval '9 days'),
('general', 'a0000000-0000-0000-0000-000000000002', 'This is SO much better than WhatsApp 😍 love the profiles!', now() - interval '9 days' + interval '12 minutes'),
('general', 'a0000000-0000-0000-0000-000000000003', 'Big upgrade lads. Already filled in my country map 🌍', now() - interval '9 days' + interval '25 minutes'),
('general', 'a0000000-0000-0000-0000-000000000006', 'Hi everyone!! Saoirse from Cork here 👋 anyone else entering Summer Escapes?', now() - interval '8 days'),
('general', 'a0000000-0000-0000-0000-000000000004', 'Yes! Flying to Crete on Thursday, filming the whole thing 🎬', now() - interval '8 days' + interval '8 minutes'),
('general', 'a0000000-0000-0000-0000-000000000008', 'Anyone fancy a collab for the summer challenge? Thinking a Croatia coast hop ⚓', now() - interval '6 days'),
('general', 'a0000000-0000-0000-0000-000000000002', 'Niamh I''m so in, DMing you now', now() - interval '6 days' + interval '5 minutes'),
('general', 'a0000000-0000-0000-0000-000000000010', 'New here, Marcus from Birmingham, aviation/points content. Great to meet you all 🛫', now() - interval '5 days'),
('general', 'a0000000-0000-0000-0000-000000000005', 'Welcome Marcus! Your A380 review was class btw', now() - interval '5 days' + interval '20 minutes'),
('general', 'a0000000-0000-0000-0000-000000000009', 'Cześć everyone! Just submitted my first ever entry 🤞', now() - interval '3 days'),
('general', 'a0000000-0000-0000-0000-000000000007', 'Good luck Zofia! The first one''s always the scariest 😄', now() - interval '3 days' + interval '15 minutes'),
('general', 'a0000000-0000-0000-0000-000000000003', '18 days left on Summer Escapes, who else is leaving it to the last minute like me 🙃', now() - interval '6 hours'),
('content_tips', 'a0000000-0000-0000-0000-000000000001', E'📌 TIP: Hook your viewer in the FIRST 2 SECONDS. Start with the destination reveal or the price, "Santorini for £180" beats "hey guys" every single time.', now() - interval '8 days'),
('content_tips', 'a0000000-0000-0000-0000-000000000001', E'📌 Brand do''s & don''ts:\n✅ DO say "I found this deal on Tryp.com"\n✅ DO show real prices and screenshots\n❌ DON''T invent prices or guarantee availability\n❌ DON''T use other brands'' footage\nFull guidelines are in the Resource Library.', now() - interval '7 days'),
('content_tips', 'a0000000-0000-0000-0000-000000000005', 'Editing tip from me: cut on movement. If your clip ends mid-pan, start the next one mid-pan too, feels seamless and keeps retention up.', now() - interval '4 days'),
('content_tips', 'a0000000-0000-0000-0000-000000000002', 'Also! Post Reels between 6–8pm UK time. My evening posts consistently do 2–3x the views of morning ones.', now() - interval '4 days' + interval '30 minutes'),
('content_tips', 'a0000000-0000-0000-0000-000000000001', '📌 Trending audio matters on TikTok. Save trending travel sounds during the week and batch-film to them at the weekend.', now() - interval '1 day');

-- Announcements (admin-only channel). Each insert auto-notifies everyone.
insert into public.messages (channel, sender_id, body, created_at) values
('announcements', 'a0000000-0000-0000-0000-000000000001', '🚀 The Tryp.com Creator Platform is officially LIVE. Take 5 minutes to complete your profile, photo, socials and your country map. This is our new home!', now() - interval '9 days'),
('announcements', 'a0000000-0000-0000-0000-000000000001', E'☀️ SUMMER ESCAPES CHALLENGE IS LIVE!\n\nPrizes: 1st £150 • 2nd £100 • 3rd £75 • every valid entry gets a £25 Tryp.com voucher.\n\nFull brief on the Challenges page. Deadline is in 18 days, get filming!', now() - interval '8 days'),
('announcements', 'a0000000-0000-0000-0000-000000000001', '📅 Live Q&A with me next week, bring your questions about the program, payouts, and what we look for in winning content. Details on the Events page.', now() - interval '2 days');

-- A few emoji reactions so chat looks loved.
insert into public.reactions (message_id, creator_id, emoji)
select m.id, p.id, e.emoji
from public.messages m
cross join lateral (values
  ('a0000000-0000-0000-0000-000000000002'::uuid, '🔥'),
  ('a0000000-0000-0000-0000-000000000003'::uuid, '🎉'),
  ('a0000000-0000-0000-0000-000000000004'::uuid, '❤️')
) as e(id, emoji)
join public.profiles p on p.id = e.id
where m.channel = 'announcements'
  and m.body like '🚀%';

insert into public.reactions (message_id, creator_id, emoji)
select m.id, 'a0000000-0000-0000-0000-000000000006'::uuid, '😂'
from public.messages m where m.body like '18 days left%';

insert into public.reactions (message_id, creator_id, emoji)
select m.id, p_id, '👍'
from public.messages m
cross join (values ('a0000000-0000-0000-0000-000000000007'::uuid), ('a0000000-0000-0000-0000-000000000009'::uuid)) v(p_id)
where m.channel = 'content_tips' and m.body like '📌 TIP: Hook%';

-- ----------------------------------------------------------------------------
-- 9. DM threads
-- ----------------------------------------------------------------------------
-- Amelia ↔ Niamh planning their Croatia collab.
insert into public.conversations (id, participant_a, participant_b, last_message_at, created_at) values
('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000008', now() - interval '2 hours', now() - interval '6 days');

insert into public.direct_messages (conversation_id, sender_id, recipient_id, body, read, created_at) values
('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000008', 'Hey! Saw your collab message, I''m flying into Split on the 18th, what dates work for you?', true, now() - interval '6 days'),
('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000002', 'Perfect timing, I land the 17th! We could do Split → Hvar → Dubrovnik over 4 days?', true, now() - interval '6 days' + interval '20 minutes'),
('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000008', 'Dreamy. I''ll storyboard the hook tonight, thinking we each film our own edit of the same trip, double the entries 😎', true, now() - interval '5 days'),
('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000002', 'Genius. Booking the ferry now, send me your storyboard when it''s done!', false, now() - interval '2 hours');

-- Ethan (admin) ↔ Marcus, welcome DM.
insert into public.conversations (id, participant_a, participant_b, last_message_at, created_at) values
('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000010', now() - interval '4 days', now() - interval '5 days');

insert into public.direct_messages (conversation_id, sender_id, recipient_id, body, read, created_at) values
('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000010', 'Marcus! Great to have you in the program, your points-and-miles angle is exactly what we''ve been missing. Shout if you need anything getting started.', true, now() - interval '5 days'),
('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'Cheers Ethan! Quick one, for Summer Escapes, does a "points + Tryp.com cash fare" comparison video count as on-brief?', true, now() - interval '4 days' - interval '2 hours'),
('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000010', 'Absolutely, savings angle is the whole brief. Lean into it 👌', true, now() - interval '4 days');

-- ----------------------------------------------------------------------------
-- 10. Connections
-- ----------------------------------------------------------------------------
insert into public.connections (creator_id, connected_creator_id, created_at) values
('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000008', now() - interval '6 days'),
('a0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000002', now() - interval '6 days'),
('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', now() - interval '8 days'),
('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', now() - interval '8 days'),
('a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', now() - interval '7 days'),
('a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000010', now() - interval '4 days'),
('a0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000005', now() - interval '4 days'),
('a0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000004', now() - interval '5 days'),
('a0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000003', now() - interval '3 days');

-- ----------------------------------------------------------------------------
-- 11. Events
-- ----------------------------------------------------------------------------
insert into public.events (title, description, date, type, created_by) values
('Summer Escapes, submissions close', 'Last moment to drop your video link on the challenge page. No late entries!', now() + interval '18 days', 'deadline', 'a0000000-0000-0000-0000-000000000001'),
('Live Q&A with Ethan', 'Open mic on the program: payouts, briefs, what winning content looks like. Bring questions!', now() + interval '5 days', 'qa', 'a0000000-0000-0000-0000-000000000001'),
('Group content day, London', 'Meet-up for anyone near London: shoot together, swap b-roll, grab lunch on us 🍕', now() + interval '12 days', 'event', 'a0000000-0000-0000-0000-000000000001'),
('Program hits 1 million combined views 🎉', 'Across all challenges, Tryp creators have now passed 1M logged views. Massive.', now() - interval '20 days', 'milestone', 'a0000000-0000-0000-0000-000000000001'),
('Summer Escapes, challenge opened', 'The summer round kicked off.', now() - interval '10 days', 'milestone', 'a0000000-0000-0000-0000-000000000001');

-- ----------------------------------------------------------------------------
-- 12. Resources
-- ----------------------------------------------------------------------------
insert into public.resources (title, body, category, created_by, created_at) values
('Tryp.com Brand Guidelines', E'How to talk about Tryp.com in your content:\n\n• Name: always "Tryp.com" (never "Tryp" alone, never "TRYP.COM" mid-sentence).\n• Tone: smart-saver, optimistic, never gimmicky.\n• Always pair a destination with the savings angle, "same trip, less money".\n• Colours if you make graphics: burnt orange #d94407 on white.\n• Tag @tryp.com and use #TrypCreators on every piece of program content.', 'Brand Guidelines', 'a0000000-0000-0000-0000-000000000001', now() - interval '9 days'),
('Do''s & Don''ts for program content', E'✅ DO show real prices and real screenshots from Tryp.com\n✅ DO disclose the partnership where required (#ad / paid partnership tools)\n✅ DO film your genuine experience, audiences smell fake\n\n❌ DON''T guarantee prices or availability ("from £39" is fine, "always £39" is not)\n❌ DON''T use footage you don''t own\n❌ DON''T bash competitors by name', 'Do''s & Don''ts', 'a0000000-0000-0000-0000-000000000001', now() - interval '9 days'),
('10 video hooks that always work', E'1. "I found a flight cheaper than my train to work…"\n2. "POV: you booked the trip everyone said was too expensive"\n3. Price reveal on screen in the first second\n4. "Rating [destination] so you don''t have to"\n5. "Nobody talks about [place] and it''s a crime"\n6. Before/after cost comparison\n7. "How far can £50 actually get you?"\n8. Packing-cam → airport-cam → arrival reveal\n9. "Things I wish I knew before visiting [place]"\n10. The 48-hour itinerary challenge', 'Video Ideas', 'a0000000-0000-0000-0000-000000000001', now() - interval '8 days'),
('Caption formula for challenge entries', E'Strong captions = more reach and an easy review for us:\n\n[Hook line with the destination + price]\n[1–2 lines of value: itinerary, tip, or story]\n[Call to action: "deal''s on Tryp.com"]\n[Hashtags: challenge tags + 2–3 niche tags]\n\nKeep it under 125 characters before the fold on Instagram.', 'Tips', 'a0000000-0000-0000-0000-000000000001', now() - interval '7 days'),
('Example: what a winning entry looks like', E'Amelia''s Hidden Gems winner (284k views) nailed every fundamental:\n\n• Hook: "Nobody talks about Puglia and it''s a crime", curiosity + place in 2 seconds\n• Pacing: a cut every 1.5–2s, no clip over 3s\n• Value: 3 specific spots with names on screen\n• Savings angle: flight price on screen at the midpoint\n• CTA: "found it on Tryp.com" + challenge hashtags\n\nStudy it, then make it yours.', 'Examples', 'a0000000-0000-0000-0000-000000000001', now() - interval '5 days');

-- ----------------------------------------------------------------------------
-- 13. Tidy notifications for a believable demo
-- ----------------------------------------------------------------------------
-- The triggers above just generated a flood of notifications. Mark the older
-- ones read so each demo account logs in with a tidy bell (a few unread).
update public.notifications set read = true where created_at < now() - interval '3 days';

-- ============================================================================
-- Done! Log in as ethan@tryp-demo.com / TrypDemo123! (admin)
--             or amelia@tryp-demo.com / TrypDemo123! (creator)
-- ============================================================================
