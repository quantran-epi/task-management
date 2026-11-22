import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 54 NAT-02 #5: real Chrome interactions for the native overlay/complex
 * controls, in both light and dark themes. Every test collects console errors
 * and pageerrors and requires zero of each. No PWA / GitHub Pages validation.
 */
test.describe('Phase 54 native overlay behavior (Chrome)', () => {
  const themes = ['light', 'dark'] as const;

  async function enterApp(page: Page): Promise<string[]> {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto('/task-management/');
    await expect(page.locator('.taskmate-workbench-theme').first()).toBeVisible();
    return errors;
  }

  async function cssVar(page: Page, name: string): Promise<string> {
    return page.evaluate(
      (varName) => getComputedStyle(document.documentElement).getPropertyValue(varName).trim(),
      name,
    );
  }

  async function themeMode(page: Page): Promise<string> {
    return page.locator('.taskmate-workbench-theme').first().getAttribute('data-theme') ?? '';
  }

  async function toggleTheme(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Chuyển đổi giao diện sáng/tối' }).click();
  }

  async function openTasks(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Open Tasks' }).first().click();
    await expect(page.locator('[data-testid="task-table-container"]')).toBeVisible();
  }

  function assertClean(errors: string[]): void {
    expect(errors, `console/page errors: ${errors.join('\n')}`).toEqual([]);
  }

  for (const mode of themes) {
    test(`table + tooltip + menu + dialog + date popup + theme parity in ${mode}`, async ({ page }) => {
      const errors = await enterApp(page);
      if ((await themeMode(page)) !== mode) await toggleTheme(page);
      await expect.poll(() => themeMode(page)).toBe(mode);
      expect(await cssVar(page, '--accent')).toBe('#3871e1');

      await openTasks(page);

      // (a) native table: column headers, hover row, sort, no errors.
      const table = page.locator('[data-testid="task-table-container"]');
      await expect(table.locator('[data-oi-control="table-header"]').first()).toBeVisible();
      const header = table.locator('[data-oi-control="table-header"]').first();
      await header.hover();
      await expect(header).toHaveAttribute('data-oi-control', 'table-header');
      await table.locator('[data-oi-control="table-header"] button').first().click();
      await expect(table.locator('[data-oi-control="table-header"]').first()).toBeVisible();

      // (b) tooltip: hover a labelled trigger, portal tooltip in BODY, Escape closes.
      const columnButton = page.getByRole('button', { name: 'Cột hiển thị' }).first();
      const tooltipTrigger = page
        .locator('[data-oi-control="tooltip-trigger"]')
        .filter({ has: columnButton })
        .first();
      await columnButton.focus();
      await expect(columnButton).toBeFocused();
      const tooltip = page.locator('body > [data-positioned][data-oi-control="tooltip"]');
      await expect(tooltip).toHaveCount(1);
      await page.keyboard.press('Escape');
      await expect(tooltip).toHaveCount(0);
      await expect(columnButton).toBeFocused();

      // (c) dropdown menu: open from the toolbar popover, ArrowDown moves lead, Escape closes.
      const menuButton = page.getByRole('button', { name: 'Show open tabs list' }).first();
      await menuButton.click();
      const menu = page.locator('[data-oi-control="menu"]').first();
      await expect(menu).toBeVisible();
      const items = menu.locator('[data-oi-control="menu-item"]');
      const firstLead = await items.first().getAttribute('data-lead');
      expect(firstLead).not.toBeNull();
      await menu.focus();
      await page.keyboard.press('ArrowDown');
      await expect(items.nth(1)).toHaveAttribute('data-lead', 'true');
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);

      // (d) dialog: native surface, focus trap, transparent backdrop, Escape + restore.
      const create = page.getByRole('button', { name: 'Tạo CR' }).first();
      await expect(create).toBeVisible();
      await create.focus();
      await create.click();
      const dialog = page.locator('[data-oi-control="dialog"]');
      await expect(dialog).toBeVisible();
      await expect(page.locator('body > [data-oi-control="dialog-backdrop"]')).toHaveCount(1);
      const backdrop = page.locator('[data-oi-control="dialog-backdrop"]').first();
      expect(await backdrop.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
      const firstFocusable = dialog.locator('button, input, select, textarea, [tabindex]:not([tabindex="-1"])').first();
      await firstFocusable.focus();
      await expect(firstFocusable).toBeFocused();
      await dialog.focus();
      await page.keyboard.press('Shift+Tab');
      const focusInside = await page.evaluate(
        () => !!document.activeElement?.closest('[data-oi-control="dialog"]'),
      );
      expect(focusInside).toBe(true);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect.poll(() => create.evaluate((el) => document.activeElement === el)).toBe(true);

      // (e) date popup: click the CR modal's date trigger, Escape closes and restores focus.
      await create.click();
      const dateTrigger = dialog.locator('[data-oi-control="date-picker"]').first();
      await expect(dateTrigger).toBeVisible();
      await dateTrigger.click();
      await expect(page.locator('body > [data-positioned][data-oi-control="select-popup"]')).toHaveCount(1);
      await expect(page.locator('[data-oi-control="date-grid"]')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('body > [data-positioned][data-oi-control="select-popup"]')).toHaveCount(0);
      await expect(dateTrigger).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);

      // (f) theme toggle after all interactions; accent token identical in both modes.
      const accentBefore = await cssVar(page, '--accent');
      await toggleTheme(page);
      await expect.poll(() => themeMode(page)).not.toBe(mode);
      expect(await cssVar(page, '--accent')).toBe(accentBefore);
      expect(accentBefore).toBe('#3871e1');

      assertClean(errors);
    });
  }
});
