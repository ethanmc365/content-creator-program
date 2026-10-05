// DEV-ONLY: the poll card, its "Seen by" list and the introduction message, at the widths they are drawn at in a room.
// Open /__preview?bench=poll&poll=<poll id>. Mounted under import.meta.env.DEV only (see Preview.jsx).
import PollCard from '../../components/PollCard'
import SeenBy from '../../components/SeenBy'
import IntroCard from '../../components/network/IntroCard'
import { useAuth } from '../../context/AuthContext'

const INTRO = {
  v: 1, first: 'Marta', city: 'Madrid', country: 'Spain', iso: 'ES',
  about: 'Hola! I am Marta. I film city breaks for people who only have a long weekend, and I have never met a hotel breakfast I did not film.\nHere to learn from you all.',
  makes: ['City guides', 'Food', 'Hidden gems'], wants: ['Collabs', 'Travel buddies'],
  next: { text: 'Lisbon in March', iso: 'PT' }, since: '1 to 3 years', platform: 'TikTok',
  ask: 'Cheap flights out of Madrid', hack: 'Fly on a Tuesday', fact: 'I have been to 31 countries and lost a suitcase in 6 of them',
  visited: ['FR', 'IT', 'PT', 'DE', 'GR', 'TR', 'MA', 'JP', 'TH', 'MX', 'US', 'BR', 'AR', 'PE', 'CO', 'IE'].map((iso) => ({ name: iso, iso })),
  dreams: ['NZ', 'IS', 'CA'].map((iso) => ({ name: iso, iso })),
  socials: { instagram: 'marta', tiktok: 'marta' }, stats: { countries: 16, flights: 12, videos: 5 },
}

export default function PollIntroBench({ pollId }) {
  const { user } = useAuth()
  const readers = []
  return (
    <div style={{ padding: 24, background: '#fff', display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ width: 360 }}>
        <p style={{ font: '700 12px ui-monospace', marginBottom: 8 }}>PollCard (360px)</p>
        {pollId ? <PollCard pollId={pollId} /> : <p>add &poll=ID</p>}
        <p style={{ font: '700 12px ui-monospace', margin: '24px 0 8px' }}>SeenBy for a poll</p>
        <SeenBy readers={readers} pollId={pollId} />
      </div>
      <div style={{ width: 380 }}>
        <p style={{ font: '700 12px ui-monospace', marginBottom: 8 }}>IntroCard from someone else</p>
        <IntroCard intro={INTRO} sender={{ id: 'someone', name: 'Marta Lara', photo_url: null }} myId={user?.id} relation={null} />
        <p style={{ font: '700 12px ui-monospace', margin: '24px 0 8px' }}>IntroCard of mine</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <IntroCard intro={INTRO} sender={{ id: user?.id, name: 'Me Myself', photo_url: null }} myId={user?.id} relation={null} />
        </div>
      </div>
    </div>
  )
}
