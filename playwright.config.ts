import { defineConfig, devices } from '@playwright/test';

/**
 * Browser smoke tests against the running Docker stack (docker compose up): the production web build of the app, the
 * Command Center and the admin panel. Catches what Jest and Pest cannot, e.g. bundler transforms that only break the built app.
 *   npx playwright install chromium   (once)
 *   npm run e2e
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 2, // one local PHP server; more parallel browsers time each other out
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
    // Full Chromium in new headless mode (better WebGL than the headless shell). E2E_CHANNEL=msedge uses installed Edge.
    channel: process.env.E2E_CHANNEL ?? 'chromium',
    // Software WebGL so the 3D views render on machines and CI runners without a GPU.
    launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] },
  },
  projects: [
    { name: 'app', testMatch: 'app.spec.ts', use: { ...devices['Pixel 7'], baseURL: process.env.E2E_APP_URL ?? 'http://localhost:8081' } },
    { name: 'admin', testMatch: 'admin.spec.ts', use: { ...devices['Desktop Chrome'], baseURL: process.env.E2E_API_URL ?? 'http://localhost:8000' } },
    { name: 'command', testMatch: 'command.spec.ts', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, baseURL: process.env.E2E_API_URL ?? 'http://localhost:8000' } },
  ],
});
