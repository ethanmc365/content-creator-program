-- 451 (20 Oct 2026): the VIP side of Targets & profit counts VIP creators only (Ethan: official creators should not be
-- counted). On 20 Oct VIP creators alone had 8.34M views in October (official 2.63M), on pace for about 12.4M, so the
-- VIP plan is re-based: January 2027 = 14.7M at 7% a month, giving October 12.0M, November 12.8M, December 13.7M.
update public.ccc_plans set anchor_year = 2027, anchor_month = 1, anchor_views = 14700000, growth = 0.07 where segment = 'vip';
