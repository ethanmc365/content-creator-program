import Reveal from '../components/network/Reveal'
import { CountUp } from '../components/network/Motion'
import { EARTH_CIRCUMFERENCE_KM, km, miles } from './FlightsParts'
import { humanHours } from '../lib/flightStats'

// Part of Flights.jsx: every value it shows comes in as a prop from the page.
export default function FlightsHero({ laps, moonPct, stats, tr }) {
  return (
    <Reveal from="down">
      <section className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-6 text-white shadow-lift sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/70">{tr("Distance flown")}</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-3 text-4xl font-bold tabular-nums sm:text-6xl">
            <CountUp value={Math.round(stats.distance)} format={(n) => Math.round(n).toLocaleString('en-GB')} />
            <span className="text-lg font-semibold text-white/75 sm:text-2xl">km</span>
            <span className="text-sm font-medium text-white/60">{miles(stats.distance)} miles</span>
          </p>

          {/* THE LAP BAR. "1.83 times around the world" is a number you
              have to picture; a bar that has gone round once and is most
              of the way round again is the picture. */}
          <div className="mt-5 max-w-xl">
            <div className="flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-widest text-white/70">
              <span>{laps < 1 ? 'Around the world' : `Lap ${Math.floor(laps) + 1}`}</span>
              <span className="tabular-nums">{laps.toFixed(2)}×</span>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/20">
              {laps > 0 && (
                <div
                  className="h-full rounded-full bg-white transition-[width] duration-1000 ease-out"
                  style={{ width: `${Math.max(2, (laps % 1 || 1) * 100)}%` }}
                />
              )}
            </div>
            {/* THE EARTH FIRST, AND THE MOON ONLY ONCE YOU HAVE EARNED IT. It said "One lap is 40,075 km. You are 5% of
                the way to the moon" from the very first flight - which is both the wrong denominator to lead with and a
                genuinely discouraging one: five percent of anything reads as barely started, and the thing it is five
                percent of is a distance nobody is going to fly. So under one lap the sentence is about the lap you are
                on. Past one lap it says how many laps that is, and only then does the moon appear - by which point the
                number attached to it is worth reading. */}
            <p className="mt-1.5 text-[11px] text-white/60">
              {laps < 1 ? (
                <>One lap is {km(EARTH_CIRCUMFERENCE_KM)} km. You are {(laps * 100).toFixed(laps < 0.1 ? 1 : 0)}% of the way around the world.</>
              ) : (
                <>
                  That is {laps < 2 ? 'a full lap' : `${Math.floor(laps)} laps`} of the world
                  {laps >= 2 ? ` and ${((laps % 1) * 100).toFixed(0)}% of the next` : ''}.
                  {' '}You are {moonPct < 1 ? moonPct.toFixed(2) : moonPct.toFixed(1)}% of the way to the moon.
                </>
              )}
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-4 border-t border-white/20 pt-4">
            {[
              { n: stats.flights, label: 'Flights' },
              { n: null, v: humanHours(stats.minutes), label: 'In the air' },
              { n: stats.countries, label: 'Countries' },
              { n: stats.airports, label: 'Airports' },
              // TIME ZONES CROSSED, LIFETIME. Not distinct zones visited,
              // which is a much smaller and much duller number: this is
              // how many hours of clock change you have flown through,
              // added up, which is the part that actually costs you
              // something. See lib/flightStats.
              { n: stats.zonesCrossed, label: 'Time zones', suffix: 'h' },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-xl font-bold tabular-nums sm:text-2xl">
                  {s.v ?? <><CountUp value={s.n} />{s.suffix || ''}</>}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">{s.label}</p>
              </div>
            ))}
          </div>
          {/* "Time in the air is worked out from the distance flown" is gone. It explained a method nobody asked about,
              under a row of numbers that are not in dispute. The clock-change caveat stays, because that one is a
              coverage gap rather than a method note: it says the figure above is computed over FEWER flights than the
              count beside it, which is a thing you would otherwise have to catch yourself. */}
          {stats.zoneFlights < stats.flights && (
            <p className="mt-3 text-[11px] text-white/55">
              Clock changes are counted on the {stats.zoneFlights} of {stats.flights} flights where both ends name a single time zone.
            </p>
          )}
        </div>
      </section>
    </Reveal>
  )
}
