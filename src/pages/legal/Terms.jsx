import LegalShell, { H2 } from './LegalShell'

// TERMS OF SERVICE, REWRITTEN 4 SEP 2026.
//
// Ethan: "I would properly update the privacy policy now, within the legal
// things that you think we need to have... so please update them, and the terms
// of service - properly research and update them."
//
// The old terms were eight short sections written for a much smaller product,
// and the research turned up four things that were genuinely missing rather
// than merely thin:
//
//  1  ADVERTISING DISCLOSURE. Creators post videos about Tryp.com and are paid
//     in cash and vouchers for doing it. In the UK that is a marketing
//     communication under the CAP Code and the CMA's endorsement guidance, and
//     the guidance is explicit that the BRAND is expected to have a written
//     contract setting the disclosure obligation out. Across the EU it is the
//     Unfair Commercial Practices Directive. These terms had no disclosure
//     clause at all, which put the obligation on the creator and the exposure
//     on Tryp.com.
//  2  HOW A CHALLENGE IS WON, IN WRITING. Cash prizes decided by a stated,
//     objective criterion with no entry fee are a skill/merit competition and
//     sit outside the Gambling Act 2005 licensing regime. That is only true if
//     it is actually how they work, and saying so is what keeps it true - so
//     the free entry, the published criteria and the "not a draw" statement are
//     now terms rather than assumptions.
//  3  THE DIGITAL SERVICES ACT. This is a hosting service inside the EU with
//     user content and moderation. Micro and small enterprises are excluded
//     from Section 3 of the DSA (Article 19) but NOT from Section 2 - so notice
//     and action (Art. 16), a statement of reasons for any restriction
//     (Art. 17), a point of contact (Arts. 11-12) and clear terms on moderation
//     (Art. 14) all apply whatever our size. Sections 6 and 9 are those.
//  4  PRIZE PAYMENT, TAX AND VOUCHERS. Money changes hands here and nothing
//     said who is responsible for the tax on it, when it is paid, or what
//     happens to a voucher.
//
// THIS IS A CAREFUL TEMPLATE, NOT LEGAL ADVICE. Have a lawyer read it before
// relying on it.
export default function Terms() {
  return (
    <LegalShell title="Terms of Service" updated="4 September 2026">
      <p>
        These terms govern your use of the Tryp.com Content Creator Community ("the Programme"). By
        creating an account you agree to them. The Programme is operated by{' '}
        <strong>Tryp.com LDA</strong>, Rua da Prata, nr. 80, 5.º piso, 1100-420 Lisbon, Portugal
        ("we", "us"). It is free to join and free to take part in.
      </p>

      <H2>1. Membership</H2>
      <p>
        You must be at least 16 years old. One account per person. New applications are read by a
        member of the Tryp.com Team, who may approve or decline them; we are not obliged to give a
        reason for declining an application, although we usually will. You are responsible for
        keeping your login details secure and for what happens on your account.
      </p>
      <p>
        Membership is a relationship, not a job. Nothing here creates an employment contract, an
        agency, a partnership or an exclusive arrangement, and you are free to work with anybody else
        at any time.
      </p>

      <H2>2. Challenges, and how one is won</H2>
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>Entry is free and always will be.</strong> There is no fee, no purchase and no payment of any kind to enter a challenge.</li>
        <li><strong>Winners are decided on a stated, objective measure</strong> - published on the challenge before it opens - such as the views a video earns or the points scored under the challenge's own rules. Nothing is decided by chance, and a challenge is not a prize draw or a lottery.</li>
        <li><strong>The brief is part of the terms of that challenge.</strong> Deadlines, eligible platforms, the number of prizes and what each is worth are set out on the challenge itself and are what governs it.</li>
        <li><strong>Entries must be your own work</strong>, made for the brief, posted publicly on a platform the brief allows, and left up long enough to be counted.</li>
        <li><strong>Bought, automated or otherwise inauthentic engagement disqualifies an entry.</strong> So does misrepresenting where a video was posted, or editing or deleting it in a way that prevents its performance being verified. Where we have reasonable grounds, we may exclude an entry or withhold a prize, and we will tell you why.</li>
        <li><strong>We may correct a view count</strong> that is plainly wrong, and leaderboards are provisional until results are published.</li>
      </ul>

      <H2>3. Telling people it is an ad</H2>
      <p>
        This matters, and it is your obligation as well as ours. When you post content for a Tryp.com
        challenge, or content for which you have received or expect to receive anything of value from
        us - cash, a voucher, a trip, a product, or a chance at a prize - that content is a marketing
        communication, and you must make that obvious to your audience:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Label it clearly and up front - at the start of the caption, in the first frame of a video, or in the first seconds of audio - using wording an ordinary viewer recognises, such as <strong>#ad</strong>, <strong>Ad</strong> or <strong>Advertisement</strong>.</li>
        <li>A platform's own "Paid partnership" tag is welcome, but on its own it is not enough. Use it <em>and</em> a written label.</li>
        <li>Follow whatever rules apply where your audience is. In the UK that is the CAP Code and the Competition and Markets Authority's guidance on endorsements; in the EU it is the Unfair Commercial Practices Directive and your own country's rules.</li>
        <li>Say only what is true about Tryp.com and about your own experience. Do not present an opinion you were paid for as an unpaid one.</li>
      </ul>
      <p>
        If we ask you to add or correct a disclosure on a live post, please do it promptly. An entry
        that is not properly disclosed may be excluded from a challenge.
      </p>

      <H2>4. Your content, and the licence you give us</H2>
      <p>
        You keep ownership of everything you post. By posting it in the Programme you give us a
        licence to display it inside the Programme so the community works at all.
      </p>
      <p>
        In addition, by submitting content to a challenge or otherwise sharing it with us, you grant
        Tryp.com a <strong>worldwide, non-exclusive, royalty-free licence to reuse that content in
        its marketing</strong> - on Tryp.com's website, social channels, email and advertising - with
        attribution to you where reasonably practical. This licence continues for material already
        published even if you later leave the Programme, because we cannot recall a printed magazine
        or an advert already bought. If you want a specific piece of content taken out of our future
        marketing, email <strong>info@tryp.com</strong> and we will act on reasonable requests.
      </p>
      <p>
        You confirm that the content is yours to share, that anybody identifiable in it has agreed to
        appear, and that it does not infringe anyone's rights.
      </p>

      <H2>5. Prizes, vouchers and tax</H2>
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>Cash prizes are paid by bank transfer</strong> against an invoice we raise for you, normally within 30 days of results being published, once you have given us complete payment details.</li>
        <li><strong>Tryp.com vouchers</strong> are for booking travel through Tryp.com. They are personal to you, cannot be transferred or exchanged for cash, and carry any expiry date stated when they are awarded.</li>
        <li><strong>Tax is yours.</strong> You are responsible for declaring and paying any income, self-employment or other tax due on what you receive, in your own country. We do not withhold tax and we cannot give you tax advice.</li>
        <li><strong>Bank details are your responsibility to keep correct.</strong> We pay what your profile says; we cannot recover money sent to an account you told us was yours.</li>
        <li>We may change or end the Programme, a challenge or a reward at any time. If we end a challenge that is already running, we will honour prizes already earned under it.</li>
      </ul>

      <H2>6. Acceptable use, and what happens if you break it</H2>
      <p>
        Do not post content that is illegal, hateful, harassing, sexual, deceptive or infringing; do
        not spam other members; do not attempt to breach the platform's security or access anybody
        else's account; do not scrape or republish other creators' personal information; and do not
        impersonate anybody.
      </p>
      <p>
        Where content or an account breaks these rules or the law, we may remove or hide the content,
        limit an account, suspend it, or close it.{' '}
        <strong>Whenever we do any of those things we will tell you what we did, to what, and why</strong>,
        and you can challenge the decision by replying to that message or writing to{' '}
        <strong>info@tryp.com</strong>. A person - not an automated system - reviews every challenge,
        and we will restore anything we got wrong. This is our statement-of-reasons and internal
        complaints commitment under the EU Digital Services Act, and it applies to every decision we
        take about your content or your account.
      </p>

      <H2>7. Reporting content</H2>
      <p>
        Every message in the Programme carries a Report control, and it is the fastest route: it
        sends us the message, who posted it and when, and it reaches the Team immediately. You can
        also email <strong>info@tryp.com</strong>. Tell us what the content is and why you believe it
        is illegal or breaks these terms.
      </p>
      <p>
        We review reports without undue delay, act on the ones that need acting on, and tell both the
        person who reported it and the person who posted it what we decided and why. Reports made in
        bad faith, or repeatedly and without substance, may themselves be treated as misuse.
      </p>

      <H2>8. Other platforms</H2>
      <p>
        Instagram, TikTok, YouTube and Facebook have their own terms, and taking part in a challenge
        does not change them. You are responsible for following them, including their own rules on
        branded content. None of those companies sponsors, endorses or is connected with the
        Programme.
      </p>

      <H2>9. Contact point</H2>
      <p>
        Our single point of contact for members, for authorities and for anybody wishing to report
        content is <strong>info@tryp.com</strong>, in English or Portuguese.
      </p>

      <H2>10. Ending your membership</H2>
      <p>
        You can delete your account at any time from Settings, Account. It is removed permanently
        after a 30-day grace period, during which you can restore it. We may suspend or close an
        account that breaches these terms, with the explanation and the right of appeal set out in
        section 6. Prizes already earned and unpaid are still paid unless they were earned in breach
        of these terms.
      </p>

      <H2>11. Liability</H2>
      <p>
        The Programme is provided as it is. We do not promise that it will always be available or
        free of faults. To the fullest extent the law allows, we are not liable for indirect or
        consequential loss, for lost earnings or lost followers, or for anything a third-party
        platform does to your account or your content.
      </p>
      <p>
        Nothing in these terms limits our liability for death or personal injury caused by
        negligence, for fraud, or for anything else that cannot lawfully be limited - and if you are
        a consumer, nothing here removes rights you have under the law of the country you live in.
      </p>

      <H2>12. Changes to these terms</H2>
      <p>
        We may update these terms. If a change materially affects your rights we will tell you in the
        app before it takes effect, and the date at the top of this page will change. Carrying on
        using the Programme after that means you accept the new terms; if you do not, you can close
        your account.
      </p>

      <H2>13. Governing law</H2>
      <p>
        These terms are governed by Portuguese law and the courts of Lisbon have jurisdiction. If you
        are a consumer resident elsewhere in the EU or in the UK, you keep the protection of the
        mandatory consumer law of the country you live in, and you may bring proceedings there.
      </p>

      <H2>14. Contact</H2>
      <p>Questions about these terms? Email <strong>info@tryp.com</strong>.</p>
    </LegalShell>
  )
}
