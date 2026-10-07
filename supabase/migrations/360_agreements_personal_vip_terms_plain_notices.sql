-- 360: agreements made personal, the VIP terms tied to the VIP agreement, a parent's consent for under-18s,
--      and notification text without markdown (7 Oct 2026).
--
-- 1. NOTIFICATIONS ARE PLAIN TEXT. Ethan: when Marta writes a bold or heading line in a room, the notification
--    "shows up as stars and hashtags". The room notice copies the message body as typed; a push, an email and the
--    bell list cannot draw markdown. `md_plain` strips it once, at write, in a BEFORE INSERT trigger, so every
--    writer (there are ~40) is covered without touching any of them. Old rows are cleaned in place.
-- 2. THE VIP TERMS ARE THE VIP AGREEMENT. The VIP page had its own "accept the terms" sheet (programme.terms,
--    vip_accept_terms) and the agreements system now asks for the signed VIP agreement too. Ethan: "it should only
--    be the one on the admin agreements that actually shows up whenever it's activated." `vip_terms_ok` is the one
--    rule: if a published VIP agreement applies to this person they must have signed it, and if none is published
--    nothing is asked. Five functions that read terms_accepted_at are rewritten onto it.
-- 3. FILL-INS FOR THE COMMUNITY TERMS: {{creator_market}} and {{creator_country}} beside {{creator_name}}.
-- 4. UNDER 18: the community terms are accepted with a parent or guardian's name and email on the record, and the
--    VIP agreement (a paid contract) is 18+ only. A minor's contract is not binding on them without a guardian
--    (Danish Guardianship Act s.42-44 and the equivalent rules in every market we run).
-- 5. The community terms draft is rewritten and the VIP draft gains the company number and an 18+ clause. Both are
--    still DRAFTS: Ethan publishes them on Admin > Agreements.

-- ---------------------------------------------------------------------------------------------- 1. plain text
create or replace function public.md_plain(p text)
returns text language plpgsql immutable set search_path = public as $$
declare v text := p;
begin
  if v is null or v = '' then return v; end if;
  v := regexp_replace(v, '^[ \t]*#{1,6}[ \t]+', '', 'gn');            -- headings
  v := regexp_replace(v, '^[ \t]*>[ \t]?', '', 'gn');                  -- quotes
  v := regexp_replace(v, '^[ \t]*[-*+][ \t]+', '• ', 'gn');            -- bullets
  v := regexp_replace(v, '^[ \t]*(-{3,}|\*{3,}|_{3,})[ \t]*$', '', 'gn'); -- rules
  v := regexp_replace(v, '!?\[([^\]\n]*)\]\(([^)\s]+)\)', '\1', 'g');  -- [text](url), images
  v := regexp_replace(v, '(\*\*|__)(.+?)\1', '\2', 'g');               -- bold
  v := regexp_replace(v, '~~(.+?)~~', '\1', 'g');                      -- strike
  v := regexp_replace(v, '`([^`\n]+)`', '\1', 'g');                    -- code
  v := regexp_replace(v, '(^|[^\w*])\*([^*\n]+)\*', '\1\2', 'g');      -- italic *x*
  v := regexp_replace(v, '(^|[^\w_])_([^_\n]+)_', '\1\2', 'g');        -- italic _x_
  v := regexp_replace(v, '\*{2,}', '', 'g');                           -- a stray marker left open
  v := regexp_replace(v, '\n{3,}', E'\n\n', 'g');
  return btrim(v, E' \n\t');
end $$;

create or replace function public.notifications_plain_text()
returns trigger language plpgsql set search_path = public as $$
begin
  new.title := public.md_plain(new.title);
  new.body := public.md_plain(new.body);
  return new;
end $$;

drop trigger if exists trg_aa_notifications_plain_text on public.notifications;
create trigger trg_aa_notifications_plain_text before insert on public.notifications
  for each row execute function public.notifications_plain_text();

update public.notifications
   set body = public.md_plain(body), title = public.md_plain(title)
 where body ~ '(\*\*|__|~~|`|^\s*#{1,6}\s|\n\s*#{1,6}\s|\]\()' or title ~ '(\*\*|__|~~|`|^\s*#{1,6}\s)';

-- ------------------------------------------------------------------------------------------- 2. VIP terms rule
create or replace function public.vip_terms_ok(p_profile uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
           when (public.agreement_for('vip', p_profile)).id is null then true
           else exists (select 1 from public.agreement_acceptances x
                         where x.profile_id = p_profile and x.agreement_id = (public.agreement_for('vip', p_profile)).id)
         end
$$;
revoke all on function public.vip_terms_ok(uuid) from public, anon;
grant execute on function public.vip_terms_ok(uuid) to authenticated, service_role;

do $do$
declare
  r record; v_def text; v_new text;
  edits jsonb := jsonb_build_array(
    jsonb_build_array('vip_my_overview', 'm.terms_accepted_at is not null and coalesce(m.terms_version, 0) >= p.terms_version', 'public.vip_terms_ok(m.profile_id)'),
    jsonb_build_array('vip_submit_video', 'm.terms_accepted_at is null or coalesce(m.terms_version, 0) < p.terms_version', 'not public.vip_terms_ok(m.profile_id)'),
    jsonb_build_array('vip_submit_video', 'Please accept the VIP terms first.', 'Please sign the VIP agreement first.'),
    jsonb_build_array('vip_attention', 'm.terms_accepted_at is null or coalesce(m.terms_version, 0) < pr.terms_version', 'not public.vip_terms_ok(m.profile_id)'),
    jsonb_build_array('vip_admin_overview', 'vm.terms_accepted_at is not null and coalesce(vm.terms_version, 0) >= p.terms_version', 'public.vip_terms_ok(vm.profile_id)'),
    jsonb_build_array('vip_range_analytics', 'vm.terms_accepted_at is not null terms_ok', 'public.vip_terms_ok(vm.profile_id) terms_ok')
  );
  e jsonb;
begin
  for e in select * from jsonb_array_elements(edits) loop
    select p.oid, pg_get_functiondef(p.oid) d into r
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = e->>0;
    if r.oid is null then raise exception 'function % not found', e->>0; end if;
    v_def := r.d;
    if position(e->>1 in v_def) = 0 then raise exception 'pattern not found in %: %', e->>0, e->>1; end if;
    v_new := replace(v_def, e->>1, e->>2);
    execute v_new;
  end loop;
end $do$;

-- ------------------------------------------------------------------------------- 3. community fill-ins
create or replace function public.agreement_render(p_body text, p_profile uuid, p_programme uuid default null)
returns text language plpgsql stable security definer set search_path = public as $function$
declare
  v_name text; v_market text; v_country text; pr public.vip_programmes; m public.vip_members; v_rate numeric; v_cap numeric;
  v text := coalesce(p_body, '');
begin
  select coalesce(nullif(btrim(name), ''), 'the Creator'), nullif(btrim(country), '') into v_name, v_country from public.profiles where id = p_profile;
  select string_agg(c.name, ', ' order by c.name) into v_market
    from public.community_members cm join public.communities c on c.id = cm.community_id
   where cm.profile_id = p_profile and c.slug <> 'worldwide' and c.retired_at is null;
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

-- ---------------------------------------------------------------------------------------------- 4. under 18
alter table public.agreement_acceptances
  add column if not exists guardian_name text,
  add column if not exists guardian_email text;

create or replace function public.profile_age(p_profile uuid)
returns integer language sql stable security definer set search_path = public as $$
  select date_part('year', age(current_date, coalesce(cp.dob, p.dob)))::int
    from public.profiles p left join public.creator_private cp on cp.id = p.id
   where p.id = p_profile
$$;
revoke all on function public.profile_age(uuid) from public, anon, authenticated;

-- What the agreement sheet needs to know about the person signing, and nothing else.
create or replace function public.my_agreement_context()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', p.name, 'minor', coalesce(public.profile_age(p.id) < 18, false), 'age', public.profile_age(p.id))
    from public.profiles p where p.id = auth.uid()
$$;
revoke all on function public.my_agreement_context() from public, anon;
grant execute on function public.my_agreement_context() to authenticated;

drop function if exists public.accept_agreement(uuid, text, text, text, text);
create or replace function public.accept_agreement(
  p_agreement uuid, p_method text, p_signed_name text default null, p_signature_svg text default null,
  p_locale text default null, p_guardian_name text default null, p_guardian_email text default null)
returns timestamptz language plpgsql security definer set search_path = public as $function$
declare a public.agreements; v_headers json; v_ip text; v_ua text; v_at timestamptz; v_text text; v_age int;
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
    if length(btrim(coalesce(p_guardian_name, ''))) < 3 or coalesce(p_guardian_email, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'As you are under 18, add your parent or guardian''s name and email.';
    end if;
  end if;
  v_text := public.agreement_render(a.body, auth.uid());
  begin
    v_headers := current_setting('request.headers', true)::json;
    v_ip := split_part(coalesce(v_headers->>'x-forwarded-for', v_headers->>'cf-connecting-ip', ''), ',', 1);
    v_ua := left(v_headers->>'user-agent', 400);
  exception when others then v_ip := null; v_ua := null;
  end;
  insert into public.agreement_acceptances (agreement_id, profile_id, method, signed_name, signature_svg, body_sha256,
                                            rendered_body, account_email, ip, user_agent, locale, guardian_name, guardian_email)
  values (a.id, auth.uid(), p_method, nullif(btrim(coalesce(p_signed_name, '')), ''), p_signature_svg,
          encode(extensions.digest(v_text, 'sha256'), 'hex'), v_text,
          (select email from auth.users where id = auth.uid()), nullif(btrim(v_ip), ''), v_ua, p_locale,
          case when v_age < 18 then nullif(btrim(coalesce(p_guardian_name, '')), '') end,
          case when v_age < 18 then nullif(lower(btrim(coalesce(p_guardian_email, ''))), '') end)
  on conflict (agreement_id, profile_id) do nothing
  returning accepted_at into v_at;
  if a.audience = 'vip' then
    update public.vip_members m set terms_accepted_at = now(), terms_version = p.terms_version
      from public.vip_programmes p
     where m.profile_id = auth.uid() and m.status = 'active' and p.id = m.programme_id;
  end if;
  return coalesce(v_at, now());
end $function$;
revoke all on function public.accept_agreement(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.accept_agreement(uuid, text, text, text, text, text, text) to authenticated, service_role;

drop function if exists public.agreement_register(uuid);
create function public.agreement_register(p_agreement uuid)
returns table(profile_id uuid, name text, photo_url text, status text, is_vip boolean, accepted_at timestamptz, method text,
              signed_name text, signature_svg text, ip text, user_agent text, account_email text, body_sha256 text,
              guardian_name text, guardian_email text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.photo_url, p.status, p.is_vip, x.accepted_at, x.method, x.signed_name, x.signature_svg, x.ip,
         x.user_agent, x.account_email, x.body_sha256, x.guardian_name, x.guardian_email
    from public.agreements a
    join public.profiles p on p.status in ('active', 'muted') and not coalesce(p.is_test, false)
     and (public.agreement_for(a.audience, p.id)).id = a.id
    left join public.agreement_acceptances x on x.agreement_id = a.id and x.profile_id = p.id
   where a.id = p_agreement and public.is_admin()
   order by x.accepted_at desc nulls last, p.name
$$;
revoke all on function public.agreement_register(uuid) from public, anon;
grant execute on function public.agreement_register(uuid) to authenticated, service_role;
