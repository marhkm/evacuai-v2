import type { Page } from '@playwright/test';

import { DEMO_PASSWORD, demoEmail, expect, test } from './fixtures';

async function signIn(page: Page, role: 'student' | 'safety_officer') {
  await page.goto('/command/sign-in');
  await page.getByLabel('Email').fill(demoEmail(role));
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('a student is refused', async ({ page }) => {
  await signIn(page, 'student');
  await expect(page.getByRole('alert')).toHaveText("Those details don't match an officer account.");
});

test.describe('signed in as an officer', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', d => d.accept()); // confirm() before resolve/retract
    await signIn(page, 'safety_officer');
    await expect(page.getByRole('heading', { name: 'Live Ops' })).toBeVisible({ timeout: 45_000 });
  });

  test('Live Ops shows the plan and the live connection', async ({ page }) => {
    await expect(page.getByRole('img', { name: /Floor plan/ })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('LIVE', { timeout: 20_000 });
  });

  test('broadcast a drill alert, see it listed, then resolve it', async ({ page }) => {
    const message = `E2E drill ${Date.now()}`;
    await page.getByRole('link', { name: 'Alerts' }).click();
    await page.getByLabel('Drill').check();
    await page.getByLabel('Message', { exact: true }).fill(message);
    await page.getByRole('button', { name: 'Broadcast' }).click();
    const row = page.getByRole('row').filter({ hasText: message });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Resolve' }).click();
    await expect(row.getByText('resolved')).toBeVisible();
  });

  test('open an SOS and send a message', async ({ page }) => {
    // The student raises an SOS from the app (bearer token), then the officer answers it.
    const login = await page.request.post('/api/auth/login', { data: { email: demoEmail('student'), password: DEMO_PASSWORD, device_name: 'e2e' } });
    const { token } = await login.json();
    const sos = await page.request.post('/api/sos', { headers: { Authorization: `Bearer ${token}` }, data: { message: 'E2E help' } });
    const { sos: { id } } = await sos.json();

    await page.goto(`/command/sos/${id}`);
    const reply = `On our way ${Date.now()}`;
    await page.getByLabel('Message').fill(reply);
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(reply)).toBeVisible();
    await page.getByRole('button', { name: 'Resolve' }).click();
    await expect(page.locator('.chat .chip')).toHaveText('resolved');
  });

  test('block a path, see it on the plan, then reopen it', async ({ page }) => {
    await page.getByRole('link', { name: 'Paths' }).click();
    await page.getByLabel('Building', { exact: true }).selectOption('A1');
    await page.getByLabel('Floor', { exact: true }).selectOption('1');
    await page.getByRole('button', { name: 'Open path, C1 to C2' }).click();
    const panel = page.getByRole('region', { name: 'Selected path' });
    await panel.getByRole('button', { name: 'Blocked' }).click();
    await expect(page.getByRole('button', { name: 'Blocked path, C1 to C2' })).toBeVisible();
    await panel.getByRole('button', { name: 'Open' }).click();
    await expect(page.getByRole('button', { name: 'Open path, C1 to C2' })).toBeVisible();
  });
});
