import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  createChangeRequest,
  createSubsystem,
  gotoWorkbench,
  openSdlcStudio,
} from './helpers/sdlcFixtures';

const source = fs.readFileSync(new URL(import.meta.url), 'utf8');

/**
 * SC-6 walk-through on the CR model. The entry point is the CR Explorer — there is no
 * `projects` route after the 31.2 normalization — and the studio is reached from a CR's
 * subsystem node, so the whole flow is CR-scoped from the first click.
 *
 * The walk stops at the Step 3 review surface: advancing to Step 4 needs a real SSH repo to
 * produce a Branch Snapshot, which the e2e harness has no fixture for. Step 4's per-subsystem
 * packing is covered by `Step4ChangePackView.test.tsx`.
 */
test.describe('ChangeRequestSdlcView canonical flow walk-through (SC-6)', () => {
  test.beforeEach(() => {
    expect(source).not.toContain('page.' + 'setContent');
  });

  test('drives ChangeRequestSdlcView from CR Explorer Intake to the Step 3 review gate', async ({
    page,
  }) => {
    await gotoWorkbench(page);

    const suffix = String(Date.now());
    await createSubsystem(page, {
      groupName: `SDLC E2E Group ${suffix}`,
      groupCode: `E2E-GRP-${suffix}`,
      name: 'VietQR Gateway',
      code: `E2E-VQR-${suffix}`,
    });
    await createChangeRequest(page, {
      name: `Tích hợp VietQR ${suffix}`,
      code: `CR-E2E-${suffix}`,
      targetCode: `E2E-VQR-${suffix}`,
    });

    // CR Explorer is the entry point; selecting the subsystem node opens the studio.
    await openSdlcStudio(page, `E2E-VQR-${suffix}`);
    await expect(page.getByTestId('sdlc-sidebar')).toBeVisible();
    await expect(page.getByTestId('sdlc-workspace')).toBeVisible();
    await expect(page.getByTestId('sidebar-target-systems')).toContainText(`E2E-VQR-${suffix}`);

    // Step 1: Intake
    await page.getByPlaceholder('Mã CR (ví dụ: CR-2026-001)').fill(`CR-E2E-${suffix}`);
    await page
      .getByPlaceholder('Tên tính năng (ví dụ: Nâng cấp chuyển tiền Napas)')
      .fill('Tích hợp VietQR');
    await page.getByPlaceholder('Người lập (ví dụ: Nguyễn Văn A)').fill('Nguyen Van A');
    await page
      .getByPlaceholder('Đơn vị yêu cầu (ví dụ: Khối Ngân hàng số)')
      .fill('Khối Bán lẻ');
    await page
      .getByPlaceholder('Nội dung Yêu cầu nghiệp vụ (PL01)...')
      .fill('Yêu cầu nghiệp vụ chuyển khoản nhanh Napas 247 qua mã QR.');
    await page
      .getByPlaceholder('Nội dung Đặc tả chức năng (PL02)...')
      .fill('Đặc tả API sinh mã VietQR và webhook xác nhận giao dịch.');

    await page.getByRole('button', { name: 'Bắt đầu phân tích Solution' }).click();

    // Step 2: Solution View
    await expect(
      page.getByText('Bước 2: Thiết kế giải pháp kiến trúc (SOLUTION.md)')
    ).toBeVisible();
    await page
      .getByPlaceholder('Nội dung kiến trúc giải pháp SOLUTION.md...')
      .fill('# SOLUTION ARCHITECTURE\n\nKiến trúc module QR gateway chuẩn Napas 247.');
    await page.getByRole('button', { name: 'Duyệt & Lưu SOLUTION.md' }).click();

    await expect(page.getByText('Giải pháp đã được phê duyệt')).toBeVisible();
    await page.getByRole('button', { name: 'Tiếp tục sang Bước 3' }).click();

    // Step 3: Code Guide — the review surface, with both advance actions gated on a snapshot
    // that a no-SSH harness can never produce.
    await expect(
      page.getByText('Bước 3: Review Nhánh & Diff Repository Remote qua SSH')
    ).toBeVisible();
    await expect(page.getByText('Chưa liên kết SSH')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chấp thuận kết quả review' })).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Chuyển sang Bước 4: Change Pack' })
    ).toBeDisabled();
  });
});
