-- WHO HAS BROUGHT THE MOST PEOPLE IN, ALL TIME.
--
-- Outstanding from the 28 Sep brief. The Refer page told a creator how they
-- were doing and nothing about anybody else, which is the one thing a referral
-- scheme can usually make interesting - "Jacob has brought in four" is the fact
-- that makes somebody share their link.
--
-- WHY THIS IS AN RPC AND NOT A QUERY. A creator cannot read `profiles.
-- referred_by` across the community, and should not be able to: who recruited
-- whom is somebody else's business, and the raw column would let anybody build
-- the whole recruitment tree. This returns a COUNT per referrer and nothing
-- about who was referred - the aggregate is shareable, the edges are not.
--
-- THE COUNTING RULE IS THE VOUCHER'S RULE, deliberately. `lib/referrals` has
-- said since July that a referral counts once the referred creator has posted
-- to a challenge, because that is what the reward is paid for. A board that
-- counted signups instead would rank people by how many links they sent, and
-- would disagree with the voucher on the same page.

create or replace function public.referral_leaderboard(p_limit integer default 10)
returns table (creator_id uuid, name text, photo_url text, counted bigint, joined_total bigint)
language sql stable security definer set search_path to 'public'
as $function$
  select r.id, r.name, r.photo_url,
         count(*) filter (where exists (
           select 1 from public.submissions s where s.creator_id = referred.id
         ))::bigint as counted,
         count(*)::bigint as joined_total
    from public.profiles referred
    join public.profiles r on r.id = referred.referred_by
   where referred.referred_by is not null
     and referred.status = 'active'
     and not coalesce(referred.is_test, false)
     and not coalesce(r.is_test, false)
     and not r.is_admin
     and r.status = 'active'
     and r.deletion_requested_at is null
   group by r.id, r.name, r.photo_url
  having count(*) filter (where exists (
           select 1 from public.submissions s where s.creator_id = referred.id
         )) > 0
   order by counted desc, joined_total desc, r.name
   limit greatest(1, least(coalesce(p_limit, 10), 50));
$function$;

revoke all on function public.referral_leaderboard(integer) from public, anon;
grant execute on function public.referral_leaderboard(integer) to authenticated;
