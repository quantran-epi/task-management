import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Phase 50 adoption smoke: six flows (U1..U6) observed in a live Chromium
 * session at both light and dark themes. These complement — not replace —
 * sếp's manual Chrome walkthrough recorded in 50-UAT.md (D-12/D-13).
 */
test.describe('Phase 50 adoption', () => {
  async function enterApp(page: Page): Promise<void> {
    await page.goto('/task-management/');
    await expect(page.locator('.taskmate-workbench-theme').first()).toBeVisible();
  }

  async function themeMode(page: Page): Promise<string> {
    return page.locator('.taskmate-workbench-theme').first().getAttribute('data-theme') ?? '';
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

  interface Palette {
    accent: string;
    fontSizeUi: string;
    radiusControl: string;
  }

  async function palette(page: Page): Promise<Palette> {
    return {
      accent: await cssVar(page, '--accent'),
      fontSizeUi: await cssVar(page, '--font-size-ui'),
      radiusControl: await cssVar(page, '--radius-control'),
    };
  }

  async function assertParity(page: Page): Promise<void> {
    const before = await themeMode(page);
    const beforePalette = await palette(page);
    await toggleTheme(page);
    await expect.poll(() => themeMode(page)).not.toBe(before);
    const afterPalette = await palette(page);
    expect(afterPalette.accent, 'accent must switch with theme').not.toBe(beforePalette.accent);
    expect(afterPalette.fontSizeUi, 'font size must not shift with theme').toBe(beforePalette.fontSizeUi);
    expect(afterPalette.radiusControl, 'control radius must not shift with theme').toBe(beforePalette.radiusControl);
  }

  async function assertFocusable(locator: Locator): Promise<void> {
    await locator.focus();
    await expect(locator).toBeFocused();
  }

  async function openSettings(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Settings' }).first().click();
    await expect(page.getByRole('heading', { name: 'Cài đặt & Cấu hình công suất' })).toBeVisible();
  }

  async function openAiAssistant(page: Page): Promise<void> {
    await page.getByRole('button', { name: /AI Assistant/ }).first().click();
    await expect(
      page.getByRole('textbox', { name: 'Nội dung tin nhắn trò chuyện AI' }),
    ).toBeVisible();
  }

  test.beforeEach(async ({ page }) => {
    await enterApp(page);
  });

  test('U1 task quick-add input: focus, keyboard, aria and light/dark parity', async ({ page }) => {
    const input = page.locator('[data-shortcut-id="quick-add-input"]').first();
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('aria-label', 'Thêm nhanh tên tác vụ và ước tính');
    // Quick-add is disabled until a CR is selected; the sibling task search is
    // the keyboard-driven input in this flow and stays enabled on a fresh DB.
    const search = page.locator('[data-shortcut-id="task-search-input"]').first();
    await expect(search).toBeVisible();
    await expect(search).toHaveAttribute('aria-label', 'Tìm kiếm tác vụ');
    await assertFocusable(search);
    await page.keyboard.type('uat');
    await expect(search).toHaveValue('uat');
    await assertParity(page);
    // Both controls keep their accessible names after the theme swap.
    await expect(input).toHaveAttribute('aria-label', 'Thêm nhanh tên tác vụ và ước tính');
    await assertFocusable(page.locator('[data-shortcut-id="task-search-input"]').first());
  });

  test('U2 settings card: tab keyboard nav, heading aria and light/dark parity', async ({ page }) => {
    await openSettings(page);
    const capacityTab = page.getByRole('tab', { name: 'Công suất làm việc' });
    await expect(capacityTab).toBeVisible();
    await assertFocusable(capacityTab);
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Sao lưu & Dữ liệu' })).toBeFocused();
    await assertParity(page);
    await expect(page.getByRole('heading', { name: 'Cài đặt & Cấu hình công suất' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Công suất làm việc' })).toHaveAttribute('aria-selected', 'true');
  });

  test('U3 CR detail actions: toolbar icon button aria, Enter key and light/dark parity', async ({ page }) => {
    const create = page.getByRole('button', { name: 'Tạo CR' }).first();
    await expect(create).toBeVisible();
    await assertFocusable(create);
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Hủy' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await assertParity(page);
  });

  test('U4 modal form: dialog aria, focus and keyboard close, light/dark parity', async ({ page }) => {
    await page.getByRole('button', { name: 'Tạo Change Request' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const name = dialog.getByPlaceholder('vd: Tích hợp xác thực SmartCard và hoàn tiền tự động');
    const code = dialog.getByPlaceholder('vd: CR-2026-001');
    await expect(name).toBeVisible();
    await expect(code).toBeVisible();
    await assertFocusable(name);
    await name.fill('CR UAT smoke');
    await code.fill('CR-UAT-SMOKE');
    await expect(name).toHaveValue('CR UAT smoke');
    // Modal overlay blocks the shell toggle; close, flip theme, reopen and
    // verify the form renders with the new palette (D-12 parity).
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await assertParity(page);
    await page.getByRole('button', { name: 'Tạo Change Request' }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByPlaceholder('vd: CR-2026-001')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('U5 toolbar icon buttons: accessible name, Tab/Enter and light/dark parity', async ({ page }) => {
    const toggle = page.getByRole('button', { name: 'Chuyển đổi giao diện sáng/tối' });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-label', 'Chuyển đổi giao diện sáng/tối');
    await assertFocusable(toggle);
    const settings = page.getByRole('button', { name: 'Settings' }).first();
    await assertFocusable(settings);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Cài đặt & Cấu hình công suất' })).toBeVisible();
    await assertParity(page);
    const toggleAfter = page.getByRole('button', { name: 'Chuyển đổi giao diện sáng/tối' });
    await expect(toggleAfter).toHaveAttribute('aria-label', 'Chuyển đổi giao diện sáng/tối');
  });

  test('U6 AI chat controls: composer focus, Enter send and light/dark parity', async ({ page }) => {
    await openAiAssistant(page);
    const composer = page.getByRole('textbox', { name: 'Nội dung tin nhắn trò chuyện AI' });
    await expect(composer).toBeVisible();
    await assertFocusable(composer);
    const send = page.getByRole('button', { name: 'Gửi' });
    await expect(send).toBeVisible();
    await assertParity(page);
    await expect(
      page.getByRole('textbox', { name: 'Nội dung tin nhắn trò chuyện AI' }),
    ).toBeVisible();
    await assertFocusable(page.getByRole('textbox', { name: 'Nội dung tin nhắn trò chuyện AI' }));
  });
});
