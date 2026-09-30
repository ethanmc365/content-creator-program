-- 301: TWO FIXES FOUND WHILE TESTING 299 (30 Sep 2026).
--
-- 1. `vip_global_link` raced: two callers that both found no link each tried to insert one, and the unique index
--    (one live link) made the loser fail with "could not be made" even though the link existed a moment later. The
--    insert now yields to a concurrent one and both callers read the same row.
-- 2. The owner's market standings include a programme that is switched off (the VIP Demo), so the standings and the
--    map can be checked against the demo data. Nobody else sees an inactive programme.
create or replace function public.vip_global_link()
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare i public.vip_invites;
begin
  if not public.vip_has_access() then raise exception 'Only the people who run the VIP programme can see the sign-up link.'; end if;
  select * into i from public.vip_invites where is_global and revoked_at is null;
  if i.id is null then
    insert into public.vip_invites (token, programme_id, label, is_global, created_by)
    values (translate(encode(gen_random_bytes(9), 'base64'), '+/=', '-_'), null, 'The VIP sign-up link', true, auth.uid())
    on conflict do nothing;
    select * into i from public.vip_invites where is_global and revoked_at is null;
  end if;
  return jsonb_build_object('token', i.token, 'uses', i.uses, 'created_at', i.created_at);
end $$;

do $$
declare d text; d2 text;
begin
  d := pg_get_functiondef('public.vip_market_standings()'::regprocedure);
  d2 := replace(d, 'where pr.active order by pr.name', 'where (pr.active or public.is_owner()) order by pr.name');
  if d2 = d then raise exception 'vip_market_standings did not match the expected text'; end if;
  execute d2;
end $$;
