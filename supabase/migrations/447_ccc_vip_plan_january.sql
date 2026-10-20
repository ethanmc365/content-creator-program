-- 447 (20 Oct 2026): the VIP plan is anchored on January like the community's (Ethan: "do the anchor also as January,
-- and ensure that everything is aligned"). January 2027 = 18.4M at 7% a month gives October 15.0M (they are on pace
-- for about 16.9M), November 16.1M, December 17.2M. September follows the plan too: the hand-set 5M is removed.
update public.ccc_plans set anchor_year = 2027, anchor_month = 1, anchor_views = 18400000, growth = 0.07
 where segment = 'vip';
update public.ccc_targets set pinned = false, view_target = null where segment = 'vip' and year = 2026 and month = 9;
delete from public.ccc_targets
 where not pinned and epm is null and cpm is null and coalesce(other_costs, 0) = 0 and achieved_override is null and note is null;

-- And it starts in October 2026, when the VIP and official programmes moved onto the platform: a 14M September target
-- against the 5.1M the small pre-platform VIP group did (VIP sheet) would drag every VIP total. September still shows
-- its views, without a target. The community plan keeps September.
update public.ccc_plans set start_year = 2026, start_month = 10 where segment = 'vip';
