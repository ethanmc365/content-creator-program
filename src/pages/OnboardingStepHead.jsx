import { cx } from '../lib/utils'
import { useT } from '../lib/i18n'

export function StepHead({ step, pending, team = false }) {
  const tr = useT()
  if (step.key === 'welcome') return null
  const chip = step.need ? 'Required' : step.skippable ? 'Optional' : null
  const COPY = {
    identity: ['Who are you?', 'Your face and your name. Both appear everywhere on the platform.'],
    based: ['Where are you based?', 'This decides your market, puts you on the map, and is how the team reaches you.'],
    socials: ['Where do you post?', 'Link your accounts so creators and the Tryp.com Team can find your work.'],
    story: ['Tell us about you', 'This is the part a person actually reads.'],
    // IT SAYS WHAT THE ANSWER IS ACTUALLY FOR (4 Sep 2026). Ethan: "the
    // languages you speak - this is an important section, and I want this to
    // also matter whenever admins are viewing the applications, because the
    // language could depend what market they end up going into."
    //
    // It now does: an admin reviewing this application sees the languages
    // beside the market picker, with any market this person's languages point
    // at flagged. A question that decides where somebody lands should say so
    // while they are answering it - "used to match you with collaboration
    // partners" undersold it into a nice-to-have, and a nice-to-have is a
    // question people answer with one word.
    languages: ['Languages you speak', 'This can decide which market you join, and it is how creators find somebody to collaborate with. Add every one you could film or talk in.'],
    map: ['Paint your travel map', 'Tap every country you have been to and watch it glow.'],
    // Ethan: "a few extras - I don't really like that name, I would just name
    // it as it is." It holds travel photographs and the places you want to go,
    // so it is called that.
    extras: team
      ? ['Add some travel photos', 'Totally optional. A few photos make your profile feel like yours on the team page. Press Continue to skip.']
      : ['Your travels', ''],
    review: [pending ? 'Ready to submit' : 'Almost done', 'Check it over. You can change any of it later from your profile.'],
  }
  const [title, sub] = COPY[step.key] || [step.title, '']
  return (
    <div className="mb-7 text-center">
      {chip && (
        <span
          className={cx(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide',
            step.need ? 'bg-brand-tint text-brand' : 'bg-cloud text-smoke',
          )}
        >
          {tr(chip)}
        </span>
      )}
      <h2 className={cx('text-2xl font-bold tracking-tight', chip && 'mt-3')}>{tr(title)}</h2>
      {sub && <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-smoke">{tr(sub)}</p>}
    </div>
  )
}
