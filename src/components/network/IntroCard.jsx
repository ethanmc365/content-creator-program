import { Link } from 'react-router-dom'
import Icon from '../Icon'
import SocialMark from '../SocialMark'
import ConnectButton from '../ConnectButton'
import { Avatar } from '../ui'
import { flagEmoji } from '../../lib/countries'
import { socialHref } from '../../lib/socialLinks'
import { useT } from '../../lib/i18n'
import { cx } from '../../lib/utils'

// AN INTRODUCTION, DRAWN AS A MESSAGE (5 Oct 2026; first drawn as a card on 24 Sep). See lib/intro for the shape and the reasons.
//
// Ethan: "I do like the current style, but it looks like something that was just automated, not something someone's actually filled in. Rather
// than being like a card inside it, it appears like an actual message, but it still has the cool flags UI ... the profile picture, the connect
// button." So it is a MESSAGE BUBBLE now - the same shape and the same colours as every other message in the room, tail corner and all - and
// what is inside it reads as somebody talking: their own paragraph first, then short lines that lead with a bold word the way a person would
// write them ("Next trip: Tokyo in May"), instead of a grid of upper-case field labels with an icon each. What stays from the card is what
// made it useful: the face, the flags, the one-line facts, and Connect and Message at the foot.
//
// IT SITS ON THE SAME GROUND AS A NORMAL BUBBLE: someone else's is the grey `bg-cloud`, your own is the brand bubble with white on it
// (`onDark`), exactly as NetworkChat draws a plain message. The room no longer strips the bubble off for an intro.

function Flags({ list, max = 14, onDark }) {
  const shown = list.filter((c) => c.iso).slice(0, max)
  const more = list.filter((c) => c.iso).length - shown.length
  if (!shown.length) return null
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 align-middle">
      {shown.map((c) => (
        <span key={c.iso + c.name} title={c.name} className="text-[19px] leading-none">{flagEmoji(c.iso)}</span>
      ))}
      {more > 0 && <span className={cx('ml-1 text-[11px] font-semibold', onDark ? 'text-white/80' : 'text-smoke')}>+{more}</span>}
    </span>
  )
}

/** One line of the message: a bold lead-in, then what they said. A person's sentence, not a form field. */
function Line({ lead, children, onDark }) {
  return (
    <p className="text-[14px] leading-relaxed [overflow-wrap:anywhere]">
      <span className={cx('font-bold', onDark ? 'text-white' : 'text-ink')}>{lead}</span>{' '}
      <span className={onDark ? 'text-white/95' : 'text-ink/90'}>{children}</span>
    </p>
  )
}

const SOCIALS = [['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['facebook', 'Facebook']]

/** ["a", "b", "c"] -> "a, b and c", in the reader's language. */
function sentenceList(items, tr) {
  const xs = items.map((x) => tr(x))
  if (xs.length <= 1) return xs.join('')
  return `${xs.slice(0, -1).join(', ')} ${tr('and')} ${xs[xs.length - 1]}`
}

/**
 * @param {object} intro    the structured intro (lib/intro)
 * @param {object} sender   { id, name, photo_url }
 * @param {string} myId     the reader
 * @param {object} relation the reader's relationship to the sender, or null
 * @param {function} onRelation called with the new relation after Connect
 */
export default function IntroCard({ intro, sender, myId, relation, onRelation, className }) {
  const tr = useT()
  if (!intro) return null
  const mine = !!(sender?.id && sender.id === myId)
  const onDark = mine
  const where = [intro.city, intro.country].filter(Boolean).join(', ')
  const stats = intro.stats && [
    intro.stats.countries > 0 && { icon: 'globe', value: intro.stats.countries, label: intro.stats.countries === 1 ? tr('country') : tr('countries') },
    intro.stats.flights > 0 && { icon: 'plane', value: intro.stats.flights, label: intro.stats.flights === 1 ? tr('flight logged') : tr('flights logged') },
    intro.stats.videos > 0 && { icon: 'video', value: intro.stats.videos, label: intro.stats.videos === 1 ? tr('challenge video') : tr('challenge videos') },
  ].filter(Boolean)
  const socials = SOCIALS.filter(([k]) => intro.socials?.[k])
  const muted = onDark ? 'text-white/80' : 'text-smoke'

  return (
    <article
      className={cx(
        'w-full max-w-[26rem] rounded-2xl px-3.5 py-3 text-left shadow-card [hyphens:none]',
        mine ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md bg-cloud text-ink',
        className,
      )}
    >
      {/* WHO IS TALKING: the face, the name, where they are, and how long they have been creating. */}
      <div className="flex items-center gap-2.5">
        <Link to={sender?.id ? `/profile/${sender.id}` : '#'} className="shrink-0" aria-label={sender?.name || intro.first}>
          <Avatar src={sender?.photo_url} name={sender?.name || intro.first} size="md" className={onDark ? 'ring-2 ring-white/70' : 'ring-2 ring-white'} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className={cx('truncate text-[15px] font-bold leading-tight', onDark ? 'text-white' : 'text-ink')}>{sender?.name || intro.first}</p>
          <p className={cx('mt-0.5 text-xs leading-snug', muted)}>
            {where && (
              <>
                {intro.iso && <span className="mr-1 text-sm leading-none">{flagEmoji(intro.iso)}</span>}
                {where}
              </>
            )}
            {intro.since && (
              <>
                {where ? ' · ' : ''}{intro.since === 'Just starting' ? tr('Just starting out') : tr('Creating {t}', { t: tr(intro.since).toLowerCase() })}
              </>
            )}
          </p>
        </div>
        {intro.platform && (
          <span className={cx('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold', onDark ? 'bg-white/20 text-white' : 'bg-white text-ink')}>
            <SocialMark brand={intro.platform.toLowerCase()} className="h-3 w-3" />
            {intro.platform}
          </span>
        )}
      </div>

      {/* THEIR OWN WORDS FIRST: the paragraph about themselves, as they wrote it, line breaks and all - as the body of the message. */}
      {intro.about && (
        <p className={cx('mt-3 whitespace-pre-line text-[15px] leading-relaxed [overflow-wrap:anywhere]', onDark ? 'text-white' : 'text-ink')}>
          {intro.about}
        </p>
      )}

      {/* THE FACTS, ONE LINE EACH, in the order somebody would say them. */}
      <div className={cx('space-y-1.5', intro.about ? 'mt-2.5' : 'mt-3')}>
        {intro.makes?.length > 0 && <Line onDark={onDark} lead={`${tr('I make')}:`}>{sentenceList(intro.makes, tr)}.</Line>}
        {intro.next?.text && (
          <Line onDark={onDark} lead={`${tr('Next trip')}:`}>
            {intro.next.iso && <span className="mr-1 text-base leading-none">{flagEmoji(intro.next.iso)}</span>}
            {intro.next.text}
          </Line>
        )}
        {intro.visited?.some((c) => c.iso) && (
          <Line onDark={onDark} lead={`${tr('Been to')}:`}><Flags list={intro.visited} onDark={onDark} /></Line>
        )}
        {intro.dreams?.some((c) => c.iso) && (
          <Line onDark={onDark} lead={`${tr('Dream trips')}:`}><Flags list={intro.dreams} max={10} onDark={onDark} /></Line>
        )}
        {intro.fav && <Line onDark={onDark} lead={`${tr('Best trip so far')}:`}>{intro.fav}</Line>}
        {intro.ask && <Line onDark={onDark} lead={`${tr('Ask me about')}:`}>{intro.ask}</Line>}
        {intro.hack && <Line onDark={onDark} lead={`${tr('Best travel hack')}:`}>{intro.hack}</Line>}
        {intro.local && <Line onDark={onDark} lead={`${tr('Favourite spot at home')}:`}>{intro.local}</Line>}
        {intro.fact && <Line onDark={onDark} lead={`${tr('Fun fact')}:`}>{intro.fact}</Line>}
        {intro.more && (
          <p className={cx('whitespace-pre-line text-[14px] leading-relaxed [overflow-wrap:anywhere]', onDark ? 'text-white/95' : 'text-ink/90')}>{intro.more}</p>
        )}
        {intro.wants?.length > 0 && <Line onDark={onDark} lead={`${tr('Here for')}:`}>{sentenceList(intro.wants, tr)}.</Line>}
      </div>

      {/* THE CARD'S FLAGS-AND-NUMBERS, KEPT AS ONE QUIET LINE. */}
      {stats?.length > 0 && (
        <p className={cx('mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-medium', muted)}>
          {stats.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1">
              <Icon name={s.icon} className="h-3.5 w-3.5" />
              <span className={cx('font-bold tabular-nums', onDark ? 'text-white' : 'text-ink')}>{s.value}</span> {s.label}
            </span>
          ))}
        </p>
      )}

      {socials.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          {socials.map(([k, label]) => (
            <a key={k} href={socialHref(intro.socials[k], k)} target="_blank" rel="noopener noreferrer" aria-label={label}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-card transition-transform duration-200 hover:-translate-y-0.5">
              <SocialMark brand={k} colored className="h-4 w-4" />
            </a>
          ))}
        </div>
      )}

      {/* CONNECT AND MESSAGE, RIGHT HERE. Not on your own intro. */}
      {!mine && sender?.id && myId && (
        <div className="mt-3 flex gap-2">
          <ConnectButton
            myId={myId}
            targetId={sender.id}
            targetName={sender.name}
            relation={relation}
            onChange={(next) => onRelation?.(sender.id, next)}
            className="flex-1 !py-2 text-[13px]"
          />
          <Link to={`/messages?to=${sender.id}`} className="btn-secondary flex-1 justify-center !bg-white !py-2 text-[13px]">
            <Icon name="chat" className="h-4 w-4" /> {tr('Message')}
          </Link>
        </div>
      )}
    </article>
  )
}
