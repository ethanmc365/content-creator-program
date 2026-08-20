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
    """A GLOBE, BECAUSE A SQUARE TILE CANNOT HOLD A FLAT WORLD HONESTLY.

    WHAT WAS HERE. An equirectangular map with a 1.7x VERTICAL STRETCH baked in,
    and a comment defending it: a true flat world is 360 wide by 141 tall once
    Antarctica is out, so drawn to scale in a square it is a band across the
    middle with two thirds of the icon empty. That reasoning is sound and the
    conclusion was still wrong - Ethan: "it should be actual world map with
    correct proportions, currently it looks squashed." Stretching latitude by
    1.7 makes Africa tall and thin and Greenland enormous, and at 60px what you
    notice is not "the world", it is that something is off.

    The square tile was the real constraint, and a globe answers it exactly. An
    orthographic projection of a sphere IS a circle: it fills a square tile
    edge to edge, every continent keeps its true shape, and nothing is stretched
    to make it fit. It is also the more legible icon at 60px, because the
    silhouette is a circle rather than a rectangle of noise.

    Centred on 20N 10E, which is the view that puts Africa in the middle with
    Europe above it, the Americas on the left limb and Asia on the right - the
    most recognisable single face of the planet.
    """
    if 'r' not in _cache: _cache['r'] = land_rings()
    rings = _cache['r']

    lat0, lon0 = math.radians(20.0), math.radians(10.0)
    R = size * 0.455
    cx = cy = size / 2.0
    sin0, cos0 = math.sin(lat0), math.cos(lat0)

    def vec(lon, lat):
        """Point on the unit sphere. Longitudes are already in degrees here."""
        la, lo = math.radians(lat), math.radians(lon)
        return (math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la))

    # The viewing direction, as a vector, so "is this point on the near side"
    # is one dot product rather than a spherical-trig special case.
    V = vec(math.degrees(lon0), math.degrees(lat0))

    def dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

    def norm(a):
        m = math.sqrt(dot(a, a)) or 1.0
        return (a[0] / m, a[1] / m, a[2] / m)

    def screen(v):
        """Orthographic. x is east of centre, y is south of centre (PNG rows go
        down), both scaled by the globe's radius."""
        x, y, z = v
        # East and north basis vectors at the centre of the projection.
        ex, ey = -math.sin(lon0), math.cos(lon0)
        e = x * ex + y * ey
        n = -sin0 * math.cos(lon0) * x - sin0 * math.sin(lon0) * y + cos0 * z
        return (cx + e * R, cy - n * R)

    out = []

    # NO LIMB OUTLINE, AND NO CLOSING ARC ALONG IT.
    #
    # Both were tried and both were wrong for the same reason: the filler uses
    # NONZERO winding, so every extra ring interacts with every other one. An
    # annulus for the globe's edge inverted whatever land crossed it, and
    # closing a clipped continent by slerping along the limb takes the SHORT arc
    # between the two crossings - which for a landmass spanning a wide slice of
    # the horizon is the wrong way round, and paints a sweep of white across the
    # ocean. (Those were the arcs over the Arctic.)
    #
    # What is left is the honest minimum: land on the near side, cut at the
    # horizon, closed straight. The chord that leaves is at most a few pixels
    # off the limb at this size because the rings are densified first, and the
    # circle of the globe is drawn by the coastlines themselves.

    for r in rings:
        # Densify first. Clipping happens on the near/far boundary, and a ring
        # whose vertices are ten degrees apart crosses that boundary in one
        # long step - so the entry and exit points land far from where the
        # coastline actually meets the horizon.
        dense = []
        for i in range(len(r)):
            lon_a, lat_a = r[i]
            lon_b, lat_b = r[(i + 1) % len(r)]
            d = max(abs(lon_b - lon_a), abs(lat_b - lat_a))
            n = max(1, min(64, int(d / 1.5)))
            for k in range(n):
                t = k / n
                dense.append(vec(lon_a + (lon_b - lon_a) * t, lat_a + (lat_b - lat_a) * t))
        if not dense: continue

        # Sutherland-Hodgman against the plane dot(P, V) = 0: keep the near side,
        # and put every crossing exactly on the limb.
        clipped = []
        for i in range(len(dense)):
            a, b = dense[i], dense[(i + 1) % len(dense)]
            da, db = dot(a, V), dot(b, V)
            if da >= 0: clipped.append(a)
            if (da >= 0) != (db >= 0):
                t = da / (da - db)
                clipped.append(norm((a[0] + (b[0] - a[0]) * t,
                                     a[1] + (b[1] - a[1]) * t,
                                     a[2] + (b[2] - a[2]) * t)))
        if len(clipped) < 3: continue

        pts = [screen(v) for v in clipped]

        # TWO TIDY-UPS, BOTH ABOUT WHAT SURVIVES CLIPPING.
        #
        # Numerical drift at the horizon can put a crossing point a hair outside
        # the limb, which paints a whisker off the edge of the globe, so every
        # point is clamped back onto the disc.
        #
        # And a ring that comes out of the clipper as a sliver - the far tip of
        # something almost entirely round the back, or an islet a fraction of a
        # pixel across - is speckle rather than geography. Those were the flecks
        # over the Arctic. Anything whose bounding box is under a pixel goes.
        fixed = []
        for x, y in pts:
            dx, dy = x - cx, y - cy
            d = math.hypot(dx, dy)
            if d > R and d > 0:
                x, y = cx + dx / d * R, cy + dy / d * R
            fixed.append((x, y))
        xs = [p[0] for p in fixed]; ys = [p[1] for p in fixed]
        if max(xs) - min(xs) < 1.0 and max(ys) - min(ys) < 1.0: continue
        out.append(fixed)

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
