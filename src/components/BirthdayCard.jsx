import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Avatar } from './ui'

// An inline birthday card: posted automatically into #general on a creator's
// birthday. Shows their photo and invites everyone to wish them well.
export default function BirthdayCard({ creatorId }) {
  const [creator, setCreator] = useState(null)

  useEffect(() => {
    supabase.from('profiles').select('id, name, photo_url').eq('id', creatorId).single()
      .then(({ data }) => setCreator(data))
  }, [creatorId])

  if (!creator) return null
  const first = creator.name?.split(' ')[0] || creator.name

  return (
    <div className="mt-1 w-72 max-w-full overflow-hidden rounded-2xl border border-brand/20 bg-white shadow-card sm:w-80">
      <div className="relative bg-gradient-to-br from-brand to-brand-light px-4 py-5 text-center text-white">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/80">🎉 It's a birthday!</p>
        <div className="my-3 flex justify-center">
          <div className="rounded-full bg-white/30 p-1">
            <Avatar src={creator.photo_url} name={creator.name} size="lg" />
          </div>
        </div>
        <p className="text-lg font-extrabold leading-tight">Happy birthday, {first}! 🎂</p>
      </div>
      <div className="p-4 text-center">
        <p className="text-sm text-smoke">
          It's <Link to={`/profile/${creator.id}`} className="font-semibold text-brand hover:underline">{creator.name}</Link>'s
          birthday today. Drop a message below and help us wish them a brilliant one!
        </p>
      </div>
    </div>
  )
}
