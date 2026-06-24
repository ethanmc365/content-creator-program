import LegalShell, { H2 } from './LegalShell'

// NOTE: Replace the [PLACEHOLDER] values with your real legal details before
// relying on this. This is a starting template, not legal advice.
export default function PrivacyPolicy() {
  return (
    <LegalShell title="Privacy Policy" updated="24 June 2026">
      <p>
        This policy explains how the Tryp.com Content Creator Program ("the Program", "we", "us")
        collects and uses your personal data, and the rights you have under the EU General Data
        Protection Regulation (GDPR) and UK GDPR.
      </p>

      <H2>1. Who we are</H2>
      <p>
        The data controller is <strong>[LEGAL ENTITY NAME]</strong>, [REGISTERED ADDRESS],
        [COUNTRY]. For any privacy question or to exercise your rights, contact us at{' '}
        <strong>[PRIVACY CONTACT EMAIL]</strong>.
      </p>

      <H2>2. The data we collect</H2>
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>Account:</strong> name, email address, password (stored hashed by our auth provider).</li>
        <li><strong>Profile:</strong> photo, date of birth (we display only your age), city/country, bio, "about" text, favourite quote, social links, languages, countries visited, and travel photos you upload.</li>
        <li><strong>Private contact:</strong> phone number (visible only to the Tryp.com Team, never to other creators).</li>
        <li><strong>Content:</strong> chat messages, direct messages, challenge submissions, reactions, poll votes, referrals.</li>
        <li><strong>Technical:</strong> IP address and rate-limiting records (kept briefly for security), device push-subscription tokens (if you enable notifications), and essential session storage in your browser.</li>
      </ul>

      <H2>3. Why we use it, and our legal basis</H2>
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>To run the Program</strong> (your account, profile, community features) — <em>performance of a contract</em>.</li>
        <li><strong>To review applications and keep the community safe</strong> (moderation, security, anti-spam) — <em>legitimate interests</em>.</li>
        <li><strong>Notifications by email/push</strong> — <em>consent</em>, which you can withdraw at any time in Notification settings.</li>
        <li><strong>Legal and security obligations</strong> (e.g. responding to lawful requests) — <em>legal obligation</em> / <em>legitimate interests</em>.</li>
      </ul>

      <H2>4. Who we share it with</H2>
      <p>We don't sell your data. We use a small number of processors to run the service:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>Supabase</strong> — database, authentication and file storage (hosted in Switzerland).</li>
        <li><strong>Vercel</strong> — application hosting/CDN.</li>
        <li><strong>Cloudflare</strong> — bot protection (Turnstile) and content delivery.</li>
        <li><strong>Resend</strong> — transactional and notification emails.</li>
      </ul>

      <H2>5. International transfers</H2>
      <p>
        Supabase processes data in Switzerland, which the EU recognises as providing adequate
        protection. Some processors (Vercel, Cloudflare, Resend) may process data in the United
        States; where they do, transfers are covered by the EU-US Data Privacy Framework and/or
        Standard Contractual Clauses.
      </p>

      <H2>6. How long we keep it</H2>
      <p>
        We keep your data for as long as your account is active. If you delete your account, it is
        scheduled for permanent deletion after a 30-day grace period (during which you, or an admin,
        can restore it). Security records such as rate-limiting logs are kept only briefly. Some
        records may be retained longer where the law requires.
      </p>

      <H2>7. Your rights</H2>
      <p>You have the right to access, correct, delete, restrict or object to the processing of your data, to data portability, and to withdraw consent at any time. In the app you can:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>Access &amp; portability:</strong> download a copy of your data from Edit profile → "Your data &amp; account".</li>
        <li><strong>Rectify:</strong> edit your profile at any time.</li>
        <li><strong>Erase:</strong> delete your account from Edit profile → "Your data &amp; account".</li>
      </ul>
      <p>You also have the right to lodge a complaint with your local data protection authority.</p>

      <H2>8. Cookies &amp; storage</H2>
      <p>
        We use only essential browser storage to keep you logged in. We do not use advertising or
        third-party tracking cookies.
      </p>

      <H2>9. Children</H2>
      <p>The Program is not for anyone under 16, and we don't knowingly collect data from under-16s.</p>

      <H2>10. Changes</H2>
      <p>We'll update this page if our practices change and revise the "last updated" date above.</p>
    </LegalShell>
  )
}
