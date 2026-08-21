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

WHERE THE DATA COMES FROM. OpenFlights (openflights.org), which is Open Database
Licence. Two files: airports.dat for the fields and routes.dat for which ones
anybody actually flies to. The licence asks for attribution and it is carried in
the JSON itself and printed under the map.

THE TIER IS THE WHOLE POINT, AND ROUTES ARE HOW IT IS DECIDED.

Seven thousand dots drawn at once is not a map, it is a texture - Ethan's brief
was "ensure no airport is missed, but the map doesn't look absolutely cluttered
when it's zoomed out". That needs a measure of importance, and airports.dat does
not carry one: no passenger numbers, no runway count, nothing to sort by. What
does exist is routes.dat, 67,000 scheduled routes, and the number of distinct
routes touching an airport is an excellent proxy for how big it is. Heathrow
comes out near the top and an airstrip in Papua New Guinea comes out at zero,
which is exactly the ordering the map wants.

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
import csv, json, os, sys, re
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AIRPORTS_DAT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/airports.dat'
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
best = {}
with open(AIRPORTS_DAT, newline='', encoding='utf-8') as fh:
    for row in csv.reader(fh):
        if len(row) < 8:
            continue
        name, city, country, iata = row[1].strip(), row[2].strip(), row[3].strip(), row[4].strip()
        kind = row[12].strip() if len(row) > 12 else 'airport'
        if kind and kind != 'airport':
            continue
        if not re.fullmatch(r'[A-Z]{3}', iata):
            continue
        try:
            lat, lng = float(row[6]), float(row[7])
        except ValueError:
            continue
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            continue
        # OpenFlights carries a handful of duplicate IATA codes. Keep whichever
        # one the route table says is real.
        d = degree.get(iata, 0)
        if iata in best and best[iata][0] >= d:
            continue
        best[iata] = (d, name, city, country, lat, lng)

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
iso2_to_name = {}
for code, (_n, _c, iso2, _la, _lo) in curated_rows.items():
    if code in best and iso2 not in iso2_to_name:
        iso2_to_name[iso2] = best[code][3]

missing = sorted(curated - set(best))
for code in missing:
    name, city, iso2, lat, lng = curated_rows[code]
    country = iso2_to_name.get(iso2)
    if not country:
        print('  ! no country name for', code, iso2, '- skipping')
        continue
    best[code] = (degree.get(code, 0), name, city, country, lat, lng)
    print('  + merged from the curated table:', code, name, city, country)
print('curated codes absent from OpenFlights (%d): %s' % (len(missing), missing))
still = sorted(curated - set(best))
assert not still, 'curated airports still missing from the world file: %s' % still

# ---- tidy the names -------------------------------------------------------
def tidy(name, city):
    """"Dublin Airport" in a popup that already says Dublin is noise."""
    n = re.sub(r'\s+', ' ', name).strip()
    n = re.sub(r'\s+(International|Intl\.?)?\s*Airport$', '', n, flags=re.I).strip()
    n = re.sub(r'\s+Airport$', '', n, flags=re.I).strip()
    return n or city or ''

def tier(iata, d):
    if iata in curated or d >= 120: return 0
    if d >= 30: return 1
    if d >= 4: return 2
    return 3

countries, cindex = [], {}
def country_id(name):
    if name not in cindex:
        cindex[name] = len(countries)
        countries.append(name)
    return cindex[name]

rows = []
for iata, (d, name, city, country, lat, lng) in sorted(best.items()):
    rows.append([iata, tidy(name, city), city, country_id(country),
                 round(lat, 3), round(lng, 3), tier(iata, d)])

by_tier = Counter(r[6] for r in rows)
print('countries interned:', len(countries))
print('by tier:', {k: by_tier[k] for k in sorted(by_tier)})

payload = {
    'attribution': 'Airport data from OpenFlights (openflights.org), Open Database Licence.',
    'cols': ['iata', 'name', 'city', 'country', 'lat', 'lng', 'tier'],
    'countries': countries,
    'rows': rows,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))
print('wrote %s  (%.0f KB)' % (OUT, os.path.getsize(OUT) / 1024))
