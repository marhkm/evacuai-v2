import { test as base, expect } from '@playwright/test';

/** Demo accounts from api/database/seeders/DemoSeeder.php (local/student stacks only; never in production). */
export const DEMO_PASSWORD = process.env.E2E_PASSWORD ?? 'evacuai-demo';
export const demoEmail = (role: 'student' | 'safety_officer' | 'admin') => `${role}@evacuai.test`;

/** Every test fails on an uncaught page error (the class of bug that only shows up in the built app). */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await use(errors);
    expect(errors, 'uncaught errors in the page').toEqual([]);
  }, { auto: true }],
});

export { expect };
