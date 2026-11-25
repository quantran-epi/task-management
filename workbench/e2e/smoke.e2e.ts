import { expect, test } from '@playwright/test';
import { seedV28InBrowser } from './helpers';

/** App boots through the real Vite webServer; seeded V28 CR/tasks render on screen. */
test('V28 seed visible on real app shell', async ({ page }) => {
  const seeded = await seedV28InBrowser(page);
  await expect(page.getByText(seeded.crCode, { exact: false }).first()).toBeVisible();
  // Task 3 is Done and hidden by the default task filter; task 1 is always shown.
  await expect(page.getByText('V28 task 1', { exact: false }).first()).toBeVisible();
  expect(seeded.taskNames).toContain('V28 task 1');
  await expect(page.locator('.taskmate-workbench-theme').first()).toBeVisible();
});
