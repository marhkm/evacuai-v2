import { DEMO_PASSWORD, demoEmail, expect, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('Email address').fill(demoEmail('safety_officer'));
  await page.locator('input[type=password]').fill(DEMO_PASSWORD); // the label also matches the show/hide toggles
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Registered people')).toBeVisible(); // dashboard stats
});

test('main officer pages render', async ({ page }) => {
  for (const [path, heading] of [
    ['/admin/sos-alerts', 'SOS'],
    ['/admin/safety-monitor', 'Safety Monitor'],
    ['/admin/alerts', 'Alerts'],
    ['/admin/hazard-reports', 'Hazard Reports'],
    ['/admin/paths', 'Paths'],
    ['/admin/qr-stickers', 'QR stickers'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
});

test('Campus 3D renders the campus and the live overlay', async ({ page }) => {
  await page.goto('/admin/campus-3d');
  await expect(page.locator('#campus3d canvas')).toBeVisible();
  await expect(page.locator('#c3d-alert')).not.toHaveText('Loading…'); // first live poll answered
  const rooms = await page.evaluate(() => (window as unknown as { campus3d: { campus: { rooms: Map<string, unknown> } } }).campus3d.campus.rooms.size);
  expect(rooms).toBeGreaterThan(0);
});

test('activity log is for admins only', async ({ page }) => {
  const res = await page.goto('/admin/activity-logs');
  expect(res?.status()).toBe(403);
});
