import type { Page } from '@playwright/test';

import { DEMO_PASSWORD, demoEmail, expect, test } from './fixtures';

async function signIn(page: Page, role: 'admin' | 'safety_officer') {
  await page.goto('/admin/login');
  await page.getByLabel('Email address').fill(demoEmail(role));
  await page.locator('input[type=password]').fill(DEMO_PASSWORD); // the label also matches the show/hide toggles
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('the admin panel is for admins only: safety officers are sent to the Command Center', async ({ page }) => {
  await signIn(page, 'safety_officer');
  await expect(page.getByText(/do not match|credentials/i)).toBeVisible({ timeout: 45_000 });
  expect(new URL(page.url()).pathname).toBe('/admin/login');
});

// One sign-in for all admin checks: Filament allows 5 sign-in attempts a minute.
test('an admin sees only the admin tools, and the officer pages are gone', async ({ page }) => {
  await signIn(page, 'admin');
  await expect(page.getByRole('link', { name: 'Command Center' })).toBeVisible({ timeout: 45_000 }); // slow on a cold start
  for (const [path, heading] of [
    ['/admin/users', 'Users'],
    ['/admin/activity-logs', /^activity log/i],
    ['/admin/import-schedules', 'Import class schedules'],
    ['/admin/qr-stickers', 'QR stickers'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', typeof heading === 'string' ? { name: heading, exact: true } : { name: heading })).toBeVisible();
  }
  for (const path of ['/admin/alerts', '/admin/sos-alerts', '/admin/campus-3d']) {
    const res = await page.goto(path);
    expect(res?.status()).toBe(404);
  }
});
