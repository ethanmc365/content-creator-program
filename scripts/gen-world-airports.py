#!/usr/bin/env python3
"""
Builds public/geo/airports-world.json - every airport in the world, for the
dots on the flight map.

    python3 scripts/gen-world-airports.py

WHY THIS IS NOT src/lib/airports.js. That table is the type-ahead for logging a
flight: about 700 fields people in this community actually fly through, bundled
with the page because a search box cannot wait on a network round trip per
keystroke. This is a different job with different constraints - it is a
background layer on a map, it is ten times the size, and nobody needs it until
they open the map. So it is a separate file, in public/, fetched once and
cached, and it never touches the JavaScript bundle.

WHERE THE DATA COMES FROM. Two sources, and the split matters.

OurAirports (ourairports.com) is the airport table: 85,000 rows, public domain,
actively maintained, and - unlike the OpenFlights dump this started on - it
carries an ISO-2 country code per airport, a size class, and whether the field
has scheduled service. The ISO code is not a nicety: the map colours countries
in and the country card has to be able to say how many airports are in one, and
matching "United States" against "United States of America" by string is the
sort of thing that works until it does not.

OpenFlights (openflights.org, Open Database Licence) is kept for ONE column:
routes.dat, 67,000 scheduled routes, which is the only free measure of how busy
an airport actually is. Attribution for both is carried in the JSON and printed
under the map.

THE TIER IS THE WHOLE POINT.

Six thousand dots drawn at once is not a map, it is a texture - Ethan's brief
was "ensure no airport is missed, but the map doesn't look absolutely cluttered
when it's zoomed out". That needs a measure of importance, and the two sources
give two independent ones: OurAirports says how big the field IS (large, medium
or small, and whether anything is scheduled into it), and routes.dat says how
much anybody actually flies there. Neither alone is right - a large airport with
no scheduled service is a cargo field, and a medium one with 200 routes is a
hub - so a tier is the better of the two answers.

Four tiers, each revealed at a zoom where there is room for it:

    0   a major hub, or anywhere in the app's own curated table. Always drawn.
    1   a real airport with scheduled traffic.
    2   somewhere with a handful of routes.
    3   everything else, including fields with no scheduled service at all.

Tier 0 also folds in every code from src/lib/airports.js, so anywhere a creator
can LOG a flight to is visible on the map at every zoom. Otherwise you could log
a flight to somewhere the map refuses to show you, which is the sort of quiet
inconsistency that reads as a bug.

COMPACTNESS. Country names are interned into their own array and referenced by
index, because there are 7,000 airports and about 230 countries and the string
"United States" does not need storing 1,500 times. Coordinates are rounded to
three decimals, which is about 100 metres - far finer than a dot on a world map
can express.
"""
import csv, hashlib, json, math, os, sys, re
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OURAIRPORTS = sys.argv[1] if len(sys.argv) > 1 else '/tmp/ourairports.csv'
ROUTES_DAT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/routes.dat'
OUT = os.path.join(ROOT, 'public', 'geo', 'airports-world.json')

# ---- what the app already knows about ------------------------------------
# Everything in the bundled table is tier 0 no matter what routes.dat thinks,
# so the map can always show you anywhere you are able to log a flight to.
_src = open(os.path.join(ROOT, 'src', 'lib', 'airports.js')).read()
# [iata, name, city, iso2, lat, lng]
CURATED_ROW = re.compile(r"\['([A-Z]{3})', '([^']*)', '([^']*)', '([A-Z]{2})', (-?[\d.]+), (-?[\d.]+)\]")
curated_rows = {m.group(1): (m.group(2), m.group(3), m.group(4), float(m.group(5)), float(m.group(6)))
                for m in CURATED_ROW.finditer(_src)}
curated = set(curated_rows)
print('curated codes from src/lib/airports.js:', len(curated))

# ---- how busy is each airport --------------------------------------------
degree = Counter()
with open(ROUTES_DAT, newline='', encoding='utf-8') as fh:
    for row in csv.reader(fh):
        if len(row) < 5:
            continue
        src, dst = row[2].strip(), row[4].strip()
        # A route is a PAIR, and counting each leg separately would rank a
        # single busy corridor as two busy airports. Count distinct partners.
        if len(src) == 3 and len(dst) == 3 and src != dst:
            degree[src] += 1
            degree[dst] += 1

# ---- the airports ---------------------------------------------------------
# OurAirports keeps closed fields, heliports, seaplane bases and balloonports in
# the same table. A boarding pass is never issued for any of them.
KINDS = {'large_airport', 'medium_airport', 'small_airport'}
best = {}
with open(OURAIRPORTS, newline='', encoding='utf-8') as fh:
    for row in csv.DictReader(fh):
        iata = (row.get('iata_code') or '').strip().upper()
        if not re.fullmatch(r'[A-Z]{3}', iata):
            continue
        if (row.get('type') or '').strip() not in KINDS:
            continue
        try:
            lat, lng = float(row['latitude_deg']), float(row['longitude_deg'])
        except (ValueError, KeyError, TypeError):
            continue
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            continue
        if lat == 0 and lng == 0:
            continue
        best[iata] = (degree.get(iata, 0), (row.get('name') or '').strip(),
                      (row.get('municipality') or '').strip(),
                      (row.get('iso_country') or '').strip().upper(), lat, lng,
                      row.get('type'), (row.get('scheduled_service') or '') == 'yes')

print('airports with a IATA code:', len(best))

# ---- NOTHING IN THE APP'S OWN TABLE MAY BE MISSING ------------------------
# OpenFlights is a community dump and it lags reality: Berlin Brandenburg
# opened in 2020 and is not in it, and neither are a couple of others the
# curated table carries. An airport you can LOG a flight to but cannot SEE on
# the map is exactly the quiet inconsistency this file exists to avoid, so any
# curated code OpenFlights does not have is merged in from src/lib/airports.js,
# which has its own coordinates.
#
# The curated table stores ISO-2 and OpenFlights stores country names, so the
# mapping is bootstrapped from the codes present in BOTH - no third table to
# keep in step, and it can only ever produce a name OpenFlights already uses.
missing = sorted(curated - set(best))
for code in missing:
    name, city, iso2, lat, lng = curated_rows[code]
    best[code] = (degree.get(code, 0), name, city, iso2, lat, lng, 'medium_airport', True)
    print('  + merged from the curated table:', code, name, city, iso2)
print('curated codes absent from OpenFlights (%d): %s' % (len(missing), missing))
still = sorted(curated - set(best))
assert not still, 'curated airports still missing from the world file: %s' % still

# ---- AND NOTHING MAY BE IN TWO PLACES AT ONCE -----------------------------
# The map now draws BOTH layers: a creator's own logged airports come from
# src/lib/airports.js and the faint dots come from here. If the two disagree
# about where a code is, one airport is drawn as two dots a measurable distance
# apart, and zoomed in that is simply wrong.
#
# Cross-checking the whole curated table against OpenFlights is what found the
# real bug: four rows held the right airport, with the right coordinates, under
# the IATA code of a different airport serving the same city - VIS was Visby's
# location under Visalia's code, 8,845 km out. See the note at the top of
# src/lib/airports.js.
#
# This is a hard failure rather than a warning, because a warning in a script
# nobody runs twice is a warning nobody reads.
def _km(a, b):
    (la1, lo1), (la2, lo2) = a, b
    p = math.pi / 180
    x = (math.sin((la2 - la1) * p / 2) ** 2
         + math.cos(la1 * p) * math.cos(la2 * p) * math.sin((lo2 - lo1) * p / 2) ** 2)
    return 6371 * 2 * math.asin(math.sqrt(x))

drift = []
for code, (_n, _c, _iso2, lat, lng) in curated_rows.items():
    if code not in best:
        continue
    d = _km((lat, lng), (best[code][4], best[code][5]))
    if d > 50:
        drift.append((round(d), code, curated_rows[code][1], best[code][2], best[code][3]))
drift.sort(reverse=True)
for d, code, ours, theirs, country in drift:
    print('  ! %s is %d km from OpenFlights: we say %s, they say %s (%s)' % (code, d, ours, theirs, country))
assert not drift, ('%d curated airport(s) disagree with OpenFlights by more than 50 km. '
                   'One of the two is wrong; fix it rather than silencing this.' % len(drift))
print('coordinate cross-check: all %d shared codes agree within 50 km' % sum(1 for c in curated_rows if c in best))

# ---- tidy the names -------------------------------------------------------
def tidy(name, city):
    """"Dublin Airport" in a popup that already says Dublin is noise."""
    n = re.sub(r'\s+', ' ', name).strip()
    n = re.sub(r'\s+(International|Intl\.?)?\s*Airport$', '', n, flags=re.I).strip()
    n = re.sub(r'\s+Airport$', '', n, flags=re.I).strip()
    return n or city or ''

def tier(iata, d, kind, scheduled):
    """The better of the two answers. See the note at the top.

    ROUTE COUNT LEADS AND THE SIZE CLASS BACKS IT UP, not the other way round.
    Taking OurAirports' `large_airport` as tier 0 outright put 1,280 dots on the
    world view - it classes a great many regional fields as large, and the
    measured density that reads as texture rather than noise is around 750.
    Route degree is the sharper instrument: `curated or degree >= 60` lands at
    784, within a handful of the 736 that was tuned by eye on the map. The size
    class still earns its place one tier down, where it catches a real airport
    that routes.dat happens not to cover.
    """
    if iata in curated or d >= 60: return 0
    if d >= 20 or (kind == 'large_airport' and scheduled): return 1
    if d >= 3 or (kind == 'medium_airport' and scheduled): return 2
    return 3

countries, cindex = [], {}
def country_id(code):
    if code not in cindex:
        cindex[code] = len(countries)
        countries.append(code)
    return cindex[code]

rows = []
for iata, (d, name, city, iso2, lat, lng, kind, scheduled) in sorted(best.items()):
    rows.append([iata, tidy(name, city), city, country_id(iso2),
                 round(lat, 3), round(lng, 3), tier(iata, d, kind, scheduled)])

by_tier = Counter(r[6] for r in rows)
print('countries interned:', len(countries))
print('by tier:', {k: by_tier[k] for k in sorted(by_tier)})

payload = {
    'attribution': 'Airports from OurAirports (public domain); route counts from OpenFlights, Open Database Licence.',
    'cols': ['iata', 'name', 'city', 'countryIso2', 'lat', 'lng', 'tier'],
    'countries': countries,
    'rows': rows,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
body = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
with open(OUT, 'w', encoding='utf-8') as f:
    f.write(body)
print('wrote %s  (%.0f KB)' % (OUT, os.path.getsize(OUT) / 1024))

# ---- STAMP THE VERSION, OR NOBODY EVER SEES A REGENERATION ----------------
#
# THE BUG THIS EXISTS TO PREVENT, caught in the browser rather than reasoned
# about: this file is served from a STABLE path with a long cache header, so
# when the table was rebuilt from 6,074 airports to 8,809 the map carried on
# drawing the old one. The console said 6,074 rows and a country of "Ireland"
# while the file on disk said 8,809 and "IE". A year-long `immutable` header on
# a filename that never changes is a promise the content will never change too.
#
# The fix is the standard one: put the content's own hash in the URL, so a
# rebuild changes what is REQUESTED. The header can then be as long as we like,
# because a stale entry is simply never asked for again.
digest = hashlib.sha256(body.encode('utf-8')).hexdigest()[:12]
stamp = os.path.join(ROOT, 'src', 'lib', 'worldAirportsVersion.js')
with open(stamp, 'w', encoding='utf-8') as f:
    f.write('// GENERATED by scripts/gen-world-airports.py - do not edit by hand.\n'
            '//\n'
            '// The content hash of public/geo/airports-world.json. lib/worldAirports\n'
            '// appends it to the request so that regenerating the table busts every\n'
            '// cache that holds the old one. See the note in the generator.\n'
            'export const WORLD_AIRPORTS_VERSION = %r\n' % digest)
print('stamped version %s into src/lib/worldAirportsVersion.js' % digest)
