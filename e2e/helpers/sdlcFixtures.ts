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
  /** Holds every streaming request until the test releases it, so concurrency is observable. */
  holdRequests?: boolean;
  /**
   * Fails the request marked by its 0-based arrival index (never by prompt text, which differs
   * per test). `failCount` widens the window: after the first failure `runAiOrchestratorLoop`
   * issues one tool-less fallback request, which consumes the next index too.
   */
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

export async function configureAiKey(page: Page): Promise<void> {
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

export async function createProject(page: Page, name: string): Promise<void> {
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

export async function openAiDrawerWithProjectScope(page: Page, projectName: string): Promise<void> {
  const aiButton = page.getByRole('button', { name: 'Trợ lý AI (Cmd+J / Ctrl+J)' });
  await expect(aiButton).toBeVisible();
  await aiButton.click();
  await expect(page.getByText('Trợ lý AI', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Đổi phạm vi ngữ cảnh' }).click();
  const scopeDialog = page.getByRole('dialog');
  await scopeDialog.getByText(projectName, { exact: true }).click();
  await expect(page.getByText(`Đang gắn ngữ cảnh: ${projectName}`, { exact: true })).toBeVisible();
}

// ---- Raw IndexedDB access -------------------------------------------------
// Reads/writes go through a separate connection so a test can seed rows the UI cannot reach
// cheaply. Writes are invisible to Dexie liveQuery until the page reloads, so callers reload.

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

export async function deleteDexieRows(
  page: Page,
  storeName: string,
  predicateSource: string
): Promise<void> {
  await page.evaluate(
    async ({ name, source }) => {
      const openDb = (dbName: string) =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open(dbName);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });

      const matches = new Function('row', `return (${source});`) as (row: unknown) => boolean;
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
          const store = tx.objectStore(name);
          const req = store.openCursor();
          req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) return;
            if (matches(cursor.value)) cursor.delete();
            cursor.continue();
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
        handle.close();
        return;
      }
      throw new Error(`IndexedDB store not found: ${name}`);
    },
    { name: storeName, source: predicateSource }
  );
}

// ---- Backup export/import -------------------------------------------------

async function openBackupSettings(page: Page): Promise<void> {
  const closeDrawerBtn = page.getByRole('button', { name: 'Đóng ngăn trò chuyện' });
  if (await closeDrawerBtn.isVisible()) {
    await closeDrawerBtn.click();
  }

  const settingsMenuItem = page.getByRole('menuitem', { name: 'Cài đặt' });
  if (!(await settingsMenuItem.isVisible())) {
    const openMenuBtn = page.getByRole('button', { name: 'Mở menu' });
    if (await openMenuBtn.isVisible()) {
      await openMenuBtn.click();
    }
  }
  await page.getByRole('menuitem', { name: 'Cài đặt' }).click();
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
  await expect(page.getByText('Khôi phục dữ liệu thành công')).toBeVisible();
}
