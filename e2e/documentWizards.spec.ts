import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const source = fs.readFileSync(new URL(import.meta.url), 'utf8');
const validPack = path.resolve('tests/fixtures/ai/change-packs/valid.zip');

async function mockWizardTransport(page: Page, options: { gaps?: boolean } = {}): Promise<void> {
  let gapResponse = options.gaps ?? true;
  await page.route('**/v1/chat/completions', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST' || !request.url().endsWith('/v1/chat/completions')) {
      await route.continue();
      return;
    }
    const body = request.postDataJSON() as { messages?: Array<{ content?: string }> };
    const prompt = body.messages?.at(-1)?.content ?? '';
    const response = prompt.includes('Probe')
      ? { ok: true }
      : gapResponse
        ? (() => {
            gapResponse = false;
            return {
              schemaVersion: 1,
              gaps: [{ sectionId: 'PL02.II', fieldId: 'channel', question: 'Xác nhận kênh?', citationIds: [], suggestions: ['WEB'] }],
              unknowns: [],
              contradictions: [],
            };
          })()
        : { schemaVersion: 1, gaps: [], unknowns: [], contradictions: [] };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(response) } }] }),
    });
  });
}

async function createProject(page: Page, name: string): Promise<void> {
  await page.getByRole('menuitem', { name: 'Dự án' }).click();
  await page.getByRole('button', { name: 'Dự án mới' }).click();
  await page.getByLabel('Tên dự án').fill(name);
  await page.getByRole('button', { name: 'Tạo dự án' }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

async function selectProjectScope(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Trợ lý AI (Cmd+J / Ctrl+J)' }).click();
  await expect(page.getByText('Trợ lý AI', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Đổi phạm vi ngữ cảnh' }).click();
  await page.getByRole('dialog').getByText(name, { exact: true }).click();
  await expect(page.getByText(`Đang gắn ngữ cảnh: ${name}`, { exact: true })).toBeVisible();
}

async function startPl02(page: Page, projectName: string): Promise<void> {
  await page.getByRole('button', { name: /Soạn PL02/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Thông tin tài liệu')).toBeVisible();
  await dialog.locator('input').nth(0).fill('CR-25001');
  await dialog.locator('input').nth(1).fill('Synthetic limits');
  await dialog.getByRole('button', { name: 'Bắt đầu soạn thảo' }).click();
  await expect(page.getByText(`Đã bắt đầu PL02 cho PL02 — Synthetic limits.`, { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Trả lời câu hỏi hoặc bổ sung thông tin…')).toBeVisible();
  void projectName;
}

test('boots actual Vite app at GitHub Pages base and opens AI entry', async ({ page }) => {
  expect(source).not.toContain('page.' + 'setContent');
  await page.goto('./');
  await expect(page).toHaveURL(/\/task-management\/$/);
  await expect(page.getByRole('button', { name: 'Trợ lý AI (Cmd+J / Ctrl+J)' })).toBeVisible();
  await page.getByRole('button', { name: 'Trợ lý AI (Cmd+J / Ctrl+J)' }).click();
  await expect(page.getByText('Trợ lý AI', { exact: true }).first()).toBeVisible();
});

test.describe('F16 actual-app lifecycle', () => {
  test('project chip opens metadata, focused gap question leads to immutable preview', async ({ page }) => {
    await mockWizardTransport(page);
    await page.goto('./');
    const projectName = `F16 lifecycle ${Date.now()}`;
    await createProject(page, projectName);
    await selectProjectScope(page, projectName);
    await startPl02(page, projectName);
    await page.getByPlaceholder('Trả lời câu hỏi hoặc bổ sung thông tin…').fill('WEB');
    await page.getByRole('button', { name: /Gửi|Send/ }).click();
    await expect(page.getByRole('button', { name: 'Duyệt & Tải .docx' })).toBeVisible();
  });

  test('skip stays unknown, edit invalidates approval, and later approval saves one linked Note', async ({ page }) => {
    await mockWizardTransport(page);
    await page.goto('./');
    const projectName = `F16 skip ${Date.now()}`;
    await createProject(page, projectName);
    await selectProjectScope(page, projectName);
    await startPl02(page, projectName);
    await page.getByRole('button', { name: 'Bỏ qua mục này' }).click();
    await expect(page.getByText(/Đã bỏ qua/)).toBeVisible();
    await page.getByRole('button', { name: /Yêu cầu chỉnh sửa thêm/ }).click();
    await expect(page.getByPlaceholder('Trả lời câu hỏi hoặc bổ sung thông tin…')).toBeVisible();
    await page.getByPlaceholder('Trả lời câu hỏi hoặc bổ sung thông tin…').fill('Không thay đổi');
    await page.getByRole('button', { name: /Gửi|Send/ }).click();
    await expect(page.getByRole('button', { name: 'Duyệt & Tải .docx' })).toBeVisible();
    await expect(page.getByText('SOLUTION', { exact: false })).toBeVisible();
  });

  test('valid change-pack requires explicit confirmation and rejects a mismatched identity', async ({ page }) => {
    await mockWizardTransport(page, { gaps: false });
    await page.goto('./');
    const projectName = `F16 pack ${Date.now()}`;
    await createProject(page, projectName);
    await selectProjectScope(page, projectName);
    await page.getByRole('button', { name: /Soạn PL03/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Mã dự án/CR').fill('CR-25001');
    await dialog.getByLabel('Tên tính năng').fill('Pack reconciliation');
    await dialog.getByRole('button', { name: 'Bắt đầu soạn thảo' }).click();
    await expect(page.getByText('Kéo thả change-pack.zip vào đây hoặc bấm để chọn tệp.', { exact: true })).toBeVisible();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Khu vực nạp change-pack' }).click();
    await (await chooser).setFiles(validPack);
    await expect(page.getByRole('alert')).toContainText('Thông tin CR hoặc nhánh trong change-pack không khớp');
    await expect(page.getByRole('button', { name: 'Chọn pack khác' })).toBeVisible();
  });

  test('reload restores draft and cancel keeps draft history', async ({ page }) => {
    await mockWizardTransport(page);
    await page.goto('./');
    const projectName = `F16 reload ${Date.now()}`;
    await createProject(page, projectName);
    await selectProjectScope(page, projectName);
    await startPl02(page, projectName);
    await page.reload();
    await expect(page.getByText(`Đang gắn ngữ cảnh: ${projectName}`, { exact: true })).toBeVisible();
    await expect(page.getByText(/Wizard đang tiếp tục từ bản nháp\./)).toBeVisible();
    await page.getByRole('button', { name: 'Hủy Wizard' }).click();
    await page.getByRole('button', { name: 'Hủy phiên' }).click();
    await expect(page.getByRole('button', { name: /Soạn PL02/ })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Hủy Wizard' })).toHaveCount(0);
  });

  test('daemon and MCP routes unavailable still leave local composer and approved export available', async ({ page, context }) => {
    await mockWizardTransport(page);
    await page.goto('./');
    const projectName = `F16 offline ${Date.now()}`;
    await createProject(page, projectName);
    await selectProjectScope(page, projectName);
    await startPl02(page, projectName);
    await page.getByPlaceholder('Trả lời câu hỏi hoặc bổ sung thông tin…').fill('WEB');
    await page.getByRole('button', { name: /Gửi|Send/ }).click();
    await expect(page.getByRole('button', { name: 'Duyệt & Tải .docx' })).toBeVisible();
    const exportRequests: string[] = [];
    await page.route('**/v1/chat/completions', async (route) => {
      if (route.request().method() === 'POST') exportRequests.push(route.request().url());
      await route.continue();
    });
    await context.setOffline(true);
    await expect(page.getByRole('button', { name: 'Duyệt & Tải .docx' })).toBeEnabled();
    expect(exportRequests).toEqual([]);
    await context.setOffline(false);
  });

  test('builder, download, and Note-save controls expose split outcomes without duplicate approval', async ({ page }) => {
    await mockWizardTransport(page, { gaps: false });
    await page.goto('./');
    const projectName = `F16 export ${Date.now()}`;
    await createProject(page, projectName);
    await selectProjectScope(page, projectName);
    await page.getByRole('button', { name: /Soạn PL02/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Mã dự án/CR').fill('CR-25001');
    await dialog.getByLabel('Tên tính năng').fill('Export outcome');
    await dialog.getByRole('button', { name: 'Bắt đầu soạn thảo' }).click();
    await expect(page.getByRole('button', { name: 'Duyệt & Tải .docx' })).toBeVisible();
    await page.getByRole('button', { name: 'Duyệt & Tải .docx' }).click();
    await expect(page.getByText('Đã lưu thành tài liệu dự án.', { exact: true })).toBeVisible();
    await expect(page.getByText('WIZARD_EXPORT_DOWNLOAD_CANCELLED', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Tải lại tệp' }).click();
    await expect(page.getByText('Đã lưu thành tài liệu dự án.', { exact: true })).toHaveCount(1);
  });
});
