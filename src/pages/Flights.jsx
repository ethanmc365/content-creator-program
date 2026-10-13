import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ActionRow, Avatar, EmptyState, Modal, PageHeader, Skeleton } from '../components/ui'
import Icon from '../components/Icon'
import Reveal from '../components/network/Reveal'
import ScanBoardingPass from '../components/network/ScanBoardingPass'
import WhenVisible from '../components/WhenVisible'
import FlightMap from '../components/network/FlightMap'
import MapSkeleton from '../components/network/MapSkeleton'
import PhotoLightbox from '../components/PhotoLightbox'
import { confirm, notice } from '../lib/confirm'
import { toast } from '../lib/toast'
import { airport, distanceKm, homeAirport } from '../lib/airports'
import { routeAirlines, aircraftFor, anyAircraftFor, airlineByName, AIRCRAFT } from '../lib/airlines'
import { tripsFromFlights, buildFlightStats, humanHours } from '../lib/flightStats'
import { compressImage } from '../lib/image'
import { uploadFile } from '../lib/upload'
import { cx, formatDate } from '../lib/utils'
import { useT } from '../lib/i18n'
import { flightsApi } from '../api/flights'
import { EARTH_CIRCUMFERENCE_KM, MOON_KM, BLANK_FORM, km, ymd, monthLabel, routeFacts, RecordCard, LoyaltyRow } from './FlightsParts'
import { YearColumn } from './FlightsYearColumn'
import { PurposeBar } from './FlightsPurposeBar'
import FlightsDetailModal from './FlightsDetailModal'
import FlightsLogForm from './FlightsLogForm'
import FlightsLog from './FlightsLog'
import FlightsHero from './FlightsHero'

export default function Flights() {
  const tr = useT()
  const { user, profile } = useAuth()
  const [rows, setRows] = useState(null)
  const [adding, setAdding] = useState(false)
  // THE SAME FORM OPENS THREE WAYS, and which one it is decides three things:
  // the title, whether the date may be in the future, and whether saving is an
  // insert or an update.
  //
  //   editing === null && !upcoming   a flight you have taken
  //   editing === null && upcoming    a flight you are going to take
  //   editing === <row>               a flight already in the log
  //
  // One form and not three, for the reason the board's ask/edit dialog is one
  // form: the fields are the same fields and the validation is the same
  // validation, so writing it twice only guarantees that the two drift.
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [showAllAirlines, setShowAllAirlines] = useState(false)
  const [scanning, setScanning] = useState(false)
  // WHO ELSE IS ON YOUR UPCOMING FLIGHTS. Keyed by flight id. See the
  // `same_flight` definer function: same route AND same day, both sides
  // sharing.
  const [sameFlight, setSameFlight] = useState({})
  const [form, setForm] = useState(BLANK_FORM)

  const [allAirlines, setAllAirlines] = useState(false)
  const [customAirline, setCustomAirline] = useState(false)
  const [customPlane, setCustomPlane] = useState(false)
  const [uploading, setUploading] = useState(false)
  // `today` in state, not computed in render: this repo's eslint bans clock
  // reads during render and it is right to.
  const [today] = useState(() => ymd(new Date()))
  // UPCOMING IS A FACT ABOUT THE DATE, NOT A MODE.
  //
  // This was a `useState` set by a pair of radio cards at the top of the form.
  // Two sources of truth for one fact, and the row itself only ever had one:
  // there is no `is_upcoming` column and there must not be one, because a
  // boolean would be wrong the morning after the flight (migration 104).
  // Deriving it means the form cannot disagree with the row it is about to
  // write, and it updates live as the date is typed - so the labels and the
  // save button change under your hands the moment you enter a future date.
  const upcoming = !!form.flown_on && form.flown_on > today

  // IS THIS TRIP STILL AHEAD? The one definition, read by every surface that offers to put a flight on the collab board.
  // `>= today` and not `>` on purpose: a flight you are taking TODAY is exactly the one somebody might still meet you
  // off, and the team's rule is "current or future trips".
  const tripIsUpcoming = useCallback((f) => !!f?.flown_on && f.flown_on >= today, [today])
  // The year-on-year panel, off until asked for. See YearColumn.
  const [compare, setCompare] = useState(false)
  // What to offer after a flight is saved: the collab board post.
  const [offer, setOffer] = useState(null)

  const load = useCallback(async () => {
    const { data } = await flightsApi
      .flights()
      .select('*')
      .eq('creator_id', user.id)
      .order('flown_on', { ascending: false })
      .limit(1000)
    setRows(data ?? [])
  }, [user.id])

  useEffect(() => { load() }, [load])

  const stats = useMemo(() => buildFlightStats(rows, today), [rows, today])
  // Their home airport, for the form's default. Derived from the log first and
  // from their town second - see lib/airports.
  const homeIata = useMemo(
    () => homeAirport(rows || [], { lat: profile?.city_lat, lng: profile?.city_lng }),
    [rows, profile?.city_lat, profile?.city_lng],
  )

  // Only for flights not yet taken: "somebody was on your flight last March" is
  // a fact, and "somebody is on your flight on Tuesday" is a plan.
  useEffect(() => {
    const upcoming = stats.upcoming || []
    if (!upcoming.length) return undefined
    let cancelled = false
    ;(async () => {
      const out = {}
      for (const f of upcoming.slice(0, 8)) {
        const { data } = await flightsApi.sameFlight({
          p_from: f.from.iata, p_to: f.to.iata, p_on: f.flown_on,
        })
        if (cancelled) return
        if (data?.length) out[f.id] = data
      }
      if (!cancelled) setSameFlight(out)
    })()
    return () => { cancelled = true }
  }, [stats.upcoming])

  const thisYear = today.slice(0, 4)
  const lastYear = String(Number(thisYear) - 1)
  const yearRow = (y) => stats.years.find((x) => x.year === y) || null

  // WHO ELSE FLIES YOUR ROUTES AND THE COMMUNITY LEADERBOARDS ARE NOT READ
  // HERE ANY MORE. They were four RPCs (one per busy route, plus the board)
  // fired from a page that had already run three queries of its own, for two
  // sections at the very bottom that most people never scrolled to. They live
  // on /flights/community now and are loaded by the page that shows them.

  // ---- the form ------------------------------------------------------------
  // THE LEG HOME THIS ROW ALREADY HAS, if it has one. `openEdit` is only ever
  // handed the OUTBOUND leg (the trip row, the upcoming card and the detail
  // sheet all pass `t.out`), so a partner here is always the return.
  const returnLeg = useMemo(
    () => (editing ? (rows || []).find((x) => x.return_of === editing.id) || null : null),
    [editing, rows],
  )

  // CAN THIS FORM TALK ABOUT A SECOND LEG?
  //
  // Adding a flight: always. Editing one: yes, UNLESS the row being edited is
  // itself the leg home (`return_of` set), which would make a trip of three
  // legs - `tripsFromFlights` pairs one return to one outbound.
  //
  // IT USED TO SAY NO TO A TRIP THAT ALREADY HAD ITS RETURN, and that was the bug. Hiding the whole section was hiding a
  // FACT about the trip, not just an unavailable action: the form silently redescribed a round trip as a one-way, and
  // saving it back would have been the creator agreeing to something they were never shown. The box is ticked and the
  // return's date is filled in now, and the save writes THROUGH to the existing row - see `save`.
  const canRoundTrip = !editing || !editing.return_of
  const fromA = airport(form.from_iata)
  const toA = airport(form.to_iata)
  const previewKm = fromA && toA ? distanceKm(fromA, toA) : 0
  const facts = useMemo(() => routeFacts(fromA, toA, form.flown_on), [fromA, toA, form.flown_on])

  // WHO FLIES IT. Derived from where airlines are based and what their fleets
  // can reach - see lib/airlines for why that is a table and not an API call.
  const carriers = useMemo(
    () => (previewKm ? routeAirlines(fromA, toA, previewKm) : []),
    [fromA, toA, previewKm],
  )
  const shownCarriers = allAirlines ? carriers : carriers.slice(0, 8)
  const picked = airlineByName(form.airline)

  // AND WHAT THEY WOULD SEND. An airline's own fleet, filtered to what can
  // reach, smallest first - which is how airlines actually assign aircraft.
  const planes = useMemo(
    () => (previewKm ? (picked ? aircraftFor(picked, previewKm) : anyAircraftFor(previewKm)) : []),
    [picked, previewKm],
  )
  const pickedPlane = useMemo(() => {
    const name = form.aircraft.trim().toLowerCase()
    if (!name) return null
    const hit = Object.entries(AIRCRAFT).find(([, a]) => a.name.toLowerCase() === name)
    return hit ? { key: hit[0], ...hit[1] } : null
  }, [form.aircraft])

  // THE THREE WAYS IN. Each one seeds the form and says which mode it is, so
  // nothing downstream has to guess - and every one of them resets the two
  // airline-picker flags, which used to survive from the previous open and left
  // somebody editing a flight staring at a text box they had not asked for.
  function openNew() {
    // PREFILLED WITH WHERE YOU FLY FROM. See `homeAirport`: an empty "from"
    // field meant a Dublin creator typed DUB before every flight they have ever
    // logged. It is a default, not a lock - the field is a type-ahead and
    // clearing it is one gesture.
    setForm({ ...BLANK_FORM, from_iata: homeIata })
    setEditing(null)
    setError('')
    setCustomAirline(false)
    setCustomPlane(false)
    setAllAirlines(false)
    setAdding(true)
  }

  function openUpcoming() {
    setForm(BLANK_FORM)
    setEditing(null)
    setError('')
    setCustomAirline(false)
    setCustomPlane(false)
    setAllAirlines(false)
    setAdding(true)
  }

  // `/flights?log=upcoming` OPENS THE FORM ON THE FLIGHT YOU HAVE NOT TAKEN.
  //
  // This is what the collab board's "Post a trip" button now does: a trip you
  // are going on is a flight you are going to take, and the two were separate
  // things to type in two places. The flight log is the one that knows the
  // airports, the distance and the dates, and it already offers to post to the
  // board when you save - so the board sends you here and the loop closes.
  //
  // CONSUMED ONCE. A deep-link effect that keeps firing reopens the dialog
  // every time the page re-renders, and reopens it on a reload after you have
  // saved - the trap the challenge page's `?submit=1` hit first.
  const [params, setParams] = useSearchParams()
  const deepLinkedRef = useRef(false)
  useEffect(() => {
    if (deepLinkedRef.current) return
    const want = params.get('log')
    if (want !== 'upcoming' && want !== 'new') return
    deepLinkedRef.current = true
    if (want === 'upcoming') openUpcoming(); else openNew()
    const next = new URLSearchParams(params)
    next.delete('log')
    setParams(next, { replace: true })
    // openUpcoming is stable enough for this: it only ever calls setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  // EDITING A FLIGHT YOU HAVE ALREADY LOGGED.
  //
  // Until now the only way to fix a typo in a date was to delete the row and type the whole thing again - which is
  // exactly the trade the community board was given an edit dialog to avoid.
  //
  // A ROUND TRIP IS EDITED AS A PAIR, FROM THE OUTBOUND.
  //
  // The return is still its OWN row with its own date and its own distance -
  // that is what makes the map, the totals and the year figures right - but it
  // is no longer a row you have to go and find. The tick box arrives ticked
  // with the return's date beside it, and `save` writes through to the row
  // that already exists rather than adding a third leg. Unticking removes the
  // leg home, after asking.
  //
  // The airports are the OUTBOUND'S, so a direction change rewrites this row
  // and the return follows it; the return can never be left pointing at a
  // pair of codes the outbound no longer has.
  function openEdit(f) {
    const back = (rows || []).find((x) => x.return_of === f.id) || null
    setForm({
      from_iata: f.from_iata || '',
      to_iata: f.to_iata || '',
      flown_on: f.flown_on || '',
      airline: f.airline || '',
      flight_number: f.flight_number || '',
      aircraft: f.aircraft || '',
      note: f.note || '',
      seat: f.seat || '',
      purpose: f.purpose || '',
      purpose_note: f.purpose_note || '',
      // TICKED WHEN THE TRIP ALREADY HAS ITS LEG HOME. An untickable box
      // reading "Round trip" over a trip that is one is the report this fixes.
      round_trip: !!back,
      return_on: back?.flown_on || '',
      // The row being edited is always leg one, by construction: nothing hands
      // `openEdit` a return.
      first_leg: 'out',
      photo_url: f.photo_url || '',
    })
    setEditing(f)
    setError('')
    // An airline that is not in the fleet table can only have been typed, so
    // the picker opens on the text box rather than losing what is there.
    setCustomAirline(!!f.airline && !airlineByName(f.airline))
    // Same rule for the aircraft: a type that is not in the book can only have
    // been typed, so the picker opens on the text box rather than losing it.
    setCustomPlane(!!f.aircraft && !Object.values(AIRCRAFT).some((a) => a.name.toLowerCase() === f.aircraft.toLowerCase()))
    setAllAirlines(false)
    setAdding(true)
  }

  function closeForm() {
    setAdding(false)
    setEditing(null)
    setError('')
  }

  async function pickPhoto(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      // Same `gallery` bucket as the travel photos, and this was the call still writing JPEG into it. WebP is the
      // default now.
      const compressed = await compressImage(file, { maxDim: 1400, quality: 0.8 })
      const path = `${user.id}/flights/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
      const url = await uploadFile('gallery', path, compressed, compressed.type || 'image/jpeg')
      setForm((f) => ({ ...f, photo_url: url }))
    } catch (err) {
      await notice(err.message || 'That image would not upload.')
    }
    setUploading(false)
  }

  async function save(e) {
    e.preventDefault()
    setError('')
    if (!form.from_iata || !form.to_iata) { setError('Pick where you flew from and to.'); return }
    if (form.from_iata === form.to_iata) { setError('Those are the same airport.'); return }
    if (!form.flown_on) { setError(upcoming ? 'Add the date you fly.' : 'Add the date you flew.'); return }
    // WHICH DIRECTION THE DATE IS ALLOWED TO POINT IS THE MODE, and it is the
    // only thing the mode changes about validation. A logged flight in the
    // future is somebody who has picked the wrong year; an upcoming flight in
    // the past is a flight they have already taken and should simply log.
    // No date check on direction any more: a future date simply makes this an
    // upcoming flight, which is the whole point of removing the toggle.
    // No direction check at all now. A past date is a flown flight and a future
    // date is an upcoming one, and both are valid things to be saving.
    // EVERYTHING NOT MARKED "(optional)" IS NOW ACTUALLY REQUIRED.
    //
    // It was possible to save a flight with no airline and no note, because the labels were the only thing saying they
    // were needed and `save` never checked.
    //
    // So the rule is now literal and there is exactly one list: a field whose
    // label carries "(optional)" may be blank, and one whose label does not may
    // not. Optional today: aircraft, flight number, seat, what-for, the photo.
    // Required: both airports, the date, the airline, the note - and the return
    // date once round trip is ticked.
    //
    // The message names the field rather than saying "fill in the form", so
    // somebody who has scrolled past the airline picker knows which control to
    // go back to.
    if (!form.airline.trim()) { setError('Pick the airline you flew with, or tap Other to type it in.'); return }
    if (!form.note.trim()) { setError('Add a note about this trip. It is the bit that makes the flight worth reading back.'); return }
    const roundTrip = canRoundTrip && form.round_trip
    if (roundTrip) {
      if (!form.return_on) { setError('Add the date you fly back, or untick round trip.'); return }
      // A return date in the future is fine even on a flight already taken:
      // that is exactly the shape of "I flew out last week, I fly back on
      // Friday", which the old check rejected.
      if (form.return_on < form.flown_on) { setError('The return is before the outbound. Check the dates.'); return }
    }

    // UNTICKING ROUND TRIP ON A TRIP THAT HAS ONE DELETES A FLIGHT. Asked here
    // rather than in the checkbox handler so the question is about the save
    // that is happening, and so changing your mind is just ticking it again.
    if (!roundTrip && returnLeg) {
      const ok = await confirm(
        `Remove the flight home (${returnLeg.from_iata} to ${returnLeg.to_iata} on ${formatDate(returnLeg.flown_on)}) from your log?`,
      )
      if (!ok) return
    }

    // WHICH PAIR OF CODES GOES ON WHICH LEG. One rule, applied identically to a
    // new trip and to a one-way row growing its leg home: `flown_on` is the
    // FIRST leg's date, `return_on` the second's, and `first_leg` says whether
    // the first leg is the way the airports were typed or the other way round.
    // See the direction picker for why the form has to ask.
    const flipped = roundTrip && form.first_leg === 'back'
    const legOne = flipped
      ? { from_iata: form.to_iata, to_iata: form.from_iata }
      : { from_iata: form.from_iata, to_iata: form.to_iata }
    const legTwo = { from_iata: legOne.to_iata, to_iata: legOne.from_iata }

    setSaving(true)

    // Everything both legs share. The return is the SAME flight backwards -
    // same airline, same aircraft, same distance - so it inherits all of it and
    // only the ends, the date and the seat differ. A seat number is per
    // boarding pass and guessing it would be inventing data.
    const common = {
      creator_id: user.id,
      airline: form.airline.trim() || null,
      flight_number: form.flight_number.trim().toUpperCase() || null,
      aircraft: form.aircraft.trim() || null,
      // Stored so a future leaderboard or market total is a `sum()` rather than
      // a full download. See migration 098.
      distance_km: Math.round(previewKm * 100) / 100,
      purpose: form.purpose || null,
      // Only ever written beside `other`. Picking a real reason and then
      // changing your mind would otherwise leave the old free text attached to
      // "Holiday", which is a row that contradicts itself.
      purpose_note: form.purpose === 'other' ? (form.purpose_note.trim() || null) : null,
      // Always true. See BLANK_FORM for what this does and does not expose.
      share_with_community: true,
    }

    // ---- EDITING AN EXISTING ROW -------------------------------------------
    //
    // The row being edited is always leg ONE, so a direction change here
    // rewrites its own airports rather than inventing a third row: see the
    // direction picker. No offer to post to the collab board either, because
    // correcting a typo is not news.
    //
    // THE LEG HOME IS ONE OF THREE ANSWERS, and all three have to be written:
    // added (the box has just been ticked), updated (it was already there and
    // the trip's airline, aircraft, dates or direction have moved under it),
    // or REMOVED. The old code could only do the first, which is why editing a
    // round trip used to be a way of quietly turning it into a one-way.
    if (editing) {
      const { error: upErr } = await flightsApi.flights().update({
        ...common,
        ...legOne,
        flown_on: form.flown_on,
        seat: form.seat.trim() || null,
        note: form.note.trim() || null,
        photo_url: form.photo_url || null,
      }).eq('id', editing.id)
      if (upErr) { setSaving(false); setError('Could not save those changes. Please try again.'); return }

      let legHome = null
      if (roundTrip && returnLeg) {
        // WRITE THROUGH, NEVER DELETE-AND-REINSERT. The return keeps its id,
        // so anything pointing at it keeps pointing at it, and it keeps its
        // own seat and note - the two fields that are per boarding pass and
        // are not the outbound's to overwrite.
        const { error: retErr } = await flightsApi.flights().update({
          ...common,
          ...legTwo,
          flown_on: form.return_on,
        }).eq('id', returnLeg.id)
        if (retErr) {
          setSaving(false)
          setError('The changes are saved but the leg home did not update. Try again.')
          load()
          return
        }
        legHome = 'updated'
      } else if (roundTrip) {
        const { error: retErr } = await flightsApi.flights().insert({
          ...common,
          ...legTwo,
          flown_on: form.return_on,
          return_of: editing.id,
        })
        if (retErr) {
          setSaving(false)
          setError('The changes are saved but the leg home did not go through. Add it on its own.')
          load()
          return
        }
        legHome = 'added'
      } else if (returnLeg) {
        // The box was ticked when the form opened and is not any more. The
        // confirmation for this is asked BEFORE the save starts - see the
        // top of this function - so by here it is a decision already taken.
        const { error: delErr } = await flightsApi.flights().delete().eq('id', returnLeg.id)
        if (delErr) {
          setSaving(false)
          setError('The changes are saved but the leg home could not be removed. Try again.')
          load()
          return
        }
        legHome = 'removed'
      }

      setSaving(false)
      closeForm()
      setForm(BLANK_FORM)
      toast(
        legHome === 'added' ? 'Trip updated, leg home added'
          : legHome === 'removed' ? 'Trip updated, leg home removed'
            : legHome === 'updated' ? 'Trip updated' : 'Flight updated',
      )
      load()
      return
    }

    const { data: out, error: insErr } = await flightsApi.flights().insert({
      ...common,
      ...legOne,
      flown_on: form.flown_on,
      seat: form.seat.trim() || null,
      note: form.note.trim() || null,
      // The photo belongs to the OUTBOUND leg only. One image per trip was the
      // ask, and copying it onto the return would make one photograph appear
      // twice in a log sorted by date.
      photo_url: form.photo_url || null,
    }).select('id').single()

    if (insErr || !out) {
      setSaving(false)
      setError('Could not save that flight. Please try again.')
      return
    }

    // THE RETURN IS A SECOND ROW, saved SECOND on purpose: `return_of` needs the
    // outbound's id, and if this insert fails the outbound is still safely
    // logged. A half-saved round trip that loses the leg you actually took
    // would be worse than one that loses the leg you can re-add in ten seconds,
    // so the error says exactly which one is missing.
    let returnFailed = false
    if (roundTrip) {
      const { error: retErr } = await flightsApi.flights().insert({
        ...common,
        ...legTwo,
        flown_on: form.return_on,
        return_of: out.id,
      })
      returnFailed = !!retErr
    }

    setSaving(false)
    if (returnFailed) {
      setError('The outbound is saved but the return did not go through. Add it on its own.')
      load()
      return
    }

    // THE OFFER TO POST IT ON THE COLLAB BOARD.
    //
    // It is an OFFER and not a side effect, and it appears after the save rather than as a tick inside the form, because
    // the two are different decisions: one is a record you keep and the other is a message to forty other people.
    //
    // AN UPCOMING FLIGHT IS THE CASE THIS WAS ALWAYS REACHING FOR. The rule
    // used to be "the flight is in the last three weeks", which is the best
    // approximation available when the log could only hold flights that had
    // already happened - it caught somebody logging a trip on the way home and
    // nothing else, and a trip you can still be met on is by definition one
    // that has not finished. Now that the log holds flights you have not taken
    // yet, a future one is offered every time and the recency rule only has to
    // cover the trip you have just got back from. Offering to tell forty people
    // about a flight from 2019 is offering to post something nobody can act on.
    const arrived = airport(legOne.to_iata)
    // UPCOMING ONLY. It also offered on any flight taken in the last 21 days, which is a trip that has already happened
    // - so the board filled up with "I am in Seville" from somebody who got home a fortnight ago and nobody could act on
    // any of it.
    const worthPosting = upcoming
    setForm(BLANK_FORM)
    setCustomAirline(false)
    setCustomPlane(false)
    setAllAirlines(false)
    closeForm()
    load()
    if (arrived && worthPosting) {
      setOffer({
        city: arrived.city,
        country: arrived.countryName || arrived.country || '',
        start: form.flown_on,
        end: roundTrip && form.return_on ? form.return_on : ymd(new Date(new Date(`${form.flown_on}T12:00:00Z`).getTime() + 6 * 86400000)),
        note: '',
      })
    }
  }

  // ONE PLACE THAT TURNS A FLIGHT INTO A COLLAB BOARD POST, used by the offer
  // that appears after saving and by the button on an upcoming card. The end
  // date is the return leg's date where there is one and a week later where
  // there is not, because a trip with no end date on a board is a trip nobody
  // can plan around.
  function offerTrip(f) {
    const arrived = airport(f.to_iata)
    if (!arrived) return
    // BELT AND BRACES. The callers already hide the control on a past trip;
    // this is the guard that means a third caller cannot reintroduce the bug.
    if (!tripIsUpcoming(f)) return
    const back = (rows || []).find((x) => x.return_of === f.id)
    setOffer({
      city: arrived.city,
      country: arrived.countryName || arrived.country || '',
      start: f.flown_on,
      end: back?.flown_on || ymd(new Date(new Date(`${f.flown_on}T12:00:00Z`).getTime() + 6 * 86400000)),
      note: '',
    })
  }

  async function postToCollab() {
    if (!offer) return
    if (!offer.note.trim()) return
    const { error: insErr } = await flightsApi.collabPosts().insert({
      creator_id: user.id,
      city: offer.city,
      country: offer.country || null,
      start_date: offer.start,
      end_date: offer.end,
      note: offer.note.trim(),
    })
    if (insErr) { await notice('Could not post that to the collab board.'); return }
    setOffer(null)
    toast('Posted to the collab board')
  }

  async function remove(f) {
    if (!await confirm(`Remove ${f.from.iata} to ${f.to.iata} from your log?`)) return
    setRows((cur) => cur.filter((x) => x.id !== f.id))
    const { error: delErr } = await flightsApi.flights().delete().eq('id', f.id)
    if (delErr) { await notice('Could not remove that flight.'); load() }
  }

  const laps = stats.distance / EARTH_CIRCUMFERENCE_KM
  const moonPct = (stats.distance / MOON_KM) * 100
  // ONE ROW PER TRIP. A return is a second `flights` row pointing at the first,
  // and drawing them both made a week away look like two flights, the second of
  // them photo-less. See `tripsFromFlights`.
  const trips = useMemo(() => tripsFromFlights(stats.list), [stats.list])
  const visible = showAll ? trips : trips.slice(0, 12)
  // The trip whose details are open, if any.
  const [detail, setDetail] = useState(null)
  // The photograph, blown up over everything.
  const [photo, setPhoto] = useState(null)
  const r = stats.records

  return (
    <div className="page">
      {/* NO STRAPLINE. It read "Every flight you have taken, and what it adds
          up to. Add them as you go, or work backwards through your inbox on a
          rainy afternoon", which is a nice sentence explaining a feature to
          somebody opening it for the first time and dead weight on the page
          they open every week. The card underneath says the same thing with a
          number in it. */}
      <PageHeader
        title={tr("Your flight log")}
        action={
          /* THREE BUTTONS, AND A PHONE IS 375px WIDE. `flex flex-wrap` used to
             drop "Log a flight" onto a second line on its own, left-aligned
             under a ragged first row. `ActionRow` gives the primary the whole
             top row and puts the other two side by side under it - see the
             component for the rule, which is now the same on every page that
             carries a row like this. */
          <ActionRow
            lead={
              <button onClick={openNew} className="btn-primary !py-2.5">
                <Icon name="plus" className="h-4 w-4" /> {tr("Log a flight")}
              </button>
            }
          >
            {/* THE COMMUNITY, AS A DOOR AT THE TOP.
                All of this used to be two sections buried at the bottom of this
                page. It is a different question with a different owner - this
                page is your own record, that one is everybody else's - so it is
                its own page now, reached from here. See FlightCommunity. */}
            <Link to="/flights/community" className="btn-secondary !px-4 !py-2.5 text-sm">
              <Icon name="users" className="h-4 w-4" />
              {tr("Across the community")}
            </Link>
            {/* BIGGER, NAMED IN FULL, AND WITH AN ACTUAL AEROPLANE ON IT. `plane` is Heroicons' paper aeroplane, which
                is a SEND glyph - the same one that sits on the button that posts a message. The maps draw a real
                aircraft silhouette, and it is already in the icon set as `plane-tryp`, so the button that opens a
                collection of aircraft now has one on it. */}
            <Link to="/flights/aircraft" className="btn-secondary !px-5 !py-3 text-sm">
              <Icon name="plane-tryp" className="h-4 w-4" />
              {tr("Aircraft collection")}
            </Link>
          </ActionRow>
        }
      />

      {rows === null ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
          </div>
          <Skeleton className="h-72 w-full" />
        </div>
      ) : stats.list.length === 0 ? (
        <EmptyState
          icon={<Icon name="plane" className="h-7 w-7" />}
          title={tr("No flights logged yet")}
          hint={tr("Add your last trip and the map fills in. Distance, hours in the air, airports and countries all count themselves.")}
          action={<button onClick={openNew} className="btn-primary">{tr("Log your first flight")}</button>}
        />
      ) : (
        <div className="space-y-10">
          {/* ---- THE HEADLINE, AS ONE CARD ----
              One card leads, in the brand, with distance as the hero and the lap
              of the earth drawn UNDER it as a bar you fill in. The supporting
              figures ride along its foot; everything else stays in the grids
              further down where a grid is the right shape. */}
          <FlightsHero laps={laps} moonPct={moonPct} stats={stats} tr={tr} />

          {/* ---- COMING UP ----
              THE FLIGHTS THAT HAVE NOT HAPPENED YET, kept visibly apart from
              everything else on the page.

              Every other section here is a fact about what you have done, and
              this one is a plan - so it is above the map (where you would look
              for "what is next") and it is drawn as an outlined card rather
              than a solid one, which is the same language the rest of the app
              uses for something provisional. Nothing in it is counted: not the
              distance, not the map, not the records, not the streak. See
              buildFlightStats, which does the splitting, and migration 104 for
              why there is no `is_upcoming` column to get out of step.

              THE COLLAB BOARD IS THE POINT OF IT. A trip you are going on is
              only worth typing once, and the place everybody else looks for it
              is the board. Logging an upcoming flight offers to post it there
              with the dates already filled in; this card offers it again for
              the ones somebody said "not this time" to. */}
          {stats.upcoming.length > 0 && (
            <Reveal from="down">
              <section>
                {/* JUST THE HEADING. "2 flights booked in" was a count of a list you are looking at, printed beside its
                    own title. `buildFlightStats` already returns them soonest first. */}
                <h2 className="mb-3 text-lg font-semibold">{tr("Coming up")}</h2>
                <Reveal className="grid items-stretch gap-3 sm:grid-cols-2" stagger={0.05}>
                  {stats.upcoming.map((f) => (
                    <div key={f.id} className="flex h-full flex-col rounded-card border border-dashed border-brand/40 bg-brand-tint/15 p-4">
                      <div className="flex items-center gap-3">
                        <span className="flex shrink-0 items-center gap-1.5 text-sm font-bold tracking-wider text-brand">
                          {f.from.iata}
                          <Icon name="plane" className="h-3.5 w-3.5 text-brand-light" />
                          {f.to.iata}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{f.from.city} to {f.to.city}</span>
                          <span className="block truncate text-xs text-smoke">
                            {formatDate(f.flown_on)}
                            {f.airline ? ` · ${f.airline}` : ''}
                          </span>
                        </span>
                      </div>
                      {/* SOMEBODY ELSE IS ON THIS FLIGHT.
                          The strongest signal in the whole log: same route, same
                          day, two creators who will be in one airport within a
                          couple of hours of each other. It goes ABOVE the collab
                          board button because it is the reason to press it. */}
                      {sameFlight[f.id]?.length > 0 && (
                        <Link
                          to={`/profile/${sameFlight[f.id][0].creator_id}`}
                          className="mt-3 flex items-center gap-2.5 rounded-xl bg-white/70 px-3 py-2 transition-colors hover:bg-white"
                        >
                          <span className="flex -space-x-2">
                            {sameFlight[f.id].slice(0, 3).map((c) => (
                              <Avatar key={c.creator_id} src={c.photo_url} name={c.name} size="xs" className="!h-6 !w-6 ring-2 ring-white" />
                            ))}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-brand">
                            {sameFlight[f.id][0].name.split(' ')[0]}
                            {sameFlight[f.id].length > 1
                              ? ` and ${sameFlight[f.id].length - 1} other${sameFlight[f.id].length > 2 ? 's' : ''} are`
                              : ' is'} on this flight
                          </span>
                        </Link>
                      )}
                      <div className="mt-3 flex items-center gap-2 border-t border-brand/20 pt-3">
                        <button
                          type="button"
                          onClick={() => offerTrip(f)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white transition-transform duration-200 hover:scale-105 active:scale-95"
                        >
                          <Icon name="pin" className="h-3.5 w-3.5" />
                          {tr("Post to the collab board")}
                        </button>
                        <button
                          onClick={() => openEdit(f)}
                          aria-label={tr("Edit this flight")}
                          className="ml-auto rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white hover:text-brand"
                        >
                          <Icon name="pencil" className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => remove(f)}
                          aria-label={tr("Remove this flight")}
                          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                        >
                          <Icon name="trash" className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </Reveal>
              </section>
            </Reveal>
          )}

          {/* ---- The map ----
              Deferred like every other map in this app: the atlas is parsed once
              per session but the LAYOUT of a few hundred arcs is not free, and
              doing it while the cards above are mid-animation is what makes a
              page hitch a second after it appears. */}
          <Reveal from="down">
            <section>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">{tr("Everywhere you have been")}</h2>
                <p className="text-xs text-smoke">
                  {stats.routes.length} {stats.routes.length === 1 ? 'route' : 'routes'} · {stats.airports} airports
                </p>
              </div>
              <WhenVisible rootMargin="1000px" fallback={<MapSkeleton />}>
                <FlightMap routes={stats.routes} airports={stats.pins} />
              </WhenVisible>
            </section>
          </Reveal>

          {/* ---- THIS YEAR VERSUS LAST YEAR ---- */}
          {yearRow(thisYear) && yearRow(lastYear) && (
            <Reveal from="down">
              <section>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold">{thisYear} against {lastYear}</h2>
                    <p className="mt-0.5 text-sm text-smoke">
                      {thisYear} is still running, so the two are not the same length of year.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCompare((v) => !v)}
                    className="shrink-0 text-sm font-medium text-brand transition-transform duration-200 hover:scale-105"
                  >
                    {compare ? 'Hide the comparison' : 'Compare the two →'}
                  </button>
                </div>
                {compare && (
                  <div className="grid animate-fade-up gap-4 sm:grid-cols-2">
                    <YearColumn title={thisYear} data={yearRow(thisYear)} other={yearRow(lastYear)} lead />
                    <YearColumn title={lastYear} data={yearRow(lastYear)} />
                  </div>
                )}
              </section>
            </Reveal>
          )}

          {/* ---- THE RECORDS WALL ---- */}
          <Reveal from="down">
            <section>
              {/* NO STRAPLINE, AND THE GRID IS EVEN. "Every one of these is already in your log. Nothing here was typed
                  in" was a reassurance nobody had asked for a second time. And the cards are `items-stretch` with a
                  fixed foot, so a record whose detail line wraps no longer makes its whole row taller than the next - */}
              <h2 className="mb-3 text-lg font-semibold">{tr("Your records")}</h2>
              <Reveal className="grid items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3" stagger={0.05}>
                {r.longest && (
                  <RecordCard icon="plane" tone="brand" label={tr("Longest flight")}
                    value={`${km(r.longest.dist)} km`}
                    detail={`${r.longest.from.iata} to ${r.longest.to.iata} · ${formatDate(r.longest.flown_on)}`} />
                )}
                {r.shortest && (
                  <RecordCard icon="pin" label={tr("Shortest hop")}
                    value={`${km(r.shortest.dist)} km`}
                    detail={`${r.shortest.from.iata} to ${r.shortest.to.iata} · ${humanHours(r.shortest.mins)}`} />
                )}
                {r.longestTime && (
                  <RecordCard icon="clock" label={tr("Longest time in the air")}
                    value={humanHours(r.longestTime.mins)}
                    detail={`${r.longestTime.from.city} to ${r.longestTime.to.city}`} />
                )}
                {/* FASTEST TURNAROUND IS GONE. Both halves are right. "Two days" between landing and taking off again is
                    a fact about a diary rather than about flying, and it was the odd card out on a wall of records - so
                    dropping it also leaves a count that fills its rows. The `records.turnaround` computation stays in
                    lib/flightStats (it is pure and tested); nothing draws it. */}
                {r.busiestMonth && (
                  <RecordCard icon="calendar" label={tr("Busiest month")}
                    value={monthLabel(r.busiestMonth.key)}
                    detail={`${r.busiestMonth.flights} flights · ${km(r.busiestMonth.distance)} km`} />
                )}
                {r.busiestDay && (
                  <RecordCard icon="chart" label={tr("Most in one day")}
                    value={`${r.busiestDay.flights} flights`}
                    detail={formatDate(r.busiestDay.date)} />
                )}
                {/* BIGGEST CLOCK CHANGE IS GONE. It is only ever computable on the flights where both ends name a single
                    time zone (see lib/localTime), so on most logs it was a card that sometimes existed and sometimes did
                    not - and "+8 hours" is a fact about a time zone table rather than about a journey. The lifetime
                    figure still rides on the headline card, where it is an accumulation and means something. The team
                    asked for the card to go. */}
                {r.biggestYear && (
                  <RecordCard icon="trophy" label={tr("Biggest year")}
                    value={r.biggestYear.year}
                    detail={`${km(r.biggestYear.distance)} km over ${r.biggestYear.flights} flights`} />
                )}
                {stats.topRoute && (
                  <RecordCard icon="reorder" label={tr("Most flown route")}
                    value={stats.topRoute.pair}
                    detail={`${stats.topRoute.n} ${stats.topRoute.n === 1 ? 'time' : 'times'}`} />
                )}
                {stats.topAirport && (
                  <RecordCard icon="home" label={tr("Home airport")}
                    value={stats.topAirport.iata}
                    detail={`${stats.topAirport.city} · ${stats.topAirport.n} flights`} />
                )}
                <RecordCard icon="clock" label={tr("Average year")}
                  value={humanHours(stats.avgMinutesPerYear)}
                  detail={`${km(stats.avgKmPerYear)} km across ${stats.activeYears} ${stats.activeYears === 1 ? 'year' : 'years'} of flying`} />
                <RecordCard icon="chartPie" label={tr("Average flight")}
                  value={`${km(stats.distance / stats.flights)} km`}
                  detail={humanHours(stats.minutes / stats.flights)} />
                {/* KILOGRAMS UNTIL TONNES MEAN SOMETHING. One short-haul hop is
                    about 200kg, which rounds to zero tonnes, and a card reading
                    "0" under a flight somebody just logged says the page is
                    broken rather than that the number is small. */}
                <RecordCard icon="globe" label={tr("Carbon, roughly")}
                  value={stats.co2 >= 1000 ? `${(stats.co2 / 1000).toFixed(1)} t` : `${km(stats.co2)} kg`}
                  detail="per seat, estimated" />
                {/* FIRST IN THE LOG IS GONE TOO, and for a better reason: it
                    is not a record, it is a note about when somebody started
                    typing. It says nothing about the flying. The date is still
                    under "Years in the log" on the streak card, where it is
                    doing real work. */}
              </Reveal>
            </section>
          </Reveal>

          {/* THE TRAVEL STREAK SECTION IS GONE. Three cards saying how many consecutive MONTHS have a flight in them is
              a metric this page invented for itself; the log already says how much somebody flies in half a dozen better
              ways, and the number people actually mean by "streak" on this platform is the games one (lib/gameStreak),
              which is somewhere else entirely and was being competed with. `stats.streak` is still computed and tested;
              it is simply not drawn here. */}

          {/* ---- AIRLINE LOYALTY ---- */}
          {/* ---- AIRLINE LOYALTY: THREE, AND THE REST BEHIND A BUTTON ---- Eight rows of bar chart is most of a phone
               screen spent on a ranking whose only interesting entries are at the top - and the tail is all ties on one
               flight each, which is not loyalty. */}
          {stats.loyalty.length > 0 && (
            <Reveal from="down">
              <section>
                <h2 className="mb-3 text-lg font-semibold">{tr("Airline loyalty")}</h2>
                <Reveal className="space-y-2.5" stagger={0.04}>
                  {stats.loyalty.slice(0, showAllAirlines ? 12 : 3).map((a) => (
                    <LoyaltyRow key={a.name} a={a} max={stats.loyalty[0].flights} />
                  ))}
                </Reveal>
                {stats.loyalty.length > 3 && (
                  <button
                    onClick={() => setShowAllAirlines((v) => !v)}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-gray-200 py-2 text-xs font-semibold text-smoke transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:text-brand"
                  >
                    {showAllAirlines ? 'Show fewer' : `Show all ${Math.min(stats.loyalty.length, 12)}`}
                    <Icon name="chevronRight" className={cx('h-3.5 w-3.5 transition-transform duration-200', showAllAirlines ? '-rotate-90' : 'rotate-90')} />
                  </button>
                )}
              </section>
            </Reveal>
          )}

          {/* THE AIRCRAFT COLLECTION CARD WAS HERE AND IS NOW ONLY A BUTTON. Two doors to the same room, one of them
              nine screens down, is one door too many - and the one at the top is the one people actually use because it
              is in the header row with "Across the community". */}

          {/* WHO ELSE FLIES YOUR ROUTES, AND THE LEADERBOARDS, HAVE MOVED.
              Both lived here, nine screens down a page about one person, which
              is where you put something nobody is going to read. They are the
              whole of `/flights/community` now, behind the button at the top of
              this page. See FlightCommunity for why they belong together and
              why they do not belong here. */}

          {/* ---- Why you were flying ---- */}
          {stats.list.some((f) => f.purpose) && (
            <Reveal from="down">
              <section>
                <h2 className="mb-3 text-lg font-semibold">{tr("Why you were flying")}</h2>
                <div className="card !p-5 sm:!p-6">
                  <PurposeBar list={stats.list} />
                </div>
              </section>
            </Reveal>
          )}

          {/* ---- By year ----
              A bar per year, widths as a share of the biggest. A chart library
              for eight bars would be a hundred kilobytes to draw eight divs. */}
          {stats.years.length > 1 && (
            <Reveal from="down">
              <section>
                <h2 className="mb-3 text-lg font-semibold">{tr("Year by year")}</h2>
                <div className="card space-y-3 !p-5 sm:!p-6">
                  {stats.years.map((y) => {
                    const max = Math.max(...stats.years.map((x) => x.distance)) || 1
                    return (
                      <div key={y.year} className="flex items-center gap-3">
                        <span className="w-10 shrink-0 text-xs font-semibold tabular-nums text-smoke">{y.year}</span>
                        <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-cloud">
                          {/* A zero-width fill still paints its own padding, so
                              a year with nothing in it draws no bar at all. */}
                          {y.distance > 0 && (
                            <span
                              className="block h-full rounded-full bg-brand transition-[width] duration-700 ease-out"
                              style={{ width: `${Math.max(4, (y.distance / max) * 100)}%` }}
                            />
                          )}
                        </span>
                        <span className="w-28 shrink-0 text-right text-xs tabular-nums text-smoke sm:w-36">
                          {km(y.distance)} km · {y.flights}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </section>
            </Reveal>
          )}

          {/* ---- The log itself ---- */}
          <FlightsLog
            openEdit={openEdit}
            remove={remove}
            setDetail={setDetail}
            setShowAll={setShowAll}
            showAll={showAll}
            stats={stats}
            tr={tr}
            visible={visible}
          />
        </div>
      )}

      {/* ---- Log a flight ---- */}
      <FlightsLogForm
        adding={adding}
        allAirlines={allAirlines}
        canRoundTrip={canRoundTrip}
        carriers={carriers}
        closeForm={closeForm}
        customAirline={customAirline}
        customPlane={customPlane}
        editing={editing}
        error={error}
        facts={facts}
        form={form}
        fromA={fromA}
        pickPhoto={pickPhoto}
        picked={picked}
        pickedPlane={pickedPlane}
        planes={planes}
        previewKm={previewKm}
        returnLeg={returnLeg}
        save={save}
        saving={saving}
        setAllAirlines={setAllAirlines}
        setCustomAirline={setCustomAirline}
        setCustomPlane={setCustomPlane}
        setForm={setForm}
        setScanning={setScanning}
        shownCarriers={shownCarriers}
        toA={toA}
        tr={tr}
        upcoming={upcoming}
        uploading={uploading}
      />

      <ScanBoardingPass
        open={scanning}
        now={new Date(`${today}T12:00:00`)}
        onClose={() => setScanning(false)}
        onFilled={(fields) => {
          // MERGE, NEVER REPLACE, AND NEVER WITH A BLANK.
          //
          // Somebody may have picked an airline or written a note before
          // reaching for the scanner, and a spread alone would undo that: the
          // scan returns a full form shape, so a field it could not read comes
          // back as '' and overwrites whatever was there. That became a live
          // risk the moment the scan started returning `airline`, which is empty
          // for any carrier outside lib/airlines - scanning a small regional
          // pass would have silently cleared an airline the reader had already
          // chosen by hand.
          setForm((f) => {
            const next = { ...f }
            for (const [k, v] of Object.entries(fields)) if (v) next[k] = v
            return next
          })
          setError('')
        }}
      />

      {/* ---- The collab board offer ---- */}
      {/* ---- One trip, opened ----
          The log used to be a list you could only edit or delete from. This is
          the third thing: looking at it. The photograph leads at a size worth
          looking at and opens full screen from here, and a return trip shows
          BOTH legs rather than pretending to be one flight with a long
          distance. */}
      <FlightsDetailModal
        detail={detail}
        offerTrip={offerTrip}
        openEdit={openEdit}
        setDetail={setDetail}
        setPhoto={setPhoto}
        tr={tr}
        tripIsUpcoming={tripIsUpcoming}
      />

      {/* The photograph, full size. Deliberately its own layer rather than a
          bigger image inside the sheet: a trip photo is portrait as often as
          not and the sheet is not the shape of a photograph.
          IT IS A PORTAL NOW - see PhotoLightbox for why a z-index written on
          this page could never beat the trip sheet it opens from. */}
      <PhotoLightbox src={photo} onClose={() => setPhoto(null)} />

      <Modal open={!!offer} onClose={() => setOffer(null)} title={tr("Tell the community?")}>
        {offer && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-card border border-gray-100 bg-white p-4">
              <Icon name="pin" className="h-5 w-5 shrink-0 text-brand" />
              <p className="text-sm">
                <span className="font-semibold">{offer.city}</span>
                <span className="text-smoke">, {formatDate(offer.start)} to {formatDate(offer.end)}</span>
              </p>
            </div>
            {/* ONE SENTENCE. It ended with "The dates come from the flight you just logged and you can change them on
                the board afterwards", which is the app explaining its own plumbing and pre-emptively apologising for it. */}
            <p className="text-sm text-smoke">
              {tr("Post it on the collab board and anybody who is there at the same time can reach out to you.")}
            </p>
            <div>
              <label htmlFor="collab-note" className="label">{tr("What are you up for?")}</label>
              <textarea
                id="collab-note"
                rows={3}
                className="input w-full"
                maxLength={280}
                value={offer.note}
                placeholder={tr("Filming around the old town, up for a coffee or a shoot with anyone nearby.")}
                onChange={(e) => setOffer((o) => ({ ...o, note: e.target.value }))}
              />
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setOffer(null)} className="btn-ghost w-full justify-center sm:w-auto">
                {tr("Not this time")}
              </button>
              <button
                type="button"
                onClick={postToCollab}
                disabled={!offer.note.trim()}
                className="btn-primary w-full justify-center disabled:opacity-40 sm:w-auto"
              >
                {tr("Post to the collab board")}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
