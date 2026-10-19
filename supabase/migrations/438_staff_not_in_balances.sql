-- 438: the team's own tracked videos (source 'staff', 436) are not paid through the platform, so the staff member is not
-- a row in the market's balances ("Ethan - no bank details yet" on the official overview, 19 Oct 2026).
do $mig$
declare d text; a text := 'where m.programme_id = p_programme and not public.vip_hidden_profile(m.profile_id)) z)';
begin
  d := pg_get_functiondef('public.vip_wallets(uuid)'::regprocedure);
  if position(a in d) = 0 then raise exception '438: vip_wallets drifted'; end if;
  execute replace(d, a, 'where m.programme_id = p_programme and m.source <> ''staff'' and not public.vip_hidden_profile(m.profile_id)) z)');
end $mig$;
