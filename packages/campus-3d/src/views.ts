/**
 * Pure view logic for the 3D viewer (no WebGL): which floors show and how, and where the camera goes for each preset.
 * Vectors are [x, y, z] with y up, as in the scene.
 */
export type FloorKey = string; // "<building>/<level>"
export type Focus = { building: string; level: number | null };
export type Preset = '3d' | 'top' | 'front' | 'route';
export type FloorStyle = { visible: boolean; opacity: number; labels: boolean };
type V3 = [number, number, number];

/** "All floors": every floor shown, the ones under the top floor faded so you can see in. One floor: it alone is solid,
 *  with room labels; floors above are hidden and floors below ghosted. */
export function floorStyles(floors: { key: FloorKey; building: string; level: number }[], focus: Focus, opts: { exploded?: boolean } = {}): Map<FloorKey, FloorStyle> {
  const top = Math.max(...floors.filter(f => f.building === focus.building).map(f => f.level));
  // Exploded, the floors no longer cover each other, so they stay nearly solid.
  const under = opts.exploded ? 0.8 : 0.25;
  return new Map(floors.map((f): [FloorKey, FloorStyle] => {
    if (focus.level === null) return [f.key, { visible: true, opacity: f.level === top ? 1 : under, labels: false }];
    if (f.level > focus.level) return [f.key, { visible: false, opacity: 0, labels: false }];
    if (f.level === focus.level) return [f.key, { visible: true, opacity: 1, labels: true }];
    return [f.key, { visible: true, opacity: 0.15, labels: false }];
  }));
}

const FOV = Math.PI / 4; // the viewer's 45° field of view

/** Camera position and target that frame `box` for a preset ('route' aims at the route's start when given). */
export function cameraFor(preset: Preset, box: { min: V3; max: V3 }, opts: { routeStart?: V3 } = {}): { position: V3; target: V3 } {
  const centre: V3 = [0, 1, 2].map(i => (box.min[i] + box.max[i]) / 2) as V3;
  const size = Math.hypot(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]) || 20;
  const target = preset === 'route' && opts.routeStart ? opts.routeStart : centre;
  const distance = preset === 'route' ? size * 0.45 / Math.sin(FOV / 2) : (size / 2) / Math.sin(FOV / 2);
  // Direction from the target to the camera (normalised below): south-east and up, straight down, or south and low.
  // ('top' leans a hair south: OrbitControls' lookAt breaks when looking exactly straight down.)
  const dir: V3 = preset === 'top' ? [0, 1, 0.0001] : preset === 'front' ? [0, 0.3, 1] : [0.55, 0.6, 0.6];
  const len = Math.hypot(...dir);
  return { position: [0, 1, 2].map(i => target[i] + (dir[i] / len) * distance) as V3, target };
}
