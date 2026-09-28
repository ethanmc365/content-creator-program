-- 271: THE CERTIFICATE CARRIES THEIR FACE, AND DROPS A LINE (28 Sep 2026).
--
-- Ethan, on the certificate designs: the Horizon layout should "include the
-- profile photo on it ... rather than having the Tryp.com plane on the left
-- side", and "you don't need to say verified by the Trip.com Content Creator
-- Community again. Obviously it's already verified."
--
-- 1. verify_certificate returns the holder's photo, so /verify draws the same
--    certificate the creator holds. Copied from pg_get_functiondef and one key
--    added; nothing else changes. The photo is the public avatar already shown
--    beside their name everywhere on the platform.
-- 2. The three designs that carried the "Verified by ..." footnote lose it.

create or replace function public.verify_certificate(p_serial text)
 returns json
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select json_build_object(
    'serial',      a.serial,
    'title',       d.title,
    'subtitle',    d.subtitle,
    'body',        d.body,
    'tier',        d.tier,
    'accent',      d.accent,
    'emblem',      d.emblem,
    'pattern',     d.pattern,
    'layout',      d.layout,
    'paper',       d.paper,
    'signature',   d.signature,
    'signature_role', d.signature_role,
    'footnote',    d.footnote,
    'award_on',    d.award_on,
    'options',     d.options,
    'facts',       a.facts,
    'awarded_at',  a.awarded_at,
    'photo',       p.photo_url
  )
  from public.certificate_awards a
  join public.certificate_designs d on d.id = a.design_id
  join public.profiles p on p.id = a.profile_id
  where upper(btrim(a.serial)) = upper(btrim(p_serial))
    and p.status = 'active'
    and p.deletion_requested_at is null;
$function$;

update public.certificate_designs
   set footnote = ''
 where footnote ilike 'verified by the tryp.com%';
