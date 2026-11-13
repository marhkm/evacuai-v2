import { DEMO_PASSWORD, demoEmail, expect, test } from './fixtures';

// Writes a check-in for the demo student, so it needs an active alert or drill (the demo stack seeds one: see
// SETUP-GUIDE §7.1). Skips itself when there is none.
test('check in at a safe zone, then asked before updating', async ({ page, request }) => {
  const api = process.env.E2E_API_URL ?? 'http://localhost:8000';
  const login = await request.post(`${api}/api/auth/login`, { data: { email: demoEmail('student'), password: DEMO_PASSWORD, device_name: 'e2e' } });
  const token = (await login.json()).token as string;
  const alerts = await (await request.get(`${api}/api/alerts`, { headers: { Authorization: `Bearer ${token}` } })).json().catch(() => ({ alerts: [] }));
  test.skip(!alerts.alerts?.some((a: { status: string }) => a.status === 'active'), 'needs an active alert or drill');

  await page.goto('/login');
  await page.getByLabel('Email').fill(demoEmail('student'));
  await page.getByLabel('Password', { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Welcome, Demo Student')).toBeVisible({ timeout: 45_000 });

  await page.goto('/checkin');
  const zone = page.getByRole('button', { name: /^Open ground · / });
  await expect(zone).toBeVisible({ timeout: 20_000 });
  const asked: string[] = []; // every prompt, answered Keep (a rerun is already checked in: the first tap asks too)
  page.on('dialog', d => { asked.push(d.message()); void d.dismiss(); });
  await zone.click();
  await expect(page.getByText(/You checked in safe at .*Open ground/)).toBeVisible();

  const before = asked.length;
  await zone.click();
  await expect.poll(() => asked.length).toBe(before + 1);
  expect(asked.at(-1)).toContain('Update your status?');
});
