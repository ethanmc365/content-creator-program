import { useState } from 'react'
import Icon from '../Icon'
import { Modal } from '../ui'
import { useT } from '../../lib/i18n'
import { useContentTranslations } from '../../lib/contentTranslate'
import { TranslateSwitch } from '../TranslatedText'
import { cx, dateTag } from '../../lib/utils'
import { ruleWindowState } from '../../lib/scoring'
import { isBonusKind } from './ScoringPanel'
import { SLOT, SLOT_ICON } from '../challenge/SwapIn'
import { BoostDisc, boostMult } from '../challenge/BoostBanner'
import { windowPhrase } from '../../lib/boostWindow'

// THE EXTRA POINTS, IN THEIR OWN CARD, IN THE RAIL (24 Sep 2026).
//
// Ethan: "anything that's related to bonus points - just posting a video, or
// post at least one video in all 4 weeks, or bonus points - should have a
// little separate column on the right side, just below 'Platforms you can post
// on'. This should be a different UI that stands out more than the regular
// points."
//
// WHITE CARDS INSIDE THE ORANGE (26 Sep 2026). Ethan: "I like the nice orange
// card that makes it stand out, but I would make the card inside it maybe white
// ... it seems to be too much orange, and it's quite hard to read."
//
// So it is the one SOLID BRAND card on the page. The view ladder on the left is
// the steady part of the scoring and reads as a table; these are the offers,
// the things a creator can go and do this week to jump a place, and they are
// drawn as offers. A bonus with dates (migration 256) says when it runs, and
// one that has finished drops to the foot, dimmed, saying the points are kept.
//
// AND THE SMALL PRINT MOVED BEHIND A PRESS (28 Sep 2026). Ethan: "for the bonus
// points UI can you make this shorter - 'Tick the box when you submit the
// video', 'Counts once the video passes 500 views' - or only appear when it's
// clicked, just to make the card and UI tidied. Clicking on the bonus points
// should show a card with the information bigger and better UI."
//
// Every row was carrying up to four lines of conditions, and a rail of them
// read as a terms-and-conditions page rather than a list of offers. A row is
// now the three things you choose between - what it is, when it runs, what it
// pays - and everything that qualifies those (how you earn it, the ceiling, the
// views a video has to pass) opens in its own card, where there is room to say
// it properly instead of in grey eleven-pixel type.

const ICON = { per_post: 'video', platform_spread: 'share', consistency: 'calendar', bonus: 'star', collab: 'users' }

const dm = (iso) => new Date(iso).toLocaleDateString(dateTag(), { weekday: 'short', day: 'numeric', month: 'short' })

// HOW MANY TIMES, AND THE CEILING, IN ONE SENTENCE (30 Sep 2026). Ethan disliked "The most it
// can pay: 25 points in total, however many times you do it". A cap of 25 on a +5 bonus IS
// five claims, so say that: "You can claim this bonus on 5 videos for a maximum of 25 points".
function claimLine(r, tr) {
  const pts = Number(r.points) || 0
  const max = r.max_points != null ? Number(r.max_points) : null
  if (max == null || pts <= 0) return null
  const n = Math.max(1, Math.floor(max / pts))
  const total = max
  if (r.kind === 'platform_spread') return { n, text: tr('You can claim this bonus on {n} platforms for a maximum of {p} points', { n, p: total }) }
  if (r.kind === 'collab') return { n, text: tr('You can earn this with {n} different creators for a maximum of {p} points', { n, p: total }) }
  if (r.kind === 'consistency') return { n, text: tr('You can claim this bonus {n} times for a maximum of {p} points', { n, p: total }) }
  return { n, text: tr('You can claim this bonus on {n} videos for a maximum of {p} points', { n, p: total }) }
}

function howToEarn(r, tr) {
  if (r.kind === 'per_post') return tr('For every video you post')
  if (r.kind === 'platform_spread') return tr('For each platform you post on')
  if (r.kind === 'collab') return tr('Post an Instagram collab post with another creator and both enter its link. You both earn the points')
  if (r.kind === 'consistency') {
    const d = Number(r.period_days) || 7
    return d === 1 ? tr('Post at least one video every day')
      : d === 7 ? tr('Post at least one video every week')
        : tr('Post at least one video every {n} days', { n: d })
  }
  if (r.prompt) return tr('Tick the box when you submit the video')
  return tr('Given by the team')
}

export default function BonusPointsCard({ rules, now = 0, className, boost = null }) {
  const tr = useT()
  // Before the early return: a hook cannot be called conditionally, and this
  // component returns nothing at all when a challenge has no bonuses.
  const [open, setOpen] = useState(null)
  const bonuses = (rules || []).filter(isBonusKind)
  // The labels and questions are what an admin typed, so a reader in another language gets them
  // translated, with ONE Translated | Original switch for the whole card (30 Sep 2026).
  const tx = useContentTranslations(bonuses.flatMap((r) => [r.label?.trim(), r.prompt?.trim()]))
  const stateOf = (r) => ruleWindowState(r, now || undefined)
  if (bonuses.length === 0 && !boost) return null
  const current = bonuses.filter((r) => stateOf(r) !== 'ended')
  const ended = bonuses.filter((r) => stateOf(r) === 'ended')

  return (
    <section id="bonus-points" className={cx('scroll-mt-24 overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light text-white shadow-card', className)}>
      <div className="flex items-center gap-2.5 px-5 pb-3 pt-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20">
          <Icon name="star" className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold uppercase tracking-wider">{tr('Bonus points')}</h2>
          <p className="text-xs text-white/80">{tr('On top of your view points')}</p>
        </div>
        <TranslateSwitch t={tx} className="shrink-0" />
      </div>
      {/* A POINT BOOST IS AN OFFER TOO (7 Oct 2026). Ethan: the double points window "should show up on the bonus points
          card that the creator sees too". It leads the list while it is on or coming up. */}
      {boost && (
        <div className="mx-3 mb-1.5 flex items-center gap-3 rounded-xl bg-gradient-to-r from-ink via-[#2b160c] to-[#5a2308] px-3 py-3 shadow-sm">
          <BoostDisc multiplier={boost.multiplier} live={boost.live} className="h-10 w-10 text-sm" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold leading-snug text-white">{boost.label}</span>
            <span className="mt-0.5 block text-[11.5px] leading-snug text-white/75">
              {tr('Videos posted {d} count {n}.', { d: windowPhrase(boost.starts_at, boost.ends_at, tr), n: boostMult(boost.multiplier) })}
              {boost.max_extra_points ? ` ${tr('Up to {p} extra points each.', { p: boost.max_extra_points })}` : ''}
            </span>
          </span>
          <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', boost.live ? 'bg-brand text-white' : 'bg-white/15 text-white')}>
            {boost.live ? tr('On now') : tr('Coming up')}
          </span>
        </div>
      )}
      <ul className="space-y-1.5 px-3 pb-3">
        {[...current, ...ended].map((r) => {
          const state = stateOf(r)
          const done = state === 'ended'
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setOpen(r)}
                aria-label={tr('How {label} works', { label: r.label.trim() })}
                className={cx(
                  'group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left shadow-sm transition-transform duration-200',
                  done ? 'bg-white/70 opacity-70' : 'bg-white hoverable:hover:-translate-y-0.5',
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand"><Icon name={ICON[r.kind] || 'star'} className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{tx.pick(r.label.trim())}</span>
                  {state !== 'always' && (
                    <span className={cx(
                      'mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                      done ? 'bg-cloud text-smoke' : 'bg-brand text-white',
                    )}>
                      <Icon name="clock" className="h-3 w-3" />
                      {state === 'ended' ? tr('Ended {d}, points kept', { d: dm(r.ends_at) })
                        : state === 'upcoming' ? tr('Starts {d}', { d: dm(r.starts_at) })
                          : r.ends_at ? tr('Until {d}', { d: dm(r.ends_at) }) : tr('Running now')}
                    </span>
                  )}
                </span>
                <span className={cx(
                  'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums',
                  done ? 'bg-cloud text-smoke' : 'bg-brand text-white',
                )}>
                  +{Number(r.points)}
                </span>
                <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300 transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>
            </li>
          )
        })}
      </ul>
      <BonusDetail rule={open} state={open ? stateOf(open) : null} onClose={() => setOpen(null)} pick={tx.pick} />
    </section>
  )
}

// ONE BONUS, WITH ROOM TO EXPLAIN ITSELF.
//
// Everything the row used to whisper in eleven-pixel grey, said once, in order:
// what it pays, how you earn it, what caps it, and when it runs. Each condition
// is its own line with its own icon, because they are different KINDS of fact -
// "post on four platforms" is an instruction and "the video has to pass 500
// views" is a condition on whether that instruction counted.
function BonusDetail({ rule, state, onClose, pick = (x) => x }) {
  const tr = useT()
  if (!rule) return null
  const claim = claimLine(rule, tr)
  const min = rule.kind === 'bonus' ? Number(rule.min_views) || 0 : 0
  const facts = [
    { icon: 'check', label: tr('How you earn it'), value: howToEarn(rule, tr) },
    // THE CEILING SITS UNDER HOW YOU EARN IT (2 Oct 2026). Ethan: "rather than actually putting
    // that as a separate card, I would just put it in the little thing below 'How you earn it' ...
    // just the icon and then the text".
    claim ? { icon: 'ticket', label: tr('How many times'), value: `${claim.text}.` } : null,
    min > 0
      ? { icon: 'eye', label: tr('Before it counts'), value: tr('The video has to pass {n} views. It is added as soon as it does.', { n: min.toLocaleString() }) }
      : null,
    state && state !== 'always'
      ? {
        icon: 'calendar',
        label: tr('When it runs'),
        value: state === 'ended'
          ? tr('Finished on {d}. Points already earned are kept.', { d: dm(rule.ends_at) })
          : state === 'upcoming'
            ? tr('Opens on {d}.', { d: dm(rule.starts_at) })
            : rule.ends_at
              ? tr('Running now, until {d}.', { d: dm(rule.ends_at) })
              : tr('Running now.'),
      }
      : { icon: 'calendar', label: tr('When it runs'), value: tr('For the whole challenge.') },
  ].filter(Boolean)

  return (
    <Modal open onClose={onClose} title={tr('Bonus points')}>
      <div className="space-y-5">
        <div className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-5 text-white shadow-card">
          <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20">
              <Icon name={ICON[rule.kind] || 'star'} className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold leading-snug [overflow-wrap:anywhere]">{pick(rule.label.trim())}</p>
              <p className="mt-0.5 text-xs text-white/80">{tr('On top of your view points')}</p>
            </div>
            <span className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-bold tabular-nums text-brand shadow-card">
              +{Number(rule.points)}
            </span>
          </div>
        </div>

        <ul className="space-y-3">
          {facts.map((f) => (
            <li key={f.label} className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cloud text-smoke">
                <Icon name={f.icon} className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-bold uppercase tracking-wide text-gray-400">{f.label}</span>
                <span className="block text-sm leading-relaxed text-ink">{f.value}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  )
}

// THE BONUS RUNNING RIGHT NOW, BESIDE THE TABS. Only a bonus with DATES earns a
// place here - one that runs all challenge is already in the card; a bonus for
// this week alone is news, and news goes at the top.
export function LiveBonusCallout({ rules, now, onOpen }) {
  const tr = useT()
  const live = (rules || []).filter((r) => isBonusKind(r) && r.ends_at && ruleWindowState(r, now) === 'live')
  // What an admin typed, so it is translated for a reader in another language like the card is
  // (2 Oct 2026: "Bonus points for using the hook" stayed English after translating).
  const tx = useContentTranslations(live.slice(0, 1).map((x) => x.label?.trim()))
  if (live.length === 0) return null
  const r = live[0]
  // AS WIDE AS THE ROW, AND IT ARRIVES LIKE THE LEADERBOARD BADGE (26 Sep
  // 2026). Ethan: "you have more space to widen it on desktop ... start from
  // that right and go as far as the entries button ... make it stand out more"
  // and "show up ... with that same animation, so it looks clean, like
  // expanding in and out." `sm:flex-1` fills the row beside the tabs exactly as
  // BoardStatus does, and `board-status` is that badge's own entrance.
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        'board-status group relative min-w-0 overflow-hidden text-left text-white shadow-card transition-transform duration-200 hoverable:hover:-translate-y-0.5',
        'bg-gradient-to-r from-ink via-[#2b160c] to-[#5a2308]',
        SLOT,
      )}
    >
      <span aria-hidden className="challenge-sheen pointer-events-none absolute inset-y-0" />
      <span className={cx('relative bg-brand', SLOT_ICON)}>
        <Icon name="star" className="hook-sparkles h-4 w-4" />
        <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-brand/40 [animation-duration:2.4s]" />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-brand-light">
          {tr('Bonus running until {d}', { d: dm(r.ends_at) })}
        </span>
        <span className="block truncate text-[13px] font-semibold">{tx.pick(r.label.trim())}</span>
      </span>
      {live.length > 1 && (
        <span className="relative hidden shrink-0 text-[11px] font-semibold text-white/70 sm:inline">{tr('+{n} more', { n: live.length - 1 })}</span>
      )}
      <span className="relative shrink-0 rounded-full bg-brand px-2.5 py-1 text-xs font-bold tabular-nums shadow-card">+{Number(r.points)}</span>
      <Icon name="chevronRight" className="relative hidden h-4 w-4 shrink-0 text-white/70 transition-transform duration-200 group-hover:translate-x-0.5 sm:block" />
    </button>
  )
}
