import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { seedV28InBrowser } from './helpers';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Only the known-good fixture is uploaded; assert preview, no import/traversal path. */
test('valid change-pack zip opens real Docs preview via setInputFiles', async ({ page }) => {
  await seedV28InBrowser(page);
  await page.locator('[data-testid="stripe-btn-docs"]').click();
  const actions = page.locator('[data-testid="docs-set-workspace"]');
  await expect(actions).toBeVisible();
  await expect(actions.getByRole('button', { name: 'Nhập Zip' })).toBeVisible();

  const zipPath = resolve(repoRoot, 'tests/fixtures/ai/change-packs/valid.zip');
  const zipInput = actions.locator('input[type="file"][accept=".zip"]');
  await zipInput.setInputFiles(zipPath);

  const modal = page.getByRole('dialog', { name: /Xem trước & Nhập tài liệu từ Zip/ });
  await expect(modal).toBeVisible({ timeout: 15_000 });
  await expect(modal.getByText('valid.zip')).toBeVisible();
  // The change-pack fixture is valid ZIP but holds no Markdown; the real app
  // reports that verdict in the preview. Assert the verdict, not a fabricated import.
  await expect(modal).toContainText('Xem trước & Nhập tài liệu từ Zip');
  await expect(modal).toContainText('Không tìm thấy tệp Markdown');
  await expect(modal.getByRole('button', { name: 'Hủy' })).toBeVisible();
});
