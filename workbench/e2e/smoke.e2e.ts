import { expect, test } from '@playwright/test';
import { seedV28InBrowser } from './helpers';

/** App boots through the real Vite webServer; seeded V28 CR/tasks render on screen. */
test('V28 seed visible on real app shell', async ({ page }) => {
  const seeded = await seedV28InBrowser(page);
  await expect(page.getByText(seeded.crCode, { exact: false }).first()).toBeVisible();
  const firstTask = page.getByText(seeded.taskNames[0]!, { exact: false }).first();
  await expect(firstTask).toBeVisible();
  await expect(page.locator('.taskmate-workbench-theme').first()).toBeVisible();
});
