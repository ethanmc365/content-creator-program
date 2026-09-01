import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { supabase } from '../../lib/supabase'
import Icon from '../Icon'
import { Avatar } from '../ui'
import { RailCardSkeleton } from './Skeletons'
import { cx, timeAgo } from '../../lib/utils'
import { listContainer, listItem } from '../../lib/motion'
import { useT } from '../../lib/i18n'

// What has actually happened here lately.
//
// A market page can be entirely accurate and still read as abandoned: a live
// challenge, three rooms and a roster tell you what EXISTS, not whether anybody
// is using it. The single most common reason a new member leaves a community is
// deciding it is dead, and the cheapest cure is showing them it is not.
//
// Three sources, merged and sorted by time: people joining, people talking, and
// people entering the challenge. Nothing here is a new table; it is the same
// rows the rest of the page already reads, asked a different question.

const KIND = {
  joined: { icon: 'users', tint: 'bg-brand-tint text-brand' },
  posted: { icon: 'chat', tint: 'bg-cloud text-smoke' },
  entered: { icon: 'video', tint: 'bg-brand text-white' },
}

export default function MarketActivity({ market, limit = 8 }) {
  const tr = useT()
  const [items, setItems] = useState(null)

  useEffect(() => {
    if (!market?.id) return
    let alive = true
    async function load() {
      const [{ data: joins }, { data: posts }, { data: subs }] = await Promise.all([
        supabase.from('community_members')
          .select('profile_id, joined_at, profiles!inner(id, name, photo_url, is_test, status)')
          .eq('community_id', market.id).eq('status', 'active')
          .eq('profiles.is_test', false).eq('profiles.status', 'active')
          .order('joined_at', { ascending: false }).limit(limit),
        supabase.from('messages')
          .select('id, channel, created_at, body, profiles:sender_id(id, name, photo_url)')
          .like('channel', `${market.slug}:%`).eq('deleted', false)
          .order('created_at', { ascending: false }).limit(limit),
        // Entries to THIS market's challenges only. Without the inner join on
        // challenges a market page would show submissions from every market.
        supabase.from('submissions')
          .select('id, submitted_at, platform, challenges!inner(id, title, community_id), profiles:creator_id(id, name, photo_url)')
          .eq('challenges.community_id', market.id)
          .order('submitted_at', { ascending: false }).limit(limit),
      ])
      if (!alive) return

      const merged = [
        ...(joins || []).map((j) => ({
          key: `j-${j.profile_id}`, kind: 'joined', at: j.joined_at,
          who: j.profiles, text: `joined ${market.name}`, to: `/profile/${j.profile_id}`,
        })),
        ...(posts || []).map((p) => ({
          key: `p-${p.id}`, kind: 'posted', at: p.created_at, who: p.profiles,
          text: `posted in ${p.channel.split(':')[1] || 'a room'}`,
          to: `/c/${market.slug}/chat/${p.channel.split(':')[1] || 'general'}`,
        })),
        ...(subs || []).map((s) => ({
          key: `s-${s.id}`, kind: 'entered', at: s.submitted_at, who: s.profiles,
          text: `entered ${s.challenges?.title || 'the challenge'}`,
          to: `/challenges/${s.challenges?.id}`,
        })),
      ]
        .filter((i) => i.who && i.at)
        .sort((a, b) => new Date(b.at) - new Date(a.at))
        .slice(0, limit)

      setItems(merged)
    }
    load()
    return () => { alive = false }
  }, [market?.id, market?.slug, market?.name, limit])

  if (items === null) return <RailCardSkeleton rows={4} />

  if (items.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-gray-200 px-5 py-8 text-center">
        <Icon name="clock" className="mx-auto h-6 w-6 text-gray-200" />
        <p className="mt-2 text-sm font-medium">{tr("Nothing has happened here yet")}</p>
        <p className="mx-auto mt-1 max-w-xs text-xs text-smoke">
          {tr("Joins, posts and challenge entries will show up here as they happen.")}
        </p>
      </div>
    )
  }

  return (
    <motion.ol variants={listContainer} initial="hidden" animate="show" className="space-y-1">
      {items.map((i) => {
        const k = KIND[i.kind]
        return (
          <motion.li key={i.key} variants={listItem}>
            <Link
              to={i.to}
              className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-cloud"
            >
              <span className="relative shrink-0">
                <Avatar src={i.who.photo_url} name={i.who.name} size="sm" />
                <span className={cx(
                  'absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-white',
                  k.tint,
                )}>
                  <Icon name={k.icon} className="h-2.5 w-2.5" />
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">
                  <span className="font-semibold">{i.who.name?.split(' ')[0]}</span>{' '}
                  <span className="text-smoke">{i.text}</span>
                </span>
                <span className="block text-[11px] text-smoke">{timeAgo(i.at)}</span>
              </span>
            </Link>
          </motion.li>
        )
      })}
    </motion.ol>
  )
}
