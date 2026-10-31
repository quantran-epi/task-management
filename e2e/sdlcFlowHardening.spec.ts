import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  configureAiKey,
  createProject,
  downloadBackupJson,
  importBackupFile,
  openAiDrawerWithProjectScope,
  readDexieRows,
  setupMockTransport,
  writeDexieRow,
} from './helpers/sdlcFixtures';

const source = fs.readFileSync(new URL(import.meta.url), 'utf8');

/**
 * The AI drawer keeps its open flag and scope in localStorage, so a reload usually reopens it
 * with the same project scope. Read the durable flag instead of guessing from a raced
 * `isVisible()` check — clicking the header button while the drawer is already open closes it.
 */
async function ensureDrawerWithProjectScope(page: Page, projectName: string): Promise<void> {
  const aiButton = page.getByRole('button', { name: 'Trợ lý AI (Cmd+J / Ctrl+J)' });
  await expect(aiButton).toBeVisible();

  const chatInput = page.getByLabel('Nội dung tin nhắn trò chuyện AI');
  const drawerOpen = await page.evaluate(
    () => localStorage.getItem('planner:ai_chat_open') === 'true'
  );
  if (!drawerOpen) {
    await aiButton.click();
  }
  await expect(chatInput).toBeVisible();

  const scopeLabel = page.getByText(`Đang gắn ngữ cảnh: ${projectName}`, { exact: true });
  if (!(await scopeLabel.isVisible())) {
    await page.getByRole('button', { name: 'Đổi phạm vi ngữ cảnh' }).click();
    await page.getByRole('dialog').getByText(projectName, { exact: true }).click();
  }
  await expect(scopeLabel).toBeVisible();
}

async function runSdlcIntake(
  page: Page,
  controller: { captured: Array<unknown> },
  featureName?: string
): Promise<void> {
  const tabList = page.getByRole('tablist', { name: 'Thanh tab hội thoại AI' });
  await tabList.getByRole('tab').filter({ hasText: /SDLC/ }).first().click();

  await page.getByRole('button', { name: 'Khởi tạo SDLC (PL01 & PL02)' }).click();
  const intakeModal = page
    .getByRole('dialog')
    .filter({ hasText: 'Nạp Hồ sơ Đầu vào (PL01 & PL02)' });
  await expect(intakeModal).toBeVisible();
  if (featureName) {
    await intakeModal.getByLabel('Tên Tính năng').fill(featureName);
  }
  await intakeModal
    .getByPlaceholder(/Dán nội dung Yêu cầu nghiệp vụ PL01/)
    .fill('Nghiệp vụ: Quản lý tác vụ đa tab.');
  await intakeModal
    .getByPlaceholder(/Dán nội dung Đặc tả chức năng PL02/)
    .fill('Đặc tả: Giao diện tab Chrome độc lập.');
  await intakeModal.getByRole('button', { name: 'Bắt đầu Phân tích Solution' }).click();
  await expect(intakeModal).not.toBeVisible();
  await expect.poll(() => controller.captured.length, { timeout: 15_000 }).toBeGreaterThan(0);
}

/**
 * Seeds a workflow state for the project.
 *
 * The durable key is `sdlc_workflow:<projectId>:<threadId>`, and the drawer resolves it from the
 * active tab's thread id — not always the SDLC tab's, because intake can write under whichever
 * tab owned the turn. Writing the same mutated state to every existing key for the project (plus
 * the SDLC tab's own key) makes the post-reload restore deterministic instead of depending on
 * which thread id the drawer happens to resolve.
 */
async function seedSdlcWorkflow(
  page: Page,
  projectName: string,
  mutate: (state: Record<string, any>) => Record<string, any>
): Promise<string> {
  const projectRow = (await readDexieRows(page, 'projects')).find(
    (row) => row.name === projectName
  );
  expect(projectRow?.id).toBeTruthy();
  const projectId = String(projectRow!.id);

  const sdlcTab = (await readDexieRows(page, 'chatTabs')).find((tab) => tab.type === 'sdlc');
  expect(sdlcTab?.threadId).toBeTruthy();

  const prefix = `sdlc_workflow:${projectId}:`;
  const settings = await readDexieRows(page, 'settings');
  const existing = settings.filter(
    (row) => typeof row.key === 'string' && row.key.startsWith(prefix)
  );
  expect(existing.length).toBeGreaterThan(0);
  const base = existing[0]!.value as Record<string, any>;
  expect(base).toBeTruthy();

  const keys = new Set(existing.map((row) => String(row.key)));
  keys.add(`${prefix}${String(sdlcTab!.threadId)}`);
  for (const key of keys) {
    const prior = settings.find((row) => row.key === key)?.value as
      | Record<string, any>
      | undefined;
    await writeDexieRow(page, 'settings', { key, value: mutate(prior ?? base) });
  }
  return `${prefix}${String(sdlcTab!.threadId)}`;
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

    await intakeModal.getByPlaceholder(/Dán nội dung Yêu cầu nghiệp vụ PL01/).fill('Nghiệp vụ: Quản lý tác vụ đa tab.');
    await intakeModal.getByPlaceholder(/Dán nội dung Đặc tả chức năng PL02/).fill('Đặc tả: Giao diện tab Chrome độc lập.');

    await intakeModal.getByRole('button', { name: 'Bắt đầu Phân tích Solution' }).click();

    await expect(intakeModal).not.toBeVisible();

    await expect.poll(() => captured.length, { timeout: 15_000 }).toBeGreaterThan(0);
    const sdlcRequest = captured[0]!;
    expect(sdlcRequest.prompt).toContain('[Quy trình SDLC - Khởi tạo SOLUTION cho CR:');

    await expect(page.getByText('SDLC:', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Bước 1: Hồ sơ Đầu vào/ }).first()).toBeVisible();
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
    const resetWorkflowBtn = page.getByRole('button', { name: 'Làm mới workflow' });
    await expect(resetWorkflowBtn).toBeVisible();
    await resetWorkflowBtn.click();

    const popconfirm = page.locator('.ant-popconfirm');
    await expect(popconfirm.getByText('Làm mới workflow?')).toBeVisible();
    await popconfirm.getByRole('button', { name: 'Làm mới workflow' }).dispatchEvent('click');

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

  test('D-06/D-10: hai tab chạy request đồng thời', async ({ page }) => {
    const controller = await setupMockTransport(page, { holdRequests: true });
    await page.goto('./', { waitUntil: 'commit' });
    await configureAiKey(page);

    const projectName = `SDLC-Concurrent-${Date.now()}`;
    await createProject(page, projectName);
    await openAiDrawerWithProjectScope(page, projectName);

    const tabList = page.getByRole('tablist', { name: 'Thanh tab hội thoại AI' });
    const sdlcTab = tabList.getByRole('tab').filter({ hasText: /SDLC/ }).first();
    const firstTab = tabList.getByRole('tab').filter({ hasText: '💬 Tra cứu & Hỏi đáp' }).first();
    const secondTab = tabList.getByRole('tab').filter({ hasText: /💬 Cuộc trò chuyện #2/ }).first();

    // Analysis mode on every participating ordinary tab: the grounded pipeline (intent router,
    // scope router, synthesis) would otherwise add schema-invalid calls on the same route and
    // break the 1 turn -> 1 captured request mapping these tests rely on.
    await firstTab.click();
    await page.getByTestId('chat-header-more-btn').click();
    await page.getByText('Bật chế độ phân tích (Analysis mode)').click();
    await page.getByTestId('chat-header-more-btn').click();
    await expect(page.getByText('Tắt chế độ phân tích (Analysis mode)')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Mở tab chat AI mới' }).click();
    await expect(secondTab).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('chat-header-more-btn').click();
    await page.getByText('Bật chế độ phân tích (Analysis mode)').click();
    await page.getByTestId('chat-header-more-btn').click();
    await expect(page.getByText('Tắt chế độ phân tích (Analysis mode)')).toBeVisible();
    await page.keyboard.press('Escape');

    const chatInput = page.getByLabel('Nội dung tin nhắn trò chuyện AI');
    await chatInput.fill('Yêu cầu của tab thứ hai: liệt kê dự án đang hoạt động');
    await page.getByLabel('Gửi tin nhắn').click();

    // Requests are held, so the first turn is still in flight when the second tab sends.
    await expect.poll(() => controller.captured.length).toBe(1);

    await firstTab.click();
    await expect(firstTab).toHaveAttribute('aria-selected', 'true');
    // The tab that owns the in-flight turn reports its own status while a sibling is selected.
    await expect(secondTab).toHaveAttribute('aria-label', /Đang xử lý/);

    await chatInput.fill('Yêu cầu của tab thứ nhất: đếm số tác vụ hôm nay');
    await page.getByLabel('Gửi tin nhắn').click();

    await expect.poll(() => controller.captured.length).toBe(2);

    // Ownership is asserted from the request bodies, not from arrival order alone.
    expect(controller.captured[0]!.prompt).toContain('Yêu cầu của tab thứ hai');
    expect(controller.captured[0]!.prompt).not.toContain('Yêu cầu của tab thứ nhất');
    expect(controller.captured[1]!.prompt).toContain('Yêu cầu của tab thứ nhất');
    expect(controller.captured[1]!.prompt).not.toContain('Yêu cầu của tab thứ hai');

    controller.releaseAll();

    await expect(page.getByText('Phản hồi thử nghiệm từ hệ thống AI.').first()).toBeVisible();
    await secondTab.click();
    await expect(page.getByText('Phản hồi thử nghiệm từ hệ thống AI.').first()).toBeVisible();
    expect(controller.captured.length).toBe(2);
  });

  test('D-15: lỗi tab này không đụng tab kia', async ({ page }) => {
    // failCount 2: after the stream fails the orchestrator issues one tool-less fallback on the
    // same route, so a single-request window would silently succeed and never surface the error.
    const controller = await setupMockTransport(page, {
      failStatus: { status: 500, requestIndex: 0, failCount: 2 },
    });
    await page.goto('./', { waitUntil: 'commit' });
    await configureAiKey(page);

    const projectName = `SDLC-ErrorIsolation-${Date.now()}`;
    await createProject(page, projectName);
    await openAiDrawerWithProjectScope(page, projectName);

    const tabList = page.getByRole('tablist', { name: 'Thanh tab hội thoại AI' });
    const firstTab = tabList.getByRole('tab').filter({ hasText: '💬 Tra cứu & Hỏi đáp' }).first();
    const secondTab = tabList.getByRole('tab').filter({ hasText: /💬 Cuộc trò chuyện #2/ }).first();

    await firstTab.click();
    await page.getByTestId('chat-header-more-btn').click();
    await page.getByText('Bật chế độ phân tích (Analysis mode)').click();
    await page.getByTestId('chat-header-more-btn').click();
    await expect(page.getByText('Tắt chế độ phân tích (Analysis mode)')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Mở tab chat AI mới' }).click();
    await expect(secondTab).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('chat-header-more-btn').click();
    await page.getByText('Bật chế độ phân tích (Analysis mode)').click();
    await page.getByTestId('chat-header-more-btn').click();
    await expect(page.getByText('Tắt chế độ phân tích (Analysis mode)')).toBeVisible();
    await page.keyboard.press('Escape');

    await firstTab.click();
    await expect(firstTab).toHaveAttribute('aria-selected', 'true');
    const chatInput = page.getByLabel('Nội dung tin nhắn trò chuyện AI');
    await chatInput.fill('Truy vấn sẽ thất bại ở tab thứ nhất');
    await page.getByLabel('Gửi tin nhắn').click();

    // Exactly one owner: the active tab renders the single inline error card (D-13).
    const errorCard = page.locator('[data-testid="inline-api-error-card"]');
    await expect(errorCard).toHaveCount(1);
    await expect(firstTab).toHaveAttribute('aria-label', /Lỗi/);

    await secondTab.click();
    await expect(secondTab).toHaveAttribute('aria-selected', 'true');
    await expect(errorCard).toHaveCount(0);
    await expect(secondTab).not.toHaveAttribute('aria-label', /Lỗi|Đang xử lý/);
    // The failed turn stays owned by the first tab after switching away and back.
    await firstTab.click();
    await expect(errorCard).toHaveCount(1);
  });

  test('D-14: retry không nhân bản tin nhắn người dùng', async ({ page }) => {
    const prompt = 'Câu hỏi cần thử lại, chỉ một bong bóng người dùng';
    // Same fallback reasoning as the isolation test: the error must actually reach the UI.
    const controller = await setupMockTransport(page, {
      failStatus: { status: 500, requestIndex: 0, failCount: 2 },
    });
    await page.goto('./', { waitUntil: 'commit' });
    await configureAiKey(page);

    const projectName = `SDLC-RetryIdentity-${Date.now()}`;
    await createProject(page, projectName);
    await openAiDrawerWithProjectScope(page, projectName);

    const tabList = page.getByRole('tablist', { name: 'Thanh tab hội thoại AI' });
    const chatTab = tabList.getByRole('tab').filter({ hasText: '💬 Tra cứu & Hỏi đáp' }).first();
    await chatTab.click();
    await page.getByTestId('chat-header-more-btn').click();
    await page.getByText('Bật chế độ phân tích (Analysis mode)').click();
    await page.getByTestId('chat-header-more-btn').click();
    await expect(page.getByText('Tắt chế độ phân tích (Analysis mode)')).toBeVisible();
    await page.keyboard.press('Escape');

    const chatInput = page.getByLabel('Nội dung tin nhắn trò chuyện AI');
    await chatInput.fill(prompt);
    await page.getByLabel('Gửi tin nhắn').click();

    await expect(page.locator('[data-testid="inline-api-error-card"]')).toHaveCount(1);
    const failedRequests = controller.captured.length;

    // The failed turn persisted the user row and nothing else.
    const afterFailure = await readDexieRows(page, 'chatMessages');
    expect(afterFailure.filter((row) => row.role === 'user')).toHaveLength(1);
    expect(afterFailure.filter((row) => row.role === 'assistant')).toHaveLength(0);

    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect.poll(() => controller.captured.length).toBeGreaterThan(failedRequests);
    await expect(page.getByText('Phản hồi thử nghiệm từ hệ thống AI.').first()).toBeVisible();

    const rows = await readDexieRows(page, 'chatMessages');
    const userRows = rows.filter((row) => row.role === 'user');
    // Retry reused the original user row instead of inserting a second bubble (D-14).
    expect(userRows).toHaveLength(1);
    expect(userRows[0]!.content).toBe(prompt);
  });

  test('D-20..D-27: revision preview, commit, và giữ chu kỳ cũ', async ({ page }) => {
    const controller = await setupMockTransport(page);
    await page.goto('./', { waitUntil: 'commit' });
    await configureAiKey(page);

    const projectName = `SDLC-Revision-${Date.now()}`;
    await createProject(page, projectName);
    await openAiDrawerWithProjectScope(page, projectName);
    await runSdlcIntake(page, controller);

    const tabs = await readDexieRows(page, 'chatTabs');
    const sdlcTab = tabs.find((tab) => tab.type === 'sdlc');
    expect(sdlcTab).toBeTruthy();

    const now = new Date().toISOString();
    // Seeded on purpose: a completed cycle can only be produced by CAB generation, which needs a
    // confirmed change pack plus the PL02/PL03B/PL07 chain. Seeding `settings` reaches the state
    // plan 12's component test already covers through the real closeCycle path.
    await seedSdlcWorkflow(page, projectName, (state) => ({
      ...state,
      threadId: String(sdlcTab!.threadId),
      artifacts: {
        ...state.artifacts,
        solution: {
          kind: 'SOLUTION',
          version: 1,
          hash: 'a'.repeat(64),
          title: 'SOLUTION.md — v1',
          content: 'Bản solution gốc dùng để đối chiếu.',
          sourceHashes: [],
          updatedAt: now,
        },
      },
      cycles: [
        {
          cycleId: crypto.randomUUID(),
          status: 'completed',
          startedAt: now,
          closedAt: now,
        },
      ],
    }));

    // A reload mounts the hub with the seeded state; the drawer reopens from its localStorage flag.
    await page.reload({ waitUntil: 'commit' });
    await ensureDrawerWithProjectScope(page, projectName);

    const tabList = page.getByRole('tablist', { name: 'Thanh tab hội thoại AI' });
    await expect(
      tabList.getByRole('tab').filter({ hasText: /SDLC/ }).first()
    ).toHaveAttribute('aria-selected', 'true');

    // D-27 retention is visible before the revision: cycle 1 is already closed.
    await expect(page.getByText('Chu kỳ 1 — Hoàn tất')).toBeVisible();

    await page.getByRole('button', { name: 'Cập nhật solution' }).click();
    const revisionModal = page
      .getByRole('dialog')
      .filter({ hasText: 'Xác nhận cập nhật solution' });
    await expect(revisionModal).toBeVisible();

    const draftArea = revisionModal.getByPlaceholder(
      'Nhập bản nội dung mới để xem trước và xác nhận.'
    );
    await draftArea.fill('Bản solution cập nhật sau khi rà soát yêu cầu mới.');
    await draftArea.blur();

    // Preview renders the diff before anything is committed (the draft also appears in the textarea).
    await expect(revisionModal.getByText('1. So sánh thay đổi (Diff)')).toBeVisible();
    await expect(
      revisionModal.getByText('Bản solution cập nhật sau khi rà soát yêu cầu mới.').first()
    ).toBeVisible();
    await expect(
      revisionModal.getByText('3. Chuỗi tác động (Impact Chain)')
    ).toBeVisible();

    // The drawer (zIndex 1200) sits above the modal mask, so a pointer click is intercepted.
    // Dispatching the click still runs the real handler, same as the existing popconfirm step.
    await revisionModal
      .getByRole('button', { name: 'Xác nhận cập nhật' })
      .dispatchEvent('click');
    await expect(revisionModal).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Xác nhận cập nhật' })).toHaveCount(0);

    await expect(page.getByText('Chu kỳ 2 — Đang thực hiện')).toBeVisible();
    await expect(page.getByText('Chu kỳ 1 — Hoàn tất')).toBeVisible();
    // The past cycle renders as a read-only row (D-27 retention), not just a counter bump.
    await expect(
      page.locator('.ant-tag').filter({ hasText: 'Chỉ đọc' })
    ).toHaveCount(1);
  });

  test('D-30: restore cảnh báo nguồn thiếu', async ({ page }) => {
    const controller = await setupMockTransport(page);
    await page.goto('./', { waitUntil: 'commit' });
    await configureAiKey(page);

    const projectName = `SDLC-MissingSourceProject-${Date.now()}`;
    const featureName = `SDLC-MissingSource-${Date.now()}`;
    const missingNoteId = crypto.randomUUID();
    await createProject(page, projectName);
    await openAiDrawerWithProjectScope(page, projectName);
    await runSdlcIntake(page, controller, featureName);

    // SDLC artifacts only get a noteId from a selected Note source, so the workflow must be
    // repointed at a real Note row before that Note can go missing.
    const now = new Date().toISOString();
    await writeDexieRow(page, 'notes', {
      id: missingNoteId,
      title: 'Nguồn PL01 bị thiếu',
      body: 'Nội dung nguồn PL01 sẽ bị xoá khỏi bản sao lưu.',
      isPinned: false,
      createdAt: now,
      updatedAt: now,
    });

    const tabs = await readDexieRows(page, 'chatTabs');
    const sdlcTab = tabs.find((tab) => tab.type === 'sdlc');
    expect(sdlcTab).toBeTruthy();
    const sdlcThreadId = String(sdlcTab!.threadId);
    await seedSdlcWorkflow(page, projectName, (state) => ({
      ...state,
      threadId: sdlcThreadId,
      artifacts: {
        ...state.artifacts,
        pl01: { ...state.artifacts.pl01, noteId: missingNoteId },
      },
    }));

    // Remove the Note from the EXPORTED payload, never from live Dexie: restore bulk-adds the
    // payload's `notes`, so deleting locally then re-importing would bring it right back.
    const payload = await downloadBackupJson(page);
    const tables = payload.tables as Record<string, any>;
    tables.notes = (tables.notes as Array<Record<string, unknown>>).filter(
      (note) => note.id !== missingNoteId
    );
    (payload.counts as Record<string, number>).notes = tables.notes.length;
    const mutatedPath = path.join(os.tmpdir(), `taskmate-missing-source-${Date.now()}.json`);
    fs.writeFileSync(mutatedPath, JSON.stringify(payload));

    await importBackupFile(page, mutatedPath);
    // Restore replaces tables behind the mounted drawer; reload so the SDLC coordinator restores
    // from the imported settings instead of keeping the pre-import in-memory state.
    await page.reload({ waitUntil: 'commit' });
    // Restore drops the API key (it is on the export deny-list), so re-enter it before the
    // positive-control send; the blocked send below needs no key and is asserted separately.
    await configureAiKey(page);
    await ensureDrawerWithProjectScope(page, projectName);
    const tabList = page.getByRole('tablist', { name: 'Thanh tab hội thoại AI' });
    await tabList.getByRole('tab').filter({ hasText: /SDLC/ }).first().click();

    const notice = page.getByRole('status').filter({
      hasText: 'Không tìm thấy nguồn của workflow đã khôi phục.',
    });
    // The notice shows the ARTIFACT title: deriveMissingSources cannot read a title from a Note
    // row that no longer exists. The artifact title is pinned by the unique featureName.
    await expect(notice).toBeVisible();
    await expect(
      notice.getByText(`PL01 — Yêu cầu nghiệp vụ (${featureName})`)
    ).toBeVisible();
    const restoredNotes = await readDexieRows(page, 'notes');
    expect(restoredNotes.some((note) => note.id === missingNoteId)).toBe(false);
    expect(restoredNotes.some((note) => note.title === 'Nguồn PL01 bị thiếu')).toBe(false);

    // No automatic AI call is issued while a source is missing.
    const capturedBeforeRecovery = controller.captured.length;
    // Wait for the tab switch to settle before typing: the composer remounts per tab and would
    // otherwise drop the draft that was just filled.
    await expect(
      tabList.getByRole('tab').filter({ hasText: /SDLC/ }).first()
    ).toHaveAttribute('aria-selected', 'true');
    const chatInput = page.getByLabel('Nội dung tin nhắn trò chuyện AI');
    await chatInput.fill('Chạy tiếp bước phân tích solution.');
    // The tall SDLC hub pushes the composer below the drawer viewport; Cmd/Ctrl+Enter is the
    // product's own send path and does not depend on pointer hit-testing.
    await chatInput.press('Control+Enter');
    await expect(page.locator('[data-testid="inline-api-error-card"]')).toHaveCount(1);
    expect(controller.captured.length).toBe(capturedBeforeRecovery);

    // Positive control (đối chứng dương): without it the zero-growth assertion above could pass
    // simply because the harness never sends. Re-create the Note under the SAME id and prove a
    // turn does fire.
    const recoveryTime = new Date().toISOString();
    await writeDexieRow(page, 'notes', {
      id: missingNoteId,
      title: 'Nguồn PL01 bị thiếu',
      body: 'Nội dung nguồn PL01 đã được bổ sung lại.',
      isPinned: false,
      createdAt: recoveryTime,
      updatedAt: recoveryTime,
    });
    await page.reload({ waitUntil: 'commit' });
    await ensureDrawerWithProjectScope(page, projectName);
    await page.getByRole('tablist', { name: 'Thanh tab hội thoại AI' })
      .getByRole('tab').filter({ hasText: /SDLC/ }).first().click();

    await expect(page.getByRole('status').filter({
      hasText: 'Không tìm thấy nguồn của workflow đã khôi phục.',
    })).toHaveCount(0);

    // Clear the error card left by the blocked turn first: the retry button and the composer are
    // both valid next actions, and the send asserts the card count separately.
    const capturedBeforeSend = controller.captured.length;
    const recoveryInput = page.getByLabel('Nội dung tin nhắn trò chuyện AI');
    await recoveryInput.fill('Nguồn đã bổ sung, chạy tiếp.');
    await recoveryInput.press('Control+Enter');
    await expect
      .poll(() => controller.captured.length, { timeout: 15_000 })
      .toBeGreaterThan(capturedBeforeSend);
  });
});
