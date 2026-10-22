import type { CampusSnapshot } from '@evacuai/routing';

import type { PickInfo, Viewer, ViewerState } from './mount';
import type { Preset } from './views';

/** The built-in control bar for browsers (Command Center, web build); the phone app draws native controls instead. */
export interface Controls {
  /** Show a room's details card (called on a tap in the scene). */
  showRoom(info: PickInfo): void;
  detach(): void;
}

const CSS = `
.evac3d-bar{position:absolute;left:8px;right:8px;bottom:8px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px;
  background:rgba(11,18,32,.88);color:#E6EAF2;border-radius:12px;font:600 13px Inter,system-ui,sans-serif;z-index:2}
.evac3d-bar select{width:auto;max-width:220px}
.evac3d-bar select,.evac3d-bar button{min-height:44px;min-width:44px;padding:0 12px;border-radius:8px;border:1px solid #2A3650;
  background:#131B2B;color:#E6EAF2;font:inherit;cursor:pointer}
.evac3d-bar button[aria-pressed="true"]{background:#1F6FEB;border-color:#1F6FEB;color:#fff}
.evac3d-bar button:focus-visible,.evac3d-bar select:focus-visible,.evac3d-bar input:focus-visible{outline:3px solid #4C8DFF;outline-offset:2px}
.evac3d-group{display:flex;gap:4px;flex-wrap:wrap;align-items:center}
.evac3d-sep{width:1px;align-self:stretch;background:#2A3650}
.evac3d-bar label{display:flex;gap:6px;align-items:center}
.evac3d-bar input[type=range]{width:110px;accent-color:#1F6FEB}
.evac3d-card{position:absolute;top:8px;right:8px;max-width:260px;padding:12px 14px;background:#fff;color:#0B1220;border-radius:12px;
  box-shadow:0 4px 16px rgba(0,0,0,.2);font:14px/1.4 Inter,system-ui,sans-serif;z-index:3}
.evac3d-card h3{margin:0 0 4px;font:700 18px 'Barlow Condensed','Arial Narrow',sans-serif;text-transform:uppercase;letter-spacing:.03em}
.evac3d-card .danger{color:#D7263D;font-weight:700}
.evac3d-card button{margin-top:8px;min-height:40px;padding:0 12px;border-radius:8px;border:1px solid #D5DBE5;background:#F4F6FA;cursor:pointer}
@media (max-width:480px){.evac3d-bar .long{display:none}}`;

const VIEWS: { view: Preset; label: string }[] = [
  { view: '3d', label: '3D' }, { view: 'top', label: 'Top' }, { view: 'front', label: 'Front' }, { view: 'route', label: 'Follow route' },
];

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...kids);
  return node;
}
/** "Ground" → "G", "Mezzanine" → "M", "Third" → "3", for narrow screens. */
const ORDINAL: Record<string, string> = { Ground: 'G', Mezzanine: 'M', First: '1', Second: '2', Third: '3', Fourth: '4', Fifth: '5', Sixth: '6', Seventh: '7', Eighth: '8' };
const short = (name: string, level: number) => (/^\d/.test(name) ? name : ORDINAL[name] ?? String(level));

export function attachControls(el: HTMLElement, viewer: Viewer, snap: CampusSnapshot): Controls {
  const style = h('style', { textContent: CSS });
  const bar = h('div', { className: 'evac3d-bar' });
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', '3D view controls');

  const building = h('select');
  building.setAttribute('aria-label', 'Building');
  for (const b of snap.buildings) building.append(h('option', { value: b.id, textContent: b.name }));
  building.addEventListener('change', () => viewer.setBuilding(building.value));

  const floors = h('div', { className: 'evac3d-group' });
  floors.setAttribute('role', 'group');
  floors.setAttribute('aria-label', 'Floor');
  const range = h('input', { type: 'range', min: '0', max: '3', step: '0.1', value: '0' });
  range.setAttribute('aria-label', 'Explode floors');
  range.addEventListener('input', () => viewer.explode(Number(range.value)));
  const views = h('div', { className: 'evac3d-group' });
  views.setAttribute('role', 'group');
  views.setAttribute('aria-label', 'View');
  const viewButtons = VIEWS.map(({ view, label }) => {
    const b = h('button', { type: 'button', textContent: label });
    b.addEventListener('click', () => viewer.setView(view));
    views.append(b);
    return { view, b };
  });
  const reset = h('button', { type: 'button', textContent: 'Reset' });
  reset.addEventListener('click', () => viewer.reset());

  bar.append(building, h('span', { className: 'evac3d-sep' }), floors, h('span', { className: 'evac3d-sep' }),
    h('label', {}, h('span', { className: 'long', textContent: 'Explode' }), range), h('span', { className: 'evac3d-sep' }), views, reset);

  const card = h('div', { className: 'evac3d-card', hidden: true });
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Room details');

  let floorsFor = '';
  const draw = (s: ViewerState) => {
    building.value = s.building;
    if (floorsFor !== s.building) {
      floorsFor = s.building;
      floors.replaceChildren();
      const b = snap.buildings.find(x => x.id === s.building);
      const all = h('button', { type: 'button', textContent: 'All' });
      all.setAttribute('aria-label', 'All floors');
      all.dataset.level = '';
      all.addEventListener('click', () => viewer.setFloor(null));
      floors.append(all);
      for (const f of b?.floors ?? []) {
        const btn = h('button', { type: 'button', textContent: short(f.name, f.level) });
        btn.setAttribute('aria-label', f.name);
        btn.title = f.name;
        btn.dataset.level = String(f.level);
        btn.addEventListener('click', () => viewer.setFloor(f.level));
        floors.append(btn);
      }
    }
    for (const btn of floors.querySelectorAll('button')) btn.setAttribute('aria-pressed', String(btn.dataset.level === (s.level === null ? '' : String(s.level))));
    for (const { view, b } of viewButtons) {
      b.setAttribute('aria-pressed', String(s.view === view));
      if (view === 'route') b.hidden = !s.hasRoute;
    }
    range.value = String(s.explode);
  };
  draw(viewer.state());
  const off = viewer.onChange(draw);

  style.dataset.evac3d = '';
  el.append(style, bar, card);
  return {
    showRoom(info) {
      if (!info.roomId) { card.hidden = true; return; }
      const close = h('button', { type: 'button', textContent: 'Close' });
      close.addEventListener('click', () => { card.hidden = true; });
      const n = info.count ?? 0;
      card.replaceChildren(
        h('h3', { textContent: info.name ?? 'Room' }),
        h('div', { textContent: info.floorName ?? '' }),
        h('div', { textContent: n === 1 ? '1 person inside' : `${n} people inside` }),
        ...(info.hazard ? [h('div', { className: 'danger', textContent: 'Hazard reported' })] : []),
        ...(info.sos ? [h('div', { className: 'danger', textContent: 'SOS here' })] : []),
        close,
      );
      card.hidden = false;
    },
    detach() {
      off();
      style.remove();
      bar.remove();
      card.remove();
    },
  };
}
