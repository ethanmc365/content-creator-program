#!/usr/bin/env python3
"""Generate the Worldwide globe icon's path data from the world atlas.

The icon in src/components/Icon.jsx is a real orthographic projection of real
coastlines, not a drawing. Re-run this to change the viewpoint or the level of
detail, then paste the contents of /tmp/globe_path.txt into WorldIcon's <path>.

    python3 scripts/gen-world-icon.py

LON0/LAT0 set which face of the planet you are looking at. The simplify
tolerance and the area floor trade fidelity against path length: at 24px there
is no point keeping a coastline finer than about a third of a viewBox unit, and
the whole world has to stay small enough to inline everywhere the icon appears.
"""

import json, math

topo = json.load(open('public/geo/countries-50m.json'))
sc, tr = topo['transform']['scale'], topo['transform']['translate']

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

# Orthographic globe, Atlantic-centred: Americas left, Europe/Africa right.
LON0, LAT0, R, CX, CY = -30.0, 18.0, 9.1, 12.0, 12.0
r0, p0 = math.radians(LON0), math.radians(LAT0)

def project(lon, lat):
    lam, phi = math.radians(lon) - r0, math.radians(lat)
    cosc = math.sin(p0)*math.sin(phi) + math.cos(p0)*math.cos(phi)*math.cos(lam)
    if cosc < 0:
        return None                      # far side of the planet
    x = CX + R * math.cos(phi) * math.sin(lam)
    y = CY - R * (math.cos(p0)*math.sin(phi) - math.sin(p0)*math.cos(phi)*math.cos(lam))
    return (x, y)

def perp(p, a, b):
    (x, y), (x1, y1), (x2, y2) = p, a, b
    dx, dy = x2-x1, y2-y1
    if dx == dy == 0: return math.hypot(x-x1, y-y1)
    t = max(0, min(1, ((x-x1)*dx + (y-y1)*dy) / (dx*dx + dy*dy)))
    return math.hypot(x - (x1+t*dx), y - (y1+t*dy))

def simplify(pts, tol):
    if len(pts) < 3: return pts
    dmax, idx = 0, 0
    for i in range(1, len(pts)-1):
        d = perp(pts[i], pts[0], pts[-1])
        if d > dmax: dmax, idx = d, i
    if dmax > tol:
        return simplify(pts[:idx+1], tol)[:-1] + simplify(pts[idx:], tol)
    return [pts[0], pts[-1]]

def area(pts):
    s = 0
    for i in range(len(pts)):
        x1, y1 = pts[i]; x2, y2 = pts[(i+1) % len(pts)]
        s += x1*y2 - x2*y1
    return abs(s) / 2

polys = []
for g in topo['objects']['countries']['geometries']:
    rings = [g['arcs']] if g['type'] == 'Polygon' else g.get('arcs', [])
    for poly in rings:
        outer = ring(poly[0]) if g['type'] == 'Polygon' else ring(poly[0])
        pr = [project(lo, la) for lo, la in outer]
        if any(p is None for p in pr):      # straddles the limb; drop it
            continue
        pr = simplify(pr, 0.3)
        if len(pr) < 3 or area(pr) < 0.4:  # too small to read at 24px
            continue
        polys.append(pr)

polys.sort(key=area, reverse=True)
polys = polys[:38]
print('landmasses kept:', len(polys))

def d_of(pts):
    f = lambda v: ('%.1f' % v).rstrip('0').rstrip('.')
    out = 'M' + f(pts[0][0]) + ' ' + f(pts[0][1])
    for x, y in pts[1:]:
        out += 'L' + f(x) + ' ' + f(y)
    return out + 'Z'

d = ''.join(d_of(p) for p in polys)
print('path chars:', len(d))
open('/tmp/globe_path.txt', 'w').write(d)
