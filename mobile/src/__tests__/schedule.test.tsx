import { fireEvent, screen } from 'expo-router/testing-library'; // first: sets up the native-module stand-ins
import { render } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { ScheduleSection } from '@/components/ScheduleSection';

const mockConfirm = jest.fn(async (..._a: unknown[]) => true);
jest.mock('@/lib/confirm', () => ({ confirm: (...a: unknown[]) => mockConfirm(...a) }));
let mockPicked: { canceled: boolean; assets?: { uri: string; name: string; mimeType: string }[] } = { canceled: true };
jest.mock('expo-document-picker', () => ({ getDocumentAsync: async () => mockPicked }));

const cls = { subject: 'IT 101', room_code: 'A-61', room: 'Room 61', days: 'MWF', time_start: '08:00', time_end: '09:30' };
let classes: object[] = [];
let calls: { method: string; path: string; body?: unknown }[] = [];
let uploadReply: { status: number; body: unknown } | null = null;

beforeEach(() => {
  classes = [];
  calls = [];
  uploadReply = null;
  mockPicked = { canceled: true };
  mockConfirm.mockClear();
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const method = init?.method ?? 'GET';
    calls.push({ method, path, body: init?.body });
    let status = 200;
    let body: unknown = {};
    if (path === '/api/me/schedule' && method === 'GET') body = { classes };
    if (path === '/api/me/schedule' && method === 'POST') {
      if (uploadReply) ({ status, body } = uploadReply);
      else { classes = [cls]; body = { classes }; }
    }
    if (path === '/api/me/schedule' && method === 'DELETE') { classes = []; status = 204; }
    if (path === '/api/me/schedule/template-link') body = { url: 'https://evacuai.test/api/schedule-template?signature=x' };
    return { ok: status < 400, status, json: async () => body, headers: { get: () => null } } as unknown as Response;
  }) as jest.Mock;
});

test('lists classes or says none uploaded', async () => {
  await render(<ScheduleSection token="t" />);
  expect(await screen.findByText('No schedule uploaded')).toBeTruthy();
});

test('uploads a picked file and shows the new list', async () => {
  mockPicked = { canceled: false, assets: [{ uri: 'file:///s.xlsx', name: 's.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }] };
  await render(<ScheduleSection token="t" />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Upload schedule' }));
  expect(await screen.findByText('IT 101 · A-61 · MWF 08:00–09:30')).toBeTruthy();
  expect(calls.find(c => c.method === 'POST')!.body).toBeInstanceOf(FormData);
});

test('shows each row problem from the server', async () => {
  mockPicked = { canceled: false, assets: [{ uri: 'file:///s.csv', name: 's.csv', mimeType: 'text/csv' }] };
  uploadReply = { status: 422, body: { message: 'Bad file', errors: { file: ['Row 3: unknown room code ZZ-9', 'Row 5: invalid days Q'] } } };
  await render(<ScheduleSection token="t" />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Upload schedule' }));
  expect(await screen.findByText('Row 3: unknown room code ZZ-9')).toBeTruthy();
  expect(screen.getByText('Row 5: invalid days Q')).toBeTruthy();
});

test('opens the signed template link', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  await render(<ScheduleSection token="t" />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Download template' }));
  expect(open).toHaveBeenCalledWith('https://evacuai.test/api/schedule-template?signature=x');
});

test('removes the schedule after confirming', async () => {
  classes = [cls];
  await render(<ScheduleSection token="t" />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Remove schedule' }));
  expect(mockConfirm).toHaveBeenCalledWith('Remove schedule?', 'Remove your class schedule?', 'Remove');
  expect(await screen.findByText('No schedule uploaded')).toBeTruthy();
});
