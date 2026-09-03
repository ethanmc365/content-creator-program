import { Link } from 'react-router-dom'
import { Avatar } from './ui'
import Icon from './Icon'
import { podiumTier } from '../lib/podiumTiers'
import { cx } from '../lib/utils'

// ONE PODIUM. TWO PAGES DREW IT, SO IT IS A COMPONENT NOW.
//
// Ethan: "looking at the archive leaderboard for the UK challenge, I like the
// new colour structure for it - although I want this structure to be the same
// as the one on the leaderboard page, the global all-time leaderboard. Make
// them the same."
//
// They were two hand-written podiums. The all-time board had ring-4 faces, a
// name, the number under it and a tall solid block carrying the PLACE NUMBER;
// the challenge podium had a 3px collar, gradient blocks half the height and
// the word "1st". Same idea, two drawings, and they drifted on colour before
// they drifted on shape (lib/podiumTiers is the fix for the colour half).
//
// This is the all-time board's structure, driven by the one orange ladder, and
// both callers render it. A third surface cannot invent a fourth podium.
//
// NO framer-motion. `/challenges` is an eagerly routed page and WinnersPodium
// is on it, so the entrance is a CSS keyframe (`animate-fade-up`) with a
// per-step delay - the same ladder timing the all-time board used, minus the
// runtime.

// The tallest block is in the MIDDLE, which is what makes it read as a podium
// rather than as a descending bar chart.
const ORDER = [2, 1, 3]
const HEIGHT = { 1: 'h-28', 2: 'h-20', 3: 'h-16' }

/**
 * @param places [{ rank, id, name, photo_url, score, unit, sub, extra, prize, empty }]
 *               `score` is already formatted, and so is `sub` - the quieter
 *               second line under it, which on a points board carries the view
 *               count so the step shows both numbers; `extra` is an optional node
 *               under the score line (the podium's "Watch" chip); `empty`
 *               draws the step as unclaimed rather than leaving a hole in the
 *               podium, which is the same promise ChallengeLeaderboard makes -
 *               a board on day one is the one people most need to read.
 * @param meId   draws this creator's name in brand
 * @param animate false inside a canvas/snapshot, where a keyframe never lands
 */
export default function Podium({ places = [], meId = null, animate = true, className = '' }) {
  const at = (n) => places.find((p) => Number(p.rank) === n)
  const order = ORDER.map(at).filter(Boolean)
  if (order.length === 0) return null

  return (
    <div className={cx('flex items-end justify-center gap-2 sm:gap-4', className)}>
      {order.map((p) => {
        const place = Number(p.rank)
        const tier = podiumTier(place)
        const first = place === 1
        return (
          <div
            key={p.id ?? place}
            className={cx('flex w-full max-w-[10rem] flex-col items-center', animate && 'animate-fade-up')}
            // The middle step lands first and the outer two follow, so the
            // podium assembles from the winner outwards.
            style={animate ? { animationDelay: `${0.08 * (4 - place)}s` } : undefined}
          >
            <PodiumFace to={p.empty || !p.id ? null : `/profile/${p.id}`}>
              {p.empty ? (
                // AN OPEN PLACE IS DRAWN, NOT LEFT OUT. A dashed ring where the
                // face goes says "nobody is standing here" faster than a
                // sentence, and it is the same shape the leaderboard rows and
                // the live challenge card use for the identical idea.
                <span
                  aria-hidden
                  className={cx(
                    'flex items-center justify-center rounded-full border-2 border-dashed border-brand/30 text-brand/40',
                    first ? 'h-[5.5rem] w-[5.5rem]' : 'h-14 w-14',
                  )}
                >
                  <Icon name="user" className={first ? 'h-7 w-7' : 'h-5 w-5'} />
                </span>
              ) : (
                /* The collar IS the ring - a padded disc in the place's own
                   tone, which survives an inline colour where `ring-4` cannot. */
                <span
                  className="block rounded-full p-1 transition-transform duration-200 group-hover:scale-105"
                  style={{ background: tier.disc }}
                >
                  <Avatar src={p.photo_url} name={p.name} size={first ? 'lg' : 'md'} />
                </span>
              )}
              <p className={cx(
                'mt-2 max-w-full truncate text-center text-sm font-semibold transition-colors group-hover:text-brand',
                p.empty && 'text-gray-400',
                !p.empty && meId && p.id === meId && 'text-brand',
              )}>
                {p.name}
              </p>
            </PodiumFace>

            {p.score != null && (
              <p className="text-xs font-bold tabular-nums text-brand">
                {p.score}{p.unit ? ` ${p.unit}` : ''}
              </p>
            )}
            {/* THE VIEWS, NEXT TO THE POINTS (3 Sep 2026).
                Ethan: "on the podium as well as the points, it should still
                show the views beside it as well because that's also important."
                A points total answers "who is winning"; it does not answer "did
                this challenge reach anybody", which is the number the programme
                is actually for. Both, or the board only tells half the story. */}
            {p.sub && (
              <p className="text-[11px] font-medium tabular-nums text-smoke">{p.sub}</p>
            )}
            {/* WHAT THIS STEP IS WORTH, on the step. A podium that shows who is
                winning without showing what they are winning is half the fact,
                and on an empty board the prize is the ONLY fact there is. */}
            {p.prize && (
              <p className="mt-1 max-w-full truncate text-center text-[11px] font-semibold text-smoke" title={p.prize}>
                {p.prize}
              </p>
            )}
            {p.extra && <div className="mt-1.5">{p.extra}</div>}

            <div
              className={cx('mt-2 flex w-full items-start justify-center rounded-t-xl pt-2 text-lg font-bold', HEIGHT[place])}
              style={{ background: tier.disc, color: tier.ink }}
            >
              {place}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// A podium step is a link when we know whose it is, and plain markup when we do
// not - an anchor with no href is a focus stop that goes nowhere.
function PodiumFace({ to, children }) {
  if (!to) return <span className="group flex flex-col items-center">{children}</span>
  return <Link to={to} className="group flex flex-col items-center">{children}</Link>
}
