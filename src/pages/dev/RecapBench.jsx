import { buildCards, ShareCard } from '../../components/wrapped/story'
import { Card } from '../../components/wrapped/cards'
import { YearInReviewLocked } from '../../components/wrapped/YearInReview'

// EVERY RECAP CARD AT BOTH EXTREMES, SIDE BY SIDE.
//
// The lab reads the real community, and the real community has nobody with
// more than one milestone, nobody with forty countries and nobody with a
// thirty-character name - so the cases most likely to break a fixed 9:16 card
// could not be looked at. Two fixture creators, one who did everything and
// one who joined last week, drawn with the real components. Dev only.

const ISO = ['ES', 'PT', 'FR', 'IT', 'DE', 'NL', 'BE', 'GB', 'IE', 'IS', 'NO', 'SE', 'FI', 'DK', 'PL', 'CZ', 'AT', 'CH', 'HR', 'GR',
  'TR', 'EG', 'MA', 'ZA', 'NA', 'BW', 'ZW', 'KE', 'TZ', 'AE', 'QA', 'IN', 'TH', 'VN', 'ID', 'JP', 'AU', 'NZ', 'US', 'MX']

const base = {
  year: 2026,
  ranks: {
    distance: { top: true, percentile: 3 }, videos: { top: true, percentile: 5 }, views: { top: true, percentile: 2 },
    bestVideo: { top: true, percentile: 4 }, messages: { top: true, percentile: 10 }, games: { top: true, percentile: 12 },
  },
  everyone: { creators: 116, markets: 6, views: 19731603, videos: 2650, flights: 26, countries: 10, prize: 9135, currency: 'EUR' },
}

export const HEAVY = {
  ...base,
  me: { name: 'Maximiliana Fernández-Oliveira', photo: '/brand/tryp-plane.png', market: 'Spain', country: 'Spain', joinedThisYear: false },
  travel: {
    has: true, flights: 64, distance: 184320, timesRoundEarth: 4.6, hours: 231, airports: 48,
    countries: 40, countryList: ISO, longest: { from: { city: 'Madrid' }, to: { city: 'Auckland' }, dist: 19660 },
    aircraftTypes: 9, fleet: [{ name: 'A320', flights: 22 }, { name: 'B737', flights: 14 }, { name: 'A350', flights: 6 }],
    topAirline: { name: 'Iberia', flights: 19 },
    collabTrips: 11,
    collabPlaces: [
      { city: 'Gaborone', iso: 'BW' }, { city: 'Victoria Falls', iso: 'ZW' }, { city: 'Istanbul', iso: 'TR' }, { city: 'Windhoek', iso: 'NA' },
      { city: 'Cape Town', iso: 'ZA' }, { city: 'Reykjavik', iso: 'IS' }, { city: 'Kyoto', iso: 'JP' }, { city: 'Hanoi', iso: 'VN' },
      { city: 'Lisbon', iso: 'PT' }, { city: 'Dubai', iso: 'AE' }, { city: 'Nairobi', iso: 'KE' },
    ],
  },
  content: {
    has: true, videos: 96, challenges: 11, platforms: ['TikTok', 'Instagram', 'YouTube'], views: 4812337,
    best: { views: 1204993, thumbnail: '/brand/tryp-plane.png', challenge: 'Desafio Voo + Hotel na Tryp.com' },
    wins: 3, podiums: 7, cash: 1450.5, vouchers: 320, currency: 'EUR',
  },
  community: {
    has: true, messages: 4210, roomMessages: 3100, dms: 1110, connections: 57, reactions: 812, markets: ['Spain', 'Worldwide'],
    milestones: [
      { title: 'Getting Started', icon: 'flag', reward: 'You are officially a Tryp.com Creator, welcome to the team!', reached_at: '2026-02-03' },
      { title: 'Building Momentum', icon: 'chart', reward: '€10 Tryp.com voucher', reached_at: '2026-04-19' },
      { title: 'On a Roll', icon: 'star', reward: '€30 Tryp.com voucher', reached_at: '2026-07-02' },
      { title: 'Senior Creator', icon: 'trophy', reward: 'Tryp.com Senior Creator', reached_at: '2026-09-11' },
    ],
    nextMilestone: { title: 'Tryp.com Ambassador', icon: 'globe', reward: 'A paid trip with the team' },
  },
  games: { has: true, played: 1204, days: 260, bestStreak: 188, modes: [{ mode: 'pinpoint', n: 600 }, { mode: 'zip', n: 604 }], favourite: { mode: 'zip' } },
  busiest: { name: 'September' },
}

export const QUIET = {
  ...base,
  ranks: {},
  me: { name: 'Jo', photo: null, market: 'Romania', joinedThisYear: true },
  travel: { has: false, flights: 0, distance: 0, countries: 0, collabTrips: 0, countryList: [] },
  content: { has: false, videos: 0, views: 0, platforms: [] },
  community: { has: false, messages: 0, milestones: [], nextMilestone: { title: 'Getting Started', icon: 'flag', reward: null } },
  games: { has: false, played: 0 },
  busiest: null,
}

function Run({ data, label }) {
  const cards = buildCards(data)
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{label} <span className="font-normal text-smoke">{cards.length + 1} cards</span></p>
      <div className="flex gap-3 overflow-x-auto pb-3">
        {cards.map((c) => (
          <div key={c.key} className="w-[300px] shrink-0">
            <p className="mb-1 text-[11px] text-smoke">{c.key}</p>
            <Card palette={c.palette} className="aspect-[9/16] w-full">{c.render()}</Card>
          </div>
        ))}
        <div className="w-[300px] shrink-0">
          <p className="mb-1 text-[11px] text-smoke">share</p>
          <ShareCard data={data} className="aspect-[9/16] w-full" />
        </div>
      </div>
    </div>
  )
}

export default function RecapBench() {
  return (
    <section className="space-y-6" id="recap">
      <h2 className="text-lg font-semibold">Year in Review, at both extremes</h2>
      <Run data={HEAVY} label="Did everything (40 countries, 4 milestones, long name)" />
      <Run data={QUIET} label="Joined last week" />
      <div className="w-[300px]"><YearInReviewLocked year={2026} opensOn="1 December" /></div>
    </section>
  )
}
