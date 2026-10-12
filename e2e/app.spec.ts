import { DEMO_PASSWORD, demoEmail, expect, test } from './fixtures';

// Read-only tour of the production web build (no SOS, reports or check-ins are sent), so it is safe on any stack.
test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(demoEmail('student'));
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Welcome, Demo Student')).toBeVisible({ timeout: 45_000 }); // first request after a cold start is slow
});

test('evacuation route from a picked room', async ({ page }) => {
  await page.getByRole('button', { name: 'Evacuation route' }).click();
  const chooseHazard = page.getByRole('button', { name: 'Earthquake' });
  if (await chooseHazard.isVisible()) await chooseHazard.click(); // only shown when no alert is active
  await page.getByRole('button', { name: 'Pick my room' }).click();
  await page.getByRole('button', { name: 'Third' }).click();
  await page.getByRole('button', { name: 'BE301' }).click();
  await expect(page.getByText(/\d+ m to safety/)).toBeVisible();
  await expect(page.getByText('Exit BE301')).toBeVisible();
});

test('campus map: floor plan, all floors and 3D', async ({ page }) => {
  await page.getByRole('button', { name: 'Campus map' }).click();
  await expect(page.getByLabel(/^Room /).first()).toBeVisible();
  await page.getByRole('button', { name: 'All floors' }).click();
  await expect(page.getByLabel('All floors stacked, ground floor at the bottom')).toBeVisible();
  await page.getByRole('button', { name: '3D' }).click();
  await expect(page.locator('canvas')).toBeVisible();
});

test('SOS, report, check-in, alerts, feedback and profile screens open', async ({ page }) => {
  // Screens stay mounted (hidden) in the stack, so check each screen's own heading.
  for (const [button, heading] of [['SOS', 'SOS'], ['Alerts', 'Alerts'], ['Send feedback', 'Feedback'], ['Profile', 'Profile']] as const) {
    await page.getByRole('button', { name: button, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await page.goBack();
  }
  await page.getByRole('button', { name: 'Report a hazard' }).click();
  await expect(page.getByRole('button', { name: 'Choose photo' })).toBeVisible(); // photo attach (nothing is sent)
  await page.goBack();
  await page.goto('/checkin');
  await expect(page.getByRole('heading', { name: 'Check in' })).toBeVisible();
});
