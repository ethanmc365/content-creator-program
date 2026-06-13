-- ============================================================================
-- seed_v2, demo data for the v2 features (run after 003 migration)
-- ============================================================================

-- 1. Home city / country for the demo creators.
update public.profiles set city = 'London',     country = 'United Kingdom' where id = 'a0000000-0000-0000-0000-000000000002';
update public.profiles set city = 'Dublin',     country = 'Ireland'        where id = 'a0000000-0000-0000-0000-000000000003';
update public.profiles set city = 'Manchester', country = 'United Kingdom' where id = 'a0000000-0000-0000-0000-000000000004';
update public.profiles set city = 'Edinburgh',  country = 'United Kingdom' where id = 'a0000000-0000-0000-0000-000000000005';
update public.profiles set city = 'Cork',       country = 'Ireland'        where id = 'a0000000-0000-0000-0000-000000000006';
update public.profiles set city = 'Leeds',      country = 'United Kingdom' where id = 'a0000000-0000-0000-0000-000000000007';
update public.profiles set city = 'Galway',     country = 'Ireland'        where id = 'a0000000-0000-0000-0000-000000000008';
update public.profiles set city = 'Belfast',    country = 'United Kingdom' where id = 'a0000000-0000-0000-0000-000000000009';
update public.profiles set city = 'Birmingham', country = 'United Kingdom' where id = 'a0000000-0000-0000-0000-000000000010';
update public.profiles set city = 'London',     country = 'United Kingdom' where id = 'a0000000-0000-0000-0000-000000000001';

-- 2. Travel gallery for Amelia (placeholder travel imagery from Unsplash).
insert into public.creator_photos (creator_id, photo_url, caption, sort_order) values
('a0000000-0000-0000-0000-000000000002', 'https://images.unsplash.com/photo-1503917988258-f87a78e3c995?w=600&q=70', 'Santorini blue hour 🇬🇷', 0),
('a0000000-0000-0000-0000-000000000002', 'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=600&q=70', 'Lisbon trams', 1),
('a0000000-0000-0000-0000-000000000002', 'https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?w=600&q=70', 'Venice mornings', 2),
('a0000000-0000-0000-0000-000000000002', 'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=600&q=70', 'Above the clouds ✈️', 3),
('a0000000-0000-0000-0000-000000000002', 'https://images.unsplash.com/photo-1504609773096-104ff2c73ba4?w=600&q=70', 'Amalfi coast road trip', 4),
('a0000000-0000-0000-0000-000000000002', 'https://images.unsplash.com/photo-1499678329028-101435549a4e?w=600&q=70', 'Paris from the rooftops', 5);

-- 3. Jobs the team is hiring for.
insert into public.jobs (title, description, location, job_type, apply_url, status, created_by) values
('Scotland Country Manager',
 E'We''re looking for a Scotland Country Manager to grow the Tryp.com creator community north of the border.\n\nYou''ll recruit and support creators, run local meet-ups, and own the Scotland challenge calendar. Travel-obsessed, well-connected, and a natural community builder? This is for you.',
 'Edinburgh / Glasgow', 'Permanent', null, 'open', 'a0000000-0000-0000-0000-000000000001'),
('Permanent Content Creator',
 E'Join Tryp.com as a full-time, salaried Content Creator. You''ll make flagship travel content for our global channels, set the creative bar for the community, and travel on the company''s dime.\n\nStrong short-form portfolio (Reels / TikTok) required.',
 'Remote (UK based)', 'Permanent', null, 'open', 'a0000000-0000-0000-0000-000000000001'),
('Video Editor (Freelance)',
 E'Freelance editor to turn creator footage into punchy branded edits. Paid per project, flexible hours, ongoing work for the right person.',
 'Remote', 'Freelance', null, 'open', 'a0000000-0000-0000-0000-000000000001');

-- 4. A live poll in announcements (where should the next challenge be themed?).
do $$
declare
  v_poll uuid := gen_random_uuid();
  v_opt_a uuid := gen_random_uuid();
  v_opt_b uuid := gen_random_uuid();
  v_opt_c uuid := gen_random_uuid();
  v_opt_d uuid := gen_random_uuid();
begin
  insert into public.polls (id, question, created_by, created_at)
  values (v_poll, 'Where should our next challenge be themed?', 'a0000000-0000-0000-0000-000000000001', now() - interval '1 day');

  insert into public.poll_options (id, poll_id, label, sort_order) values
    (v_opt_a, v_poll, 'City breaks ✈️', 0),
    (v_opt_b, v_poll, 'Beaches & islands 🏝️', 1),
    (v_opt_c, v_poll, 'Winter & ski ⛷️', 2),
    (v_opt_d, v_poll, 'Hidden gems 💎', 3);

  -- The announcement message that carries the poll.
  insert into public.messages (channel, sender_id, body, poll_id, created_at)
  values ('announcements', 'a0000000-0000-0000-0000-000000000001',
          '🗳️ Help shape the next challenge, vote below!', v_poll, now() - interval '1 day');

  -- A few votes so it looks alive.
  insert into public.poll_votes (poll_id, option_id, voter_id) values
    (v_poll, v_opt_a, 'a0000000-0000-0000-0000-000000000002'),
    (v_poll, v_opt_a, 'a0000000-0000-0000-0000-000000000003'),
    (v_poll, v_opt_b, 'a0000000-0000-0000-0000-000000000004'),
    (v_poll, v_opt_b, 'a0000000-0000-0000-0000-000000000006'),
    (v_poll, v_opt_b, 'a0000000-0000-0000-0000-000000000008'),
    (v_poll, v_opt_d, 'a0000000-0000-0000-0000-000000000005');
end $$;

-- 5. A referral or two.
insert into public.referrals (referrer_id, referred_name, referred_contact, note, status) values
('a0000000-0000-0000-0000-000000000002', 'Leo Fairbanks', '@leo.onfilm', 'Brilliant drone creator I met in Lisbon, 60k on IG.', 'new'),
('a0000000-0000-0000-0000-000000000003', 'Méabh Sterling', 'meabh.travels@example.com', 'Dublin-based, great storytelling style.', 'contacted');

-- 6. Add a Google Meet link to the existing Live Q&A event.
update public.events
set meeting_url = 'https://meet.google.com/abc-defg-hij'
where title = 'Live Q&A with Ethan';
