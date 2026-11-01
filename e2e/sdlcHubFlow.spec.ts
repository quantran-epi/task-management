import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { createProject } from './helpers/sdlcFixtures';

const source = fs.readFileSync(new URL(import.meta.url), 'utf8');

test.describe('ProjectSdlcView canonical flow walk-through (SC-6)', () => {
  test.beforeEach(() => {
    expect(source).not.toContain('page.' + 'setContent');
  });

  test('drives ProjectSdlcView from Intake to CAB without manual DB seeding', async ({ page }) => {
    await page.goto('./', { waitUntil: 'commit' });
    const projectName = `SDLC E2E Project ${Date.now()}`;
    await createProject(page, projectName);

    // Open SDLC Studio from Projects table
    const projectRow = page.locator('tr').filter({ hasText: projectName });
    await expect(projectRow).toBeVisible();
    await projectRow.getByRole('button', { name: 'SDLC Studio' }).click();

    // Verify ProjectSdlcView studio is mounted
    await expect(page.getByText(`SDLC Studio — ${projectName}`)).toBeVisible();
    await expect(page.getByTestId('sdlc-sidebar')).toBeVisible();
    const workspace = page.getByTestId('sdlc-workspace');
    await expect(workspace).toBeVisible();

    // Step 1: Intake
    await page.getByPlaceholder('Mã CR (ví dụ: CR-2026-001)').fill('CR-25001');
    await page.getByPlaceholder('Tên tính năng (ví dụ: Nâng cấp chuyển tiền Napas)').fill('Tích hợp VietQR');
    await page.getByPlaceholder('Người lập (ví dụ: Nguyễn Văn A)').fill('Nguyen Van A');
    await page.getByPlaceholder('Đơn vị yêu cầu (ví dụ: Khối Ngân hàng số)').fill('Khối Bán lẻ');
    await page.getByPlaceholder('Nội dung Yêu cầu nghiệp vụ (PL01)...').fill('Yêu cầu nghiệp vụ chuyển khoản nhanh Napas 247 qua mã QR.');
    await page.getByPlaceholder('Nội dung Đặc tả chức năng (PL02)...').fill('Đặc tả API sinh mã VietQR và webhook xác nhận giao dịch.');

    await page.getByRole('button', { name: 'Bắt đầu phân tích Solution' }).click();

    // Step 2: Solution View
    await expect(page.getByText('Bước 2: Thiết kế giải pháp kiến trúc (SOLUTION.md)')).toBeVisible();
    const solutionEditor = page.getByPlaceholder('Nội dung kiến trúc giải pháp SOLUTION.md...');
    await solutionEditor.fill('# SOLUTION ARCHITECTURE\n\nKiến trúc module QR gateway chuẩn Napas 247.');
    await page.getByRole('button', { name: 'Duyệt & Lưu SOLUTION.md' }).click();

    await expect(page.getByText('Giải pháp đã được phê duyệt')).toBeVisible();
    await page.getByRole('button', { name: 'Tiếp tục sang Bước 3' }).click();

    // Step 3: Code Guide
    await expect(page.getByText('Bước 3: Hướng dẫn Coding ngoài & Đóng gói')).toBeVisible();
    await expect(page.getByText('node scripts/change-pack.mjs --cr CR-25001')).toBeVisible();
    await page.getByRole('button', { name: 'Đã code xong — Chuyển sang Nạp Change Pack' }).click();

    // Step 4: Change Pack View
    await expect(page.getByText('Bước 4: Nạp Change Pack & Đối chiếu Drift (Multi-Pack)')).toBeVisible();
    const fixtureZip = path.resolve('tests/fixtures/ai/change-packs/valid.zip');
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Khu vực nạp change-pack' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(fixtureZip);

    // Verify pack uploaded and drift matrix rendered inside workspace
    await expect(workspace.getByText('Lịch sử Change Packs đã nạp')).toBeVisible();
    await expect(workspace.getByText('valid.zip')).toBeVisible();
    await expect(workspace.getByText('Đang kích hoạt', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sang Bước 5: Sinh tài liệu kỹ thuật' })).toBeVisible();

    await page.getByRole('button', { name: 'Sang Bước 5: Sinh tài liệu kỹ thuật' }).click();

    // Step 5: Tech Docs View
    await expect(page.getByText('Bước 5: Tài liệu Kỹ thuật (PL03B & PL07)')).toBeVisible();
    await page.getByRole('button', { name: 'Tạo PL03B & PL07 bằng AI' }).click();

    await expect(page.getByRole('button', { name: 'Sang Bước 6: Tổng kết & Hồ sơ CAB' })).toBeVisible();
    await page.getByRole('button', { name: 'Sang Bước 6: Tổng kết & Hồ sơ CAB' }).click();

    // Step 6: CAB View
    await expect(page.getByText('Bước 6: Tổng kết & Hồ sơ CAB (Change Advisory Board)')).toBeVisible();
    await expect(workspace.getByText('Đã sẵn sàng').first()).toBeVisible();

    await page.getByRole('button', { name: 'Tạo Tờ trình CAB bằng AI' }).click();

    // Verify bank DOCX download buttons
    await expect(page.getByRole('button', { name: 'Tải CAB.docx' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tải toàn bộ bộ hồ sơ (.zip)' })).toBeVisible();
  });
});
