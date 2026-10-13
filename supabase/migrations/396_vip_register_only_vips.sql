-- 396 (13 Oct 2026): the VIP agreement's register listed every creator (227) as "waiting to sign".
-- agreement_for('vip', p) answers for anybody who is not an official creator (see 388), so the register needs the same
-- "is an active VIP member" fence that publish_agreement and my_pending_agreements already have. A creator made a VIP
-- later appears the moment their vip_members row is active; one who leaves drops off again (unless they had signed).
create or replace function public.agreement_register(p_agreement uuid)
 returns table(profile_id uuid, name text, photo_url text, status text, is_vip boolean, accepted_at timestamp with time zone, method text, signed_name text, signature_svg text, ip text, user_agent text, account_email text, body_sha256 text, guardian_name text, guardian_email text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select p.id, p.name, p.photo_url, p.status, p.is_vip, x.accepted_at, x.method, x.signed_name, x.signature_svg, x.ip,
         x.user_agent, x.account_email, x.body_sha256, x.guardian_name, x.guardian_email
    from public.agreements a
    join public.profiles p on p.status in ('active', 'muted') and not coalesce(p.is_test, false)
     and (public.agreement_for(a.audience, p.id)).id = a.id
    left join public.agreement_acceptances x on x.agreement_id = a.id and x.profile_id = p.id
   where a.id = p_agreement and public.is_admin()
     and (a.audience <> 'vip' or x.profile_id is not null
          or exists (select 1 from public.vip_members m where m.profile_id = p.id and m.status = 'active'))
   order by x.accepted_at desc nulls last, p.name
$function$;
