-- 379: THE OFFICIAL CREATOR AGREEMENT, AND A SIGNED COPY FOR BOTH SIDES (10 Oct 2026).
--
-- Ethan: "now that we have some team members on here you need to have a contract for them too ... I've attached the
-- current contract for official content creators and for the VIP creators, both of these need to be signed and
-- retained, a copy for us and a copy for them in settings etc that they can download ... ensure it's all legal and all
-- the info is correct."
--
-- The official agreement is written from the signed Content Creator Agreement (ES) of 25 Mar 2026 (Tryp.com ApS, signed
-- for the company by Francesco Lopalco): purpose and territory, deliverables, a monthly fee plus a rate per 1,000 views,
-- the branding rule, a cap, monthly invoicing and payment within 30 days, freelancer status, confidentiality, the OTA
-- non-compete, company ownership with a portfolio licence back, 14 days' notice, Danish law. What changed from that
-- text: the numbers are each creator's own (filled in from their row), views are read by the platform instead of a
-- Looker Studio dashboard, the "15 street interviews" became the written monthly formats of 2.2 (it is not everybody's
-- deal), the IP clause assigns "to the extent the law allows" (Danish and Spanish law keep moral rights), the
-- challenges and their questions are covered, and it says plainly that this is no staff or admin role.
--
-- It is an agreement of audience 'vip' tied to the official programme, so the existing machinery (the sign-in gate,
-- Settings > Agreements, the register) handles it; agreement_for (376) never gives an official creator the VIP text.
-- IT IS A DRAFT. Ethan (or the team) reads it and presses Publish on Admin > Agreements; until then nobody is asked.

CREATE OR REPLACE FUNCTION public.agreement_render(p_body text, p_profile uuid, p_programme uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_name text; v_market text; v_country text; pr public.vip_programmes; m public.vip_members; v_rate numeric; v_cap numeric;
  v_sym text; v_territory text;
  v text := coalesce(p_body, '');
begin
  select coalesce(nullif(btrim(name), ''), 'the Creator'), nullif(btrim(country), '') into v_name, v_country from public.profiles where id = p_profile;
  -- 366: the markets they are a CREATOR in today (a left or managed market is not where they are a member), joined
  -- "Portugal and Spain". Nobody but Worldwide reads "Worldwide" (see the Community Terms parties line).
  select regexp_replace(string_agg(c.name, ', ' order by c.name), ', ([^,]+)$', ' and \1') into v_market
    from public.community_members cm join public.communities c on c.id = cm.community_id
   where cm.profile_id = p_profile and c.slug <> 'worldwide' and c.retired_at is null
     and cm.status = 'active' and cm.role = 'creator';
  select * into m from public.vip_members where profile_id = p_profile;
  select * into pr from public.vip_programmes where id = coalesce(p_programme, m.programme_id);
  if pr.id is null then select * into pr from public.vip_programmes where is_default and active and kind = 'vip' limit 1; end if;
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
  -- 379: the official creator agreement's own lines.
  v_sym := case upper(coalesce(pr.currency, 'EUR')) when 'GBP' then '£' else '€' end;
  select c.name into v_territory from public.communities c where c.id = pr.community_id;
  v := replace(v, '{{territory}}', coalesce(case when v_territory = 'Worldwide' then 'the markets Tryp.com agrees with the Creator' else v_territory end, '[territory]'));
  v := replace(v, '{{start_date}}', to_char(now() at time zone 'Europe/Copenhagen', 'FMDD FMMonth YYYY') || ' (the date this Agreement is signed)');
  v := replace(v, '{{monthly_fee}}', case when coalesce(m.monthly_fee, 0) > 0 then public.agreement_money(m.monthly_fee, pr.currency) else '[monthly fee]' end);
  v := replace(v, '{{monthly_fee_clause}}', case
         when p_profile is null then 'A fixed monthly fee of **[monthly fee]**[, for each calendar month in which the Creator publishes at least [N] eligible videos].'
         when coalesce(m.monthly_fee, 0) > 0 then 'A fixed monthly fee of **' || public.agreement_money(m.monthly_fee, pr.currency) || '**'
              || case when coalesce(m.fee_min_videos, 0) > 0 then ', for each calendar month in which the Creator publishes at least **' || m.fee_min_videos || '** eligible videos.'
                      else ', for each calendar month of active collaboration.' end
         else 'No fixed monthly fee, unless Tryp.com agrees one with the Creator in writing.' end);
  v := replace(v, '{{views_cap}}', case
         when p_profile is null then 'Views pay is capped at **[cap]** per calendar month, or not capped, as set for the Creator.'
         when v_cap is not null then 'Views pay is capped at **' || public.agreement_money(v_cap, pr.currency) || '** per calendar month'
              || case when coalesce(m.monthly_fee, 0) > 0 then ', so the most a month can pay, before challenge bonuses, is **' || public.agreement_money(v_cap + m.monthly_fee, pr.currency) || '**.' else '.' end
         else 'Views pay has no monthly cap. Tryp.com may introduce one for future months only by agreement in writing.' end);
  v := replace(v, '{{invoicing}}', case
         when coalesce(m.invoice_outside, false) then 'At the end of each calendar month the Creator sends Tryp.com a valid invoice for the total earned that month (monthly fee plus views pay).'
         else 'At the end of each calendar month Tryp.com prepares the invoice for the total earned (monthly fee plus views pay) from the payment details the Creator saves on the platform (self-billing). The Creator checks it and does not issue a separate invoice for the same amount.' end);
  v := replace(v, '{{today}}', to_char(now() at time zone 'Europe/Copenhagen', 'FMDD FMMonth YYYY'));
  return v;
end $function$;


-- THE DRAFT, for every official programme that exists (today: Tryp.com Official Spain).
insert into public.agreements (audience, programme_id, version, title, summary, body, requires_signature)
select 'vip', p.id, 1, 'Official Content Creator Agreement', $AG$Your agreement as an official Tryp.com content creator in {{territory}}: what you make, your monthly fee and views pay, how views are counted and paid, who owns the videos, and how either side can end it. Signed electronically.$AG$, $AG$# Official Content Creator Agreement

**Between:** **Tryp.com ApS**, CVR 42533165, registered address Drewsensvej 3, st. th, 5000 Odense C, Denmark, represented by **Francesco Lopalco**, Head of Growth (hereinafter "Tryp.com" or "the Company"),

**and:** **{{creator_name}}** (hereinafter "the Creator").

**Start date of the services:** {{start_date}}.

Both parties agree as follows.

**Eligibility.** The Creator confirms they are at least 18 years old and free to enter into this Agreement.

## 1. Purpose

This Agreement governs the Creator's freelance collaboration with Tryp.com as an **official Tryp.com content creator**. Its focus is building brand awareness and user acquisition in **{{territory}}** ("the Territory") through high-quality, engaging short-form video.

Being an official creator is a content role. It does not make the Creator a member of Tryp.com's staff and gives no access to Tryp.com's internal systems, admin tools, or other creators' data.

## 2. Services and deliverables

- **2.1 Content creation.** The Creator actively creates, films, edits and posts video content, primarily for TikTok and Instagram Reels (and, where agreed, YouTube Shorts and Facebook), aimed at the Territory and following Tryp.com's brand guidelines and briefs.
- **2.2 Formats.** Tryp.com may set in writing (on the Creator's page in the Tryp.com creator platform, by message or by email) the formats it needs in a month, for example a minimum number of street interviews. Those written instructions form part of this Agreement for that month.
- **2.3 Community engagement.** The Creator engages with the audience on their content, responds to comments in a way that reflects well on Tryp.com, and helps build a loyal following for Tryp.com.
- **2.4 Collaboration.** The Creator works with Tryp.com's marketing team to align on content strategy, and takes part in the official creators' briefs, challenges and feedback sessions.
- **2.5 Adding videos.** The Creator adds every video made under this Agreement to their page on the Tryp.com creator platform, with its public link, as soon as it is posted. Where a challenge asks a question about a video (for example whether it features a hotel and a flight), the Creator answers it truthfully. Tryp.com decides, acting reasonably, whether a video fits a challenge.

## 3. Compensation

- **3.1 Monthly fee.** {{monthly_fee_clause}}
- **3.2 Views pay.** **{{rate}} per 1,000 organic views** gained in the calendar month on eligible content, counted as set out in clause 4.
- **3.3 Branding requirement.** Content is eligible for views pay only if Tryp.com is clearly shown or said **in the video itself**: a spoken mention, on-screen text, the Tryp.com logo, or the Tryp.com app or website on screen. A mention only in the caption, comments or hashtags is not enough.
- **3.4 Cap.** {{views_cap}}
- **3.5 Challenges and bonuses.** Tryp.com may run challenges and bonuses for the official creators (for example a voucher for the most-viewed video on a theme). Their rules are published on the Creator's page and are paid on top of 3.1 and 3.2. A voucher is for booking on Tryp.com, is personal and cannot be exchanged for cash.

## 4. Tracking and payment

- **4.1 Tracking.** Views are read automatically from each platform's public count on the Tryp.com creator platform, at least daily, with a final reading at the end of each month. Tryp.com may ask for screenshots or screen recordings of the native analytics to verify a count. Views are counted per calendar month in the Territory's time zone, on videos posted in that month.
- **4.2 Verification.** Tryp.com verifies all views and eligibility. Its verified numbers are final for payment. Views that are fraudulent, purchased or artificially inflated (including bots or engagement pods) are not paid.
- **4.3 Invoicing.** {{invoicing}}
- **4.4 Payment.** Tryp.com pays by bank transfer within **thirty (30) days** of receiving a correct and undisputed invoice (or, where Tryp.com prepares it, of approving it).
- **4.5 Changes.** Tryp.com may change the fee, rate or cap for future months only by agreement in writing (a message in the app is enough). Amounts already earned are never reduced.

## 5. Freelancer status

- **5.1 Independent contractor.** The Creator works as an independent contractor. This Agreement does not create an employment relationship. The Creator decides how, when and where to make their content.
- **5.2 Tax.** The Creator is solely responsible for their own taxes, social security contributions and legal registrations in their country of residence.

## 6. Confidentiality

The Creator keeps confidential all of Tryp.com's non-public information shared during or after this Agreement, including fees and rates, statements, strategy, briefs before launch, internal communications and campaign data. This does not stop the Creator saying they work with Tryp.com.

## 7. Exclusivity and non-competition

- **7.1 Direct competitors.** While this Agreement lasts, the Creator will not provide content creation or promotional services to direct competitors of Tryp.com in online travel booking (for example Booking.com, Skyscanner, Kiwi.com, Expedia, eDreams or Trip.com).
- **7.2 Prior approval.** If the Creator is unsure whether a brand is a competitor, they ask Tryp.com in writing before accepting the collaboration.

## 8. Intellectual property and use of content

- **8.1 Company ownership.** All videos and other material the Creator makes for Tryp.com under this Agreement ("Content") belong to Tryp.com. To the extent the law allows, the Creator assigns to Tryp.com all rights in the Content, including the right to use, edit, adapt and run it as paid advertising, worldwide and without time limit. Where the law does not allow an assignment, the Creator grants Tryp.com an exclusive, worldwide, perpetual, royalty-free licence for the same uses. The Creator's moral rights (such as being named as the author) are not affected.
- **8.2 Name and likeness.** The Creator allows Tryp.com to use their name, image, likeness and voice as they appear in the Content, for those uses.
- **8.3 The Creator's own use.** Tryp.com grants the Creator a non-exclusive, royalty-free, worldwide and perpetual licence to keep the Content on their personal social media channels and to show it in their professional portfolio.
- **8.4 Third-party material.** The Creator confirms that any music, footage or other material in the Content is licensed for these uses, and that everyone recognisable in it agreed to appear.

## 9. Advertising disclosure

Every video made under this Agreement is advertising and must be clearly labelled (**#ad**, **Ad** or **Advertisement**, at the start of the caption or on screen), following the rules where the audience is and each platform's branded-content rules.

## 10. Conduct and brand protection

Tryp.com may suspend or end this Agreement immediately if the Creator behaves in a way that is unlawful, abusive, discriminatory, dishonest, or that seriously damages Tryp.com's reputation, other creators or the community. Amounts already earned are paid, unless they came from that breach.

## 11. Term and termination

- **11.1 Term.** This Agreement starts on the start date above and continues month to month.
- **11.2 Notice.** Either party may end it at any time by giving **fourteen (14) days' written notice** (email or a message in the app).
- **11.3 After it ends.** Clauses 6, 8 and 13 continue to apply. Fees and views pay earned up to the end date are paid as set out in clause 4.

## 12. Data

Tryp.com uses the Creator's personal data to run the collaboration and to pay them, as set out in its Privacy Policy. When the Creator signs, Tryp.com keeps a record of the exact text signed, the time, the account and email, the signature, and the device and network details, so both parties can show what was agreed. Both parties can download a copy of the signed Agreement at any time.

## 13. Governing law and language

This Agreement is governed by the laws of **Denmark**, and disputes are subject to the competent courts of Denmark. It is drafted and signed in English; any translation is for convenience.

## 14. Entire agreement and signature

- This Agreement, the written instructions in clause 2.2 and the Tryp.com Creator Community Terms are the whole agreement between the parties about this collaboration, and replace any earlier content creator agreement between them from the start date. Where they differ, this Agreement wins.
- Any change must be agreed in writing. If Tryp.com publishes a new version, the Creator is asked to read and sign it in the app, and may end the Agreement under clause 11.2 instead.
- The parties sign electronically. The Creator's typed name or drawn signature, given from their signed-in account, has the same effect as a handwritten signature (EU Regulation 910/2014, eIDAS).

---

**For Tryp.com ApS:** Francesco Lopalco, Head of Growth

**The Creator:** {{creator_name}}, signing below on {{today}}
$AG$, true
  from public.vip_programmes p
 where p.kind = 'official'
   and not exists (select 1 from public.agreements a where a.audience = 'vip' and a.programme_id = p.id);

-- THE VIP DRAFT (unpublished, nobody has signed it): bonuses and their questions were not covered. Clause 3.4 now is,
-- matching what the platform does since migration 377. Edited in place because no version has been published.
update public.agreements
   set body = replace(body,
         E'Tryp.com decides, acting reasonably, whether content is eligible.\n',
         E'Tryp.com decides, acting reasonably, whether content is eligible.\n- **3.4 Bonuses and challenges.** Tryp.com may run bonuses and challenges for VIP creators (for example prizes for the most views, or a voucher for the best video on a theme). Their rules are published on the Creator''s VIP page and paid on top of 3.1. Where a challenge asks a question about a video (for example whether it features a hotel and a flight), the Creator answers it truthfully, and Tryp.com decides, acting reasonably, whether a video fits. A voucher is for booking on Tryp.com, is personal and cannot be exchanged for cash.\n'),
       updated_at = now()
 where audience = 'vip' and programme_id is null and published_at is null
   and body not like '%3.4 Bonuses and challenges%';

-- THE COMMUNITY TERMS DRAFT: section 9 names the official agreement too.
update public.agreements
   set body = replace(body,
         'VIP creators also sign the separate **VIP Creator Collaboration Agreement**, which takes priority over these terms where the two differ.',
         'VIP creators also sign the separate **VIP Creator Collaboration Agreement**, and official Tryp.com content creators sign the **Official Content Creator Agreement**; each takes priority over these terms where the two differ.'),
       updated_at = now()
 where audience = 'creator' and published_at is null;

-- A NEW VERSION'S NOTICE NAMES THE DOCUMENT, not "the VIP agreement", now that one audience holds two documents.
create or replace function public.publish_agreement(p_agreement uuid, p_notify boolean default true)
returns void language plpgsql security definer set search_path = public as $$
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
       and (not v_first or a.audience = 'vip');
  end if;
end $$;

-- THE TEAM'S COPY of one signed agreement: the exact text signed and the evidence, for the PDF on Admin > Agreements.
create or replace function public.agreement_signed_copy(p_agreement uuid, p_profile uuid)
returns table (agreement_id uuid, title text, audience text, version integer, published_at timestamptz, profile_id uuid, name text,
               accepted_at timestamptz, method text, signed_name text, signature_svg text, body_sha256 text, rendered_body text,
               account_email text, ip text, user_agent text, locale text, guardian_name text, guardian_email text)
language sql stable security definer set search_path = public as $$
  select a.id, a.title, a.audience, a.version, a.published_at, p.id, p.name, x.accepted_at, x.method, x.signed_name, x.signature_svg,
         x.body_sha256, x.rendered_body, x.account_email, x.ip, x.user_agent, x.locale, x.guardian_name, x.guardian_email
    from public.agreement_acceptances x
    join public.agreements a on a.id = x.agreement_id
    join public.profiles p on p.id = x.profile_id
   where x.agreement_id = p_agreement and x.profile_id = p_profile
     and (public.is_admin() or x.profile_id = auth.uid())
$$;
revoke all on function public.agreement_signed_copy(uuid, uuid) from anon;
