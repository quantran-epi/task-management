import { expect, test } from '@playwright/test';
import { openSettingsTab, seedV28InBrowser } from './helpers';

/** Export from real app code, wipe, then upload through Settings > Nhập & Khôi phục. */
test('backup export → setInputFiles → RESTORE → V28 rows return', async ({ page }) => {
  const seeded = await seedV28InBrowser(page);

  const backupJson = await page.evaluate(async () => {
    const { TaskPlannerDatabase } = await import('/task-management/src/db/index.ts');
    const { exportBackupPayload } = await import('/task-management/src/services/backup/exportBackup.ts');
    const db = new TaskPlannerDatabase('PersonalTaskPlannerDB');
    const envelope = await exportBackupPayload(db);
    await db.transaction('rw', db.tasks, db.systems, db.changeRequests, db.notes, async () => {
      await Promise.all([
        db.tasks.clear(),
        db.systems.clear(),
        db.changeRequests.clear(),
        db.notes.clear(),
      ]);
    });
    return JSON.stringify(envelope);
  });

  await openSettingsTab(page, 'Sao lưu & Dữ liệu');
  const upload = page.locator('input[type="file"][accept=".json,application/json"]').first();
  await expect(upload).toHaveCount(1);
  await upload.setInputFiles({
    name: 'v28-workbench-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backupJson, 'utf8'),
  });

  const modal = page.getByRole('dialog', { name: 'Xem trước & Xác nhận Khôi phục' });
  await expect(modal).toBeVisible({ timeout: 15_000 });
  await expect(modal).toContainText('Hành động thay thế toàn bộ dữ liệu');
  await modal.getByRole('textbox', { name: 'Xác nhận từ khóa RESTORE' }).fill('RESTORE');
  await modal.getByRole('button', { name: 'Xác nhận khôi phục' }).click();
  await expect(modal).toHaveCount(0, { timeout: 20_000 });

  const restored = await page.evaluate(async () => {
    const { TaskPlannerDatabase } = await import('/task-management/src/db/index.ts');
    const db = new TaskPlannerDatabase('PersonalTaskPlannerDB');
    const tasks = await db.tasks.toArray();
    const crs = await db.changeRequests.toArray();
    const systems = await db.systems.toArray();
    return {
      taskCount: tasks.length,
      taskIds: tasks.map((t) => t.id).sort(),
      crCodes: crs.map((cr) => cr.code).sort(),
      systemCodes: systems.map((s) => s.code).sort(),
      capacityRules: await db.capacityRules.count(),
    };
  });

  expect(restored.taskCount).toBe(5);
  expect(restored.taskIds).toEqual(seeded.taskIds);
  expect(restored.crCodes).toContain(seeded.crCode);
  expect(restored.systemCodes).toContain(seeded.systemCode);
  expect(restored.capacityRules).toBe(7);
});
