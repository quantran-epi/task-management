import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import {
  createProject,
  openAiDrawerWithProjectScope,
  readDexieRows,
  writeDexieRow,
} from './helpers/sdlcFixtures';

const source = fs.readFileSync(new URL(import.meta.url), 'utf8');
/** Split so this spec's own negative assertions never read as a live wizard-surface reference. */
const WIZARD_START = 'Soạn ' + 'PL02';

const TS = '2026-10-30T00:00:00.000Z';
const SESSION_ID = '25000000-0000-4000-8000-000000000001';
const SOLUTION_NOTE_ID = '25000000-0000-4000-8000-000000000002';
const hash = (byte: string) => byte.repeat(64);

interface Ids {
  projectId: string;
  threadId: string;
}

const pl01 = { kind: 'PL01', version: 1, hash: hash('a'), title: 'PL01', content: 'PL01 content', sourceHashes: [], updatedAt: TS };
const pl02 = { kind: 'PL02', version: 1, hash: hash('b'), title: 'PL02', content: 'PL02 content', sourceHashes: [hash('a')], updatedAt: TS };
const solution = {
  kind: 'SOLUTION',
  version: 1,
  hash: hash('c'),
  title: 'SOLUTION',
  content: 'SOLUTION content',
  sourceHashes: [hash('a'), hash('b')],
  noteId: SOLUTION_NOTE_ID,
  updatedAt: TS,
};
const changePack = { kind: 'CHANGE_PACK', version: 1, hash: hash('d'), title: 'Change pack', content: 'pack', sourceHashes: [hash('c')], updatedAt: TS };
const pl03b = { kind: 'PL03B', version: 1, hash: hash('e'), title: 'PL03B', content: 'PL03B', sourceHashes: [hash('c')], updatedAt: TS };
const pl07 = { kind: 'PL07', version: 1, hash: hash('f'), title: 'PL07', content: 'PL07', sourceHashes: [hash('e')], updatedAt: TS };
const cab = { kind: 'CAB', version: 1, hash: hash('1'), title: 'CAB', content: 'CAB', sourceHashes: [hash('b'), hash('e'), hash('f')], updatedAt: TS };

/** One drift tuple per group, so all three stacked headings render with their own content. */
const driftResult = ({ projectId, threadId }: Ids) => ({
  schemaVersion: 1,
  identity: {
    projectId,
    threadId,
    solutionNoteId: SOLUTION_NOTE_ID,
    solutionVersion: 1,
    solutionHash: hash('c'),
    packHash: hash('d'),
    cr: 'CR-HUB',
    base: 'base-1',
    head: 'head-1',
  },
  status: 'DRIFT_DETECTED',
  approvedDesign: { currentSystem: 'current', affectedScreens: [], affectedApis: [], affectedTables: [] },
  actualImplementation: { affectedFiles: ['src/a.ts'], affectedScreens: [], affectedApis: [], affectedTables: [] },
  drift: [
    { requirementId: 'REQ-OUT', category: 'outside_solution', evidence: { evidenceId: 'ev-out', path: 'src/a.ts', startLine: 1, endLine: 2, text: 'x' } },
    { requirementId: 'REQ-MISS', category: 'missing', evidence: null, baselineRequirement: 'Phải làm' },
    { requirementId: 'REQ-DIFF', category: 'different', evidence: { evidenceId: 'ev-diff', path: 'src/b.ts', startLine: 3, endLine: 4, text: 'y' } },
  ],
  dbChangesRollback: { affectedTables: [], changes: [], rollback: { status: 'unknown', evidenceIds: [] } },
  regressionMatrix: [],
  coverage: [{ path: 'diff.patch', state: 'included', evidenceIds: [] }],
});

/**
 * The AI drawer keeps its open flag and scope in localStorage, so a reload usually reopens it with
 * the same project scope. Read the durable flag instead of guessing from a raced `isVisible()`.
 */
async function ensureDrawerWithProjectScope(page: Page, projectName: string): Promise<void> {
  const aiButton = page.getByRole('button', { name: 'Trợ lý AI (Cmd+J / Ctrl+J)' });
  await expect(aiButton).toBeVisible();
  if (!(await page.evaluate(() => localStorage.getItem('planner:ai_chat_open') === 'true'))) {
    await aiButton.click();
  }
  await expect(page.getByLabel('Nội dung tin nhắn trò chuyện AI')).toBeVisible();

  const scopeLabel = page.getByText(`Đang gắn ngữ cảnh: ${projectName}`, { exact: true });
  if (!(await scopeLabel.isVisible())) {
    await page.getByRole('button', { name: 'Đổi phạm vi ngữ cảnh' }).click();
    await page.getByRole('dialog').getByText(projectName, { exact: true }).click();
  }
  await expect(scopeLabel).toBeVisible();
}

async function selectSdlcTab(page: Page): Promise<void> {
  await page
    .getByRole('tablist', { name: 'Thanh tab hội thoại AI' })
    .getByRole('tab')
    .filter({ hasText: /SDLC/ })
    .first()
    .click();
}

async function openProject(page: Page, label: string): Promise<string> {
  await page.goto('./', { waitUntil: 'commit' });
  const projectName = `${label} ${Date.now()}`;
  await createProject(page, projectName);
  await openAiDrawerWithProjectScope(page, projectName);
  await expect(
    page.getByRole('tablist', { name: 'Thanh tab hội thoại AI' }).getByRole('tab').filter({ hasText: /SDLC/ }).first()
  ).toBeVisible();
  return projectName;
}

async function projectIds(page: Page, projectName: string): Promise<Ids> {
  const projectRow = (await readDexieRows(page, 'projects')).find((row) => row.name === projectName);
  expect(projectRow?.id).toBeTruthy();
  const projectId = String(projectRow!.id);
  const sdlcTab = (await readDexieRows(page, 'chatTabs')).find(
    (tab) => tab.scopeKey === `project:${projectId}` && tab.type === 'sdlc'
  );
  expect(sdlcTab?.threadId).toBeTruthy();
  return { projectId, threadId: String(sdlcTab!.threadId) };
}

/**
 * Seeds a full `SdlcWorkflowState` under every tab thread id for the project (plus the SDLC tab's
 * own key), so restore is deterministic no matter which thread the drawer resolves after reload.
 */
async function seedHubWorkflow(
  page: Page,
  projectName: string,
  build: (ids: Ids) => { currentStep: string; artifacts: Record<string, unknown> }
): Promise<Ids> {
  const ids = await projectIds(page, projectName);
  const { currentStep, artifacts } = build(ids);
  const tabs = (await readDexieRows(page, 'chatTabs')).filter(
    (tab) => tab.scopeKey === `project:${ids.projectId}`
  );

  if ('solution' in artifacts) {
    await writeDexieRow(page, 'notes', {
      id: SOLUTION_NOTE_ID,
      title: 'SOLUTION',
      body: 'SOLUTION content',
      entityType: 'project',
      entityId: ids.projectId,
      isPinned: false,
      createdAt: TS,
      updatedAt: TS,
    });
  }

  const state = {
    schemaVersion: 1,
    sessionId: SESSION_ID,
    projectId: ids.projectId,
    threadId: ids.threadId,
    currentStep,
    metadata: { cr: 'CR-HUB', featureName: 'Hub flow', author: 'Dev', requestingUnit: 'Unit', date: '2026-10-30' },
    artifacts,
    staleSteps: [],
    createdAt: TS,
    updatedAt: TS,
  };

  const keys = new Set(tabs.map((tab) => `sdlc_workflow:${ids.projectId}:${String(tab.threadId)}`));
  keys.add(`sdlc_workflow:${ids.projectId}:${ids.threadId}`);
  for (const key of keys) await writeDexieRow(page, 'settings', { key, value: state });

  await page.reload({ waitUntil: 'commit' });
  await ensureDrawerWithProjectScope(page, projectName);
  await selectSdlcTab(page);
  await expect(page.getByText('SDLC: Hub flow')).toBeVisible();
  return ids;
}

const selectStep = (page: Page, stepNumber: number) =>
  page.getByRole('button', { name: new RegExp(`^Bước ${stepNumber}:`) }).click();
const hubPanel = (page: Page, step: string) => page.getByTestId(`hub-panel-${step}`);

test.describe('Phase 25.1.1 SDLC hub acceptance', () => {
  test.beforeEach(() => {
    expect(source).not.toContain('page.' + 'setContent');
  });

  test('step 4 owns the change-pack dropzone inside the hub card', async ({ page }) => {
    const projectName = await openProject(page, 'Hub dropzone');
    await seedHubWorkflow(page, projectName, () => ({
      currentStep: 'CHANGE_PACK',
      artifacts: { pl01, pl02, solution },
    }));

    const dropzone = hubPanel(page, 'CHANGE_PACK').getByText(
      'Kéo thả change-pack.zip vào đây hoặc bấm để chọn tệp.',
      { exact: true }
    );
    await expect(dropzone).toBeVisible();

    const dropzoneBox = await dropzone.boundingBox();
    const composerBox = await page.getByLabel('Nội dung tin nhắn trò chuyện AI').boundingBox();
    expect(dropzoneBox!.y).toBeLessThan(composerBox!.y);

    // The composer's leading slot no longer carries a wizard bar.
    await expect(page.getByText('Thanh chọn wizard tài liệu')).toHaveCount(0);
    await expect(page.getByPlaceholder('Trả lời câu hỏi hoặc bổ sung thông tin…')).toHaveCount(0);
  });

  test('committed pack and drift render stacked, never as a table', async ({ page }) => {
    const projectName = await openProject(page, 'Hub drift');
    await seedHubWorkflow(page, projectName, (ids) => ({
      currentStep: 'CHANGE_PACK',
      artifacts: { pl01, pl02, solution, changePack, driftResult: driftResult(ids) },
    }));

    const panel = hubPanel(page, 'CHANGE_PACK');
    await expect(panel.getByText('Đã nạp change-pack CR-HUB')).toBeVisible();
    for (const heading of ['Ngoài solution', 'Chưa làm', 'Làm khác']) {
      await expect(panel.getByRole('heading', { name: heading })).toBeVisible();
    }
    await expect(panel.locator('table')).toHaveCount(0);
  });

  test('step 5 gates both ways on SOLUTION plus a confirmed pack', async ({ page }) => {
    const projectName = await openProject(page, 'Hub step5');
    await seedHubWorkflow(page, projectName, () => ({
      currentStep: 'TECH_DOCS',
      artifacts: { pl01, pl02, solution, changePack },
    }));
    await expect(
      hubPanel(page, 'TECH_DOCS').getByRole('button', { name: 'Tạo PL03B & PL07' })
    ).toBeEnabled();

    await seedHubWorkflow(page, projectName, () => ({
      currentStep: 'TECH_DOCS',
      artifacts: { pl01, pl02, solution },
    }));
    const blocked = hubPanel(page, 'TECH_DOCS');
    await expect(
      blocked.getByText('Cần SOLUTION.md và change-pack đã xác nhận trước khi sinh PL03B & PL07.')
    ).toBeVisible();
    await expect(blocked.getByRole('button', { name: 'Tạo PL03B & PL07' })).toBeDisabled();
  });

  test('step 6 gates both ways on PL02, PL03B and PL07', async ({ page }) => {
    const projectName = await openProject(page, 'Hub step6');
    await seedHubWorkflow(page, projectName, () => ({
      currentStep: 'CAB',
      artifacts: { pl01, pl02, solution, changePack, pl03b, pl07 },
    }));
    await expect(hubPanel(page, 'CAB').getByRole('button', { name: 'Tạo tờ trình CAB' })).toBeEnabled();

    await seedHubWorkflow(page, projectName, () => ({
      currentStep: 'CAB',
      artifacts: { pl01, pl02, solution, changePack, pl03b },
    }));
    const blocked = hubPanel(page, 'CAB');
    await expect(blocked.getByText('Chưa có', { exact: true })).toHaveCount(1);
    await expect(blocked.getByRole('button', { name: 'Tạo tờ trình CAB' })).toBeDisabled();
  });

  test('all four DOCX export entry points live on their own hub step', async ({ page }) => {
    const projectName = await openProject(page, 'Hub export');
    await seedHubWorkflow(page, projectName, () => ({
      currentStep: 'CAB',
      artifacts: { pl01, pl02, solution, changePack, pl03b, pl07, cab },
    }));

    // PL02 exports from step 1 (INTAKE); PL03B/PL07 from step 5; CAB from step 6.
    await selectStep(page, 1);
    await expect(page.getByRole('button', { name: 'Xuất PL02 (.docx)' })).toHaveCount(1);

    await selectStep(page, 5);
    await expect(page.getByRole('button', { name: 'Xuất PL03B (.docx)' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Xuất PL07 (.docx)' })).toHaveCount(1);

    await selectStep(page, 6);
    await expect(page.getByRole('button', { name: 'Xuất CAB (.docx)' })).toHaveCount(1);
  });

  test('no wizard surface on either an ordinary tab or the SDLC tab', async ({ page }) => {
    const projectName = await openProject(page, 'Hub no-wizard');
    await seedHubWorkflow(page, projectName, () => ({
      currentStep: 'CHANGE_PACK',
      artifacts: { pl01, pl02, solution },
    }));

    await page
      .getByRole('tablist', { name: 'Thanh tab hội thoại AI' })
      .getByRole('tab')
      .filter({ hasText: '💬 Tra cứu & Hỏi đáp' })
      .first()
      .click();
    await expect(page.getByRole('button', { name: new RegExp(WIZARD_START) })).toHaveCount(0);
    await expect(page.getByText('Thanh chọn wizard tài liệu')).toHaveCount(0);

    await selectSdlcTab(page);
    await expect(page.getByRole('button', { name: new RegExp(WIZARD_START) })).toHaveCount(0);
    await expect(page.getByText('Thanh chọn wizard tài liệu')).toHaveCount(0);
    await expect(page.getByPlaceholder('Trả lời câu hỏi hoặc bổ sung thông tin…')).toHaveCount(0);
  });

  test('collapse hides the six step rows and keeps the detail panel', async ({ page }) => {
    const projectName = await openProject(page, 'Hub collapse');
    await seedHubWorkflow(page, projectName, () => ({
      currentStep: 'CHANGE_PACK',
      artifacts: { pl01, pl02, solution },
    }));

    const stepRows = page.getByRole('button', { name: /^Bước \d:/ });
    const toggle = page.getByRole('button', { name: 'Thu gọn quy trình' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(stepRows).toHaveCount(6);

    await toggle.click();
    await expect(page.getByRole('button', { name: 'Mở rộng quy trình' })).toHaveAttribute('aria-expanded', 'false');
    await expect(stepRows).toHaveCount(0);
    await expect(hubPanel(page, 'CHANGE_PACK')).toBeVisible();

    await page.getByRole('button', { name: 'Mở rộng quy trình' }).click();
    await expect(page.getByRole('button', { name: 'Thu gọn quy trình' })).toHaveAttribute('aria-expanded', 'true');
    await expect(stepRows).toHaveCount(6);
  });

  test('320px stays free of horizontal overflow with the drift matrix open', async ({ page }) => {
    const projectName = await openProject(page, 'Hub 320');
    await seedHubWorkflow(page, projectName, (ids) => ({
      currentStep: 'CHANGE_PACK',
      artifacts: { pl01, pl02, solution, changePack, driftResult: driftResult(ids) },
    }));

    await page.setViewportSize({ width: 320, height: 800 });
    await expect(hubPanel(page, 'CHANGE_PACK').getByText('Đã nạp change-pack CR-HUB')).toBeVisible();

    const metrics = () =>
      page.evaluate(() => {
        const panel = document.querySelector('[data-testid="hub-panel-CHANGE_PACK"]') as HTMLElement | null;
        return {
          page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          body: document.body.scrollWidth - document.body.clientWidth,
          panel: (panel?.scrollWidth ?? 0) - (panel?.clientWidth ?? 0),
        };
      });

    // The drawer is flex-sized from the previous viewport and only reflows on the breakpoint
    // effect, so poll until it has settled at 320px instead of sampling once.
    await expect
      .poll(async () => {
        const m = await metrics();
        return m.page <= 2 && m.body <= 2 && m.panel <= 2;
      })
      .toBe(true);
  });
});
