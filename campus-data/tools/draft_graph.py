"""Draft a routing graph for a building imported from evacuation posters (run after import_pdf_plan.py).

    python -I campus-data/tools/draft_graph.py campus-data/uclm/A1 [--force]

Writes nodes/edges into floors that have none (all floors with --force). The draft follows the posters:
corridor nodes sit on the official fire-escape arrows and chain in arrow direction; each room links to its
nearest corridor node; stairs link to the same stairwell on the next floor; on the ground floor, the arrows'
end points become exits that lead outdoors to the building's assembly node (see import.json "assembly").
Review the result with draw_floor.py and run `npm run validate`.
"""
from __future__ import annotations

import json
import math
import os
import sys


def crosses(p1, p2, q1, q2) -> bool:
    """True when segment p1-p2 properly intersects segment q1-q2."""
    def orient(a, b, c):
        v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
        return (v > 1e-9) - (v < -1e-9)
    return orient(p1, p2, q1) * orient(p1, p2, q2) < 0 and orient(q1, q2, p1) * orient(q1, q2, p2) < 0


def edge_distance(p, poly) -> float:
    """Distance from point p to the outline of polygon poly."""
    best = float('inf')
    for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
        dx, dy = x2 - x1, y2 - y1
        t = max(0.0, min(1.0, ((p[0] - x1) * dx + (p[1] - y1) * dy) / (dx * dx + dy * dy or 1e-9)))
        best = min(best, math.hypot(p[0] - (x1 + t * dx), p[1] - (y1 + t * dy)))
    return best


def centroid(poly):
    return sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly)


def draft_floor(floor: dict, level: int, ground: bool, flood_safe: bool, assembly: dict | None, extra_links: list | None = None,
                via: list | None = None):
    plan = dict(floor['plan'], labels=floor['plan']['labels'] + (extra_links or []))
    nodes, edges = [], []
    corridor = []
    for i, a in enumerate(plan['arrows'], 1):
        nid = f'C{i}'
        nodes.append({'id': nid, 'type': 'hallway', 'x': a['x'], 'y': a['y']})
        corridor.append((nid, a))

    # Wall pieces under 1 m are thresholds and symbols, not barriers.
    walls = [(w[0], w[-1]) for w in plan['walls'] if math.dist(w[0], w[-1]) >= 1.0]
    clear = lambda p, q: not any(crosses(p, q, w0, w1) for w0, w1 in walls)

    # Chain each arrow to the nearest arrow ahead of it (within 70° of its direction, 12 m, no wall in between).
    for nid, a in corridor:
        best, best_d = None, 12.0
        for oid, o in corridor:
            if oid == nid:
                continue
            dx, dy = o['x'] - a['x'], o['y'] - a['y']
            d = math.hypot(dx, dy)
            off = abs((math.degrees(math.atan2(dy, dx)) - a['deg'] + 180) % 360 - 180)
            if d < best_d and off <= 70 and clear((a['x'], a['y']), (o['x'], o['y'])):
                best, best_d = oid, d
        if best and not any({e['from'], e['to']} == {nid, best} for e in edges):
            edges.append({'from': nid, 'to': best, 'type': 'corridor'})

    # Join the arrow chains into one corridor network: shortest links that do not cross a wall (spanning tree).
    parent = {nid: nid for nid, _ in corridor}

    def find(n):
        while parent[n] != n:
            parent[n] = parent[parent[n]]
            n = parent[n]
        return n

    for e in edges:
        parent[find(e['from'])] = find(e['to'])
    pairs = sorted(((math.hypot(a['x'] - b['x'], a['y'] - b['y']), na, nb, a, b)
                    for i, (na, a) in enumerate(corridor) for nb, b in corridor[i + 1:]), key=lambda t: t[0])
    for d, na, nb, a, b in pairs:
        if d > 25 or find(na) == find(nb):
            continue
        if not clear((a['x'], a['y']), (b['x'], b['y'])):
            continue
        parent[find(na)] = find(nb)
        edges.append({'from': na, 'to': nb, 'type': 'corridor'})

    # Pieces that still cannot see each other (an opening between two walls): join with one bend at a junction node.
    junctions = 0
    for d, na, nb, a, b in pairs:
        if d > 25 or find(na) == find(nb):
            continue
        for ex, ey in ((a['x'], b['y']), (b['x'], a['y'])):
            if clear((a['x'], a['y']), (ex, ey)) and clear((ex, ey), (b['x'], b['y'])):
                junctions += 1
                jid = f'J{junctions}'
                nodes.append({'id': jid, 'type': 'hallway', 'x': round(ex, 2), 'y': round(ey, 2)})
                parent[jid] = jid
                edges += [{'from': na, 'to': jid, 'type': 'corridor'}, {'from': jid, 'to': nb, 'type': 'corridor'}]
                parent[find(na)] = find(nb)
                break

    # Hand-placed passage points (import.json "via") for openings too irregular for the automatic links:
    # each joins every corridor point it can see within 12 m.
    for k, (vx, vy) in enumerate(via or [], 1):
        vid = f'V{k}'
        nodes.append({'id': vid, 'type': 'hallway', 'x': vx, 'y': vy})
        for cid, c in corridor:
            if math.hypot(c['x'] - vx, c['y'] - vy) <= 12 and clear((vx, vy), (c['x'], c['y'])):
                edges.append({'from': vid, 'to': cid, 'type': 'corridor'})

    stairs = []
    for i, poly in enumerate(plan['stairs'], 1):
        x, y = centroid(poly)
        sid = f'S{i}'
        node = {'id': sid, 'type': 'stairwell', 'x': round(x, 2), 'y': round(y, 2), 'name': f'Stairs {i}'}
        if flood_safe:
            node['safe_for'] = ['flood']
        nodes.append(node)
        stairs.append(node)
        near = min(corridor, key=lambda c: math.hypot(c[1]['x'] - x, c[1]['y'] - y), default=None)
        if near:
            edges.append({'from': near[0], 'to': sid, 'type': 'corridor'})

    for room in floor['rooms']:
        lab = next((l for l in plan['labels'] if l['text'] == room['name']), None)
        x, y = (lab['x'], lab['y']) if lab else centroid(room['polygon'])
        rid = f"R_{room['id']}"
        nodes.append({'id': rid, 'type': 'room', 'x': round(x, 2), 'y': round(y, 2), 'room_id': room['id']})
        targets = corridor + [(s['id'], s) for s in stairs]
        doors = [d for d in plan['doors'] if edge_distance(d['hinge'], room['polygon']) <= 1.0]
        if doors and targets:
            # The door whose doorway sees a corridor point best (nearest clear corridor point).
            def reach(d):
                seen = [t for t in targets if clear(tuple(d['hinge']), (t[1]['x'], t[1]['y']))]
                return min(seen or targets, key=lambda t: math.hypot(t[1]['x'] - d['hinge'][0], t[1]['y'] - d['hinge'][1]))
            door = min(doors, key=lambda d: math.dist(d['hinge'], (reach(d)[1]['x'], reach(d)[1]['y'])))
            did = f"D_{room['id']}"
            nodes.append({'id': did, 'type': 'hallway', 'x': door['hinge'][0], 'y': door['hinge'][1], 'name': f"{room['name']} door"})
            edges += [{'from': rid, 'to': did, 'type': 'door'}, {'from': did, 'to': reach(door)[0], 'type': 'corridor'}]
        elif targets:
            near = min(targets, key=lambda c: math.hypot(c[1]['x'] - x, c[1]['y'] - y))
            edges.append({'from': rid, 'to': near[0], 'type': 'door'})

    # Links drawn on the poster ("TO OLD BUILDING", "TO ANNEX 2"): the escape continues through the next building.
    # That building is not mapped yet, so the link leads to the assembly area with an estimated distance.
    links = []
    if assembly:
        for k, lab in enumerate([l for l in plan['labels'] if l['text'].startswith('TO ')], 1):
            # Only where the solid escape arrows lead: some arrow within 8 m points at the label (within 45°).
            def aims(a):
                dx, dy = lab['x'] - a['x'], lab['y'] - a['y']
                off = abs((math.degrees(math.atan2(dy, dx)) - a['deg'] + 180) % 360 - 180)
                return math.hypot(dx, dy) <= 8 and off <= 45
            aiming = [c for c in corridor if aims(c[1])]
            if not aiming:
                continue
            near = min(aiming, key=lambda c: math.hypot(c[1]['x'] - lab['x'], c[1]['y'] - lab['y']))
            lid = f'LINK{k}'
            nodes.append({'id': lid, 'type': 'exit', 'x': lab['x'], 'y': lab['y'], 'name': lab['text'].title()})
            edges.append({'from': near[0], 'to': lid, 'type': 'door'})
            links.append(lid)

    if ground and assembly:
        # Exits: arrows with nothing ahead of them (the end of each fire-escape sequence), plus labelled gates.
        heads = {e['from'] for e in edges if e['type'] == 'corridor'}
        ends = [c for c in corridor if c[0] not in heads]
        gates = [l for l in plan['labels'] if l['text'].startswith('GATE')]
        n = 0
        for _, a in ends:
            n += 1
            ex = {'id': f'EXIT{n}', 'type': 'exit', 'x': round(a['x'] + 1.5 * math.cos(math.radians(a['deg'])), 2),
                  'y': round(a['y'] + 1.5 * math.sin(math.radians(a['deg'])), 2), 'name': f'Exit {n}'}
            nodes.append(ex)
            edges.append({'from': next(c[0] for c in corridor if c[1] is a), 'to': ex['id'], 'type': 'door'})
        for g in gates:
            n += 1
            nodes.append({'id': f'EXIT{n}', 'type': 'exit', 'x': g['x'], 'y': g['y'], 'name': g['text'].title()})
            near = min(corridor, key=lambda c: math.hypot(c[1]['x'] - g['x'], c[1]['y'] - g['y']))
            edges.append({'from': near[0], 'to': f'EXIT{n}', 'type': 'door'})
        ap = {'id': assembly['id'], 'type': 'assembly_point', 'x': assembly['x'], 'y': assembly['y'],
              'name': assembly['name'], 'safe_for': ['earthquake', 'fire', 'flood']}  # off campus: safe ground
        nodes.append(ap)
        for node in nodes:
            if node['type'] == 'exit':
                # In a flood the way out is underwater: flood routes go up the stairs instead (flood_prone blocks them).
                edges.append({'from': node['id'], 'to': ap['id'], 'type': 'outdoor', 'bidirectional': False,
                              'distance_m': assembly['distance_m'], 'flags': ['estimated', 'flood_prone']})
    return nodes, edges, links


def main(argv):
    bdir = argv[0].rstrip('/\\')
    force = '--force' in argv
    cfg = json.load(open(os.path.join(bdir, 'import.json'), encoding='utf-8'))
    building = os.path.basename(bdir)
    levels = sorted(f['level'] for f in cfg['files'])
    floors = {lv: json.load(open(os.path.join(bdir, f'floor-{lv}.json'), encoding='utf-8')) for lv in levels}
    flood_from = cfg.get('flood_safe_from_level', levels[0] + 2)
    drafted = {}
    for lv in levels:
        f = floors[lv]
        if f['nodes'] and not force:
            continue
        f['nodes'], f['edges'], links = draft_floor(f, lv, lv == levels[0], lv >= flood_from, cfg.get('assembly'),
                                                    cfg.get('links', {}).get(str(lv)), cfg.get('via', {}).get(str(lv)))
        drafted[lv] = True
        # Hand-confirmed doorways the wall check cannot see (double-line walls): import.json "connect" [[from, to], ...].
        for a, b in cfg.get('connect', {}).get(str(lv), []):
            f['edges'].append({'from': a, 'to': b, 'type': 'door'})
        ap = cfg.get('assembly')
        for lid in links:  # through the neighbouring building and down to the assembly area (estimate)
            dist = ap["distance_m"] + 7 * levels.index(lv) + 45  # cross-over walk, its corridors and stairs, estimated
            target = ap['id'] if lv == levels[0] else f"{building}/{levels[0]}/{ap['id']}"
            f['edges'].append({'from': lid, 'to': target, 'type': 'outdoor', 'bidirectional': False, 'distance_m': dist, 'flags': ['estimated', 'flood_prone']})
    # Stairs: each floor links its stairwells down to the nearest stairwell on the floor below (within 3 m).
    for below, lv in zip(levels, levels[1:]):
        if lv not in drafted:
            continue
        for s in [n for n in floors[lv]['nodes'] if n['type'] == 'stairwell']:
            under = [n for n in floors[below]['nodes'] if n['type'] == 'stairwell']
            near = min(under, key=lambda u: math.hypot(u['x'] - s['x'], u['y'] - s['y']), default=None)
            if near and math.hypot(near['x'] - s['x'], near['y'] - s['y']) <= 3:
                floors[lv]['edges'].append({'from': s['id'], 'to': f'{building}/{below}/{near["id"]}', 'type': 'stairs'})
    for lv in drafted:
        with open(os.path.join(bdir, f'floor-{lv}.json'), 'w', encoding='utf-8', newline='\n') as fh:
            json.dump(floors[lv], fh, indent=1)
            fh.write('\n')
        f = floors[lv]
        print(f'level {lv}: {len(f["nodes"])} nodes, {len(f["edges"])} edges')


if __name__ == '__main__':
    main(sys.argv[1:])
