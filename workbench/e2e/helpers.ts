import { expect, type Page } from '@playwright/test';

/**
 * Seed V28 through the app's real Vite-served modules before first navigation.
 * addInitScript runs at document_start, so no post-boot db.delete() race with
 * the app's own Dexie connection. Idempotent across reloads.
 */
export async function seedV28InBrowser(page: Page): Promise<{
  crCode: string;
  crId: string;
  taskNames: string[];
  taskIds: string[];
  systemCode: string;
}> {
  await page.addInitScript(async () => {
    if (!location.pathname.startsWith('/task-management')) return;
    const base = '/task-management';
    const { TaskPlannerDatabase } = await import(`${base}/src/db/index.ts`);
    const { seedV28 } = await import(`${base}/workbench/seed/v28Seed.ts`);
    const db = new TaskPlannerDatabase('PersonalTaskPlannerDB');
    if ((await db.tasks.count()) === 0) {
      await seedV28(db);
    }
    db.close();
    (window as unknown as { __workbenchSeeded?: boolean }).__workbenchSeeded = true;
  });

  await page.goto('/task-management/');
  await page.waitForFunction(
    () => (window as unknown as { __workbenchSeeded?: boolean }).__workbenchSeeded === true
  );

  const seeded = await page.evaluate(async () => {
    const base = '/task-management';
    const { TaskPlannerDatabase } = await import(`${base}/src/db/index.ts`);
    const db = new TaskPlannerDatabase('PersonalTaskPlannerDB');
    const fixtureRows = await db.tasks.toArray();
    const crs = await db.changeRequests.toArray();
    const systems = await db.systems.toArray();
    db.close();
    return {
      crCode: crs[0]!.code,
      crId: crs[0]!.id,
      taskNames: fixtureRows.map((task) => task.name),
      taskIds: fixtureRows.map((task) => task.id).sort(),
      systemCode: systems[0]!.code,
    };
  });
  await expect(page.locator('.taskmate-workbench-theme').first()).toBeVisible();
  return seeded;
}

export async function openSettingsTab(page: Page, tabName: string): Promise<void> {
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await expect(page.getByRole('heading', { name: 'Cài đặt & Cấu hình công suất' })).toBeVisible();
  await page.getByRole('tab', { name: tabName }).click();
}

export async function openAiAssistant(page: Page): Promise<void> {
  await page.getByRole('button', { name: /AI Assistant/ }).first().click();
  await expect(
    page.getByRole('textbox', { name: 'Nội dung tin nhắn trò chuyện AI' })
  ).toBeVisible();
}
