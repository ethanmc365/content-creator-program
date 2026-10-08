-- 366 (8 Oct 2026): {{creator_market}} for somebody who is only in Worldwide.
--
-- Ethan: "if no one's in a specific market, just in the worldwide thing, what will show up here? Ensure you account for
-- that." It already said "Worldwide" (24 active creators today), but the Community Terms parties line read "a member of
-- the Tryp.com Creator Community in **Worldwide**". The line now carries the market in brackets, which reads for every
-- case: "(Spain)", "(Portugal and Spain)", "(Worldwide)". And only markets they are an ACTIVE CREATOR in count.
-- The Community Terms v1 is still a DRAFT, so its body may change; a published version is immutable and is not touched.

CREATE OR REPLACE FUNCTION public.agreement_render(p_body text, p_profile uuid, p_programme uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_name text; v_market text; v_country text; pr public.vip_programmes; m public.vip_members; v_rate numeric; v_cap numeric;
  v text := coalesce(p_body, '');
begin
  select coalesce(nullif(btrim(name), ''), 'the Creator'), nullif(btrim(country), '') into v_name, v_country from public.profiles where id = p_profile;
  -- 366: the markets they are a CREATOR in today (a left or managed market is not where they are a member), joined
  -- "Portugal and Spain". Nobody but Worldwide reads "Worldwide" (see the Community Terms parties line).
  select regexp_replace(string_agg(c.name, ', ' order by c.name), ', ([^,]+)$', ' and \1') into v_market
    from public.community_members cm join public.communities c on c.id = cm.community_id
   where cm.profile_id = p_profile and c.slug <> 'worldwide' and c.retired_at is null
     and cm.status = 'active' and cm.role = 'creator';
  select * into m from public.vip_members where profile_id = p_profile;
  select * into pr from public.vip_programmes where id = coalesce(p_programme, m.programme_id);
  if pr.id is null then select * into pr from public.vip_programmes where is_default and active limit 1; end if;
  v_rate := coalesce(m.cpm, pr.cpm);
  v_cap := coalesce(m.monthly_cap, pr.monthly_cap);
  v := replace(v, '{{creator_name}}', coalesce(v_name, '[Creator name]'));
  v := replace(v, '{{creator_market}}', coalesce(v_market, case when p_profile is null then '[their market]' else 'Worldwide' end));
  v := replace(v, '{{creator_country}}', coalesce(v_country, case when p_profile is null then '[their country]' else 'your country' end));
  v := replace(v, '{{market}}', coalesce(pr.name, 'your VIP market'));
  v := replace(v, '{{rate}}', case when v_rate is null then '[rate]' else
         case upper(coalesce(pr.currency, 'EUR')) when 'GBP' then '£' else '€' end || case when round(v_rate, 2) = v_rate then to_char(v_rate, 'FM990D00') else to_char(v_rate, 'FM990D000') end end);
  v := replace(v, '{{min_payout}}', coalesce(public.agreement_money(pr.min_payout, pr.currency), '[minimum]'));
  v := replace(v, '{{voucher_min}}', coalesce(public.agreement_money(pr.voucher_min, pr.currency), '[voucher minimum]'));
  v := replace(v, '{{window_days}}', coalesce(pr.window_days::text, '60'));
  v := replace(v, '{{payment_cap}}', case
         when v_cap is not null then 'Payments under this Agreement are capped at ' || public.agreement_money(v_cap, pr.currency)
              || ' per monthly period. If you go beyond it, Tryp.com may, at its discretion, discuss additional compensation with you, such as a monthly retainer or a longer collaboration.'
         else 'Your market currently has no monthly payment cap. Tryp.com may introduce one for future months with at least 14 days'' notice.' end);
  v := replace(v, '{{stay_in}}', case
         when coalesce(pr.req_on, false) then 'To remain part of the VIP group, in each calendar month you must either publish at least '
              || pr.req_videos || ' eligible videos, or have at least one eligible video reach '
              || to_char(pr.req_single_views, 'FM999G999G990') || ' views. Creators who do not meet this may be removed from the VIP group.'
         else 'Your market currently has no minimum posting requirement. Tryp.com may introduce one for future months with at least 14 days'' notice.' end);
  v := replace(v, '{{today}}', to_char(now() at time zone 'Europe/Copenhagen', 'FMDD FMMonth YYYY'));
  return v;
end $function$;

update public.agreements
   set body = replace(body, 'a member of the Tryp.com Creator Community in **{{creator_market}}** ("you")', 'a member of the Tryp.com Creator Community (**{{creator_market}}**) ("you")'),
       updated_at = now()
 where published_at is null
   and body like '%a member of the Tryp.com Creator Community in **{{creator_market}}** ("you")%';
