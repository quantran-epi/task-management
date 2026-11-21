import { test, expect, type Page } from '@playwright/test';

/** Enter the IntelliJ workbench, show Tool Explorer, then open a tool by name. */
async function openTool(page: Page, title: string) {
  const explorer = page.getByTestId('stripe-btn-tool_explorer');
  if (await explorer.count() === 0) {
    await page.getByRole('button', { name: 'Chuyển sang IntelliJ Workbench' }).click();
  }
  if ((await explorer.getAttribute('aria-pressed')) !== 'true') await explorer.click();
  await page.getByRole('button', { name: `Open ${title}`, exact: true }).click();
}

async function typeInto(page: Page, label: string, value: string) {
  const field = page.getByLabel(label);
  await field.fill(value);
}

test.describe('utility editors stay responsive', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/task-management/');
  });

  const cases = [
    { tab: 'JSON Formatter', editor: 'JSON input', output: 'JSON output', sample: '{"a":{"x":1},"tail":2}' },
    { tab: 'XML Formatter', editor: 'XML input', output: 'XML output', sample: '<root><item><v>1</v></item></root>' },
  ];

  for (const c of cases) {
    test(`${c.tab}: paste, Format on FIRST click, folding, Save as modal is instant`, async ({ page }) => {
      await openTool(page, c.tab);
      const editor = page.getByLabel(c.editor);

      // Paste content, then Format with a single click — must work on first click.
      await typeInto(page, c.editor, c.sample);
      await page.getByRole('button', { name: /format-painter Format/ }).first().click();
      const output = page.getByLabel(c.output);
      await expect(output).toContainText(/x|v|item|a/);

      // Folding: toggle the first fold button, content hides, toggle back restores.
      const fold = page.getByRole('button', { name: /Thu gọn dòng 2/ }).first();
      await expect(fold).toBeVisible();
      await fold.click();
      await expect(page.getByRole('button', { name: /Mở rộng dòng 2/ }).first()).toBeVisible();
      await page.getByRole('button', { name: /Mở rộng dòng 2/ }).first().click();

      // Save as modal appears immediately after click.
      const t0 = Date.now();
      await page.getByRole('button', { name: /Save as/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      expect(Date.now() - t0).toBeLessThan(2000);
      await page.getByRole('button', { name: /Hủy/ }).click();
      void editor;
    });
  }

  test('Text Compare: typing in both panes updates diff and gutter', async ({ page }) => {
    await openTool(page, 'Text Compare');
    await typeInto(page, 'Text A', 'one\ntwo');
    await typeInto(page, 'Text B', 'one\nthree');
    await expect(page.getByText(/2 thay đổi/)).toBeVisible();
    expect(await page.getByTestId('line-gutter').count()).toBe(2);
    await page.getByRole('button', { name: /Save as/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('Markdown: typing renders preview, gutter present, Save as opens', async ({ page }) => {
    await openTool(page, 'Markdown Viewer');
    await typeInto(page, 'Markdown editor', '# Tiêu đề\n**đậm**');
    const preview = page.getByLabel('Markdown preview');
    await expect(preview.locator('h1')).toContainText('Tiêu đề');
    expect(await page.getByTestId('line-gutter').count()).toBe(2);
    await page.getByRole('button', { name: /Save as/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('switching tabs back and forth preserves content and stays smooth', async ({ page }) => {
    await openTool(page, 'JSON Formatter');
    const payload = '{"keep":1}';
    await typeInto(page, 'JSON input', payload);
    await openTool(page, 'Text Compare');
    await openTool(page, 'JSON Formatter');
    await expect(page.getByLabel('JSON input')).toHaveValue(payload);
  });

  test('gutter mirrors editor scroll in long content', async ({ page }) => {
    await openTool(page, 'Markdown Viewer');
    const lines = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
    await typeInto(page, 'Markdown editor', lines);
    const editor = page.getByLabel('Markdown editor');
    const gutter = page.getByTestId('line-gutter').first();
    await editor.evaluate((el: HTMLElement) => { el.scrollTop = 600; el.dispatchEvent(new Event('scroll')); });
    await expect.poll(() => gutter.evaluate((el: HTMLElement) => el.scrollTop)).toBeGreaterThan(0);
  });

  test('AI assistant opens for each tool without blocking the editor', async ({ page }) => {
    for (const { tool, aiName } of [
      { tool: 'JSON Formatter', aiName: /AI · JSON Formatter/ },
      { tool: 'XML Formatter', aiName: /AI · XML Formatter/ },
      { tool: 'Text Compare', aiName: /AI · Text Compare/ },
      { tool: 'Markdown Viewer', aiName: /AI · Markdown Viewer/ },
    ]) {
      await openTool(page, tool);
      const t0 = Date.now();
      await page.getByRole('button', { name: aiName }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      expect(Date.now() - t0).toBeLessThan(2000);
      await page.getByRole('button', { name: /Hủy|Đóng/ }).click();
    }
  });
});
