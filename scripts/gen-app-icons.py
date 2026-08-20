#!/usr/bin/env python3
"""
Generates the alternate home-screen icons in public/icons/<variant>/.

WHY A SCRIPT AND NOT FIVE HAND-DRAWN PNGs.

There is no image toolchain on this machine - no PIL, no sharp, no ImageMagick -
and there is not going to be one just to redraw an app icon. So the artwork is
kept as vectors (the Y traced from the shipped icon, the Tryp plane silhouette
from components/Icon.jsx, the land rings from the atlas the maps already use)
and this file rasterises them with a scanline filler and writes the PNGs with
zlib. Regenerate with:

    python3 scripts/gen-app-icons.py

The DEFAULT icon - orange field, white Y - is NOT produced here. It is the
shipped public/apple-touch-icon-v4.png and friends, and those files are left
exactly as they are: a picker that quietly re-renders the icon somebody already
has on their home screen is not a picker, it is a regression.
"""
import json, math, os, struct, zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'icons')

BRAND = (0xd9, 0x44, 0x07)
INK = (0x1A, 0x1A, 0x1A)
WHITE = (0xff, 0xff, 0xff)

SIZES = [('apple-touch-icon.png', 180), ('icon-192.png', 192), ('icon-512.png', 512)]
SS = 4  # vertical supersampling; horizontal coverage is computed analytically

# ---------------------------------------------------------------- geometry --

# THE Y, TRACED OFF THE SHIPPED ICON RATHER THAN REDRAWN.
# Measured by decoding public/icon-512-v4.png and reading where the white pixels
# start and stop on each row, then fitting the straight edges - so the letter on
# a variant is the same letter, to a fraction of a percent, as the one on the
# icon it sits next to in the picker. Coordinates are percentages of the square.
Y_MARK = [
    (26.3, 23.0), (40.8, 23.0), (50.0, 47.8), (59.2, 23.0), (73.7, 23.0),
    (57.0, 60.2), (57.0, 79.1), (42.2, 79.1), (42.2, 60.2),
]

# The Tryp plane silhouette, lifted verbatim from FILLED_PATHS['plane-tryp'] in
# src/components/Icon.jsx so the icon and the plane on the creator map are one
# drawing. 24x24 user units.
PLANE_PATH = ('M12 1.55 C13.05 1.55 13.71 3.45 13.71 6.11 L13.71 7.82 L21.5 12.95 L21.5 14.95 '
              'L13.71 11.81 L13.71 16.75 L16.18 19.22 L16.18 20.74 L12 19.32 L7.82 20.74 '
              'L7.82 19.22 L10.29 16.75 L10.29 11.81 L2.5 14.95 L2.5 12.95 L10.29 7.82 '
              'L10.29 6.11 C10.29 3.45 10.95 1.55 12 1.55 Z')


def parse_path(d):
    """Minimal SVG path reader: M/L/C/Z, absolute or relative. Enough for the
    plane; deliberately not a general parser."""
    toks, i, n = [], 0, len(d)
    while i < n:
        c = d[i]
        if c.isalpha():
            toks.append(c); i += 1
        elif c in ' ,\n\t':
            i += 1
        else:
            j = i
            if d[j] in '+-': j += 1
            while j < n and (d[j].isdigit() or d[j] == '.'): j += 1
            toks.append(float(d[i:j])); i = j
    rings, ring, cur, start, cmd = [], [], (0.0, 0.0), (0.0, 0.0), None
    k = 0
    while k < len(toks):
        t = toks[k]
        if isinstance(t, str):
            cmd = t; k += 1
            if cmd in 'Zz':
                if len(ring) > 2: rings.append(ring)
                ring, cur = [], start
                continue
        rel = cmd.islower()
        up = cmd.upper()
        if up == 'M':
            x, y = toks[k], toks[k + 1]; k += 2
            if rel: x, y = cur[0] + x, cur[1] + y
            if len(ring) > 2: rings.append(ring)
            ring = [(x, y)]; cur = start = (x, y)
            cmd = 'l' if rel else 'L'
        elif up == 'L':
            x, y = toks[k], toks[k + 1]; k += 2
            if rel: x, y = cur[0] + x, cur[1] + y
            ring.append((x, y)); cur = (x, y)
        elif up == 'C':
            p = toks[k:k + 6]; k += 6
            if rel: p = [cur[i % 2] + v for i, v in enumerate(p)]
            x0, y0 = cur
            for s in range(1, 17):
                u = s / 16.0; v = 1 - u
                ring.append((
                    v ** 3 * x0 + 3 * v * v * u * p[0] + 3 * v * u * u * p[2] + u ** 3 * p[4],
                    v ** 3 * y0 + 3 * v * v * u * p[1] + 3 * v * u * u * p[3] + u ** 3 * p[5],
                ))
            cur = (p[4], p[5])
        else:
            k += 1
    if len(ring) > 2: rings.append(ring)
    return rings


def land_rings():
    """Land silhouettes from the atlas the app's maps already download.
    LAND ONLY: no sea, no graticule, no outline - the rings and nothing else."""
    with open(os.path.join(ROOT, 'public', 'geo', 'countries-50m.json')) as f:
        topo = json.load(f)
    sx, sy = topo['transform']['scale']
    tx, ty = topo['transform']['translate']
    arcs = []
    for arc in topo['arcs']:
        x = y = 0; pts = []
        for dx, dy in arc:
            x += dx; y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)

    def ring(idxs):
        out = []
        for i in idxs:
            a = arcs[~i][::-1] if i < 0 else arcs[i]
            out.extend(a if not out else a[1:])
        return out

    rings = []
    for g in topo['objects']['countries']['geometries']:
        polys = [g['arcs']] if g['type'] == 'Polygon' else g.get('arcs', [])
        for poly in polys:
            for r in poly:
                pts = ring(r)
                if len(pts) > 2: rings.append(pts)
    return rings


# --------------------------------------------------------------- rasteriser --

def rasterise(rings, size, ss=SS):
    """Non-zero scanline fill. `rings` are closed loops in pixel coordinates.
    Returns a size*size bytearray of 0..255 coverage."""
    sh = size * ss
    rows = [[] for _ in range(sh)]
    for r in rings:
        n = len(r)
        for i in range(n):
            x0, y0 = r[i]; x1, y1 = r[(i + 1) % n]
            y0 *= ss; y1 *= ss
            if y0 == y1: continue
            if y0 < y1: ya, yb, xa, xb, w = y0, y1, x0, x1, 1
            else: ya, yb, xa, xb, w = y1, y0, x1, x0, -1
            k0 = max(0, int(math.ceil(ya - 0.5)))
            k1 = min(sh - 1, int(math.ceil(yb - 0.5)) - 1)
            if k1 < k0: continue
            m = (xb - xa) / (yb - ya)
            for k in range(k0, k1 + 1):
                rows[k].append((xa + (k + 0.5 - ya) * m, w))

    cov = bytearray(size * size)
    acc = [0.0] * size
    for py in range(size):
        for i in range(size): acc[i] = 0.0
        for k in range(py * ss, py * ss + ss):
            xs = rows[k]
            if not xs: continue
            xs.sort()
            wind = 0; spanstart = 0.0
            for x, w in xs:
                if wind == 0: spanstart = x
                wind += w
                if wind == 0 and x > spanstart:
                    a = max(spanstart, 0.0); b = min(x, float(size))
                    if b > a:
                        ia, ib = int(a), int(b)
                        if ia == ib:
                            acc[ia] += b - a
                        else:
                            acc[ia] += ia + 1 - a
                            for i in range(ia + 1, ib): acc[i] += 1.0
                            if ib < size: acc[ib] += b - ib
        base = py * size
        for i in range(size):
            v = acc[i] / ss
            cov[base + i] = 255 if v >= 1 else int(v * 255 + 0.5)
    return cov


def write_png(path, size, bg, fg, cov):
    """Flat RGB, no alpha, edge to edge. iOS and Android both apply their own
    corner mask to a home-screen icon, so a square that fills the tile is the
    honest thing to hand them - a rounded corner baked in here would only ever
    be clipped again."""
    stride = size * 3
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter: none
        row = bytearray(stride)
        base = y * size
        for x in range(size):
            a = cov[base + x]
            if a == 0:
                row[x * 3], row[x * 3 + 1], row[x * 3 + 2] = bg
            elif a == 255:
                row[x * 3], row[x * 3 + 1], row[x * 3 + 2] = fg
            else:
                for c in range(3):
                    row[x * 3 + c] = (fg[c] * a + bg[c] * (255 - a) + 127) // 255
        raw += row

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data
                + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))

    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
           + chunk(b'IEND', b''))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f: f.write(png)


# ------------------------------------------------------------------ artwork --

def y_rings(size):
    s = size / 100.0
    return [[(x * s, y * s) for x, y in Y_MARK]]


def plane_rings(size):
    rings = parse_path(PLANE_PATH)
    # Fit the 24-unit drawing to 62% of the tile and centre it on its own bounds
    # rather than on the viewBox: the silhouette is not symmetric top to bottom,
    # and centring the box instead of the plane leaves it visibly low.
    xs = [p[0] for r in rings for p in r]; ys = [p[1] for r in rings for p in r]
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    k = size * 0.62 / max(w, h)
    ox = size / 2 - (min(xs) + w / 2) * k
    oy = size / 2 - (min(ys) + h / 2) * k
    return [[(x * k + ox, y * k + oy) for x, y in r] for r in rings]


def world_rings(size, _cache={}):
    if 'r' not in _cache: _cache['r'] = land_rings()
    rings = _cache['r']
    # Equirectangular, because a flat world map is what was asked for. Clipped
    # north of 84 and south of 57: the atlas already has Antarctica removed, and
    # those bounds are its real extent, so the map fills the tile.
    lat0, lat1 = -57.0, 84.0
    w = size * 0.94
    # STRETCHED IN LATITUDE, ON PURPOSE.
    #
    # A true equirectangular world is 360 wide by 141 tall once Antarctica is
    # out, so drawn to scale in a square tile it is a band a third of the height
    # with two thirds of the icon empty - which at the 60 pixels a home screen
    # actually renders is an orange square with a smudge across the middle.
    # An app icon is not a chart: nobody is measuring anything off it, and the
    # only job is that it reads as the world at a glance. A 1.7x vertical
    # stretch fills the tile and every continent keeps its silhouette.
    h = w * (lat1 - lat0) / 360.0 * 1.7
    ox, oy = (size - w) / 2, (size - h) / 2
    out = []
    for r in rings:
        # THE ANTIMERIDIAN, WHICH RUSSIA SITS ON.
        # Russia is one ring in this atlas and it crosses 180 degrees, so read
        # literally it jumps from +180 to -180 and back - and a filled ring with
        # a jump like that paints a dead-straight white bar right across the
        # ocean at 70 north. Wrangel Island and Fiji do the same. So the ring is
        # unwrapped into continuous longitude first, then drawn at -360, 0 and
        # +360 wherever those copies touch the tile; the rasteriser clips the
        # rest. Chukotka lands on the left edge where it belongs.
        u = [r[0]]
        for lon, lat in r[1:]:
            prev = u[-1][0]
            while lon - prev > 180: lon -= 360
            while lon - prev < -180: lon += 360
            u.append((lon, lat))
        lo = min(p[0] for p in u); hi = max(p[0] for p in u)
        for shift in (-360.0, 0.0, 360.0):
            if lo + shift > 180 or hi + shift < -180: continue
            out.append([(ox + (lon + shift + 180) / 360.0 * w,
                         oy + (lat1 - lat) / (lat1 - lat0) * h) for lon, lat in u])
    return out


# The four alternates. Each is (folder, background, mark colour, ring builder).
VARIANTS = [
    ('mono', WHITE, INK, y_rings),
    ('world', BRAND, WHITE, world_rings),
    ('plane', BRAND, WHITE, plane_rings),
    ('midnight', INK, BRAND, y_rings),
]

MANIFEST = {
    "name": "Content Creator Program",
    "short_name": "Tryp.com",
    "description": "The official Tryp.com Content Creator Program.",
    "start_url": "/home",
    "scope": "/",
    "display": "standalone",
    "orientation": "portrait",
    "background_color": "#ffffff",
    "theme_color": "#d94407",
}

if __name__ == '__main__':
    for name, bg, fg, build in VARIANTS:
        for filename, size in SIZES:
            cov = rasterise(build(size), size)
            write_png(os.path.join(OUT, name, filename), size, bg, fg, cov)
            print('wrote', f'public/icons/{name}/{filename}')
        # A manifest per variant, so swapping <link rel="manifest"> swaps the
        # install icons too. Same fields as the root manifest; only the icons
        # differ, and they must stay absolute or a rescoped install breaks.
        m = dict(MANIFEST, icons=[
            {"src": f"/icons/{name}/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": f"/icons/{name}/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
            {"src": f"/icons/{name}/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ])
        with open(os.path.join(OUT, name, 'manifest.webmanifest'), 'w') as f:
            json.dump(m, f, indent=2)
            f.write('\n')
        print('wrote', f'public/icons/{name}/manifest.webmanifest')
