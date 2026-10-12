-- 388: THE COMMUNITY IS 18+ ; AGREEMENTS IN FIVE LANGUAGES ; PARENTS CAN ACTUALLY OPEN THEIR LINK (12 Oct 2026)
--
-- Ethan: limit the community to 18+, except the creators already in it under 18 - for them a parent or guardian
-- fills in a form and approves. Switch on the Community Terms and the VIP agreement (NOT the official creator one
-- yet), signed and tracked, translated into every app language.
--
-- 1. age_exceptions + trg_zz_adults_only: a profile under 18 cannot be created, cannot be given an under-18 date of
--    birth, cannot finish onboarding and cannot be approved - unless it is one of the members already in on 13 Oct 2026.
-- 2. agreement_translations (es/pt/de/ro), locked once the document is published, like the document itself.
--    agreement_render_l renders a translated body (its own sentences for the placeholders that insert prose);
--    agreement_for_me / my_pending_agreements / my_agreements take the reader's locale; accept_agreement records the
--    exact text shown in that language AND the English text it translates (rendered_body_en).
-- 3. guardian_consent_view/confirm go on public_rpc_allowlist: the parent has no account, and lock_down_definer_functions
--    had stripped their anon grant, so every parent link said "This link is not valid".
-- 4. publish_agreement no longer notifies every creator when the VIP agreement goes live - only active VIPs.
-- 5. New English text (18+ clause, language clause) and the four translations of both documents. Publishing is 389.

-- 1. ---------------------------------------------------------------------------------------------------------------
create table if not exists public.age_exceptions (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  reason text not null,
  granted_at timestamptz not null default now()
);
alter table public.age_exceptions enable row level security;
drop policy if exists "age exceptions: team reads" on public.age_exceptions;
create policy "age exceptions: team reads" on public.age_exceptions for select to authenticated using ((select public.is_admin()));

-- The creators who were already approved members aged 16 or 17 on the day the community became 18+.
insert into public.age_exceptions (profile_id, reason)
select p.id, 'Member under 18 on 13 Oct 2026 (born ' || to_char(coalesce(cp.dob, p.dob), 'YYYY-MM-DD') || '); stays with a parent or guardian''s confirmation'
  from public.profiles p left join public.creator_private cp on cp.id = p.id
 where p.status in ('active', 'muted') and p.onboarded
   and coalesce(cp.dob, p.dob) > current_date - interval '18 years'
on conflict do nothing;

create or replace function public.trg_adults_only()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  if v_age is not null and v_age < 18
     and not exists (select 1 from public.age_exceptions x where x.profile_id = new.id) then
    raise exception 'This community is only for creators aged 18 or over.' using errcode = 'P0001';
  end if;
  return new;
end $function$;
drop trigger if exists trg_zz_adults_only on public.profiles;
create trigger trg_zz_adults_only before insert or update on public.profiles
  for each row execute function public.trg_adults_only();

-- 2. ---------------------------------------------------------------------------------------------------------------
create table if not exists public.agreement_translations (
  agreement_id uuid not null references public.agreements(id) on delete cascade,
  locale text not null check (locale in ('es', 'pt', 'de', 'ro')),
  title text not null,
  summary text,
  body text not null,
  updated_at timestamptz not null default now(),
  primary key (agreement_id, locale)
);
alter table public.agreement_translations enable row level security;
drop policy if exists "agreement translations: read published" on public.agreement_translations;
create policy "agreement translations: read published" on public.agreement_translations for select to anon, authenticated
  using (exists (select 1 from public.agreements a where a.id = agreement_id and a.published_at is not null) or (select public.is_admin()));
drop policy if exists "agreement translations: team writes" on public.agreement_translations;
create policy "agreement translations: team writes" on public.agreement_translations for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create or replace function public.trg_agreement_translation_locked()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if exists (select 1 from public.agreements a where a.id = coalesce(new.agreement_id, old.agreement_id) and a.published_at is not null) then
    raise exception 'A published document cannot be changed. Make a new version.';
  end if;
  return coalesce(new, old);
end $function$;
drop trigger if exists trg_agreement_translation_locked on public.agreement_translations;
create trigger trg_agreement_translation_locked before insert or update or delete on public.agreement_translations
  for each row execute function public.trg_agreement_translation_locked();

alter table public.agreement_acceptances add column if not exists rendered_body_en text;

-- The language a document is shown in: the reader's, if it has been translated, otherwise English.
create or replace function public.agreement_lang(p_agreement uuid, p_locale text)
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case when exists (select 1 from public.agreement_translations t where t.agreement_id = p_agreement and t.locale = p_locale)
              then p_locale else 'en' end
$function$;

-- The document with its title, summary and body in that language (the rest of the row untouched).
create or replace function public.agreement_localize(p_doc public.agreements, p_locale text)
 returns public.agreements
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare t public.agreement_translations;
begin
  select * into t from public.agreement_translations where agreement_id = p_doc.id and locale = p_locale;
  if t.agreement_id is not null then
    p_doc.title := t.title; p_doc.summary := coalesce(t.summary, p_doc.summary); p_doc.body := t.body;
  end if;
  return p_doc;
end $function$;

-- Places in the reader's language (market names are English in `communities`).
create or replace function public.agreement_place(p_name text, p_locale text)
 returns text
 language sql
 immutable
 set search_path to 'public'
as $function$
  select coalesce((
    select x.v from (values
      ('es','Spain','España'),('es','Germany','Alemania'),('es','Romania','Rumanía'),('es','Nordics','Países nórdicos'),('es','UK & Ireland','Reino Unido e Irlanda'),('es','Worldwide','Mundial'),
      ('pt','Spain','Espanha'),('pt','Germany','Alemanha'),('pt','Romania','Roménia'),('pt','Nordics','Países nórdicos'),('pt','UK & Ireland','Reino Unido e Irlanda'),('pt','Worldwide','Mundial'),
      ('de','Spain','Spanien'),('de','Germany','Deutschland'),('de','Romania','Rumänien'),('de','Nordics','Nordische Länder'),('de','UK & Ireland','Großbritannien und Irland'),('de','Worldwide','Weltweit'),
      ('ro','Spain','Spania'),('ro','Portugal','Portugalia'),('ro','Germany','Germania'),('ro','Romania','România'),('ro','Nordics','Țările nordice'),('ro','UK & Ireland','Regatul Unit și Irlanda'),('ro','Worldwide','Mondial')
    ) x(l, k, v) where x.l = p_locale and x.k = p_name), p_name)
$function$;

-- agreement_render for a translated body: fills the placeholders that insert whole sentences, dates and place names
-- in the reader's language first, then hands the rest (names, rates, money) to agreement_render. English = unchanged.
create or replace function public.agreement_render_l(p_body text, p_profile uuid, p_programme uuid default null, p_locale text default 'en')
 returns text
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v text := coalesce(p_body, ''); m public.vip_members; pr public.vip_programmes; v_cap numeric; v_market text; v_name text;
  v_and text; v_today text; v_d timestamp := now() at time zone 'Europe/Copenhagen'; v_prog text; k record; v_views text; v_capt text;
  v_months text[];
begin
  if coalesce(p_locale, 'en') not in ('es', 'pt', 'de', 'ro') then
    return public.agreement_render(p_body, p_profile, p_programme);
  end if;
  select * into m from public.vip_members where profile_id = p_profile;
  select * into pr from public.vip_programmes where id = coalesce(p_programme, m.programme_id);
  if pr.id is null then select * into pr from public.vip_programmes where is_default and active and kind = 'vip' limit 1; end if;
  v_cap := coalesce(m.monthly_cap, pr.monthly_cap);
  v_capt := replace(public.agreement_money(v_cap, pr.currency), ',', '.');
  v_views := replace(to_char(pr.req_single_views, 'FM999G999G990'), ',', '.');
  v_and := case p_locale when 'es' then ' y ' when 'pt' then ' e ' when 'de' then ' und ' else ' și ' end;
  v_months := case p_locale
    when 'es' then array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
    when 'pt' then array['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
    when 'de' then array['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
    else array['ianuarie','februarie','martie','aprilie','mai','iunie','iulie','august','septembrie','octombrie','noiembrie','decembrie'] end;
  v_today := case p_locale
    when 'de' then extract(day from v_d)::int || '. ' || v_months[extract(month from v_d)::int] || ' ' || extract(year from v_d)::int
    when 'ro' then extract(day from v_d)::int || ' ' || v_months[extract(month from v_d)::int] || ' ' || extract(year from v_d)::int
    else extract(day from v_d)::int || ' de ' || v_months[extract(month from v_d)::int] || ' de ' || extract(year from v_d)::int end;

  select nullif(btrim(name), '') into v_name from public.profiles where id = p_profile;
  if v_name is null then
    v := replace(v, '{{creator_name}}', case when p_profile is null then
           case p_locale when 'es' then '[Nombre del creador]' when 'pt' then '[Nome do criador]' when 'de' then '[Name des Creators]' else '[Numele creatorului]' end
         else case p_locale when 'es' then 'el Creador' when 'pt' then 'o Criador' when 'de' then 'der Creator' else 'Creatorul' end end);
  end if;

  select regexp_replace(string_agg(public.agreement_place(c.name, p_locale), ', ' order by c.name), ', ([^,]+)$', v_and || '\1') into v_market
    from public.community_members cm join public.communities c on c.id = cm.community_id
   where cm.profile_id = p_profile and c.slug <> 'worldwide' and c.retired_at is null and cm.status = 'active' and cm.role = 'creator';
  v := replace(v, '{{creator_market}}', coalesce(v_market, case when p_profile is null
         then case p_locale when 'es' then '[su mercado]' when 'pt' then '[o seu mercado]' when 'de' then '[sein Markt]' else '[piața sa]' end
         else public.agreement_place('Worldwide', p_locale) end));

  v_prog := pr.name;
  if v_prog is not null then
    for k in select x.n from (values ('Spain'),('Portugal'),('Germany'),('Romania'),('Nordics'),('UK & Ireland'),('Worldwide')) x(n) loop
      v_prog := replace(v_prog, k.n, public.agreement_place(k.n, p_locale));
    end loop;
  end if;
  v := replace(v, '{{market}}', coalesce(v_prog, case p_locale when 'es' then 'tu mercado VIP' when 'pt' then 'o teu mercado VIP' when 'de' then 'deinem VIP-Markt' else 'piața ta VIP' end));

  v := replace(v, '{{payment_cap}}', case
    when v_cap is not null then case p_locale
      when 'es' then 'Los pagos de este Acuerdo tienen un límite de ' || v_capt || ' por periodo mensual. Si lo superas, Tryp.com puede, a su criterio, hablar contigo de una compensación adicional, como una cuota mensual fija o una colaboración más larga.'
      when 'pt' then 'Os pagamentos ao abrigo deste Acordo têm um limite de ' || v_capt || ' por período mensal. Se o ultrapassares, a Tryp.com pode, a seu critério, falar contigo sobre uma compensação adicional, como uma avença mensal ou uma colaboração mais longa.'
      when 'de' then 'Zahlungen aus dieser Vereinbarung sind auf ' || v_capt || ' pro Monatszeitraum begrenzt. Gehst du darüber hinaus, kann Tryp.com nach eigenem Ermessen mit dir über eine zusätzliche Vergütung sprechen, etwa eine monatliche Pauschale oder eine längere Zusammenarbeit.'
      else 'Plățile din acest Acord sunt plafonate la ' || v_capt || ' pe perioadă lunară. Dacă depășești plafonul, Tryp.com poate, la latitudinea sa, să discute cu tine o compensație suplimentară, cum ar fi o sumă lunară fixă sau o colaborare mai lungă.' end
    else case p_locale
      when 'es' then 'Tu mercado no tiene ahora un límite mensual de pago. Tryp.com puede introducir uno para meses futuros con al menos 14 días de aviso.'
      when 'pt' then 'O teu mercado não tem, de momento, limite mensal de pagamento. A Tryp.com pode introduzir um para meses futuros com pelo menos 14 dias de aviso.'
      when 'de' then 'Für deinen Markt gibt es derzeit keine monatliche Zahlungsobergrenze. Tryp.com kann für künftige Monate mit mindestens 14 Tagen Vorankündigung eine einführen.'
      else 'Piața ta nu are în prezent un plafon lunar de plată. Tryp.com poate introduce unul pentru lunile viitoare cu o notificare de cel puțin 14 zile.' end end);

  v := replace(v, '{{stay_in}}', case
    when coalesce(pr.req_on, false) then case p_locale
      when 'es' then 'Para seguir en el grupo VIP, cada mes natural debes publicar al menos ' || pr.req_videos || ' vídeos elegibles, o tener al menos un vídeo elegible que llegue a ' || v_views || ' visualizaciones. Los creadores que no lo cumplan pueden salir del grupo VIP.'
      when 'pt' then 'Para continuares no grupo VIP, em cada mês civil tens de publicar pelo menos ' || pr.req_videos || ' vídeos elegíveis, ou ter pelo menos um vídeo elegível que chegue a ' || v_views || ' visualizações. Os criadores que não cumpram isto podem sair do grupo VIP.'
      when 'de' then 'Um in der VIP-Gruppe zu bleiben, musst du in jedem Kalendermonat entweder mindestens ' || pr.req_videos || ' berechtigte Videos veröffentlichen oder mindestens ein berechtigtes Video haben, das ' || v_views || ' Aufrufe erreicht. Creator, die das nicht erfüllen, können aus der VIP-Gruppe genommen werden.'
      else 'Pentru a rămâne în grupul VIP, în fiecare lună calendaristică trebuie fie să publici cel puțin ' || pr.req_videos || ' videoclipuri eligibile, fie să ai cel puțin un videoclip eligibil care ajunge la ' || v_views || ' de vizualizări. Creatorii care nu îndeplinesc această condiție pot fi scoși din grupul VIP.' end
    else case p_locale
      when 'es' then 'Tu mercado no tiene ahora un mínimo de publicaciones. Tryp.com puede introducir uno para meses futuros con al menos 14 días de aviso.'
      when 'pt' then 'O teu mercado não tem, de momento, um mínimo de publicações. A Tryp.com pode introduzir um para meses futuros com pelo menos 14 dias de aviso.'
      when 'de' then 'Für deinen Markt gibt es derzeit keine Mindestanzahl an Beiträgen. Tryp.com kann für künftige Monate mit mindestens 14 Tagen Vorankündigung eine einführen.'
      else 'Piața ta nu are în prezent un număr minim de postări. Tryp.com poate introduce unul pentru lunile viitoare cu o notificare de cel puțin 14 zile.' end end);

  v := replace(v, '{{start_date}}', v_today || case p_locale when 'es' then ' (la fecha de firma de este Acuerdo)' when 'pt' then ' (a data de assinatura deste Acordo)'
         when 'de' then ' (das Datum der Unterzeichnung dieser Vereinbarung)' else ' (data semnării acestui Acord)' end);
  v := replace(v, '{{today}}', v_today);
  return public.agreement_render(v, p_profile, p_programme);
end $function$;

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
end $function$
;

drop function if exists public.agreement_for_me(uuid);
CREATE OR REPLACE FUNCTION public.agreement_for_me(p_agreement uuid, p_locale text DEFAULT NULL::text)
 RETURNS SETOF agreements
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a public.agreements; v_lang text;
begin
  select * into a from public.agreements where id = p_agreement and (published_at is not null or public.is_admin());
  if a.id is null then return; end if;
  v_lang := public.agreement_lang(a.id, p_locale);
  a := public.agreement_localize(a, v_lang);
  a.body := public.agreement_render_l(a.body, auth.uid(), null, v_lang);
  a.summary := public.agreement_render_l(a.summary, auth.uid(), null, v_lang);
  return next a;
end $function$
;

drop function if exists public.my_pending_agreements();
CREATE OR REPLACE FUNCTION public.my_pending_agreements(p_locale text DEFAULT NULL::text)
 RETURNS SETOF agreements
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me record; a public.agreements; v_lang text;
begin
  select p.id, p.status, exists (select 1 from public.vip_members m where m.profile_id = p.id and m.status = 'active') as vip
    into me from public.profiles p where p.id = auth.uid();
  if me.id is null or me.status not in ('active', 'muted', 'pending') then return; end if;
  for a in
    select (public.agreement_for(x, me.id)).* from unnest(case when me.vip then array['creator', 'vip'] else array['creator'] end) x
  loop
    if a.id is not null and not exists (select 1 from public.agreement_acceptances x where x.agreement_id = a.id and x.profile_id = me.id) then
      v_lang := public.agreement_lang(a.id, p_locale);
      a := public.agreement_localize(a, v_lang);
      a.body := public.agreement_render_l(a.body, me.id, null, v_lang);
      a.summary := public.agreement_render_l(a.summary, me.id, null, v_lang);
      return next a;
    end if;
  end loop;
end $function$
;

drop function if exists public.my_agreements();
CREATE OR REPLACE FUNCTION public.my_agreements(p_locale text DEFAULT NULL::text)
 RETURNS TABLE(acceptance_id uuid, agreement_id uuid, audience text, version integer, title text, accepted_at timestamp with time zone, method text, signed_name text, signature_svg text, body_sha256 text, rendered_body text, is_current boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select x.id, a.id, a.audience, a.version, coalesce((select t.title from public.agreement_translations t where t.agreement_id = a.id and t.locale = p_locale), a.title), x.accepted_at, x.method, x.signed_name, x.signature_svg, x.body_sha256,
         x.rendered_body, (public.agreement_for(a.audience, auth.uid())).id = a.id
    from public.agreement_acceptances x join public.agreements a on a.id = x.agreement_id
   where x.profile_id = auth.uid()
   order by x.accepted_at desc
$function$
;

CREATE OR REPLACE FUNCTION public.guardian_consent_view(p_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
           'creator', split_part(coalesce(nullif(btrim(p.name), ''), 'Your child'), ' ', 1),
           'guardian_name', x.guardian_name,
           'title', (public.agreement_localize(a, coalesce(x.locale, 'en'))).title,
           'summary', public.agreement_render_l((public.agreement_localize(a, coalesce(x.locale, 'en'))).summary, x.profile_id, a.programme_id, x.locale),
           'locale', coalesce(x.locale, 'en'), 'body', x.rendered_body,
           'accepted_at', x.accepted_at, 'confirmed_at', g.confirmed_at, 'confirmed_name', g.confirmed_name)
    from public.guardian_consents g
    join public.agreement_acceptances x on x.id = g.acceptance_id
    join public.agreements a on a.id = x.agreement_id
    join public.profiles p on p.id = x.profile_id
   where length(coalesce(p_token, '')) = 48 and g.token = p_token
$function$
;

CREATE OR REPLACE FUNCTION public.publish_agreement(p_agreement uuid, p_notify boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a public.agreements; v_first boolean;
begin
  if not public.is_global_admin() then raise exception 'Only the Tryp.com team can publish terms.'; end if;
  select * into a from public.agreements where id = p_agreement;
  if a.id is null then raise exception 'No such document.'; end if;
  if a.published_at is not null then return; end if;
  v_first := not exists (select 1 from public.agreements where audience = a.audience and programme_id is not distinct from a.programme_id and published_at is not null);
  update public.agreements set published_at = now(), effective_at = coalesce(effective_at, now()), updated_at = now() where id = a.id;
  if p_notify then
    insert into public.notifications (recipient_id, type, title, body, link)
    select p.id, 'announcement',
           case when v_first then 'Please sign: ' || a.title else 'We updated the ' || a.title end,
           coalesce(nullif(a.change_note, ''), case when v_first then 'Read it and sign it in the app. A copy stays in Settings, Agreements.' else 'Please read what changed and accept the new version.' end),
           '/agreements'
      from public.profiles p
     where p.status in ('active', 'muted') and not coalesce(p.is_test, false)
       and (public.agreement_for(a.audience, p.id)).id = a.id
       and (not v_first or a.audience = 'vip')
       -- 388: agreement_for('vip', ...) answers for anybody who is not an official creator; only VIPs are asked to sign.
       and (a.audience <> 'vip' or exists (select 1 from public.vip_members m where m.profile_id = p.id and m.status = 'active'));
  end if;
end $function$
;

-- 5. The English text (drafts, so still editable) and the four translations ------------------------------------------
update public.agreements set body = $txt$# Tryp.com Creator Community Terms

**Between:** **Tryp.com ApS**, CVR 42533165, Drewsensvej 3, st. th, 5000 Odense C, Denmark ("Tryp.com", "we", "us"),

**and:** **{{creator_name}}**, a member of the Tryp.com Creator Community (**{{creator_market}}**) ("you").

These terms are the agreement between you and Tryp.com for taking part in the Tryp.com Creator Community ("the Community"). The Community is free to join and free to take part in. Please read them; the summary below is there to help, but the numbered sections are what counts.

> **In short.** Entry is always free and winners are decided by published numbers, never by chance. You keep owning your videos and let us reuse them in our marketing, with credit where we can. Anything you post for Tryp.com is an ad and must say so. Be kind, be honest, and keep your payment details up to date. Questions go to ethan@tryp.com.

## 1. Who can join

- **Age.** The Community is for people aged **18 and over**, and by accepting these terms you confirm that you are. The only exception is a creator who was already an approved member on 13 October 2026 while aged 16 or 17: they may stay, but only with the agreement of a parent or legal guardian, who confirms these terms for them on a link we provide (we record their name, email and confirmation). That parent or guardian can withdraw their agreement at any time by emailing ethan@tryp.com, and we may hold back rewards for that creator until the confirmation is in. The VIP programme and any paid contract are for people aged 18 and over only. If we find that someone else under 18 has an account, we close it.
- **One person, one account.** Your profile must be about you and accurate, including your date of birth and country. Do not share your login.
- **Approval.** The Tryp.com team reviews each application and may approve or decline it.
- **No employment.** Taking part does not make you our employee, agent or partner, and you are free to work with other brands except as section 5 says.

## 2. How challenges work

- **Entry is free.** No challenge ever asks for a payment or a purchase.
- **Winners are decided by a stated, objective measure**, such as views or points, under the rules published on that challenge. Nothing is decided by chance or by a draw.
- **Each challenge's brief is part of these terms for that challenge**: its dates, market, platforms, points, bonuses, boosts, groups, prize places and rewards. If a brief and these terms differ, the brief wins for that challenge.
- **Entries must be your own original work**, made for the brief, posted publicly on an allowed platform during the challenge, and left up until results are published. Videos posted before a challenge starts do not count, and one video counts in one challenge.
- **Tryp.com has to be in the video itself**: said, shown on screen, or shown on the app or site. A mention only in the caption, comments or hashtags does not count.
- **Views and points are read automatically** from each platform's public counts. Leaderboards are provisional until results are published, and we may correct a figure that is plainly wrong.
- **Fair play.** Bought, automated or fake views, likes or comments, engagement groups, or misleading us about where or when a video was posted, disqualify an entry. Where we have reasonable grounds we may exclude an entry or withhold a reward, and we will tell you why (section 8).

## 3. Rewards, payment and tax

- **Cash prizes** are paid by bank transfer against an invoice we prepare for you from the payment details you save (self-billing), normally within 30 days of results being published. You must keep those details correct; we cannot recover money sent to an account you gave us.
- **Tryp.com vouchers** are for booking on Tryp.com, are personal to you, cannot be exchanged for cash, and carry any expiry shown when they are awarded.
- **Tax is your responsibility.** We do not withhold tax and cannot give tax advice. If you are under 18, your parent or guardian should know about any prize you receive.
- **We may change or end a challenge or a reward.** If we end a running challenge early, we honour rewards already earned under it.

## 4. Telling people it is an ad

Anything you post for Tryp.com, or for which you receive or expect anything of value from us (cash, a voucher, points towards a prize), is advertising and must be clearly labelled:

- Put **#ad**, **Ad** or **Advertisement** at the start of the caption or on screen in the first seconds. A platform's "Paid partnership" label is welcome but not enough on its own.
- Follow the advertising rules where your audience is: in the UK the CAP Code and the CMA's guidance on endorsements; in the EU the Unfair Commercial Practices Directive and your own country's rules for influencers.
- Only say what is true about Tryp.com and your own experience, and check any price or deal on Tryp.com on the day you post.

If we ask you to fix a label on a live post, please do it promptly. An entry that is not properly labelled may be excluded.

## 5. Brand safety

- Do not post content for Tryp.com that is illegal, hateful, sexual, violent, dangerous, or that mocks or misleads people.
- Do not show prices, deals or availability you have not checked on Tryp.com on the day you post.
- Do not post paid content for Tryp.com and a direct competitor (another online travel agency or travel booking site) in the same video.

## 6. Your content, and how we may use it

**You keep ownership** of everything you create.

By entering a video in a challenge, adding it anywhere in the Community, or otherwise sharing it with us, you give Tryp.com and its group companies a **worldwide, non-exclusive, royalty-free licence**, which continues after you leave, to:

- show it inside the Community, including on leaderboards, recaps and the Video Ideas page;
- **reuse it in Tryp.com marketing**: our website, app, emails, social media accounts and paid advertising (including running it as an ad from our accounts, or from yours where the platform allows and you have given access);
- edit it for those uses (cut, resize, subtitle, translate, add music or our branding), as long as we do not change its meaning or put words in your mouth;
- credit you with your name, handle and profile picture alongside it.

We do not have to use your content, and we credit you where it is reasonably practical. If you want a video kept out of **future** marketing, email ethan@tryp.com and we will act on reasonable requests; adverts already bought may run to the end of their booking.

You confirm that the content is yours to share, that everyone recognisable in it agreed to appear (with a parent or guardian's agreement for anyone under 18), and that any music, footage or other material in it is licensed for this use.

## 7. Being part of the Community

Rooms, direct messages and the board are shared spaces. Be respectful. Do not post anything illegal, hateful, harassing, sexual, deceptive or infringing; do not spam or pressure other members; do not share other members' personal information outside the Community; do not try to access accounts or data that are not yours; and do not impersonate anyone.

Every message has a **Report** button. Reports reach the team straight away; we review them and tell both sides what we decided.

## 8. If something goes wrong

Where content or an account breaks these terms or the law, we may remove content, exclude an entry, limit or suspend an account, or close it. **We will tell you what we did and why**, and you can ask a person to review it by replying or emailing ethan@tryp.com. This is our statement of reasons and complaints process under the EU Digital Services Act.

## 9. The VIP programme

Some creators aged 18 and over are invited into the VIP programme, which is paid by views rather than by challenges. VIP creators also sign the separate **VIP Creator Collaboration Agreement**, and official Tryp.com content creators sign the **Official Content Creator Agreement**; each takes priority over these terms where the two differ.

## 10. Your data

How we use your personal data is set out in our Privacy Policy (in the app under Settings, and at /privacy). When you accept these terms we keep a record of the version, the exact text, the time, your account and the device details (and, if you are under 18, your parent or guardian's name and email), so either of us can show what was agreed.

## 11. Other platforms

Instagram, TikTok, YouTube and Facebook have their own terms, including rules on branded content, and you must follow them. None of them sponsors or is connected with the Community.

## 12. Leaving

You can delete your account at any time from Settings; it is removed after a 30 day grace period. We may close an account that breaks these terms, as section 8 explains. Rewards already earned and not yet paid are still paid, unless they were earned by breaking these terms.

## 13. Liability

The Community is provided as it is, without a promise that it will always be available or free of faults. To the extent the law allows, we are not liable for indirect loss, lost earnings or followers, or anything a social platform does to your account. Nothing here limits liability that cannot be limited by law, or removes rights you have as a consumer where you live.

## 14. Changes to these terms

We may update these terms. When we do, you will be told in the app, shown what changed, and asked to accept the new version before carrying on. Every version you accepted stays available in **Settings > Agreements**.

## 15. Law and disputes

These terms are governed by Danish law and the courts of Denmark. If you live elsewhere in the EU or in the UK, you keep the protection of your own country's mandatory consumer law and may bring proceedings there. Please talk to us first: most things are sorted out with one message.

## 16. Language

These terms are written in English. If you read them in another language in the app, that translation has the same meaning; if the two ever differ, the English version applies, unless the law where you live says otherwise.

## 17. Contact

Tryp.com ApS, Drewsensvej 3, st. th, 5000 Odense C, Denmark. Email **ethan@tryp.com**, or message the Tryp.com team in the app.

---

Accepted in the app by **{{creator_name}}** on {{today}}.$txt$, summary = $txt$Hi {{creator_name}}. These are the rules of the Tryp.com Creator Community: how challenges and rewards work, how to label your posts as ads, how we may use the videos you share, and how to reach us. The Community is for creators aged 18 and over.$txt$, updated_at = now() where id = 'ba59ca85-d630-4fd0-bea9-c58c243d5132' and published_at is null;
update public.agreements set body = $txt$
# VIP Creator Collaboration Agreement

**Between:** **Tryp.com ApS**, CVR 42533165, registered address Drewsensvej 3, st. th, 5000 Odense C, Denmark, represented by **Francesco Lopalco**, Head of Growth (hereinafter "Tryp.com"),

**and:** **{{creator_name}}** (hereinafter "the Creator").

Both parties agree as follows.

**Eligibility.** The Creator confirms they are at least 18 years old and free to enter into this Agreement.

## 1. Purpose

This Agreement sets out the terms of the Creator's participation in the Tryp.com VIP programme in **{{market}}**: creating and publishing original short-form content on social media (mainly TikTok and Instagram, also YouTube Shorts and Facebook) that promotes Tryp.com's services creatively and authentically, and being paid for the views that content earns.

## 2. Duration and renewal

- This Agreement starts on the date it is signed and **renews automatically month to month**, without a new signature from either party.
- Renewal depends on the Creator continuing to meet the requirements in clause 8.
- Tryp.com may end the Creator's participation in future months if (a) the Creator does not meet clause 8, or (b) Tryp.com decides not to continue the collaboration for operational or strategic reasons. Tryp.com will give reasonable written notice (by email, a direct message or in the app).
- **2.1 Termination by either party.** Either party may end this Agreement for any reason by giving **fourteen (14) days' written notice** before the end of the current calendar month.

## 3. Compensation

- **3.1** The Creator earns **{{rate}} per 1,000 verified views** on eligible content, counted as set out in clause 7.
- **3.2** Earnings are worked out from verified views and shown, with how they were calculated, on the Creator's VIP page.
- **3.3 Eligible content.** Only content that clearly and explicitly features Tryp.com **within the video itself** is eligible: a visible and/or spoken mention of Tryp.com (for example a spoken reference, on-screen text, a demonstration of the platform, or visual branding). Tagging Tryp.com only in the caption, description, comments or hashtags is **not** enough. Content that is purely inspirational, unrelated to Tryp.com's services, or does not visibly include the brand in the video is not eligible, whatever its views. Tryp.com decides, acting reasonably, whether content is eligible.
- **3.4 Bonuses and challenges.** Tryp.com may run bonuses and challenges for VIP creators (for example prizes for the most views, or a voucher for the best video on a theme). Their rules are published on the Creator's VIP page and paid on top of 3.1. Where a challenge asks a question about a video (for example whether it features a hotel and a flight), the Creator answers it truthfully, and Tryp.com decides, acting reasonably, whether a video fits. A voucher is for booking on Tryp.com, is personal and cannot be exchanged for cash.

## 4. VIP programme benefits

- Regular content feedback and strategic guidance, through group sessions and/or one-to-one check-ins by chat, written feedback, voice notes or video calls, at Tryp.com's discretion.
- A direct line to Tryp.com's marketing team, including the private VIP rooms.
- The chance to be considered for future paid collaborations or creator roles.
- The possibility of collaborative posts with Tryp.com on Instagram, subject to Tryp.com's approval.
- Priority inclusion in future campaigns for {{market}}.

## 5. Intellectual property and use of content

- **5.1 Ownership.** All content the Creator makes under this Agreement ("Content") remains the Creator's intellectual property.
- **5.2 Licence to Tryp.com.** The Creator grants Tryp.com and its group companies a **non-exclusive, royalty-free, worldwide, perpetual licence** to use the Content, and the Creator's name, image, likeness and voice as they appear in it, to: share and repost it on Tryp.com's website, app, emails and social media channels; run it as paid advertising, from Tryp.com's accounts or, where the platform allows and the Creator has given access, from the Creator's (for example TikTok Spark Ads or Instagram partnership ads); edit it for those uses (cut, resize, subtitle, translate, add music or branding) without changing its meaning; and show it inside the Tryp.com creator platform. Tryp.com will credit the Creator where reasonably practical and is not obliged to use any Content.
- **5.3 Content exclusivity.** (a) For **twelve (12) months** after it is published, the Creator will not license, sell or reuse the specific Content made for Tryp.com with any other commercial brand, especially in travel or tourism. (b) During this Agreement and for twelve (12) months after it ends, the Creator will not use, replicate or license the exact content format, visual style or template, or specific video concept developed under this collaboration for another commercial brand or sponsor. General editing techniques and broad industry trends are not restricted.
- **5.4** The Creator confirms they own or have licensed everything in the Content (including music and footage) and that everyone in it agreed to appear. If the Creator asks, Tryp.com will stop using a piece of Content in future marketing on reasonable request; material already published or booked may continue to run.

## 6. Competitors

While this Agreement lasts, the Creator will not post sponsored or paid content for **direct competitors** of Tryp.com (online travel agencies and travel booking sites, such as Booking.com, Expedia, Skyscanner, Kiwi.com, eDreams or Trip.com) without Tryp.com's written approval. Other brands are fine, as long as they do not appear in the same video as Tryp.com.

## 7. Payment and view tracking

- **7.1 Adding videos.** The Creator adds every eligible video to their VIP page on the Tryp.com creator platform, with its public link, as soon as it is posted. Views are then read automatically from each platform's public count, at least daily and with a final reading at the end of each month. Tryp.com may ask for screenshots or screen recordings of the native analytics to verify a count.
- **7.2 Monthly periods.** Each period runs from the first day of the month at 00:00 to the last day at 23:59 (in your market's time zone). **Only views gained within the period are paid for that period**, on videos posted within the previous {{window_days}} days. Views gained after a period ends are not paid for it and are not carried over.
- **7.3 Verification.** Tryp.com verifies all views and eligibility (clause 3.3). Tryp.com's verified numbers are final for payment. Views that are fraudulent, purchased or artificially inflated (including bots or engagement pods) make that content ineligible for payment.
- **7.4 Balance and minimum payout.** Monthly earnings are added to the Creator's VIP balance. Cash is paid once the balance reaches **{{min_payout}}**; below that it rolls over month to month. The Creator may instead take the balance as a **Tryp.com travel voucher** at any time once it reaches {{voucher_min}}.
- **7.5 Payment cap.** {{payment_cap}}
- **7.6 Invoices and payment.** Tryp.com prepares the invoice for each cash payout from the payment details the Creator saves on the platform (self-billing), and the Creator will not issue a separate invoice for the same amount. Payment is made by bank transfer within **30 days** of a payout being approved, provided the details are complete and correct.
- **7.7 Tax.** The Creator is an independent contractor and is responsible for declaring and paying all taxes and social contributions on what they earn, in their own country.
- **7.8 Changes.** Tryp.com may change the rate, cap or minimums for future months with at least 14 days' notice in the app. Earnings already made are never reduced.

## 8. Performance requirements

{{stay_in}}

## 9. Disclosure

Every video must be clearly labelled as advertising (**#ad**, **Ad** or **Advertisement**, at the start of the caption or on screen), following the rules where the audience is and the Tryp.com Creator Community Terms.

## 10. Confidentiality

The Creator will not disclose confidential information shared by Tryp.com during or after this Agreement, including rates, statements, marketing strategies, briefs before launch, internal communications and campaign data. This does not stop the Creator saying they work with Tryp.com.

## 11. Code of conduct and brand protection

Tryp.com may immediately suspend or end the Creator's participation, with or without prior notice, if the Creator behaves in a way that is inappropriate, unprofessional, harmful or inconsistent with the values, reputation or community standards of Tryp.com. This includes disrespectful, abusive or discriminatory conduct; actions or conflicts that harm other creators or the community; conduct that may damage Tryp.com's brand, reputation or business; and any breach of community guidelines, ethical standards or platform policies. Earnings already verified are paid unless they came from a serious breach.

## 12. Independent contractor

The Creator works independently and is not an employee, agent or partner of Tryp.com. The Creator decides how, when and where to make their content and may work with other brands, subject to clauses 5.3 and 6.

## 13. Data

Tryp.com uses the Creator's personal data to run the programme and pay them, as set out in the Privacy Policy. When the Creator signs, Tryp.com keeps a record of the exact text signed, the time, the account and email, the signature, and the device and network details, so both parties can show what was agreed.

## 14. Governing law and jurisdiction

This Agreement is governed by the laws of **Denmark**, and disputes are subject to the jurisdiction of the competent courts of Denmark, without removing any mandatory protection the Creator has under the law of the country where they live.

## 15. Entire agreement and signature

- This Agreement, the Tryp.com Creator Community Terms and the details on the Creator's VIP page are the whole agreement about the VIP programme and replace any earlier VIP agreement between the parties. Where they differ, this Agreement wins.
- Tryp.com may update this Agreement; the Creator will be asked to read and sign the new version in the app, and may end the Agreement under clause 2.1 instead.
- The parties sign electronically. The Creator's typed name or drawn signature, given from their signed-in account, has the same effect as a handwritten signature (EU Regulation 910/2014, eIDAS).
- This Agreement is written in English. If the Creator reads and signs it in another language in the app, that translation has the same meaning; if the two ever differ, the English version applies, unless mandatory law where the Creator lives says otherwise. Tryp.com keeps a copy of both.

---

**For Tryp.com ApS:** Francesco Lopalco, Head of Growth

**The Creator:** {{creator_name}}, signing below on {{today}}$txt$, updated_at = now() where id = 'c9705ec2-c818-4d59-9f87-1635505bab65' and published_at is null;
insert into public.agreement_translations (agreement_id, locale, title, summary, body) values ('ba59ca85-d630-4fd0-bea9-c58c243d5132', 'es', $txt$Condiciones de la Comunidad$txt$, $txt$Hola, {{creator_name}}. Estas son las normas de la Comunidad de Creadores de Tryp.com: cómo funcionan los retos y los premios, cómo indicar que tus publicaciones son publicidad, cómo podemos usar los vídeos que compartes y cómo contactarnos. La Comunidad es para creadores de 18 años o más.$txt$, $txt$# Condiciones de la Comunidad de Creadores de Tryp.com

**Entre:** **Tryp.com ApS**, CVR 42533165, Drewsensvej 3, st. th, 5000 Odense C, Dinamarca ("Tryp.com", "nosotros"),

**y:** **{{creator_name}}**, miembro de la Comunidad de Creadores de Tryp.com (**{{creator_market}}**) ("tú").

Estas condiciones son el acuerdo entre tú y Tryp.com para participar en la Comunidad de Creadores de Tryp.com ("la Comunidad"). Unirse a la Comunidad y participar en ella es gratis. Léelas, por favor; el resumen de abajo está para ayudarte, pero lo que cuenta son los apartados numerados.

> **En pocas palabras.** Participar siempre es gratis y los ganadores se deciden por números publicados, nunca por azar. Tus vídeos siguen siendo tuyos y nos dejas reutilizarlos en nuestro marketing, mencionándote cuando podamos. Todo lo que publicas para Tryp.com es publicidad y debe indicarlo. Sé amable, sé honesto y mantén al día tus datos de pago. Las dudas, a ethan@tryp.com.

## 1. Quién puede unirse

- **Edad.** La Comunidad es para personas de **18 años o más**, y al aceptar estas condiciones confirmas que los tienes. La única excepción es quien ya era miembro aprobado el 13 de octubre de 2026 con 16 o 17 años: puede seguir, pero solo con el acuerdo de su madre, padre o tutor legal, que confirma estas condiciones por él o ella en un enlace que facilitamos (guardamos su nombre, su email y su confirmación). Esa madre, padre o tutor puede retirar su acuerdo en cualquier momento escribiendo a ethan@tryp.com, y podemos retener los premios de ese creador hasta tener la confirmación. El programa VIP y cualquier contrato remunerado son solo para mayores de 18 años. Si descubrimos que otra persona menor de 18 tiene una cuenta, la cerramos.
- **Una persona, una cuenta.** Tu perfil debe ser sobre ti y ser correcto, incluida tu fecha de nacimiento y tu país. No compartas tu acceso.
- **Aprobación.** El equipo de Tryp.com revisa cada solicitud y puede aprobarla o rechazarla.
- **No es un empleo.** Participar no te convierte en empleado, agente ni socio nuestro, y puedes trabajar con otras marcas salvo lo que dice el apartado 5.

## 2. Cómo funcionan los retos

- **Participar es gratis.** Ningún reto pide nunca un pago ni una compra.
- **Los ganadores se deciden con una medida objetiva y publicada**, como visualizaciones o puntos, según las reglas publicadas en cada reto. Nada se decide por azar ni por sorteo.
- **Las bases de cada reto forman parte de estas condiciones para ese reto**: sus fechas, mercado, plataformas, puntos, bonus, impulsos, grupos, puestos y premios. Si las bases y estas condiciones no coinciden, para ese reto mandan las bases.
- **Los vídeos que presentes deben ser obra tuya y original**, hechos para las bases, publicados de forma pública en una plataforma permitida durante el reto y mantenidos hasta que se publiquen los resultados. Los vídeos publicados antes de que empiece un reto no cuentan, y un vídeo cuenta en un solo reto.
- **Tryp.com tiene que aparecer en el propio vídeo**: dicho, mostrado en pantalla o mostrando la app o la web. Una mención solo en el texto, los comentarios o los hashtags no cuenta.
- **Las visualizaciones y los puntos se leen automáticamente** de los contadores públicos de cada plataforma. Las clasificaciones son provisionales hasta que se publican los resultados, y podemos corregir una cifra claramente errónea.
- **Juego limpio.** Las visualizaciones, likes o comentarios comprados, automáticos o falsos, los grupos de interacción, o engañarnos sobre dónde o cuándo se publicó un vídeo, descalifican el vídeo. Cuando tengamos motivos razonables podemos excluir un vídeo o retener un premio, y te diremos por qué (apartado 8).

## 3. Premios, pagos e impuestos

- **Los premios en efectivo** se pagan por transferencia bancaria contra una factura que preparamos por ti con los datos de pago que guardes (autofacturación), normalmente en los 30 días siguientes a la publicación de los resultados. Debes mantener esos datos correctos; no podemos recuperar dinero enviado a una cuenta que nos diste.
- **Los vales de Tryp.com** sirven para reservar en Tryp.com, son personales, no se pueden cambiar por dinero y tienen la caducidad que se indique al concederlos.
- **Los impuestos son responsabilidad tuya.** No practicamos retenciones y no podemos darte asesoramiento fiscal. Si eres menor de 18, tu madre, padre o tutor debe estar al tanto de cualquier premio que recibas.
- **Podemos cambiar o terminar un reto o un premio.** Si terminamos antes de tiempo un reto en marcha, respetamos los premios ya conseguidos en él.

## 4. Decir que es publicidad

Todo lo que publiques para Tryp.com, o por lo que recibas o esperes recibir algo de valor de nosotros (dinero, un vale, puntos para un premio), es publicidad y debe indicarse claramente:

- Pon **#ad**, **#publicidad** o **Publicidad** al principio del texto o en pantalla en los primeros segundos. La etiqueta de "Colaboración pagada" de la plataforma es bienvenida, pero por sí sola no basta.
- Sigue las normas de publicidad del lugar donde está tu público: en el Reino Unido, el CAP Code y la guía de la CMA sobre recomendaciones; en la UE, la Directiva sobre prácticas comerciales desleales y las normas de tu país para influencers.
- Di solo lo que sea verdad sobre Tryp.com y tu propia experiencia, y comprueba cualquier precio u oferta en Tryp.com el mismo día que publiques.

Si te pedimos que corrijas la etiqueta de una publicación, hazlo cuanto antes, por favor. Un vídeo que no esté bien etiquetado puede quedar excluido.

## 5. Seguridad de la marca

- No publiques para Tryp.com contenido ilegal, de odio, sexual, violento o peligroso, ni que se burle de la gente o la engañe.
- No muestres precios, ofertas ni disponibilidad que no hayas comprobado en Tryp.com el mismo día que publiques.
- No publiques en el mismo vídeo contenido pagado para Tryp.com y para un competidor directo (otra agencia de viajes online u otra web de reservas de viajes).

## 6. Tu contenido y cómo podemos usarlo

**Todo lo que creas sigue siendo tuyo.**

Al presentar un vídeo en un reto, añadirlo en cualquier parte de la Comunidad o compartirlo con nosotros de otra forma, concedes a Tryp.com y a las empresas de su grupo una **licencia mundial, no exclusiva y gratuita**, que sigue vigente después de que te vayas, para:

- mostrarlo dentro de la Comunidad, incluidas las clasificaciones, los resúmenes y la página de Ideas de vídeos;
- **reutilizarlo en el marketing de Tryp.com**: nuestra web, app, emails, redes sociales y publicidad pagada (incluido publicarlo como anuncio desde nuestras cuentas, o desde las tuyas cuando la plataforma lo permita y nos hayas dado acceso);
- editarlo para esos usos (recortar, cambiar el formato, subtitular, traducir, añadir música o nuestra marca), siempre que no cambiemos su sentido ni pongamos en tu boca palabras que no dijiste;
- mencionarte con tu nombre, tu usuario y tu foto de perfil junto a él.

No estamos obligados a usar tu contenido, y te mencionamos cuando sea razonablemente posible. Si quieres que un vídeo no se use en marketing **futuro**, escribe a ethan@tryp.com y atenderemos las peticiones razonables; los anuncios ya contratados pueden seguir hasta el final de su reserva.

Confirmas que el contenido es tuyo para compartirlo, que todas las personas reconocibles en él aceptaron aparecer (con el acuerdo de su madre, padre o tutor en el caso de menores de 18) y que la música, las imágenes o cualquier otro material que incluya tienen licencia para este uso.

## 7. Formar parte de la Comunidad

Las salas, los mensajes directos y el tablón son espacios compartidos. Sé respetuoso. No publiques nada ilegal, de odio, acosador, sexual, engañoso o que infrinja derechos; no hagas spam ni presiones a otros miembros; no compartas fuera de la Comunidad datos personales de otros miembros; no intentes acceder a cuentas o datos que no son tuyos; y no te hagas pasar por nadie.

Cada mensaje tiene un botón **Denunciar**. Las denuncias llegan al equipo al momento; las revisamos y comunicamos a ambas partes lo que decidimos.

## 8. Si algo sale mal

Cuando un contenido o una cuenta incumpla estas condiciones o la ley, podemos retirar el contenido, excluir un vídeo, limitar o suspender una cuenta, o cerrarla. **Te diremos qué hemos hecho y por qué**, y puedes pedir que una persona lo revise respondiendo o escribiendo a ethan@tryp.com. Esta es nuestra exposición de motivos y nuestro procedimiento de reclamación según la Ley de Servicios Digitales de la UE.

## 9. El programa VIP

Algunos creadores de 18 años o más reciben una invitación al programa VIP, que se paga por visualizaciones en lugar de por retos. Los creadores VIP firman además el **Acuerdo de Colaboración para Creadores VIP**, y los creadores de contenido oficiales de Tryp.com firman el **Acuerdo de Creador de Contenido Oficial**; cada uno prevalece sobre estas condiciones en lo que difieran.

## 10. Tus datos

Cómo usamos tus datos personales se explica en nuestra Política de Privacidad (en la app, en Ajustes, y en /privacy). Cuando aceptas estas condiciones guardamos un registro de la versión, el texto exacto, la hora, tu cuenta y los datos del dispositivo (y, si eres menor de 18, el nombre y el email de tu madre, padre o tutor), para que cualquiera de las dos partes pueda demostrar lo acordado.

## 11. Otras plataformas

Instagram, TikTok, YouTube y Facebook tienen sus propias condiciones, incluidas normas sobre contenido de marca, y debes cumplirlas. Ninguna de ellas patrocina la Comunidad ni está vinculada a ella.

## 12. Darte de baja

Puedes eliminar tu cuenta en cualquier momento desde Ajustes; se borra tras un periodo de gracia de 30 días. Podemos cerrar una cuenta que incumpla estas condiciones, como explica el apartado 8. Los premios ya conseguidos y aún no pagados se siguen pagando, salvo que se consiguieran incumpliendo estas condiciones.

## 13. Responsabilidad

La Comunidad se ofrece tal como es, sin garantía de que siempre esté disponible o libre de fallos. En la medida en que la ley lo permita, no respondemos de pérdidas indirectas, de ingresos o seguidores perdidos, ni de lo que una red social haga con tu cuenta. Nada de esto limita la responsabilidad que la ley no permite limitar, ni te quita los derechos que tengas como consumidor donde vives.

## 14. Cambios en estas condiciones

Podemos actualizar estas condiciones. Cuando lo hagamos, te avisaremos en la app, te mostraremos qué ha cambiado y te pediremos que aceptes la nueva versión para continuar. Todas las versiones que hayas aceptado siguen disponibles en **Ajustes > Acuerdos**.

## 15. Ley aplicable y conflictos

Estas condiciones se rigen por la ley danesa y los tribunales de Dinamarca. Si vives en otro país de la UE o en el Reino Unido, conservas la protección de las normas obligatorias de consumo de tu país y puedes reclamar allí. Habla primero con nosotros, por favor: casi todo se resuelve con un mensaje.

## 16. Idioma

Estas condiciones están redactadas en inglés. Si las lees en otro idioma en la app, esa traducción tiene el mismo significado; si alguna vez no coinciden, se aplica la versión en inglés, salvo que la ley del lugar donde vives disponga otra cosa.

## 17. Contacto

Tryp.com ApS, Drewsensvej 3, st. th, 5000 Odense C, Dinamarca. Email **ethan@tryp.com**, o escribe al equipo de Tryp.com en la app.

---

Aceptado en la app por **{{creator_name}}** el {{today}}.$txt$)
  on conflict (agreement_id, locale) do update set title = excluded.title, summary = excluded.summary, body = excluded.body, updated_at = now();
insert into public.agreement_translations (agreement_id, locale, title, summary, body) values ('c9705ec2-c818-4d59-9f87-1635505bab65', 'es', $txt$Acuerdo de Colaboración para Creadores VIP$txt$, $txt$Tu acuerdo como creador VIP de Tryp.com: qué cuenta, cómo se te paga por visualizaciones en {{market}}, qué podemos hacer con tu contenido y cómo puede terminarlo cualquiera de las partes. Se firma electrónicamente.$txt$, $txt$# Acuerdo de Colaboración para Creadores VIP

**Entre:** **Tryp.com ApS**, CVR 42533165, con domicilio social en Drewsensvej 3, st. th, 5000 Odense C, Dinamarca, representada por **Francesco Lopalco**, Head of Growth (en adelante, "Tryp.com"),

**y:** **{{creator_name}}** (en adelante, "el Creador").

Ambas partes acuerdan lo siguiente.

**Requisitos.** El Creador confirma que tiene al menos 18 años y que es libre de celebrar este Acuerdo.

## 1. Objeto

Este Acuerdo establece las condiciones de participación del Creador en el programa VIP de Tryp.com en **{{market}}**: crear y publicar contenido original de formato corto en redes sociales (principalmente TikTok e Instagram, también YouTube Shorts y Facebook) que promocione los servicios de Tryp.com de forma creativa y auténtica, y cobrar por las visualizaciones que consiga ese contenido.

## 2. Duración y renovación

- Este Acuerdo empieza en la fecha de su firma y **se renueva automáticamente mes a mes**, sin nueva firma de ninguna de las partes.
- La renovación depende de que el Creador siga cumpliendo los requisitos de la cláusula 8.
- Tryp.com puede poner fin a la participación del Creador en meses futuros si (a) el Creador no cumple la cláusula 8, o (b) Tryp.com decide no continuar la colaboración por motivos operativos o estratégicos. Tryp.com avisará por escrito con una antelación razonable (por email, mensaje directo o en la app).
- **2.1 Resolución por cualquiera de las partes.** Cualquiera de las partes puede poner fin a este Acuerdo por cualquier motivo con un **preaviso por escrito de catorce (14) días** antes del final del mes natural en curso.

## 3. Remuneración

- **3.1** El Creador gana **{{rate}} por cada 1.000 visualizaciones verificadas** en contenido elegible, contadas como se indica en la cláusula 7.
- **3.2** Las ganancias se calculan a partir de las visualizaciones verificadas y se muestran, con su cálculo, en la página VIP del Creador.
- **3.3 Contenido elegible.** Solo es elegible el contenido que muestre clara y expresamente Tryp.com **dentro del propio vídeo**: una mención visible y/o hablada de Tryp.com (por ejemplo, una referencia hablada, texto en pantalla, una demostración de la plataforma o elementos visuales de la marca). Etiquetar a Tryp.com solo en el texto, la descripción, los comentarios o los hashtags **no** basta. El contenido puramente inspiracional, ajeno a los servicios de Tryp.com, o que no incluya la marca de forma visible en el vídeo, no es elegible, tenga las visualizaciones que tenga. Tryp.com decide, de forma razonable, si un contenido es elegible.
- **3.4 Bonus y retos.** Tryp.com puede organizar bonus y retos para creadores VIP (por ejemplo, premios por más visualizaciones o un vale por el mejor vídeo sobre un tema). Sus reglas se publican en la página VIP del Creador y se pagan además de lo previsto en 3.1. Cuando un reto haga una pregunta sobre un vídeo (por ejemplo, si incluye hotel y vuelo), el Creador responde con la verdad, y Tryp.com decide, de forma razonable, si un vídeo encaja. Un vale sirve para reservar en Tryp.com, es personal y no se puede cambiar por dinero.

## 4. Ventajas del programa VIP

- Comentarios periódicos sobre el contenido y orientación estratégica, mediante sesiones de grupo y/o seguimientos individuales por chat, comentarios escritos, notas de voz o videollamadas, a criterio de Tryp.com.
- Línea directa con el equipo de marketing de Tryp.com, incluidas las salas VIP privadas.
- La posibilidad de ser considerado para futuras colaboraciones pagadas o funciones de creador.
- La posibilidad de publicaciones colaborativas con Tryp.com en Instagram, sujetas a la aprobación de Tryp.com.
- Inclusión prioritaria en futuras campañas para {{market}}.

## 5. Propiedad intelectual y uso del contenido

- **5.1 Titularidad.** Todo el contenido que el Creador haga en virtud de este Acuerdo ("Contenido") sigue siendo propiedad intelectual del Creador.
- **5.2 Licencia a Tryp.com.** El Creador concede a Tryp.com y a las empresas de su grupo una **licencia no exclusiva, gratuita, mundial y perpetua** para usar el Contenido, y el nombre, la imagen, la apariencia y la voz del Creador tal como aparecen en él, para: compartirlo y republicarlo en la web, la app, los emails y las redes sociales de Tryp.com; usarlo como publicidad pagada, desde las cuentas de Tryp.com o, cuando la plataforma lo permita y el Creador haya dado acceso, desde las del Creador (por ejemplo, TikTok Spark Ads o anuncios de colaboración de Instagram); editarlo para esos usos (recortar, cambiar el formato, subtitular, traducir, añadir música o la marca) sin cambiar su sentido; y mostrarlo dentro de la plataforma de creadores de Tryp.com. Tryp.com mencionará al Creador cuando sea razonablemente posible y no está obligada a usar ningún Contenido.
- **5.3 Exclusividad del contenido.** (a) Durante **doce (12) meses** desde su publicación, el Creador no licenciará, venderá ni reutilizará el Contenido concreto hecho para Tryp.com con ninguna otra marca comercial, especialmente del sector de los viajes o el turismo. (b) Mientras dure este Acuerdo y durante doce (12) meses después de su fin, el Creador no usará, replicará ni licenciará para otra marca comercial o patrocinador el formato de contenido exacto, el estilo visual o la plantilla, ni el concepto de vídeo concreto desarrollados en esta colaboración. Las técnicas generales de edición y las tendencias generales del sector no están restringidas.
- **5.4** El Creador confirma que es titular o tiene licencia de todo lo que aparece en el Contenido (incluida la música y las imágenes) y que todas las personas que aparecen aceptaron salir. Si el Creador lo pide, Tryp.com dejará de usar un Contenido en marketing futuro ante una petición razonable; el material ya publicado o contratado puede seguir en circulación.

## 6. Competidores

Mientras dure este Acuerdo, el Creador no publicará contenido patrocinado o pagado para **competidores directos** de Tryp.com (agencias de viajes online y webs de reserva de viajes, como Booking.com, Expedia, Skyscanner, Kiwi.com, eDreams o Trip.com) sin la aprobación por escrito de Tryp.com. Otras marcas están permitidas, siempre que no aparezcan en el mismo vídeo que Tryp.com.

## 7. Pagos y seguimiento de visualizaciones

- **7.1 Añadir vídeos.** El Creador añade cada vídeo elegible a su página VIP en la plataforma de creadores de Tryp.com, con su enlace público, en cuanto lo publica. Después, las visualizaciones se leen automáticamente del contador público de cada plataforma, al menos una vez al día y con una lectura final a fin de mes. Tryp.com puede pedir capturas o grabaciones de pantalla de las estadísticas nativas para verificar una cifra.
- **7.2 Periodos mensuales.** Cada periodo va desde el primer día del mes a las 00:00 hasta el último día a las 23:59 (en la zona horaria de tu mercado). **Solo se pagan en un periodo las visualizaciones conseguidas dentro de ese periodo**, en vídeos publicados en los {{window_days}} días anteriores. Las visualizaciones conseguidas después de que termine un periodo no se pagan en él ni se trasladan.
- **7.3 Verificación.** Tryp.com verifica todas las visualizaciones y la elegibilidad (cláusula 3.3). Las cifras verificadas por Tryp.com son definitivas a efectos de pago. Las visualizaciones fraudulentas, compradas o infladas artificialmente (incluidos bots o grupos de interacción) hacen que ese contenido no sea elegible para pago.
- **7.4 Saldo y pago mínimo.** Las ganancias mensuales se suman al saldo VIP del Creador. El dinero se paga cuando el saldo llega a **{{min_payout}}**; por debajo, se acumula de un mes a otro. En lugar de eso, el Creador puede canjear el saldo por un **vale de viaje de Tryp.com** en cualquier momento una vez que llegue a {{voucher_min}}.
- **7.5 Límite de pago.** {{payment_cap}}
- **7.6 Facturas y pago.** Tryp.com prepara la factura de cada pago en efectivo con los datos de pago que el Creador guarda en la plataforma (autofacturación), y el Creador no emitirá una factura aparte por el mismo importe. El pago se hace por transferencia bancaria en un plazo de **30 días** desde la aprobación del pago, siempre que los datos estén completos y sean correctos.
- **7.7 Impuestos.** El Creador es un profesional independiente y es responsable de declarar y pagar todos los impuestos y cotizaciones sociales sobre lo que gana, en su propio país.
- **7.8 Cambios.** Tryp.com puede cambiar la tarifa, el límite o los mínimos para meses futuros con al menos 14 días de aviso en la app. Las ganancias ya conseguidas nunca se reducen.

## 8. Requisitos de rendimiento

{{stay_in}}

## 9. Indicar que es publicidad

Cada vídeo debe indicar claramente que es publicidad (**#ad**, **#publicidad** o **Publicidad**, al principio del texto o en pantalla), siguiendo las normas del lugar donde está el público y las Condiciones de la Comunidad de Creadores de Tryp.com.

## 10. Confidencialidad

El Creador no revelará la información confidencial que Tryp.com comparta durante este Acuerdo o después, incluidas tarifas, liquidaciones, estrategias de marketing, briefings antes de su lanzamiento, comunicaciones internas y datos de campañas. Esto no impide que el Creador diga que trabaja con Tryp.com.

## 11. Código de conducta y protección de la marca

Tryp.com puede suspender o poner fin de inmediato a la participación del Creador, con o sin aviso previo, si el Creador se comporta de forma inapropiada, poco profesional, dañina o contraria a los valores, la reputación o las normas de la comunidad de Tryp.com. Esto incluye conductas irrespetuosas, abusivas o discriminatorias; acciones o conflictos que perjudiquen a otros creadores o a la comunidad; conductas que puedan dañar la marca, la reputación o el negocio de Tryp.com; y cualquier incumplimiento de las normas de la comunidad, de las normas éticas o de las políticas de las plataformas. Las ganancias ya verificadas se pagan, salvo que procedan de un incumplimiento grave.

## 12. Profesional independiente

El Creador trabaja de forma independiente y no es empleado, agente ni socio de Tryp.com. El Creador decide cómo, cuándo y dónde hace su contenido y puede trabajar con otras marcas, con sujeción a las cláusulas 5.3 y 6.

## 13. Datos

Tryp.com usa los datos personales del Creador para gestionar el programa y pagarle, como se explica en la Política de Privacidad. Cuando el Creador firma, Tryp.com guarda un registro del texto exacto firmado, la hora, la cuenta y el email, la firma y los datos del dispositivo y de la red, para que ambas partes puedan demostrar lo acordado.

## 14. Ley aplicable y jurisdicción

Este Acuerdo se rige por las leyes de **Dinamarca**, y las controversias se someten a los tribunales competentes de Dinamarca, sin perjuicio de cualquier protección imperativa que tenga el Creador según la ley del país donde vive.

## 15. Acuerdo completo y firma

- Este Acuerdo, las Condiciones de la Comunidad de Creadores de Tryp.com y los datos de la página VIP del Creador constituyen el acuerdo completo sobre el programa VIP y sustituyen cualquier acuerdo VIP anterior entre las partes. Si no coinciden, prevalece este Acuerdo.
- Tryp.com puede actualizar este Acuerdo; se pedirá al Creador que lea y firme la nueva versión en la app, y puede, en su lugar, poner fin al Acuerdo según la cláusula 2.1.
- Las partes firman electrónicamente. El nombre escrito o la firma dibujada del Creador, dados desde su cuenta iniciada, tienen el mismo efecto que una firma manuscrita (Reglamento (UE) 910/2014, eIDAS).
- Este Acuerdo está redactado en inglés. Si el Creador lo lee y lo firma en otro idioma en la app, esa traducción tiene el mismo significado; si alguna vez no coinciden, se aplica la versión en inglés, salvo que la ley imperativa del lugar donde vive el Creador disponga otra cosa. Tryp.com guarda una copia de ambas.

---

**Por Tryp.com ApS:** Francesco Lopalco, Head of Growth

**El Creador:** {{creator_name}}, firma a continuación el {{today}}$txt$)
  on conflict (agreement_id, locale) do update set title = excluded.title, summary = excluded.summary, body = excluded.body, updated_at = now();
insert into public.agreement_translations (agreement_id, locale, title, summary, body) values ('ba59ca85-d630-4fd0-bea9-c58c243d5132', 'pt', $txt$Termos da Comunidade$txt$, $txt$Olá, {{creator_name}}. Estas são as regras da Comunidade de Criadores da Tryp.com: como funcionam os desafios e os prémios, como identificar as tuas publicações como publicidade, como podemos usar os vídeos que partilhas e como falar connosco. A Comunidade é para criadores com 18 anos ou mais.$txt$, $txt$# Termos da Comunidade de Criadores da Tryp.com

**Entre:** **Tryp.com ApS**, CVR 42533165, Drewsensvej 3, st. th, 5000 Odense C, Dinamarca ("Tryp.com", "nós"),

**e:** **{{creator_name}}**, membro da Comunidade de Criadores da Tryp.com (**{{creator_market}}**) ("tu").

Estes termos são o acordo entre ti e a Tryp.com para participares na Comunidade de Criadores da Tryp.com ("a Comunidade"). Entrar na Comunidade e participar nela é gratuito. Lê-os, por favor; o resumo abaixo existe para ajudar, mas o que conta são as secções numeradas.

> **Em resumo.** Participar é sempre gratuito e os vencedores são decididos por números publicados, nunca por sorte. Os teus vídeos continuam a ser teus e deixas-nos reutilizá-los no nosso marketing, com crédito sempre que possível. Tudo o que publicas para a Tryp.com é publicidade e tem de o dizer. Sê simpático, sê honesto e mantém os teus dados de pagamento atualizados. Dúvidas para ethan@tryp.com.

## 1. Quem pode entrar

- **Idade.** A Comunidade é para pessoas com **18 anos ou mais**, e ao aceitares estes termos confirmas que os tens. A única exceção é quem já era membro aprovado a 13 de outubro de 2026 com 16 ou 17 anos: pode continuar, mas apenas com o acordo do pai, da mãe ou do tutor legal, que confirma estes termos em seu nome num link que disponibilizamos (guardamos o nome, o email e a confirmação). Esse pai, mãe ou tutor pode retirar o seu acordo a qualquer momento escrevendo para ethan@tryp.com, e podemos reter os prémios desse criador até a confirmação chegar. O programa VIP e qualquer contrato pago são apenas para maiores de 18 anos. Se descobrirmos que outra pessoa com menos de 18 anos tem uma conta, fechamo-la.
- **Uma pessoa, uma conta.** O teu perfil tem de ser sobre ti e estar correto, incluindo a tua data de nascimento e o teu país. Não partilhes o teu acesso.
- **Aprovação.** A equipa da Tryp.com analisa cada candidatura e pode aprová-la ou recusá-la.
- **Não é um emprego.** Participar não faz de ti nosso trabalhador, agente ou sócio, e és livre de trabalhar com outras marcas, exceto no que diz a secção 5.

## 2. Como funcionam os desafios

- **Participar é gratuito.** Nenhum desafio pede alguma vez um pagamento ou uma compra.
- **Os vencedores são decididos por uma medida objetiva e publicada**, como visualizações ou pontos, segundo as regras publicadas em cada desafio. Nada é decidido por sorte ou por sorteio.
- **O regulamento de cada desafio faz parte destes termos para esse desafio**: datas, mercado, plataformas, pontos, bónus, impulsos, grupos, lugares e prémios. Se o regulamento e estes termos forem diferentes, para esse desafio vale o regulamento.
- **Os vídeos que submetes têm de ser trabalho teu e original**, feitos para o regulamento, publicados publicamente numa plataforma permitida durante o desafio e mantidos até os resultados serem publicados. Vídeos publicados antes de um desafio começar não contam, e um vídeo conta num só desafio.
- **A Tryp.com tem de aparecer no próprio vídeo**: dita, mostrada no ecrã ou através da app ou do site. Uma menção apenas na legenda, nos comentários ou nas hashtags não conta.
- **As visualizações e os pontos são lidos automaticamente** a partir dos contadores públicos de cada plataforma. As classificações são provisórias até os resultados serem publicados, e podemos corrigir um número claramente errado.
- **Jogo limpo.** Visualizações, gostos ou comentários comprados, automáticos ou falsos, grupos de interação, ou enganar-nos sobre onde ou quando um vídeo foi publicado, desqualificam o vídeo. Quando tivermos motivos razoáveis, podemos excluir um vídeo ou reter um prémio, e dizemos-te porquê (secção 8).

## 3. Prémios, pagamentos e impostos

- **Os prémios em dinheiro** são pagos por transferência bancária contra uma fatura que preparamos por ti com os dados de pagamento que guardares (autofaturação), normalmente nos 30 dias seguintes à publicação dos resultados. Tens de manter esses dados corretos; não conseguimos recuperar dinheiro enviado para uma conta que nos deste.
- **Os vales da Tryp.com** servem para reservar na Tryp.com, são pessoais, não podem ser trocados por dinheiro e têm a validade indicada quando são atribuídos.
- **Os impostos são da tua responsabilidade.** Não fazemos retenções e não podemos dar aconselhamento fiscal. Se tens menos de 18 anos, o teu pai, mãe ou tutor deve saber de qualquer prémio que recebas.
- **Podemos alterar ou terminar um desafio ou um prémio.** Se terminarmos mais cedo um desafio a decorrer, respeitamos os prémios já ganhos nele.

## 4. Dizer que é publicidade

Tudo o que publicas para a Tryp.com, ou pelo qual recebes ou esperas receber algo de valor da nossa parte (dinheiro, um vale, pontos para um prémio), é publicidade e tem de estar claramente identificado:

- Coloca **#ad**, **#publicidade** ou **Publicidade** no início da legenda ou no ecrã nos primeiros segundos. A etiqueta "Parceria paga" da plataforma é bem-vinda, mas sozinha não chega.
- Segue as regras de publicidade do sítio onde está o teu público: no Reino Unido, o CAP Code e as orientações da CMA sobre recomendações; na UE, a Diretiva relativa às práticas comerciais desleais e as regras do teu país para influenciadores.
- Diz apenas o que é verdade sobre a Tryp.com e a tua própria experiência, e confirma qualquer preço ou oferta na Tryp.com no próprio dia em que publicas.

Se te pedirmos para corrigir a identificação de uma publicação, fá-lo o mais depressa possível, por favor. Um vídeo que não esteja bem identificado pode ser excluído.

## 5. Segurança da marca

- Não publiques para a Tryp.com conteúdo ilegal, de ódio, sexual, violento ou perigoso, nem que goze com as pessoas ou as engane.
- Não mostres preços, ofertas ou disponibilidade que não tenhas confirmado na Tryp.com no próprio dia em que publicas.
- Não publiques no mesmo vídeo conteúdo pago para a Tryp.com e para um concorrente direto (outra agência de viagens online ou outro site de reservas de viagens).

## 6. O teu conteúdo e como o podemos usar

**Tudo o que crias continua a ser teu.**

Ao submeteres um vídeo num desafio, ao adicioná-lo em qualquer parte da Comunidade ou ao partilhá-lo connosco de outra forma, dás à Tryp.com e às empresas do seu grupo uma **licença mundial, não exclusiva e gratuita**, que continua depois de saíres, para:

- o mostrar dentro da Comunidade, incluindo nas classificações, nos resumos e na página Ideias de vídeos;
- **o reutilizar no marketing da Tryp.com**: o nosso site, app, emails, redes sociais e publicidade paga (incluindo publicá-lo como anúncio a partir das nossas contas, ou das tuas quando a plataforma o permitir e nos tiveres dado acesso);
- o editar para esses usos (cortar, redimensionar, legendar, traduzir, juntar música ou a nossa marca), desde que não mudemos o seu sentido nem te ponhamos a dizer o que não disseste;
- te dar crédito com o teu nome, o teu utilizador e a tua foto de perfil junto dele.

Não somos obrigados a usar o teu conteúdo, e damos-te crédito sempre que for razoavelmente possível. Se quiseres que um vídeo fique fora do marketing **futuro**, escreve para ethan@tryp.com e atenderemos pedidos razoáveis; os anúncios já contratados podem continuar até ao fim da sua reserva.

Confirmas que o conteúdo é teu para partilhar, que todas as pessoas reconhecíveis nele aceitaram aparecer (com o acordo do pai, da mãe ou do tutor no caso de menores de 18 anos) e que qualquer música, imagem ou outro material que contenha está licenciado para este uso.

## 7. Fazer parte da Comunidade

As salas, as mensagens diretas e o mural são espaços partilhados. Sê respeitoso. Não publiques nada ilegal, de ódio, de assédio, sexual, enganador ou que viole direitos; não faças spam nem pressiones outros membros; não partilhes fora da Comunidade dados pessoais de outros membros; não tentes aceder a contas ou dados que não são teus; e não te faças passar por ninguém.

Cada mensagem tem um botão **Denunciar**. As denúncias chegam logo à equipa; analisamo-las e dizemos a ambas as partes o que decidimos.

## 8. Se algo correr mal

Quando um conteúdo ou uma conta não cumprir estes termos ou a lei, podemos remover o conteúdo, excluir um vídeo, limitar ou suspender uma conta, ou fechá-la. **Dizemos-te o que fizemos e porquê**, e podes pedir que uma pessoa reveja a decisão respondendo ou escrevendo para ethan@tryp.com. Esta é a nossa exposição de motivos e o nosso procedimento de reclamação ao abrigo do Regulamento dos Serviços Digitais da UE.

## 9. O programa VIP

Alguns criadores com 18 anos ou mais são convidados para o programa VIP, que é pago por visualizações em vez de por desafios. Os criadores VIP assinam também o **Acordo de Colaboração para Criadores VIP**, e os criadores de conteúdo oficiais da Tryp.com assinam o **Acordo de Criador de Conteúdo Oficial**; cada um prevalece sobre estes termos naquilo em que forem diferentes.

## 10. Os teus dados

A forma como usamos os teus dados pessoais está explicada na nossa Política de Privacidade (na app, em Definições, e em /privacy). Quando aceitas estes termos, guardamos um registo da versão, do texto exato, da hora, da tua conta e dos dados do dispositivo (e, se tiveres menos de 18 anos, do nome e do email do teu pai, mãe ou tutor), para que qualquer uma das partes possa mostrar o que foi acordado.

## 11. Outras plataformas

O Instagram, o TikTok, o YouTube e o Facebook têm os seus próprios termos, incluindo regras sobre conteúdo de marca, e tens de os cumprir. Nenhum deles patrocina a Comunidade ou está ligado a ela.

## 12. Sair

Podes apagar a tua conta a qualquer momento em Definições; é removida após um período de 30 dias. Podemos fechar uma conta que não cumpra estes termos, como explica a secção 8. Os prémios já ganhos e ainda não pagos continuam a ser pagos, exceto se tiverem sido ganhos sem cumprir estes termos.

## 13. Responsabilidade

A Comunidade é disponibilizada tal como está, sem garantia de que esteja sempre disponível ou livre de falhas. Na medida em que a lei o permita, não somos responsáveis por perdas indiretas, rendimentos ou seguidores perdidos, nem pelo que uma rede social faça à tua conta. Nada disto limita a responsabilidade que a lei não permite limitar, nem te tira direitos que tenhas como consumidor no sítio onde vives.

## 14. Alterações a estes termos

Podemos atualizar estes termos. Quando o fizermos, avisamos-te na app, mostramos-te o que mudou e pedimos-te que aceites a nova versão para continuar. Todas as versões que aceitaste continuam disponíveis em **Definições > Acordos**.

## 15. Lei aplicável e litígios

Estes termos regem-se pela lei dinamarquesa e pelos tribunais da Dinamarca. Se vives noutro país da UE ou no Reino Unido, manténs a proteção das normas obrigatórias de defesa do consumidor do teu país e podes recorrer aos tribunais de lá. Fala connosco primeiro, por favor: quase tudo se resolve com uma mensagem.

## 16. Idioma

Estes termos estão redigidos em inglês. Se os leres noutra língua na app, essa tradução tem o mesmo significado; se alguma vez forem diferentes, aplica-se a versão em inglês, salvo se a lei do sítio onde vives determinar outra coisa.

## 17. Contacto

Tryp.com ApS, Drewsensvej 3, st. th, 5000 Odense C, Dinamarca. Email **ethan@tryp.com**, ou envia mensagem à equipa da Tryp.com na app.

---

Aceite na app por **{{creator_name}}** em {{today}}.$txt$)
  on conflict (agreement_id, locale) do update set title = excluded.title, summary = excluded.summary, body = excluded.body, updated_at = now();
insert into public.agreement_translations (agreement_id, locale, title, summary, body) values ('c9705ec2-c818-4d59-9f87-1635505bab65', 'pt', $txt$Acordo de Colaboração para Criadores VIP$txt$, $txt$O teu acordo como criador VIP da Tryp.com: o que conta, como és pago por visualizações em {{market}}, o que podemos fazer com o teu conteúdo e como qualquer das partes o pode terminar. Assinado eletronicamente.$txt$, $txt$# Acordo de Colaboração para Criadores VIP

**Entre:** **Tryp.com ApS**, CVR 42533165, com sede em Drewsensvej 3, st. th, 5000 Odense C, Dinamarca, representada por **Francesco Lopalco**, Head of Growth (doravante "Tryp.com"),

**e:** **{{creator_name}}** (doravante "o Criador").

As partes acordam o seguinte.

**Requisitos.** O Criador confirma que tem pelo menos 18 anos e que é livre de celebrar este Acordo.

## 1. Objeto

Este Acordo define os termos da participação do Criador no programa VIP da Tryp.com em **{{market}}**: criar e publicar conteúdo original de formato curto nas redes sociais (sobretudo TikTok e Instagram, também YouTube Shorts e Facebook) que promova os serviços da Tryp.com de forma criativa e autêntica, e ser pago pelas visualizações que esse conteúdo obtém.

## 2. Duração e renovação

- Este Acordo começa na data em que é assinado e **renova-se automaticamente de mês a mês**, sem nova assinatura de nenhuma das partes.
- A renovação depende de o Criador continuar a cumprir os requisitos da cláusula 8.
- A Tryp.com pode terminar a participação do Criador em meses futuros se (a) o Criador não cumprir a cláusula 8, ou (b) a Tryp.com decidir não continuar a colaboração por razões operacionais ou estratégicas. A Tryp.com dará um aviso escrito com antecedência razoável (por email, mensagem direta ou na app).
- **2.1 Cessação por qualquer das partes.** Qualquer das partes pode terminar este Acordo por qualquer motivo, com **aviso prévio escrito de catorze (14) dias** antes do fim do mês civil em curso.

## 3. Remuneração

- **3.1** O Criador ganha **{{rate}} por cada 1.000 visualizações verificadas** em conteúdo elegível, contadas como indicado na cláusula 7.
- **3.2** Os ganhos são calculados a partir das visualizações verificadas e mostrados, com o respetivo cálculo, na página VIP do Criador.
- **3.3 Conteúdo elegível.** Só é elegível o conteúdo que mostre a Tryp.com de forma clara e explícita **dentro do próprio vídeo**: uma menção visível e/ou falada à Tryp.com (por exemplo, uma referência falada, texto no ecrã, uma demonstração da plataforma ou elementos visuais da marca). Identificar a Tryp.com apenas na legenda, na descrição, nos comentários ou nas hashtags **não** chega. O conteúdo puramente inspiracional, sem relação com os serviços da Tryp.com, ou que não inclua a marca de forma visível no vídeo, não é elegível, independentemente das visualizações. A Tryp.com decide, de forma razoável, se um conteúdo é elegível.
- **3.4 Bónus e desafios.** A Tryp.com pode organizar bónus e desafios para criadores VIP (por exemplo, prémios para mais visualizações ou um vale para o melhor vídeo sobre um tema). As regras são publicadas na página VIP do Criador e pagas para além do previsto em 3.1. Quando um desafio fizer uma pergunta sobre um vídeo (por exemplo, se inclui hotel e voo), o Criador responde com verdade, e a Tryp.com decide, de forma razoável, se um vídeo se enquadra. Um vale serve para reservar na Tryp.com, é pessoal e não pode ser trocado por dinheiro.

## 4. Vantagens do programa VIP

- Feedback regular sobre o conteúdo e orientação estratégica, através de sessões de grupo e/ou acompanhamento individual por chat, feedback escrito, mensagens de voz ou videochamadas, a critério da Tryp.com.
- Linha direta com a equipa de marketing da Tryp.com, incluindo as salas VIP privadas.
- A possibilidade de ser considerado para futuras colaborações pagas ou funções de criador.
- A possibilidade de publicações colaborativas com a Tryp.com no Instagram, sujeitas à aprovação da Tryp.com.
- Inclusão prioritária em futuras campanhas para {{market}}.

## 5. Propriedade intelectual e utilização do conteúdo

- **5.1 Titularidade.** Todo o conteúdo que o Criador faça ao abrigo deste Acordo ("Conteúdo") continua a ser propriedade intelectual do Criador.
- **5.2 Licença à Tryp.com.** O Criador concede à Tryp.com e às empresas do seu grupo uma **licença não exclusiva, gratuita, mundial e perpétua** para usar o Conteúdo, e o nome, a imagem, a aparência e a voz do Criador tal como aparecem nele, para: partilhá-lo e republicá-lo no site, na app, nos emails e nas redes sociais da Tryp.com; usá-lo como publicidade paga, a partir das contas da Tryp.com ou, quando a plataforma o permitir e o Criador tiver dado acesso, a partir das do Criador (por exemplo, TikTok Spark Ads ou anúncios de parceria do Instagram); editá-lo para esses usos (cortar, redimensionar, legendar, traduzir, juntar música ou a marca) sem mudar o seu sentido; e mostrá-lo dentro da plataforma de criadores da Tryp.com. A Tryp.com dará crédito ao Criador sempre que for razoavelmente possível e não é obrigada a usar qualquer Conteúdo.
- **5.3 Exclusividade do conteúdo.** (a) Durante **doze (12) meses** após a sua publicação, o Criador não licenciará, venderá nem reutilizará o Conteúdo específico feito para a Tryp.com com qualquer outra marca comercial, sobretudo do setor das viagens ou do turismo. (b) Durante este Acordo e nos doze (12) meses seguintes ao seu fim, o Criador não usará, replicará nem licenciará a outra marca comercial ou patrocinador o formato de conteúdo exato, o estilo visual ou o modelo, nem o conceito de vídeo específico desenvolvidos nesta colaboração. As técnicas gerais de edição e as tendências gerais do setor não estão restringidas.
- **5.4** O Criador confirma que é titular ou tem licença de tudo o que está no Conteúdo (incluindo música e imagens) e que todas as pessoas que nele aparecem aceitaram aparecer. Se o Criador o pedir, a Tryp.com deixará de usar um Conteúdo em marketing futuro mediante pedido razoável; o material já publicado ou contratado pode continuar a ser exibido.

## 6. Concorrentes

Enquanto este Acordo durar, o Criador não publicará conteúdo patrocinado ou pago para **concorrentes diretos** da Tryp.com (agências de viagens online e sites de reservas de viagens, como Booking.com, Expedia, Skyscanner, Kiwi.com, eDreams ou Trip.com) sem aprovação escrita da Tryp.com. Outras marcas são permitidas, desde que não apareçam no mesmo vídeo que a Tryp.com.

## 7. Pagamentos e contagem de visualizações

- **7.1 Adicionar vídeos.** O Criador adiciona cada vídeo elegível à sua página VIP na plataforma de criadores da Tryp.com, com o link público, logo que o publica. As visualizações são depois lidas automaticamente a partir do contador público de cada plataforma, pelo menos uma vez por dia e com uma leitura final no fim de cada mês. A Tryp.com pode pedir capturas ou gravações de ecrã das estatísticas nativas para verificar um número.
- **7.2 Períodos mensais.** Cada período vai do primeiro dia do mês às 00:00 até ao último dia às 23:59 (no fuso horário do teu mercado). **Só são pagas num período as visualizações obtidas dentro desse período**, em vídeos publicados nos {{window_days}} dias anteriores. As visualizações obtidas depois do fim de um período não são pagas nesse período nem transitam.
- **7.3 Verificação.** A Tryp.com verifica todas as visualizações e a elegibilidade (cláusula 3.3). Os números verificados pela Tryp.com são finais para efeitos de pagamento. Visualizações fraudulentas, compradas ou inflacionadas artificialmente (incluindo bots ou grupos de interação) tornam esse conteúdo não elegível para pagamento.
- **7.4 Saldo e pagamento mínimo.** Os ganhos mensais são somados ao saldo VIP do Criador. O dinheiro é pago quando o saldo atinge **{{min_payout}}**; abaixo disso, transita de mês para mês. Em alternativa, o Criador pode receber o saldo como **vale de viagem da Tryp.com** a qualquer momento, quando atingir {{voucher_min}}.
- **7.5 Limite de pagamento.** {{payment_cap}}
- **7.6 Faturas e pagamento.** A Tryp.com prepara a fatura de cada pagamento em dinheiro com os dados de pagamento que o Criador guarda na plataforma (autofaturação), e o Criador não emitirá uma fatura separada pelo mesmo valor. O pagamento é feito por transferência bancária no prazo de **30 dias** após a aprovação do pagamento, desde que os dados estejam completos e corretos.
- **7.7 Impostos.** O Criador é um prestador de serviços independente e é responsável por declarar e pagar todos os impostos e contribuições sociais sobre o que ganha, no seu próprio país.
- **7.8 Alterações.** A Tryp.com pode alterar a tarifa, o limite ou os mínimos para meses futuros com pelo menos 14 dias de aviso na app. Os ganhos já obtidos nunca são reduzidos.

## 8. Requisitos de desempenho

{{stay_in}}

## 9. Identificação como publicidade

Cada vídeo tem de estar claramente identificado como publicidade (**#ad**, **#publicidade** ou **Publicidade**, no início da legenda ou no ecrã), seguindo as regras do sítio onde está o público e os Termos da Comunidade de Criadores da Tryp.com.

## 10. Confidencialidade

O Criador não divulgará informação confidencial partilhada pela Tryp.com durante ou depois deste Acordo, incluindo tarifas, extratos, estratégias de marketing, briefings antes do lançamento, comunicações internas e dados de campanhas. Isto não impede o Criador de dizer que trabalha com a Tryp.com.

## 11. Código de conduta e proteção da marca

A Tryp.com pode suspender ou terminar de imediato a participação do Criador, com ou sem aviso prévio, se o Criador se comportar de forma inadequada, pouco profissional, prejudicial ou contrária aos valores, à reputação ou às normas da comunidade da Tryp.com. Isto inclui condutas desrespeitosas, abusivas ou discriminatórias; ações ou conflitos que prejudiquem outros criadores ou a comunidade; condutas que possam prejudicar a marca, a reputação ou o negócio da Tryp.com; e qualquer violação das normas da comunidade, de padrões éticos ou das políticas das plataformas. Os ganhos já verificados são pagos, exceto se resultarem de uma violação grave.

## 12. Prestador de serviços independente

O Criador trabalha de forma independente e não é trabalhador, agente ou sócio da Tryp.com. O Criador decide como, quando e onde faz o seu conteúdo e pode trabalhar com outras marcas, sujeito às cláusulas 5.3 e 6.

## 13. Dados

A Tryp.com usa os dados pessoais do Criador para gerir o programa e pagar-lhe, como explicado na Política de Privacidade. Quando o Criador assina, a Tryp.com guarda um registo do texto exato assinado, da hora, da conta e do email, da assinatura e dos dados do dispositivo e da rede, para que ambas as partes possam mostrar o que foi acordado.

## 14. Lei aplicável e foro

Este Acordo rege-se pelas leis da **Dinamarca**, e os litígios ficam sujeitos aos tribunais competentes da Dinamarca, sem prejuízo de qualquer proteção imperativa que o Criador tenha ao abrigo da lei do país onde vive.

## 15. Acordo completo e assinatura

- Este Acordo, os Termos da Comunidade de Criadores da Tryp.com e os dados da página VIP do Criador constituem o acordo completo sobre o programa VIP e substituem qualquer acordo VIP anterior entre as partes. Se forem diferentes, prevalece este Acordo.
- A Tryp.com pode atualizar este Acordo; será pedido ao Criador que leia e assine a nova versão na app, podendo este, em alternativa, terminar o Acordo ao abrigo da cláusula 2.1.
- As partes assinam eletronicamente. O nome escrito ou a assinatura desenhada do Criador, dados a partir da sua conta com sessão iniciada, têm o mesmo efeito que uma assinatura manuscrita (Regulamento (UE) 910/2014, eIDAS).
- Este Acordo está redigido em inglês. Se o Criador o ler e assinar noutra língua na app, essa tradução tem o mesmo significado; se alguma vez forem diferentes, aplica-se a versão em inglês, salvo se a lei imperativa do sítio onde o Criador vive determinar outra coisa. A Tryp.com guarda uma cópia de ambas.

---

**Pela Tryp.com ApS:** Francesco Lopalco, Head of Growth

**O Criador:** {{creator_name}}, assina abaixo em {{today}}$txt$)
  on conflict (agreement_id, locale) do update set title = excluded.title, summary = excluded.summary, body = excluded.body, updated_at = now();
insert into public.agreement_translations (agreement_id, locale, title, summary, body) values ('ba59ca85-d630-4fd0-bea9-c58c243d5132', 'de', $txt$Community-Bedingungen$txt$, $txt$Hallo {{creator_name}}. Das sind die Regeln der Tryp.com Creator Community: wie Challenges und Prämien funktionieren, wie du deine Beiträge als Werbung kennzeichnest, wie wir die Videos nutzen dürfen, die du teilst, und wie du uns erreichst. Die Community ist für Creator ab 18 Jahren.$txt$, $txt$# Bedingungen der Tryp.com Creator Community

**Zwischen:** **Tryp.com ApS**, CVR 42533165, Drewsensvej 3, st. th, 5000 Odense C, Dänemark ("Tryp.com", "wir", "uns"),

**und:** **{{creator_name}}**, Mitglied der Tryp.com Creator Community (**{{creator_market}}**) ("du").

Diese Bedingungen sind die Vereinbarung zwischen dir und Tryp.com über deine Teilnahme an der Tryp.com Creator Community ("die Community"). Beitritt und Teilnahme sind kostenlos. Bitte lies sie; die Zusammenfassung unten soll dir helfen, maßgeblich sind aber die nummerierten Abschnitte.

> **Kurz gesagt.** Mitmachen ist immer kostenlos, und Gewinner werden nach veröffentlichten Zahlen bestimmt, nie per Zufall. Deine Videos gehören weiter dir, und du erlaubst uns, sie in unserem Marketing wiederzuverwenden, mit Nennung, wo es geht. Alles, was du für Tryp.com postest, ist Werbung und muss als solche gekennzeichnet sein. Sei freundlich, sei ehrlich und halte deine Zahlungsdaten aktuell. Fragen an ethan@tryp.com.

## 1. Wer mitmachen kann

- **Alter.** Die Community ist für Personen ab **18 Jahren**, und mit dem Akzeptieren dieser Bedingungen bestätigst du, dass du mindestens 18 bist. Die einzige Ausnahme sind Creator, die am 13. Oktober 2026 bereits freigeschaltete Mitglieder waren und damals 16 oder 17 Jahre alt waren: Sie dürfen bleiben, aber nur mit Zustimmung eines Elternteils oder gesetzlichen Vormunds, der diese Bedingungen für sie über einen Link bestätigt, den wir bereitstellen (wir speichern Name, E-Mail und Bestätigung). Dieser Elternteil oder Vormund kann seine Zustimmung jederzeit per E-Mail an ethan@tryp.com widerrufen, und wir dürfen Prämien für diesen Creator zurückhalten, bis die Bestätigung vorliegt. Das VIP-Programm und jeder bezahlte Vertrag sind nur für Personen ab 18 Jahren. Wenn wir feststellen, dass eine andere Person unter 18 ein Konto hat, schließen wir es.
- **Eine Person, ein Konto.** Dein Profil muss dich betreffen und korrekt sein, einschließlich Geburtsdatum und Land. Gib deine Zugangsdaten nicht weiter.
- **Freischaltung.** Das Tryp.com-Team prüft jede Bewerbung und kann sie annehmen oder ablehnen.
- **Kein Arbeitsverhältnis.** Die Teilnahme macht dich nicht zu unserem Arbeitnehmer, Vertreter oder Partner, und du kannst mit anderen Marken arbeiten, außer wie in Abschnitt 5 beschrieben.

## 2. So funktionieren Challenges

- **Die Teilnahme ist kostenlos.** Keine Challenge verlangt jemals eine Zahlung oder einen Kauf.
- **Gewinner werden nach einem festgelegten, objektiven Maßstab bestimmt**, etwa Aufrufen oder Punkten, nach den für die jeweilige Challenge veröffentlichten Regeln. Nichts wird per Zufall oder Verlosung entschieden.
- **Das Briefing jeder Challenge ist für diese Challenge Teil dieser Bedingungen**: Zeitraum, Markt, Plattformen, Punkte, Boni, Boosts, Gruppen, Plätze und Prämien. Weichen Briefing und diese Bedingungen voneinander ab, gilt für diese Challenge das Briefing.
- **Eingereichte Videos müssen dein eigenes, originales Werk sein**, für das Briefing erstellt, während der Challenge öffentlich auf einer zugelassenen Plattform gepostet und online gelassen, bis die Ergebnisse veröffentlicht sind. Videos, die vor Beginn einer Challenge gepostet wurden, zählen nicht, und ein Video zählt nur in einer Challenge.
- **Tryp.com muss im Video selbst vorkommen**: gesagt, auf dem Bildschirm gezeigt oder über die App oder Website gezeigt. Eine Erwähnung nur in der Beschreibung, in Kommentaren oder Hashtags zählt nicht.
- **Aufrufe und Punkte werden automatisch** aus den öffentlichen Zählern jeder Plattform gelesen. Ranglisten sind vorläufig, bis die Ergebnisse veröffentlicht sind, und wir dürfen eine offensichtlich falsche Zahl korrigieren.
- **Fair Play.** Gekaufte, automatisierte oder gefälschte Aufrufe, Likes oder Kommentare, Engagement-Gruppen oder falsche Angaben dazu, wo oder wann ein Video gepostet wurde, führen zur Disqualifikation. Wenn wir begründete Anhaltspunkte haben, können wir einen Beitrag ausschließen oder eine Prämie zurückhalten, und wir sagen dir, warum (Abschnitt 8).

## 3. Prämien, Zahlung und Steuern

- **Geldprämien** werden per Banküberweisung gegen eine Rechnung gezahlt, die wir für dich aus den von dir gespeicherten Zahlungsdaten erstellen (Gutschriftverfahren), in der Regel innerhalb von 30 Tagen nach Veröffentlichung der Ergebnisse. Du musst diese Daten korrekt halten; Geld, das auf ein von dir angegebenes Konto überwiesen wurde, können wir nicht zurückholen.
- **Tryp.com-Gutscheine** gelten für Buchungen auf Tryp.com, sind persönlich, nicht in Geld umtauschbar und haben das bei der Vergabe angegebene Ablaufdatum.
- **Steuern liegen in deiner Verantwortung.** Wir behalten keine Steuern ein und können keine Steuerberatung geben. Wenn du unter 18 bist, sollte dein Elternteil oder Vormund über jede Prämie Bescheid wissen, die du erhältst.
- **Wir können eine Challenge oder eine Prämie ändern oder beenden.** Beenden wir eine laufende Challenge vorzeitig, erfüllen wir die darin bereits verdienten Prämien.

## 4. Werbung kennzeichnen

Alles, was du für Tryp.com postest oder wofür du etwas von Wert von uns erhältst oder erwartest (Geld, einen Gutschein, Punkte für eine Prämie), ist Werbung und muss klar gekennzeichnet sein:

- Setze **#ad**, **#Werbung** oder **Werbung** an den Anfang der Beschreibung oder in den ersten Sekunden auf den Bildschirm. Das Label "Bezahlte Partnerschaft" der Plattform ist willkommen, reicht allein aber nicht.
- Halte dich an die Werberegeln dort, wo dein Publikum ist: im Vereinigten Königreich an den CAP Code und die Leitlinien der CMA zu Empfehlungen; in der EU an die Richtlinie über unlautere Geschäftspraktiken und die Regeln deines Landes für Influencer (in Deutschland insbesondere UWG, MStV und DDG).
- Sag nur, was über Tryp.com und deine eigene Erfahrung wahr ist, und prüfe jeden Preis und jedes Angebot auf Tryp.com am Tag des Postens.

Wenn wir dich bitten, die Kennzeichnung eines Beitrags zu korrigieren, tu das bitte zügig. Ein nicht richtig gekennzeichneter Beitrag kann ausgeschlossen werden.

## 5. Markensicherheit

- Poste für Tryp.com keine Inhalte, die illegal, hasserfüllt, sexuell, gewalttätig oder gefährlich sind oder Menschen verspotten oder täuschen.
- Zeige keine Preise, Angebote oder Verfügbarkeiten, die du nicht am Tag des Postens auf Tryp.com geprüft hast.
- Poste im selben Video keine bezahlten Inhalte für Tryp.com und für einen direkten Wettbewerber (ein anderes Online-Reisebüro oder eine andere Reisebuchungsseite).

## 6. Deine Inhalte und wie wir sie nutzen dürfen

**Alles, was du erstellst, gehört weiter dir.**

Indem du ein Video in einer Challenge einreichst, es irgendwo in der Community hinzufügst oder es anderweitig mit uns teilst, räumst du Tryp.com und seinen Konzerngesellschaften eine **weltweite, nicht exklusive, unentgeltliche Lizenz** ein, die auch nach deinem Austritt fortbesteht, um es:

- in der Community zu zeigen, auch in Ranglisten, Rückblicken und auf der Seite Videoideen;
- **im Marketing von Tryp.com wiederzuverwenden**: auf unserer Website, in der App, in E-Mails, auf unseren Social-Media-Konten und in bezahlter Werbung (auch als Anzeige über unsere Konten oder über deine, wenn die Plattform es erlaubt und du Zugriff gegeben hast);
- für diese Zwecke zu bearbeiten (schneiden, Format ändern, untertiteln, übersetzen, Musik oder unser Branding hinzufügen), solange wir seinen Sinn nicht verändern und dir keine Worte in den Mund legen;
- dich mit Namen, Handle und Profilbild daneben zu nennen.

Wir sind nicht verpflichtet, deine Inhalte zu nutzen, und nennen dich, wo es vernünftigerweise möglich ist. Wenn ein Video aus **künftigem** Marketing herausgehalten werden soll, schreib an ethan@tryp.com; angemessenen Wünschen kommen wir nach. Bereits gebuchte Anzeigen können bis zum Ende ihrer Buchung laufen.

Du bestätigst, dass du die Inhalte teilen darfst, dass alle erkennbaren Personen darin zugestimmt haben (bei Personen unter 18 mit Zustimmung eines Elternteils oder Vormunds) und dass Musik, Aufnahmen oder anderes Material darin für diese Nutzung lizenziert ist.

## 7. Teil der Community sein

Räume, Direktnachrichten und das Board sind gemeinsame Orte. Sei respektvoll. Poste nichts Illegales, Hasserfülltes, Belästigendes, Sexuelles, Täuschendes oder Rechtsverletzendes; spamme nicht und setze andere Mitglieder nicht unter Druck; gib persönliche Daten anderer Mitglieder nicht außerhalb der Community weiter; versuche nicht, auf Konten oder Daten zuzugreifen, die nicht deine sind; und gib dich nicht als jemand anderes aus.

Jede Nachricht hat eine Schaltfläche **Melden**. Meldungen erreichen das Team sofort; wir prüfen sie und teilen beiden Seiten unsere Entscheidung mit.

## 8. Wenn etwas schiefgeht

Wenn Inhalte oder ein Konto gegen diese Bedingungen oder das Gesetz verstoßen, können wir Inhalte entfernen, einen Beitrag ausschließen, ein Konto einschränken oder sperren oder es schließen. **Wir sagen dir, was wir getan haben und warum**, und du kannst verlangen, dass ein Mensch es überprüft, indem du antwortest oder an ethan@tryp.com schreibst. Dies ist unsere Begründung und unser Beschwerdeverfahren nach dem Gesetz über digitale Dienste der EU.

## 9. Das VIP-Programm

Einige Creator ab 18 Jahren werden in das VIP-Programm eingeladen, das nach Aufrufen statt nach Challenges bezahlt wird. VIP-Creator unterzeichnen zusätzlich die **VIP-Creator-Kooperationsvereinbarung**, und offizielle Tryp.com Content Creator die **Vereinbarung für offizielle Content Creator**; jede davon hat Vorrang vor diesen Bedingungen, soweit sie voneinander abweichen.

## 10. Deine Daten

Wie wir deine personenbezogenen Daten verwenden, steht in unserer Datenschutzerklärung (in der App unter Einstellungen und unter /privacy). Wenn du diese Bedingungen akzeptierst, speichern wir die Version, den genauen Text, die Uhrzeit, dein Konto und die Gerätedaten (und, wenn du unter 18 bist, Name und E-Mail deines Elternteils oder Vormunds), damit beide Seiten zeigen können, was vereinbart wurde.

## 11. Andere Plattformen

Instagram, TikTok, YouTube und Facebook haben eigene Bedingungen, auch Regeln zu Markeninhalten, und du musst sie einhalten. Keine dieser Plattformen sponsert die Community oder steht mit ihr in Verbindung.

## 12. Austritt

Du kannst dein Konto jederzeit in den Einstellungen löschen; es wird nach einer Frist von 30 Tagen entfernt. Wir können ein Konto schließen, das gegen diese Bedingungen verstößt, wie in Abschnitt 8 beschrieben. Bereits verdiente und noch nicht ausgezahlte Prämien werden weiterhin gezahlt, außer sie wurden durch einen Verstoß gegen diese Bedingungen verdient.

## 13. Haftung

Die Community wird so bereitgestellt, wie sie ist, ohne Zusage, dass sie immer verfügbar oder fehlerfrei ist. Soweit gesetzlich zulässig, haften wir nicht für indirekte Schäden, entgangene Einnahmen oder Follower oder für das, was eine soziale Plattform mit deinem Konto macht. Nichts hiervon beschränkt eine Haftung, die gesetzlich nicht beschränkt werden kann, oder nimmt dir Rechte, die du als Verbraucher an deinem Wohnort hast.

## 14. Änderungen dieser Bedingungen

Wir können diese Bedingungen aktualisieren. Dann informieren wir dich in der App, zeigen dir, was sich geändert hat, und bitten dich, die neue Version zu akzeptieren, bevor du weitermachst. Jede Version, die du akzeptiert hast, bleibt unter **Einstellungen > Vereinbarungen** verfügbar.

## 15. Recht und Streitigkeiten

Für diese Bedingungen gelten dänisches Recht und die Gerichte Dänemarks. Wenn du in einem anderen EU-Land oder im Vereinigten Königreich lebst, behältst du den Schutz der zwingenden Verbraucherschutzvorschriften deines Landes und kannst dort klagen. Sprich bitte zuerst mit uns: Das meiste lässt sich mit einer Nachricht klären.

## 16. Sprache

Diese Bedingungen sind auf Englisch verfasst. Wenn du sie in der App in einer anderen Sprache liest, hat diese Übersetzung dieselbe Bedeutung; sollten die beiden jemals voneinander abweichen, gilt die englische Fassung, sofern das Recht an deinem Wohnort nichts anderes vorschreibt.

## 17. Kontakt

Tryp.com ApS, Drewsensvej 3, st. th, 5000 Odense C, Dänemark. E-Mail **ethan@tryp.com**, oder schreib dem Tryp.com-Team in der App.

---

In der App akzeptiert von **{{creator_name}}** am {{today}}.$txt$)
  on conflict (agreement_id, locale) do update set title = excluded.title, summary = excluded.summary, body = excluded.body, updated_at = now();
insert into public.agreement_translations (agreement_id, locale, title, summary, body) values ('c9705ec2-c818-4d59-9f87-1635505bab65', 'de', $txt$VIP-Creator-Kooperationsvereinbarung$txt$, $txt$Deine Vereinbarung als VIP-Creator von Tryp.com: was zählt, wie du in {{market}} nach Aufrufen bezahlt wirst, was wir mit deinen Inhalten tun dürfen und wie jede Seite sie beenden kann. Elektronisch unterzeichnet.$txt$, $txt$# VIP-Creator-Kooperationsvereinbarung

**Zwischen:** **Tryp.com ApS**, CVR 42533165, eingetragener Sitz Drewsensvej 3, st. th, 5000 Odense C, Dänemark, vertreten durch **Francesco Lopalco**, Head of Growth (im Folgenden "Tryp.com"),

**und:** **{{creator_name}}** (im Folgenden "der Creator").

Die Parteien vereinbaren Folgendes.

**Voraussetzungen.** Der Creator bestätigt, dass er mindestens 18 Jahre alt ist und diese Vereinbarung frei abschließen kann.

## 1. Gegenstand

Diese Vereinbarung regelt die Teilnahme des Creators am VIP-Programm von Tryp.com in **{{market}}**: das Erstellen und Veröffentlichen von originellen Kurzvideos in sozialen Netzwerken (vor allem TikTok und Instagram, außerdem YouTube Shorts und Facebook), die die Leistungen von Tryp.com kreativ und authentisch bewerben, und die Vergütung für die Aufrufe, die diese Inhalte erzielen.

## 2. Laufzeit und Verlängerung

- Diese Vereinbarung beginnt mit dem Tag der Unterzeichnung und **verlängert sich automatisch von Monat zu Monat**, ohne neue Unterschrift einer Partei.
- Die Verlängerung setzt voraus, dass der Creator weiterhin die Anforderungen aus Ziffer 8 erfüllt.
- Tryp.com kann die Teilnahme des Creators für künftige Monate beenden, wenn (a) der Creator Ziffer 8 nicht erfüllt oder (b) Tryp.com aus betrieblichen oder strategischen Gründen beschließt, die Zusammenarbeit nicht fortzusetzen. Tryp.com kündigt dies mit angemessener Frist schriftlich an (per E-Mail, Direktnachricht oder in der App).
- **2.1 Kündigung durch jede Partei.** Jede Partei kann diese Vereinbarung ohne Angabe von Gründen mit einer **schriftlichen Frist von vierzehn (14) Tagen** zum Ende des laufenden Kalendermonats kündigen.

## 3. Vergütung

- **3.1** Der Creator erhält **{{rate}} pro 1.000 verifizierte Aufrufe** auf berechtigte Inhalte, gezählt wie in Ziffer 7 beschrieben.
- **3.2** Die Vergütung wird aus den verifizierten Aufrufen berechnet und mit ihrer Berechnung auf der VIP-Seite des Creators angezeigt.
- **3.3 Berechtigte Inhalte.** Berechtigt sind nur Inhalte, die Tryp.com klar und ausdrücklich **im Video selbst** zeigen: eine sichtbare und/oder gesprochene Erwähnung von Tryp.com (zum Beispiel eine gesprochene Nennung, Text auf dem Bildschirm, eine Vorführung der Plattform oder Markenelemente). Tryp.com nur in Beschreibung, Kommentaren oder Hashtags zu markieren, reicht **nicht**. Rein inspirierende Inhalte, Inhalte ohne Bezug zu den Leistungen von Tryp.com oder Inhalte, in denen die Marke im Video nicht sichtbar ist, sind nicht berechtigt, unabhängig von ihren Aufrufen. Tryp.com entscheidet nach billigem Ermessen, ob ein Inhalt berechtigt ist.
- **3.4 Boni und Challenges.** Tryp.com kann Boni und Challenges für VIP-Creator anbieten (zum Beispiel Preise für die meisten Aufrufe oder einen Gutschein für das beste Video zu einem Thema). Die Regeln werden auf der VIP-Seite des Creators veröffentlicht und zusätzlich zu 3.1 gezahlt. Stellt eine Challenge eine Frage zu einem Video (zum Beispiel, ob es Hotel und Flug zeigt), beantwortet der Creator sie wahrheitsgemäß, und Tryp.com entscheidet nach billigem Ermessen, ob ein Video passt. Ein Gutschein gilt für Buchungen auf Tryp.com, ist persönlich und nicht in Geld umtauschbar.

## 4. Vorteile des VIP-Programms

- Regelmäßiges Feedback zu Inhalten und strategische Begleitung, in Gruppensitzungen und/oder Einzelgesprächen per Chat, schriftlichem Feedback, Sprachnachrichten oder Videoanrufen, nach Ermessen von Tryp.com.
- Ein direkter Draht zum Marketingteam von Tryp.com, einschließlich der privaten VIP-Räume.
- Die Möglichkeit, für künftige bezahlte Kooperationen oder Creator-Rollen berücksichtigt zu werden.
- Die Möglichkeit gemeinsamer Beiträge mit Tryp.com auf Instagram, vorbehaltlich der Zustimmung von Tryp.com.
- Bevorzugte Berücksichtigung in künftigen Kampagnen für {{market}}.

## 5. Geistiges Eigentum und Nutzung der Inhalte

- **5.1 Eigentum.** Alle Inhalte, die der Creator im Rahmen dieser Vereinbarung erstellt ("Inhalte"), bleiben geistiges Eigentum des Creators.
- **5.2 Lizenz an Tryp.com.** Der Creator räumt Tryp.com und seinen Konzerngesellschaften eine **nicht exklusive, unentgeltliche, weltweite und zeitlich unbegrenzte Lizenz** ein, die Inhalte sowie Namen, Bild, Erscheinungsbild und Stimme des Creators, wie sie darin vorkommen, zu nutzen, um sie: auf der Website, in der App, in E-Mails und in den sozialen Netzwerken von Tryp.com zu teilen und erneut zu posten; als bezahlte Werbung zu schalten, über die Konten von Tryp.com oder, wenn die Plattform es erlaubt und der Creator Zugriff gegeben hat, über die des Creators (zum Beispiel TikTok Spark Ads oder Instagram-Partnerschaftsanzeigen); für diese Zwecke zu bearbeiten (schneiden, Format ändern, untertiteln, übersetzen, Musik oder Branding hinzufügen), ohne ihren Sinn zu verändern; und sie in der Creator-Plattform von Tryp.com zu zeigen. Tryp.com nennt den Creator, wo es vernünftigerweise möglich ist, und ist nicht verpflichtet, Inhalte zu nutzen.
- **5.3 Exklusivität der Inhalte.** (a) Für **zwölf (12) Monate** nach der Veröffentlichung wird der Creator die konkreten, für Tryp.com erstellten Inhalte keiner anderen kommerziellen Marke lizenzieren, verkaufen oder für sie wiederverwenden, insbesondere nicht im Reise- oder Tourismusbereich. (b) Während dieser Vereinbarung und für zwölf (12) Monate nach ihrem Ende wird der Creator das genaue Inhaltsformat, den visuellen Stil oder die Vorlage oder das konkrete Videokonzept, die in dieser Zusammenarbeit entwickelt wurden, nicht für eine andere kommerzielle Marke oder einen anderen Sponsor nutzen, nachahmen oder lizenzieren. Allgemeine Schnitttechniken und allgemeine Branchentrends sind nicht eingeschränkt.
- **5.4** Der Creator bestätigt, dass er alle Bestandteile der Inhalte (einschließlich Musik und Aufnahmen) besitzt oder lizenziert hat und dass alle darin gezeigten Personen zugestimmt haben. Auf Wunsch des Creators stellt Tryp.com die Nutzung eines Inhalts in künftigem Marketing auf angemessene Anfrage ein; bereits veröffentlichtes oder gebuchtes Material darf weiterlaufen.

## 6. Wettbewerber

Solange diese Vereinbarung besteht, veröffentlicht der Creator ohne schriftliche Zustimmung von Tryp.com keine gesponserten oder bezahlten Inhalte für **direkte Wettbewerber** von Tryp.com (Online-Reisebüros und Reisebuchungsseiten wie Booking.com, Expedia, Skyscanner, Kiwi.com, eDreams oder Trip.com). Andere Marken sind erlaubt, solange sie nicht im selben Video wie Tryp.com erscheinen.

## 7. Zahlung und Erfassung der Aufrufe

- **7.1 Videos hinzufügen.** Der Creator fügt jedes berechtigte Video sofort nach dem Posten mit seinem öffentlichen Link auf seiner VIP-Seite in der Creator-Plattform von Tryp.com hinzu. Die Aufrufe werden dann automatisch aus dem öffentlichen Zähler jeder Plattform gelesen, mindestens täglich und mit einer abschließenden Erfassung am Monatsende. Tryp.com kann Screenshots oder Bildschirmaufnahmen der plattformeigenen Statistiken verlangen, um eine Zahl zu prüfen.
- **7.2 Monatliche Zeiträume.** Jeder Zeitraum läuft vom ersten Tag des Monats um 00:00 Uhr bis zum letzten Tag um 23:59 Uhr (in der Zeitzone deines Marktes). **Für einen Zeitraum werden nur Aufrufe bezahlt, die innerhalb dieses Zeitraums erzielt wurden**, auf Videos, die in den vorangegangenen {{window_days}} Tagen gepostet wurden. Aufrufe nach dem Ende eines Zeitraums werden für ihn nicht bezahlt und nicht übertragen.
- **7.3 Prüfung.** Tryp.com prüft alle Aufrufe und die Berechtigung (Ziffer 3.3). Die von Tryp.com geprüften Zahlen sind für die Zahlung maßgeblich. Betrügerische, gekaufte oder künstlich erhöhte Aufrufe (einschließlich Bots oder Engagement-Gruppen) machen den betroffenen Inhalt nicht vergütungsfähig.
- **7.4 Guthaben und Mindestauszahlung.** Die monatliche Vergütung wird dem VIP-Guthaben des Creators gutgeschrieben. Geld wird ausgezahlt, sobald das Guthaben **{{min_payout}}** erreicht; darunter wird es von Monat zu Monat übertragen. Stattdessen kann der Creator das Guthaben jederzeit ab {{voucher_min}} als **Tryp.com-Reisegutschein** nehmen.
- **7.5 Zahlungsobergrenze.** {{payment_cap}}
- **7.6 Rechnungen und Zahlung.** Tryp.com erstellt die Rechnung für jede Geldauszahlung aus den Zahlungsdaten, die der Creator in der Plattform speichert (Gutschriftverfahren), und der Creator stellt für denselben Betrag keine eigene Rechnung aus. Die Zahlung erfolgt per Banküberweisung innerhalb von **30 Tagen** nach Freigabe einer Auszahlung, sofern die Daten vollständig und korrekt sind.
- **7.7 Steuern.** Der Creator ist selbständig tätig und ist dafür verantwortlich, alle Steuern und Sozialabgaben auf seine Einnahmen in seinem eigenen Land zu erklären und zu zahlen.
- **7.8 Änderungen.** Tryp.com kann Vergütungssatz, Obergrenze oder Mindestbeträge für künftige Monate mit mindestens 14 Tagen Vorankündigung in der App ändern. Bereits verdiente Beträge werden nie gekürzt.

## 8. Leistungsanforderungen

{{stay_in}}

## 9. Kennzeichnung

Jedes Video muss klar als Werbung gekennzeichnet sein (**#ad**, **#Werbung** oder **Werbung**, am Anfang der Beschreibung oder auf dem Bildschirm), gemäß den Regeln dort, wo das Publikum ist, und den Bedingungen der Tryp.com Creator Community.

## 10. Vertraulichkeit

Der Creator gibt vertrauliche Informationen, die Tryp.com während oder nach dieser Vereinbarung teilt, nicht weiter, einschließlich Vergütungssätzen, Abrechnungen, Marketingstrategien, Briefings vor dem Start, interner Kommunikation und Kampagnendaten. Das hindert den Creator nicht daran zu sagen, dass er mit Tryp.com zusammenarbeitet.

## 11. Verhaltenskodex und Markenschutz

Tryp.com kann die Teilnahme des Creators mit oder ohne vorherige Ankündigung sofort aussetzen oder beenden, wenn der Creator sich unangemessen, unprofessionell, schädlich oder im Widerspruch zu den Werten, dem Ruf oder den Community-Standards von Tryp.com verhält. Dazu gehören respektloses, beleidigendes oder diskriminierendes Verhalten; Handlungen oder Konflikte, die anderen Creatorn oder der Community schaden; Verhalten, das Marke, Ruf oder Geschäft von Tryp.com schädigen kann; und jeder Verstoß gegen Community-Richtlinien, ethische Standards oder Plattformrichtlinien. Bereits geprüfte Vergütungen werden gezahlt, außer sie beruhen auf einem schweren Verstoß.

## 12. Selbständigkeit

Der Creator arbeitet selbständig und ist weder Arbeitnehmer noch Vertreter oder Partner von Tryp.com. Der Creator entscheidet, wie, wann und wo er seine Inhalte erstellt, und kann vorbehaltlich der Ziffern 5.3 und 6 mit anderen Marken arbeiten.

## 13. Daten

Tryp.com verwendet die personenbezogenen Daten des Creators, um das Programm durchzuführen und ihn zu bezahlen, wie in der Datenschutzerklärung beschrieben. Bei der Unterzeichnung speichert Tryp.com den genauen unterzeichneten Text, die Uhrzeit, das Konto und die E-Mail-Adresse, die Unterschrift sowie Geräte- und Netzwerkdaten, damit beide Parteien zeigen können, was vereinbart wurde.

## 14. Anwendbares Recht und Gerichtsstand

Diese Vereinbarung unterliegt dem Recht **Dänemarks**, und für Streitigkeiten sind die zuständigen Gerichte Dänemarks zuständig, unbeschadet zwingender Schutzvorschriften, die dem Creator nach dem Recht seines Wohnsitzlandes zustehen.

## 15. Gesamte Vereinbarung und Unterzeichnung

- Diese Vereinbarung, die Bedingungen der Tryp.com Creator Community und die Angaben auf der VIP-Seite des Creators bilden die gesamte Vereinbarung über das VIP-Programm und ersetzen jede frühere VIP-Vereinbarung zwischen den Parteien. Bei Abweichungen gilt diese Vereinbarung.
- Tryp.com kann diese Vereinbarung aktualisieren; der Creator wird gebeten, die neue Version in der App zu lesen und zu unterzeichnen, und kann die Vereinbarung stattdessen nach Ziffer 2.1 kündigen.
- Die Parteien unterzeichnen elektronisch. Der getippte Name oder die gezeichnete Unterschrift des Creators, abgegeben aus seinem angemeldeten Konto, hat dieselbe Wirkung wie eine handschriftliche Unterschrift (Verordnung (EU) 910/2014, eIDAS).
- Diese Vereinbarung ist auf Englisch verfasst. Liest und unterzeichnet der Creator sie in der App in einer anderen Sprache, hat diese Übersetzung dieselbe Bedeutung; sollten die beiden jemals voneinander abweichen, gilt die englische Fassung, sofern zwingendes Recht am Wohnort des Creators nichts anderes vorschreibt. Tryp.com bewahrt eine Kopie beider Fassungen auf.

---

**Für Tryp.com ApS:** Francesco Lopalco, Head of Growth

**Der Creator:** {{creator_name}}, unterzeichnet unten am {{today}}$txt$)
  on conflict (agreement_id, locale) do update set title = excluded.title, summary = excluded.summary, body = excluded.body, updated_at = now();
insert into public.agreement_translations (agreement_id, locale, title, summary, body) values ('ba59ca85-d630-4fd0-bea9-c58c243d5132', 'ro', $txt$Termenii Comunității$txt$, $txt$Salut, {{creator_name}}. Acestea sunt regulile Comunității de Creatori Tryp.com: cum funcționează provocările și premiile, cum îți marchezi postările ca reclamă, cum putem folosi videoclipurile pe care le împărtășești și cum ne poți contacta. Comunitatea este pentru creatori de 18 ani sau mai mult.$txt$, $txt$# Termenii Comunității de Creatori Tryp.com

**Între:** **Tryp.com ApS**, CVR 42533165, Drewsensvej 3, st. th, 5000 Odense C, Danemarca ("Tryp.com", "noi"),

**și:** **{{creator_name}}**, membru al Comunității de Creatori Tryp.com (**{{creator_market}}**) ("tu").

Acești termeni sunt acordul dintre tine și Tryp.com privind participarea ta în Comunitatea de Creatori Tryp.com ("Comunitatea"). Înscrierea și participarea în Comunitate sunt gratuite. Te rugăm să-i citești; rezumatul de mai jos te ajută, dar contează secțiunile numerotate.

> **Pe scurt.** Participarea este mereu gratuită, iar câștigătorii sunt stabiliți după cifre publicate, niciodată prin noroc. Videoclipurile tale rămân ale tale și ne permiți să le refolosim în marketingul nostru, cu mențiunea ta acolo unde se poate. Tot ce postezi pentru Tryp.com este reclamă și trebuie să spună asta. Fii amabil, fii sincer și ține-ți datele de plată la zi. Întrebările la ethan@tryp.com.

## 1. Cine se poate înscrie

- **Vârsta.** Comunitatea este pentru persoane de **18 ani sau mai mult**, iar acceptând acești termeni confirmi că ai cel puțin 18 ani. Singura excepție este un creator care era deja membru aprobat la 13 octombrie 2026 și avea atunci 16 sau 17 ani: poate rămâne, dar numai cu acordul unui părinte sau tutore legal, care confirmă acești termeni pentru el printr-un link pe care îl oferim (păstrăm numele, emailul și confirmarea acestuia). Acel părinte sau tutore își poate retrage acordul oricând scriind la ethan@tryp.com, iar noi putem amâna premiile acelui creator până primim confirmarea. Programul VIP și orice contract plătit sunt doar pentru persoane de 18 ani sau mai mult. Dacă aflăm că o altă persoană sub 18 ani are un cont, îl închidem.
- **O persoană, un cont.** Profilul tău trebuie să fie despre tine și corect, inclusiv data nașterii și țara. Nu îți împărți datele de autentificare.
- **Aprobarea.** Echipa Tryp.com analizează fiecare cerere și o poate aproba sau respinge.
- **Nu este un loc de muncă.** Participarea nu te face angajatul, agentul sau partenerul nostru și ești liber să lucrezi cu alte branduri, cu excepția celor prevăzute în secțiunea 5.

## 2. Cum funcționează provocările

- **Participarea este gratuită.** Nicio provocare nu cere vreodată o plată sau o cumpărătură.
- **Câștigătorii sunt stabiliți după un criteriu obiectiv și anunțat**, cum ar fi vizualizările sau punctele, conform regulilor publicate pentru fiecare provocare. Nimic nu se decide prin noroc sau tragere la sorți.
- **Regulamentul fiecărei provocări face parte din acești termeni pentru acea provocare**: datele, piața, platformele, punctele, bonusurile, boost-urile, grupurile, locurile și premiile. Dacă regulamentul și acești termeni diferă, pentru acea provocare se aplică regulamentul.
- **Videoclipurile înscrise trebuie să fie munca ta originală**, făcute pentru regulament, postate public pe o platformă permisă în timpul provocării și lăsate online până la publicarea rezultatelor. Videoclipurile postate înainte de începerea unei provocări nu contează, iar un videoclip contează într-o singură provocare.
- **Tryp.com trebuie să apară în videoclipul propriu-zis**: spus, afișat pe ecran sau prin aplicație ori site. O mențiune doar în descriere, comentarii sau hashtaguri nu contează.
- **Vizualizările și punctele sunt citite automat** din contoarele publice ale fiecărei platforme. Clasamentele sunt provizorii până la publicarea rezultatelor și putem corecta o cifră evident greșită.
- **Joc corect.** Vizualizările, aprecierile sau comentariile cumpărate, automate sau false, grupurile de interacțiune ori informațiile false despre unde sau când a fost postat un videoclip duc la descalificare. Când avem motive rezonabile, putem exclude un videoclip sau reține un premiu și îți spunem de ce (secțiunea 8).

## 3. Premii, plăți și taxe

- **Premiile în bani** se plătesc prin transfer bancar pe baza unei facturi pe care o pregătim pentru tine din datele de plată pe care le salvezi (autofacturare), de regulă în 30 de zile de la publicarea rezultatelor. Trebuie să ții aceste date corecte; nu putem recupera banii trimiși într-un cont pe care ni l-ai dat.
- **Voucherele Tryp.com** sunt pentru rezervări pe Tryp.com, sunt personale, nu pot fi schimbate pe bani și au termenul de valabilitate afișat la acordare.
- **Taxele sunt responsabilitatea ta.** Nu reținem impozite și nu putem oferi consultanță fiscală. Dacă ai sub 18 ani, părintele sau tutorele tău trebuie să știe de orice premiu primești.
- **Putem modifica sau încheia o provocare ori un premiu.** Dacă încheiem mai devreme o provocare în desfășurare, onorăm premiile deja câștigate în ea.

## 4. Să spui că este reclamă

Tot ce postezi pentru Tryp.com, sau pentru care primești ori aștepți ceva de valoare de la noi (bani, un voucher, puncte pentru un premiu), este reclamă și trebuie marcat clar:

- Pune **#ad**, **#reclama** sau **Reclamă** la începutul descrierii sau pe ecran în primele secunde. Eticheta "Parteneriat plătit" a platformei este binevenită, dar singură nu este suficientă.
- Respectă regulile de publicitate din locul unde se află publicul tău: în Regatul Unit, CAP Code și ghidul CMA privind recomandările; în UE, Directiva privind practicile comerciale neloiale și regulile țării tale pentru influenceri.
- Spune doar ce este adevărat despre Tryp.com și experiența ta și verifică orice preț sau ofertă pe Tryp.com chiar în ziua în care postezi.

Dacă îți cerem să corectezi marcajul unei postări, te rugăm să o faci repede. Un videoclip care nu este marcat corect poate fi exclus.

## 5. Siguranța brandului

- Nu posta pentru Tryp.com conținut ilegal, care incită la ură, sexual, violent sau periculos ori care ia în râs sau înșală oamenii.
- Nu afișa prețuri, oferte sau disponibilitate pe care nu le-ai verificat pe Tryp.com în ziua în care postezi.
- Nu posta în același videoclip conținut plătit pentru Tryp.com și pentru un concurent direct (altă agenție de turism online sau alt site de rezervări de călătorii).

## 6. Conținutul tău și cum îl putem folosi

**Tot ce creezi rămâne al tău.**

Când înscrii un videoclip într-o provocare, îl adaugi oriunde în Comunitate sau îl împărtășești altfel cu noi, acorzi Tryp.com și companiilor din grupul său o **licență mondială, neexclusivă și gratuită**, care continuă și după ce pleci, pentru a:

- îl afișa în Comunitate, inclusiv în clasamente, recapitulări și pe pagina Idei de videoclipuri;
- **îl refolosi în marketingul Tryp.com**: site-ul, aplicația, emailurile, conturile noastre de social media și publicitatea plătită (inclusiv ca reclamă din conturile noastre sau din ale tale, când platforma permite și ne-ai dat acces);
- îl edita pentru aceste utilizări (tăiere, redimensionare, subtitrare, traducere, adăugare de muzică sau a brandului nostru), fără să-i schimbăm sensul sau să-ți punem în gură cuvinte pe care nu le-ai spus;
- te menționa cu numele, contul și poza de profil alături de el.

Nu suntem obligați să folosim conținutul tău și te menționăm acolo unde este rezonabil posibil. Dacă vrei ca un videoclip să nu mai fie folosit în marketingul **viitor**, scrie la ethan@tryp.com și vom da curs cererilor rezonabile; reclamele deja rezervate pot rula până la sfârșitul rezervării.

Confirmi că ai dreptul să împărtășești conținutul, că toate persoanele recognoscibile în el au fost de acord să apară (cu acordul unui părinte sau tutore pentru cei sub 18 ani) și că orice muzică, imagini sau alt material din el sunt licențiate pentru această utilizare.

## 7. Să faci parte din Comunitate

Camerele, mesajele directe și panoul sunt spații comune. Fii respectuos. Nu posta nimic ilegal, care incită la ură, hărțuitor, sexual, înșelător sau care încalcă drepturi; nu trimite spam și nu pune presiune pe alți membri; nu împărtăși în afara Comunității datele personale ale altor membri; nu încerca să accesezi conturi sau date care nu sunt ale tale; și nu te da drept altcineva.

Fiecare mesaj are un buton **Raportează**. Raportările ajung imediat la echipă; le analizăm și le spunem ambelor părți ce am decis.

## 8. Dacă ceva nu merge bine

Când un conținut sau un cont încalcă acești termeni sau legea, putem elimina conținutul, exclude un videoclip, limita sau suspenda un cont ori îl putem închide. **Îți spunem ce am făcut și de ce**, iar tu poți cere ca o persoană să revizuiască decizia răspunzând sau scriind la ethan@tryp.com. Aceasta este expunerea noastră de motive și procedura noastră de reclamații conform Regulamentului UE privind serviciile digitale.

## 9. Programul VIP

Unii creatori de 18 ani sau mai mult sunt invitați în programul VIP, care este plătit în funcție de vizualizări, nu de provocări. Creatorii VIP semnează în plus **Acordul de colaborare pentru creatori VIP**, iar creatorii de conținut oficiali Tryp.com semnează **Acordul pentru creatori de conținut oficiali**; fiecare are prioritate față de acești termeni acolo unde diferă.

## 10. Datele tale

Felul în care folosim datele tale personale este explicat în Politica noastră de confidențialitate (în aplicație, la Setări, și la /privacy). Când accepți acești termeni, păstrăm o evidență a versiunii, a textului exact, a orei, a contului tău și a datelor dispozitivului (și, dacă ai sub 18 ani, numele și emailul părintelui sau tutorelui tău), ca oricare dintre noi să poată arăta ce s-a convenit.

## 11. Alte platforme

Instagram, TikTok, YouTube și Facebook au propriii termeni, inclusiv reguli despre conținutul de brand, și trebuie să-i respecți. Niciuna dintre ele nu sponsorizează Comunitatea și nu are legătură cu ea.

## 12. Plecarea

Îți poți șterge contul oricând din Setări; este eliminat după o perioadă de grație de 30 de zile. Putem închide un cont care încalcă acești termeni, așa cum explică secțiunea 8. Premiile deja câștigate și încă neplătite se plătesc în continuare, cu excepția celor câștigate prin încălcarea acestor termeni.

## 13. Răspundere

Comunitatea este oferită așa cum este, fără promisiunea că va fi mereu disponibilă sau fără erori. În măsura permisă de lege, nu răspundem pentru pierderi indirecte, venituri sau urmăritori pierduți ori pentru ce face o platformă socială cu contul tău. Nimic de aici nu limitează răspunderea care nu poate fi limitată prin lege și nu îți ia drepturile pe care le ai ca consumator acolo unde locuiești.

## 14. Modificarea acestor termeni

Putem actualiza acești termeni. Când o facem, te anunțăm în aplicație, îți arătăm ce s-a schimbat și îți cerem să accepți noua versiune înainte să continui. Fiecare versiune pe care ai acceptat-o rămâne disponibilă la **Setări > Acorduri**.

## 15. Legea aplicabilă și litigii

Acești termeni sunt guvernați de legea daneză și de instanțele din Danemarca. Dacă locuiești în altă țară din UE sau în Regatul Unit, păstrezi protecția normelor obligatorii de protecție a consumatorilor din țara ta și poți acționa în instanță acolo. Te rugăm să vorbești mai întâi cu noi: aproape totul se rezolvă cu un mesaj.

## 16. Limba

Acești termeni sunt redactați în engleză. Dacă îi citești în altă limbă în aplicație, acea traducere are același înțeles; dacă vreodată cele două diferă, se aplică versiunea în engleză, cu excepția cazului în care legea locului unde trăiești prevede altfel.

## 17. Contact

Tryp.com ApS, Drewsensvej 3, st. th, 5000 Odense C, Danemarca. Email **ethan@tryp.com**, sau scrie-i echipei Tryp.com în aplicație.

---

Acceptat în aplicație de **{{creator_name}}** la {{today}}.$txt$)
  on conflict (agreement_id, locale) do update set title = excluded.title, summary = excluded.summary, body = excluded.body, updated_at = now();
insert into public.agreement_translations (agreement_id, locale, title, summary, body) values ('c9705ec2-c818-4d59-9f87-1635505bab65', 'ro', $txt$Acord de colaborare pentru creatori VIP$txt$, $txt$Acordul tău ca creator VIP Tryp.com: ce contează, cum ești plătit pentru vizualizări în {{market}}, ce putem face cu conținutul tău și cum poate fiecare parte să-l încheie. Semnat electronic.$txt$, $txt$# Acord de colaborare pentru creatori VIP

**Între:** **Tryp.com ApS**, CVR 42533165, cu sediul social în Drewsensvej 3, st. th, 5000 Odense C, Danemarca, reprezentată de **Francesco Lopalco**, Head of Growth (denumită în continuare "Tryp.com"),

**și:** **{{creator_name}}** (denumit în continuare "Creatorul").

Părțile convin următoarele.

**Eligibilitate.** Creatorul confirmă că are cel puțin 18 ani și că este liber să încheie acest Acord.

## 1. Obiectul

Acest Acord stabilește condițiile participării Creatorului la programul VIP Tryp.com în **{{market}}**: crearea și publicarea de conținut original în format scurt pe rețelele sociale (în principal TikTok și Instagram, de asemenea YouTube Shorts și Facebook) care promovează serviciile Tryp.com în mod creativ și autentic, și plata pentru vizualizările obținute de acest conținut.

## 2. Durată și reînnoire

- Acest Acord începe la data semnării și **se reînnoiește automat de la o lună la alta**, fără o nouă semnătură a vreuneia dintre părți.
- Reînnoirea depinde de faptul că Creatorul continuă să îndeplinească cerințele de la clauza 8.
- Tryp.com poate încheia participarea Creatorului pentru lunile viitoare dacă (a) Creatorul nu îndeplinește clauza 8 sau (b) Tryp.com decide să nu continue colaborarea din motive operaționale sau strategice. Tryp.com va trimite o notificare scrisă cu un termen rezonabil (prin email, mesaj direct sau în aplicație).
- **2.1 Încetarea de către oricare parte.** Oricare parte poate înceta acest Acord din orice motiv, cu o **notificare scrisă de paisprezece (14) zile** înainte de sfârșitul lunii calendaristice în curs.

## 3. Remunerație

- **3.1** Creatorul câștigă **{{rate}} la fiecare 1.000 de vizualizări verificate** pe conținut eligibil, numărate conform clauzei 7.
- **3.2** Câștigurile sunt calculate din vizualizările verificate și afișate, împreună cu modul de calcul, pe pagina VIP a Creatorului.
- **3.3 Conținut eligibil.** Este eligibil doar conținutul care prezintă clar și explicit Tryp.com **în videoclipul propriu-zis**: o mențiune vizibilă și/sau rostită a Tryp.com (de exemplu, o referire rostită, text pe ecran, o demonstrație a platformei sau elemente vizuale de brand). Etichetarea Tryp.com doar în descriere, comentarii sau hashtaguri **nu** este suficientă. Conținutul pur inspirațional, fără legătură cu serviciile Tryp.com sau care nu include vizibil brandul în videoclip nu este eligibil, indiferent de vizualizări. Tryp.com decide, în mod rezonabil, dacă un conținut este eligibil.
- **3.4 Bonusuri și provocări.** Tryp.com poate organiza bonusuri și provocări pentru creatorii VIP (de exemplu, premii pentru cele mai multe vizualizări sau un voucher pentru cel mai bun videoclip pe o temă). Regulile lor sunt publicate pe pagina VIP a Creatorului și se plătesc în plus față de 3.1. Când o provocare pune o întrebare despre un videoclip (de exemplu, dacă prezintă hotel și zbor), Creatorul răspunde sincer, iar Tryp.com decide, în mod rezonabil, dacă videoclipul se încadrează. Un voucher este pentru rezervări pe Tryp.com, este personal și nu poate fi schimbat pe bani.

## 4. Beneficiile programului VIP

- Feedback regulat despre conținut și îndrumare strategică, prin sesiuni de grup și/sau discuții individuale prin chat, feedback scris, mesaje vocale sau apeluri video, la latitudinea Tryp.com.
- O legătură directă cu echipa de marketing Tryp.com, inclusiv camerele VIP private.
- Posibilitatea de a fi luat în considerare pentru viitoare colaborări plătite sau roluri de creator.
- Posibilitatea unor postări în colaborare cu Tryp.com pe Instagram, cu aprobarea Tryp.com.
- Includere prioritară în campaniile viitoare pentru {{market}}.

## 5. Proprietate intelectuală și utilizarea conținutului

- **5.1 Proprietate.** Tot conținutul realizat de Creator în baza acestui Acord ("Conținutul") rămâne proprietatea intelectuală a Creatorului.
- **5.2 Licența acordată Tryp.com.** Creatorul acordă Tryp.com și companiilor din grupul său o **licență neexclusivă, gratuită, mondială și perpetuă** de a folosi Conținutul, precum și numele, imaginea, înfățișarea și vocea Creatorului așa cum apar în el, pentru: a-l distribui și reposta pe site-ul, în aplicația, în emailurile și pe canalele de social media ale Tryp.com; a-l folosi ca publicitate plătită, din conturile Tryp.com sau, acolo unde platforma permite și Creatorul a dat acces, din conturile Creatorului (de exemplu TikTok Spark Ads sau reclame de parteneriat pe Instagram); a-l edita pentru aceste utilizări (tăiere, redimensionare, subtitrare, traducere, adăugare de muzică sau brand) fără a-i schimba sensul; și a-l afișa în platforma de creatori Tryp.com. Tryp.com îl va menționa pe Creator acolo unde este rezonabil posibil și nu este obligată să folosească vreun Conținut.
- **5.3 Exclusivitatea conținutului.** (a) Timp de **douăsprezece (12) luni** de la publicare, Creatorul nu va licenția, vinde sau refolosi Conținutul specific realizat pentru Tryp.com cu niciun alt brand comercial, în special din domeniul călătoriilor sau al turismului. (b) Pe durata acestui Acord și timp de douăsprezece (12) luni după încetarea lui, Creatorul nu va folosi, reproduce sau licenția pentru alt brand comercial ori sponsor formatul exact de conținut, stilul vizual sau șablonul ori conceptul video specific dezvoltate în această colaborare. Tehnicile generale de editare și tendințele generale din industrie nu sunt restricționate.
- **5.4** Creatorul confirmă că deține sau are licență pentru tot ce se află în Conținut (inclusiv muzica și imaginile) și că toate persoanele care apar în el au fost de acord. La cererea Creatorului, Tryp.com va înceta să folosească un Conținut în marketingul viitor, la o cerere rezonabilă; materialele deja publicate sau rezervate pot rula în continuare.

## 6. Concurenți

Pe durata acestui Acord, Creatorul nu va posta conținut sponsorizat sau plătit pentru **concurenți direcți** ai Tryp.com (agenții de turism online și site-uri de rezervări de călătorii, precum Booking.com, Expedia, Skyscanner, Kiwi.com, eDreams sau Trip.com) fără aprobarea scrisă a Tryp.com. Alte branduri sunt permise, cu condiția să nu apară în același videoclip cu Tryp.com.

## 7. Plăți și numărarea vizualizărilor

- **7.1 Adăugarea videoclipurilor.** Creatorul adaugă fiecare videoclip eligibil pe pagina sa VIP din platforma de creatori Tryp.com, cu linkul public, imediat ce îl postează. Vizualizările sunt apoi citite automat din contorul public al fiecărei platforme, cel puțin zilnic și cu o citire finală la sfârșitul fiecărei luni. Tryp.com poate cere capturi sau înregistrări de ecran ale statisticilor native pentru a verifica o cifră.
- **7.2 Perioade lunare.** Fiecare perioadă începe în prima zi a lunii la ora 00:00 și se termină în ultima zi la ora 23:59 (în fusul orar al pieței tale). **Într-o perioadă se plătesc doar vizualizările obținute în acea perioadă**, pe videoclipuri postate în ultimele {{window_days}} zile. Vizualizările obținute după încheierea unei perioade nu se plătesc pentru ea și nu se reportează.
- **7.3 Verificare.** Tryp.com verifică toate vizualizările și eligibilitatea (clauza 3.3). Cifrele verificate de Tryp.com sunt definitive pentru plată. Vizualizările frauduloase, cumpărate sau umflate artificial (inclusiv boți sau grupuri de interacțiune) fac acel conținut neeligibil pentru plată.
- **7.4 Sold și plata minimă.** Câștigurile lunare se adaugă la soldul VIP al Creatorului. Banii se plătesc când soldul ajunge la **{{min_payout}}**; sub acest prag, se reportează de la o lună la alta. În schimb, Creatorul poate lua oricând soldul sub forma unui **voucher de călătorie Tryp.com**, după ce ajunge la {{voucher_min}}.
- **7.5 Plafonul plăților.** {{payment_cap}}
- **7.6 Facturi și plată.** Tryp.com pregătește factura pentru fiecare plată în bani din datele de plată pe care Creatorul le salvează în platformă (autofacturare), iar Creatorul nu va emite o factură separată pentru aceeași sumă. Plata se face prin transfer bancar în termen de **30 de zile** de la aprobarea plății, cu condiția ca datele să fie complete și corecte.
- **7.7 Taxe.** Creatorul este un colaborator independent și răspunde de declararea și plata tuturor impozitelor și contribuțiilor sociale aferente câștigurilor sale, în propria țară.
- **7.8 Modificări.** Tryp.com poate modifica tariful, plafonul sau pragurile minime pentru lunile viitoare cu o notificare de cel puțin 14 zile în aplicație. Câștigurile deja obținute nu sunt niciodată reduse.

## 8. Cerințe de performanță

{{stay_in}}

## 9. Marcarea ca reclamă

Fiecare videoclip trebuie marcat clar ca reclamă (**#ad**, **#reclama** sau **Reclamă**, la începutul descrierii sau pe ecran), conform regulilor din locul unde se află publicul și Termenilor Comunității de Creatori Tryp.com.

## 10. Confidențialitate

Creatorul nu va dezvălui informațiile confidențiale împărtășite de Tryp.com în timpul sau după acest Acord, inclusiv tarife, situații de plată, strategii de marketing, briefuri înainte de lansare, comunicări interne și date despre campanii. Acest lucru nu îl împiedică pe Creator să spună că lucrează cu Tryp.com.

## 11. Cod de conduită și protecția brandului

Tryp.com poate suspenda sau înceta imediat participarea Creatorului, cu sau fără notificare prealabilă, dacă acesta se comportă în mod nepotrivit, neprofesionist, dăunător sau contrar valorilor, reputației ori standardelor comunității Tryp.com. Aceasta include comportamentul lipsit de respect, abuziv sau discriminatoriu; acțiunile sau conflictele care îi afectează pe alți creatori sau comunitatea; comportamentul care poate afecta brandul, reputația sau afacerea Tryp.com; și orice încălcare a regulilor comunității, a standardelor etice sau a politicilor platformelor. Câștigurile deja verificate se plătesc, cu excepția celor care provin dintr-o încălcare gravă.

## 12. Colaborator independent

Creatorul lucrează independent și nu este angajatul, agentul sau partenerul Tryp.com. Creatorul decide cum, când și unde își face conținutul și poate lucra cu alte branduri, sub rezerva clauzelor 5.3 și 6.

## 13. Date

Tryp.com folosește datele personale ale Creatorului pentru a gestiona programul și a-l plăti, așa cum este explicat în Politica de confidențialitate. Când Creatorul semnează, Tryp.com păstrează o evidență a textului exact semnat, a orei, a contului și a emailului, a semnăturii și a datelor dispozitivului și ale rețelei, ca ambele părți să poată arăta ce s-a convenit.

## 14. Legea aplicabilă și jurisdicția

Acest Acord este guvernat de legile **Danemarcei**, iar litigiile sunt de competența instanțelor competente din Danemarca, fără a înlătura vreo protecție obligatorie de care Creatorul beneficiază conform legii țării în care locuiește.

## 15. Acordul integral și semnarea

- Acest Acord, Termenii Comunității de Creatori Tryp.com și datele de pe pagina VIP a Creatorului reprezintă întregul acord privind programul VIP și înlocuiesc orice acord VIP anterior între părți. Acolo unde diferă, prevalează acest Acord.
- Tryp.com poate actualiza acest Acord; Creatorului i se va cere să citească și să semneze noua versiune în aplicație și poate, în schimb, să înceteze Acordul conform clauzei 2.1.
- Părțile semnează electronic. Numele tastat sau semnătura desenată a Creatorului, date din contul său autentificat, au același efect ca o semnătură olografă (Regulamentul (UE) 910/2014, eIDAS).
- Acest Acord este redactat în engleză. Dacă Creatorul îl citește și îl semnează în altă limbă în aplicație, acea traducere are același înțeles; dacă vreodată cele două diferă, se aplică versiunea în engleză, cu excepția cazului în care legea obligatorie a locului unde trăiește Creatorul prevede altfel. Tryp.com păstrează o copie a ambelor.

---

**Pentru Tryp.com ApS:** Francesco Lopalco, Head of Growth

**Creatorul:** {{creator_name}}, semnează mai jos la {{today}}$txt$)
  on conflict (agreement_id, locale) do update set title = excluded.title, summary = excluded.summary, body = excluded.body, updated_at = now();

-- 3 + grants, LAST (every CREATE FUNCTION above re-ran lock_down_definer_functions). ---------------------------------
insert into public.public_rpc_allowlist (proname, reason) values
  ('guardian_consent_view', 'Parent or guardian opens their confirmation link with no account (token-gated)'),
  ('guardian_consent_confirm', 'Parent or guardian confirms with no account (token-gated)')
on conflict do nothing;
insert into public.owner_only_rpcs (proname, why) values
  ('agreement_render_l', 'Internal: renders agreement text'),
  ('agreement_localize', 'Internal: picks a translation'),
  ('agreement_lang', 'Internal: picks a language'),
  ('trg_adults_only', 'Trigger'),
  ('trg_agreement_translation_locked', 'Trigger')
on conflict do nothing;
select public.lock_down_definer_functions();

