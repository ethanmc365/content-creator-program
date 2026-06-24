# Personal Data Breach Response Plan

GDPR Articles 33 & 34: if personal data is breached, you must notify your
supervisory authority **within 72 hours** of becoming aware (unless the breach
is unlikely to be a risk to people), and notify affected individuals if the risk
to them is high. This plan makes that achievable. Replace **[PLACEHOLDER]** values.

## Key contacts
- **Controller:** Tryp.com LDA, Lisbon, Portugal — info@tryp.com
- **Breach lead:** [NAME / ROLE] — [email/phone]  ← name a specific person
- **Supervisory authority:** Comissão Nacional de Proteção de Dados (CNPD), Portugal — https://www.cnpd.pt (breach notification via the CNPD website)
- **Processors to alert if involved:** Supabase, Vercel, Cloudflare, Resend (support/security contacts)

## What counts as a breach
Any accidental or unlawful destruction, loss, alteration, unauthorised disclosure of, or
access to personal data. Examples: leaked database/credentials, a misconfigured RLS policy
exposing data, a stolen admin laptop, a processor reporting an incident, malware.

## Step-by-step (start the clock the moment you become aware)

1. **Contain (hour 0–2):** stop the leak — rotate keys/passwords (Supabase service role, PATs,
   VAPID, webhook secret), revoke sessions, disable the affected feature/account, take notes with timestamps.
2. **Assess (hour 0–24):** what data, how many people, what could happen to them (identity theft,
   contact exposure, etc.). Record findings in the log below.
3. **Decide on notification (by hour 48):**
   - Risk to individuals? → notify the supervisory authority **within 72 h**.
   - High risk to individuals? → also notify the affected people **without undue delay**.
   - No real risk? → you may not need to notify, but **document the reasoning**.
4. **Notify the authority (by hour 72):** nature of the breach, categories & approximate number of
   people and records, likely consequences, measures taken/proposed, DPO/contact. If you don't have
   everything yet, send what you have and follow up.
5. **Notify individuals (if high risk):** plain-language email — what happened, likely impact, what
   you've done, what they should do (e.g. change password), and a contact.
6. **Recover & learn:** fix root cause, run a Supabase advisor + RLS review, write a short post-mortem,
   update this plan.

## Breach log (fill one block per incident)
```
Incident ID:
Discovered (date/time, by whom):
72-hour deadline (discovered + 72h):
What happened:
Data & people affected (categories, approx counts):
Risk assessment (low / risk / high risk) + reasoning:
Authority notified? (Y/N, date/time, reference):
Individuals notified? (Y/N, date/time, how):
Containment & remediation actions:
Root cause:
Follow-up / prevention:
```

## Worked example
> **Discovered:** 12 Mar 2027, 09:10 — a creator reported they could see another creator's phone
> number via the API.
> **72-hour deadline:** 15 Mar 2027, 09:10.
> **What happened:** a new RLS policy on `creator_private` was missing the `is_admin()` check, so any
> signed-in creator could read others' phone numbers for ~6 hours.
> **Affected:** phone numbers of ~40 creators (special category data: no).
> **Risk:** "risk" (contact data exposed) but not "high risk" (no financial/credential data) → notify
> the authority, individual notice not strictly required but we chose to email affected creators.
> **Actions:** reverted the policy within 30 min, audited all `creator_private` policies, ran the
> Supabase security advisor, confirmed no other tables affected, logged access.
> **Authority notified:** 12 Mar 2027, 16:00 (within 72 h), reference #DPC-2027-xxxx.
> **Root cause:** policy shipped without review. **Prevention:** add an RLS test to the deploy checklist.
