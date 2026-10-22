import type { LiveState } from '@evacuai/campus-3d';
import { mount, webglAvailable, type Viewer } from '@evacuai/campus-3d/src/mount';
import type { CampusSnapshot } from '@evacuai/routing';
import { useEffect, useRef } from 'react';

// Each check creates a WebGL context and browsers cap them (~16), so check once.
let webgl: boolean | undefined;
const hasWebgl = () => (webgl ??= webglAvailable());

/**
 * One building in 3D (three.js) with the viewer's own control bar (building, floors, explode, views, room card).
 * Loaded only when an officer switches to 3D. `building` follows the page's picker; `onBuilding` reports a change
 * made in the bar.
 */
export default function View3D({ snap, live, building, onBuilding }: { snap: CampusSnapshot; live?: LiveState; building?: string; onBuilding?: (id: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const report = useRef(onBuilding);
  const liveNow = useRef(live);
  useEffect(() => { report.current = onBuilding; liveNow.current = live; });

  useEffect(() => {
    if (!el.current || !hasWebgl()) return;
    const v = mount(el.current, snap, { quality: 'high', initial: { building } });
    viewer.current = v;
    if (liveNow.current) v.update(liveNow.current); // a rebuilt viewer starts with the current live picture
    const off = v.onChange(s => report.current?.(s.building));
    return () => {
      off();
      v.dispose();
      viewer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap]);

  useEffect(() => {
    if (building) viewer.current?.setBuilding(building);
  }, [building]);

  useEffect(() => {
    if (live) viewer.current?.update(live);
  }, [live]);

  if (!hasWebgl()) return <p className="banner">3D needs WebGL 2, which this browser does not offer. Use the 2D plan.</p>;
  return <div className="view3d" ref={el} />;
}
