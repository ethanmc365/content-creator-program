import { useState } from 'react'
import { Badge } from '../../../components/ui'
import Icon from '../../../components/Icon'
import { REFERRAL_STAGES, referralStage, isCountedStage } from '../../../lib/referrals'
import { LabPage, Panel, Runner, Note, Choice, Code, PersonRow, CardGrid } from './kit'
import { APPLICANT, CREATORS } from './fixtures'

// ONE CREATOR, FROM THE OUTSIDE OF THE FRONT DOOR TO THEIR FIRST PAYOUT.
//
// Everything here is a rule the platform enforces rather than a habit somebody
// has. That distinction is the point of the lab: "we review applications" is a
// policy, and policies rot. "Nobody with status pending can post, because the
// route guard fails closed and the row-level security policy on messages checks
// membership" is a mechanism.

// The four states a referred creator moves through, drawn from the SAME model
// the admin referrals page and the creator's own Refer page use. Feeding it
// four fabricated profiles is a live proof that the stage machine agrees with
// itself, which is the only reason the two pages can never disagree.
const REFERRAL_CASES = [
  { label: 'Signed up, has not finished', profile: { status: 'pending', onboarded: false }, submitted: false },
  { label: 'Finished, waiting on review', profile: { status: 'pending', onboarded: true }, submitted: false },
  { label: 'Approved, no video yet', profile: { status: 'active', onboarded: true }, submitted: false },
  { label: 'Submitted a video', profile: { status: 'active', onboarded: true }, submitted: true },
  { label: 'Declined', profile: { status: 'declined', onboarded: true }, submitted: false },
]

const TONE = { grey: 'grey', amber: 'amber', light: 'light', green: 'green' }

export default function JourneyLab() {
  const [outcome, setOutcome] = useState('approve')
  const referrer = CREATORS[0]

  const steps = [
    {
      key: 'link', actor: 'creator',
      title: `${referrer.name} shares their referral link`,
      detail: 'Every creator has one. The click is counted once per browser so the funnel on their Refer page is honest.',
      tech: 'https://trypcreators.vercel.app/signup?ref=MAYA7K\nrpc(\'increment_referral_click\', { code: \'MAYA7K\' })',
    },
    {
      key: 'signup', actor: 'creator',
      title: `${APPLICANT.name} creates an account`,
      detail: 'Captcha, rate limit, an explicit agreement to the terms, and a password of at least eight characters. The account exists, and it can do nothing.',
      tech: "profiles: { status: 'pending', onboarded: false, referred_by: 'demo-c1' }",
      output: <StageCard stage={referralStage({ status: 'pending', onboarded: false }, false)} />,
    },
    {
      key: 'gate1', actor: 'guard',
      title: 'The only page they can reach is onboarding',
      detail: 'Not a nudge and not a banner. The route guard sends every other address back here until onboarded is true, so an admin always reviews a complete profile rather than an empty one.',
      tech: "if (!profile.onboarded) return <Navigate to='/onboarding' />",
    },
    {
      key: 'onboard', actor: 'creator',
      title: 'Eight steps, then submit',
      detail: 'Photo, basics, socials, travel photos, the country map, languages, a market, and how the programme works. The onboarding lab walks all eight.',
      tech: "update profiles set onboarded = true, country_code = 'GB' ...\ninsert into creator_private (phone) ...\nrpc('join_market', { p_slug: 'uk-ireland' })",
      output: <StageCard stage={referralStage({ status: 'pending', onboarded: true }, false)} />,
    },
    {
      key: 'notify', actor: 'push',
      title: 'Every admin is told, in the same second',
      detail: 'A database trigger loops the admins and writes one notification each. Nobody has to go looking for the queue.',
      tech: "trigger on profiles -> notify_user(admin, 'application', 'Alex Rivers applied')",
    },
    {
      key: 'wait', actor: 'system',
      title: 'The applicant sees the review screen',
      detail: 'The branded plane scene, the same one shown while the profile was saving, so submitting flows into waiting with no screen swap. They cannot read a room, message anybody or enter a challenge.',
    },
    outcome === 'approve' ? {
      key: 'decide', actor: 'admin',
      title: 'Approved',
      detail: 'One press on the applications page. The status moves to active and the account unlocks, in that order.',
      tech: "update profiles set status = 'active' where id = ...",
      output: <StageCard stage={referralStage({ status: 'active', onboarded: true }, false)} />,
    } : {
      key: 'decide', actor: 'admin', blocked: true,
      title: 'Declined',
      detail: 'The declined screen is written to be read by a person: it thanks them, it is honest, and it offers a way out. It does not say "unauthorised".',
      output: <StageCard stage={referralStage({ status: 'declined', onboarded: true }, false)} />,
    },
    outcome === 'approve' ? {
      key: 'welcome', actor: 'email',
      title: 'The welcome email goes out',
      detail: 'Queued for an admin to approve rather than fired blind, so a batch of approvals cannot turn into a batch of mistakes. See the email lab.',
    } : null,
    outcome === 'approve' ? {
      key: 'connect', actor: 'guard',
      title: 'One more gate: connect with a few creators first',
      detail: 'A newly approved member meets people before the app opens. Existing members were grandfathered past it and admins skip it. A community nobody is connected in is a list of names.',
      tech: "if (status === 'active' && !connect_gate_done) return <ConnectGate />",
    } : null,
    outcome === 'approve' ? {
      key: 'submit', actor: 'creator',
      title: 'They enter a challenge and post their video',
      detail: 'This is the moment the referral finally counts. Not the sign up, not the approval. Rewarding anything earlier rewards creating accounts.',
      tech: "insert into submissions (challenge_id, creator_id, url, platform)",
      output: <StageCard stage={referralStage({ status: 'active', onboarded: true }, true)} />,
    } : null,
    outcome === 'approve' ? {
      key: 'counted', actor: 'push',
      title: `${referrer.name.split(' ')[0]} is told their referral counted`,
      detail: 'And it moves into the counted column on both the admin referrals page and their own, because both read the same stage function.',
    } : null,
  ].filter(Boolean)

  return (
    <LabPage
      title="A creator, end to end"
      icon="plane"
      subtitle="From a referral link to a first video, showing the gate at every step. Switch the outcome to see what a declined application looks like."
    >
      <Panel title="The outcome" hint="Everything before the decision is identical. Everything after it is not.">
        <Choice
          value={outcome}
          onChange={setOutcome}
          options={[{ value: 'approve', label: 'Approved' }, { value: 'decline', label: 'Declined' }]}
        />
        <div className="mt-5 rounded-card border border-gray-100 bg-cloud/50 p-4">
          <PersonRow
            creator={{ name: APPLICANT.name, city: APPLICANT.city, country: APPLICANT.country }}
            right={<Badge tone="grey">Referred by {referrer.name}</Badge>}
          />
        </div>
      </Panel>

      <Panel title="Run it" hint="Press Step to talk over each gate.">
        <Runner steps={steps} autoMs={1000} />
      </Panel>

      <Panel
        title="The referral stage machine"
        hint="Five fabricated profiles put through the real referralStage function. Both the admin page and the creator's own page read this, which is why they cannot disagree about who counts."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-smoke">
                <th className="pb-2">Profile</th>
                <th className="pb-2">status</th>
                <th className="pb-2">onboarded</th>
                <th className="pb-2">submitted</th>
                <th className="pb-2">Stage</th>
                <th className="pb-2 text-right">Counts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {REFERRAL_CASES.map((c) => {
                const stage = referralStage(c.profile, c.submitted)
                return (
                  <tr key={c.label}>
                    <td className="py-3 pr-4 text-xs">{c.label}</td>
                    <td className="py-3 pr-4 font-mono text-[11px] text-smoke">{c.profile.status}</td>
                    <td className="py-3 pr-4 font-mono text-[11px] text-smoke">{String(c.profile.onboarded)}</td>
                    <td className="py-3 pr-4 font-mono text-[11px] text-smoke">{String(c.submitted)}</td>
                    <td className="py-3 pr-4"><Badge tone={TONE[stage.tone] || 'grey'}>{stage.label}</Badge></td>
                    <td className="py-3 text-right">
                      {isCountedStage(stage)
                        ? <Icon name="check" className="ml-auto h-4 w-4 text-green-600" />
                        : <span className="text-xs text-gray-300">no</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Note className="mt-5">
          <p>
            Five stages, one definition. {Object.keys(REFERRAL_STAGES).length} of them are declared in
            lib/referrals.js and nothing else is allowed to invent a sixth.
          </p>
        </Note>
      </Panel>

      <Panel title="Every state an account can be in" hint="The guard is default-deny: a status it does not recognise is treated as not allowed, not as allowed.">
        <CardGrid cols={4}>
          {[
            { s: 'pending', t: 'Waiting on review', d: 'Sees the review screen only.' },
            { s: 'active', t: 'A member', d: 'The whole platform, subject to the connect gate on day one.' },
            { s: 'muted', t: 'Reading only', d: 'Can be in the community but cannot post.' },
            { s: 'declined', t: 'Not accepted', d: 'The declined screen and a way to log out.' },
            { s: 'suspended', t: 'Suspended', d: 'Locked out with an explanation and who to contact.' },
            { s: 'deleting', t: 'Scheduled for deletion', d: 'Thirty day grace period, and they can restore it themselves.' },
            { s: 'is_test', t: 'A test account', d: 'Hidden from the community, the rosters and every email list.' },
            { s: 'unknown', t: 'Anything else', d: 'Refused. Default-deny is the whole rule.' },
          ].map((x) => (
            <div key={x.s} className="card !p-4">
              <code className="text-[11px] font-semibold text-brand">{x.s}</code>
              <p className="mt-1.5 text-sm font-semibold">{x.t}</p>
              <p className="mt-1 text-xs leading-relaxed text-smoke">{x.d}</p>
            </div>
          ))}
        </CardGrid>
        <Code className="mt-5">{`const ALLOWED_STATUSES = ['active', 'muted']

if (!ALLOWED_STATUSES.includes(profile.status) && !profile.is_admin) {
  return <ReviewPending />
}`}</Code>
      </Panel>
    </LabPage>
  )
}

function StageCard({ stage }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-card border border-gray-200 bg-white px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-smoke">Referral now</span>
      <Badge tone={TONE[stage.tone] || 'grey'}>{stage.label}</Badge>
      <span className="text-[11px] text-smoke">step {stage.step} of 4</span>
    </div>
  )
}
