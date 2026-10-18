# Phase 2: Real floor plans (poster-faithful 2D, real-wall 3D, Annex 1 data)

Part of the approved plan: Command Center, Responder mode, real floor plans, Signage redesign and the docs split. The user wants maps and evacuation routes to look like UCLM's official evacuation posters. Today the 2D view uses blocky rooms and the 3D view uses extruded room boxes, and the user dislikes both. Annex 1 has no campus data at all yet.

## What the PDFs contain

Findings from a local survey of the six Annex 1 plans: ground, mezzanine, 2, 3, 5 and 6, in `campus-data/uclm/A1/source/`.

- Each plan is one vector page, 1584 × 1224 pt. The building is drawn at the same place and scale on every page.
- Each element type has its own color:

  | Element | Color | Notes |
  |---|---|---|
  | Walls | black stroke, width 0.72 | |
  | Inner wall lines and outline | gray (0.86) stroke, width 0.12 | Exist only inside the plan |
  | Door swings, legend icons, frames | red stroke, width 0.72 | Door swings are curves (`c`) |
  | Fire-escape arrows | solid red fill | |
  | Stairs | orange (0.87, 0.43, 0) stroke | Hatched |
  | "You are here" figure, legend | yellow and green fills | |
  | Border and logo | blue fills | |
  | Room labels | blue text (`0x0000ff`) | |
  | Title, legend text, names block | black and red text | Outside the plan area |

- **Plan area:** the bounding box of the gray lines plus a margin. It contains the walls, door swings, stairs, arrows and room labels. The title block, the legend, the logo and the "Prepared / Checked / Approved by" names block all lie outside it.
- **`docs/floorplans/4.pdf` is an older copy of the third floor:** 198 of its 200 wall lines are identical to `plan-floor-3`. **There is no fourth-floor plan** (open question 1).

## Goals

1. **Importer:** a local tool turns each Annex 1 PDF into committed campus data: walls, doors, stairs, room labels, official route arrows, and room outlines. The building's routing graph is drafted from the same data and finished by hand.
2. **2D maps look like the posters:**
   - a white sheet with thin dark walls, door swings, blue uppercase room labels and hatched stairs;
   - the route as **red chevron arrows**;
   - a green "You are here" figure;
   - a small poster-style legend.
3. **3D view:** real wall polylines raised on stacked floor slabs, with the route as red arrows on the floor.
4. **Basic Ed:** keeps its prototype geometry, drawn in the same style. Its room outlines become its walls until real PDFs arrive.

## Non-goals

- Old Building and Annex 2: there are no PDFs.
- Geo-placing Annex 1 relative to Basic Ed: `origin` stays `null`, and each building is drawn on its own.
- Re-styling the rest of the app: that is Phase 5.

## Privacy

- The PDFs are never committed or uploaded. They are already gitignored; keep it that way.
- The importer keeps:
  - geometry inside the plan area;
  - blue text inside the plan area, which is the room labels.

  Everything else is discarded.
- **Test:** a synthetic PDF with a names block outside the plan area, and black text inside it, must produce no text other than the blue labels.

## Data model

A new optional `plan` key in each `campus-data/<campus>/<B>/floor-N.json`, in metres. The axes are the same as the existing `rooms` and `nodes`: x to the right, y down, origin at the plan area's top-left corner.

```json
"plan": {
  "walls":  [[[x, y], [x, y], ...], ...],
  "doors":  [{"hinge": [x, y], "r": 0.9, "from": deg, "to": deg}],
  "stairs": [[[x, y], ...], ...],
  "labels": [{"text": "CCS DEAN'S OFFICE", "x": 0, "y": 0}],
  "arrows": [{"x": 0, "y": 0, "deg": 180}]
}
```

- **Walls** are polylines. **Stairs** are polygons.
- **Labels:** text lines that sit within 1.2 line-heights of each other are joined into one label (for example "CCS" + "DEAN'S" + "OFFICE").
- **Arrows** are the poster's official fire-escape sequence: a reference for tests and for drafting the graph, not for display.

**Where it flows:**
- The loader (`packages/routing/src/load.ts`) accepts `plan` (added to `KEYS.floor`).
- `Floor` in `types.ts` gains `plan?: FloorPlan`.
- `npm run snapshots` writes it.
- The database gains a migration adding `floors.plan` (JSON, nullable). `CampusSeeder` stores it, and `/api/campus-snapshot` returns it in `buildings[].floors[]`.
- **Size:** about 30–60 KB per floor, rounded to 2 decimals, and covered by the existing snapshot ETag.

## Importer (`campus-data/tools/import-pdf-plan.py`)

- **Command:** `python -I campus-data/tools/import-pdf-plan.py A1`
- **What it reads:** `campus-data/uclm/A1/source/*.pdf` and `campus-data/uclm/A1/import.json`. The `import.json` file lists each PDF's file name, level and floor name, plus an optional scale override.
- **Requirements:** PyMuPDF, run locally only. CI never runs it, because the PDFs are not in the repository.

**Steps:**
1. **Plan area:** the bounding box of the gray strokes, grown by 2%.
2. **Walls:** black width-0.72 line segments inside the plan area, merged into polylines where endpoints meet (0.5 pt tolerance). Gray inner lines are added as walls too.
3. **Doors:** red curves inside the plan area. Each becomes one door: the hinge, the radius, and the start and end angle.
4. **Stairs:** orange strokes inside the plan area, grouped by proximity, with the convex hull of each group.
5. **Labels:** blue text spans inside the plan area, merged by proximity.
6. **Arrows:** red-filled shapes inside the plan area. The centroid gives the position, and the long axis gives the direction toward the tip.
7. **Scale:** metres per PDF point = 0.9 ÷ (median door radius in points), because a standard door leaf is 0.9 m. Override it in `import.json` if a measured dimension is known.
8. **Rooms:**
   - Rasterize the walls at 4 px per metre, then flood-fill from each label's point.
   - The filled region's simplified outline (convex hull, at most 12 points) becomes the room polygon.
   - Room ids are the labels in uppercase with `_` (for example `CCS_FACULTY`). The room type is guessed from words in the label: CR/comfort, office, faculty, lab, elevator, otherwise classroom.
   - Labels like "OPEN GROUND" or "TO OLD BUILDING" become area or link labels, not rooms.
9. **Graph draft** (`--graph`, only when no edited graph exists yet, so manual edits are never overwritten):
   - one door node per door, linked to the room the swing opens into;
   - corridor nodes at the arrow centroids, chained in arrow order;
   - one stair node per stair polygon, linked to the stair node at the same position on the floor above and below (within 1.5 m);
   - each door node joined to its nearest corridor node;
   - exit nodes on the ground floor where the arrows end;
   - ground-floor exits joined by outdoor edges to the off-campus assembly node `AP_Outside` (see Decisions).
10. **Debug image:** writes a PNG to the system temp folder (never into the repository) with the graph drawn over the plan, for a person to review.

The completed graph must pass `npm run validate`: every node reaches a hazard-safe destination, and there are no dangling edges.

## Rendering: 2D (`mobile/src/components/FloorPlan.tsx`, `packages/campus-view`)

- **New function:** `toPlanShapes(snap, building, level)` in `packages/campus-view`. It returns walls, doors and stairs as SVG path data, plus the room labels. When there is no `plan`, it falls back to the room outlines.
- **Drawing order:**
  1. white sheet;
  2. room hit-areas (invisible, so tapping a room still works);
  3. walls (dark ink, 0.12 m);
  4. door swings (thin arcs);
  5. stairs hatch;
  6. labels (blue `#1F3FBF`, uppercase, Barlow Condensed when Phase 5 fonts land, system bold until then);
  7. hazard rooms tinted;
  8. the route;
  9. "You are here".
- **Route:** red (`#D7263D`) chevron arrows every 1.5 m along the route polyline, pointing the way, with a thin red line underneath. Stair changes show a "↓ to Ground" badge.
- **Blocked paths:** a dark hatched bar with a ✕, not red, because red now means the route. Congested paths are drawn in amber.
- **"You are here":** a green figure, as on the poster.
- **Legend:** a collapsible chip matching the poster legend: Your location, Fire escape, Fire extinguisher (only when the data has extinguisher points; Annex 1 does not, so it is hidden).
- **Interaction:** pinch to zoom and pan with gesture handling the app already ships. No new dependency if `react-native-gesture-handler` is already in Expo; otherwise SVG `viewBox` zoom buttons.

## Rendering: 3D (`packages/campus-3d`)

- **Walls:** each wall polyline segment becomes a thin box, 0.15 m wide, at the floor's `height_m` minus 0.3, with the walls of all floors merged into one mesh. When there is no `plan`, room outlines are used as walls.
- **Floor slabs:** one translucent slab per floor, plus an "explode floors" slider that spreads the levels apart.
- **Route:** red arrow decals on the floor along the route, plus vertical red connectors at stair changes.
- **Pins:** the existing pins and overlays stay ("You are here", SOS, hazards, check-in).
- **Triangle budget:** under 60k for Annex 1's 7 floors (`triangleCount` test).
- **Bundle:** the IIFE bundle is rebuilt; CI's freshness check is unchanged.

## Testing

- **Importer (pytest-style asserts in a `__main__` self-check, run locally and in CI on synthetic PDFs built by the test with PyMuPDF):**
  - walls inside the area are kept and outside ones dropped;
  - door radius gives the right scale;
  - blue labels are merged;
  - the names block and black text are dropped;
  - a flood-filled room polygon contains its label;
  - arrow direction is right.
- **Routing:** `npm run validate` passes for `campus-data/uclm` with Annex 1 added. A new poster-agreement test: on each Annex 1 floor, the computed fire route from the room farthest from the exit passes the corridor nodes in the same order as the poster's arrows.
- **campus-view:** `toPlanShapes` output for a small fixture.
- **campus-3d:** wall mesh count and the triangle budget.
- **Mobile:** FloorPlan renders the walls, the labels and the chevrons for a route. Blocked paths render as the hatched style and are never red.
- **API:** `CampusSeederTest` stores `floors.plan`. The snapshot includes `plan` for Annex 1 and omits it for Basic Ed.

## Decisions (answered by the user, 2026-10-18)

1. **Fourth floor: skip level 4 for now.**
   - Annex 1 levels are ground, mezzanine, 2, 3, 5 and 6, using the poster floor numbers.
   - The stairs connect level 3 directly to level 5 until the real fourth-floor PDF arrives. Then the importer runs again for level 4 alone.
2. **Floor heights:** 3.5 m per storey, with the mezzanine as a half level, 1.75 m above ground. Change these in `building.json` if measured heights become available.
3. **Assembly is outside the campus, not in the OPEN GROUND courtyard.**
   - Annex 1's ground-floor exits connect by outdoor edges to one off-campus assembly node, `A1/1/AP_Outside`, named "Off-campus assembly area". It is safe for earthquake and fire. Flood keeps the existing upper-floor rule.
   - The outdoor edge lengths are estimates, flagged in the data.
   - The courtyard is shown as an area label only, and is never a destination.
