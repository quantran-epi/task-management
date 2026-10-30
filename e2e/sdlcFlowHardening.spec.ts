import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const source = fs.readFileSync(new URL(import.meta.url), 'utf8');

interface MockTransportOptions {
  capturedRequests?: Array<{
    url: string;
    body: any;
    prompt: string;
  }>;
  aiResponseText?: string;
}

async function setupMockTransport(page: Page, options: MockTransportOptions = {}): Promise<void> {
  const captured = options.capturedRequests ?? [];
  const replyText = options.aiResponseText ?? 'Phản hồi thử nghiệm từ hệ thống AI.';

  await page.route('**/v1/chat/completions', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') {
      await route.continue();
      return;
    }

    let body: any = null;
    let prompt = '';
    try {
      body = request.postDataJSON();
      const messages = body?.messages;
      if (Array.isArray(messages)) {
        prompt = messages.map((m: any) => m?.content || '').join('\n');
      }
    } catch {
      // ignore parse error
    }

    captured.push({
      url: request.url(),
      body,
      prompt,
    });

    const isStream = body?.stream ?? true;
    if (isStream) {
      const sseBody = [
        `data: ${JSON.stringify({ choices: [{ delta: { content: replyText } }] })}`,
        '',
        'data: [DONE]',
        '',
        '',
      ].join('\n\n');

      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream; charset=utf-8',
        body: sseBody,
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [{ message: { content: replyText } }],
        }),
      });
    }
  });
}

async function configureAiKey(page: Page): Promise<void> {
  const settingsMenuItem = page.getByRole('menuitem', { name: 'Cài đặt' });
  if (!(await settingsMenuItem.isVisible())) {
    const openMenuBtn = page.getByRole('button', { name: 'Mở menu' });
    if (await openMenuBtn.isVisible()) {
      await openMenuBtn.click();
    }
  }
  await page.getByRole('menuitem', { name: 'Cài đặt' }).click();
  await page.getByRole('tab', { name: /Trợ lý AI & Ghost Dev/ }).click();

  const keyInput = page.getByPlaceholder('Nhập 9router API Key (sk-...)');
  if (await keyInput.isVisible()) {
    await keyInput.fill('sk-mock-taskmate-key');
    await page.getByRole('button', { name: 'Lưu tất cả cấu hình' }).click();
    await expect(page.getByText('Lưu cấu hình thành công')).toBeVisible();
  }
}

async function createProject(page: Page, name: string): Promise<void> {
  const projectMenuItem = page.getByRole('menuitem', { name: 'Dự án' });
  if (!(await projectMenuItem.isVisible())) {
    const openMenuBtn = page.getByRole('button', { name: 'Mở menu' });
    if (await openMenuBtn.isVisible()) {
      await openMenuBtn.click();
    }
  }
  await page.getByRole('menuitem', { name: 'Dự án' }).click();
  await page.getByRole('button', { name: 'Dự án mới' }).click();
  await page.getByLabel('Tên dự án').fill(name);
  await page.getByRole('button', { name: 'Tạo dự án' }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

async function openAiDrawerWithProjectScope(page: Page, projectName: string): Promise<void> {
  const aiButton = page.getByRole('button', { name: 'Trợ lý AI (Cmd+J / Ctrl+J)' });
  await expect(aiButton).toBeVisible();
  await aiButton.click();
  await expect(page.getByText('Trợ lý AI', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Đổi phạm vi ngữ cảnh' }).click();
  const scopeDialog = page.getByRole('dialog');
  await scopeDialog.getByText(projectName, { exact: true }).click();
  await expect(page.getByText(`Đang gắn ngữ cảnh: ${projectName}`, { exact: true })).toBeVisible();
}

test.describe('Phase 25.1 SDLC Flow Hardening & Multi-Tab Isolation Acceptance', () => {
  test.beforeEach(async () => {
    expect(source).not.toContain('page.' + 'setContent');
  });

  test('D-01..D-15: Multi-tab isolation: independent durable tabs, tab creation, switching, and closing', async ({ page }) => {
    await setupMockTransport(page);
    await page.goto('./', { waitUntil: 'commit' });

    const projectName = `SDLC-Tabs-${Date.now()}`;
    await createProject(page, projectName);
    await openAiDrawerWithProjectScope(page, projectName);

    const tabList = page.getByRole('tablist', { name: 'Thanh tab hội thoại AI' });
    await expect(tabList).toBeVisible();

    const sdlcTab = tabList.getByRole('tab').filter({ hasText: /SDLC/ }).first();
    await expect(sdlcTab).toBeVisible();
    await expect(sdlcTab.locator('button, [role="button"]')).toHaveCount(0);

    const firstChatTab = tabList.getByRole('tab').filter({ hasText: '💬 Tra cứu & Hỏi đáp' }).first();
    await expect(firstChatTab).toBeVisible();

    const addTabButton = page.getByRole('button', { name: 'Mở tab chat AI mới' });
    await expect(addTabButton).toBeVisible();
    await addTabButton.click();

    const secondChatTab = tabList.getByRole('tab').filter({ hasText: /💬 Cuộc trò chuyện #2/ }).first();
    await expect(secondChatTab).toBeVisible();
    await expect(secondChatTab).toHaveAttribute('aria-selected', 'true');

    await firstChatTab.click();
    await expect(firstChatTab).toHaveAttribute('aria-selected', 'true');
    await expect(secondChatTab).toHaveAttribute('aria-selected', 'false');

    const closeSecondTabBtn = secondChatTab.locator('[role="button"][aria-label*="Đóng"]');
    await expect(closeSecondTabBtn).toBeVisible();
    await closeSecondTabBtn.click();

    await expect(tabList.getByRole('tab').filter({ hasText: /💬 Cuộc trò chuyện #2/ })).toHaveCount(0);
  });

  test('D-01..D-15: Drawer close and reopen persists tabs and current scope', async ({ page }) => {
    await setupMockTransport(page);
    await page.goto('./', { waitUntil: 'commit' });

    const projectName = `SDLC-Reopen-${Date.now()}`;
    await createProject(page, projectName);
    await openAiDrawerWithProjectScope(page, projectName);

    const tabList = page.getByRole('tablist', { name: 'Thanh tab hội thoại AI' });
    await expect(tabList).toBeVisible();

    await page.getByRole('button', { name: 'Mở tab chat AI mới' }).click();
    const secondTab = tabList.getByRole('tab').filter({ hasText: /💬 Cuộc trò chuyện #2/ }).first();
    await expect(secondTab).toBeVisible();

    const closeDrawerBtn = page.getByRole('button', { name: 'Đóng ngăn trò chuyện' });
    if (await closeDrawerBtn.isVisible()) {
      await closeDrawerBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await expect(page.getByText('Trợ lý AI', { exact: true }).first()).not.toBeVisible();

    const aiButton = page.getByRole('button', { name: 'Trợ lý AI (Cmd+J / Ctrl+J)' });
    await aiButton.click();

    await expect(page.getByText(`Đang gắn ngữ cảnh: ${projectName}`, { exact: true })).toBeVisible();
    await expect(tabList.getByRole('tab').filter({ hasText: /💬 Cuộc trò chuyện #2/ })).toBeVisible();
  });

  test('D-16..D-19: Narrow 320px viewport responsive accessibility and no horizontal page scroll', async ({ page }) => {
    await setupMockTransport(page);
    await page.goto('./', { waitUntil: 'commit' });

    const projectName = `SDLC-320px-${Date.now()}`;
    await createProject(page, projectName);
    await openAiDrawerWithProjectScope(page, projectName);

    await page.setViewportSize({ width: 320, height: 800 });

    const scrollMetrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
    }));

    expect(scrollMetrics.scrollWidth).toBeLessThanOrEqual(scrollMetrics.clientWidth + 2);
    expect(scrollMetrics.bodyScrollWidth).toBeLessThanOrEqual(scrollMetrics.bodyClientWidth + 2);

    const tabList = page.getByRole('tablist', { name: 'Thanh tab hội thoại AI' });
    await expect(tabList).toBeVisible();
    await expect(tabList.getByRole('tab').first()).toBeVisible();
  });

  test('D-20..D-27 & D-31..D-35: SDLC intake modal, prompt isolation, and workflow reset', async ({ page }) => {
    const captured: Array<{ url: string; body: any; prompt: string }> = [];
    await setupMockTransport(page, { capturedRequests: captured });
    await page.goto('./', { waitUntil: 'commit' });
    await configureAiKey(page);

    const projectName = `SDLC-Intake-${Date.now()}`;
    await createProject(page, projectName);
    await openAiDrawerWithProjectScope(page, projectName);

    const tabList = page.getByRole('tablist', { name: 'Thanh tab hội thoại AI' });
    const sdlcTab = tabList.getByRole('tab').filter({ hasText: /SDLC/ }).first();
    await sdlcTab.click();

    const initSdlcBtn = page.getByRole('button', { name: 'Khởi tạo SDLC (PL01 & PL02)' });
    await expect(initSdlcBtn).toBeVisible();
    await initSdlcBtn.click();

    const intakeModal = page.getByRole('dialog').filter({ hasText: 'Nạp Hồ sơ Đầu vào (PL01 & PL02)' });
    await expect(intakeModal).toBeVisible();

    await intakeModal.getByPlaceholder('Dán nội dung Yêu cầu nghiệp vụ PL01 tại đây...').fill('Nghiệp vụ: Quản lý tác vụ đa tab.');
    await intakeModal.getByPlaceholder('Dán nội dung Đặc tả chức năng PL02 tại đây...').fill('Đặc tả: Giao diện tab Chrome độc lập.');

    await intakeModal.getByRole('button', { name: 'Bắt đầu Phân tích Solution' }).click();

    await expect(intakeModal).not.toBeVisible();

    await expect.poll(() => captured.length, { timeout: 15_000 }).toBeGreaterThan(0);
    const sdlcRequest = captured[0]!;
    expect(sdlcRequest.prompt).toContain('[Quy trình SDLC - Khởi tạo SOLUTION cho CR:');

    await expect(page.getByText('SDLC:', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('1. Đầu vào').first()).toBeVisible();
    expect(sdlcRequest.prompt).toContain('Nghiệp vụ: Quản lý tác vụ đa tab.');
    expect(sdlcRequest.prompt).toContain('Đặc tả: Giao diện tab Chrome độc lập.');

    const chatTab = tabList.getByRole('tab').filter({ hasText: '💬 Tra cứu & Hỏi đáp' }).first();
    await chatTab.click();

    const chatInput = page.getByLabel('Nội dung tin nhắn trò chuyện AI');
    await chatInput.fill('Chào AI, cho hỏi thông tin tác vụ thông thường');
    await page.getByLabel('Gửi tin nhắn').click();

    await expect.poll(() => captured.length, { timeout: 15_000 }).toBeGreaterThan(1);
    const ordinaryRequest = captured.at(-1)!;
    expect(ordinaryRequest.prompt).not.toContain('[Quy trình SDLC');
    expect(ordinaryRequest.prompt).toContain('Chào AI, cho hỏi thông tin tác vụ thông thường');

    await sdlcTab.click();
    const resetWorkflowBtn = page.getByRole('button', { name: 'Làm mới', exact: true });
    await expect(resetWorkflowBtn).toBeVisible();
    await resetWorkflowBtn.click();

    const popconfirm = page.locator('.ant-popconfirm');
    await expect(popconfirm.getByText('Làm mới workflow?')).toBeVisible();
    await popconfirm.getByRole('button', { name: 'Đồng ý' }).dispatchEvent('click');

    await expect(page.getByText('Đã làm mới quy trình SDLC')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Khởi tạo SDLC (PL01 & PL02)' })).toBeVisible();
  });

  test('D-28..D-30: Deterministic backup import validates format, rejects corrupt payload safely, and restores valid payload', async ({ page }) => {
    await setupMockTransport(page);
    await page.goto('./', { waitUntil: 'commit' });

    await page.getByRole('menuitem', { name: 'Cài đặt' }).click();
    await page.getByRole('tab', { name: /Sao lưu & Dữ liệu/ }).click();

    const fileInput = page.locator('input[type="file"][accept*=".json"]').first();
    await expect(fileInput).toBeAttached();

    const corruptPayload = {
      app: 'corrupted-invalid-app',
      schemaVersion: 9999,
      tables: 'not-an-object',
    };

    await fileInput.setInputFiles({
      name: 'corrupt-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(corruptPayload)),
    });

    const previewModal = page.getByRole('dialog').filter({ hasText: 'Xem trước & Xác nhận Khôi phục' });
    await expect(previewModal).toBeVisible();
    await expect(previewModal.getByText('Tệp sao lưu không hợp lệ')).toBeVisible();

    await previewModal.getByRole('button', { name: 'Hủy' }).click();
    await expect(previewModal).not.toBeVisible();

    const validPayload = {
      app: 'personal-task-planner',
      schemaVersion: 10,
      exportedAt: new Date().toISOString(),
      counts: {
        projects: 1,
        milestones: 0,
        tasks: 0,
        capacityRules: 0,
        capacityOverrides: 0,
        plannedAllocations: 0,
      },
      tables: {
        projects: [
          {
            id: 'a0000000-0000-4000-8000-000000000001',
            name: 'Restored Acceptance Project',
            status: 'In Progress',
            createdAt: '2026-10-31T00:00:00.000Z',
            updatedAt: '2026-10-31T00:00:00.000Z',
          },
        ],
        milestones: [],
        tasks: [],
        capacityRules: [],
        capacityOverrides: [],
        plannedAllocations: [],
      },
    };

    await fileInput.setInputFiles({
      name: 'valid-acceptance-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(validPayload)),
    });

    await expect(previewModal).toBeVisible();
    await expect(previewModal.getByText('Hành động thay thế toàn bộ dữ liệu')).toBeVisible();

    const confirmRestoreBtn = previewModal.getByRole('button', { name: 'Xác nhận khôi phục' });
    await expect(confirmRestoreBtn).toBeDisabled();

    const restoreInput = previewModal.getByPlaceholder('RESTORE');
    await restoreInput.fill('RESTORE');
    await expect(confirmRestoreBtn).toBeEnabled();

    await confirmRestoreBtn.click();
    await expect(previewModal).not.toBeVisible();

    await expect(page.getByText('Khôi phục dữ liệu thành công')).toBeVisible();
  });
});
