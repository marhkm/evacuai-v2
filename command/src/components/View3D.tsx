import type { LiveState } from '@evacuai/campus-3d';
import { mount, webglAvailable, type Viewer } from '@evacuai/campus-3d/src/mount';
import type { CampusSnapshot } from '@evacuai/routing';
import { useEffect, useRef } from 'react';

// Each check creates a WebGL context and browsers cap them (~16), so check once.
let webgl: boolean | undefined;
const hasWebgl = () => (webgl ??= webglAvailable());

/** The 3D campus (three.js), loaded only when an officer switches to 3D. */
export default function View3D({ snap, live }: { snap: CampusSnapshot; live?: LiveState }) {
  const el = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);

  useEffect(() => {
    if (!el.current || !hasWebgl()) return;
    viewer.current = mount(el.current, snap);
    return () => {
      viewer.current?.dispose();
      viewer.current = null;
    };
  }, [snap]);

  useEffect(() => {
    if (live) viewer.current?.update(live);
  }, [live]);

  if (!hasWebgl()) return <p className="banner">3D needs WebGL 2, which this browser does not offer. Use the 2D plan.</p>;
  return <div className="view3d" ref={el} />;
}
