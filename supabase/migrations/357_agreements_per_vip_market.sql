-- 357: agreements per VIP market, with the market's own numbers filled in (7 Oct 2026).
--
-- Ethan: "ensure that they are customizable for the normal creator community, and also for the VIP community, as well
-- as for each market in the VIP community."
--
-- * A VIP agreement may belong to one programme (`programme_id`). A VIP is asked for the newest published version for
--   their own programme, or, when their market has none, the newest shared one (programme_id null).
-- * The text is a template. `agreement_render` fills placeholders from the reader's own VIP membership and programme:
--     {{creator_name}} {{market}} {{rate}} {{min_payout}} {{voucher_min}} {{window_days}} {{payment_cap}} {{stay_in}} {{today}}
--   so Spain says EUR 0.20 and a EUR 1,000 cap, Romania EUR 0.40 and EUR 200, with one document or three.
-- * What is signed is the FILLED-IN text: accept_agreement stores it (`rendered_body`) and fingerprints that, not the
--   template, so the record shows exactly what that person read.

alter table public.agreements add column if not exists programme_id uuid references public.vip_programmes(id) on delete cascade;
alter table public.agreements drop constraint if exists agreements_audience_version_key;
create unique index if not exists agreements_doc_version_key
  on public.agreements (audience, coalesce(programme_id, '00000000-0000-0000-0000-000000000000'::uuid), version);
alter table public.agreements drop constraint if exists agreements_programme_only_vip;
alter table public.agreements add constraint agreements_programme_only_vip check (programme_id is null or audience = 'vip');

alter table public.agreement_acceptances add column if not exists rendered_body text;

create or replace function public.agreement_money(p_amount numeric, p_currency text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case upper(coalesce(p_currency, 'EUR')) when 'GBP' then '£' when 'USD' then '$' else '€' end
         || case when p_amount = trunc(p_amount) then to_char(p_amount, 'FM999G999G990') else to_char(p_amount, 'FM999G999G990D00') end
$$;

-- The template with the reader's values in it. p_profile null = a sample reader (the team's preview).
create or replace function public.agreement_render(p_body text, p_profile uuid, p_programme uuid default null)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_name text; pr public.vip_programmes; m public.vip_members; v_rate numeric; v_cap numeric; v text := coalesce(p_body, '');
begin
  select coalesce(nullif(btrim(name), ''), 'the Creator') into v_name from public.profiles where id = p_profile;
  select * into m from public.vip_members where profile_id = p_profile;
  select * into pr from public.vip_programmes where id = coalesce(p_programme, m.programme_id);
  if pr.id is null then select * into pr from public.vip_programmes where is_default and active limit 1; end if;
  v_rate := coalesce(m.cpm, pr.cpm);
  v_cap := coalesce(m.monthly_cap, pr.monthly_cap);
  v := replace(v, '{{creator_name}}', coalesce(v_name, '[Creator name]'));
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
end $$;

-- The version a person should have for an audience: their programme's own, else the shared one.
create or replace function public.agreement_for(p_audience text, p_profile uuid)
returns public.agreements
language sql
stable
security definer
set search_path to 'public'
as $$
  select a.* from public.agreements a
   where a.audience = p_audience and a.published_at is not null and a.published_at <= now()
     and (a.programme_id is null
          or a.programme_id = (select programme_id from public.vip_members where profile_id = p_profile and status = 'active'))
   order by (a.programme_id is not null) desc, a.version desc
   limit 1
$$;

drop function if exists public.my_pending_agreements();
create or replace function public.my_pending_agreements()
returns setof public.agreements
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare me record; a public.agreements;
begin
  select p.id, p.status, exists (select 1 from public.vip_members m where m.profile_id = p.id and m.status = 'active') as vip
    into me from public.profiles p where p.id = auth.uid();
  if me.id is null or me.status not in ('active', 'muted', 'pending') then return; end if;
  for a in
    select (public.agreement_for(x, me.id)).* from unnest(case when me.vip then array['creator', 'vip'] else array['creator'] end) x
  loop
    if a.id is not null and not exists (select 1 from public.agreement_acceptances x where x.agreement_id = a.id and x.profile_id = me.id) then
      a.body := public.agreement_render(a.body, me.id);
      return next a;
    end if;
  end loop;
end $$;

-- One agreement as this reader would see it (Settings > Agreements before accepting).
create or replace function public.agreement_for_me(p_agreement uuid)
returns setof public.agreements
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare a public.agreements;
begin
  select * into a from public.agreements where id = p_agreement and (published_at is not null or public.is_admin());
  if a.id is null then return; end if;
  a.body := public.agreement_render(a.body, auth.uid());
  return next a;
end $$;

-- The team's preview: a draft or published version filled in for a market (and optionally a real member).
create or replace function public.agreement_preview(p_agreement uuid, p_programme uuid default null, p_body text default null)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare a public.agreements;
begin
  if not public.is_admin() then raise exception 'Team only.'; end if;
  select * into a from public.agreements where id = p_agreement;
  return public.agreement_render(coalesce(p_body, a.body), null, coalesce(p_programme, a.programme_id));
end $$;

create or replace function public.accept_agreement(p_agreement uuid, p_method text, p_signed_name text default null,
                                                   p_signature_svg text default null, p_locale text default null)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $$
declare a public.agreements; v_headers json; v_ip text; v_ua text; v_at timestamptz; v_text text;
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
  v_text := public.agreement_render(a.body, auth.uid());
  begin
    v_headers := current_setting('request.headers', true)::json;
    v_ip := split_part(coalesce(v_headers->>'x-forwarded-for', v_headers->>'cf-connecting-ip', ''), ',', 1);
    v_ua := left(v_headers->>'user-agent', 400);
  exception when others then v_ip := null; v_ua := null;
  end;
  insert into public.agreement_acceptances (agreement_id, profile_id, method, signed_name, signature_svg, body_sha256,
                                            rendered_body, account_email, ip, user_agent, locale)
  values (a.id, auth.uid(), p_method, nullif(btrim(coalesce(p_signed_name, '')), ''), p_signature_svg,
          encode(extensions.digest(v_text, 'sha256'), 'hex'), v_text,
          (select email from auth.users where id = auth.uid()), nullif(btrim(v_ip), ''), v_ua, p_locale)
  on conflict (agreement_id, profile_id) do nothing
  returning accepted_at into v_at;
  if a.audience = 'vip' then
    update public.vip_members m set terms_accepted_at = now(), terms_version = p.terms_version
      from public.vip_programmes p
     where m.profile_id = auth.uid() and m.status = 'active' and p.id = m.programme_id;
  end if;
  return coalesce(v_at, now());
end $$;

drop function if exists public.my_agreements();
create or replace function public.my_agreements()
returns table(acceptance_id uuid, agreement_id uuid, audience text, version integer, title text, accepted_at timestamptz,
              method text, signed_name text, signature_svg text, body_sha256 text, rendered_body text, is_current boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select x.id, a.id, a.audience, a.version, a.title, x.accepted_at, x.method, x.signed_name, x.signature_svg, x.body_sha256,
         x.rendered_body, (public.agreement_for(a.audience, auth.uid())).id = a.id
    from public.agreement_acceptances x join public.agreements a on a.id = x.agreement_id
   where x.profile_id = auth.uid()
   order by x.accepted_at desc
$$;

create or replace function public.publish_agreement(p_agreement uuid, p_notify boolean default true)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare a public.agreements; v_first boolean;
begin
  if not public.is_global_admin() then raise exception 'Only the Tryp.com team can publish terms.'; end if;
  select * into a from public.agreements where id = p_agreement;
  if a.id is null then raise exception 'No such document.'; end if;
  if a.published_at is not null then return; end if;
  v_first := not exists (select 1 from public.agreements where audience = a.audience and published_at is not null);
  update public.agreements set published_at = now(), effective_at = coalesce(effective_at, now()), updated_at = now() where id = a.id;
  if p_notify and not v_first then
    insert into public.notifications (recipient_id, type, title, body, link)
    select p.id, 'announcement',
           case a.audience when 'vip' then 'We updated the VIP agreement' else 'We updated the community terms' end,
           coalesce(nullif(a.change_note, ''), 'Please read what changed and accept the new version.'), '/agreements'
      from public.profiles p
     where p.status in ('active', 'muted') and not coalesce(p.is_test, false)
       and (public.agreement_for(a.audience, p.id)).id = a.id;
  end if;
end $$;

create or replace function public.agreement_register(p_agreement uuid)
returns table(profile_id uuid, name text, photo_url text, status text, is_vip boolean, accepted_at timestamptz,
              method text, signed_name text, signature_svg text, ip text, user_agent text, account_email text, body_sha256 text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id, p.name, p.photo_url, p.status, p.is_vip, x.accepted_at, x.method, x.signed_name, x.signature_svg, x.ip,
         x.user_agent, x.account_email, x.body_sha256
    from public.agreements a
    join public.profiles p on p.status in ('active', 'muted') and not coalesce(p.is_test, false)
     and (public.agreement_for(a.audience, p.id)).id = a.id
    left join public.agreement_acceptances x on x.agreement_id = a.id and x.profile_id = p.id
   where a.id = p_agreement and public.is_admin()
   order by x.accepted_at desc nulls last, p.name
$$;
