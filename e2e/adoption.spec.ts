import { expect, test, type Page } from '@playwright/test';

/** Phase 50 adoption smoke skeleton: six flows, theme parity baseline (U1..U6). */
test.describe('Phase 50 adoption', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/task-management/');
    await expect(page.locator('.taskmate-workbench-theme')).toBeVisible();
  });

  async function themeMode(page: Page): Promise<string> {
    return page.locator('.taskmate-workbench-theme').getAttribute('data-theme') ?? '';
  }

  async function toggleTheme(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Chuyển đổi giao diện sáng/tối' }).click();
  }

  async function cssVar(page: Page, name: string): Promise<string> {
    return page.evaluate(
      (varName) => getComputedStyle(document.documentElement).getPropertyValue(varName).trim(),
      name,
    );
  }

  async function themeParity(page: Page): Promise<void> {
    const before = await themeMode(page);
    const accentBefore = await cssVar(page, '--accent');
    await toggleTheme(page);
    await expect.poll(() => themeMode(page)).not.toBe(before);
    expect(await cssVar(page, '--accent')).not.toBe(accentBefore);
  }

  test('U1 task quick-add survives light/dark toggle', async ({ page }) => {
    await themeParity(page);
    const input = page.locator('[data-shortcut-id="quick-add-input"]').first();
    if (await input.count()) await expect(input).toBeVisible();
  });

  test('U2 settings CRUD theme parity baseline', async ({ page }) => {
    await themeParity(page);
    expect(await cssVar(page, '--font-size-ui')).toBe('13px');
  });

  test('U3 CR detail actions theme parity baseline', async ({ page }) => {
    await themeParity(page);
    expect(await cssVar(page, '--radius-control')).toBe('4px');
  });

  test('U4 modal forms theme parity baseline', async ({ page }) => {
    await themeParity(page);
    expect(await cssVar(page, '--accent-soft')).not.toBe('');
  });

  test('U5 toolbar icon buttons theme parity baseline', async ({ page }) => {
    await themeParity(page);
    const toggle = page.getByRole('button', { name: 'Chuyển đổi giao diện sáng/tối' });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-label', 'Chuyển đổi giao diện sáng/tối');
  });

  test('U6 AI chat controls theme parity baseline', async ({ page }) => {
    await themeParity(page);
    expect(await cssVar(page, '--bg-island')).not.toBe('');
  });
});
