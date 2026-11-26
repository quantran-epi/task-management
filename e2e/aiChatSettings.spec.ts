import { expect, test, type Page } from '@playwright/test';

/**
 * Quick 261126-diw Chromium smoke: AI settings full-width Modal, composer Modal,
 * endpoint persistence and light/dark token parity in the real app shell.
 */
test.describe('AI chat settings and composer modals', () => {
  async function enterApp(page: Page): Promise<void> {
    await page.goto('/task-management/');
    await expect(page.locator('.taskmate-workbench-theme').first()).toBeVisible();
  }

  async function openAiAssistant(page: Page): Promise<void> {
    const stripe = page.getByTestId('stripe-btn-ai_chat');
    if ((await stripe.getAttribute('aria-pressed')) !== 'true') await stripe.click();
    await expect(page.getByTestId('chat-settings-gear')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Nội dung tin nhắn trò chuyện AI' })).toBeVisible();
  }

  async function openSettings(page: Page): Promise<void> {
    // Focus + Enter avoids tooltip overlays stealing a coordinate click after reload/theme change.
    const gear = page.getByRole('button', { name: 'Mở Cài đặt AI' });
    await expect(gear).toBeVisible();
    await gear.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('AI Settings · tất cả')).toBeVisible();
  }

  async function themeMode(page: Page): Promise<string> {
    return page.locator('.taskmate-workbench-theme').first().getAttribute('data-theme') ?? '';
  }

  async function cssVar(page: Page, name: string): Promise<string> {
    return page.evaluate(
      (varName) => getComputedStyle(document.documentElement).getPropertyValue(varName).trim(),
      name,
    );
  }

  async function toggleTheme(page: Page): Promise<void> {
    // Modal overlay blocks the title-bar switch; close it before toggling.
    const dialog = settingsDialog(page);
    await dialog.locator('.ant-modal-close').click();
    await expect(page.locator('.ant-modal-container')).toHaveCount(0);
    await page.mouse.move(640, 700);
    await page.getByRole('button', { name: 'Chuyển đổi giao diện sáng/tối' }).click();
  }

  async function expectNoErrors(errors: string[]): Promise<void> {
    expect(errors).toEqual([]);
  }

  function watchErrors(page: Page): string[] {
    const errors: string[] = [];
    // Model discovery is a best-effort background fetch to localhost:20128; a missing
    // local daemon is expected in CI and must not be confused with a UI error.
    // AntD 6 logs deprecation notices via console.error app-wide; they are not UI failures.
    const expectedNoise = (text: string) =>
      text.includes('localhost:20128') ||
      text.includes('net::ERR_FAILED') ||
      text.includes('net::ERR_NAME_NOT_RESOLVED') ||
      text.startsWith('Warning:') &&
      (text.includes('deprecated') || text.includes('will be removed in next major version'));
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !expectedNoise(msg.text())) errors.push(`console: ${msg.text()}`);
    });
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    return errors;
  }

  function settingsDialog(page: Page) {
    return page.locator('.ant-modal').filter({ has: page.getByText('AI Settings · tất cả') });
  }

  test.beforeEach(async ({ page }) => {
    await enterApp(page);
  });

  test('settings Modal: full width, saved endpoint survives reload, theme parity', async ({ page }) => {
    const errors = watchErrors(page);
    await openAiAssistant(page);
    await openSettings(page);

    const dialog = settingsDialog(page);
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(600); // calc(100vw - 48px) capped at maxWidth 1200
    await expect(dialog.getByRole('navigation', { name: 'Cài đặt AI' })).toBeVisible();
    await expect(dialog.getByText('API Endpoint')).toBeVisible();

    const endpoint = dialog.locator('.ant-form-item').filter({ hasText: 'API Endpoint' }).locator('input').first();
    await endpoint.fill('https://ai.example.test/v1');
    await dialog.getByRole('button', { name: 'Lưu tất cả cấu hình' }).click();
    await expect(page.getByText(/Lưu cấu hình thành công/i)).toBeVisible();

    await page.reload();
    await expect(page.locator('.taskmate-workbench-theme').first()).toBeVisible();
    await openAiAssistant(page);
    await openSettings(page);
    await expect(
      settingsDialog(page).locator('.ant-form-item').filter({ hasText: 'API Endpoint' }).locator('input').first()
    ).toHaveValue('https://ai.example.test/v1');

    const lightTheme = await themeMode(page);
    const lightAccent = await cssVar(page, '--accent');
    const lightRadius = await cssVar(page, '--radius-control');
    const lightFont = await cssVar(page, '--font-size-ui');
    await toggleTheme(page);
    expect(await themeMode(page)).not.toBe(lightTheme);
    expect(await cssVar(page, '--accent')).not.toBe(lightAccent);
    expect(await cssVar(page, '--radius-control')).toBe(lightRadius);
    expect(await cssVar(page, '--font-size-ui')).toBe(lightFont);

    await openSettings(page);
    const darkBg = await settingsDialog(page).locator('.ant-modal-container').evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    await toggleTheme(page);
    await openSettings(page);
    const lightBg = await settingsDialog(page).locator('.ant-modal-container').evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(darkBg).not.toBe(lightBg);
    await expectNoErrors(errors);
  });

  test('composer Modal: tall scratchpad, orchestrator-only path, no analysis/auto-approve toggles', async ({ page }) => {
    const errors = watchErrors(page);
    const completionRequests: Array<{ url: string; body: string }> = [];
    let modelRequests = 0;
    await page.route('**/v1/chat/completions', async (route) => {
      const request = route.request();
      completionRequests.push({ url: request.url(), body: request.postData() ?? '' });
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: {"choices":[{"delta":{"content":"Kết quả phân tích."},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
      });
    });
    await page.route('**/v1/models', async (route) => {
      modelRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ id: 'gpt-4o' }] }),
      });
    });
    await openAiAssistant(page);
    // Chat refuses to send without an API key; set one through the real settings Modal.
    await openSettings(page);
    const settings = settingsDialog(page);
    await settings.getByPlaceholder('Nhập 9router API Key (sk-...)').fill('sk-e2e-analysis-mode');
    await settings.getByRole('button', { name: 'Lưu tất cả cấu hình' }).click();
    await toggleTheme(page); // closes the modal without relying on Escape

    expect(page.getByRole('button', { name: /Phân tích/i })).toHaveCount(0);
    expect(page.getByRole('button', { name: /Tự duyệt/i })).toHaveCount(0);
    expect(page.getByTestId('tab-auto-approve-btn')).toHaveCount(0);

    await page.getByRole('textbox', { name: 'Nội dung tin nhắn trò chuyện AI' })
      .fill('Tóm tắt tiến độ hôm nay');
    await page.getByRole('button', { name: 'Gửi tin nhắn' }).click();
    await expect(page.getByText('Kết quả phân tích.')).toBeVisible({ timeout: 20_000 });
    expect(modelRequests).toBeGreaterThan(0);
    const firstCompletion = completionRequests[0];
    expect(firstCompletion).toBeDefined();
    expect(firstCompletion!.url).toContain('/v1/chat/completions');
    const firstPayload = JSON.parse(firstCompletion!.body) as {
      messages: Array<{ role: string; content: string }>;
      stream: boolean;
      stream_options?: { include_usage?: boolean };
    };
    expect(firstPayload.stream).toBe(true);
    expect(firstPayload.stream_options?.include_usage).toBe(true);
    expect(firstPayload.messages[0]?.role).toBe('system');
    expect(firstPayload.messages[0]?.content).toContain('[ANALYSIS MODE ACTIVE]');
    expect(firstPayload.messages.at(-1)?.content).toBe('Tóm tắt tiến độ hôm nay');
    expect(firstPayload.messages.some((m) => m.role === 'assistant')).toBe(false);

    await page.getByRole('button', { name: 'Mở rộng soạn thảo' }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Soạn thảo tin nhắn AI toàn màn hình' });
    await expect(dialog).toBeVisible();
    const scratchpad = dialog.locator('textarea[aria-label="Soạn thảo tin nhắn mở rộng"]');
    await expect(scratchpad).toBeVisible();
    // AntD textarea auto-sizes in a rAF; wait for the measured height instead of catching the first frame.
    await expect.poll(async () => (await scratchpad.boundingBox())?.height ?? 0).toBeGreaterThan(200);
    await scratchpad.fill('Câu hỏi kiểm tra composer mở rộng');
    await dialog.getByRole('button', { name: 'Gửi ngay' }).click();
    await expect(page.getByRole('textbox', { name: 'Nội dung tin nhắn trò chuyện AI' })).toHaveValue('');
    await expectNoErrors(errors);
  });
});
