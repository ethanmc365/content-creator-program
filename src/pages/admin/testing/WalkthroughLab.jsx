import { useState } from 'react'
import { Badge } from '../../../components/ui'
import { TOUR_STEPS, TOUR_VERSION, partOf } from '../../../lib/tour'
import { startTour } from '../../../components/tour/TourGate'
import { useCommunity } from '../../../context/CommunityContext'
import { installSteps, isIOS, isStandalone } from '../../../lib/install'
import { LabPage, Panel, Note, Stage, useStage, InfoList, KeyVal, Code, Choice } from './kit'

// THE GUIDED WALKTHROUGH, AND THE HOME-SCREEN ASK.
//
// Two features that only ever happen to somebody ONCE, on their very first
// visit, which makes them the two hardest things on the platform to look at
// twice. The walkthrough can be started deliberately from here; the install ask
// is shown in a frame, because on a desktop it correctly refuses to appear at
// all.

// WHAT EACH KIND OF GOAL IS WAITING FOR, IN WORDS.
//
// This list used to read `s.action`, a field that stopped existing two versions
// ago - so every badge on this page was `undefined` and the count at the bottom
// said zero. The lab is supposed to be the honest picture of the feature, and a
// panel describing fields that are not on the object is worse than no panel.
const GOAL_LABEL = {
  route: (g) => `Waits for them to open ${g.any ? g.any.join(' or ') : g.to}`,
  scroll: (g) => `Waits for ${g.px}px of scrolling, from any scroller on the page`,
  click: (g) => `Waits for a press on ${g.anchor}`,
  connect: () => 'Waits for a connection request to go out',
  push: () => 'Waits for notification permission',
  dwell: (g) => `Moves on by itself after ${(g.ms / 1000).toFixed(1)}s`,
  end: () => 'The sign-off',
}

const goalText = (g) => (g && GOAL_LABEL[g.kind] ? GOAL_LABEL[g.kind](g) : 'No goal')

export default function WalkthroughLab() {
  const stage = useStage('phone')
  // THE WALK HAS TO SHOW THE PLATFORM WE ARE ACTUALLY LAUNCHING.
  //
  // The network shell is behind a device-local preview flag, so an admin whose
  // flag happens to be off was being walked round the LEGACY app: the old home
  // page instead of the worldwide hub, and none of the rooms, board, flight log
  // or games steps at all. Starting it from here turns the preview on first.
  const { preview, enterPreview } = useCommunity()
  const run = () => { if (!preview) enterPreview(); startTour() }
  const [screen, setScreen] = useState('install')
  const ios = isIOS()

  return (
    <LabPage
      title="The first five minutes"
      icon="sparkles"
      subtitle="What a brand new creator meets and nobody else ever sees again: the walk round the platform, and the ask to put it on their home screen. Both are switched off in the database until somebody turns them on."
      aside={
        <button type="button" onClick={run} className="btn-primary text-sm">
          Start the walkthrough
        </button>
      }
    >
      <Note tone="good" icon="shield">
        <p className="font-semibold">Nobody in the community can meet either of these.</p>
        <p>
          Migration 107 marked every creator who was already here as done, and both features additionally
          read a switch in app_settings that is currently false. Turning either on is a row update, not a
          deploy, and admins are excluded from the automatic start regardless.
        </p>
      </Note>

      <Panel
        i={0}
        title="Run it"
        hint="It takes over this page, points at the real navigation, and follows you as you move. Press Escape to leave it, or use the worded link at the foot of the card - there is deliberately no cross in the corner."
      >
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={run} className="btn-primary text-sm">
            Start the walkthrough here
          </button>
          <p className="text-xs text-smoke">
            It will navigate away from the Testing Centre. Come back afterwards.
          </p>
        </div>
      </Panel>

      <Panel
        i={1}
        title={`The ${TOUR_STEPS.length} stops`}
        hint="There is no Next button anywhere in it. Every stop waits for the creator to actually do the thing, and the middle column is what each one is waiting for."
      >
        <div className="space-y-2">
          {TOUR_STEPS.map((s, i) => {
            const live = s.goal?.kind !== 'dwell' && s.goal?.kind !== 'end'
            return (
              <div
                key={s.key}
                className={
                  'flex flex-wrap items-start gap-3 rounded-card border px-4 py-3 '
                  + (live ? 'border-brand/25 bg-brand-tint/25' : 'border-gray-100 bg-white')
                }
              >
                <span className={
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold '
                  + (live ? 'bg-brand text-white' : 'bg-cloud text-smoke')
                }>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{s.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-smoke">{s.body}</p>
                  {s.do && <p className="mt-1 text-xs font-semibold text-brand">&ldquo;{s.do}&rdquo;</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone="grey" className="!px-2 !py-0.5 !text-[10px]">{partOf(s).label}</Badge>
                    <Badge tone="brand" className="!px-2 !py-0.5 !text-[10px]">{goalText(s.goal)}</Badge>
                    {s.anchor
                      ? <Badge tone="light" className="!px-2 !py-0.5 !text-[10px]">points at {s.anchor}</Badge>
                      : <Badge tone="grey" className="!px-2 !py-0.5 !text-[10px]">centred card</Badge>}
                    {s.on === 'network' && <Badge tone="grey" className="!px-2 !py-0.5 !text-[10px]">network shell only</Badge>}
                    {s.required && <Badge tone="amber" className="!px-2 !py-0.5 !text-[10px]">cannot be skipped</Badge>}
                    {s.empty && <Badge tone="green" className="!px-2 !py-0.5 !text-[10px]">has an empty-state version</Badge>}
                    {s.door && <Badge tone="green" className="!px-2 !py-0.5 !text-[10px]">carries its own door</Badge>}
                    {s.skipIfMissing && <Badge tone="grey" className="!px-2 !py-0.5 !text-[10px]">dropped if absent</Badge>}
                  </div>
                  {/* THE HALF OF THE FEATURE NOBODY EVER SEES. An admin looking
                      at this page has a live brief on the board, so the normal
                      copy is the only copy they will ever meet. The empty
                      version is what a creator in a brand new market gets, and
                      it needs checking as carefully as the other one. */}
                  {s.empty && (
                    <div className="mt-2 rounded-xl border border-dashed border-gray-200 bg-cloud/50 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-smoke">
                        When there is nothing there
                      </p>
                      <p className="mt-1 text-xs font-semibold">{s.empty.title || s.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-smoke">{s.empty.body}</p>
                      <p className="mt-1 text-xs font-semibold text-brand">
                        &ldquo;{s.empty.do}&rdquo; · {goalText(s.empty.goal)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Panel>

      <Panel i={2} title="How it works" hint="Three decisions that made it possible to have one walkthrough rather than three.">
        <InfoList
          items={[
            { icon: 'pin', t: 'Steps name an anchor, never a position', d: 'The SAME data-tour name is on the desktop nav item and on the mobile tab, and the resolver picks whichever is actually visible. One set of copy covers a phone, a tablet and a desktop instead of three sets that drift apart.' },
            { icon: 'eye', t: 'Nothing is trapped', d: 'The wash is pointer-events:none the whole way through, so every control underneath stays live. That is what lets the notification step use the REAL button rather than a picture of one. A walkthrough that blocks the app teaches you how to use a walkthrough.' },
            { icon: 'sparkles', t: 'The highlighting is light, not darkness', d: 'The page dims by a fifth, and the thing being talked about wears a heavy orange glow. It used to be the other way round - 62% black with a hole in it - which turned a live app into a photograph of one.' },
            { icon: 'ban', t: 'An empty page gets different words, not a dead end', d: 'A creator whose market has no live brief cannot "open a challenge", and for two versions the only way past that step was the skip button. Every step that points at CONTENT now carries a second set of copy for when the content is not there: what this page is, what will appear on it, and a goal that can actually be met.' },
            { icon: 'device', t: 'The card is placed, never parked', d: 'Sixty times a second it works out which side of the highlighted thing has room, picks a width that fits that gap and moves there - so it changes size and shape as the walk goes on and never covers what it is pointing at. On a phone it goes full width, above or below.' },
          ]}
        />
      </Panel>

      <Panel i={3} title="Who sees it, and when" hint="Four conditions, all of which have to hold.">
        <div className="grid gap-6 lg:grid-cols-2">
          <Code>{`shouldAutoStart:
  app_settings.tour_enabled  === true      <- currently FALSE
  profile.tour_completed_at  === null      <- backfilled for everyone
  profile.status             === 'active'
  profile.onboarded          === true
  not an admin, not a test account
  and not already seen on THIS layout

Settings -> Display -> "Show me round again"
resets it, on this device.`}</Code>
          <KeyVal
            rows={[
              ['Stops', String(TOUR_STEPS.length)],
              ['Stops that wait for a real action', String(TOUR_STEPS.filter((s) => !['dwell', 'end'].includes(s.goal?.kind)).length)],
              ['Stops with an empty-state version', String(TOUR_STEPS.filter((s) => s.empty).length)],
              ['Version', `v${TOUR_VERSION}, so the copy can be reissued later`],
              ['Runs again from', 'Settings, Display'],
              ['Remembered in', 'A profile column, plus one local flag per layout'],
              ['Why per layout', 'The phone walk and the desktop walk point at different chrome. Somebody who joined on a laptop has not seen the phone one.'],
            ]}
          />
        </div>
      </Panel>

      {/* ------------------------------------------------ the install ask --- */}

      <Panel
        i={3}
        title="Putting it on a home screen"
        hint="Shown on a phone, before the app, once the creator is approved. It is an ask and not a wall, and the reason is the interesting part."
        action={<Choice size="sm" value={screen} onChange={setScreen} options={[
          { value: 'install', label: 'The screen' },
          { value: 'why', label: 'Can we force it?' },
        ]} />}
      >
        {screen === 'install' ? (
          <>
            <Note className="mb-5" icon="alert">
              <p className="font-semibold">On a desktop this screen correctly refuses to render.</p>
              <p>
                It only appears on a phone that is not already installed. Set the frame below to Phone to
                see it; at Tablet and Desktop widths you will get the app, which is the point.
              </p>
            </Note>
            <Stage {...stage} src="/settings?demo=1" label="The app on a phone" height={780} />
          </>
        ) : (
          <div className="space-y-5">
            <InfoList
              items={[
                { icon: 'check', t: 'Android: yes, one tap', d: 'Chrome fires beforeinstallprompt. We capture it at startup and can open the real install prompt from our own button.' },
                { icon: 'ban', t: 'iPhone: no, and there is no way round it', d: 'Safari has never had that event. Installing is Share then Add to Home Screen, by hand. Nothing on a page can trigger it, so the best available is three clear steps and a drawing of the button.' },
                { icon: 'eye', t: 'But detecting it works everywhere', d: 'display-mode: standalone, plus navigator.standalone for older iOS. So the gate is enforceable even where the install is not triggerable.' },
                { icon: 'alert', t: 'Which is why it is not a wall', d: 'An in-app browser - Instagram, TikTok, a DM - cannot add anything to a home screen at all. Hard-blocking locks out exactly the people most likely to arrive that way. And somebody who later deletes the icon would be locked out of an approved account.' },
                { icon: 'bell', t: 'The honest reason to ask', d: 'On iOS, web push ONLY works for an installed app. That is not a preference, it is Apple. So the screen leads with notifications rather than with "we would prefer it".' },
              ]}
            />
            <div>
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-smoke">
                The steps this device would be shown
              </p>
              <ol className="space-y-2">
                {installSteps().map((s, i) => (
                  <li key={s.text} className="flex items-center gap-3 rounded-card bg-cloud/60 px-4 py-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold text-brand">{i + 1}</span>
                    <span className="text-sm">{s.text}</span>
                  </li>
                ))}
              </ol>
              <KeyVal
                className="mt-4"
                rows={[
                  ['This device looks like', ios ? 'iOS' : 'Not iOS'],
                  ['Already installed', isStandalone() ? 'Yes' : 'No, running in a browser tab'],
                  ['Switch', 'install_gate_enabled, currently false'],
                ]}
              />
            </div>
            <Note tone="warn" icon="bulb">
              <p className="font-semibold">The recommendation.</p>
              <p>
                Ship it as a strong ask with a visible way past, which is what is built. If you later want
                it closer to compulsory, the safe version is: block only when the browser is one that CAN
                install, and always let an in-app browser through. Never block iOS Safari outright without
                the escape hatch, because a creator who declines once has no way back in.
              </p>
            </Note>
          </div>
        )}
      </Panel>
    </LabPage>
  )
}
