-- 380: SMALL FOLLOW-UPS TO 376-379 (10 Oct 2026).
--
-- * A member's settings sheet can say a creator invoices the team themselves (`invoice_outside`, migration 376): their
--   views are tracked and shown, no monthly statement is drafted. Paula and Julia (official, Spain) are set that way.

CREATE OR REPLACE FUNCTION public.vip_member_settings(p_profile uuid, p_settings jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_prog uuid; s jsonb := coalesce(p_settings, '{}'::jsonb); t jsonb; e jsonb;
begin
  select programme_id into v_prog from public.vip_members where profile_id = p_profile;
  if v_prog is null then raise exception 'That creator is not a VIP.'; end if;
  if not public.vip_can_manage(v_prog) then raise exception 'Only the market lead or the team can change a VIP.'; end if;
  if s ? 'status' and s ->> 'status' not in ('active', 'paused', 'left') then raise exception 'Unknown status.'; end if;
  if s ? 'cpm' and s ->> 'cpm' is not null and (s ->> 'cpm')::numeric < 0 then raise exception 'A rate cannot be negative.'; end if;
  if s ? 'tiers' and jsonb_typeof(s -> 'tiers') = 'array' then
    t := '[]'::jsonb;
    for e in select * from jsonb_array_elements(s -> 'tiers') loop
      if coalesce((e ->> 'from_views')::numeric, 0) <= 0 or coalesce((e ->> 'cpm')::numeric, -1) < 0 then
        raise exception 'Each step needs a views figure above zero and a rate.';
      end if;
      t := t || jsonb_build_object('from_views', (e ->> 'from_views')::numeric, 'cpm', (e ->> 'cpm')::numeric);
    end loop;
    if jsonb_array_length(t) = 0 then t := null; end if;
  end if;
  update public.vip_members set
    status = case when s ? 'status' then s ->> 'status' else status end,
    left_on = case when s ->> 'status' = 'left' then current_date when s ->> 'status' in ('active', 'paused') then null else left_on end,
    cpm = case when s ? 'cpm' then (s ->> 'cpm')::numeric else cpm end,
    tiers = case when s ? 'tiers' then t else tiers end,
    monthly_cap = case when s ? 'monthly_cap' then (s ->> 'monthly_cap')::numeric else monthly_cap end,
    monthly_fee = case when s ? 'monthly_fee' then nullif((s ->> 'monthly_fee')::numeric, 0) else monthly_fee end,
    fee_min_videos = case when s ? 'fee_min_videos' then (s ->> 'fee_min_videos')::int else fee_min_videos end,
    bonuses_on = case when s ? 'bonuses_on' then coalesce((s ->> 'bonuses_on')::boolean, true) else bonuses_on end,
    target_videos = case when s ? 'target_videos' then (s ->> 'target_videos')::int else target_videos end,
    target_views = case when s ? 'target_views' then (s ->> 'target_views')::bigint else target_views end,
    rate_review_on = case when s ? 'rate_review_on' then (s ->> 'rate_review_on')::date else rate_review_on end,
    headline = case when s ? 'headline' then nullif(btrim(s ->> 'headline'), '') else headline end,
    show_on_map = case when s ? 'show_on_map' then coalesce((s ->> 'show_on_map')::boolean, true) else show_on_map end,
    notes = case when s ? 'notes' then nullif(btrim(s ->> 'notes'), '') else notes end,
    invoice_outside = case when s ? 'invoice_outside' then coalesce((s ->> 'invoice_outside')::boolean, false) else invoice_outside end
  where profile_id = p_profile;
  return (select to_jsonb(m) - 'terms_accepted_at' from public.vip_members m where profile_id = p_profile);
end $function$;
