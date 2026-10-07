-- 358: the VIP agreement rewritten from the contract VIPs actually signed (7 Oct 2026). Still DRAFTS.
--
-- Source: "Creator Collaboration Agreement - Tryp.com VIP Competition" (Tryp.com ApS, signed by Francesco Lopalco and
-- Jessica Nieto Sanchez on 2 Oct 2026). Kept: the parties, month-to-month renewal and 14 days' notice, CPM on eligible
-- content and what makes content eligible, the VIP benefits, the 12-month content exclusivity, verification and
-- fraudulent views, the minimum payout with vouchers below it, the payment cap, views counted inside the month, the
-- stay-in requirement, confidentiality, code of conduct, Danish law, entire agreement.
-- Removed (Ethan): Prizes (s.4) and the Trip Prize (s.9). Changed: views are read by the platform, so the 48-hour email
-- report is replaced by adding each video on the VIP page; the content licence is wider than the signed contract's
-- per-use approval, because Ethan asked for the right to use creators' content.
-- Market numbers are placeholders filled from each VIP programme (migration 357).
-- THIS IS A CAREFUL TEMPLATE, NOT LEGAL ADVICE.

update public.agreements
   set title = 'VIP Creator Collaboration Agreement',
       summary = 'Your agreement as a Tryp.com VIP creator: what counts, how you are paid by views in {{market}}, what we may do with your content, and how either side can end it. Signed electronically.',
       body = $body$
# VIP Creator Collaboration Agreement

**Between:** **Tryp.com ApS**, registered address Drewsensvej 3, st. th, 5000 Odense C, Denmark, represented by **Francesco Lopalco**, Head of Growth (hereinafter "Tryp.com"),

**and:** **{{creator_name}}** (hereinafter "the Creator").

Both parties agree as follows.

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
- Signed in English. Any translation is for convenience.

---

**For Tryp.com ApS:** Francesco Lopalco, Head of Growth

**The Creator:** {{creator_name}}, signing below on {{today}}
$body$,
       updated_at = now()
 where audience = 'vip' and programme_id is null and version = 1 and published_at is null;

-- The Community Terms name the same company and law as the contracts creators sign.
update public.agreements
   set body = replace(replace(replace(body,
         '**Tryp.com LDA** (Rua da Prata, nr. 80, 5.º piso, 1100-420 Lisbon, Portugal, "Tryp.com", "we", "us")',
         '**Tryp.com ApS** (Drewsensvej 3, st. th, 5000 Odense C, Denmark, "Tryp.com", "we", "us")'),
         'These terms are governed by Portuguese law and the courts of Lisbon.',
         'These terms are governed by Danish law and the competent courts of Denmark.'),
         '- **Bought, automated or fake engagement',
         '- **Tryp.com has to be in the video itself**: said, shown on screen or shown on the app. Tagging Tryp.com only in the caption, comments or hashtags does not count.' || chr(10) || '- **Bought, automated or fake engagement'),
       updated_at = now()
 where audience = 'creator' and version = 1 and published_at is null;
