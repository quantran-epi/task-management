import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  configureAiKey,
  createChangeRequest,
  createSubsystem,
  downloadBackupJson,
  exportBackupFile,
  gotoWorkbench,
  importBackupFile,
  openAiDrawerWithCrScope,
  openSdlcStudio,
  readDexieRows,
  setupMockTransport,
  writeDexieRow,
} from './helpers/sdlcFixtures';

const source = fs.readFileSync(new URL(import.meta.url), 'utf8');

const TAB_LIST = { name: 'Thanh tab hội thoại AI' } as const;

/**
 * Seeds a CR plus one subsystem so a CR-scoped drawer has a real target to attach to.
 * Returns the CR id, which is both halves of the studio's `sdlc_workflow:<crId>:<crId>` key.
 */
async function seedCr(
  page: Page,
  options: { name: string; code: string; groupCode: string; subsystemCode: string }
): Promise<string> {
  await createSubsystem(page, {
    groupName: `${options.groupCode} Group`,
    groupCode: options.groupCode,
    name: `${options.subsystemCode} Service`,
    code: options.subsystemCode,
  });
  await createChangeRequest(page, {
    name: options.name,
    code: options.code,
    targetCode: options.subsystemCode,
  });
  const rows = await readDexieRows(page, 'changeRequests');
  const row = rows.find((entry) => entry.code === options.code);
  expect(row?.id).toBeTruthy();
  return String(row!.id);
}

/**
 * Analysis mode bypasses grounded routing, so one turn maps to exactly one request.
 * The workbench's docked drawer is narrow enough to render the compact toolbox, where the
 * toggle lives in a dropdown as a Switch rather than as a header button.
 */
async function enableAnalysisMode(page: Page): Promise<void> {
  await page.getByTestId('tab-compact-more-btn').click();
  // Scope to the open dropdown: the MCP popover also renders switches.
  const menu = page.locator('.ant-dropdown:not(.ant-dropdown-hidden)').last();
  const row = menu.getByText('Chế độ phân tích (chỉ đọc)');
  await expect(row).toBeVisible();
  const toggle = menu.getByRole('switch').first();
  await expect(toggle).not.toBeChecked();
  await row.click();
  await expect(toggle).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
}

/**
 * Adds a chat tab and selects it. `handleAddTab` persists the new tab as active but leaves the
 * drawer's `selectedTabId` alone, so the click is what actually switches the visible transcript.
 */
async function addChatTab(page: Page): Promise<{ tab: Locator }> {
  const tabList = page.getByRole('tablist', TAB_LIST);
  const before = await tabList.getByRole('tab').count();
  await page.getByRole('button', { name: 'Mở tab chat AI mới' }).click();
  await expect(tabList.getByRole('tab')).toHaveCount(before + 1);
  const tab = tabList.getByRole('tab').nth(before);
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  return { tab };
}

function v11Envelope(): Record<string, any> {
  return {
    app: 'personal-task-planner',
    schemaVersion: 11,
    exportedAt: new Date().toISOString(),
    counts: {
      changeRequests: 0,
      systems: 0,
      tasks: 0,
      capacityRules: 0,
      capacityOverrides: 0,
      plannedAllocations: 0,
    },
    tables: {
      changeRequests: [],
      systems: [],
      tasks: [],
      capacityRules: [],
      capacityOverrides: [],
      plannedAllocations: [],
    },
  };
}

test.describe('Phase 25.1 SDLC Flow Hardening & Multi-Tab Isolation Acceptance (CR model)', () => {
  test.beforeEach(() => {
    expect(source).not.toContain('page.' + 'setContent');
  });

  test('D-01..D-15: Multi-tab isolation: independent durable tabs, tab creation, switching, and closing', async ({ page }) => {
    await setupMockTransport(page);
    await gotoWorkbench(page);

    const suffix = String(Date.now());
    await seedCr(page, {
      name: `Tabs CR ${suffix}`,
      code: `CR-TABS-${suffix}`,
      groupCode: `TABS-GRP-${suffix}`,
      subsystemCode: `TABS-SVC-${suffix}`,
    });
    await openAiDrawerWithCrScope(page, `Tabs CR ${suffix}`);

    const tabList = page.getByRole('tablist', TAB_LIST);
    await expect(tabList).toBeVisible();

    // The first tab adopts the CR's own title, so select it by position, not by text.
    const firstChatTab = tabList.getByRole('tab').first();
    await expect(firstChatTab).toBeVisible();

    await addChatTab(page);
    const secondChatTab = tabList
      .getByRole('tab')
      .filter({ hasText: /Cuộc trò chuyện #2/ })
      .first();
    await expect(secondChatTab).toBeVisible();

    await firstChatTab.click();
    await expect(firstChatTab).toHaveAttribute('aria-selected', 'true');
    await expect(secondChatTab).toHaveAttribute('aria-selected', 'false');

    await secondChatTab.getByRole('button', { name: /Đóng/ }).click();
    await expect(
      tabList.getByRole('tab').filter({ hasText: /Cuộc trò chuyện #2/ })
    ).toHaveCount(0);
  });

  test('D-01..D-15: Drawer close and reopen persists tabs and current scope', async ({ page }) => {
    await setupMockTransport(page);
    await gotoWorkbench(page);

    const suffix = String(Date.now());
    const crName = `Reopen CR ${suffix}`;
    await seedCr(page, {
      name: crName,
      code: `CR-REOPEN-${suffix}`,
      groupCode: `REOPEN-GRP-${suffix}`,
      subsystemCode: `REOPEN-SVC-${suffix}`,
    });
    await openAiDrawerWithCrScope(page, crName);

    const tabList = page.getByRole('tablist', TAB_LIST);
    await addChatTab(page);

    await page.getByRole('button', { name: 'Đóng ngăn trò chuyện' }).click();
    await expect(page.getByText('Trợ lý AI', { exact: true }).first()).not.toBeVisible();

    // Closing the docked drawer unmounts it, so its scope resets to global; re-attach the CR
    // and assert the durable tabs came back from Dexie.
    await openAiDrawerWithCrScope(page, crName);
    await expect(
      tabList.getByRole('tab').filter({ hasText: /Cuộc trò chuyện #2/ }).first()
    ).toBeVisible();
  });

  test('D-16..D-19: Narrow 320px viewport responsive accessibility and no horizontal page scroll', async ({ page }) => {
    await setupMockTransport(page);
    await gotoWorkbench(page);

    const suffix = String(Date.now());
    await seedCr(page, {
      name: `Narrow CR ${suffix}`,
      code: `CR-NARROW-${suffix}`,
      groupCode: `NARROW-GRP-${suffix}`,
      subsystemCode: `NARROW-SVC-${suffix}`,
    });
    await openAiDrawerWithCrScope(page, `Narrow CR ${suffix}`);

    await page.setViewportSize({ width: 320, height: 800 });

    const tabList = page.getByRole('tablist', TAB_LIST);
    await expect(tabList).toBeVisible();
    await expect(tabList.getByRole('tab').first()).toBeVisible();

    const readScrollMetrics = () =>
      page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
        bodyClientWidth: document.body.clientWidth,
      }));

    // The drawer is flex-sized from the previous viewport width and only reflows when the
    // breakpoint effect runs, so poll until it has settled at 320px instead of sampling once.
    await expect
      .poll(async () => {
        const m = await readScrollMetrics();
        return m.scrollWidth <= m.clientWidth + 2 && m.bodyScrollWidth <= m.bodyClientWidth + 2;
      })
      .toBe(true);
  });

  test('D-28..D-30: Deterministic backup import rejects corrupt and legacy payloads, and restores a current one', async ({ page }) => {
    await setupMockTransport(page);
    await gotoWorkbench(page);

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('tab', { name: /Sao lưu & Dữ liệu/ }).click();

    const fileInput = page.locator('input[type="file"][accept*=".json"]').first();
    await expect(fileInput).toBeAttached();

    const previewModal = page
      .getByRole('dialog')
      .filter({ hasText: 'Xem trước & Xác nhận Khôi phục' });

    await fileInput.setInputFiles({
      name: 'corrupt-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({ app: 'corrupted-invalid-app', schemaVersion: 9999, tables: 'not-an-object' })
      ),
    });
    await expect(previewModal).toBeVisible();
    await expect(previewModal.getByText('Tệp sao lưu không hợp lệ')).toBeVisible();
    await previewModal.getByRole('button', { name: 'Hủy' }).click();
    await expect(previewModal).not.toBeVisible();

    // D-49: a pre-31.2 envelope is rejected outright — no row is mapped and nothing is written.
    const legacyPayload = {
      ...v11Envelope(),
      schemaVersion: 10,
      counts: { projects: 1, milestones: 0, tasks: 0 },
      tables: {
        projects: [{ id: 'a0000000-0000-4000-8000-000000000001', name: 'Legacy', status: 'In Progress' }],
        milestones: [],
        tasks: [],
      },
    };
    await fileInput.setInputFiles({
      name: 'legacy-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(legacyPayload)),
    });
    await expect(previewModal).toBeVisible();
    await expect(
      previewModal.getByText(/Backup phiên bản cũ không còn được hỗ trợ/).first()
    ).toBeVisible();
    await previewModal.getByRole('button', { name: 'Hủy' }).click();
    await expect(previewModal).not.toBeVisible();

    // A current envelope round-trips through the real export → import path.
    const backupPath = await exportBackupFile(page);
    await importBackupFile(page, backupPath);
  });

  test('D-06/D-10: hai tab chạy request đồng thời', async ({ page }) => {
    const controller = await setupMockTransport(page, { holdRequests: true });
    await gotoWorkbench(page);
    await configureAiKey(page);

    const suffix = String(Date.now());
    await seedCr(page, {
      name: `Concurrent CR ${suffix}`,
      code: `CR-CONC-${suffix}`,
      groupCode: `CONC-GRP-${suffix}`,
      subsystemCode: `CONC-SVC-${suffix}`,
    });
    await openAiDrawerWithCrScope(page, `Concurrent CR ${suffix}`);

    const tabList = page.getByRole('tablist', TAB_LIST);
    const firstTab = tabList.getByRole('tab').first();
    const secondTab = tabList.getByRole('tab').nth(1);

    await firstTab.click();
    await enableAnalysisMode(page);

    await addChatTab(page);
    await enableAnalysisMode(page);

    const chatInput = page.getByLabel('Nội dung tin nhắn trò chuyện AI');
    await chatInput.fill('Yêu cầu của tab thứ hai: liệt kê CR đang hoạt động');
    await page.getByLabel('Gửi tin nhắn').click();

    // Requests are held, so the first turn is still in flight when the second tab sends.
    await expect.poll(() => controller.captured.length).toBe(1);

    await firstTab.click();
    await expect(firstTab).toHaveAttribute('aria-selected', 'true');
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
  });

  test('D-15: lỗi tab này không đụng tab kia', async ({ page }) => {
    // failCount 2: after the stream fails the orchestrator issues one tool-less fallback on the
    // same route, so a single-request window would silently succeed and never surface the error.
    await setupMockTransport(page, {
      failStatus: { status: 500, requestIndex: 0, failCount: 2 },
    });
    await gotoWorkbench(page);
    await configureAiKey(page);

    const suffix = String(Date.now());
    await seedCr(page, {
      name: `ErrorIsolation CR ${suffix}`,
      code: `CR-ERRISO-${suffix}`,
      groupCode: `ERRISO-GRP-${suffix}`,
      subsystemCode: `ERRISO-SVC-${suffix}`,
    });
    await openAiDrawerWithCrScope(page, `ErrorIsolation CR ${suffix}`);

    const tabList = page.getByRole('tablist', TAB_LIST);
    const firstTab = tabList.getByRole('tab').first();
    const secondTab = tabList.getByRole('tab').nth(1);

    await firstTab.click();
    await enableAnalysisMode(page);
    await addChatTab(page);
    await enableAnalysisMode(page);

    await firstTab.click();
    await expect(firstTab).toHaveAttribute('aria-selected', 'true');
    await page.getByLabel('Nội dung tin nhắn trò chuyện AI').fill('Truy vấn sẽ thất bại ở tab thứ nhất');
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
    await setupMockTransport(page, {
      failStatus: { status: 500, requestIndex: 0, failCount: 2 },
    });
    await gotoWorkbench(page);
    await configureAiKey(page);

    const suffix = String(Date.now());
    await seedCr(page, {
      name: `Retry CR ${suffix}`,
      code: `CR-RETRY-${suffix}`,
      groupCode: `RETRY-GRP-${suffix}`,
      subsystemCode: `RETRY-SVC-${suffix}`,
    });
    await openAiDrawerWithCrScope(page, `Retry CR ${suffix}`);

    const chatTab = page.getByRole('tablist', TAB_LIST).getByRole('tab').first();
    await chatTab.click();
    await enableAnalysisMode(page);

    await page.getByLabel('Nội dung tin nhắn trò chuyện AI').fill(prompt);
    await page.getByLabel('Gửi tin nhắn').click();

    await expect(page.locator('[data-testid="inline-api-error-card"]')).toHaveCount(1);

    // The failed turn persisted the user row and nothing else.
    const afterFailure = await readDexieRows(page, 'chatMessages');
    expect(afterFailure.filter((row) => row.role === 'user')).toHaveLength(1);
    expect(afterFailure.filter((row) => row.role === 'assistant')).toHaveLength(0);

    await page.getByRole('button', { name: 'Thử lại' }).click();
    await expect(page.getByText('Phản hồi thử nghiệm từ hệ thống AI.').first()).toBeVisible();

    const rows = await readDexieRows(page, 'chatMessages');
    const userRows = rows.filter((row) => row.role === 'user');
    // Retry reused the original user row instead of inserting a second bubble (D-14).
    expect(userRows).toHaveLength(1);
    expect(userRows[0]!.content).toBe(prompt);
  });

  test('D-28/D-29: backup round-trip giữ tab, active pointer và history', async ({ page }) => {
    await setupMockTransport(page);
    await gotoWorkbench(page);
    await configureAiKey(page);

    const suffix = String(Date.now());
    const crName = `BackupRoundTrip CR ${suffix}`;
    const messageText = 'Tin nhắn được giữ nguyên qua bản sao lưu';
    const renamedTitle = 'Tab đã đổi tên';
    await seedCr(page, {
      name: crName,
      code: `CR-BACKUP-${suffix}`,
      groupCode: `BACKUP-GRP-${suffix}`,
      subsystemCode: `BACKUP-SVC-${suffix}`,
    });
    await openAiDrawerWithCrScope(page, crName);

    const tabList = page.getByRole('tablist', TAB_LIST);
    const firstTab = tabList.getByRole('tab').first();
    const secondTab = tabList.getByRole('tab').nth(1);

    await addChatTab(page);

    await firstTab.click();
    await expect(firstTab).toHaveAttribute('aria-selected', 'true');
    await enableAnalysisMode(page);

    await page.getByLabel('Nội dung tin nhắn trò chuyện AI').fill(messageText);
    await page.getByLabel('Gửi tin nhắn').click();
    await expect(page.getByText('Phản hồi thử nghiệm từ hệ thống AI.').first()).toBeVisible();

    // Rename through the real affordance (F2) so the exported title is the durable one.
    await firstTab.focus();
    await page.keyboard.press('F2');
    const renameInput = tabList.getByLabel('Đổi tên tab');
    await expect(renameInput).toBeVisible();
    await renameInput.fill(renamedTitle);
    await renameInput.press('Enter');
    await expect(tabList.getByRole('tab').filter({ hasText: renamedTitle }).first()).toBeVisible();

    const tabsBefore = await readDexieRows(page, 'chatTabs');
    const messagesBefore = await readDexieRows(page, 'chatMessages');
    expect(tabsBefore.length).toBeGreaterThanOrEqual(2);
    expect(messagesBefore.some((row) => row.content === messageText)).toBe(true);

    const backupPath = await exportBackupFile(page);
    const exported = JSON.parse(fs.readFileSync(backupPath, 'utf8')) as Record<string, any>;
    expect(exported.schemaVersion).toBe(11);
    expect(exported.tables).toHaveProperty('changeRequests');
    expect(JSON.stringify(exported)).not.toMatch(
      /api[_-]?key|passphrase|partialBuffer|streamingText|rawModelResponse/i
    );

    await importBackupFile(page, backupPath);
    await page.reload({ waitUntil: 'commit' });

    const tabsAfter = await readDexieRows(page, 'chatTabs');
    const messagesAfter = await readDexieRows(page, 'chatMessages');

    const identity = (rows: Array<Record<string, unknown>>) =>
      rows
        .map((row) => ({ id: row.id, type: row.type, title: row.title, active: Boolean(row.active) }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    expect(identity(tabsAfter)).toEqual(identity(tabsBefore));

    const messageIdentity = (rows: Array<Record<string, unknown>>) =>
      rows
        .map((row) => ({ id: row.id, role: row.role, content: row.content }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    expect(messageIdentity(messagesAfter)).toEqual(messageIdentity(messagesBefore));

    // Exactly one active tab per scope survives the round-trip (the active pointer is durable).
    const activePerScope = new Map<string, number>();
    for (const tab of tabsAfter) {
      if (!tab.active) continue;
      const scope = String(tab.scopeKey);
      activePerScope.set(scope, (activePerScope.get(scope) ?? 0) + 1);
    }
    for (const [, count] of activePerScope) expect(count).toBe(1);

    // The restored drawer renders the renamed tab and its history.
    await openAiDrawerWithCrScope(page, crName);
    await tabList.getByRole('tab').filter({ hasText: renamedTitle }).first().click();
    await expect(page.getByText(messageText).first()).toBeVisible();
  });

  test('D-20..D-27: workflow state survives a reload and stays keyed per CR', async ({ page }) => {
    await setupMockTransport(page);
    await gotoWorkbench(page);
    await configureAiKey(page);

    const suffix = String(Date.now());
    const crId = await seedCr(page, {
      name: `Revision CR ${suffix}`,
      code: `CR-REV-${suffix}`,
      groupCode: `REV-GRP-${suffix}`,
      subsystemCode: `REV-SVC-${suffix}`,
    });

    // The studio persists under `sdlc_workflow:<changeRequestId>:<crId>`, and both halves are
    // the CR id because the view passes `changeRequestId` as its project id.
    const now = new Date().toISOString();
    await writeDexieRow(page, 'settings', {
      key: `sdlc_workflow:${crId}:${crId}`,
      value: JSON.stringify({
        schemaVersion: 1,
        sessionId: crypto.randomUUID(),
        projectId: crId,
        threadId: crypto.randomUUID(),
        currentStep: 'SOLUTION',
        metadata: {
          cr: `CR-REV-${suffix}`,
          featureName: 'Revision',
          author: 'Dev',
          requestingUnit: 'Unit',
          date: '2026-11-01',
        },
        artifacts: {
          pl01: {
            kind: 'PL01', version: 1, hash: 'a'.repeat(64), title: 'PL01',
            content: 'PL01 body', sourceHashes: [], updatedAt: now,
          },
          pl02: {
            kind: 'PL02', version: 1, hash: 'b'.repeat(64), title: 'PL02',
            content: 'PL02 body', sourceHashes: [], updatedAt: now,
          },
          solution: {
            kind: 'SOLUTION', version: 1, hash: 'c'.repeat(64), title: 'SOLUTION.md — v1',
            content: 'Bản solution gốc dùng để đối chiếu.', sourceHashes: [], updatedAt: now,
          },
        },
        staleSteps: [],
        createdAt: now,
        updatedAt: now,
      }),
    });

    await page.reload({ waitUntil: 'commit' });
    await openSdlcStudio(page, `REV-SVC-${suffix}`);

    // The restored state marks steps 1 and 2 complete; the studio reopens on step 1.
    await expect(page.getByText(`Tiến độ (CR-REV-${suffix})`)).toBeVisible();
    await expect(page.getByText(/Bước 1\/6/)).toBeVisible();
    await expect(page.getByTestId('sidebar-step-SOLUTION')).toBeVisible();
    await page.getByTestId('sidebar-step-SOLUTION').click();
    await expect(
      page.getByPlaceholder('Nội dung kiến trúc giải pháp SOLUTION.md...')
    ).toHaveValue('Bản solution gốc dùng để đối chiếu.');
  });
});
