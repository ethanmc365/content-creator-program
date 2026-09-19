-- A CREDENTIAL NOBODY CAN CHECK IS A JPEG.
--
-- APPLIED 16 Sep 2026 as `a_certificate_anybody_can_check`.
--
-- The serial has been printed on the face of every certificate since 221, on
-- the reasoning that "a brand can be told what to ask for". That was half a
-- feature: there was nowhere to ask. `pages/VerifyCertificate` is the other
-- half, at /verify/:serial.
--
-- WHAT IT DELIBERATELY DOES NOT RETURN. This is a lookup by a code PRINTED ON A
-- PUBLIC IMAGE, so anyone holding the picture can call it, and a six-character
-- code is guessable in a way a uuid is not. So it answers exactly one question
-- - "is this real, and what does it say?" - from facts that are already ON the
-- certificate the caller is looking at. No profile id, no email, no city, no
-- other awards, no link to the account. Confirming what somebody can already
-- read is not a disclosure; volunteering anything else would be.
--
-- A withdrawn creator and a made-up code are both `null`, deliberately: a
-- verification endpoint that distinguishes them leaks the difference.
create or replace function public.verify_certificate(p_serial text)
returns json language sql stable security definer set search_path to 'public' as $$
  select json_build_object(
    'serial',      a.serial,
    'title',       d.title,
    'subtitle',    d.subtitle,
    'body',        d.body,
    'tier',        d.tier,
    'accent',      d.accent,
    'emblem',      d.emblem,
    'pattern',     d.pattern,
    'signature',   d.signature,
    'signature_role', d.signature_role,
    'footnote',    d.footnote,
    'facts',       a.facts,
    'awarded_at',  a.awarded_at
  )
  from public.certificate_awards a
  join public.certificate_designs d on d.id = a.design_id
  join public.profiles p on p.id = a.profile_id
  -- Case-insensitive: the code is printed in caps and typed however it is typed.
  where upper(btrim(a.serial)) = upper(btrim(p_serial))
    and p.status = 'active'
    and p.deletion_requested_at is null;
$$;

-- The allowlist is the declaration; the anon grant is a consequence of it. See
-- 224 for why a hand-written grant here would be wrong.
insert into public.public_rpc_allowlist (proname, reason)
values ('verify_certificate',
        'Checks one certificate by the serial PRINTED ON ITS FACE. Returns only what is already on the picture the caller is holding - no ids, no contact details, no other awards.')
on conflict (proname) do update set reason = excluded.reason;

select public.lock_down_definer_functions();
