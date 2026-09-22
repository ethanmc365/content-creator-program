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
