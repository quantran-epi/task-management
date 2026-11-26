import { expect, test, type Page } from '@playwright/test';

/**
 * Quick 261126-diw/ky8 Chromium smoke: AI settings full-width Modal, composer Modal,
 * endpoint persistence, standalone DB isolation and light/dark token parity.
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
    // Known AntD 6 deprecation notices from pre-existing components; scoped to exact messages
    // so a new deprecation in this flow still fails the smoke test.
    const knownNotices = [
      '[antd: Tooltip] `overlayStyle` is deprecated',
      '[antd: Modal] `destroyOnClose` is deprecated',
      '[antd: Drawer] `destroyOnClose` is deprecated',
      '[antd: InputNumber] `addonAfter` is deprecated',
      '[antd: Notification] `message` is deprecated',
      '[antd: Alert] `message` is deprecated',
      '[antd: Space] `direction` is deprecated',
      '[antd: Dropdown] `overlayStyle` is deprecated',
      '[rc-collapse] `children` will be removed in next major version',
    ];
    const expectedNoise = (text: string) =>
      text.includes('localhost:20128') ||
      text.includes('net::ERR_FAILED') ||
      text.includes('net::ERR_NAME_NOT_RESOLVED') ||
      knownNotices.some((notice) => text.includes(notice));
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !expectedNoise(msg.text())) errors.push(`console: ${msg.text()}`);
    });
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    return errors;
  }

  function settingsDialog(page: Page) {
    return page.locator('.ant-modal').filter({ has: page.getByText('AI Settings · tất cả') });
  }

  async function settingValue(targetPage: Page, name: string, key: string): Promise<unknown> {
    return targetPage.evaluate(async ({ name: dbName, settingKey }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        if (!db.objectStoreNames.contains('settings')) return undefined;
        return await new Promise<unknown>((resolve, reject) => {
          const request = db.transaction('settings', 'readonly').objectStore('settings').get(settingKey);
          request.onsuccess = () => resolve(request.result?.value);
          request.onerror = () => reject(request.error);
        });
      } finally {
        db.close();
      }
    }, { name, settingKey: key });
  }

  async function activeStandaloneModel(page: Page): Promise<string | undefined> {
    return page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('TaskMateChatWindowDB');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise<string | undefined>((resolve, reject) => {
          const request = db.transaction('chatTabs', 'readonly').objectStore('chatTabs').getAll();
          request.onsuccess = () => resolve(
            (request.result as Array<{ active?: boolean; config?: { model?: string } }>)
              .find((tab) => tab.active)?.config?.model
          );
          request.onerror = () => reject(request.error);
        });
      } finally {
        db.close();
      }
    });
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
    // AntD animates the panel width; poll instead of sampling the first frame.
    await expect.poll(async () => (await dialog.boundingBox())?.width ?? 0).toBeGreaterThan(600); // calc(100vw - 48px) capped at maxWidth 1200
    await expect(dialog.getByRole('navigation', { name: 'Cài đặt AI' })).toBeVisible();
    await expect(dialog.getByRole('navigation', { name: 'Cài đặt AI' }).getByRole('button')).toHaveCount(7);
    await expect(dialog.getByRole('button', { name: 'SSH Connections' })).toHaveCount(0);
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

  test('standalone chat: SSH connection, default model, persistence and theme parity in its own DB', async ({ page }) => {
    const errors = watchErrors(page);
    await page.route('**/v1/models', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ id: 'ky8-standalone-model' }] }),
      });
    });
    await page.goto('/task-management/e2e/aiChatStandalone.html');
    await expect(page.locator('.taskmate-workbench-theme').first()).toBeVisible();
    await expect(page.getByTestId('chat-settings-gear')).toBeVisible();

    const nav = () => page.getByRole('navigation', { name: 'Cài đặt AI' });
    async function openStandaloneSettings(): Promise<void> {
      const gear = page.getByRole('button', { name: 'Mở Cài đặt AI' });
      await gear.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByText('AI Settings · tất cả')).toBeVisible();
      await expect(nav().getByRole('button')).toHaveCount(8);
    }

    await openStandaloneSettings();
    await nav().getByRole('button', { name: 'SSH Connections' }).click();
    await page.getByRole('button', { name: 'Thêm kết nối SSH' }).click();
    await page.getByLabel('Tên gợi nhớ').fill('Ky8 fixture');
    await page.getByLabel('Host / IP').fill('127.0.0.1');
    await page.getByLabel('Tên đăng nhập (Username)').fill('test');
    await page.getByLabel('Mật khẩu SSH').fill('fake-e2e-secret');
    await page.getByRole('button', { name: 'Lưu cấu hình' }).click();
    await expect(page.getByText('Ky8 fixture')).toBeVisible();
    expect(await settingValue(page, 'TaskMateChatWindowDB', 'ssh_configurations')).toEqual([
      expect.objectContaining({ name: 'Ky8 fixture', host: '127.0.0.1' }),
    ]);
    expect(await settingValue(page, 'PersonalTaskPlannerDB', 'ssh_configurations')).toBeUndefined();

    await page.reload();
    await expect(page.locator('.taskmate-workbench-theme').first()).toBeVisible();
    await openStandaloneSettings();
    await nav().getByRole('button', { name: 'SSH Connections' }).click();
    await expect(page.getByText('Ky8 fixture')).toBeVisible();

    await nav().getByRole('button', { name: 'Provider' }).click();
    await page.getByPlaceholder('Nhập 9router API Key (sk-...)').fill('sk-ky8-standalone-fake');
    await page.getByRole('button', { name: 'Kiểm tra kết nối 9router' }).click();
    await expect(page.getByText(/Đã tìm thấy 1 mô hình AI/)).toBeVisible();
    // Model discovery seeded the Select from the fake /v1/models response; save it.
    await page.getByRole('button', { name: 'Lưu tất cả cấu hình' }).click();
    await expect(page.getByText(/Lưu cấu hình thành công/i)).toBeVisible();
    await page.locator('.ant-modal-close').click();
    await expect(page.locator('.ant-modal-container')).toHaveCount(0);
    // Reload so the chat drawer's model effect re-reads the saved default.
    await page.reload();
    await expect(page.locator('.taskmate-workbench-theme').first()).toBeVisible();
    await page.getByRole('button', { name: 'Mở tab chat AI mới' }).click();
    await expect.poll(() => activeStandaloneModel(page)).toBe('ky8-standalone-model');

    await page.reload();
    await expect(page.locator('.taskmate-workbench-theme').first()).toBeVisible();
    await expect.poll(() => activeStandaloneModel(page)).toBe('ky8-standalone-model');
    await openStandaloneSettings();
    await nav().getByRole('button', { name: 'SSH Connections' }).click();
    await expect(page.getByText('Ky8 fixture')).toBeVisible();

    const lightTheme = await themeMode(page);
    const lightAccent = await cssVar(page, '--accent');
    const lightRadius = await cssVar(page, '--radius-control');
    const lightFont = await cssVar(page, '--font-size-ui');
    await page.locator('.ant-modal-close').click();
    await expect(page.locator('.ant-modal-container')).toHaveCount(0);
    await page.getByRole('button', { name: 'Chuyển đổi giao diện sáng/tối' }).click();
    expect(await themeMode(page)).not.toBe(lightTheme);
    expect(await cssVar(page, '--accent')).not.toBe(lightAccent);
    expect(await cssVar(page, '--radius-control')).toBe(lightRadius);
    expect(await cssVar(page, '--font-size-ui')).toBe(lightFont);
    await openStandaloneSettings();
    const darkBg = await settingsDialog(page).locator('.ant-modal-container').evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    await page.locator('.ant-modal-close').click();
    await expect(page.locator('.ant-modal-container')).toHaveCount(0);
    await page.getByRole('button', { name: 'Chuyển đổi giao diện sáng/tối' }).click();
    await openStandaloneSettings();
    const lightBg = await settingsDialog(page).locator('.ant-modal-container').evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(darkBg).not.toBe(lightBg);
    await expectNoErrors(errors);
  });
});
