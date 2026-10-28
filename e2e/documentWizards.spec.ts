import fs from 'node:fs';
import { expect, test } from '@playwright/test';

const source = fs.readFileSync(new URL(import.meta.url), 'utf8');

test('boots the actual Vite app at the GitHub Pages base and opens AI entry', async ({ page }) => {
  expect(source).not.toContain('page.' + 'setContent');

  await page.goto('./');
  await expect(page).toHaveURL(/\/task-management\/$/);
  await expect(page.getByRole('button', { name: 'Trợ lý AI (Cmd+J / Ctrl+J)' })).toBeVisible();

  await page.getByRole('button', { name: 'Trợ lý AI (Cmd+J / Ctrl+J)' }).click();
  await expect(page.getByText('Trợ lý AI', { exact: true }).first()).toBeVisible();
});

test.describe('F16 actual-app lifecycle producer contracts', () => {
  test.fixme('project chip opens metadata, then focused gap questions lead to immutable preview');
  test.fixme('skip stays unknown, edit invalidates approval, and later approval saves one linked Note');
  test.fixme('valid change-pack requires confirmation, persists atomically, and renders reconciliation drift');
  test.fixme('reload restores draft and cancel keeps already exported artifacts');
  test.fixme('daemon unavailable and browser offline preserve local CRUD, recovery, and approved export');
  test.fixme('builder, download, and Note-save failures show split truthful outcomes without duplicates');
});
