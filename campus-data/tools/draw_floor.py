"""Draw an imported floor JSON (walls, rooms, labels, doors, arrows, graph) to a PNG for review.

    python -I campus-data/tools/draw_floor.py campus-data/uclm/A1/floor-1.json [out.png]

Writes to the system temp folder by default. Review images are local only; never commit them.
"""
import json
import math
import os
import sys
import tempfile

import pymupdf as fitz

PX = 14  # pixels per metre


def draw(path: str, out: str | None = None) -> str:
    f = json.load(open(path, encoding='utf-8'))
    plan = f.get('plan') or {'walls': [], 'doors': [], 'stairs': [], 'labels': [], 'arrows': []}
    xs = [p[0] for w in plan['walls'] for p in w] + [n['x'] for n in f['nodes']] or [0, 10]
    ys = [p[1] for w in plan['walls'] for p in w] + [n['y'] for n in f['nodes']] or [0, 10]
    W, H = (max(xs) + 3) * PX, (max(ys) + 3) * PX
    doc = fitz.open()
    pg = doc.new_page(width=W, height=H)
    P = lambda p: fitz.Point(p[0] * PX, p[1] * PX)
    s = pg.new_shape()
    for r in f['rooms']:
        s.draw_polyline([P(p) for p in r['polygon']] + [P(r['polygon'][0])])
        s.finish(color=None, fill=(0.85, 0.93, 1), fill_opacity=0.6, width=0)
    for st in plan['stairs']:
        s.draw_polyline([P(p) for p in st] + [P(st[0])])
        s.finish(color=(0.8, 0.4, 0.1), fill=(1, 0.85, 0.6), width=0.8)
    for w in plan['walls']:
        s.draw_polyline([P(p) for p in w])
    s.finish(color=(0.1, 0.1, 0.1), width=1)
    for d in plan['doors']:
        h = d['hinge']
        for deg in (d['from'], d['to']):
            s.draw_line(P(h), P((h[0] + d['r'] * math.cos(math.radians(deg)), h[1] + d['r'] * math.sin(math.radians(deg)))))
    s.finish(color=(0.9, 0, 0), width=1)
    for a in plan['arrows']:
        c = P((a['x'], a['y']))
        t = fitz.Point(c.x + 10 * math.cos(math.radians(a['deg'])), c.y + 10 * math.sin(math.radians(a['deg'])))
        s.draw_line(c, t)
        s.draw_circle(t, 2)
    s.finish(color=(1, 0, 0), fill=(1, 0, 0), width=1.5)
    nodes = {n['id']: n for n in f['nodes']}
    for e in f['edges']:
        a, b = nodes.get(e['from']), nodes.get(e['to'])
        if a and b:
            s.draw_line(P((a['x'], a['y'])), P((b['x'], b['y'])))
    s.finish(color=(0, 0.6, 0.2), width=1.5)
    for n in f['nodes']:
        s.draw_circle(P((n['x'], n['y'])), 3)
    s.finish(color=(0, 0.4, 0.1), fill=(0, 0.8, 0.3))
    s.commit()
    for lab in plan['labels']:
        pg.insert_text(P((lab['x'], lab['y'])), lab['text'], fontsize=8, color=(0.1, 0.2, 0.8))
    for n in f['nodes']:
        pg.insert_text(fitz.Point(n['x'] * PX + 4, n['y'] * PX - 3), n['id'], fontsize=5, color=(0, 0.4, 0.1))
    out = out or os.path.join(tempfile.gettempdir(), os.path.basename(os.path.dirname(path)) + '-' + os.path.basename(path).replace('.json', '.png'))
    pg.get_pixmap(dpi=72).save(out)
    return out


if __name__ == '__main__':
    print(draw(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None))
