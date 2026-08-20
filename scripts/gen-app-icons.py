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


def _split_antimeridian(rings, jump=180.0):
    """Cut rings that wrap the date line into separate rings.

    RUSSIA IS ONE RING OF 4893 POINTS AND IT IS WHY THE ARCTIC WENT WHITE.

    countries-50m stores it as a single closed loop that runs east along the
    Arctic coast to 180, hops the seam to -180 for Chukotka, and comes back. In
    plate-carree coordinates that hop is a single segment 359.9 degrees wide,
    and any straight-line treatment of it - clipping, interpolating, projecting
    - reads it as a coastline stretching across every longitude on Earth at
    about 70N. Clipped to a window over Europe, what is left of that phantom
    segment is a lid over the top of the map, and the fill underneath it turned
    the Norwegian Sea into land.

    So: split at every segment wider than half the world, and close each run on
    itself. The two closing chords both sit within a degree of the date line,
    which is the far side of the planet from anything this icon shows.
    """
    out = []
    for r in rings:
        n = len(r)
        seams = [k for k in range(n) if abs(r[(k + 1) % n][0] - r[k][0]) > jump]
        if not seams:
            out.append(r)
            continue
        for i in range(len(seams)):
            a, b = (seams[i] + 1) % n, seams[(i + 1) % len(seams)]
            run, k = [], a
            while True:
                run.append(r[k])
                if k == b: break
                k = (k + 1) % n
            if len(run) > 2: out.append(run)
    return out


def _clip_lonlat(rings, lon_min, lon_max, lat_min, lat_max):
    """Cut the atlas down to a lon/lat window before anything is projected.

    THIS IS WHAT KILLS THE ARC ACROSS THE ARCTIC, and the bug is worth writing
    down because it is invisible until you probe a pixel.

    The projector clips each ring against the near/far hemisphere and closes
    whatever survives with a STRAIGHT CHORD. For a normal country that chord is
    a few pixels off the horizon and nobody sees it. Russia is not a normal
    country: countries-50m holds it as ONE ring of 4893 points spanning 359.9
    degrees of longitude, from -180 to 179.9, wrapping over the pole. Clipped to
    a hemisphere it comes back as two distant fragments, and the chord joining
    them ran clean across the Norwegian Sea - which is why 0E 68N, open water,
    was painting white.

    Clipping in lon/lat FIRST means nothing ever reaches the horizon, so no
    chord is ever drawn. The window is chosen well outside the tile and well
    inside the near hemisphere: every one of its four edges projects off-screen,
    so the cuts themselves are never visible.
    """
    def inside(p, edge):
        lon, lat = p
        return (lon >= lon_min if edge == 0 else lon <= lon_max if edge == 1
                else lat >= lat_min if edge == 2 else lat <= lat_max)

    def cross(a, b, edge):
        (lon_a, lat_a), (lon_b, lat_b) = a, b
        if edge < 2:
            v = lon_min if edge == 0 else lon_max
            t = (v - lon_a) / (lon_b - lon_a)
            return (v, lat_a + (lat_b - lat_a) * t)
        v = lat_min if edge == 2 else lat_max
        t = (v - lat_a) / (lat_b - lat_a)
        return (lon_a + (lon_b - lon_a) * t, v)

    out = []
    for r in rings:
        lons = [q[0] for q in r]; lats = [q[1] for q in r]
        # Cheap rejection first: most of the atlas is nowhere near the window.
        if max(lons) < lon_min or min(lons) > lon_max: continue
        if max(lats) < lat_min or min(lats) > lat_max: continue
        poly = r
        for edge in range(4):
            if not poly: break
            nxt = []
            for i in range(len(poly)):
                a, b = poly[i], poly[(i + 1) % len(poly)]
                ina, inb = inside(a, edge), inside(b, edge)
                if ina: nxt.append(a)
                if ina != inb: nxt.append(cross(a, b, edge))
            poly = nxt
        if len(poly) > 2: out.append(poly)
    return out


def _orthographic(size, lat0_deg, lon0_deg, R, rings):
    """Land rings projected orthographically onto a tile.

    Orthographic is the projection that does not lie about shape near its
    centre: it is what you would see looking at the globe from very far away,
    so nothing is stretched to make it fit a square. Everything below is
    geometry, and both icons that use it differ only in where the camera is and
    how close it stands.
    """
    cx = cy = size / 2.0
    lat0, lon0 = math.radians(lat0_deg), math.radians(lon0_deg)
    sin0, cos0 = math.sin(lat0), math.cos(lat0)

    def vec(lon, lat):
        la, lo = math.radians(lat), math.radians(lon)
        return (math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la))

    V = vec(lon0_deg, lat0_deg)

    def dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

    def norm(a):
        m = math.sqrt(dot(a, a)) or 1.0
        return (a[0] / m, a[1] / m, a[2] / m)

    def screen(v):
        """x east of centre, y south of centre - PNG rows go down."""
        x, y, z = v
        ex, ey = -math.sin(lon0), math.cos(lon0)
        e = x * ex + y * ey
        n = -sin0 * math.cos(lon0) * x - sin0 * math.sin(lon0) * y + cos0 * z
        return (cx + e * R, cy - n * R)

    out = []
    for r in rings:
        # DENSIFY FIRST. Clipping happens on the near/far boundary, and a ring
        # whose vertices are ten degrees apart crosses that boundary in one long
        # step - so the entry and exit points land far from where the coastline
        # actually meets the horizon.
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

        # Numerical drift at the horizon can put a crossing a hair outside the
        # limb, which paints a whisker off the edge, so clamp back onto the disc.
        fixed = []
        for x, y in [screen(v) for v in clipped]:
            dx, dy = x - cx, y - cy
            d = math.hypot(dx, dy)
            if d > R and d > 0:
                x, y = cx + dx / d * R, cy + dy / d * R
            fixed.append((x, y))

        # A ring that survives as a sliver - the far tip of something round the
        # back, or an islet a fraction of a pixel across - is speckle, not
        # geography. Drop anything whose bounding box is under a pixel, and
        # anything entirely off the tile, which at this zoom is most of the world.
        xs = [q[0] for q in fixed]; ys = [q[1] for q in fixed]
        if max(xs) - min(xs) < 1.0 and max(ys) - min(ys) < 1.0: continue
        if max(xs) < 0 or min(xs) > size or max(ys) < 0 or min(ys) > size: continue
        out.append(fixed)
    return out


def world_rings(size, _cache={}):
    """EUROPE, ZOOMED IN, BECAUSE THE WHOLE WORLD IN A 60px SQUARE IS NOISE.

    THE HISTORY, BECAUSE IT IS THE ARGUMENT.

    First this was an equirectangular map with a 1.7x VERTICAL STRETCH baked in,
    on the reasoning that a true flat world is 360 wide by 141 tall once
    Antarctica is out, so drawn to scale in a square it is a band across the
    middle with two thirds of the tile empty. Sound reasoning, wrong answer:
    stretching latitude makes Africa tall and thin and Greenland enormous, and
    at icon size what you notice is not "the world", it is that something is off.

    Then it was a full globe - orthographic, centred on 20N 10E. That fixed the
    proportions honestly, and Ethan still read it as stretched, which is the
    useful signal here. A whole hemisphere reduced to 60 pixels gives every
    continent about eight pixels of coastline, and eight pixels of coastline is
    not a shape anybody recognises. It is a circle with texture on it, and a
    circle with texture on it looks like whatever you already suspected.

    So: stop drawing the planet and draw somewhere. Centred on 50N 15E at a
    radius of 1.45 tiles, the tile holds roughly 19W to 43E and 34N to 66N -
    Ireland to the Baltics, Sicily to the top of Norway. That is four
    silhouettes anybody can name in an instant (the British Isles, Scandinavia,
    Iberia, the boot of Italy) instead of thirty nobody can, and because it is
    still orthographic near its own centre, nothing is stretched to achieve it.

    It is also the honest icon for this programme, whose markets are European.

    AND IT IS THE ONE VARIANT DRAWN THE OTHER WAY ROUND: orange land on a white
    field, not a white mark on an orange one. Every other icon here is a small
    mark on a full-bleed brand field, which works because the mark is small. A
    map is not small - land covers about 55% of this tile - so on an orange
    field the eye takes the ORANGE for the subject, reads the Mediterranean and
    the Atlantic as the shapes being shown, and the whole thing comes out
    looking like a mistake. Every map anybody has ever looked at puts the ink on
    the land and leaves the water pale, and doing the same here is the
    difference between "a map of Europe" and "an orange tile with white bits".
    """
    if 'r' not in _cache: _cache['r'] = land_rings()
    # NO LIMB OUTLINE AND NO CLOSING ARC ALONG IT. Both were tried on the globe
    # and both were wrong for the same reason: the filler uses NONZERO winding,
    # so every extra ring interacts with every other one. An annulus for the
    # edge inverted whatever land crossed it, and closing a clipped continent by
    # slerping along the limb takes the SHORT arc between the two crossings,
    # which for a wide landmass is the wrong way round and paints a sweep of
    # white across the ocean. Land, cut at the horizon, closed straight.
    # The window: comfortably wider than the tile (which holds about 19W-43E,
    # 30N-70N) and comfortably inside the near hemisphere, so the cuts land
    # off-screen. See _clip_lonlat for why this step is not optional.
    # THE WINDOW IS WIDER THAN THE TILE ON PURPOSE. Its four edges are straight
    # cuts through the atlas, and a straight cut through a coastline looks like
    # a coastline. At 50N/15E with R = 1.15 tiles the tile holds roughly 24W-54E
    # and 25N-75N, so a window of 50W-80E by 15N-85N projects every one of its
    # own edges off-screen. Widen the zoom without widening this and the cuts
    # walk into view as suspiciously straight shores.
    window = _clip_lonlat(_split_antimeridian(_cache['r']), -50.0, 80.0, 15.0, 85.0)
    return _orthographic(size, 50.0, 15.0, size * 1.15, window)


# ------------------------------------------------------------ the camera ----

def _circle(cx, cy, r, n=64, cw=True):
    """A closed circle. `cw` picks the winding, which is how holes are made:
    the filler is NONZERO, so a ring wound against its container cancels it."""
    step = (2 * math.pi) / n
    pts = [(cx + r * math.cos(i * step), cy + r * math.sin(i * step)) for i in range(n)]
    return pts if cw else pts[::-1]


def _rounded_rect(x0, y0, x1, y1, r, n=8):
    """A rounded rectangle, wound the same way as _circle's default."""
    pts = []
    for (cx, cy, a0) in ((x1 - r, y0 + r, -math.pi / 2), (x1 - r, y1 - r, 0.0),
                         (x0 + r, y1 - r, math.pi / 2), (x0 + r, y0 + r, math.pi)):
        for i in range(n + 1):
            a = a0 + (math.pi / 2) * (i / n)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def camera_rings(size):
    """A CAMERA, FOR THE PEOPLE THE PLATFORM IS FOR.

    The sixth icon, and the brief for it was "something travel themed, maybe a
    camera for creators, simple, nothing too detailed". So: body, viewfinder
    hump, lens, shutter light, and nothing else. A strap, a grip or a brand
    plate all turn into grey mush at the size this is actually looked at.

    THE LENS AND THE LIGHT ARE HOLES, NOT SHAPES, and that distinction is the
    whole drawing. The rasteriser fills by NONZERO winding, so a ring wound
    against its container subtracts from it and the background shows through.
    The first attempt drew the lens as a filled disc with a smaller reversed
    disc inside it, aiming for a ring: body +1, disc +1, reversed inner -1, and
    the middle still came out at +1. The icon rendered as a solid white slab
    with no lens at all. One reversed ring on its own is what cuts a hole.
    """
    s_ = size / 100.0
    def at(*a): return [(x * s_, y * s_) for x, y in a]
    body = _rounded_rect(11 * s_, 30 * s_, 89 * s_, 79 * s_, 9 * s_)
    # The hump overlaps the body rather than sitting on it, so the two fills
    # union into one silhouette instead of meeting at a visible seam.
    hump = _rounded_rect(34 * s_, 20 * s_, 62 * s_, 36 * s_, 5 * s_)
    lens = _circle(50 * s_, 55.5 * s_, 16 * s_, cw=False)
    light = _circle(76 * s_, 40 * s_, 4.5 * s_, cw=False)
    return [body, hump, lens, light]


# The five alternates. Each is (folder, background, mark colour, ring builder).
VARIANTS = [
    ('mono', WHITE, INK, y_rings),
    ('world', WHITE, BRAND, world_rings),
    ('plane', BRAND, WHITE, plane_rings),
    ('midnight', INK, BRAND, y_rings),
    ('camera', BRAND, WHITE, camera_rings),
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
