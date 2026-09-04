import LegalShell, { H2 } from './LegalShell'

// PRIVACY POLICY, REWRITTEN 4 SEP 2026.
//
// Ethan: "I would properly update the privacy policy now, within the legal
// things that you think we need to have."
//
// WHAT WAS WRONG WITH THE OLD ONE. It was accurate about the product as it
// existed in June 2026 and the product has moved a long way since. The gaps
// were not stylistic:
//
//  * PAYMENT DETAILS WERE NOT MENTIONED AT ALL. The platform collects bank
//    account details, addresses and tax information in order to pay prize money
//    and raises invoices against them. A policy that does not mention the most
//    sensitive category of data the service holds is not merely incomplete, it
//    is wrong.
//  * NEITHER WAS ANY OF: the flight log, the collab board, the calendar, the
//    games, milestones, read receipts, or the automatic reading of view counts
//    off submitted links - which is processing of a creator's public
//    performance data on a schedule, and is exactly the sort of thing somebody
//    would want told to them.
//  * The processor list was short by three (OpenStreetMap for geocoding,
//    Google Fonts for the typeface, the four social platforms the view sync
//    reads from).
//
// The controller is Tryp.com LDA, the entity on tryp.com's own public policy.
// THIS IS A TEMPLATE WRITTEN CAREFULLY, NOT LEGAL ADVICE - have a lawyer read
// it before it is relied on, and keep the "last updated" date honest.
export default function PrivacyPolicy() {
  return (
    <LegalShell title="Privacy Policy" updated="4 September 2026">
      <p>
        This policy explains how the Tryp.com Content Creator Community ("the Programme", "we", "us")
        collects and uses your personal data, and the rights you have under the EU General Data
        Protection Regulation (GDPR) and the UK GDPR. It is written to be read, not to be survived.
      </p>

      <H2>1. Who we are</H2>
      <p>
        The data controller is <strong>Tryp.com LDA</strong>, Rua da Prata, nr. 80, 5.º piso,
        1100-420 Lisbon, Portugal. For any privacy question, or to exercise any of the rights in
        section 8, contact us at <strong>info@tryp.com</strong>. We will answer within one month.
      </p>

      <H2>2. The data we collect</H2>
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>Account:</strong> name, email address, and a password stored only as a hash by our authentication provider. We never see your password.</li>
        <li><strong>Profile:</strong> photo, date of birth, town and country, bio, "about" text, favourite quote, links to your social accounts, languages you speak, countries you have visited, places on your bucket list, and any travel photographs you upload.</li>
        <li><strong>Your date of birth is not held on your public profile.</strong> It is stored in a separate private record and only your age in years is shown to other creators.</li>
        <li><strong>Private contact details:</strong> phone number and dialling code. Visible to the Tryp.com Team only, never to other creators.</li>
        <li><strong>Payment details, if you win a prize:</strong> account holder name, bank account or IBAN, billing address, and any tax or company reference you give us. Held so that prize money can actually be paid, snapshotted onto each invoice we raise, and visible only to the Tryp.com Team.</li>
        <li><strong>Content you create:</strong> messages in community rooms and direct messages, challenge entries and the links you submit, reactions, poll answers, board questions and answers, referrals, feedback and reports.</li>
        <li><strong>Travel data you choose to add:</strong> flights you log, trips you post to the collaboration board, calendar entries and event RSVPs.</li>
        <li><strong>Activity in the Programme:</strong> challenge results and points, prizes and vouchers awarded, milestones reached, game scores and streaks, connections with other creators, and when you were last active.</li>
        <li><strong>Performance data about your entries:</strong> the public view count of each video you submit, read automatically from the link you gave us (see section 5).</li>
        <li><strong>Technical:</strong> IP address and rate-limiting records kept briefly for security, your browser's timezone, device push-notification tokens if you turn notifications on, and essential storage in your browser to keep you signed in.</li>
      </ul>

      <H2>3. Why we use it, and our legal basis</H2>
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>To run the Programme</strong> - your account, profile, the community features, challenges and leaderboards - <em>performance of a contract</em>.</li>
        <li><strong>To pay you</strong> - prizes, vouchers, invoices and the records we must keep of them - <em>performance of a contract</em> and <em>legal obligation</em> (accounting and tax law).</li>
        <li><strong>To review applications, moderate content and keep the community safe</strong> - <em>legitimate interests</em> in running a community that is safe to be in. You can object; see section 8.</li>
        <li><strong>Email and push notifications</strong> - <em>consent</em>, withdrawable at any time in Settings without affecting anything you have already received.</li>
        <li><strong>Security, fraud prevention and responding to lawful requests</strong> - <em>legitimate interests</em> and <em>legal obligation</em>.</li>
      </ul>

      <H2>4. Who can see what</H2>
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>Other creators</strong> see your profile, your entries, your position on leaderboards, and anything you post in a shared room. If you have opted in, they see the town you are based in on the community map.</li>
        <li><strong>The public</strong> - anybody, signed in or not - sees only what is on the front page: your name, photo, one-line bio, the town and country you gave, and how many countries you have visited. You can switch this off entirely in Settings, Privacy.</li>
        <li><strong>The Tryp.com Team</strong> sees everything above plus your email address, phone number, payment details, direct-message reports you raise, and read receipts on messages.</li>
        <li><strong>Direct messages</strong> are not read by us in the ordinary course. They can be shown to us if you or the other person reports one.</li>
      </ul>

      <H2>5. Automated processing</H2>
      <p>
        Two things happen without a person pressing a button, and neither of them makes a decision
        about you that has a legal or similarly significant effect:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>View counts are read off your submitted link</strong> on a schedule, from the public page of the platform you posted on. We read the number of views; we do not access your account, and we cannot see anything a logged-out visitor could not.</li>
        <li><strong>Scores, ranks and milestones are calculated</strong> from those counts and from your activity. A person reviews and publishes the result before any prize is awarded.</li>
      </ul>

      <H2>6. Who we share it with</H2>
      <p>We do not sell your data and we do not use it for advertising. We use a small number of processors to run the service:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>Supabase</strong> - database, authentication and file storage. Hosted in Switzerland.</li>
        <li><strong>Vercel</strong> - application hosting and content delivery.</li>
        <li><strong>Cloudflare</strong> - bot protection on the sign-up and login forms (Turnstile).</li>
        <li><strong>Resend</strong> - transactional and notification email.</li>
        <li><strong>OpenStreetMap (Nominatim)</strong> - turning the town you type into map coordinates. It receives the place name, not your identity.</li>
        <li><strong>Google Fonts</strong> - the typeface the site is set in.</li>
        <li><strong>Instagram, TikTok, YouTube and Facebook</strong> - we request the public page of a link you submitted in order to read its view count. We send them a request for a public URL and nothing about you.</li>
        <li><strong>Frankfurter</strong> - published exchange rates, for converting prize totals. No personal data is sent.</li>
      </ul>
      <p>
        We may also share data where the law requires it, or to establish or defend a legal claim.
      </p>

      <H2>7. International transfers</H2>
      <p>
        Supabase processes your data in Switzerland, which the European Commission recognises as
        providing an adequate level of protection. Some processors (Vercel, Cloudflare, Resend,
        Google) may process data in the United States; where they do, those transfers are covered by
        the EU-US Data Privacy Framework and/or the European Commission's Standard Contractual
        Clauses, with the UK Addendum where UK data is involved.
      </p>

      <H2>8. How long we keep it</H2>
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>Your account and profile:</strong> for as long as your account is open.</li>
        <li><strong>If you delete your account:</strong> it is scheduled for permanent deletion after a 30-day grace period, during which you can restore it yourself. After that it is gone.</li>
        <li><strong>Messages in shared rooms:</strong> a conversation belongs to everyone in it, so messages you have posted may remain in the thread after you leave, shown without your profile.</li>
        <li><strong>Invoices and payment records:</strong> kept for as long as accounting and tax law requires, which in Portugal is ten years. This applies even after you close your account, and it is a legal obligation rather than a choice.</li>
        <li><strong>Security records</strong> such as rate-limiting logs: days, not months.</li>
      </ul>

      <H2>9. Your rights</H2>
      <p>
        You have the right to access your data, to have it corrected, to have it erased, to restrict
        or object to how we use it, to receive it in a portable form, and to withdraw any consent you
        have given. Most of these are buttons rather than requests:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>Access and portability:</strong> Settings, Account, "Download my data" - a machine-readable copy of everything we hold about you.</li>
        <li><strong>Correction:</strong> edit your profile at any time.</li>
        <li><strong>Erasure:</strong> Settings, Account, "Delete my account".</li>
        <li><strong>Restrict what others see:</strong> Settings, Privacy, to come off the public map.</li>
        <li><strong>Withdraw consent to notifications:</strong> Settings, Notifications.</li>
      </ul>
      <p>
        Anything not covered by a button, write to <strong>info@tryp.com</strong>. You also have the
        right to complain to a supervisory authority - in Portugal the Comissão Nacional de Proteção
        de Dados (CNPD), in the UK the Information Commissioner's Office (ICO), or the authority
        where you live.
      </p>

      <H2>10. Security</H2>
      <p>
        Data is encrypted in transit and at rest. Access to the database is controlled row by row, so
        a creator's account can only read what that creator is entitled to see; administrative access
        is limited to named members of the Tryp.com Team and is logged. If a breach ever puts your
        rights at risk, we will tell the supervisory authority within 72 hours and tell you without
        undue delay.
      </p>

      <H2>11. Cookies and browser storage</H2>
      <p>
        We use only what is strictly necessary: storage that keeps you signed in, remembers your
        display preferences, and lets Cloudflare tell a person from a bot on the login form. There
        are no advertising cookies, no third-party trackers and no analytics that follow you off this
        site - which is also why you are not asked to accept anything on arrival.
      </p>

      <H2>12. Children</H2>
      <p>
        The Programme is for people aged 16 and over. We ask for your date of birth in order to
        enforce that. If we learn that an account belongs to somebody younger, we delete it.
      </p>

      <H2>13. Changes</H2>
      <p>
        If our practices change we will update this page and the date at the top of it. If a change
        materially affects your rights we will tell you in the app before it takes effect.
      </p>
    </LegalShell>
  )
}
