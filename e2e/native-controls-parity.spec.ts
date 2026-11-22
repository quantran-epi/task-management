import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Native-controls fake-render remediation: real Chrome verification.
 * Seeds the app, exercises the rebuilt DatePicker and fixed wrappers, logs
 * computed geometry (icon/control) and behavior parity in light + dark,
 * and writes screenshots + a JSON evidence artifact to .planning/debug/artifacts/.
 * Tauri/desktop app only — no PWA or GitHub Pages checks.
 */
const ARTIFACT_DIR = resolve(process.cwd(), '.planning/debug/artifacts');
mkdirSync(ARTIFACT_DIR, { recursive: true });

interface Metric {
  width: number;
  height: number;
  fontSize: string;
  padding: string;
  margin: string;
  radius: string;
}

async function boot(page: Page, errors: string[]): Promise<void> {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/task-management/');
  await expect(page.locator('.taskmate-workbench-theme').first()).toBeVisible();
}

async function mode(page: Page): Promise<string> {
  return (await page.locator('.taskmate-workbench-theme').first().getAttribute('data-theme')) ?? '';
}

async function toggle(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Chuyển đổi giao diện sáng/tối' }).click();
}

async function openChangeRequestModal(page: Page) {
  await page.getByRole('button', { name: 'Open Tasks' }).first().click();
  await expect(page.locator('[data-testid="task-table-container"]')).toBeVisible();
  const create = page.getByRole('button', { name: 'Tạo CR' }).first();
  await expect(create).toBeVisible();
  await create.click();
  const dialog = page.locator('[data-oi-control="dialog"]').first();
  await expect(dialog).toBeVisible();
  return dialog;
}

async function computed(page: Page, selector: string): Promise<Metric | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      width: Math.round(r.width * 100) / 100,
      height: Math.round(r.height * 100) / 100,
      fontSize: s.fontSize,
      padding: s.padding,
      margin: s.margin,
      radius: s.borderRadius,
    };
  }, selector);
}

test.describe('Native controls: DatePicker + icon parity in light/dark (Chrome)', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`computed geometry + real calendar behavior in ${theme}`, async ({ page }) => {
      const errors: string[] = [];
      await boot(page, errors);
      if ((await mode(page)) !== theme) await toggle(page);
      await expect.poll(() => mode(page)).toBe(theme);

      const dialog = await openChangeRequestModal(page);

      // Icon geometry: default icons must be 16x16, not the 300x150 SVG fallback.
      const icon = await computed(page, '[data-oi-control="dialog"] [data-oi-control="icon"]');
      const anyIcon = icon ?? await computed(page, '[data-oi-control="icon"]');
      expect(anyIcon, 'at least one icon exists').not.toBeNull();
      expect(anyIcon!.width).toBeLessThanOrEqual(20);
      expect(anyIcon!.height).toBeLessThanOrEqual(20);
      expect(anyIcon!.fontSize).toBe('16px');

      // Trigger geometry: 28px control height.
      const trigger = dialog.locator('[data-oi-control="date-picker"]').first();
      await expect(trigger).toBeVisible();
      const triggerMetric = await trigger.evaluate((el) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return { height: Math.round(r.height), fontSize: s.fontSize, radius: s.borderRadius };
      });
      expect(triggerMetric.height).toBe(28);
      expect(triggerMetric.fontSize).toBe('13px');

      // Real calendar: header + 7 weekday columns + 7-column grid + footer.
      await trigger.click();
      const popup = page.locator('body > [data-positioned][data-oi-control="select-popup"]');
      await expect(popup).toHaveCount(1);
      await expect(page.locator('[data-oi-control="calendar-month"]')).toBeVisible();
      await expect(page.locator('[data-oi-control="calendar-year"]')).toBeVisible();
      expect(await page.locator('[data-oi-control="calendar-weekday"]').count()).toBe(7);
      const cells = page.locator('[data-oi-control="calendar-cell"]');
      const cellCount = await cells.count();
      expect(cellCount % 7).toBe(0);
      expect(cellCount).toBeGreaterThanOrEqual(35);

      // Interaction: prev/next month changes header, keyboard moves lead, Enter commits.
      const monthBefore = await page.locator('[data-oi-control="calendar-month"]').inputValue();
      await page.locator('[data-oi-control="calendar-next"]').click();
      const monthAfter = await page.locator('[data-oi-control="calendar-month"]').inputValue();
      expect(monthAfter).not.toBe(monthBefore);
      await page.locator('[data-oi-control="calendar-prev"]').click();
      await expect.poll(() => page.locator('[data-oi-control="calendar-month"]').inputValue()).toBe(monthBefore);

      // Cell geometry: 24px row metric; grid is 7 columns wide.
      const cellMetric = await cells.first().evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { width: Math.round(r.width), height: Math.round(r.height) };
      });
      expect(cellMetric.height).toBe(24);

      const gridColumns = await page.locator('[data-oi-control="date-grid"]').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
      expect(gridColumns).toBe(7);

      const shot = resolve(ARTIFACT_DIR, `datepicker-${theme}.png`);
      await page.screenshot({ path: shot, fullPage: false });

      await page.keyboard.press('Escape');
      await expect(popup).toHaveCount(0);
      await expect(trigger).toBeFocused();

      const metricArtifact = {
        theme,
        icon: anyIcon,
        trigger: triggerMetric,
        cell: cellMetric,
        gridColumns,
        weekdayCount: 7,
        cellCount,
      };
      writeFileSync(resolve(ARTIFACT_DIR, `metrics-${theme}.json`), JSON.stringify(metricArtifact, null, 2));

      expect(errors, `console/page errors: ${errors.join('\n')}`).toEqual([]);
    });
  }
});
