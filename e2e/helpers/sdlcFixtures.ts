import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';

export interface CapturedRequest {
  url: string;
  body: any;
  prompt: string;
}

export interface MockTransportOptions {
  capturedRequests?: CapturedRequest[];
  aiResponseText?: string;
  holdRequests?: boolean;
  failStatus?: { status: number; requestIndex: number; failCount?: number };
}

export interface MockTransportController {
  captured: CapturedRequest[];
  release(index?: number): void;
  releaseAll(): void;
}

export async function setupMockTransport(
  page: Page,
  options: MockTransportOptions = {}
): Promise<MockTransportController> {
  const captured = options.capturedRequests ?? [];
  const replyText = options.aiResponseText ?? 'Phản hồi thử nghiệm từ hệ thống AI.';
  const gates = new Map<number, () => void>();
  let releasedAll = false;
  let arrival = 0;

  const waitGate = (index: number) =>
    new Promise<void>((resolve) => {
      if (releasedAll) {
        resolve();
        return;
      }
      gates.set(index, resolve);
    });

  const release = (index?: number) => {
    if (index === undefined) return;
    const resolve = gates.get(index);
    if (resolve) {
      gates.delete(index);
      resolve();
    }
  };

  const releaseAll = () => {
    releasedAll = true;
    for (const [, resolve] of gates) resolve();
    gates.clear();
  };

  await page.route('**/v1/chat/completions', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') {
      await route.continue();
      return;
    }

    const index = arrival++;

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

    captured.push({ url: request.url(), body, prompt });

    const fail = options.failStatus;
    const fails = Boolean(
      fail && index >= fail.requestIndex && index < fail.requestIndex + (fail.failCount ?? 1)
    );

    if (options.holdRequests) {
      await waitGate(index);
    }

    if (fails) {
      await route.fulfill({
        status: fail!.status,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: `Mock transport failure (${fail!.status})` } }),
      });
      return;
    }

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

  return { captured, release, releaseAll };
}

/**
 * Boots the IntelliJ workbench — the only shell that carries the CR surface (CR Explorer,
 * `cr_detail` / `sdlc` tabs). The default shell has no CR route at all after the 31.2
 * normalization, so every SDLC spec starts here.
 */
export async function gotoWorkbench(page: Page): Promise<void> {
  await page.goto('./?ui=intellij', { waitUntil: 'commit' });
  await expect(page.getByTestId('cr-explorer-btn-new-cr')).toBeVisible({ timeout: 30_000 });
}

export async function configureAiKey(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: /Trợ lý AI & Ghost Dev/ }).click();

  const keyInput = page.getByPlaceholder('Nhập 9router API Key (sk-...)');
  if (await keyInput.isVisible()) {
    await keyInput.fill('sk-mock-taskmate-key');
    await page.getByRole('button', { name: 'Lưu tất cả cấu hình' }).click();
    await expect(page.getByText('Lưu cấu hình thành công')).toBeVisible();
  }
}

/**
 * Creates a subsystem under a fresh logical parent. A CR target must be a subsystem
 * (`assertTargetsAreSubsystems`), so a bare `LOGICAL_GROUP` cannot be used as a target.
 */
export async function createSubsystem(
  page: Page,
  options: { groupName: string; groupCode: string; name: string; code: string }
): Promise<void> {
  await page.getByRole('button', { name: /Alt\+6: Systems Explorer/ }).click();

  await page.getByRole('button', { name: 'Tạo hệ thống' }).first().click();
  const groupDialog = page.getByRole('dialog');
  await expect(groupDialog).toBeVisible();
  await groupDialog.getByLabel('Tên hệ thống').fill(options.groupName);
  await groupDialog.getByLabel('Mã hệ thống (Code)').fill(options.groupCode);
  await groupDialog.getByRole('button', { name: 'Tạo hệ thống' }).click();
  await expect(page.getByText(options.groupCode, { exact: true })).toBeVisible();

  await page.getByTitle('Tạo hệ thống mới').click();
  const subsystemDialog = page.getByRole('dialog');
  await expect(subsystemDialog).toBeVisible();
  await subsystemDialog.locator('#type').click();
  await page
    .locator('.ant-select-dropdown')
    .last()
    .getByText('Service / Microservice')
    .first()
    .click();
  await subsystemDialog.getByLabel('Tên hệ thống').fill(options.name);
  await subsystemDialog.getByLabel('Mã hệ thống (Code)').fill(options.code);
  await subsystemDialog.getByRole('button', { name: 'Tạo hệ thống' }).click();
  await expect(page.getByText(options.code, { exact: true })).toBeVisible();
}

/**
 * Activates a left tool window. The stripe button is a toggle, so pressing it while the
 * window is already open closes it — check the explorer's own testid first.
 */
async function ensureCrExplorer(page: Page): Promise<void> {
  // After a reload the splash screen covers the workbench for ~2s, so the stripe button does
  // not exist yet; wait for it before deciding whether the explorer is already open.
  const stripeButton = page.getByRole('button', { name: /Alt\+1: CR Explorer/ });
  await expect(stripeButton).toBeVisible({ timeout: 30_000 });
  const explorer = page.locator('.workbench-toolwindow-left');
  if (!(await explorer.getByTestId('cr-explorer-btn-new-cr').isVisible())) {
    await stripeButton.click();
  }
  await expect(explorer.getByTestId('cr-explorer-btn-new-cr')).toBeVisible();
}

/** Creates a CR from the CR Explorer and targets `targetCode` (a subsystem code). */
export async function createChangeRequest(
  page: Page,
  options: { name: string; code: string; targetCode: string }
): Promise<void> {
  await ensureCrExplorer(page);
  await page.getByTestId('cr-explorer-btn-new-cr').click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Tên Change Request').fill(options.name);
  await dialog.getByLabel('Mã CR').fill(options.code);
  await dialog.locator('[data-testid="target-systems-selector"] .ant-select-input').click();
  await page
    .locator('.ant-select-dropdown')
    .last()
    .getByText(options.targetCode)
    .first()
    .click();
  await dialog.getByRole('button', { name: 'Tạo Change Request' }).click();

  await expect(page.getByText(options.code, { exact: true })).toBeVisible();
}

/** Opens the CR's SDLC Studio by selecting the CR's subsystem node in the CR Explorer. */
export async function openSdlcStudio(page: Page, subsystemCode: string): Promise<void> {
  await ensureCrExplorer(page);
  await page.locator('.workbench-toolwindow-left').getByText(subsystemCode).first().click();
  await expect(page.getByText(/^SDLC Studio — /)).toBeVisible();
}

export async function openAiDrawerWithCrScope(page: Page, crName: string): Promise<void> {
  // The stripe button toggles the right tool window, so read the durable open flag instead of
  // guessing — pressing it while the drawer is open closes it. The flag only exists once the
  // workbench has booted past the splash screen.
  const stripeButton = page.getByRole('button', { name: /Alt\+3: AI Assistant/ });
  await expect(stripeButton).toBeVisible({ timeout: 30_000 });
  const drawerOpen = await page.evaluate(
    () => localStorage.getItem('planner:ai_chat_open') === 'true'
  );
  if (!drawerOpen) {
    await stripeButton.click();
  }
  const header = page.getByText('Trợ lý AI', { exact: true }).first();
  // The durable flag can outlive the mounted drawer (a restore rewrites settings under it), so
  // fall back to the stripe button when the header did not appear.
  try {
    await expect(header).toBeVisible({ timeout: 5_000 });
  } catch {
    await stripeButton.click();
    await expect(header).toBeVisible();
  }

  await page.getByRole('button', { name: 'Đổi phạm vi ngữ cảnh' }).click();
  const scopeDialog = page.getByRole('dialog').last();
  await scopeDialog.getByText(crName, { exact: true }).click();
  await expect(
    page.locator('.workbench-toolwindow-right').getByText(crName, { exact: true }).first()
  ).toBeVisible();
}

type DexieRow = Record<string, unknown>;

export async function readDexieRows(page: Page, storeName: string): Promise<DexieRow[]> {
  return page.evaluate(async (name) => {
    const openDb = (dbName: string) =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

    const databases = await indexedDB.databases();
    for (const info of databases) {
      if (!info.name) continue;
      const handle = await openDb(info.name);
      if (!handle.objectStoreNames.contains(name)) {
        handle.close();
        continue;
      }
      const rows = await new Promise<DexieRow[]>((resolve, reject) => {
        const tx = handle.transaction(name, 'readonly');
        const req = tx.objectStore(name).getAll();
        req.onsuccess = () => resolve(req.result as DexieRow[]);
        req.onerror = () => reject(req.error);
      });
      handle.close();
      return rows;
    }
    return [] as DexieRow[];
  }, storeName);
}

export async function readDexieSetting(page: Page, key: string): Promise<unknown> {
  return page.evaluate(
    async ({ storeName, settingKey }) => {
      const openDb = (dbName: string) =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open(dbName);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });

      const databases = await indexedDB.databases();
      for (const info of databases) {
        if (!info.name) continue;
        const handle = await openDb(info.name);
        if (!handle.objectStoreNames.contains(storeName)) {
          handle.close();
          continue;
        }
        const record = await new Promise<{ key: string; value: unknown } | undefined>(
          (resolve, reject) => {
            const tx = handle.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).get(settingKey);
            req.onsuccess = () => resolve(req.result as { key: string; value: unknown } | undefined);
            req.onerror = () => reject(req.error);
          }
        );
        handle.close();
        return record?.value;
      }
      return undefined;
    },
    { storeName: 'settings', settingKey: key }
  );
}

export async function writeDexieRow(
  page: Page,
  storeName: string,
  row: DexieRow
): Promise<void> {
  await page.evaluate(
    async ({ name, record }) => {
      const openDb = (dbName: string) =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open(dbName);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });

      const databases = await indexedDB.databases();
      for (const info of databases) {
        if (!info.name) continue;
        const handle = await openDb(info.name);
        if (!handle.objectStoreNames.contains(name)) {
          handle.close();
          continue;
        }
        await new Promise<void>((resolve, reject) => {
          const tx = handle.transaction(name, 'readwrite');
          tx.objectStore(name).put(record);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
        handle.close();
        return;
      }
      throw new Error(`IndexedDB store not found: ${name}`);
    },
    { name: storeName, record: row }
  );
}

// ---- Backup export/import -------------------------------------------------

async function openBackupSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: /Sao lưu & Dữ liệu/ }).click();
}

export async function exportBackupFile(page: Page): Promise<string> {
  await openBackupSettings(page);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Xuất bản sao lưu (JSON)' }).click(),
  ]);

  const target = path.join(
    os.tmpdir(),
    `taskmate-backup-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
  );
  await download.saveAs(target);
  return target;
}

export async function downloadBackupJson(page: Page): Promise<Record<string, any>> {
  const filePath = await exportBackupFile(page);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, any>;
}

export async function importBackupFile(page: Page, filePath: string): Promise<void> {
  await openBackupSettings(page);

  const fileInput = page.locator('input[type="file"][accept*=".json"]').first();
  await expect(fileInput).toBeAttached();
  await fileInput.setInputFiles(filePath);

  const previewModal = page
    .getByRole('dialog')
    .filter({ hasText: 'Xem trước & Xác nhận Khôi phục' });
  await expect(previewModal).toBeVisible();

  await previewModal.getByPlaceholder('RESTORE').fill('RESTORE');
  const confirmRestoreBtn = previewModal.getByRole('button', { name: 'Xác nhận khôi phục' });
  await expect(confirmRestoreBtn).toBeEnabled();
  await confirmRestoreBtn.click();

  await expect(previewModal).not.toBeVisible();
  // Both the inline success alert and the toast announce it.
  await expect(page.getByText('Khôi phục dữ liệu thành công').first()).toBeVisible();
}
