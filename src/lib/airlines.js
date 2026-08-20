// WHO FLIES THIS ROUTE, AND ON WHAT.
//
// WHAT THIS IS FOR. Logging a flight used to be seven fields, five of them
// optional and all of them typed from memory: airline, flight number, aircraft,
// cabin, duration. Nobody remembers the aircraft. Most people do not remember
// the flight number an hour after landing. So the log filled up with rows that
// said "DUB to OSL" and nothing else, and every statistic built on the other
// columns - airlines flown, aircraft types, time in the air - stayed at zero.
// Ethan: "can't you get all the flight info from somewhere and track the miles,
// average flight time etc when someone enters a flight like Dublin to Oslo, and
// fill everything in automatically, showing the options for the companies that
// do that route and then choosing the appropriate plane from that."
//
// WHY THIS IS A TABLE AND NOT AN API. There is no free, unauthenticated,
// CORS-open source of scheduled route data. The ones that exist are paid feeds
// with per-query pricing, and putting a flight log behind one would mean an API
// key in a browser bundle and a bill that scales with a hobby feature. The
// OpenFlights routes dump is free and eleven years stale, and it is 2.5MB.
//
// So the answer is DERIVED, not looked up, and the page says so. An airline's
// route network is not arbitrary: carriers fly from the airports they are based
// at, in aircraft whose range covers the distance. Those two facts, applied to a
// table of who is based where and what they own, reproduce the real answer for
// the overwhelming majority of routes a European creator flies - and where it is
// wrong it is wrong by OFFERING one carrier too many, which costs a person one
// glance, not by inventing a flight that never existed.
//
// THE OUTPUT IS A SHORTLIST, NEVER AN ASSERTION. The UI presents these as "who
// flies this" and lets a person pick, with a free-text field underneath for the
// airline nobody thought of. A shortlist that is right four times in five and
// obviously editable beats an empty box every time.

// ---------------------------------------------------------------- aircraft
//
// Range figures are the manufacturer's published maximum with typical
// passenger load, in km. They are the one number that decides whether an
// aircraft can be on a route at all, so they are the one number worth being
// careful about. `cruise` is the true airspeed used for the block-time
// estimate; `seats` is a typical single-operator configuration and is here
// because "180 seats" tells somebody what kind of aeroplane it was in a way
// "A320neo" does not.
// `year` IS ENTRY INTO SERVICE, NOT FIRST FLIGHT AND NOT THE END OF PRODUCTION.
//
// Ethan, on the collection cards: "I would also like to add some more
// information on the card. I think one piece of good information for each plane
// would be the year it was manufactured or the year it was released."
//
// Of the three dates an aircraft type has - rolled out, first flew, entered
// passenger service - the last is the only one that answers the question a
// collection asks, which is "could I have been on this". A 787 first flew in
// 2009 and nobody could buy a seat on one until 2011. It is also the date that
// makes the wall readable in a way a spec never does: a 1966 Twin Otter next to
// a 2024 A321XLR is fifty-eight years of aviation on one screen.
export const AIRCRAFT = {
  atr72:    { name: 'ATR 72',            maker: 'ATR',      range: 1500,  seats: 70,  cruise: 510, body: 'turboprop', year: 1989 },
  q400:     { name: 'Dash 8 Q400',       maker: 'De Havilland', range: 2040, seats: 78, cruise: 560, body: 'turboprop', year: 2000 },
  crj900:   { name: 'CRJ900',            maker: 'Bombardier', range: 2960, seats: 90, cruise: 830, body: 'regional', year: 2003 },
  e190:     { name: 'Embraer E190',      maker: 'Embraer',  range: 4500,  seats: 100, cruise: 830, body: 'regional', year: 2005 },
  e195e2:   { name: 'Embraer E195-E2',   maker: 'Embraer',  range: 4800,  seats: 132, cruise: 830, body: 'regional', year: 2019 },
  a220:     { name: 'Airbus A220-300',   maker: 'Airbus',   range: 6300,  seats: 145, cruise: 830, body: 'narrowbody', year: 2016 },
  a319:     { name: 'Airbus A319',       maker: 'Airbus',   range: 6900,  seats: 140, cruise: 830, body: 'narrowbody', year: 1996 },
  a320:     { name: 'Airbus A320',       maker: 'Airbus',   range: 6100,  seats: 180, cruise: 830, body: 'narrowbody', year: 1988 },
  a320neo:  { name: 'Airbus A320neo',    maker: 'Airbus',   range: 6500,  seats: 186, cruise: 830, body: 'narrowbody', year: 2016 },
  a321:     { name: 'Airbus A321',       maker: 'Airbus',   range: 5900,  seats: 220, cruise: 830, body: 'narrowbody', year: 1994 },
  a321neo:  { name: 'Airbus A321neo',    maker: 'Airbus',   range: 7400,  seats: 240, cruise: 830, body: 'narrowbody', year: 2017 },
  a321xlr:  { name: 'Airbus A321XLR',    maker: 'Airbus',   range: 8700,  seats: 200, cruise: 830, body: 'narrowbody', year: 2024 },
  b737:     { name: 'Boeing 737-800',    maker: 'Boeing',   range: 5765,  seats: 189, cruise: 840, body: 'narrowbody', year: 1998 },
  b737max8: { name: 'Boeing 737 MAX 8',  maker: 'Boeing',   range: 6570,  seats: 197, cruise: 840, body: 'narrowbody', year: 2017 },
  b757:     { name: 'Boeing 757-200',    maker: 'Boeing',   range: 7250,  seats: 200, cruise: 850, body: 'narrowbody', year: 1983 },
  b767:     { name: 'Boeing 767-300ER',  maker: 'Boeing',   range: 11070, seats: 261, cruise: 850, body: 'widebody', year: 1988 },
  a330:     { name: 'Airbus A330-300',   maker: 'Airbus',   range: 11750, seats: 290, cruise: 870, body: 'widebody', year: 1994 },
  a330neo:  { name: 'Airbus A330-900neo', maker: 'Airbus',  range: 13300, seats: 287, cruise: 870, body: 'widebody', year: 2018 },
  b787:     { name: 'Boeing 787-9',      maker: 'Boeing',   range: 14140, seats: 290, cruise: 900, body: 'widebody', year: 2014 },
  b777:     { name: 'Boeing 777-300ER',  maker: 'Boeing',   range: 13650, seats: 396, cruise: 890, body: 'widebody', year: 2004 },
  a350:     { name: 'Airbus A350-900',   maker: 'Airbus',   range: 15000, seats: 315, cruise: 900, body: 'widebody', year: 2015 },
  a380:     { name: 'Airbus A380',       maker: 'Airbus',   range: 15200, seats: 525, cruise: 900, body: 'widebody', year: 2007 },
  b747:     { name: 'Boeing 747-8',       maker: 'Boeing',   range: 14320, seats: 364, cruise: 900, body: 'widebody', year: 2012 },
  e175:     { name: 'Embraer E175',       maker: 'Embraer',  range: 3300,  seats: 76,  cruise: 830, body: 'regional', year: 2005 },

  // ---- THE REST OF WHAT PEOPLE ACTUALLY FLY ----
  //
  // Ethan: "I want to ensure you have the most common aircrafts here." The list
  // above was assembled to answer a different question - "what would this
  // airline send on this route" - so it holds one representative of each family
  // and skips the variants. A COLLECTION is the opposite: the variant IS the
  // entry, because somebody who has been on a 787-8 and a 787-9 has been on two
  // aircraft and wants two cards.
  //
  // Everything added here is a type a normal person can plausibly have been on
  // in the last fifteen years, which is the only test that matters for a
  // collection: an entry nobody can ever fill is not a gap, it is a decoration.
  // (No MD-80s, no Concorde, no 737-200.) The rare ones are still handled - see
  // the "Other" escape on the aircraft picker in the log form, and the "Also
  // flown" section on the collection page.
  //
  // These are additions to the COLLECTION. `aircraftFor` and `anyAircraftFor`
  // read the same table for the log form's suggestions, so a variant here also
  // becomes a suggestion where an airline's fleet lists it - which is right.
  b73g:     { name: 'Boeing 737-700',    maker: 'Boeing',   range: 6230,  seats: 149, cruise: 840, body: 'narrowbody', year: 1998 },
  b739:     { name: 'Boeing 737-900ER',  maker: 'Boeing',   range: 5925,  seats: 215, cruise: 840, body: 'narrowbody', year: 2007 },
  b772:     { name: 'Boeing 777-200ER',  maker: 'Boeing',   range: 13080, seats: 314, cruise: 890, body: 'widebody', year: 1997 },
  b788:     { name: 'Boeing 787-8',      maker: 'Boeing',   range: 13530, seats: 248, cruise: 900, body: 'widebody', year: 2011 },
  b78x:     { name: 'Boeing 787-10',     maker: 'Boeing',   range: 11730, seats: 336, cruise: 900, body: 'widebody', year: 2018 },
  b744:     { name: 'Boeing 747-400',    maker: 'Boeing',   range: 13450, seats: 416, cruise: 900, body: 'widebody', year: 1989 },
  a35k:     { name: 'Airbus A350-1000',  maker: 'Airbus',   range: 16100, seats: 350, cruise: 900, body: 'widebody', year: 2018 },
  a340:     { name: 'Airbus A340-300',   maker: 'Airbus',   range: 13500, seats: 295, cruise: 870, body: 'widebody', year: 1993 },
  crj200:   { name: 'CRJ200',            maker: 'Bombardier', range: 3045, seats: 50, cruise: 800, body: 'regional', year: 1996 },
  e145:     { name: 'Embraer ERJ-145',   maker: 'Embraer',  range: 2870,  seats: 50,  cruise: 800, body: 'regional', year: 1996 },
  atr42:    { name: 'ATR 42',            maker: 'ATR',      range: 1330,  seats: 48,  cruise: 490, body: 'turboprop', year: 1985 },
  // The two that get a travel creator to the places nothing else reaches.
  c208:     { name: 'Cessna 208 Caravan', maker: 'Cessna',  range: 1980,  seats: 12,  cruise: 340, body: 'turboprop', year: 1985 },
  dhc6:     { name: 'DHC-6 Twin Otter',  maker: 'De Havilland', range: 1480, seats: 19, cruise: 340, body: 'turboprop', year: 1966 },

  // ---- AND THE SEVEN THAT MAKE THE WALL COME OUT EVEN ----
  //
  // Ethan: "if there's a few more relatively popular passenger planes exist,
  // try to add them so it's even with four on each row."
  //
  // The collection page lays each body class out four to a row on a wide
  // screen, so a class holding fourteen ends in a row of two and every one of
  // the four sections trails off in the same corner. That reads as a layout
  // fault rather than as a count. The fix is not CSS - it is that these seven
  // aeroplanes were missing anyway, and adding them takes the classes to
  // 16 / 12 / 8 / 8, which is four rows, three rows, two rows, two rows.
  //
  // Every one is a type somebody could have bought a seat on this decade: the
  // A330-200 is the most numerous A330 variant flying, the CRJ700 and E170 are
  // the small end of every US and European regional feed, and the Q300, Saab
  // 340 and 1900D are what an island, a fjord or a bush strip actually gets.
  a332:     { name: 'Airbus A330-200',   maker: 'Airbus',   range: 13450, seats: 246, cruise: 870, body: 'widebody', year: 1998 },
  b77l:     { name: 'Boeing 777-200LR',  maker: 'Boeing',   range: 15843, seats: 317, cruise: 890, body: 'widebody', year: 2006 },
  crj700:   { name: 'CRJ700',            maker: 'Bombardier', range: 2593, seats: 70,  cruise: 830, body: 'regional', year: 2001 },
  e170:     { name: 'Embraer E170',      maker: 'Embraer',  range: 3890,  seats: 70,  cruise: 830, body: 'regional', year: 2004 },
  q300:     { name: 'Dash 8 Q300',       maker: 'De Havilland', range: 1711, seats: 50, cruise: 528, body: 'turboprop', year: 1989 },
  sf34:     { name: 'Saab 340',          maker: 'Saab',     range: 1730,  seats: 34,  cruise: 500, body: 'turboprop', year: 1984 },
  b190:     { name: 'Beechcraft 1900D',  maker: 'Beechcraft', range: 2778, seats: 19, cruise: 528, body: 'turboprop', year: 1991 },
}

export const aircraft = (key) => (AIRCRAFT[key] ? { key, ...AIRCRAFT[key] } : null)

// A TYPE FROM THE NAME THE FORM WROTE.
//
// The aircraft chips store a NAME ("Airbus A320neo"), not a key, so anything
// that wants the photograph or the silhouette has to map back. `aircraftSeen`
// built this table inline; the community page needs the same answer, and two
// copies of a lookup is two places for it to drift.
const BY_NAME = new Map(Object.entries(AIRCRAFT).map(([key, a]) => [a.name.toLowerCase(), { key, ...a }]))
export const aircraftTypeByName = (name) => BY_NAME.get(String(name || '').trim().toLowerCase()) || null

// ---------------------------------------------------------------- airlines
//
// `bases` is where the airline actually starts and ends aircraft rotations, not
// its head office - that is what decides which routes it can fly. A low-cost
// carrier's base list is long and is the whole reason it reaches Oslo from
// Dublin; a legacy carrier's is one or two hubs and it feeds everything through
// them.
//
// `reach` bounds how far from home the airline sells tickets:
//   'domestic'  inside its own country (island and regional operators)
//   'regional'  its own continent
//   'global'    anywhere its fleet can reach
// Range still has the final say - `reach: 'global'` on an all-A320 airline
// cannot produce a transatlantic suggestion, because no A320 can make it.
const RAW_AIRLINES = [
  // ---- UK & Ireland
  { iata: 'BA', name: 'British Airways', country: 'GB', bases: ['LHR', 'LGW', 'LCY'], fleet: ['a320neo', 'a321neo', 'a350', 'b777', 'b787', 'a380'], reach: 'global' },
  { iata: 'VS', name: 'Virgin Atlantic', country: 'GB', bases: ['LHR', 'MAN'], fleet: ['a330neo', 'a350', 'b787'], reach: 'global' },
  { iata: 'U2', name: 'easyJet', country: 'GB', bases: ['LGW', 'LTN', 'STN', 'BRS', 'MAN', 'EDI', 'GLA', 'LPL', 'BFS', 'NCL', 'CDG', 'LYS', 'NCE', 'MXP', 'FCO', 'NAP', 'GVA', 'BSL', 'BER', 'LIS', 'OPO', 'AMS', 'PMI', 'ALC', 'BCN'], fleet: ['a319', 'a320', 'a320neo', 'a321neo'], reach: 'regional' },
  { iata: 'FR', name: 'Ryanair', country: 'IE', bases: ['DUB', 'ORK', 'SNN', 'STN', 'LTN', 'MAN', 'EDI', 'GLA', 'BHX', 'BRS', 'LPL', 'LBA', 'EMA', 'BFS', 'CWL', 'BCN', 'MAD', 'AGP', 'ALC', 'PMI', 'VLC', 'SVQ', 'TFS', 'LPA', 'ACE', 'IBZ', 'OPO', 'LIS', 'FAO', 'BGY', 'CIA', 'NAP', 'PSA', 'BLQ', 'TSF', 'CRL', 'EIN', 'HHN', 'BER', 'CGN', 'NUE', 'VIE', 'BUD', 'KRK', 'WMI', 'WRO', 'GDN', 'POZ', 'OTP', 'CLJ', 'TSR', 'ARN', 'RIX', 'VNO', 'BVA', 'MRS', 'TLS', 'BOD', 'NTE', 'ATH', 'SKG', 'CHQ', 'RHO', 'ZAG', 'SOF', 'TIA', 'MLA', 'PFO'], fleet: ['b737', 'b737max8'], reach: 'regional' },
  { iata: 'EI', name: 'Aer Lingus', country: 'IE', bases: ['DUB', 'ORK', 'SNN', 'MAN'], fleet: ['a320', 'a320neo', 'a321neo', 'a330'], reach: 'global' },
  { iata: 'BE', name: 'Jet2', country: 'GB', bases: ['LBA', 'MAN', 'STN', 'EDI', 'GLA', 'BHX', 'BRS', 'NCL', 'LPL', 'EMA'], fleet: ['b737', 'a321neo'], reach: 'regional' },
  { iata: 'TOM', name: 'TUI Airways', country: 'GB', bases: ['LGW', 'MAN', 'BHX', 'BRS', 'GLA', 'NCL', 'EMA'], fleet: ['b737max8', 'b787'], reach: 'global' },
  { iata: 'W6', name: 'Wizz Air', country: 'HU', bases: ['BUD', 'OTP', 'CLJ', 'TSR', 'IAS', 'WAW', 'WMI', 'KRK', 'GDN', 'KTW', 'WRO', 'POZ', 'LTN', 'VIE', 'MXP', 'FCO', 'NAP', 'SOF', 'TIA', 'BEG', 'SKP', 'RIX', 'VNO', 'TLL'], fleet: ['a320neo', 'a321neo'], reach: 'regional' },

  // ---- Iberia
  { iata: 'IB', name: 'Iberia', country: 'ES', bases: ['MAD'], fleet: ['a320neo', 'a321neo', 'a330', 'a350'], reach: 'global' },
  { iata: 'VY', name: 'Vueling', country: 'ES', bases: ['BCN', 'MAD', 'ALC', 'VLC', 'SVQ', 'BIO', 'PMI', 'AGP', 'ORY', 'FCO'], fleet: ['a319', 'a320', 'a320neo', 'a321'], reach: 'regional' },
  { iata: 'UX', name: 'Air Europa', country: 'ES', bases: ['MAD', 'PMI'], fleet: ['b737', 'a330neo', 'b787'], reach: 'global' },
  { iata: 'NT', name: 'Binter Canarias', country: 'ES', bases: ['LPA', 'TFN', 'ACE', 'FUE'], fleet: ['atr72', 'e195e2'], reach: 'domestic' },
  { iata: 'TP', name: 'TAP Air Portugal', country: 'PT', bases: ['LIS', 'OPO'], fleet: ['a319', 'a320neo', 'a321neo', 'a321xlr', 'a330neo'], reach: 'global' },
  { iata: 'S4', name: 'Azores Airlines', country: 'PT', bases: ['PDL', 'LIS'], fleet: ['a320neo', 'a321neo'], reach: 'regional' },

  // ---- France, Benelux, Switzerland
  { iata: 'AF', name: 'Air France', country: 'FR', bases: ['CDG', 'ORY'], fleet: ['a220', 'a320', 'a321', 'a330', 'a350', 'b777', 'b787'], reach: 'global' },
  { iata: 'TO', name: 'Transavia France', country: 'FR', bases: ['ORY', 'NTE', 'LYS', 'MRS', 'MPL'], fleet: ['b737', 'a320neo'], reach: 'regional' },
  { iata: 'KL', name: 'KLM', country: 'NL', bases: ['AMS'], fleet: ['b737', 'a320neo', 'a321neo', 'a330', 'b777', 'b787'], reach: 'global' },
  { iata: 'HV', name: 'Transavia', country: 'NL', bases: ['AMS', 'RTM', 'EIN'], fleet: ['b737', 'a320neo'], reach: 'regional' },
  { iata: 'SN', name: 'Brussels Airlines', country: 'BE', bases: ['BRU'], fleet: ['a319', 'a320', 'a330'], reach: 'global' },
  { iata: 'LX', name: 'SWISS', country: 'CH', bases: ['ZRH', 'GVA'], fleet: ['a220', 'a320neo', 'a321neo', 'a330', 'b777'], reach: 'global' },
  { iata: 'LG', name: 'Luxair', country: 'LU', bases: ['LUX'], fleet: ['q400', 'b737'], reach: 'regional' },

  // ---- Germany, Austria, Central Europe
  { iata: 'LH', name: 'Lufthansa', country: 'DE', bases: ['FRA', 'MUC'], fleet: ['a319', 'a320neo', 'a321neo', 'a330', 'a350', 'b747', 'b787'], reach: 'global' },
  { iata: 'EW', name: 'Eurowings', country: 'DE', bases: ['DUS', 'CGN', 'HAM', 'STR', 'BER', 'PMI', 'PRG'], fleet: ['a319', 'a320neo', 'a321neo'], reach: 'regional' },
  { iata: 'DE', name: 'Condor', country: 'DE', bases: ['FRA', 'DUS', 'MUC'], fleet: ['a320neo', 'a321neo', 'a330neo'], reach: 'global' },
  { iata: 'OS', name: 'Austrian Airlines', country: 'AT', bases: ['VIE'], fleet: ['e195e2', 'a320neo', 'a321neo', 'b767', 'b777'], reach: 'global' },
  { iata: 'OK', name: 'Czech Airlines', country: 'CZ', bases: ['PRG'], fleet: ['a320'], reach: 'regional' },
  { iata: 'LO', name: 'LOT Polish Airlines', country: 'PL', bases: ['WAW', 'KRK'], fleet: ['e190', 'e195e2', 'b737max8', 'b787'], reach: 'global' },

  // ---- Nordics & Baltics
  { iata: 'SK', name: 'SAS', country: 'SE', bases: ['CPH', 'ARN', 'OSL'], fleet: ['a320neo', 'a321neo', 'a330', 'a350'], reach: 'global' },
  { iata: 'DY', name: 'Norwegian', country: 'NO', bases: ['OSL', 'BGO', 'TRD', 'SVG', 'TOS', 'CPH', 'ARN', 'HEL'], fleet: ['b737', 'b737max8'], reach: 'regional' },
  { iata: 'WF', name: 'Widerøe', country: 'NO', bases: ['BGO', 'TOS', 'BOO'], fleet: ['q400', 'e190'], reach: 'domestic' },
  { iata: 'AY', name: 'Finnair', country: 'FI', bases: ['HEL'], fleet: ['a320neo', 'a321neo', 'a330', 'a350'], reach: 'global' },
  { iata: 'FI', name: 'Icelandair', country: 'IS', bases: ['KEF'], fleet: ['b737max8', 'b757', 'b767'], reach: 'global' },
  { iata: 'BT', name: 'airBaltic', country: 'LV', bases: ['RIX', 'TLL', 'VNO'], fleet: ['a220'], reach: 'regional' },
  { iata: 'D8', name: 'Norwegian Air Sweden', country: 'SE', bases: ['ARN', 'GOT'], fleet: ['b737'], reach: 'regional' },

  // ---- Italy, Greece, the Balkans, Malta
  { iata: 'AZ', name: 'ITA Airways', country: 'IT', bases: ['FCO', 'MXP', 'LIN'], fleet: ['a220', 'a320neo', 'a321neo', 'a330neo', 'a350'], reach: 'global' },
  { iata: 'A3', name: 'Aegean Airlines', country: 'GR', bases: ['ATH', 'SKG'], fleet: ['a320neo', 'a321neo'], reach: 'regional' },
  { iata: 'OA', name: 'Olympic Air', country: 'GR', bases: ['ATH'], fleet: ['atr72', 'q400'], reach: 'domestic' },
  { iata: 'KM', name: 'KM Malta Airlines', country: 'MT', bases: ['MLA'], fleet: ['a320neo'], reach: 'regional' },
  { iata: 'OU', name: 'Croatia Airlines', country: 'HR', bases: ['ZAG'], fleet: ['q400', 'a220'], reach: 'regional' },
  { iata: 'JU', name: 'Air Serbia', country: 'RS', bases: ['BEG'], fleet: ['atr72', 'a319', 'a320neo', 'a330'], reach: 'global' },

  // ---- Romania & eastern Europe
  { iata: 'RO', name: 'TAROM', country: 'RO', bases: ['OTP'], fleet: ['atr72', 'b737', 'b737max8'], reach: 'regional' },
  { iata: 'H4', name: 'HiSky', country: 'RO', bases: ['OTP', 'CLJ'], fleet: ['a320neo'], reach: 'regional' },
  { iata: 'PS', name: 'Ukraine International', country: 'UA', bases: ['KBP'], fleet: ['b737', 'e195e2'], reach: 'regional' },

  // ---- Turkey, the Gulf, the Middle East
  { iata: 'TK', name: 'Turkish Airlines', country: 'TR', bases: ['IST', 'SAW', 'AYT'], fleet: ['a320neo', 'a321neo', 'b737max8', 'a330', 'a350', 'b777', 'b787'], reach: 'global' },
  { iata: 'PC', name: 'Pegasus Airlines', country: 'TR', bases: ['SAW', 'IST', 'AYT', 'ADB'], fleet: ['a320neo', 'a321neo'], reach: 'regional' },
  { iata: 'EK', name: 'Emirates', country: 'AE', bases: ['DXB'], fleet: ['b777', 'a380', 'a350'], reach: 'global' },
  { iata: 'EY', name: 'Etihad Airways', country: 'AE', bases: ['AUH'], fleet: ['a320neo', 'a321neo', 'a350', 'b787', 'b777'], reach: 'global' },
  { iata: 'QR', name: 'Qatar Airways', country: 'QA', bases: ['DOH'], fleet: ['a320', 'a350', 'b777', 'b787'], reach: 'global' },
  { iata: 'LY', name: 'EL AL', country: 'IL', bases: ['TLV'], fleet: ['b737', 'b787'], reach: 'global' },
  { iata: 'MS', name: 'EgyptAir', country: 'EG', bases: ['CAI'], fleet: ['a320neo', 'b737max8', 'a330', 'b787'], reach: 'global' },
  { iata: 'RJ', name: 'Royal Jordanian', country: 'JO', bases: ['AMM'], fleet: ['e195e2', 'a320neo', 'b787'], reach: 'global' },

  // ---- Africa
  { iata: 'AT', name: 'Royal Air Maroc', country: 'MA', bases: ['CMN', 'RAK'], fleet: ['b737max8', 'b787'], reach: 'global' },
  { iata: 'TU', name: 'Tunisair', country: 'TN', bases: ['TUN'], fleet: ['a320neo'], reach: 'regional' },
  { iata: 'ET', name: 'Ethiopian Airlines', country: 'ET', bases: ['ADD'], fleet: ['b737max8', 'a350', 'b787', 'b777'], reach: 'global' },
  { iata: 'KQ', name: 'Kenya Airways', country: 'KE', bases: ['NBO'], fleet: ['e190', 'b737', 'b787'], reach: 'global' },
  { iata: 'SA', name: 'South African Airways', country: 'ZA', bases: ['JNB', 'CPT'], fleet: ['a320', 'a330'], reach: 'global' },

  // ---- North America
  { iata: 'AA', name: 'American Airlines', country: 'US', bases: ['DFW', 'CLT', 'ORD', 'PHL', 'MIA', 'PHX', 'LAX', 'JFK'], fleet: ['a319', 'a320', 'a321neo', 'b737max8', 'b777', 'b787'], reach: 'global' },
  { iata: 'DL', name: 'Delta Air Lines', country: 'US', bases: ['ATL', 'DTW', 'MSP', 'SLC', 'JFK', 'LAX', 'SEA', 'BOS'], fleet: ['a220', 'a320', 'a321neo', 'b737max8', 'a330neo', 'a350', 'b767'], reach: 'global' },
  { iata: 'UA', name: 'United Airlines', country: 'US', bases: ['ORD', 'DEN', 'IAH', 'EWR', 'SFO', 'LAX', 'IAD'], fleet: ['a319', 'a320', 'b737max8', 'b767', 'b777', 'b787'], reach: 'global' },
  { iata: 'B6', name: 'JetBlue', country: 'US', bases: ['JFK', 'BOS', 'FLL', 'MCO'], fleet: ['a220', 'a320', 'a321neo', 'a321xlr'], reach: 'global' },
  { iata: 'WN', name: 'Southwest Airlines', country: 'US', bases: ['DAL', 'HOU', 'MDW', 'DEN', 'LAS', 'PHX', 'BWI'], fleet: ['b737', 'b737max8'], reach: 'domestic' },
  { iata: 'AS', name: 'Alaska Airlines', country: 'US', bases: ['SEA', 'PDX', 'ANC', 'SFO', 'LAX'], fleet: ['b737max8', 'e175'], reach: 'domestic' },
  { iata: 'AC', name: 'Air Canada', country: 'CA', bases: ['YYZ', 'YUL', 'YVR', 'YYC'], fleet: ['a220', 'a320', 'a321neo', 'b737max8', 'a330', 'b777', 'b787'], reach: 'global' },
  { iata: 'WS', name: 'WestJet', country: 'CA', bases: ['YYC', 'YYZ', 'YVR', 'YEG'], fleet: ['b737', 'b737max8', 'b787'], reach: 'global' },
  { iata: 'AM', name: 'Aeroméxico', country: 'MX', bases: ['MEX', 'GDL', 'MTY'], fleet: ['b737max8', 'b787'], reach: 'global' },

  // ---- Latin America
  { iata: 'LA', name: 'LATAM', country: 'CL', bases: ['SCL', 'GRU', 'LIM', 'BOG'], fleet: ['a320neo', 'a321neo', 'b767', 'b777', 'b787'], reach: 'global' },
  { iata: 'AD', name: 'Azul', country: 'BR', bases: ['VCP', 'CNF', 'GRU'], fleet: ['e195e2', 'a320neo', 'a330neo'], reach: 'global' },
  { iata: 'G3', name: 'GOL', country: 'BR', bases: ['GRU', 'GIG', 'CGH', 'BSB'], fleet: ['b737', 'b737max8'], reach: 'regional' },
  { iata: 'AV', name: 'Avianca', country: 'CO', bases: ['BOG', 'MDE', 'SAL'], fleet: ['a320neo', 'b787'], reach: 'global' },
  { iata: 'AR', name: 'Aerolíneas Argentinas', country: 'AR', bases: ['EZE', 'AEP'], fleet: ['b737max8', 'a330'], reach: 'global' },

  // ---- Asia & Oceania
  { iata: 'SQ', name: 'Singapore Airlines', country: 'SG', bases: ['SIN'], fleet: ['a350', 'b777', 'b787', 'a380'], reach: 'global' },
  { iata: 'CX', name: 'Cathay Pacific', country: 'HK', bases: ['HKG'], fleet: ['a330', 'a350', 'b777'], reach: 'global' },
  { iata: 'JL', name: 'Japan Airlines', country: 'JP', bases: ['HND', 'NRT', 'KIX'], fleet: ['a350', 'b767', 'b777', 'b787'], reach: 'global' },
  { iata: 'NH', name: 'ANA', country: 'JP', bases: ['HND', 'NRT'], fleet: ['a320neo', 'b767', 'b777', 'b787', 'a380'], reach: 'global' },
  { iata: 'KE', name: 'Korean Air', country: 'KR', bases: ['ICN', 'GMP'], fleet: ['a220', 'b737max8', 'a330', 'b777', 'b787', 'a380'], reach: 'global' },
  { iata: 'TG', name: 'Thai Airways', country: 'TH', bases: ['BKK'], fleet: ['a320', 'a350', 'b777', 'b787'], reach: 'global' },
  { iata: 'MH', name: 'Malaysia Airlines', country: 'MY', bases: ['KUL'], fleet: ['b737max8', 'a330neo', 'a350'], reach: 'global' },
  { iata: 'GA', name: 'Garuda Indonesia', country: 'ID', bases: ['CGK', 'DPS'], fleet: ['b737', 'a330', 'b777'], reach: 'global' },
  { iata: 'VN', name: 'Vietnam Airlines', country: 'VN', bases: ['SGN', 'HAN'], fleet: ['a321neo', 'a350', 'b787'], reach: 'global' },
  { iata: 'AI', name: 'Air India', country: 'IN', bases: ['DEL', 'BOM', 'BLR'], fleet: ['a320neo', 'a321neo', 'b777', 'b787'], reach: 'global' },
  { iata: '6E', name: 'IndiGo', country: 'IN', bases: ['DEL', 'BOM', 'BLR', 'HYD', 'MAA'], fleet: ['a320neo', 'a321neo', 'atr72'], reach: 'regional' },
  { iata: 'CZ', name: 'China Southern', country: 'CN', bases: ['CAN', 'PEK', 'PVG'], fleet: ['a320neo', 'a330', 'a350', 'b787', 'a380'], reach: 'global' },
  { iata: 'MU', name: 'China Eastern', country: 'CN', bases: ['PVG', 'SHA', 'KMG'], fleet: ['a320neo', 'a330', 'a350', 'b777'], reach: 'global' },
  { iata: 'CA', name: 'Air China', country: 'CN', bases: ['PEK', 'PKX', 'CTU'], fleet: ['a320neo', 'a330', 'a350', 'b777', 'b787'], reach: 'global' },
  { iata: 'QF', name: 'Qantas', country: 'AU', bases: ['SYD', 'MEL', 'BNE', 'PER'], fleet: ['b737', 'a330', 'a380', 'b787'], reach: 'global' },
  { iata: 'JQ', name: 'Jetstar', country: 'AU', bases: ['MEL', 'SYD', 'BNE', 'OOL'], fleet: ['a320neo', 'a321neo', 'b787'], reach: 'global' },
  { iata: 'VA', name: 'Virgin Australia', country: 'AU', bases: ['BNE', 'SYD', 'MEL'], fleet: ['b737', 'b737max8'], reach: 'regional' },
  { iata: 'NZ', name: 'Air New Zealand', country: 'NZ', bases: ['AKL', 'CHC', 'WLG'], fleet: ['a320neo', 'a321neo', 'b787'], reach: 'global' },

  // ==================================================================
  // THE SECOND PASS: THE CARRIERS THAT SERVE THE SMALL FIELDS.
  //
  // The airport table doubled (see the note in lib/airports) and a regional
  // airport with nothing based at it produces an empty shortlist, which is the
  // one outcome this whole file exists to avoid. These are the operators that
  // actually fly to Stornoway, Bergerac, Lampedusa and Vagar - almost all of
  // them small, almost all of them the ONLY answer for their airports, which
  // is what makes them worth more per row than another global flag carrier.
  //
  // Also here: the low-cost carriers that were already in the table but whose
  // base lists stopped at the majors. A base list is the whole of a low-cost
  // airline's route network in this model, so a missing base is a missing
  // country.
  // ==================================================================

  // ---- UK, Ireland and the islands
  { iata: 'LM', name: 'Loganair', country: 'GB', bases: ['GLA', 'EDI', 'ABZ', 'INV', 'KOI', 'LSI', 'SYY', 'NCL', 'MAN'], fleet: ['atr72', 'e175'], reach: 'regional' },
  { iata: 'GR', name: 'Aurigny', country: 'GG', bases: ['GCI'], fleet: ['atr72', 'e195e2'], reach: 'regional' },
  { iata: 'SI', name: 'Blue Islands', country: 'JE', bases: ['JER', 'GCI'], fleet: ['atr72'], reach: 'regional' },
  { iata: 'WX', name: 'Emerald Airlines', country: 'IE', bases: ['DUB', 'BHD'], fleet: ['atr72'], reach: 'regional' },
  { iata: 'LS', name: 'Jet2 Leeds', country: 'GB', bases: ['LBA', 'BFS', 'LTN', 'BOH', 'LGW'], fleet: ['b737', 'a321neo'], reach: 'regional' },

  // ---- Continental Europe, regional and leisure
  { iata: 'V7', name: 'Volotea', country: 'ES', bases: ['NTE', 'BOD', 'LYS', 'MRS', 'TLS', 'STR', 'VCE', 'NAP', 'PMO', 'CAG', 'OLB', 'OVD', 'BIO', 'VRN'], fleet: ['a319', 'a320'], reach: 'regional' },
  { iata: 'YW', name: 'Air Nostrum', country: 'ES', bases: ['MAD', 'VLC', 'BCN', 'LEI', 'MLN', 'PNA', 'BJZ'], fleet: ['crj900', 'atr72'], reach: 'regional' },
  { iata: 'XQ', name: 'SunExpress', country: 'TR', bases: ['AYT', 'ADB', 'IST', 'ESB'], fleet: ['b737max8'], reach: 'regional' },
  { iata: 'VF', name: 'AJet', country: 'TR', bases: ['ESB', 'SAW', 'AYT'], fleet: ['a320neo', 'a321neo'], reach: 'regional' },
  { iata: 'XC', name: 'Corendon Airlines', country: 'TR', bases: ['AYT', 'AMS', 'DUS'], fleet: ['b737max8'], reach: 'regional' },
  { iata: 'GQ', name: 'Sky Express', country: 'GR', bases: ['ATH', 'HER', 'SKG'], fleet: ['atr72', 'a320neo'], reach: 'regional' },
  { iata: 'XR', name: 'Marabu', country: 'EE', bases: ['MUC', 'DUS', 'HAJ'], fleet: ['a320neo', 'a321neo'], reach: 'regional' },
  { iata: 'OB', name: 'Play', country: 'IS', bases: ['KEF'], fleet: ['a320neo', 'a321neo'], reach: 'regional' },
  { iata: 'N0', name: 'Norse Atlantic', country: 'NO', bases: ['OSL', 'LGW'], fleet: ['b787'], reach: 'global' },
  { iata: 'E9', name: 'Iberojet', country: 'ES', bases: ['MAD', 'PMI'], fleet: ['a330neo'], reach: 'global' },
  { iata: 'WB', name: 'World2Fly', country: 'ES', bases: ['MAD', 'PMI'], fleet: ['a350'], reach: 'global' },
  { iata: 'WK', name: 'Edelweiss Air', country: 'CH', bases: ['ZRH'], fleet: ['a320neo', 'a350'], reach: 'global' },
  { iata: '2L', name: 'Helvetic Airways', country: 'CH', bases: ['ZRH', 'BRN'], fleet: ['e190', 'e195e2'], reach: 'regional' },
  { iata: 'EN', name: 'Air Dolomiti', country: 'IT', bases: ['VRN', 'MUC', 'FCO'], fleet: ['e195e2'], reach: 'regional' },
  { iata: 'XZ', name: 'Aeroitalia', country: 'IT', bases: ['FCO', 'MXP', 'CTA', 'AHO', 'OLB'], fleet: ['b737', 'atr72'], reach: 'regional' },
  { iata: 'XO', name: 'SkyAlps', country: 'IT', bases: ['VRN', 'TRS'], fleet: ['q400'], reach: 'regional' },
  { iata: 'XK', name: 'Air Corsica', country: 'FR', bases: ['AJA', 'BIA', 'FSC'], fleet: ['atr72', 'a320neo'], reach: 'regional' },
  { iata: 'A5', name: 'HOP', country: 'FR', bases: ['ORY', 'LYS', 'CDG'], fleet: ['crj900', 'e190'], reach: 'regional' },
  { iata: 'SS', name: 'Corsair', country: 'FR', bases: ['ORY'], fleet: ['a330neo'], reach: 'global' },
  { iata: 'BF', name: 'French Bee', country: 'FR', bases: ['ORY'], fleet: ['a350'], reach: 'global' },
  { iata: 'TX', name: 'Air Caraibes', country: 'FR', bases: ['ORY'], fleet: ['a350'], reach: 'global' },
  { iata: 'UU', name: 'Air Austral', country: 'RE', bases: ['RUN'], fleet: ['b787', 'atr72'], reach: 'global' },
  { iata: 'QS', name: 'Smartwings', country: 'CZ', bases: ['PRG', 'BRQ', 'OSR', 'KSC', 'BTS'], fleet: ['b737', 'b737max8'], reach: 'regional' },
  { iata: 'E4', name: 'Enter Air', country: 'PL', bases: ['WAW', 'KTW', 'POZ', 'WRO', 'GDN'], fleet: ['b737', 'b737max8'], reach: 'regional' },
  { iata: '6Y', name: 'Air Montenegro', country: 'ME', bases: ['TGD', 'TIV'], fleet: ['e195e2', 'atr72'], reach: 'regional' },
  { iata: 'ZB', name: 'Air Albania', country: 'AL', bases: ['TIA'], fleet: ['a320'], reach: 'regional' },
  { iata: 'FB', name: 'Bulgaria Air', country: 'BG', bases: ['SOF', 'VAR', 'BOJ'], fleet: ['e190', 'a320neo'], reach: 'regional' },
  { iata: '0B', name: 'Blue Air', country: 'RO', bases: ['OTP', 'CLJ', 'BCM'], fleet: ['b737'], reach: 'regional' },
  { iata: 'RC', name: 'Atlantic Airways', country: 'FO', bases: ['FAE'], fleet: ['a320neo'], reach: 'regional' },
  { iata: 'DX', name: 'DAT', country: 'DK', bases: ['AAL', 'AAR', 'BLL', 'CPH'], fleet: ['atr72'], reach: 'regional' },
  { iata: 'N7', name: 'Nordica', country: 'EE', bases: ['TLL', 'TAY'], fleet: ['crj900'], reach: 'regional' },
  { iata: '8S', name: 'Turkish Regional', country: 'TR', bases: ['IST', 'TZX', 'ASR', 'ADA'], fleet: ['a320neo'], reach: 'regional' },

  // ---- Africa and the Indian Ocean
  { iata: 'MK', name: 'Air Mauritius', country: 'MU', bases: ['MRU'], fleet: ['a330neo', 'a350', 'atr72'], reach: 'global' },
  { iata: 'HM', name: 'Air Seychelles', country: 'SC', bases: ['SEZ'], fleet: ['a320neo'], reach: 'regional' },
  { iata: 'TC', name: 'Air Tanzania', country: 'TZ', bases: ['DAR', 'JRO', 'ZNZ'], fleet: ['q400', 'b787'], reach: 'global' },
  { iata: '4Z', name: 'Airlink', country: 'ZA', bases: ['JNB', 'CPT', 'DUR'], fleet: ['e190', 'e175'], reach: 'regional' },
  { iata: 'FA', name: 'FlySafair', country: 'ZA', bases: ['JNB', 'CPT', 'DUR'], fleet: ['b737'], reach: 'domestic' },
  { iata: 'VR', name: 'TACV Cabo Verde', country: 'CV', bases: ['SID', 'RAI'], fleet: ['b737', 'atr72'], reach: 'regional' },
  { iata: 'MD', name: 'Madagascar Airlines', country: 'MG', bases: ['TNR'], fleet: ['atr72', 'a350'], reach: 'regional' },

  // ---- Asia and the Pacific
  { iata: 'AK', name: 'AirAsia', country: 'MY', bases: ['KUL', 'PEN', 'BKI', 'DMK', 'CGK', 'DPS', 'CEB'], fleet: ['a320neo', 'a321neo'], reach: 'regional' },
  { iata: 'D7', name: 'AirAsia X', country: 'MY', bases: ['KUL'], fleet: ['a330'], reach: 'global' },
  { iata: 'TR', name: 'Scoot', country: 'SG', bases: ['SIN'], fleet: ['a320neo', 'b787'], reach: 'global' },
  { iata: '5J', name: 'Cebu Pacific', country: 'PH', bases: ['MNL', 'CEB', 'DVO'], fleet: ['a320neo', 'a321neo', 'atr72', 'a330'], reach: 'regional' },
  { iata: 'VJ', name: 'VietJet Air', country: 'VN', bases: ['SGN', 'HAN', 'DAD'], fleet: ['a320neo', 'a321neo', 'a330'], reach: 'regional' },
  { iata: 'FD', name: 'Thai AirAsia', country: 'TH', bases: ['DMK', 'CNX', 'HKT'], fleet: ['a320neo'], reach: 'regional' },
  { iata: 'SL', name: 'Thai Lion Air', country: 'TH', bases: ['DMK'], fleet: ['b737', 'a330'], reach: 'regional' },
  { iata: 'JX', name: 'STARLUX Airlines', country: 'TW', bases: ['TPE'], fleet: ['a321neo', 'a330neo', 'a350'], reach: 'global' },
  { iata: 'IT', name: 'Tigerair Taiwan', country: 'TW', bases: ['TPE', 'KHH'], fleet: ['a320neo'], reach: 'regional' },
  { iata: 'MM', name: 'Peach Aviation', country: 'JP', bases: ['KIX', 'NRT', 'OKA'], fleet: ['a320neo'], reach: 'regional' },
  { iata: '7C', name: 'Jeju Air', country: 'KR', bases: ['ICN', 'CJU', 'PUS'], fleet: ['b737', 'b737max8'], reach: 'regional' },
  { iata: 'TW', name: "T'way Air", country: 'KR', bases: ['ICN', 'GMP', 'CJU'], fleet: ['b737', 'a330'], reach: 'regional' },
  { iata: 'HU', name: 'Hainan Airlines', country: 'CN', bases: ['PEK', 'CAN', 'SZX'], fleet: ['b737max8', 'a330', 'b787'], reach: 'global' },
  { iata: 'MF', name: 'Xiamen Airlines', country: 'CN', bases: ['XMN', 'PEK', 'CAN'], fleet: ['b737max8', 'b787'], reach: 'global' },
  { iata: 'UL', name: 'SriLankan Airlines', country: 'LK', bases: ['CMB'], fleet: ['a320neo', 'a330'], reach: 'global' },
  { iata: 'Q2', name: 'Maldivian', country: 'MV', bases: ['MLE'], fleet: ['atr72', 'a320'], reach: 'regional' },
  { iata: 'KB', name: 'Drukair', country: 'BT', bases: ['PBH'], fleet: ['a320neo', 'atr72'], reach: 'regional' },
  { iata: 'SG', name: 'SpiceJet', country: 'IN', bases: ['DEL', 'BOM', 'HYD', 'CCU'], fleet: ['b737max8', 'q400'], reach: 'regional' },
  { iata: 'QP', name: 'Akasa Air', country: 'IN', bases: ['BOM', 'DEL', 'BLR'], fleet: ['b737max8'], reach: 'regional' },
  { iata: 'FZ', name: 'flydubai', country: 'AE', bases: ['DXB'], fleet: ['b737max8'], reach: 'regional' },
  { iata: 'G9', name: 'Air Arabia', country: 'AE', bases: ['SHJ', 'RKT', 'CMN'], fleet: ['a320neo', 'a321neo'], reach: 'regional' },
  { iata: 'WY', name: 'Oman Air', country: 'OM', bases: ['MCT', 'SLL'], fleet: ['b737max8', 'b787'], reach: 'global' },
  { iata: 'XY', name: 'flynas', country: 'SA', bases: ['RUH', 'JED', 'DMM'], fleet: ['a320neo'], reach: 'regional' },
  { iata: 'SV', name: 'Saudia', country: 'SA', bases: ['JED', 'RUH', 'DMM', 'MED'], fleet: ['a320neo', 'a330', 'b787', 'b777'], reach: 'global' },
  { iata: 'GF', name: 'Gulf Air', country: 'BH', bases: ['BAH'], fleet: ['a320neo', 'a321neo', 'b787'], reach: 'global' },
  { iata: 'KU', name: 'Kuwait Airways', country: 'KW', bases: ['KWI'], fleet: ['a320neo', 'a330neo', 'b777'], reach: 'global' },
  { iata: 'FJ', name: 'Fiji Airways', country: 'FJ', bases: ['NAN'], fleet: ['a350', 'b737max8', 'atr72'], reach: 'global' },
  { iata: 'SB', name: 'Aircalin', country: 'NC', bases: ['NOU'], fleet: ['a320neo', 'a330neo'], reach: 'regional' },
  { iata: 'TN', name: 'Air Tahiti Nui', country: 'PF', bases: ['PPT'], fleet: ['b787'], reach: 'global' },
  { iata: 'QH', name: 'Air Vanuatu', country: 'VU', bases: ['VLI'], fleet: ['atr72', 'b737'], reach: 'regional' },
  { iata: 'RX', name: 'Regional Express', country: 'AU', bases: ['SYD', 'MEL', 'ADL', 'CBR'], fleet: ['b737', 'atr72'], reach: 'domestic' },

  // ---- The Americas
  { iata: 'NK', name: 'Spirit Airlines', country: 'US', bases: ['FLL', 'MCO', 'DTW', 'LAS', 'DFW'], fleet: ['a320neo', 'a321neo'], reach: 'regional' },
  { iata: 'F9', name: 'Frontier Airlines', country: 'US', bases: ['DEN', 'MCO', 'LAS', 'PHX'], fleet: ['a320neo', 'a321neo'], reach: 'regional' },
  { iata: 'HA', name: 'Hawaiian Airlines', country: 'US', bases: ['HNL', 'OGG', 'KOA'], fleet: ['a321neo', 'a330'], reach: 'global' },
  { iata: 'Y4', name: 'Volaris', country: 'MX', bases: ['MEX', 'GDL', 'TIJ'], fleet: ['a320neo', 'a321neo'], reach: 'regional' },
  { iata: 'VB', name: 'Viva', country: 'MX', bases: ['MTY', 'MEX', 'GDL'], fleet: ['a320neo'], reach: 'regional' },
  { iata: 'CM', name: 'Copa Airlines', country: 'PA', bases: ['PTY'], fleet: ['b737max8'], reach: 'global' },
  { iata: 'H2', name: 'SKY Airline', country: 'CL', bases: ['SCL', 'LIM'], fleet: ['a320neo', 'a321neo'], reach: 'regional' },
  { iata: 'JA', name: 'JetSMART', country: 'CL', bases: ['SCL', 'EZE', 'LIM'], fleet: ['a320neo', 'a321neo'], reach: 'regional' },
  { iata: 'BW', name: 'Caribbean Airlines', country: 'TT', bases: ['POS', 'BGI', 'KIN'], fleet: ['b737max8', 'atr72'], reach: 'regional' },
  { iata: 'PD', name: 'Porter Airlines', country: 'CA', bases: ['YTZ', 'YOW', 'YHZ', 'YYZ'], fleet: ['e195e2', 'q400'], reach: 'regional' },
  { iata: 'TS', name: 'Air Transat', country: 'CA', bases: ['YUL', 'YYZ'], fleet: ['a321neo', 'a330'], reach: 'global' },
]

// Fill in the derived bits once, at module load: a Set for O(1) base lookups
// and the longest range in the fleet, which is the only fleet fact the route
// filter needs.
export const AIRLINES = RAW_AIRLINES.map((a) => {
  const fleet = a.fleet.map(aircraft).filter(Boolean)
  return {
    ...a,
    fleet,
    baseSet: new Set(a.bases),
    maxRange: fleet.reduce((m, f) => Math.max(m, f.range), 0),
  }
})

const BY_IATA = new Map(AIRLINES.map((a) => [a.iata, a]))
export const airlineByCode = (code) => BY_IATA.get(String(code || '').toUpperCase()) || null
export const airlineByName = (name) => {
  const n = String(name || '').trim().toLowerCase()
  return AIRLINES.find((a) => a.name.toLowerCase() === n) || null
}

// Rough continent groupings, only precise enough to answer "is this airline's
// continent the same as this airport's". A regional carrier flying between two
// airports on its own continent is plausible; one flying between two on the
// other side of the world is not, whatever its aircraft could manage.
const CONTINENT = {
  EU: ['GB', 'IE', 'FR', 'ES', 'PT', 'IT', 'DE', 'AT', 'CH', 'NL', 'BE', 'LU', 'DK', 'SE', 'NO', 'FI', 'IS', 'EE', 'LV', 'LT', 'PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'GR', 'HR', 'SI', 'RS', 'BA', 'ME', 'MK', 'AL', 'MT', 'CY', 'TR', 'UA', 'MD', 'BY', 'RU', 'GE', 'AM', 'AZ'],
  NA: ['US', 'CA', 'MX', 'CU', 'DO', 'JM', 'CR', 'PA', 'GT', 'BS', 'BB', 'TT', 'PR'],
  SA: ['BR', 'AR', 'CL', 'PE', 'CO', 'EC', 'UY', 'PY', 'BO', 'VE'],
  AF: ['MA', 'DZ', 'TN', 'EG', 'ZA', 'KE', 'ET', 'NG', 'GH', 'TZ', 'UG', 'SN', 'CI', 'MU', 'SC', 'NA', 'BW', 'ZW', 'CV'],
  AS: ['CN', 'JP', 'KR', 'HK', 'TW', 'SG', 'MY', 'TH', 'VN', 'ID', 'PH', 'IN', 'PK', 'BD', 'LK', 'NP', 'AE', 'QA', 'SA', 'OM', 'KW', 'BH', 'JO', 'IL', 'LB', 'IQ', 'IR', 'KZ', 'UZ', 'MV'],
  OC: ['AU', 'NZ', 'FJ', 'PG', 'NC', 'PF'],
}
const CONTINENT_OF = {}
for (const [k, list] of Object.entries(CONTINENT)) for (const c of list) CONTINENT_OF[c] = k
export const continentOf = (iso2) => CONTINENT_OF[iso2] || null

/**
 * Who plausibly flies between two airports, best first.
 *
 * THE RULES, IN THE ORDER THEY MATTER
 *
 *   BOTH ENDS ARE BASES        the strongest signal there is. An airline based
 *                              at Dublin and at Oslo flies Dublin to Oslo; that
 *                              is what a base pair means.
 *   ONE END IS A BASE          a carrier reaches out from its bases, so one end
 *                              plus a destination within its reach is the
 *                              ordinary case for most flights ever taken.
 *   IT IS THE FLAG CARRIER     an airline based in the country of one end,
 *                              serving its own country, even if this exact
 *                              airport is not in the base list. This is what
 *                              catches the small national airports.
 *
 * And two hard filters, applied to all of them:
 *
 *   RANGE      no aircraft in the fleet can reach, no suggestion. This is what
 *              stops Ryanair being offered for London to Sydney: it is not an
 *              opinion about Ryanair, it is what a 737 can do.
 *   REACH      a domestic operator is only offered inside its own country and a
 *              regional one only within its continent, whatever its fleet could
 *              physically manage.
 *
 * @param {{iata:string,country:string}} from
 * @param {{iata:string,country:string}} to
 * @param {number} km great-circle distance
 * @returns {Array<{airline, score:number, why:string}>}
 */
export function routeAirlines(from, to, km) {
  if (!from || !to) return []
  const out = []
  const cFrom = continentOf(from.country)
  const cTo = continentOf(to.country)

  for (const a of AIRLINES) {
    // A 5% margin on range: published maxima are for still air with a full
    // tank, and a real routing is never the great circle.
    if (a.maxRange < km * 1.05) continue

    if (a.reach === 'domestic' && !(a.country === from.country && a.country === to.country)) continue
    if (a.reach === 'regional') {
      const home = continentOf(a.country)
      if (!home || home !== cFrom || home !== cTo) continue
    }

    const atFrom = a.baseSet.has(from.iata)
    const atTo = a.baseSet.has(to.iata)
    const homeEnd = a.country === from.country ? from : a.country === to.country ? to : null

    // ON HOME GROUND. Both ends inside the airline's own country is the extra
    // half-point that puts the flag carrier above the pan-European low-cost
    // airline on a domestic route. Both really do fly Lisbon to Porto, and TAP
    // is the answer somebody is more likely to be looking for there - whereas
    // on Dublin to Oslo, where neither is at home, base count is the better
    // guide and Ryanair rightly leads.
    const home = a.country === from.country && a.country === to.country ? 0.5 : 0

    if (atFrom && atTo) {
      out.push({ airline: a, score: 3 + home, why: `Based at both ${from.iata} and ${to.iata}` })
    } else if (atFrom || atTo) {
      out.push({ airline: a, score: 2 + home, why: `Based at ${atFrom ? from.iata : to.iata}` })
    } else if (homeEnd) {
      out.push({ airline: a, score: 1, why: `Flies from its home country` })
    }
  }

  // Best evidence first, then the bigger airline (more bases is a decent proxy
  // for "more likely to be the one you flew"), then alphabetically so the list
  // is stable between renders rather than shuffling on every keystroke.
  return out.sort(
    (x, y) => y.score - x.score
      || y.airline.bases.length - x.airline.bases.length
      || x.airline.name.localeCompare(y.airline.name),
  )
}

/**
 * Which of an airline's aircraft would actually be sent on this distance,
 * likeliest first.
 *
 * Range is a floor, not a target: everything that cannot reach is out, and then
 * the SMALLEST aircraft that can is the likeliest, because that is how airlines
 * assign metal. A 787 can fly Dublin to Oslo and never does.
 */
export function aircraftFor(airline, km) {
  if (!airline) return []
  return airline.fleet
    .filter((f) => f.range >= km * 1.05)
    .sort((a, b) => a.range - b.range || a.seats - b.seats)
}

/** Every aircraft type in the table that could physically fly the distance. */
export function anyAircraftFor(km) {
  return Object.entries(AIRCRAFT)
    .map(([key, v]) => ({ key, ...v }))
    .filter((f) => f.range >= km * 1.05)
    .sort((a, b) => a.range - b.range)
}
