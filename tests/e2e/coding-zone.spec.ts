import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

const HARNESS = '/task-management/e2e/coding-zone.html';
const SHOTS = 'test-results/coding-zone';

interface BrowserErrors {
  console: string[];
  page: string[];
}

function watchErrors(page: Page): BrowserErrors {
  const errors: BrowserErrors = { console: [], page: [] };
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') errors.console.push(message.text());
  });
  page.on('pageerror', (error) => errors.page.push(error.message));
  return errors;
}

async function expectNoErrors(errors: BrowserErrors): Promise<void> {
  expect(errors.console, `console errors: ${errors.console.join(' | ')}`).toEqual([]);
  expect(errors.page, `page errors: ${errors.page.join(' | ')}`).toEqual([]);
}

async function openWorkbench(page: Page): Promise<void> {
  await page.goto(HARNESS);
  await expect(page.getByTestId('coding-zone-trigger')).toHaveText('Mở Coding Zone');
  await page.getByTestId('coding-zone-trigger').click();
  await expect(page.getByTestId('coding-zone-modal')).toBeVisible();
}

test('Coding Zone modal: tree, tabs, diff review, chat, theme, and zero browser errors', async ({ page }) => {
  const errors = watchErrors(page);
  await openWorkbench(page);

  // (1) fullscreen modal, three panes, both perspective labels
  await expect(page.getByRole('dialog', { name: 'Agent Developer Workbench' })).toBeVisible();
  await expect(page.getByTestId('cz-perspective-code')).toHaveText('Coding zone');
  await expect(page.getByTestId('cz-perspective-chat')).toHaveText('Team chat + agent activity');
  const columns = await page.getByTestId('cz-modal-body').evaluate((node) => getComputedStyle(node).gridTemplateColumns);
  expect(columns.split(' ')).toHaveLength(3);
  await page.screenshot({ path: `${SHOTS}/modal.png`, fullPage: true });

  // (2) tree renders real paths, search filters, scope switches
  const rows = page.getByTestId('coding-zone-tree-row');
  await expect(rows.filter({ hasText: 'planHours.ts' })).toHaveCount(1);
  await expect(rows.filter({ hasText: 'notes.md' })).toHaveCount(0);
  await page.getByTestId('coding-zone-tree-search').fill('planHours');
  await expect(rows).toHaveCount(3); // src folder + planner folder + matching file
  await page.getByTestId('coding-zone-tree-search').fill('');
  await page.getByRole('button', { name: 'Tất cả' }).click();
  await expect(rows.filter({ hasText: 'notes.md' })).toHaveCount(1);

  // (3) file tree opens a real viewer tab; pinned tab has no close control
  await rows.filter({ hasText: 'notes.md' }).click();
  await expect(page.getByTestId('cz-tab-code')).toHaveAttribute('data-path', 'src/planner/notes.md');
  await expect(page.getByTestId('remote-file-viewer')).toBeVisible();
  await expect(page.getByTestId('remote-file-path')).toContainText('notes.md');
  await expect(page.getByTestId('readonly-badge')).toHaveText('Read-Only');
  await expect(page.getByTestId('line-numbers-gutter')).toBeVisible();
  await expect(page.getByTestId('cz-tab-overview')).toBeVisible();
  await expect(page.getByTestId('cz-tab-overview').locator('.cz-tab-close')).toHaveCount(0);
  await page.getByTestId('cz-tab-close-code').click();
  await expect(page.getByTestId('cz-tab-code')).toHaveCount(0);

  // (4) diff modes, per-hunk decisions, counters, toggle back, bulk actions
  await rows.filter({ hasText: 'planHours.ts' }).click();
  await expect(page.getByTestId('cz-tab-diff')).toBeVisible();
  await expect(page.getByTestId('cz-diff-counters')).toContainText('+3');
  await expect(page.getByTestId('cz-diff-counters')).toContainText('−2');
  await page.getByTestId('cz-diff-split').click();
  await expect(page.getByTestId('cz-split-line').first()).toBeVisible();
  await expect(page.getByText('OLD', { exact: true }).first()).toBeVisible();
  await page.getByTestId('cz-diff-unified').click();
  await expect(page.getByTestId('cz-diff-line').first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/diff.png`, fullPage: true });

  const hunks = page.getByTestId('cz-hunk');
  await expect(hunks).toHaveCount(2);
  await hunks.first().getByTestId('cz-hunk-accept').click();
  await expect(hunks.first().getByTestId('cz-hunk-tag')).toHaveText('Đã chấp nhận');
  await expect(page.getByTestId('cz-diff-counters')).toContainText('+1');
  await expect(page.getByTestId('cz-diff-counters')).toContainText('−1');
  await hunks.first().getByTestId('cz-hunk-accept').click();
  await expect(hunks.first().getByTestId('cz-hunk-tag')).toHaveText('Chờ duyệt');
  await hunks.first().getByTestId('cz-hunk-reject').click();
  await expect(hunks.first().getByTestId('cz-hunk-tag')).toHaveText('Đã từ chối');
  await hunks.first().getByTestId('cz-hunk-reject').click();
  await expect(hunks.first().getByTestId('cz-hunk-tag')).toHaveText('Chờ duyệt');

  await page.getByTestId('cz-accept-all').click();
  await expect(page.getByTestId('cz-diff-counters')).toContainText('+0');
  await expect(page.getByTestId('cz-diff-counters')).toContainText('−0');
  await page.getByTestId('cz-revert-all').click();
  const confirm = page.getByRole('dialog').filter({ hasText: 'Hoàn tác tất cả hunk đã chấp nhận trong worktree?' });
  await expect(confirm).toContainText('Chỉ ảnh hưởng worktree của agent, không đụng nhánh hiện tại.');
  await expect(confirm.getByRole('button', { name: 'Hoàn tác' })).toBeVisible();
  await expect(confirm.getByRole('button', { name: 'Hủy' })).toBeVisible();
  await confirm.getByRole('button', { name: 'Hoàn tác' }).click();
  await expect(page.getByText('Hoàn tác tất cả hunk đã chấp nhận trong worktree?')).toHaveCount(0);
  await expect(page.getByTestId('cz-diff-counters')).toContainText('+0');
  await expect(page.getByTestId('cz-diff-counters')).toContainText('−0');

  // (6) chat composer mirrors into both perspectives and the host callback
  await page.getByTestId('coding-zone-composer').fill('Đã kiểm tra xong hunk đầu tiên.');
  await page.getByTestId('coding-zone-send').click();
  await expect(page.getByTestId('coding-zone-transcript')).toContainText('Đã kiểm tra xong hunk đầu tiên.');
  await page.getByTestId('cz-perspective-chat').click();
  await expect(page.getByText('Chuyển về Coding zone để xem tab, cây worktree và review hunk.')).toBeVisible();
  await expect(page.locator('.cz-active-file-value').first()).toHaveText('src/planner/planHours.ts');
  await expect(page.getByTestId('coding-zone-transcript')).toContainText('Đã kiểm tra xong hunk đầu tiên.');
  await expect(page.getByTestId('coding-zone-transcript')).toHaveCount(1);
  const sent = await page.evaluate(() => (window as unknown as { __codingZoneFixtureSent?: string[] }).__codingZoneFixtureSent ?? []);
  expect(sent).toEqual(['Đã kiểm tra xong hunk đầu tiên.']);

  // (7) theme toggle swaps palette without shifting the grid
  const lightBg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  const beforeBox = await page.getByTestId('cz-modal-body').boundingBox();
  await page.getByTestId('cz-theme-toggle').click();
  const darkBg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  expect(darkBg).not.toEqual(lightBg);
  const afterBox = await page.getByTestId('cz-modal-body').boundingBox();
  expect(afterBox?.width).toEqual(beforeBox?.width);
  expect(afterBox?.height).toEqual(beforeBox?.height);
  await page.screenshot({ path: `${SHOTS}/dark-theme.png`, fullPage: true });

  // No draft/sample copy, no unconditional sync chip
  await expect(page.getByText('DỮ LIỆU MẪU')).toHaveCount(0);
  await expect(page.getByText('mô phỏng')).toHaveCount(0);
  await expect(page.getByTestId('coding-zone-connection')).toHaveText('Đồng bộ');
  await expectNoErrors(errors);
});

test('Coding Zone popout: real secondary window and cross-window hunk/chat sync', async ({ page, context }) => {
  const mainErrors = watchErrors(page);
  await openWorkbench(page);
  await page.getByTestId('coding-zone-tree-row').filter({ hasText: 'planHours.ts' }).click();
  await expect(page.getByTestId('cz-tab-diff')).toBeVisible();

  const [popout] = await Promise.all([
    context.waitForEvent('page'),
    page.getByTestId('cz-popout-button').click(),
  ]);
  const popoutErrors = watchErrors(popout);
  await popout.waitForLoadState('domcontentloaded');
  await expect(popout.getByRole('dialog', { name: 'Coding Zone — Popout' })).toBeVisible();
  await expect(popout).toHaveURL(/#\/coding-zone-popout$/);
  const popoutColumns = await popout.getByTestId('cz-modal-body').evaluate((node) => getComputedStyle(node).gridTemplateColumns);
  expect(popoutColumns.replace(/\s+/g, ' ').trim()).toMatch(/^210px\s+\d+(\.\d+)?px\s+230px$/);
  await expect(popout.getByTestId('coding-zone-tree')).toBeVisible();
  await expect(popout.getByTestId('cz-tab-diff')).toBeVisible();
  await expect(popout.getByTestId('coding-zone-chat-strip')).toBeVisible();

  // Initial full-state handoff reaches the secondary window (wait for diff metadata).
  await expect(popout.getByTestId('cz-diff-counters')).toContainText('+3');
  await expect(popout.getByTestId('cz-diff-counters')).toContainText('−2');
  await popout.screenshot({ path: `${SHOTS}/popout.png`, fullPage: true });

  // Hunk decision in the main modal appears in the popout.
  await page.getByTestId('cz-hunk').first().getByTestId('cz-hunk-accept').click();
  await expect(page.getByTestId('cz-hunk').first().getByTestId('cz-hunk-tag')).toHaveText('Đã chấp nhận');
  await expect(popout.getByTestId('cz-hunk').first().getByTestId('cz-hunk-tag')).toHaveText('Đã chấp nhận');

  // Composer message in the main modal mirrors into the popout transcript.
  await page.getByTestId('coding-zone-composer').fill('Quyết định đã được đồng bộ sang popout.');
  await page.getByTestId('coding-zone-composer').press('Enter');
  await expect(popout.getByTestId('coding-zone-transcript')).toContainText('Quyết định đã được đồng bộ sang popout.');

  await expect(page.getByText('DỮ LIỆU MẪU')).toHaveCount(0);
  await expect(popout.getByText('DỮ LIỆU MẪU')).toHaveCount(0);
  await expectNoErrors(mainErrors);
  await expectNoErrors(popoutErrors);
  await popout.close();
});
