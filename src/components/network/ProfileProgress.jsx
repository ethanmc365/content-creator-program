import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { useAuth } from '../../context/AuthContext'
import Icon from '../Icon'
import { ProgressRing } from './Motion'
import { cx } from '../../lib/utils'
import { listContainer, listItem } from '../../lib/motion'

// How finished is your profile, and what is the next thing worth doing.
//
// Onboarding collects the required fields and then stops, so a creator's
// profile is "complete enough to exist" and usually not complete enough to be
// found: no town means no pin on the map, no languages means they never surface
// in a language filter, no travel photos means an empty gallery on the profile
// somebody just clicked. None of that is urgent enough to block signup and all
// of it is worth doing, which is exactly what a progress card is for.
//
// It disappears at 100%. A checklist that stays after you have finished it is
// nagging, and this is meant to be a nudge.

/**
 * Is there anything left for this creator to fill in?
 *
 * Exported because the hub needs the answer BEFORE it renders the card. Its
 * entrance ladder counts sections in JSX order, and a section that renders
 * nothing still consumes a step - which leaves a 50ms hole in the sequence for
 * every creator whose profile is already complete. Asking first means the
 * ladder only ever counts things that appear.
 */
export function profileNeedsWork(profile) {
  if (!profile) return false
  return steps(profile).some((s) => !s.done)
}

function steps(profile) {
  return [
    { done: !!profile?.photo_url, label: 'Add a profile photo', to: '/settings', icon: 'smile' },
    { done: !!(profile?.city && profile?.country), label: 'Add your town so you appear on the map', to: '/settings', icon: 'pin' },
    { done: !!profile?.bio, label: 'Write a one-line bio', to: '/settings', icon: 'pencil' },
    {
      done: !!(profile?.instagram_url || profile?.tiktok_url || profile?.youtube_url || profile?.facebook_url),
      label: 'Link the accounts you post on', to: '/settings', icon: 'link',
    },
    { done: (profile?.languages || []).length > 0, label: 'Tell us which languages you speak', to: '/settings', icon: 'chat' },
    { done: (profile?.countries_visited || []).length > 0, label: 'Fill in your travel map', to: '/settings', icon: 'globe' },
  ]
}

export default function ProfileProgress({ className }) {
  const { profile } = useAuth()
  if (!profile) return null

  const list = steps(profile)
  const done = list.filter((s) => s.done).length
  const pct = Math.round((done / list.length) * 100)
  if (pct === 100) return null

  const next = list.filter((s) => !s.done).slice(0, 3)

  return (
    <section className={cx('rounded-card border border-brand/25 bg-brand-tint/20 p-5', className)}>
      <div className="flex items-center gap-4">
        <ProgressRing value={pct} size={52} stroke={5} />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Your profile is {pct}% there</h2>
          <p className="mt-0.5 text-sm text-smoke">
            {done} of {list.length} done. A fuller profile is how other creators find you.
          </p>
        </div>
      </div>

      <motion.ul variants={listContainer} initial="hidden" animate="show" className="mt-4 space-y-1.5">
        {next.map((s) => (
          <motion.li key={s.label} variants={listItem}>
            <Link
              to={s.to}
              className="flex items-center gap-3 rounded-xl bg-white px-3.5 py-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-tint">
                <Icon name={s.icon} className="h-3.5 w-3.5 text-brand" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.label}</span>
              <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300" />
            </Link>
          </motion.li>
        ))}
      </motion.ul>
    </section>
  )
}
