-- ============================================================================
-- 171 - the last four search_path warnings
--
-- The four functions Supabase's security advisor still flags after migration
-- 170. All four are SECURITY INVOKER, so nothing can currently be smuggled
-- through them - they inherit the pinned search_path of the SECURITY DEFINER
-- function that calls them (award_challenge_prizes_internal, which is pinned to
-- 'public'). That is a property of the CALLER, though, and a caller is exactly
-- the thing a future migration changes without thinking about this. Pinning
-- them costs nothing and takes the last four warnings off the advisor, so the
-- next real one is not sitting in a list of four that everyone has learnt to
-- scroll past.
-- ============================================================================
alter function public.prize_amount_of(text)           set search_path to 'public';
alter function public.prize_kind_of(text)             set search_path to 'public';
alter function public.prize_currency_of(text, text)   set search_path to 'public';
alter function public.invoice_is_payable(jsonb)       set search_path to 'public';
