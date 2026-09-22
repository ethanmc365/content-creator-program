-- Rehearses migration 242 against prod data and ROLLS BACK (the block ends in
-- raise exception, so the report comes back as the error message).
-- Expect: 2 qualifying -> 0 vouchers, 3 -> 1 (EUR 20), re-sync -> still 1, 4 -> 1.
do $$
declare
  referrer uuid; rep text := ''; ids uuid[]; n int; notes text;
begin
  select id into referrer from profiles
   where status = 'active' and coalesce(is_test, false) = false
     and not exists (select 1 from profiles q where q.referred_by = profiles.id)
   limit 1;
  select array_agg(id) into ids from (
    select p.id from profiles p
     where p.status = 'active' and p.referred_by is null and p.id <> referrer
       and coalesce(p.is_test, false) = false
       and exists (select 1 from submissions s where s.creator_id = p.id)
     limit 4) x;

  update profiles set referred_by = referrer where id = any(ids[1:2]);
  perform sync_referral_rewards(referrer, false);
  select count(*) into n from rewards where creator_id = referrer and source = 'referral';
  rep := rep || '2 qualifying -> vouchers ' || n || E'\n';

  update profiles set referred_by = referrer where id = ids[3];
  perform sync_referral_rewards(referrer, false);
  select count(*), max(amount::text || ' ' || currency || ' | ' || payment_notes)
    into n, notes from rewards where creator_id = referrer and source = 'referral';
  rep := rep || '3 qualifying -> vouchers ' || n || ' ' || coalesce(notes, '') || E'\n';

  perform sync_referral_rewards(referrer, false);
  select count(*) into n from rewards where creator_id = referrer and source = 'referral';
  rep := rep || 're-sync -> ' || n || E'\n';

  update profiles set referred_by = referrer where id = ids[4];
  perform sync_referral_rewards(referrer, false);
  select count(*) into n from rewards where creator_id = referrer and source = 'referral';
  rep := rep || '4 qualifying -> ' || n || E'\n';

  raise exception E'\n%', rep;
end $$;

-- THE TRIGGER PATH (passed 22 Sep 2026): three referred creators each post a
-- first video to the live Global Challenge, then the first posts again.
-- Expect notifications "1 of 3", "2 of 3", "You earned a Tryp.com voucher",
-- ONE EUR 20 pending reward, and nothing more for the second video.
do $$
declare
  rep text := ''; referrer uuid; ids uuid[]; ch uuid := '93c6a3c9-7c42-4f92-ad1f-cfcb60dae5a5'; i int; r record;
begin
  select id into referrer from profiles where status='active' and not coalesce(is_test,false) and not coalesce(is_sandbox,false)
     and not exists (select 1 from profiles q where q.referred_by = profiles.id) limit 1;
  select array_agg(id) into ids from (select p.id from profiles p where p.status='active' and p.referred_by is null and p.id<>referrer
     and not coalesce(p.is_test,false) and not coalesce(p.is_sandbox,false)
     and not exists (select 1 from submissions s where s.creator_id=p.id) limit 3) x;
  update profiles set referred_by = referrer where id = any(ids);
  for i in 1..3 loop
    insert into submissions (challenge_id, creator_id, video_url, platform)
      values (ch, ids[i], 'https://www.tiktok.com/@rehearsal/video/' || (7000000000000000000 + i), 'TikTok');
  end loop;
  insert into submissions (challenge_id, creator_id, video_url, platform)
    values (ch, ids[1], 'https://www.tiktok.com/@rehearsal/video/7000000000000000009', 'TikTok');
  for r in select title, body from notifications where recipient_id=referrer and type='referral' order by ctid loop
    rep := rep || format(E'%s / %s\n', r.title, r.body);
  end loop;
  for r in select amount, currency, status from rewards where creator_id=referrer and source='referral' loop
    rep := rep || format(E'REWARD %s %s %s\n', r.amount, r.currency, r.status);
  end loop;
  raise exception E'ROLLED BACK REHEARSAL\n%', rep;
end $$;
