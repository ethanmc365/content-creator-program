import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Icon from '../Icon'
import { Skeleton } from '../ui'
import AircraftPhoto from './AircraftPhoto'
import { airport } from '../../lib/airports'
import { AIRCRAFT } from '../../lib/airlines'
import { cx } from '../../lib/utils'

// THE FLIGHT LOG, ON THE PAGE PEOPLE ACTUALLY SHOW EACH OTHER.
//
// The owner: "I want to integrate the flight log page better with the my
// profile page... I think the flight log should show, so each creator has their
// own map on their own profile."
//
// The profile already has a map - the countries-visited one from onboarding -
// and the right answer is NOT a second map underneath it. Two world maps on one
// page is a page that cannot decide what it is about, and the second one would
// be emptier than the first for everybody who has logged three flights.
//
// So this is the RECORD, not the map: how far, how many, and the aeroplanes -
// the parts of the log that are about a person rather than about geography. The
// countries map stays where it is and this sits above it, because "been to 34
// countries" and "flown 180,000 km" are the same claim from two directions and
// they read best together.
//
// WHAT IS SHOWN OF SOMEBODY ELSE'S LOG, AND WHY IT IS SAFE. Distance, count,
// airports and aircraft types. Never a date, a seat, a note, a photo or a
// flight number - the same line migration 103 drew for the leaderboards, for
// the same reason: those four fields are what turn a travel record into a
// movement history.
//
// AND IT RESPECTS THE OPT-IN. Somebody else's profile shows only flights they
// share with the community. Your own shows everything, because it is yours.
export default function ProfileFlights({ creatorId, isMe, name }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let cancelled = false
    let q = supabase
      .from('flights')
      .select('id, from_iata, to_iata, distance_km, aircraft, flown_on, share_with_community')
      .eq('creator_id', creatorId)
      .limit(1000)
    if (!isMe) q = q.eq('share_with_community', true)
    q.then(({ data }) => { if (!cancelled) setRows(data ?? []) })
    return () => { cancelled = true }
  }, [creatorId, isMe])

  const stat = useMemo(() => {
    if (!rows) return null
    // FLOWN ONLY. An upcoming flight is a plan, and counting it would mean a
    // record that goes down again if somebody cancels. Same rule as the log
    // itself (migration 104: upcoming is `flown_on > current_date`).
    const today = new Date().toISOString().slice(0, 10)
    const flown = rows.filter((f) => f.flown_on <= today)
    const km = flown.reduce((s, f) => s + (Number(f.distance_km) || 0), 0)
    const ports = new Set()
    const countries = new Set()
    for (const f of flown) {
      for (const code of [f.from_iata, f.to_iata]) {
        if (!code) continue
        ports.add(code)
        const a = airport(code)
        if (a?.country) countries.add(a.country)
      }
    }
    const types = new Map()
    for (const f of flown) {
      if (!f.aircraft) continue
      const key = Object.keys(AIRCRAFT).find(
        (k) => AIRCRAFT[k].name.toLowerCase() === f.aircraft.toLowerCase(),
      )
      const id = key || f.aircraft
      types.set(id, (types.get(id) || 0) + 1)
    }
    const top = [...types.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([key, n]) => ({ key: AIRCRAFT[key] ? key : null, name: AIRCRAFT[key]?.name || key, type: AIRCRAFT[key], n }))
    return { km, flights: flown.length, ports: ports.size, countries: countries.size, top }
  }, [rows])

  if (rows === null) return <Skeleton className="h-40 w-full" />
  // NOTHING TO SAY IS SAID BY SAYING NOTHING, on somebody else's page. On your
  // own it is an invitation, because you are the one who can fix it.
  if (!stat || stat.flights === 0) {
    if (!isMe) return null
    return (
      <div className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center">
        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-tint text-brand">
          <Icon name="plane-tryp" className="h-5 w-5" />
        </span>
        <p className="text-sm font-semibold text-ink">Your flight log is empty</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-smoke">
          Log one flight and this fills in. Scan the boarding pass and it takes a photo.
        </p>
        <Link to="/flights" className="btn-primary mt-4 text-sm">Open the flight log</Link>
      </div>
    )
  }

  const first = name?.split(' ')[0]
  return (
    <div className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
      <div className="grid grid-cols-2 divide-x divide-gray-50 sm:grid-cols-4">
        {[
          { v: Math.round(stat.km).toLocaleString('en-GB'), unit: 'km', label: 'Flown' },
          { v: stat.flights, label: stat.flights === 1 ? 'Flight' : 'Flights' },
          { v: stat.ports, label: 'Airports' },
          { v: stat.countries, label: 'Countries' },
        ].map((s, i) => (
          <div key={s.label} className={cx('px-4 py-4 text-center', i > 1 && 'border-t border-gray-50 sm:border-t-0')}>
            <p className="text-xl font-bold tabular-nums text-ink sm:text-2xl">
              {s.v}
              {s.unit && <span className="ml-1 text-xs font-semibold text-smoke">{s.unit}</span>}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-smoke">{s.label}</p>
          </div>
        ))}
      </div>

      {/* THE AEROPLANES, AS PICTURES. This is the half of the flight log that is
          worth showing somebody else - a row of numbers is a record, and four
          aircraft you have been on is a conversation. */}
      {stat.top.length > 0 && (
        <div className="border-t border-gray-50 px-4 py-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-smoke">
            {isMe ? 'What you fly' : `What ${first} flies`}
          </p>
          <div className="flex flex-wrap gap-2.5">
            {stat.top.map((t) => (
              <span key={t.name} className="w-[calc(50%-0.3125rem)] sm:w-[calc(25%-0.47rem)]">
                <span className="block aspect-[16/9] overflow-hidden rounded-xl">
                  <AircraftPhoto typeKey={t.key} type={t.type} />
                </span>
                <span className="mt-1.5 block truncate text-[11px] font-semibold text-ink">{t.name}</span>
                <span className="block text-[10px] text-smoke">{t.n} {t.n === 1 ? 'flight' : 'flights'}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {isMe && (
        <Link
          to="/flights"
          className="flex items-center justify-center gap-1.5 border-t border-gray-50 bg-cloud/40 py-2.5 text-xs font-semibold text-smoke transition-colors hover:text-brand"
        >
          Your whole flight log
          <Icon name="chevronRight" className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  )
}
