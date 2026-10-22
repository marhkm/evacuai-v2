// @vitest-environment jsdom
import type { CampusSnapshot } from '@evacuai/routing';
import { vi } from 'vitest';

import snapshot from '../../../campus-data/uclm.snapshot.json';
import { attachControls } from '../src/controls';
import type { Viewer, ViewerState } from '../src/mount';

const uclm = snapshot as unknown as CampusSnapshot;

function fakeViewer(initial: Partial<ViewerState> = {}) {
  let state: ViewerState = { building: 'A1', level: null, view: '3d', explode: 0, hasRoute: false, rotate: true, ...initial };
  const listeners = new Set<(s: ViewerState) => void>();
  const emit = (patch: Partial<ViewerState>) => { state = { ...state, ...patch }; listeners.forEach(l => l(state)); };
  const v = {
    state: () => state,
    onChange: (cb: (s: ViewerState) => void) => { listeners.add(cb); return () => listeners.delete(cb); },
    setFloor: vi.fn((level: number | null) => emit({ level })),
    setBuilding: vi.fn((building: string) => emit({ building, level: null })),
    setView: vi.fn((view: ViewerState['view']) => emit({ view })),
    explode: vi.fn((f: number) => emit({ explode: f })),
    reset: vi.fn(),
  };
  return { v, emit };
}
const setup = (initial?: Partial<ViewerState>) => {
  const el = document.createElement('div');
  const { v, emit } = fakeViewer(initial);
  const controls = attachControls(el, v as unknown as Viewer, uclm);
  const button = (name: string) => [...el.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === name || b.textContent === name) as HTMLButtonElement | undefined;
  return { el, v, emit, controls, button };
};

describe('3D control bar', () => {
  it('picks a floor, and marks it pressed', () => {
    const { v, button } = setup();
    button('Third')!.click();
    expect(v.setFloor).toHaveBeenCalledWith(4);
    expect(button('Third')!.getAttribute('aria-pressed')).toBe('true');
    expect(button('All floors')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('switches building', () => {
    const { el, v } = setup();
    const select = el.querySelector('select[aria-label="Building"]') as HTMLSelectElement;
    select.value = 'BE';
    select.dispatchEvent(new Event('change'));
    expect(v.setBuilding).toHaveBeenCalledWith('BE');
  });

  it('explodes the floors with the slider', () => {
    const { el, v } = setup();
    const range = el.querySelector('input[aria-label="Explode floors"]') as HTMLInputElement;
    range.value = '1.5';
    range.dispatchEvent(new Event('input'));
    expect(v.explode).toHaveBeenCalledWith(1.5);
  });

  it('changes the view, and offers Follow route only with a route', () => {
    const { v, emit, button } = setup();
    button('Top')!.click();
    expect(v.setView).toHaveBeenCalledWith('top');
    expect(button('Follow route')!.hidden).toBe(true);
    emit({ hasRoute: true });
    expect(button('Follow route')!.hidden).toBe(false);
  });

  it('shows room details in a card', () => {
    const { el, controls } = setup();
    controls.showRoom({ roomId: 'A1/4/A_31', name: 'A-31', floorName: 'Third', count: 3, hazard: true, sos: false });
    const card = el.querySelector('[role="dialog"][aria-label="Room details"]') as HTMLElement;
    expect(card.hidden).toBe(false);
    expect(card.textContent).toContain('A-31');
    expect(card.textContent).toContain('3 people inside');
    expect(card.textContent).toContain('Hazard reported');
    (card.querySelector('button') as HTMLButtonElement).click();
    expect(card.hidden).toBe(true);
  });

  it('gives every control an accessible name and removes itself on detach', () => {
    const { el, controls } = setup();
    for (const b of el.querySelectorAll('button')) expect(b.getAttribute('aria-label') || b.textContent?.trim()).toBeTruthy();
    controls.detach();
    expect(el.querySelector('[role="toolbar"]')).toBeNull();
  });
});

it('labels floor buttons by their name (Third → 3), not their level number', () => {
  const { button } = setup();
  expect(button('Third')!.textContent).toBe('3');
  expect(button('Mezzanine')!.textContent).toBe('M');
});
