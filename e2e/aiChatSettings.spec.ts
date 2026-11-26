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
      text.includes('net::ERR_CONNECTION_REFUSED') ||
      // Known baseline: pdfjs worker asset fetch in the symlinked worktree Vite dev server.
      (text.includes('Failed to load resource') && text.includes('403 (Forbidden)')) ||
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
    await page.goto('/task-management/e2e/aiChatStandalone.html?rfx=ui');
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

  /**
   * 261126-rfx: confined harness exposes the real standalone boot path plus a synthetic
   * Tauri SSH boundary. The fixture seeds SSH config + FS config in TaskMateChatWindowDB;
   * every tool below runs through production executors, not a mock of the tool family.
   */
  test('RFX standalone: SSH config -> browse -> find -> multi-attach -> info/search/read -> reload chip', async ({ page }) => {
    const errors = watchErrors(page);
    let completions = 0;
    await page.route('**/v1/models', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ id: 'rfx-fixture-model' }] }),
      });
    });
    await page.route('**/v1/chat/completions', async (route) => {
      completions += 1;
      const body = completions === 1
        ? [
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"rfx-info","type":"function","function":{"name":"ssh_attached_file_info","arguments":"{\\"path\\":\\"/srv/taskmate-fixture/reports/plan.docx\\"}"}},{"index":1,"id":"rfx-search","type":"function","function":{"name":"ssh_attached_file_search","arguments":"{\\"path\\":\\"/srv/taskmate-fixture/reports/plan.docx\\",\\"kind\\":\\"name\\",\\"query\\":\\"*.txt\\"}"}},{"index":2,"id":"rfx-read","type":"function","function":{"name":"ssh_attached_file_read","arguments":"{\\"path\\":\\"/srv/taskmate-fixture/reports/plan.docx\\",\\"blockStart\\":1,\\"blockCount\\":1}"}}]},"finish_reason":null}]}\n\n',
            'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
            'data: [DONE]\n\n',
          ].join('')
        : 'data: {"choices":[{"delta":{"content":"Đã đọc tài liệu đính kèm."},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body });
    });

    await page.goto('/task-management/e2e/aiChatStandalone.html?rfx=1');
    await expect(page.locator('.taskmate-workbench-theme').first()).toBeVisible();
    await expect(page.getByTestId('chat-settings-gear')).toBeVisible();

    // (1) config SSH connection and FS base path from the real settings surfaces
    const gear = page.getByRole('button', { name: 'Mở Cài đặt AI' });
    await gear.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('AI Settings · tất cả')).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Cài đặt AI' });
    await expect(nav.getByRole('button')).toHaveCount(8);
    await nav.getByRole('button', { name: 'SSH Connections' }).click();
    await expect(page.getByText('Rfx fixture SSH')).toBeVisible();
    await nav.getByRole('button', { name: 'SSH File System' }).click();
    await expect(page.getByLabel('Thư mục gốc mặc định (Base Path)')).toHaveValue('/srv/taskmate-fixture');
    await page.locator('.ant-modal-close').first().click();
    await expect(page.locator('.ant-modal-container')).toHaveCount(0);

    // (2) browse only in standalone, search by name, multi-select two full paths
    await page.getByRole('button', { name: 'Duyệt tệp SSH từ xa' }).click();
    const browser = page.getByRole('dialog').filter({ hasText: 'Duyệt tệp SSH' });
    await expect(browser).toBeVisible();
    await browser.getByLabel('Tìm tên tệp SSH').fill('*.doc*');
    await browser.getByRole('button', { name: 'Tìm' }).click();
    const docxRow = browser.locator('.ant-tree-treenode').filter({ hasText: 'plan.docx' });
    await expect(docxRow).toBeVisible();
    await docxRow.locator('.ant-tree-checkbox').click();
    await browser.getByRole('button', { name: /Đính kèm \(1\)/ }).click();
    await expect(browser).toHaveCount(0);
    const composerChip = page.locator('.ant-tag').filter({ hasText: 'plan.docx' });
    await expect(composerChip).toBeVisible();

    // (3) real tool family dispatch: info + search + read on the attached identity
    await page.getByRole('textbox', { name: 'Nội dung tin nhắn trò chuyện AI' }).fill('Đọc báo cáo đính kèm');
    await page.getByRole('button', { name: 'Gửi tin nhắn' }).click();
    await expect(page.getByRole('button', { name: /công cụ đã gọi/ })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /công cụ đã gọi/ }).click();
    for (const tool of ['ssh_attached_file_info', 'ssh_attached_file_search', 'ssh_attached_file_read']) {
      await expect(page.locator('[data-tool-call-id]').filter({ hasText: tool }).first()).toBeVisible({ timeout: 20_000 });
    }
    await expect(page.getByText('Đã đọc tài liệu đính kèm.')).toBeVisible({ timeout: 20_000 });
    expect(completions).toBeGreaterThanOrEqual(2);
    const messageChip = page.locator('[data-message-attachment="/srv/taskmate-fixture/reports/plan.docx"]').first();
    await expect(messageChip).toBeVisible();
    await expect(messageChip.locator('button')).toHaveCount(0);

    // (4) chip is durable across reload; it is a message field, not transient UI state
    await page.reload();
    await expect(page.locator('.taskmate-workbench-theme').first()).toBeVisible();
    await expect(page.locator('[data-message-attachment="/srv/taskmate-fixture/reports/plan.docx"]').first()).toBeVisible();
    await expectNoErrors(errors);
  });

  test('RFX dock chat: no browser button, but tool family still advertised with attachment + config', async ({ page }) => {
    const errors = watchErrors(page);
    let payloadCount = 0;
    let firstPayloadTools: string[] = [];
    await page.route('**/v1/chat/completions', async (route) => {
      payloadCount += 1;
      if (payloadCount === 1) {
        const request = route.request();
        const parsed = JSON.parse(request.postData() ?? '') as {
          tools?: Array<{ function?: { name?: string } }>;
        };
        firstPayloadTools = (parsed.tools ?? []).map((tool) => tool.function?.name ?? '');
      }
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: {"choices":[{"delta":{"content":"Dock OK."},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
      });
    });

    // Seed the dock DB through the real IndexedDB settings boundary; the dock settings
    // drawer intentionally has no SSH Connections tab (browser/picker is standalone-only).
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('PersonalTaskPlannerDB');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('settings', 'readwrite');
          tx.objectStore('settings').put({
            key: 'ssh_configurations',
            value: [{
              id: 'rfx-dock-ssh', name: 'Rfx dock SSH', host: 'fixture.invalid', port: 22,
              username: 'uat', authType: 'password',
              createdAt: '2026-11-26T00:00:00.000Z', updatedAt: '2026-11-26T00:00:00.000Z',
            }],
          });
          tx.objectStore('settings').put({
            key: 'ssh_fs_ai_tool_config',
            value: {
              sshConfigId: 'rfx-dock-ssh', defaultBasePath: '/srv/taskmate-fixture',
              maxLinesPerRead: 100, maxListEntries: 100, maxGrepMatches: 50,
            },
          });
          tx.objectStore('settings').put({ key: 'ninerouter_api_key', value: 'sk-rfx-dock' });
          tx.objectStore('settings').put({ key: 'ninerouter_endpoint', value: 'http://localhost:20128' });
          tx.objectStore('settings').put({ key: 'ninerouter_default_model', value: 'rfx-dock-model' });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    });
    await page.reload();
    await expect(page.locator('.taskmate-workbench-theme').first()).toBeVisible();
    await openAiAssistant(page);

    // Docking never exposes the SSH picker; only standalone gets that affordance.
    await expect(page.getByRole('button', { name: 'Duyệt tệp SSH từ xa' })).toHaveCount(0);

    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Tham chiếu tập tin' }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({ name: 'dock-note.txt', mimeType: 'text/plain', buffer: Buffer.from('dock note') });
    await expect(page.locator('.ant-tag').filter({ hasText: 'dock-note.txt' }).first()).toBeVisible();
    await page.getByRole('textbox', { name: 'Nội dung tin nhắn trò chuyện AI' }).fill('Tóm tắt tệp đính kèm');
    await page.getByRole('button', { name: 'Gửi tin nhắn' }).click();
    await expect(page.getByText('Dock OK.')).toBeVisible({ timeout: 20_000 });
    expect(payloadCount).toBeGreaterThan(0);
    for (const tool of ['ssh_attached_file_info', 'ssh_attached_file_search', 'ssh_attached_file_read']) {
      expect(firstPayloadTools, `tools payload must include ${tool}`).toContain(tool);
    }
    await expectNoErrors(errors);
  });

  test('RFX team tool family: advertised via shared gate, out-of-scope attachment refused', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/task-management/e2e/aiChatStandalone.html');
    await expect(page.locator('.taskmate-workbench-theme').first()).toBeVisible();

    const result = await page.evaluate(async () => {
      type Fixture = {
        paths: { docx: string; txt: string };
        teamTools: () => string[];
        teamScope: (paths: string[], repoPaths: string[]) => {
          scope: unknown;
          refusal: string | null;
        };
        dispatchOutOfScope: () => Promise<string>;
      };
      const fixture = (window as unknown as { __rfxFixture: Fixture }).__rfxFixture;
      const outOfScope = fixture.teamScope(['/etc/passwd'], ['/srv/taskmate-fixture']);
      return {
        tools: fixture.teamTools(),
        inScope: fixture.teamScope([fixture.paths.docx], ['/srv/taskmate-fixture']).scope,
        outOfScope,
        dispatch: JSON.parse(await fixture.dispatchOutOfScope()) as {
          success: boolean;
          error?: string;
        },
      };
    });

    for (const tool of ['ssh_attached_file_info', 'ssh_attached_file_search', 'ssh_attached_file_read']) {
      expect(result.tools, `team addenda must include ${tool}`).toContain(tool);
    }
    expect(result.inScope).toMatchObject({ teamId: 'rfx-team' });
    expect(JSON.parse(result.outOfScope.refusal ?? '{}')).toMatchObject({
      success: false,
      code: 'ATTACHMENT_OUT_OF_SCOPE',
    });
    expect(result.dispatch.success).toBe(false);
    expect(result.dispatch.error).toContain('không nằm trong tập file đã đính kèm');
    await expectNoErrors(errors);
  });
});
