'use dom';

import { mount } from '@evacuai/campus-3d/src/mount';
import type { CampusSnapshot, Route } from '@evacuai/routing';
import type { DOMProps } from 'expo/dom';
import { useEffect, useRef, useState } from 'react';

/**
 * Optional 3D campus (spec §3.4) as an Expo DOM component: a web view on phones, plain DOM on the web build.
 * three.js ships inside the app bundle (no CDN), so it works offline.
 */
export default function Campus3DView({ snapshot, route }: { snapshot: CampusSnapshot; route?: Route | null; dom?: DOMProps }) {
  const el = useRef<HTMLDivElement>(null);
  const viewer = useRef<ReturnType<typeof mount> | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (!el.current) return;
    viewer.current = mount(el.current, snapshot, { onPick: d => setPicked(String(d.label ?? d.name ?? '')) });
    return () => { viewer.current?.dispose(); viewer.current = null; };
  }, [snapshot]);

  useEffect(() => { viewer.current?.route(route ?? null); }, [route, snapshot]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 360, borderRadius: 12, overflow: 'hidden', background: '#f4f7f5' }}>
      <div ref={el} style={{ position: 'absolute', inset: 0 }} aria-label="3D campus map. Drag to rotate, pinch to zoom." />
      {picked ? (
        <div style={{ position: 'absolute', left: 8, bottom: 8, padding: '4px 8px', borderRadius: 8, background: 'rgba(255,255,255,.9)', font: '14px sans-serif' }}>{picked}</div>
      ) : null}
    </div>
  );
}
