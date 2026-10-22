'use dom';

import { mount, type PickInfo, type Viewer } from '@evacuai/campus-3d/src/mount';
import type { Preset } from '@evacuai/campus-3d/src/views';
import type { CampusSnapshot, Route } from '@evacuai/routing';
import type { DOMProps } from 'expo/dom';
import { useEffect, useRef } from 'react';

type Props = {
  snapshot: CampusSnapshot;
  /** Changes only with new campus data: the scene is rebuilt on a new version, not on every render. */
  version: number;
  building: string;
  level: number | null;
  view: Preset;
  explode: number;
  route?: Route | null;
  quality: 'high' | 'low';
  /** A tapped room or pin, handed to the native screen (bottom sheet). */
  onPick?: (info: PickInfo) => Promise<void>;
  dom?: DOMProps;
};

/**
 * The 3D building as an Expo DOM component: only the canvas lives in the web view; the controls and the room sheet
 * are native (expo-dom: native chrome, DOM for the specialised content). three.js ships inside the app, so it works
 * offline.
 *
 * Expo DOM re-sends every prop as new JSON on each native render, so nothing here depends on object identity: the
 * scene is built when `version` changes and each setting is applied only when its value really changed.
 */
export default function Campus3DView({ snapshot, version, building, level, view, explode, route, quality, onPick }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const latest = useRef({ snapshot, building, level, onPick });
  useEffect(() => { latest.current = { snapshot, building, level, onPick }; });
  const routeKey = route ? route.nodeIds.join('>') : '';

  useEffect(() => {
    if (!el.current) return;
    const { snapshot: snap, building: b, level: l } = latest.current;
    viewer.current = mount(el.current, snap, {
      controls: false,
      quality,
      initial: { building: b, level: l },
      // Only plain values cross into native.
      onPick: info => { void latest.current.onPick?.(JSON.parse(JSON.stringify({ ...info, baseMaterial: undefined }))); },
    });
    return () => { viewer.current?.dispose(); viewer.current = null; };
  }, [version, quality]);

  useEffect(() => { viewer.current?.setBuilding(building); }, [building, version, quality]);
  useEffect(() => { if (viewer.current && viewer.current.state().level !== level) viewer.current.setFloor(level); }, [level, building, version, quality]);
  useEffect(() => { if (viewer.current && viewer.current.state().view !== view) viewer.current.setView(view); }, [view, version, quality]);
  useEffect(() => { if (viewer.current && viewer.current.state().explode !== explode) viewer.current.explode(explode); }, [explode, version, quality]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { viewer.current?.route(route ?? null); }, [routeKey, version, quality]);

  return (
    <div
      ref={el}
      role="img"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320, overflow: 'hidden', background: '#F4F6F2' }}
      aria-label="3D building. Drag to rotate, pinch to zoom, tap a room for details."
    />
  );
}
