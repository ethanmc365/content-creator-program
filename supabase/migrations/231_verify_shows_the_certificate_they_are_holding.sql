-- THE CHECK PAGE HAS TO SHOW THE SAME OBJECT, NOT A SIMILAR ONE.
--
-- `verify_certificate` names every column it returns by hand - that list IS the
-- security boundary, because this function is SECURITY DEFINER and anon-callable
-- (see 227 and `public_rpc_allowlist`). Migration 230 added `layout` and `paper`
-- to a design and this list did not know about them, so /verify fell back to the
-- legacy layout: somebody holding a Boarding pass certificate would type their
-- code in and be shown a Plaque.
--
-- That is worse than cosmetic on this page in particular. The whole argument for
-- showing the picture rather than a row of fields saying "valid: true" is that
-- the question is "does this match what I am holding" - and a page that answers
-- it with a different-looking certificate answers "no".
--
-- Both new columns are design metadata already visible on the picture the caller
-- is holding, so nothing is disclosed that was not already.
--
-- APPLIED TO PRODUCTION 20 Sep 2026, and `lock_down_definer_functions()` was
-- re-run afterwards. NEVER hand-write a grant for this one - see
-- tryp-security-posture for the four times that was undone.
create or replace function public.verify_certificate(p_serial text)
returns json
language sql
stable
security definer
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
    'facts',       a.facts,
    'awarded_at',  a.awarded_at
  )
  from public.certificate_awards a
  join public.certificate_designs d on d.id = a.design_id
  join public.profiles p on p.id = a.profile_id
  where upper(btrim(a.serial)) = upper(btrim(p_serial))
    and p.status = 'active'
    and p.deletion_requested_at is null;
$function$;

select public.lock_down_definer_functions();
