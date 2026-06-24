# Records of Processing Activities (RoPA)

GDPR Article 30 requires a register of what personal data you process and why.
Keep this file up to date whenever you add a feature that touches personal data.
Replace the **[PLACEHOLDER]** fields with your real details.

## Controller
- **Controller:** Tryp.com LDA, Rua da Prata, nr. 80, 5.º piso, 1100-420 Lisbon, Portugal
  - (Alternative group entity: Tryp.com ApS, Drewsensvej 3, st. th, 5000 Odense C, Denmark — use this instead if the Creator Program is operated by the Danish entity.)
- **Contact for data protection:** info@tryp.com
- **DPO:** Not appointed (not currently required). Review if processing scale grows.
- **EU/UK representative:** N/A — controller is established in the EU (Portugal).
- **Lead supervisory authority:** Comissão Nacional de Proteção de Dados (CNPD), Portugal — https://www.cnpd.pt

## Processing activities

| # | Activity | Data subjects | Personal data | Purpose | Lawful basis | Retention |
|---|----------|---------------|---------------|---------|--------------|-----------|
| 1 | Account & authentication | Creators, admins | Name, email, hashed password, IP (login/rate-limit) | Create and secure accounts | Contract; Legitimate interests (security) | Life of account; security logs pruned within ~1 hour |
| 2 | Creator profile | Creators | Photo, date of birth, city/country, bio, about, favourite quote, social links, languages, countries visited, travel photos | Run the community/profile features | Contract | Life of account (then 30-day deletion grace) |
| 3 | Private contact | Creators | Phone number (+ dial code) | Let the Team contact creators | Legitimate interests / Consent | Life of account |
| 4 | Community content | Creators | Chat messages, DMs, submissions, reactions, poll votes, connections, referrals | Provide community features | Contract | Life of account |
| 5 | Notifications | Creators, admins | Email address, push subscription tokens, preferences | Send opted-in email/push alerts | Consent | Until withdrawn / account deleted |
| 6 | Application review | Applicants | Profile + email | Approve/decline new members | Legitimate interests | Declined = deleted; approved = life of account |
| 7 | Security / anti-abuse | All visitors | IP, rate-limit records, Cloudflare Turnstile signals | Prevent brute force, spam, bots | Legitimate interests | Short-lived |

## Processors (Article 28 — sign a DPA with each)
| Processor | Role | Location | Transfer safeguard | DPA |
|-----------|------|----------|--------------------|-----|
| Supabase | Database, auth, file storage | Switzerland | EU adequacy decision | [link/date] |
| Vercel | App hosting / CDN | US/global | DPF / SCCs | [link/date] |
| Cloudflare | Turnstile, CDN | US/global | DPF / SCCs | [link/date] |
| Resend | Transactional/notification email | US | DPF / SCCs | [link/date] |

## Data subject rights — how they're handled
- **Access / portability:** self-service "Download my data" (Edit profile → Your data & account) exports JSON.
- **Rectification:** self-service via Edit profile.
- **Erasure:** self-service "Delete my account" (30-day grace, then automatic permanent purge); admins can also delete.
- **Restriction / objection / withdraw consent:** notification toggles; otherwise email info@tryp.com.
- **Complaints:** data subjects may complain to the CNPD (Portugal, https://www.cnpd.pt).

## Technical & organisational measures (Article 32)
Row-Level Security on all tables; member-gated reads; auth rate-limiting (5/15 min);
Cloudflare Turnstile on auth; ES256-signed JWTs; secrets held server-side only;
least-privilege database function grants; encrypted in transit (HTTPS) and at rest (Supabase).
