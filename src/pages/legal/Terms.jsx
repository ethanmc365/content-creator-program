import LegalShell, { H2 } from './LegalShell'

// NOTE: Replace [PLACEHOLDER] values and have a lawyer review before launch.
export default function Terms() {
  return (
    <LegalShell title="Terms of Service" updated="24 June 2026">
      <p>
        These terms govern your use of the Tryp.com Content Creator Program ("the Program"). By
        creating an account you agree to them. The Program is operated by{' '}
        <strong>[LEGAL ENTITY NAME]</strong> ("we", "us").
      </p>

      <H2>1. Membership</H2>
      <p>
        You must be at least 16 to join. New sign-ups are reviewed by the Tryp.com Team before being
        approved; we may approve or decline applications at our discretion. You're responsible for
        keeping your login details secure and for activity on your account.
      </p>

      <H2>2. Your content</H2>
      <p>
        You keep ownership of the content you post (photos, videos, messages). By posting it you give
        us a licence to display it within the Program. You agree your content is yours to share,
        represents Tryp.com honestly, and doesn't break the law or infringe anyone's rights.
      </p>

      <H2>3. Acceptable use</H2>
      <p>
        Don't post illegal, hateful, harassing, or infringing content, spam other members, attempt to
        breach the platform's security, or misuse other creators' personal information. We may mute,
        suspend, or remove accounts that break these rules.
      </p>

      <H2>4. Reporting content</H2>
      <p>
        If you see content that breaks these terms or the law, contact the Tryp.com Team at{' '}
        <strong>[PRIVACY CONTACT EMAIL]</strong> and we'll review it.
      </p>

      <H2>5. Rewards</H2>
      <p>
        Challenge prizes and vouchers are awarded at our discretion according to each challenge's
        brief. We may change or end the Program, challenges, or rewards at any time.
      </p>

      <H2>6. Ending your membership</H2>
      <p>
        You can delete your account at any time from Edit profile. We may suspend or terminate
        accounts that breach these terms.
      </p>

      <H2>7. Liability</H2>
      <p>
        The Program is provided "as is". To the extent permitted by law, we aren't liable for indirect
        or consequential loss arising from your use of it.
      </p>

      <H2>8. Contact</H2>
      <p>Questions about these terms? Email <strong>[PRIVACY CONTACT EMAIL]</strong>.</p>
    </LegalShell>
  )
}
