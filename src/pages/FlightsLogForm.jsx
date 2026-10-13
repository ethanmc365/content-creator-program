import { Modal, Spinner } from '../components/ui'
import Icon from '../components/Icon'
import { BoardingPass } from './FlightsBoardingPass'
import { AirportField } from './FlightsAirportField'
import { cx } from '../lib/utils'
import { DateField } from '../components/DateTimeFields'
import { NO_AUTOFILL } from '../lib/noAutofill'
import { PURPOSES, km } from './FlightsParts'
import AircraftArt from '../components/network/AircraftArt'

// Part of Flights.jsx: every value it shows comes in as a prop from the page.
export default function FlightsLogForm({
  adding,
  allAirlines,
  canRoundTrip,
  carriers,
  closeForm,
  customAirline,
  customPlane,
  editing,
  error,
  facts,
  form,
  fromA,
  pickPhoto,
  picked,
  pickedPlane,
  planes,
  previewKm,
  returnLeg,
  save,
  saving,
  setAllAirlines,
  setCustomAirline,
  setCustomPlane,
  setForm,
  setScanning,
  shownCarriers,
  toA,
  tr,
  upcoming,
  uploading,
}) {
  return (
    <Modal
      open={adding}
      onClose={closeForm}
      title={editing ? 'Edit this flight' : upcoming ? 'A flight coming up' : 'Log a flight'}
      wide
      sheet={false}
    >
      <form onSubmit={save} className="space-y-5">
        {/* NOBODY IS ASKED WHETHER THEY HAVE ALREADY TAKEN THE FLIGHT. There were two big radio cards at the top of this
            form, "I have flown this" and "Coming up", and they decided whether the date field would accept a future
            date. they are right, and the data model already agreed with them: there is no `is_upcoming` column and there
            must not be one, because a boolean would be wrong the morning after the flight. Upcoming IS `flown_on >
            current_date` (migration 104). So the answer was always derivable from a field the form already collects, and
            asking for it was asking somebody to state a fact twice and then contradict themselves. `upcoming` is now
            computed from the date as it is typed - it still drives what happens after saving (the offer to post to the
            collab board) and the wording on the date labels. */}
        {/* SCAN IT INSTEAD OF TYPING IT.
            First, because it is the fastest path through this form and the
            one that should be tried before anybody starts typing. It only
            fills five fields - the airline, the aircraft, the purpose and the
            note are still yours, because a barcode does not know why you
            went. See components/network/ScanBoardingPass. */}
        {!editing && (
          <button
            type="button"
            onClick={() => setScanning(true)}
            className="group flex w-full items-center gap-3 rounded-card border border-dashed border-brand/40 bg-brand-tint/25 px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:bg-brand-tint/50"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white transition-transform duration-200 group-hover:scale-110">
              <Icon name="magnifier" className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">{tr("Scan your boarding pass")}</span>
              <span className="block text-xs text-smoke">{tr("A photo, or a screenshot from Apple Wallet")}</span>
            </span>
            <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-brand transition-transform duration-200 group-hover:translate-x-0.5" />
          </button>
        )}

        {/* THE BOARDING PASS IS THE FORM'S ANSWER, AND IT IS AT THE TOP.
            It used to be a tinted panel of facts under the two airport
            fields. Putting it first, and building it as you type, is what
            makes this feel like watching a flight appear rather than filling
            in a form: everything on it comes from the two codes and the date,
            and nothing on it is ever typed. */}
        <BoardingPass
          from={fromA}
          to={toA}
          facts={facts}
          dateStr={form.flown_on}
          airlineName={form.airline}
          flightNo={form.flight_number}
          seat={form.seat}
          aircraftType={pickedPlane}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AirportField id="flight-from" label={tr("From")} value={form.from_iata} autoFocus
            onChange={(v) => setForm((f) => ({ ...f, from_iata: v }))} />
          <AirportField id="flight-to" label="To" value={form.to_iata}
            onChange={(v) => setForm((f) => ({ ...f, to_iata: v }))} />
        </div>

        {/* A ROUND TRIP IS TWO FLIGHTS, and logging it is one tick. It saves
            as two rows, because a return has its own date and its own
            distance and folding it into one row would halve everybody's
            totals.

            THE TICK IS A TICK, AND NOTHING ELSE IS ASKED UNTIL IT IS ON. they are right, and the reason it did not make
            sense is that the box was ANSWERING the question the control under it then asked. It read "Also AMS back to
            BFS" - a claim about which way the return flies - and the very next control was "which way did you fly
            first?", which can reverse exactly that. Two controls stating opposite things about the same trip is not a
            layout problem. So the box now says "Round trip" and means only "there was a flight home". Everything
            directional - which leg came first, and the two dates it puts in order - lives in the panel that opens
            underneath, where it can be read as one answer. */}
        {canRoundTrip && (
          <label
            className={cx(
              'flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors',
              form.round_trip ? 'border-brand bg-brand-tint/20' : 'border-gray-200 hover:border-brand/40',
            )}
          >
            <input
              type="checkbox"
              checked={form.round_trip}
              onChange={(e) => setForm((f) => ({ ...f, round_trip: e.target.checked, return_on: e.target.checked ? f.return_on : '', first_leg: 'out' }))}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#d94407]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">{tr("Round trip")}</span>
              <span className="block text-[11px] leading-relaxed text-smoke">
                {/* A TRIP THAT ALREADY HAS ITS LEG HOME SAYS SO. The hint
                    under the box used to describe what ticking it WOULD do,
                    which is the wrong tense over a trip that is already a
                    round trip - and unticking it is a delete, so it has to
                    read like one. */}
                {returnLeg
                  ? 'The flight home is logged as its own leg. Untick to remove it.'
                  : 'Logs the flight home as its own leg, with its own date.'}
              </span>
            </span>
          </label>
        )}

        {canRoundTrip && form.round_trip && (
          <div className="rounded-xl border border-gray-200 p-4">
            {/* WHICH WAY ROUND THE TRIP ACTUALLY WENT. A pair of airports does not say which end you started at, and the
                form was assuming the pair had been typed in flying order. Half the time it has not been - people type
                the destination they are thinking about first. So the rule is now stated once and holds everywhere:
                `flown_on` is the FIRST leg's date, `return_on` is the second's, and this control decides which pair of
                codes goes on which. Both options are drawn in full rather than as a swap button, because "which way
                round" is a question you answer by reading the two answers, not by toggling something and checking what
                happened.
                IT IS ASKED BEFORE THE DATES, because it is what makes the two
                date labels below it mean anything. */}
            <span className="label">{tr("Which way did you fly first?")}</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                { key: 'out', a: fromA, b: toA },
                { key: 'back', a: toA, b: fromA },
              ].map((opt) => {
                const on = form.first_leg === opt.key
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, first_leg: opt.key }))}
                    aria-pressed={on}
                    className={cx(
                      'flex flex-col gap-1 rounded-xl border px-3.5 py-3 text-left transition-all duration-200 hover:-translate-y-0.5',
                      on ? 'border-brand bg-brand-tint/30 shadow-card' : 'border-gray-200 bg-white hover:border-brand/40',
                    )}
                  >
                    <span className={cx('flex items-center gap-1.5 text-sm font-bold tracking-wider', on ? 'text-brand' : 'text-ink')}>
                      {opt.a?.iata || '···'}
                      <Icon name="plane" className="h-3.5 w-3.5 text-brand-light" />
                      {opt.b?.iata || '···'}
                    </span>
                    <span className="text-[11px] text-smoke">
                      {opt.a && opt.b
                        ? `${opt.a.city} to ${opt.b.city} first, then back`
                        : 'Pick both airports first'}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* THE DATES, ONE COLUMN OR TWO.
            NO `max` ON EITHER. It existed to enforce a toggle - "I have flown
            this" capped the field at today - and with the toggle gone a
            capped field would make it impossible to log the flight you are
            about to take, which is half of what this form is for. The LABELS
            are what change, live: as soon as the date crosses today, and
            again once a return has been asked for, so "Date flown" becomes
            the date of a named leg rather than of an unspecified one.
            NO HINT UNDER THE RETURN. It said "Saved as its own flight, so the distance counts twice", which is an
            implementation detail dressed as a warning - and it read as a bug being confessed to. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DateField
            id="flight-date"
            label={canRoundTrip && form.round_trip
              ? (upcoming ? 'Date you fly out' : 'Date you flew out')
              : (upcoming ? 'Date you fly' : 'Date flown')}
            value={form.flown_on}
            onChange={(v) => setForm((f) => ({ ...f, flown_on: v }))}
          />
          {canRoundTrip && form.round_trip && (
            <DateField
              id="flight-return"
              label={upcoming ? 'Date you fly back' : 'Date you flew back'}
              value={form.return_on}
              onChange={(v) => setForm((f) => ({ ...f, return_on: v }))}
            />
          )}
        </div>
        {canRoundTrip && form.round_trip && form.flown_on && form.return_on && form.return_on < form.flown_on && (
          <p className="-mt-2 text-[11px] text-red-500">
            {tr("The flight back is before the flight out. Check the dates.")}
          </p>
        )}

        {/* ---- WHO FLIES IT ----
            A SHORTLIST OF REAL CANDIDATES INSTEAD OF AN EMPTY BOX. This was a
            text field labelled "Airline (optional)", and the honest thing to
            say about an optional text field asking for a fact you have to
            remember is that almost nobody fills it in - which is why the
            "Airlines" statistic on this page read zero for everybody. */}
        {previewKm > 0 && (
          <div>
            {/* NOT OPTIONAL. The whole reason this is a shortlist of real candidates rather than an empty text box is
                that it is a fact everybody has and nobody could be bothered to type. */}
            <p className="label">{tr("Airline")}</p>
            {customAirline ? (
              <div className="flex gap-2">
                <input id="flight-airline" value={form.airline} maxLength={60} autoFocus {...NO_AUTOFILL}
                  placeholder={tr("The airline you flew")}
                  onChange={(e) => setForm((f) => ({ ...f, airline: e.target.value }))} className="input w-full" />
                <button type="button" onClick={() => { setCustomAirline(false); setForm((f) => ({ ...f, airline: '' })) }}
                  className="btn-ghost shrink-0 !px-3 !py-2 text-xs">{tr("Back to the list")}</button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {shownCarriers.map(({ airline: a, why }) => {
                  const on = form.airline === a.name
                  return (
                    <button
                      key={a.iata}
                      type="button"
                      title={why}
                      onClick={() => setForm((f) => ({
                        ...f,
                        airline: on ? '' : a.name,
                        // Changing airline invalidates an aircraft chosen from
                        // the previous one's fleet. Silently keeping a 787
                        // beside "Ryanair" would be the form telling a lie it
                        // was built to prevent.
                        aircraft: on ? f.aircraft : '',
                      }))}
                      className={cx(
                        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95',
                        on ? 'bg-brand text-white' : 'bg-cloud text-smoke hover:-translate-y-0.5 hover:text-ink',
                      )}
                    >
                      <span className={cx('font-mono text-[10px]', on ? 'text-white/70' : 'text-gray-400')}>{a.iata}</span>
                      {a.name}
                    </button>
                  )
                })}
                {carriers.length > 8 && !allAirlines && (
                  <button type="button" onClick={() => setAllAirlines(true)}
                    className="inline-flex items-center rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-smoke ring-1 ring-gray-200 transition-all hover:-translate-y-0.5 hover:text-ink">
                    {carriers.length - 8} more
                  </button>
                )}
                <button type="button" onClick={() => { setCustomAirline(true); setForm((f) => ({ ...f, airline: '' })) }}
                  className="inline-flex items-center rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-brand ring-1 ring-brand/30 transition-all hover:-translate-y-0.5 hover:ring-brand">
                  {tr("Other")}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ---- AIRCRAFT, WITH THE AIRCRAFT ON IT ----
            The chips carry the type's own silhouette now. It costs nothing -
            the drawing is the same component the collection page is built
            from - and it turns a row of model numbers, which only a spotter
            can tell apart, into a row of shapes anybody can. */}
        {/* `planes.length > 0` is NOT part of this condition. It used to be,
            which meant the whole aircraft field vanished on any route no
            airline in the table can reach - and that is precisely the route
            somebody was flown down on something rare. The escape below has to
            be reachable whenever there is a route at all. */}
        {previewKm > 0 && (
          <div>
            <p className="label">{tr("Aircraft")} <span className="font-normal text-smoke">(optional)</span></p>
            {/* AND A WAY TO NAME ONE THAT IS NOT ON THE LIST. The chips are what the airline you picked could plausibly
                have sent on a route this length, which is a good shortlist and a closed one - and a closed list is
                exactly wrong for the person who has just been on a Twin Otter to an island. The same escape the airline
                picker has had all along. What gets typed here appears under "Also flown" on the collection page and
                counts towards the number of different aircraft you have been on. */}
            {customPlane ? (
              <div className="flex gap-2">
                <input
                  id="flight-aircraft"
                  value={form.aircraft}
                  maxLength={60}
                  autoFocus
                  {...NO_AUTOFILL}
                  placeholder={tr("The aircraft you were on")}
                  onChange={(e) => setForm((f) => ({ ...f, aircraft: e.target.value }))}
                  className="input w-full"
                />
                <button
                  type="button"
                  onClick={() => { setCustomPlane(false); setForm((f) => ({ ...f, aircraft: '' })) }}
                  className="btn-ghost shrink-0 !px-3 !py-2 text-xs"
                >
                  {tr("Back to the list")}
                </button>
              </div>
            ) : (
            <div className="flex flex-wrap gap-1.5">
              {planes.slice(0, picked ? planes.length : 10).map((p) => {
                const on = form.aircraft === p.name
                return (
                  <button
                    key={p.key}
                    type="button"
                    title={`${p.maker} · ${p.seats} seats · ${km(p.range)} km range`}
                    onClick={() => setForm((f) => ({ ...f, aircraft: on ? '' : p.name }))}
                    className={cx(
                      'inline-flex items-center gap-1.5 rounded-full py-1 pl-1.5 pr-3 text-xs font-semibold transition-all duration-200 active:scale-95',
                      on ? 'bg-brand text-white' : 'bg-cloud text-smoke hover:-translate-y-0.5 hover:text-ink',
                    )}
                  >
                    <span className={cx('h-5 w-7 shrink-0', on && 'text-white')}>
                      <AircraftArt type={p} className={on ? '[&>g]:!text-white' : undefined} />
                    </span>
                    {p.name}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => { setCustomPlane(true); setForm((f) => ({ ...f, aircraft: '' })) }}
                className="inline-flex items-center rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-brand ring-1 ring-brand/30 transition-all hover:-translate-y-0.5 hover:ring-brand"
              >
                Other
              </button>
            </div>
            )}
          </div>
        )}

        {/* OPTIONAL SAYS SO, AND THAT IS ALL IT SAYS. Two of the three now carry the same "(optional)" the airline used
            to wear wrongly - and none of them ever blocked a save, so the label was simply describing what the form
            already did.
            THE NOTE IS THE EXCEPTION AND IT IS DELIBERATE. It is not marked optional, because marking it optional is an
            invitation to skip the one field that turns a row of airport codes into something worth reading back. It is
            still not enforced. */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <label htmlFor="flight-number" className="label">{tr("Flight no.")} <span className="font-normal text-smoke">(optional)</span></label>
            <input id="flight-number" maxLength={10} {...NO_AUTOFILL} autoCapitalize="characters"
              value={form.flight_number}
              placeholder={picked ? `${picked.iata}1363` : 'TP1363'}
              onChange={(e) => setForm((f) => ({ ...f, flight_number: e.target.value }))} className="input w-full" />
          </div>
          {/* SEAT. The one detail people actually remember, and the one that
              makes a row read like a memory rather than a database entry. */}
          <div>
            <label htmlFor="flight-seat" className="label">{tr("Seat")} <span className="font-normal text-smoke">(optional)</span></label>
            <input id="flight-seat" maxLength={8} value={form.seat} placeholder="14A" {...NO_AUTOFILL} autoCapitalize="characters"
              onChange={(e) => setForm((f) => ({ ...f, seat: e.target.value.toUpperCase() }))} className="input w-full" />
          </div>
          <div className="col-span-2">
            <label htmlFor="flight-note" className="label">{tr("Note")}</label>
            <input id="flight-note" value={form.note} maxLength={140} placeholder={tr("Sunrise over the Alps")}
              {...NO_AUTOFILL} autoCorrect="on" autoCapitalize="sentences"
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className="input w-full" />
          </div>
        </div>

        {/* ---- WHY YOU WENT ----
            The one question a creator programme's flight log should be able to
            answer and no other page can: how much of your flying is work. */}
        <div>
          <p className="label">{tr("What for?")} <span className="font-normal text-smoke">(optional)</span></p>
          <div className="flex flex-wrap gap-1.5">
            {PURPOSES.map((p) => {
              const on = form.purpose === p.key
              return (
                <button key={p.key} type="button"
                  onClick={() => setForm((f) => ({
                    ...f,
                    purpose: on ? '' : p.key,
                    // Moving off Other drops what was typed under it, so a
                    // row can never say "Holiday" and carry a note explaining
                    // that it was a funeral.
                    purpose_note: on || p.key !== 'other' ? '' : f.purpose_note,
                  }))}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95',
                    on ? 'bg-brand text-white' : 'bg-cloud text-smoke hover:-translate-y-0.5 hover:text-ink',
                  )}
                >
                  <Icon name={p.icon} className="h-3.5 w-3.5" />
                  {p.label}
                </button>
              )
            })}
          </div>

          {/* AND "OTHER" GETS TO SAY WHAT IT WAS. A row filed under Other is the app recording that it did not ask. The
              six keys are unchanged and the chart still counts THEM - the whole value of the field is that it can be
              counted, and a free text reason column is four hundred distinct values and no chart. The note rides beside
              the key (migration 104) and appears on the row it belongs to, nowhere else. It grows and shrinks rather
              than appearing, the same height transition the board's country field uses, so the dialog does not jump a
              row taller under the cursor. */}
          <div
            className={cx(
              'grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out motion-reduce:transition-none',
              form.purpose === 'other' ? 'mt-2.5 grid-rows-[1fr] opacity-100' : 'mt-0 grid-rows-[0fr] opacity-0',
            )}
          >
            <div className="overflow-hidden">
              <input
                id="flight-purpose-note"
                aria-label={tr("What was it for?")}
                {...NO_AUTOFILL}
                autoCorrect="on"
                autoCapitalize="sentences"
                className="input w-full"
                maxLength={80}
                value={form.purpose_note}
                tabIndex={form.purpose === 'other' ? undefined : -1}
                aria-hidden={form.purpose !== 'other'}
                placeholder={tr("A wedding, a move, a layover you turned into a trip")}
                onChange={(e) => setForm((f) => ({ ...f, purpose_note: e.target.value }))}
              />
            </div>
          </div>
        </div>

        {/* ---- ONE PHOTOGRAPH ---- ONE, not a gallery: the travel gallery on a profile already exists and a second one
             attached to flights would be two places to put the same picture. It is also the only part of a logged flight
             anybody ever wants to look at again, which is why it gets the front of the row in the log rather than a
             link. */}
        <div>
          <p className="label">{tr("A photo from the trip")} <span className="font-normal text-smoke">(optional)</span></p>
          {form.photo_url ? (
            <div className="relative inline-block">
              <img src={form.photo_url} alt="" className="h-32 w-48 rounded-xl object-cover ring-1 ring-black/5" />
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, photo_url: '' }))}
                aria-label={tr("Remove this photo")}
                className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-smoke shadow-card transition-transform hover:scale-110"
              >
                <Icon name="close" className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <label className={cx(
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 px-4 py-6 text-center transition-colors hover:border-brand/50 hover:bg-brand-tint/20',
              uploading && 'pointer-events-none opacity-60',
            )}>
              <input type="file" accept="image/*,.heic,.heif" className="hidden" onChange={pickPhoto} />
              {uploading ? <Spinner /> : <Icon name="image" className="h-6 w-6 text-gray-300" />}
              <span className="text-xs font-medium text-smoke">
                {uploading ? 'Uploading…' : 'Add one picture from this trip'}
              </span>
            </label>
          )}
        </div>

        {/* THE SHARING TICK BOX HAS GONE. See BLANK_FORM: every flight
            counts towards the community now and there is nothing to decide,
            so there is nothing to ask. What reaches other people is unchanged
            - the airports, the count and the distance, never a date, a seat,
            a note or a photograph. */}

        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={closeForm} className="btn-ghost w-full justify-center sm:w-auto">{tr("Cancel")}</button>
          <button type="submit" disabled={saving} className="btn-primary w-full justify-center sm:w-auto">
            {saving ? <Spinner /> : editing ? 'Save changes' : upcoming ? 'Add to what is coming up' : 'Add to my log'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
