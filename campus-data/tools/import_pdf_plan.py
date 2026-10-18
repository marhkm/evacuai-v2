"""Import UCLM evacuation-plan PDFs (vector posters) into EvacuAI campus data.

Run locally only (the PDFs are gitignored and must never be committed or uploaded):

    python -I campus-data/tools/import_pdf_plan.py campus-data/uclm/A1            # plan + rooms, keeps the graph
    python -I campus-data/tools/draft_graph.py campus-data/uclm/A1                # then draft the routing graph once

Privacy: only geometry inside the plan area and blue room labels inside it are kept. The title block, legend,
logo and the "Prepared / Checked / Approved by" names block lie outside the plan area and are discarded.

Poster conventions (from a survey of the Annex 1 plans): walls black 0.72 pt + gray 0.12 pt strokes, door swings
red curves, fire-escape arrows red fills, stairs orange hatch, room labels blue text. A standard door leaf is
0.9 m, which gives the scale.
"""
from __future__ import annotations

import json
import math
import os
import statistics
import sys
import tempfile
from collections import deque

import pymupdf as fitz

GRAY, BLACK, RED, ORANGE = (0.86, 0.86, 0.86), (0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (0.87, 0.43, 0.0)
BLUE_TEXT = 0x0000FF
DOOR_M = 0.9          # standard door leaf
PX_PER_M = 4          # room flood-fill grid resolution
CLOSE_PX = 3          # walls grown by 0.75 m before flood-fill: doorways up to ~1.5 m without a drawn swing stay closed
NOT_ROOMS = ('OPEN GROUND',)
MARKERS = ('UP', 'DOWN')   # stair direction marks: never part of a room name


def _same(color, ref, tol=0.03) -> bool:
    return color is not None and len(color) == 3 and all(abs(a - b) <= tol for a, b in zip(color, ref))


def _points(item) -> list[fitz.Point]:
    kind = item[0]
    if kind == 'l':
        return [item[1], item[2]]
    if kind == 'c':
        return [item[1], item[2], item[3], item[4]]
    if kind == 're':
        r = item[1]
        return [r.tl, r.tr, r.br, r.bl]
    if kind == 'qu':
        q = item[1]
        return [q.ul, q.ur, q.lr, q.ll]
    return []


def _segments(item) -> list[tuple[fitz.Point, fitz.Point]]:
    kind = item[0]
    if kind == 'l':
        return [(item[1], item[2])]
    if kind in ('re', 'qu'):
        p = _points(item)
        return list(zip(p, p[1:] + p[:1]))
    return []


def _circumcenter(a, b, c):
    d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
    if abs(d) < 1e-9:
        return None
    ux = ((a.x ** 2 + a.y ** 2) * (b.y - c.y) + (b.x ** 2 + b.y ** 2) * (c.y - a.y) + (c.x ** 2 + c.y ** 2) * (a.y - b.y)) / d
    uy = ((a.x ** 2 + a.y ** 2) * (c.x - b.x) + (b.x ** 2 + b.y ** 2) * (a.x - c.x) + (c.x ** 2 + c.y ** 2) * (b.x - a.x)) / d
    return fitz.Point(ux, uy)


def _hull(pts: list[tuple[float, float]]) -> list[tuple[float, float]]:
    pts = sorted(set(pts))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def _simplify(poly: list[tuple[float, float]], max_points: int = 12) -> list[tuple[float, float]]:
    """Drops the vertex whose removal changes the area least until max_points remain."""
    poly = list(poly)
    while len(poly) > max_points:
        best, best_i = None, 0
        for i in range(len(poly)):
            a, b, c = poly[i - 1], poly[i], poly[(i + 1) % len(poly)]
            area = abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]))
            if best is None or area < best:
                best, best_i = area, i
        poly.pop(best_i)
    return poly


def _trace(cells: set[tuple[int, int]]) -> list[tuple[int, int]]:
    """Outer boundary of a 4-connected cell region as grid-corner points (walks the cell edges clockwise)."""
    edges: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for x, y in cells:
        for (ax, ay), (bx, by), (nx, ny) in (((x, y), (x + 1, y), (x, y - 1)), ((x + 1, y), (x + 1, y + 1), (x + 1, y)),
                                              ((x + 1, y + 1), (x, y + 1), (x, y + 1)), ((x, y + 1), (x, y), (x - 1, y))):
            if (nx, ny) not in cells:
                edges.setdefault((ax, ay), []).append((bx, by))
    start = min(edges)  # top-left corner is on the outer boundary
    loop, cur, prev_dir = [start], start, (1, 0)
    while True:
        nexts = edges[cur]
        if len(nexts) > 1:  # pinch point: prefer the right-most turn to stay on the outer boundary
            def turn(n):
                d = (n[0] - cur[0], n[1] - cur[1])
                return (prev_dir[0] * d[1] - prev_dir[1] * d[0], prev_dir[0] * d[0] + prev_dir[1] * d[1])
            nxt = max(nexts, key=turn)
        else:
            nxt = nexts[0]
        nexts.remove(nxt)
        prev_dir = (nxt[0] - cur[0], nxt[1] - cur[1])
        cur = nxt
        if cur == start:
            break
        loop.append(cur)
    return loop


def _rdp(pts: list[tuple[float, float]], eps: float) -> list[tuple[float, float]]:
    """Douglas-Peucker simplification of an open polyline."""
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    seg = math.dist(pts[0], pts[-1]) or 1e-9
    far, idx = 0.0, 0
    for i in range(1, len(pts) - 1):
        d = abs((x2 - x1) * (y1 - pts[i][1]) - (x1 - pts[i][0]) * (y2 - y1)) / seg
        if d > far:
            far, idx = d, i
    if far <= eps:
        return [pts[0], pts[-1]]
    return _rdp(pts[:idx + 1], eps)[:-1] + _rdp(pts[idx:], eps)


def _outline(cells: list[tuple[int, int]], grow_px: int, w: int, h: int) -> list[tuple[float, float]]:
    """Room outline: the region grown back by the wall growth, traced and simplified (concave shapes stay concave)."""
    region = set(cells)
    grown = set(region)
    for x, y in region:
        for dy in range(-grow_px, grow_px + 1):
            for dx in range(-grow_px, grow_px + 1):
                if dx * dx + dy * dy <= grow_px * grow_px and 0 <= x + dx < w and 0 <= y + dy < h:
                    grown.add((x + dx, y + dy))
    loop = [(x / PX_PER_M, y / PX_PER_M) for x, y in _trace(grown)]
    i = min(range(len(loop)), key=lambda k: loop[k])  # split the closed loop at its top-left corner
    loop = loop[i:] + loop[:i]
    k = max(range(len(loop)), key=lambda j: math.dist(loop[0], loop[j]))  # closed loop: simplify two open halves
    return _rdp(loop[:k + 1], 0.4)[:-1] + _rdp(loop[k:] + [loop[0]], 0.4)[:-1]


def _clusters(items: list, key, radius: float) -> list[list]:
    """Groups items whose key points are within radius of any member (single linkage)."""
    groups: list[list] = []
    for it in items:
        pts = key(it)
        hits = [g for g in groups if any(math.dist(p, q) <= radius for m in g for q in key(m) for p in pts)]
        merged = [it] + [m for g in hits for m in g]
        groups = [g for g in groups if g not in hits] + [merged]
    return groups


def _arrow_heading(verts: list[tuple[float, float]], cx: float, cy: float) -> float:
    """Direction an arrow points, in degrees (y down). A bare triangle points at its farthest vertex; an arrow with
    a shaft points toward its wider end (the head), found along the shape's long axis."""
    if len(verts) <= 3:
        tip = max(verts, key=lambda v: math.dist(v, (cx, cy)))
        return math.degrees(math.atan2(tip[1] - cy, tip[0] - cx))
    sxx = sum((x - cx) ** 2 for x, _ in verts)
    syy = sum((y - cy) ** 2 for _, y in verts)
    sxy = sum((x - cx) * (y - cy) for x, y in verts)
    axis = 0.5 * math.atan2(2 * sxy, sxx - syy)  # principal (long) axis
    ux, uy = math.cos(axis), math.sin(axis)
    along = [((x - cx) * ux + (y - cy) * uy, -(x - cx) * uy + (y - cy) * ux) for x, y in verts]
    lo, hi = min(a for a, _ in along), max(a for a, _ in along)
    window = 0.45 * (hi - lo)

    def spread(end_is_hi: bool) -> float:
        side = [p for a, p in along if (a >= hi - window if end_is_hi else a <= lo + window)]
        return max(side) - min(side) if side else 0.0

    return math.degrees(axis if spread(True) >= spread(False) else axis + math.pi)


def plan_area(page: fitz.Page) -> fitz.Rect:
    pts = [p for d in page.get_drawings() if _same(d.get('color'), GRAY) for it in d['items'] for p in _points(it)]
    if not pts:
        raise ValueError('No gray plan outline found: is this an EvacuAI-style evacuation plan?')
    r = fitz.Rect(min(p.x for p in pts), min(p.y for p in pts), max(p.x for p in pts), max(p.y for p in pts))
    dx, dy = r.width * 0.02, r.height * 0.02
    return fitz.Rect(r.x0 - dx, r.y0 - dy, r.x1 + dx, r.y1 + dy)


def door_arcs(page: fitz.Page, area: fitz.Rect) -> list[dict]:
    """Door swings in PDF points: {'hinge', 'r', 'p0', 'p1'}."""
    doors = []
    for d in page.get_drawings():
        curves = [it for it in d['items'] if it[0] == 'c']
        if not curves or not _same(d.get('color'), RED) or d.get('fill') is not None:
            continue
        start, end = curves[0][1], curves[-1][4]
        if len(curves) > 1:
            mid = curves[len(curves) // 2][1]  # start of the middle curve lies on the arc
        else:  # cubic Bézier at t = 0.5
            c = curves[0]
            mid = (c[1] + c[2] * 3 + c[3] * 3 + c[4]) / 8
        if not (area.contains(start) and area.contains(end)):
            continue
        center = _circumcenter(start, mid, end)
        if center is None:
            continue
        r = math.dist(center, start)
        if 5 <= r <= 80:
            doors.append({'hinge': center, 'r': r, 'p0': start, 'p1': end})
    return doors


def extract(pdf_path: str, level: int, name: str, scale: float | None = None) -> dict:
    page = fitz.open(pdf_path)[0]
    area = plan_area(page)
    doors_pt = door_arcs(page, area)
    if scale is None:
        if not doors_pt:
            raise ValueError(f'{pdf_path}: no door swings to derive the scale from; set scale_m_per_pt in import.json')
        scale = DOOR_M / statistics.median(d['r'] for d in doors_pt)

    def m(p) -> list[float]:
        return [round((p.x - area.x0) * scale, 2), round((p.y - area.y0) * scale, 2)]

    drawings = page.get_drawings()

    # Walls: black 0.72 pt and gray 0.12 pt strokes inside the plan area, kept as 2-point segments.
    seen, walls = set(), []
    for d in drawings:
        color, width = d.get('color'), d.get('width') or 0
        if not ((_same(color, BLACK) and abs(width - 0.72) < 0.2) or _same(color, GRAY)) or d.get('fill') is not None:
            continue
        for it in d['items']:
            for a, b in _segments(it):
                if area.contains(a) and area.contains(b):
                    seg = (tuple(m(a)), tuple(m(b)))
                    if math.dist(*seg) >= 0.05 and seg not in seen and seg[::-1] not in seen:
                        seen.add(seg)
                        walls.append([list(seg[0]), list(seg[1])])

    doors = []
    for d in doors_pt:
        a0 = math.degrees(math.atan2(d['p0'].y - d['hinge'].y, d['p0'].x - d['hinge'].x))
        a1 = math.degrees(math.atan2(d['p1'].y - d['hinge'].y, d['p1'].x - d['hinge'].x))
        doors.append({'hinge': m(d['hinge']), 'r': round(d['r'] * scale, 2), 'from': round(a0, 1), 'to': round(a1, 1)})

    # Stairs: orange hatch, clustered into one polygon per stairwell.
    stair_segs = [(a, b) for d in drawings if _same(d.get('color'), ORANGE)
                  for it in d['items'] for a, b in _segments(it) if area.contains(a) and area.contains(b)]
    near = 3 / scale  # 3 m in points
    stairs = [[list(map(lambda v: round(v, 2), p)) for p in _hull([tuple(m(q)) for s in g for q in s])]
              for g in _clusters(stair_segs, lambda s: [(s[0].x, s[0].y), (s[1].x, s[1].y)], near)]
    stairs = [s for s in stairs if len(s) >= 3]

    # Fire-escape arrows: red fills, clustered (head + shaft), pointing from the centroid to the farthest vertex.
    arrow_parts = [[p for it in d['items'] for p in _points(it)] for d in drawings
                   if _same(d.get('fill'), RED) and all(area.contains(p) for it in d['items'] for p in _points(it))]
    arrows = []
    for g in _clusters([p for p in arrow_parts if p], lambda pts: [(q.x, q.y) for q in pts], 1.5 / scale):
        verts = list({(round(q.x, 2), round(q.y, 2)) for pts in g for q in pts})
        cx, cy = sum(v[0] for v in verts) / len(verts), sum(v[1] for v in verts) / len(verts)
        c = m(fitz.Point(cx, cy))
        arrows.append({'x': c[0], 'y': c[1], 'deg': round(_arrow_heading(verts, cx, cy), 1)})

    labels = _labels(page, area, m)
    rooms = _rooms(walls, doors, labels, area, scale)
    return {
        'level': level, 'name': name, 'scale_m_per_pt': scale,
        'plan': {'walls': walls, 'doors': doors, 'stairs': stairs, 'labels': labels, 'arrows': arrows},
        'rooms': rooms,
    }


def _labels(page: fitz.Page, area: fitz.Rect, m) -> list[dict]:
    spans = []
    for block in page.get_text('dict')['blocks']:
        for line in block.get('lines', []):
            for sp in line['spans']:
                text = ' '.join(sp['text'].split())
                if sp['color'] != BLUE_TEXT or not text:
                    continue
                box = fitz.Rect(sp['bbox'])
                if area.contains(fitz.Point((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2)):
                    spans.append({'text': text, 'box': box, 'size': sp['size']})
    spans.sort(key=lambda s: (s['box'].y0, s['box'].x0))
    groups: list[list[dict]] = []
    for sp in spans:
        cx = (sp['box'].x0 + sp['box'].x1) / 2
        for g in groups:
            last = g[-1]
            lcx = (last['box'].x0 + last['box'].x1) / 2
            same_size = abs(sp['size'] - last['size']) < 0.6
            same_line = abs(sp['box'].y0 - last['box'].y0) < 0.5 * sp['size'] and 0 <= sp['box'].x0 - last['box'].x1 < 0.6 * sp['size']
            next_line = 0 < sp['box'].y0 - last['box'].y0 <= 1.5 * sp['size'] and abs(cx - lcx) < 2 * sp['size']
            if same_size and (same_line or next_line):
                g.append(sp)
                break
        else:
            groups.append([sp])
    out = []
    for g in groups:
        box = fitz.Rect(g[0]['box'])
        for sp in g[1:]:
            box |= sp['box']
        c = m(fitz.Point((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2))
        text = ' '.join(sp['text'] for sp in g).upper()
        text = ' '.join(text.replace('- ', '-').split())  # "A- 53" -> "A-53"
        out.append({'text': text, 'x': c[0], 'y': c[1]})
    out.sort(key=lambda lab: (lab['y'], lab['x']))
    return out


def _room_type(text: str) -> str:
    words = text.replace("'", ' ').split()
    if 'CR' in words or 'COMFORT' in words:
        return 'restroom'
    if 'OFFICE' in words or 'FACULTY' in words:
        return 'office'
    if any(w.startswith('LAB') for w in words):
        return 'lab'
    if 'ELEVATOR' in words:
        return 'elevator'
    return 'classroom'


def _room(text: str, polygon: list, used: set) -> dict:
    rid = ''.join(ch if ch.isalnum() else '_' for ch in text).strip('_')
    while '__' in rid:
        rid = rid.replace('__', '_')
    base, n = rid, 2
    while rid in used:
        rid, n = f'{base}_{n}', n + 1
    used.add(rid)
    if polygon and polygon[0] != polygon[-1]:
        polygon = polygon + [polygon[0]]  # campus data stores closed rings
    return {'id': rid, 'name': text, 'type': _room_type(text), 'polygon': polygon}


def _rooms(walls, doors, labels, area: fitz.Rect, scale: float) -> list[dict]:
    """Flood-fills from each label on a rasterized wall grid; an enclosed region becomes that room's outline."""
    w = int(math.ceil(area.width * scale * PX_PER_M)) + 1
    h = int(math.ceil(area.height * scale * PX_PER_M)) + 1
    grid = bytearray(w * h)

    def plot(a, b):
        (x0, y0), (x1, y1) = [(int(round(p[0] * PX_PER_M)), int(round(p[1] * PX_PER_M))) for p in (a, b)]
        n = max(abs(x1 - x0), abs(y1 - y0), 1)
        for i in range(n + 1):
            x, y = round(x0 + (x1 - x0) * i / n), round(y0 + (y1 - y0) * i / n)
            for dx in (0, 1):  # 2 px thick so diagonal walls stay closed
                if 0 <= x + dx < w and 0 <= y < h:
                    grid[y * w + x + dx] = 1

    for a, b in walls:
        plot(a, b)
    for d in doors:  # close door openings with the leaf in both swing positions
        hx, hy = d['hinge']
        for deg in (d['from'], d['to']):
            plot((hx, hy), (hx + d['r'] * math.cos(math.radians(deg)), hy + d['r'] * math.sin(math.radians(deg))))

    # Grow the walls so undrawn doorways close; the room outline is grown back by the same amount afterwards.
    thick = bytearray(grid)
    for y in range(h):
        row = y * w
        for x in range(w):
            if grid[row + x]:
                for dy in range(-CLOSE_PX, CLOSE_PX + 1):
                    yy = y + dy
                    if 0 <= yy < h:
                        base = yy * w
                        for dx in range(-CLOSE_PX, CLOSE_PX + 1):
                            xx = x + dx
                            if 0 <= xx < w and dx * dx + dy * dy <= CLOSE_PX * CLOSE_PX:
                                thick[base + xx] = 1
    grid = thick

    def seed(lab):
        sx, sy = int(lab['x'] * PX_PER_M), int(lab['y'] * PX_PER_M)
        return next(((x, y) for r in range(4) for x in range(sx - r, sx + r + 1) for y in range(sy - r, sy + r + 1)
                     if 0 <= x < w and 0 <= y < h and not grid[y * w + x]), None)

    # One flood-fill per enclosed region; labels that land in the same region name one room together.
    region = [0] * (w * h)
    regions: dict[int, dict] = {}
    for lab in labels:
        start = seed(lab)
        if start is None:
            continue
        rid = region[start[1] * w + start[0]]
        if not rid:
            rid = len(regions) + 1
            region[start[1] * w + start[0]] = rid
            queue, cells, open_space = deque([start]), [], False
            while queue:
                x, y = queue.popleft()
                cells.append((x, y))
                if x in (0, w - 1) or y in (0, h - 1):
                    open_space = True
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        i = ny * w + nx
                        if not grid[i] and not region[i]:
                            region[i] = rid
                            queue.append((nx, ny))
            regions[rid] = {'cells': cells, 'open': open_space or len(cells) > 0.4 * w * h, 'labels': []}
        if lab['text'] not in MARKERS and not lab['text'].startswith('GATE'):  # gates mark exits, not rooms
            regions[rid]['labels'].append(lab)

    rooms, used = [], set()
    for reg in regions.values():
        if not reg['labels']:
            continue
        texts = [lab['text'] for lab in reg['labels']]
        # Open space (reaches the edge, or holds an area/link label such as OPEN GROUND or TO ANNEX 2) is not a room.
        if reg['open'] or len(reg['cells']) < 4 or any(t in NOT_ROOMS or t.startswith('TO ') for t in texts):
            continue
        # Labels close together are one name split over lines; far apart means one open space shared by rooms.
        first = reg['labels'][0]
        near = [lab for lab in reg['labels'] if math.dist((lab['x'], lab['y']), (first['x'], first['y'])) <= 2.5]
        text = ' '.join(lab['text'] for lab in near)
        if len(near) < len(reg['labels']):
            print(f"  note: '{text}' shares an open area with {[t for t in texts if t not in text]}; add those rooms by hand in import.json")
        poly = _outline(reg['cells'], CLOSE_PX, w, h)
        if len(poly) < 3:
            continue
        rooms.append(_room(text, [[round(x, 2), round(y, 2)] for x, y in poly], used))
    return rooms


def main(argv: list[str]) -> None:
    if not argv:
        sys.exit(__doc__)
    bdir = argv[0].rstrip('/\\')
    cfg = json.load(open(os.path.join(bdir, 'import.json'), encoding='utf-8'))
    scale = cfg.get('scale_m_per_pt')
    if scale is None:  # one scale for the whole building: median door radius across every floor
        radii = []
        for f in cfg['files']:
            page = fitz.open(os.path.join(bdir, 'source', f['pdf']))[0]
            radii += [d['r'] for d in door_arcs(page, plan_area(page))]
        scale = DOOR_M / statistics.median(radii)
    for f in cfg['files']:
        floor = extract(os.path.join(bdir, 'source', f['pdf']), f['level'], f['name'], scale)
        path = os.path.join(bdir, f"floor-{f['level']}.json")
        existing = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {}
        manual = cfg.get('rooms', {}).get(str(f['level']), [])
        used = {r['id'] for r in floor['rooms']}
        floor['rooms'] += [_room(r['name'], r['polygon'], used) for r in manual]
        out = {'rooms': floor['rooms'], 'nodes': existing.get('nodes', []), 'edges': existing.get('edges', []), 'plan': floor['plan']}
        with open(path, 'w', encoding='utf-8', newline='\n') as fh:
            json.dump(out, fh, indent=1)
            fh.write('\n')
        print(f"{path}: {len(out['plan']['walls'])} walls, {len(out['plan']['doors'])} doors, {len(out['rooms'])} rooms, "
              f"{len(out['plan']['labels'])} labels, {len(out['plan']['arrows'])} arrows, scale {scale:.4f} m/pt")
    print('debug images (never commit):', tempfile.gettempdir())


if __name__ == '__main__':
    main(sys.argv[1:])
