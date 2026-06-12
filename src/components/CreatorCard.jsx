import { Link, useNavigate } from 'react-router-dom'
import { Avatar, Badge } from './ui'
import PlatformBadges, { platformsForProfile } from './PlatformBadges'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useState } from 'react'

// One creator in the directory grid. Whole card links to the profile;
// Connect / Message are quick actions in the footer.
export default function CreatorCard({ creator, isConnected, onConnectChange }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const isMe = creator.id === user?.id

  async function toggleConnect(e) {
    e.preventDefault() // don't trigger the card link
    setBusy(true)
    if (isConnected) {
      await supabase.from('connections').delete().eq('creator_id', user.id).eq('connected_creator_id', creator.id)
    } else {
      await supabase.from('connections').insert({ creator_id: user.id, connected_creator_id: creator.id })
    }
    onConnectChange?.(creator.id, !isConnected)
    setBusy(false)
  }

  // Open (or create) the 1:1 conversation, then jump into it.
  async function message(e) {
    e.preventDefault()
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(
        `and(participant_a.eq.${user.id},participant_b.eq.${creator.id}),and(participant_a.eq.${creator.id},participant_b.eq.${user.id})`
      )
      .maybeSingle()
    if (existing) return navigate(`/messages/${existing.id}`)
    const { data: created } = await supabase
      .from('conversations')
      .insert({ participant_a: user.id, participant_b: creator.id })
      .select('id')
      .single()
    if (created) navigate(`/messages/${created.id}`)
  }

  return (
    <Link
      to={`/profile/${creator.id}`}
      className="card group flex flex-col gap-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift"
    >
      <div className="flex items-start justify-between">
        <Avatar src={creator.photo_url} name={creator.name} size="lg" />
        {creator.is_admin && <Badge tone="light">Tryp team</Badge>}
      </div>

      <div>
        <h3 className="text-lg font-semibold group-hover:text-brand">{creator.name}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-smoke">{creator.bio || 'New to the program ✈️'}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-smoke">
        <PlatformBadges platforms={platformsForProfile(creator)} />
        <span>🌍 {creator.countries_visited?.length || 0} countries</span>
        {creator.languages?.length > 0 && <span>🗣 {creator.languages.slice(0, 3).join(', ')}</span>}
      </div>

      {!isMe && (
        <div className="mt-auto flex gap-2 border-t border-gray-100 pt-4">
          <button onClick={toggleConnect} disabled={busy} className={isConnected ? 'btn-secondary flex-1 !py-2 text-xs' : 'btn-primary flex-1 !py-2 text-xs'}>
            {isConnected ? '✓ Connected' : 'Connect'}
          </button>
          <button onClick={message} className="btn-secondary flex-1 !py-2 text-xs">
            Message
          </button>
        </div>
      )}
    </Link>
  )
}
