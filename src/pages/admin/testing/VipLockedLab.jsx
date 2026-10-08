import { LabPage, Panel, Note, Stage, useStage } from './kit'

// THE VIP COMMUNITY AS A CREATOR WHO IS NOT A VIP SEES IT (9 Oct 2026).
//
// Ethan: "I want to be able to see the creator facing side for the VIP community where it shows locked for them for now,
// and what it shows, add that to the testing centre."
//
// Both frames are the real app, loaded in an iframe. The VIP page is opened with `?locked=1`, which VipHub honours for
// admins only (a team member would otherwise see the staff view); the teaser is the card on the Milestones page, which is
// where most creators first run into it. Nothing here writes anything.
export default function VipLockedLab() {
  const stage = useStage('phone')
  return (
    <LabPage
      title="VIP community, locked"
      icon="lock"
      sandbox={false}
      subtitle="The invite-only page every creator outside the VIP community sees, and the card that leads to it."
    >
      <Panel i={0} title="The locked page" hint="The animated lock, what VIPs get and what the team looks at when it invites somebody. Switch to desktop for the wide layout.">
        <Stage src="/vip?locked=1" label="VIP page, as a creator" {...stage} height={stage.device === 'phone' ? 820 : 900} />
      </Panel>
      <Panel i={1} title="The teaser card" hint="Shown under the route on Milestones. Pressing it opens the locked page above.">
        <Stage src="/milestones" label="Milestones page" {...stage} height={stage.device === 'phone' ? 820 : 900} />
        <Note className="mt-3" icon="lock"><p>The card is hidden from real VIPs, who are already there. You see it because you are not a VIP yourself.</p></Note>
      </Panel>
    </LabPage>
  )
}
