// Screenshots for the walkthrough (docs/images/*.jpg), taken from the running Docker stack with the demo accounts.
// Read-only: it signs in and looks, it never sends alerts, reports or SOS.
//   docker compose -f docker/compose.yml up -d        (with an active drill, for the alert screenshots)
//   npx playwright install chromium                   (once; or E2E_CHANNEL=msedge to use installed Edge)
//   node scripts/capture-screens.mjs
import { chromium } from '@playwright/test';

const APP = process.env.E2E_APP_URL ?? 'http://localhost:8081';
const API = process.env.E2E_API_URL ?? 'http://localhost:8000';
const PASSWORD = process.env.E2E_PASSWORD ?? 'evacuai-demo';
const out = name => new URL(`../docs/images/${name}.jpg`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const shot = (page, name, fullPage = false) => page.screenshot({ path: out(name), type: 'jpeg', quality: 72, fullPage });

// Software WebGL so the 3D shots render without a GPU.
const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chromium', args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });

// Phone app (web build), phone-sized.
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const app = await phone.newPage();
async function appSignIn(email) {
  await app.goto(`${APP}/login`);
  await app.evaluate(() => localStorage.clear());
  await app.goto(`${APP}/login`);
  await app.getByLabel('Email').fill(email);
  await app.getByLabel('Password').fill(PASSWORD);
  await app.getByRole('button', { name: 'Sign in' }).click();
}
await app.goto(`${APP}/login`);
await app.waitForTimeout(1500);
await shot(app, 'app-sign-in');
await appSignIn('student@evacuai.test');
await app.getByText('Welcome, Demo Student').waitFor({ timeout: 45_000 });
await app.waitForTimeout(1500);
await shot(app, 'app-home');
await app.getByRole('button', { name: /evacuation route/i }).first().click();
await app.getByRole('button', { name: 'Pick my room' }).click();
await app.getByRole('button', { name: 'Basic Education Building' }).click();
await app.getByRole('button', { name: 'Third' }).click();
await app.getByRole('button', { name: 'BE301' }).click();
await app.getByText(/m to safety/).waitFor();
await app.waitForTimeout(800);
await shot(app, 'app-route', true);
await app.goto(`${APP}/map`);
await app.getByRole('button', { name: 'Annex 1' }).click();
await app.getByRole('button', { name: '3D', exact: true }).click();
await app.locator('canvas').waitFor();
await app.waitForTimeout(3500);
await shot(app, 'app-3d', true);
await app.goto(`${APP}/sos`);
await app.getByRole('button', { name: /Send SOS|Send message/ }).waitFor();
await app.waitForTimeout(800);
await shot(app, 'app-sos');
await appSignIn('safety_officer@evacuai.test');
await app.getByText('Responder', { exact: true }).waitFor({ timeout: 45_000 });
await app.waitForTimeout(1500);
await shot(app, 'app-responder');
await phone.close();

// Command Center and admin panel, laptop-sized.
const desk = await browser.newContext({ viewport: { width: 1366, height: 820 } });
const web = await desk.newPage();
await web.goto(`${API}/command/sign-in`);
await web.getByLabel('Email').fill('safety_officer@evacuai.test');
await web.getByLabel('Password').fill(PASSWORD);
await web.getByRole('button', { name: 'Sign in' }).click();
await web.getByRole('heading', { name: 'Live Ops' }).waitFor({ timeout: 45_000 });
await web.getByLabel('Building', { exact: true }).selectOption('A1');
await web.waitForTimeout(2500);
await shot(web, 'command-live-ops');
await web.getByRole('button', { name: '3D', exact: true }).click();
const bar = web.getByRole('toolbar', { name: '3D view controls' });
await bar.waitFor({ timeout: 30_000 });
await web.waitForTimeout(2500);
await bar.getByRole('button', { name: 'Third' }).click();
await web.waitForTimeout(1500);
await shot(web, 'command-3d-floor');
await bar.getByRole('button', { name: 'All floors' }).click();
await bar.getByLabel('Explode floors').fill('2.5');
await web.waitForTimeout(1800);
await shot(web, 'command-3d-exploded');
await web.getByRole('link', { name: 'Alerts' }).click();
await web.getByRole('heading', { name: 'Alerts', exact: true }).waitFor();
await web.waitForTimeout(800);
await shot(web, 'command-alerts');
await web.getByRole('link', { name: 'Safety' }).click();
await web.getByRole('heading', { name: 'Safety', exact: true }).waitFor();
await web.waitForTimeout(1200);
await shot(web, 'command-safety');
await desk.close();

const adminCtx = await browser.newContext({ viewport: { width: 1366, height: 820 } });
const admin = await adminCtx.newPage();
await admin.goto(`${API}/admin/login`);
await admin.getByLabel('Email address').fill('admin@evacuai.test');
await admin.locator('input[type=password]').fill(PASSWORD);
await admin.getByRole('button', { name: 'Sign in' }).click();
await admin.getByRole('link', { name: 'Command Center' }).waitFor({ timeout: 45_000 });
await admin.goto(`${API}/admin/users`);
await admin.waitForTimeout(1500);
await shot(admin, 'admin-users');
await adminCtx.close();

await browser.close();
console.log('docs/images: screenshots updated');
