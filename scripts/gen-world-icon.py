#!/usr/bin/env python3
"""Generate the Worldwide globe icon's path data from the world atlas.

The icon in src/components/Icon.jsx is a real orthographic projection of real
coastlines, not a drawing. Re-run this to change the viewpoint or the level of
detail, then paste the contents of /tmp/globe_path.txt into WorldIcon's <path>.

    python3 scripts/gen-world-icon.py

WHY THIS WAS REWRITTEN (31 Aug 2026)
------------------------------------
The first version DROPPED any polygon that crossed the limb - the visible edge
of the globe - because half its points project to nothing. Africa, Eurasia and
North America all cross the limb at this viewpoint, so all three were thrown
away and what survived was a scatter of whole-but-small islands: the icon read
as specks rather than as continents. Ethan: "I'm still not really happy with how
the worldwide icon looks."

So a polygon that leaves the visible hemisphere is now CLIPPED to it, and the
gap is closed along the limb itself. That is what makes Africa meet the right
edge of the ring and North America meet the top, which is what the reference
image does and what everybody's mental picture of a globe does.

LON0/LAT0 set which face of the planet you are looking at. SIMPLIFY and
MIN_AREA trade fidelity against weight: at 24px there is no point keeping a
coastline finer than about half a viewBox unit, and anything smaller than a
couple of square units is a speck rather than a place.
"""

import json, math

topo = json.load(open('public/geo/countries-50m.json'))
sc, tr = topo['transform']['scale'], topo['transform']['translate']

# Orthographic globe, Atlantic-centred: Americas left, Europe/Africa right.
LON0, LAT0, R, CX, CY = -40.0, 15.0, 9.05, 12.0, 12.0
# Coarse on purpose, and coarser than it was. This is a 20px glyph; every
# extra vertex is noise that reads as a ragged edge rather than as coastline,
# and the reference Ethan matched it against is four bold masses, not a
# coastline survey.
SIMPLIFY = 0.38
# Square viewBox units. Iceland is about 1.5; Great Britain about 4. At 1.0
# the specks go and what is left reads as continents.
MIN_AREA = 1.0

r0, p0 = math.radians(LON0), math.radians(LAT0)


def decode(arc):
    x = y = 0; out = []
    for dx, dy in arc:
        x += dx; y += dy
        out.append((x * sc[0] + tr[0], y * sc[1] + tr[1]))
    return out


ARCS = [decode(a) for a in topo['arcs']]


def ring(idx):
    pts = []
    for i in idx:
        a = ARCS[~i][::-1] if i < 0 else ARCS[i]
        pts.extend(a[1:] if pts else a)
    return pts


def cosc(lon, lat):
    """Cosine of the angular distance from the centre of the view.

    Positive is the near side of the planet, negative the far side, zero is
    exactly on the limb."""
    lam, phi = math.radians(lon) - r0, math.radians(lat)
    return math.sin(p0) * math.sin(phi) + math.cos(p0) * math.cos(phi) * math.cos(lam)


def project(lon, lat):
    lam, phi = math.radians(lon) - r0, math.radians(lat)
    x = CX + R * math.cos(phi) * math.sin(lam)
    y = CY - R * (math.cos(p0) * math.sin(phi) - math.sin(p0) * math.cos(phi) * math.cos(lam))
    return (x, y)


def crossing(a, b):
    """The point on segment a->b that sits exactly on the limb.

    Bisection rather than algebra: it is a handful of iterations on a few
    hundred segments, and it cannot be got subtly wrong."""
    lo, hi = a, b
    flo = cosc(*lo)
    for _ in range(28):
        mid = ((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2)
        if (cosc(*mid) >= 0) == (flo >= 0):
            lo = mid
        else:
            hi = mid
    return ((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2)


def angle_of(p):
    return math.atan2(p[1] - CY, p[0] - CX)


def arc_points(p_from, p_to):
    """Walk the limb from one point to another, the short way round.

    Every hidden run of a coastline is replaced by the piece of the horizon it
    disappeared behind, which is what you would actually see. The short way is
    right whenever a landmass hides less than half the globe's edge, which is
    every landmass at every viewpoint worth using."""
    a0, a1 = angle_of(p_from), angle_of(p_to)
    d = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
    steps = max(2, int(abs(d) / 0.18))
    return [(CX + R * math.cos(a0 + d * i / steps), CY + R * math.sin(a0 + d * i / steps))
            for i in range(1, steps)]


def clip(lonlats):
    """Project a ring, clipped to the visible hemisphere. None if wholly hidden."""
    n = len(lonlats)
    vis = [cosc(lo, la) >= 0 for lo, la in lonlats]
    if not any(vis):
        return None
    if all(vis):
        return [project(*p) for p in lonlats]

    out = []          # (kind, point) where kind is 'land' or 'limb'
    for i in range(n):
        a, b = lonlats[i], lonlats[(i + 1) % n]
        if vis[i]:
            out.append(('land', project(*a)))
        if vis[i] != vis[(i + 1) % n]:
            out.append(('limb', project(*crossing(a, b))))
    if not out:
        return None

    # Close every gap between a point where the coast went over the horizon and
    # the point where it came back.
    pts, m = [], len(out)
    for i in range(m):
        kind, p = out[i]
        pts.append(p)
        nxt_kind, nxt_p = out[(i + 1) % m]
        if kind == 'limb' and nxt_kind == 'limb':
            pts.extend(arc_points(p, nxt_p))
    return pts


def perp(p, a, b):
    (x, y), (x1, y1), (x2, y2) = p, a, b
    dx, dy = x2 - x1, y2 - y1
    if dx == dy == 0:
        return math.hypot(x - x1, y - y1)
    t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    return math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))


def simplify(pts, tol):
    if len(pts) < 3:
        return pts
    dmax, idx = 0, 0
    for i in range(1, len(pts) - 1):
        d = perp(pts[i], pts[0], pts[-1])
        if d > dmax:
            dmax, idx = d, i
    if dmax > tol:
        return simplify(pts[:idx + 1], tol)[:-1] + simplify(pts[idx:], tol)
    return [pts[0], pts[-1]]


def area(pts):
    s = 0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2


polys = []
for g in topo['objects']['countries']['geometries']:
    rings = [g['arcs']] if g['type'] == 'Polygon' else g.get('arcs', [])
    for poly in rings:
        pr = clip(ring(poly[0]))
        if not pr:
            continue
        pr = simplify(pr, SIMPLIFY)
        if len(pr) < 3 or area(pr) < MIN_AREA:
            continue
        polys.append(pr)

polys.sort(key=area, reverse=True)
print('landmasses kept:', len(polys))
for p in polys[:12]:
    print('  area %.1f  verts %d' % (area(p), len(p)))


def d_of(pts):
    f = lambda v: ('%.1f' % v).rstrip('0').rstrip('.')
    out = 'M' + f(pts[0][0]) + ' ' + f(pts[0][1])
    for x, y in pts[1:]:
        out += 'L' + f(x) + ' ' + f(y)
    return out + 'Z'


d = ''.join(d_of(p) for p in polys)
print('path chars:', len(d))
open('/tmp/globe_path.txt', 'w').write(d)
