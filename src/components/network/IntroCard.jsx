import { Link } from 'react-router-dom'
import Icon from '../Icon'
import SocialMark from '../SocialMark'
import ConnectButton from '../ConnectButton'
import { Avatar } from '../ui'
import { flagEmoji } from '../../lib/countries'
import { socialHref } from '../../lib/socialLinks'
import { useT } from '../../lib/i18n'
import { cx } from '../../lib/utils'

// AN INTRODUCTION, DRAWN AS A CARD (24 Sep 2026). See lib/intro for the shape
// and the reasons. It replaces the grey bubble of "Label: value." lines in the
// introductions room - for new intros (messages.intro) and old ones alike,
// which the room reads back with parseLegacyIntro - and it ends in the two
// things somebody reading it actually wants to do: connect, or say hello.

function Flags({ list, max = 14 }) {
  const shown = list.filter((c) => c.iso).slice(0, max)
  const more = list.filter((c) => c.iso).length - shown.length
  if (!shown.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((c) => (
        <span key={c.iso + c.name} title={c.name} className="text-[19px] leading-none">{flagEmoji(c.iso)}</span>
      ))}
      {more > 0 && <span className="ml-1 text-[11px] font-semibold text-smoke">+{more}</span>}
    </div>
  )
}

function Row({ icon, label, children }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
        <Icon name={icon} className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-smoke">{label}</p>
        <div className="mt-0.5 text-[13px] leading-snug text-ink [overflow-wrap:anywhere]">{children}</div>
      </div>
    </div>
  )
}

const SOCIALS = [['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['facebook', 'Facebook']]

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
  const mine = sender?.id && sender.id === myId
  const where = [intro.city, intro.country].filter(Boolean).join(', ')
  const stats = intro.stats && [
    intro.stats.countries > 0 && { icon: 'globe', value: intro.stats.countries, label: intro.stats.countries === 1 ? tr('country') : tr('countries') },
    intro.stats.flights > 0 && { icon: 'plane', value: intro.stats.flights, label: intro.stats.flights === 1 ? tr('flight logged') : tr('flights logged') },
    intro.stats.videos > 0 && { icon: 'video', value: intro.stats.videos, label: intro.stats.videos === 1 ? tr('challenge video') : tr('challenge videos') },
  ].filter(Boolean)
  const socials = SOCIALS.filter(([k]) => intro.socials?.[k])

  return (
    <article className={cx('w-full max-w-[26rem] overflow-hidden rounded-card border border-gray-100 bg-white text-ink shadow-card', className)}>
      {/* The band: who and where, on the brand. */}
      <div className="relative bg-gradient-to-br from-brand to-brand-light px-4 pb-4 pt-4 text-white">
        <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
        <div className="relative flex items-center gap-3">
          <Link to={sender?.id ? `/profile/${sender.id}` : '#'} className="shrink-0">
            <Avatar src={sender?.photo_url} name={sender?.name || intro.first} size="md" className="ring-2 ring-white/70" />
          </Link>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/80">{tr('Say hello to')}</p>
            <p className="truncate text-lg font-bold leading-tight">{sender?.name || intro.first}</p>
            {where && (
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs font-medium text-white/90">
                {intro.iso && <span className="text-sm leading-none">{flagEmoji(intro.iso)}</span>}
                {where}
              </p>
            )}
          </div>
        </div>
        {stats?.length > 0 && (
          <div className="relative mt-3 flex flex-wrap gap-1.5">
            {stats.map((s) => (
              <span key={s.label} className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold">
                <Icon name={s.icon} className="h-3 w-3" />
                <span className="tabular-nums">{s.value}</span> {s.label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3 px-4 py-3.5">
        {intro.makes?.length > 0 && (
          <Row icon="video" label={tr('Makes')}>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {intro.makes.map((m) => (
                <span key={m} className="rounded-full bg-cloud px-2.5 py-0.5 text-[12px] font-medium">{tr(m)}</span>
              ))}
            </div>
          </Row>
        )}
        {intro.next?.text && (
          <Row icon="plane" label={tr('Next trip')}>
            {intro.next.iso && <span className="mr-1.5 text-base leading-none">{flagEmoji(intro.next.iso)}</span>}
            {intro.next.text}
          </Row>
        )}
        {intro.visited?.some((c) => c.iso) && (
          <Row icon="globe" label={tr('Been to')}>
            <Flags list={intro.visited} />
          </Row>
        )}
        {intro.dreams?.some((c) => c.iso) && (
          <Row icon="heart" label={tr('Dream trips')}>
            <Flags list={intro.dreams} max={10} />
          </Row>
        )}
        {intro.ask && <Row icon="chat" label={tr('Ask me about')}>{intro.ask}</Row>}
        {intro.fact && <Row icon="sparkles" label={tr('Fun fact')}>{intro.fact}</Row>}
        {intro.wants?.length > 0 && (
          <Row icon="users" label={tr('Here for')}>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {intro.wants.map((w) => (
                <span key={w} className="rounded-full border border-brand/30 px-2.5 py-0.5 text-[12px] font-medium text-brand">{tr(w)}</span>
              ))}
            </div>
          </Row>
        )}
        {socials.length > 0 && (
          <div className="flex items-center gap-2 pt-0.5">
            {socials.map(([k, label]) => (
              <a key={k} href={socialHref(intro.socials[k], k)} target="_blank" rel="noopener noreferrer" aria-label={label}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-100 bg-white shadow-card transition-transform duration-200 hover:-translate-y-0.5">
                <SocialMark brand={k} colored className="h-4 w-4" />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* CONNECT, RIGHT HERE. Not on your own intro. */}
      {!mine && sender?.id && myId && (
        <div className="flex gap-2 border-t border-gray-100 px-4 py-3">
          <ConnectButton
            myId={myId}
            targetId={sender.id}
            targetName={sender.name}
            relation={relation}
            onChange={(next) => onRelation?.(sender.id, next)}
            className="flex-1 !py-2 text-[13px]"
          />
          <Link to={`/messages?to=${sender.id}`} className="btn-secondary flex-1 justify-center !py-2 text-[13px]">
            <Icon name="chat" className="h-4 w-4" /> {tr('Message')}
          </Link>
        </div>
      )}
    </article>
  )
}
