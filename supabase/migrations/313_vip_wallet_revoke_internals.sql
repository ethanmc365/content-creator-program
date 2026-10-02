-- 313: the internal helpers from 312 are not for calling from the app. Default privileges re-grant `authenticated` on
-- every new definer function, so this has to be its own migration, after 312 (see migration 303 for the same trap).
revoke execute on function public.vip_balance(uuid) from public, anon, authenticated;
revoke execute on function public.vip_window(uuid) from public, anon, authenticated;
revoke execute on function public.vip_req_check(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.vip_pay_out(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.vip_record_requirements(uuid) from public, anon, authenticated;
revoke execute on function public.vip_requirement_nudges() from public, anon, authenticated;
