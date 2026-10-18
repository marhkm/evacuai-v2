import type { CampusSnapshot } from '@evacuai/routing';
import { render, screen } from '@testing-library/react-native';

import { FloorPlan } from '@/components/FloorPlan';

const uclm = require('../../../campus-data/uclm.snapshot.json') as CampusSnapshot;

const withEdge = (status: 'blocked' | 'congested'): CampusSnapshot => {
  const edge = uclm.edges.find(e => e.from.startsWith('A1/4/C') && e.to.startsWith('A1/4/C'))!;
  return { ...uclm, edges: uclm.edges.map(e => (e.id === edge.id ? { ...e, status } : e)) };
};

test('draws the poster plan with red route chevrons and you-are-here', async () => {
  await render(<FloorPlan snapshot={uclm} building="A1" level={4} route={[[10, 25], [16, 25]]} you={[10, 25]} />);

  expect(screen.getAllByLabelText('Route direction')).toHaveLength(4);
  expect(screen.getByLabelText('You are here')).toBeTruthy();
  expect(screen.getByLabelText("Map label CCS DEAN'S OFFICE")).toBeTruthy();
  expect(screen.getByLabelText(/^Room CCS FACULTY/)).toBeTruthy(); // tap target kept for each room
});

test('shows a blocked path hatched, never in the route red', async () => {
  await render(<FloorPlan snapshot={withEdge('blocked')} building="A1" level={4} />);

  const blocked = screen.getAllByLabelText('Blocked path');
  expect(blocked.length).toBeGreaterThan(0);
  // react-native-svg hands colours to the native view as ARGB numbers: dark #2B2F36, never the route red #D7263D.
  for (const el of blocked) expect(el.props.stroke.payload).toBe(0xff2b2f36);
});

test('shows the exit badge when the route leaves the building here', async () => {
  await render(<FloorPlan snapshot={uclm} building="A1" level={1} route={[[10, 25], [16, 25]]} badge="Exit to Off-campus assembly area" />);
  expect(screen.getByText('Exit to Off-campus assembly area')).toBeTruthy();
});

test('floors without a traced plan still render their rooms', async () => {
  await render(<FloorPlan snapshot={uclm} building="BE" level={1} />);
  const room = uclm.rooms.find(r => r.building === 'BE' && r.level === 1 && r.type !== 'corridor')!;
  expect(screen.getByLabelText(`Map label ${room.name.toUpperCase()}`)).toBeTruthy();
});
