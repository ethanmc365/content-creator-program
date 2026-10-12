-- 392: the parent step for two members only, a date of birth to finish a profile, owners told about parents (12 Oct 2026)
--
-- Ethan: "for Andreea Evelina Bodnar, she can accept the normal terms as she is 18 very soon. Leonie and Daniela
-- Azaharez Perez are the only two creators that should get this exceptional popup asking for parent details ... once
-- they manually submit their parents emails and details, I will send the email to their parents with the link."
--
-- * age_exceptions.needs_guardian (default true); Andreea's is false. needs_guardian(profile) = under 18 and not
--   excepted from the parent step. my_agreement_context.minor and accept_agreement use it.
-- * trg_adults_only: finishing onboarding without a date of birth is refused (creators only). The form has always
--   required it; the 9 active members with none joined on 21-22 June before it did, and the app now asks them.
-- * trg_open_guardian_consent: notifies the owners (type 'application') with the parent's name and email, so the
--   email gets sent.

alter table public.age_exceptions add column if not exists needs_guardian boolean not null default true;
update public.age_exceptions set needs_guardian = false
 where profile_id = 'f7997aee-1ed3-4f46-8051-919aeb2170e4'; -- Andreea Evelina Bodnar, 18 on 21 Oct 2026

create or replace function public.needs_guardian(p_profile uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select coalesce(public.profile_age(p_profile) < 18, false)
     and not exists (select 1 from public.age_exceptions x where x.profile_id = p_profile and not x.needs_guardian)
$$;

CREATE OR REPLACE FUNCTION public.accept_agreement(p_agreement uuid, p_method text, p_signed_name text DEFAULT NULL::text, p_signature_svg text DEFAULT NULL::text, p_locale text DEFAULT NULL::text, p_guardian_name text DEFAULT NULL::text, p_guardian_email text DEFAULT NULL::text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a public.agreements; v_lang text; v_text_en text; v_headers json; v_ip text; v_ua text; v_at timestamptz; v_text text; v_age int;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into a from public.agreements where id = p_agreement and published_at is not null;
  if a.id is null then raise exception 'That document is not published.'; end if;
  if p_method not in ('click', 'typed', 'drawn') then raise exception 'Unknown way of accepting.'; end if;
  if a.requires_signature then
    if p_method = 'click' then raise exception 'This agreement needs your signature.'; end if;
    if length(btrim(coalesce(p_signed_name, ''))) < 3 then raise exception 'Type your full name to sign.'; end if;
    if p_method = 'drawn' and length(coalesce(p_signature_svg, '')) < 40 then raise exception 'Draw your signature to sign.'; end if;
  end if;
  if length(coalesce(p_signature_svg, '')) > 200000 then raise exception 'That signature is too large.'; end if;
  v_age := public.profile_age(auth.uid());
  if v_age is not null and v_age < 18 then
    if a.audience = 'vip' then raise exception 'The VIP agreement is for creators aged 18 and over.'; end if;
  end if;
  -- 392: only members whose exception still needs a parent (Leonie, Daniela) are asked; Andreea (18 on 21 Oct) is not.
  if public.needs_guardian(auth.uid()) then
    if length(btrim(coalesce(p_guardian_name, ''))) < 3 or coalesce(p_guardian_email, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'As you are under 18, add your parent or guardian''s name and email.';
    end if;
  end if;
  -- 388: the exact text shown, in the language it was shown in, plus the English text it translates.
  v_lang := public.agreement_lang(a.id, p_locale);
  v_text := public.agreement_render_l((public.agreement_localize(a, v_lang)).body, auth.uid(), null, v_lang);
  v_text_en := public.agreement_render(a.body, auth.uid());
  begin
    v_headers := current_setting('request.headers', true)::json;
    v_ip := split_part(coalesce(v_headers->>'x-forwarded-for', v_headers->>'cf-connecting-ip', ''), ',', 1);
    v_ua := left(v_headers->>'user-agent', 400);
  exception when others then v_ip := null; v_ua := null;
  end;
  insert into public.agreement_acceptances (agreement_id, profile_id, method, signed_name, signature_svg, body_sha256,
                                            rendered_body, rendered_body_en, account_email, ip, user_agent, locale, guardian_name, guardian_email)
  values (a.id, auth.uid(), p_method, nullif(btrim(coalesce(p_signed_name, '')), ''), p_signature_svg,
          encode(extensions.digest(v_text, 'sha256'), 'hex'), v_text, v_text_en,
          (select email from auth.users where id = auth.uid()), nullif(btrim(v_ip), ''), v_ua, v_lang,
          case when public.needs_guardian(auth.uid()) then nullif(btrim(coalesce(p_guardian_name, '')), '') end,
          case when public.needs_guardian(auth.uid()) then nullif(lower(btrim(coalesce(p_guardian_email, ''))), '') end)
  on conflict (agreement_id, profile_id) do nothing
  returning accepted_at into v_at;
  if a.audience = 'vip' then
    update public.vip_members m set terms_accepted_at = now(), terms_version = p.terms_version
      from public.vip_programmes p
     where m.profile_id = auth.uid() and m.status = 'active' and p.id = m.programme_id;
  end if;
  return coalesce(v_at, now());
end $function$;

CREATE OR REPLACE FUNCTION public.my_agreement_context()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object('name', p.name, 'minor', public.needs_guardian(p.id), 'age', public.profile_age(p.id))
    from public.profiles p where p.id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.trg_adults_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_age int; v_dob date;
begin
  if coalesce(new.is_test, false) or coalesce(new.is_sandbox, false) then return new; end if;
  -- Only at the moments that let somebody in: a new row, a new age, finishing onboarding, being approved.
  if not (tg_op = 'INSERT' or new.age is distinct from old.age
          or (coalesce(new.onboarded, false) and not coalesce(old.onboarded, false))
          or (new.status = 'active' and old.status is distinct from 'active')) then
    return new;
  end if;
  if tg_op = 'INSERT' or new.age is distinct from old.age then
    v_age := new.age;               -- set by this very statement (mirror_dob_to_private or sync_age_from_dob)
  else
    select cp.dob into v_dob from public.creator_private cp where cp.id = new.id;
    v_age := coalesce(date_part('year', age(current_date, v_dob))::int, new.age);
  end if;
  -- 392: finishing onboarding needs a date of birth (the form has always asked; this makes it a rule). Staff exempt.
  if coalesce(new.onboarded, false) and not coalesce(old.onboarded, false) and tg_op = 'UPDATE'
     and coalesce(new.platform_role, 'none') = 'none' and v_age is null then
    raise exception 'Add your date of birth to finish your profile.' using errcode = 'P0001';
  end if;
  if v_age is not null and v_age < 18
     and not exists (select 1 from public.age_exceptions x where x.profile_id = new.id) then
    raise exception 'This community is only for creators aged 18 or over.' using errcode = 'P0001';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.trg_open_guardian_consent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.guardian_name is not null then
    insert into public.guardian_consents (acceptance_id) values (new.id) on conflict do nothing;
    -- 392: the team emails the parent now, so tell the owners there is an email to send.
    insert into public.notifications (recipient_id, type, title, body, link)
    select o.id, 'application', 'Parent details added: email them the link',
           coalesce((select name from public.profiles where id = new.profile_id), 'A creator') || ' added ' || new.guardian_name
             || ' (' || coalesce(new.guardian_email, '') || '). Copy the link and the email from Agreements > Register.',
           '/admin/agreements?tab=register'
      from public.profiles o where o.platform_role = 'owner' and coalesce(o.is_test, false) = false;
  end if;
  return new;
end $function$;

insert into public.owner_only_rpcs (proname, why) values
  ('needs_guardian', 'Internal: whether a member must add a parent or guardian')
on conflict do nothing;
select public.lock_down_definer_functions();
