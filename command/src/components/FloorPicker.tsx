import type { CampusSnapshot } from '@evacuai/routing';
import { useState } from 'react';

export type Floor = { building: string; level: number; set: (building: string, level?: number) => void };

/** The selected building and floor (first of each by default). Shared by Live Ops and Paths. */
export function useFloor(snap: CampusSnapshot | undefined): Floor {
  const [pick, setPick] = useState<{ building: string; level: number } | null>(null);
  const first = snap?.buildings[0];
  const current = pick ?? { building: first?.id ?? '', level: first?.floors[0]?.level ?? 1 };
  return {
    ...current,
    set: (building, level) => setPick({ building, level: level ?? snap?.buildings.find(b => b.id === building)?.floors[0]?.level ?? 1 }),
  };
}

export function FloorPicker({ snap, floor }: { snap: CampusSnapshot; floor: Floor }) {
  const floors = snap.buildings.find(b => b.id === floor.building)?.floors ?? [];
  return (
    <div className="picker">
      <label>
        Building
        <select aria-label="Building" value={floor.building} onChange={e => floor.set(e.target.value)}>
          {snap.buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <label>
        Floor
        <select aria-label="Floor" value={floor.level} onChange={e => floor.set(floor.building, Number(e.target.value))}>
          {floors.map(f => <option key={f.level} value={f.level}>{f.name}</option>)}
        </select>
      </label>
    </div>
  );
}
