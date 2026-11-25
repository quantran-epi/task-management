import { expect, type Page } from '@playwright/test';

/** Seed V28 through the app's real Vite-served modules; no setContent, no raw IDB writes. */
export async function seedV28InBrowser(page: Page): Promise<{
  crCode: string;
  crId: string;
  taskNames: string[];
  taskIds: string[];
  systemCode: string;
}> {
  await page.goto('/task-management/');
  await expect(page.locator('.taskmate-workbench-theme').first()).toBeVisible();
  const seeded = await page.evaluate(async () => {
    const base = '/task-management';
    const { TaskPlannerDatabase } = await import(`${base}/src/db/index.ts`);
    const { seedV28 } = await import(`${base}/workbench/seed/v28Seed.ts`);
    const db = new TaskPlannerDatabase('PersonalTaskPlannerDB');
    await db.delete();
    const fresh = new TaskPlannerDatabase('PersonalTaskPlannerDB');
    const fixture = await seedV28(fresh);
    return {
      crCode: fixture.changeRequests[0]!.code,
      crId: fixture.changeRequests[0]!.id,
      taskNames: fixture.tasks.map((task) => task.name),
      taskIds: fixture.tasks.map((task) => task.id).sort(),
      systemCode: fixture.systems[0]!.code,
    };
  });
  await page.reload();
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
