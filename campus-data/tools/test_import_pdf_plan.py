"""Self-test for import_pdf_plan on a synthetic evacuation-plan page (no real PDFs needed).

Run: python -I campus-data/tools/test_import_pdf_plan.py
"""
import json
import math
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pymupdf as fitz  # noqa: E402

import import_pdf_plan as imp  # noqa: E402

GRAY, BLACK, RED, ORANGE, BLUE = (0.86, 0.86, 0.86), (0, 0, 0), (1, 0, 0), (0.87, 0.43, 0), (0, 0, 1)


def synthetic_pdf(path: str) -> None:
    doc = fitz.open()
    page = doc.new_page(width=800, height=600)
    s = page.new_shape()
    # Plan outline in light gray: 100..500 x 100..400 (defines the plan area).
    s.draw_rect(fitz.Rect(100, 100, 500, 400))
    s.finish(color=GRAY, width=0.12)
    # Walls: two rooms side by side, 120..300 and 300..480 across, 120..300 down.
    for a, b in [((120, 120), (480, 120)), ((480, 120), (480, 300)), ((480, 300), (120, 300)), ((120, 300), (120, 120)), ((300, 120), (300, 300))]:
        s.draw_line(a, b)
    s.finish(color=BLACK, width=0.72)
    # Door swing: quarter circle, radius 36 pt, hinge on the middle wall at (300, 200).
    s.draw_sector((300, 200), (336, 200), 90, fullSector=False)
    s.finish(color=RED, width=0.72)
    # Stairs hatch (orange) in the right room.
    for y in (250, 256, 262, 268):
        s.draw_line((420, y), (470, y))
    s.finish(color=ORANGE, width=0.72)
    # Fire-escape arrow pointing left (filled red head + shaft, as on the posters), below the rooms.
    s.draw_polyline([(420, 350), (440, 340), (440, 360), (420, 350)])
    s.finish(color=RED, fill=RED, width=0)
    s.draw_rect(fitz.Rect(440, 347, 475, 353))
    s.finish(color=RED, fill=RED, width=0)
    s.commit()
    page.insert_text((190, 205), 'ROOM', fontsize=10, color=BLUE)
    page.insert_text((195, 217), 'A-1', fontsize=10, color=BLUE)
    page.insert_text((200, 360), 'OPEN GROUND', fontsize=10, color=BLUE)
    page.insert_text((330, 380), 'NOTE', fontsize=10, color=BLACK)          # inside the area, not blue: dropped
    page.insert_text((520, 560), 'MR. JUAN DELA CRUZ', fontsize=9, color=BLACK)  # names block: dropped
    page.insert_text((520, 575), 'Safety Officer', fontsize=9, color=BLUE)       # blue but outside the area: dropped
    doc.save(path)


def inside(pt, poly) -> bool:
    x, y = pt
    hit = False
    for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        pdf = os.path.join(tmp, 'plan.pdf')
        synthetic_pdf(pdf)
        floor = imp.extract(pdf, level=1, name='Ground')

    scale = 0.9 / 36
    assert math.isclose(floor['scale_m_per_pt'], scale, rel_tol=0.02), floor['scale_m_per_pt']
    plan = floor['plan']
    dumped = json.dumps(floor)
    assert [l['text'] for l in plan['labels']] == ['ROOM A-1', 'OPEN GROUND'], plan['labels']
    for secret in ('JUAN', 'NOTE', 'Safety Officer', 'SAFETY OFFICER'):
        assert secret not in dumped, secret

    assert len(plan['walls']) >= 5, len(plan['walls'])
    assert all(len(w) >= 2 for w in plan['walls'])
    assert len(plan['doors']) == 1 and math.isclose(plan['doors'][0]['r'], 0.9, rel_tol=0.05), plan['doors']
    assert len(plan['stairs']) == 1 and len(plan['stairs'][0]) >= 3, plan['stairs']
    assert len(plan['arrows']) == 1 and abs(((plan['arrows'][0]['deg'] - 180) + 180) % 360 - 180) < 5, plan['arrows']

    rooms = floor['rooms']
    assert [r['id'] for r in rooms] == ['ROOM_A_1'], rooms
    label = plan['labels'][0]
    assert inside((label['x'], label['y']), rooms[0]['polygon']), (label, rooms[0]['polygon'])
    assert rooms[0]['type'] == 'classroom' and rooms[0]['name'] == 'ROOM A-1'
    # Coordinates are rounded to 2 decimals.
    assert all(round(v, 2) == v for w in plan['walls'] for p in w for v in p)
    print('ok')


if __name__ == '__main__':
    main()
