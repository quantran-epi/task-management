import { test, expect, type Page } from '@playwright/test';

/** Open a tool from Tool Explorer, switching to the workbench first if needed. */
async function openTool(page: Page, title: string) {
  const explorer = page.getByTestId('stripe-btn-tool_explorer');
  if ((await explorer.count()) === 0) {
    await page.getByRole('button', { name: 'Chuyển sang IntelliJ Workbench' }).click();
  }
  if ((await explorer.getAttribute('aria-pressed')) !== 'true') await explorer.click();
  await page.getByRole('button', { name: `Open ${title}`, exact: true }).click();
}

type Case = {
  title: string;
  inputLabel: RegExp;
  input: string;
  output: string;
  run: RegExp;
  expected: string;
  extra?: (page: Page) => Promise<void>;
};

const cases: Case[] = [
  { title: 'Encoder/Decoder', inputLabel: /Encoder input/, input: 'Xin chào', output: 'Encoder output', run: /Chạy/, expected: 'WGluIGNow6Bv' },
  {
    title: 'Regex Tester', inputLabel: /Regex test input/, input: 'abc123', output: 'Regex matches', run: /Chạy/, expected: 'abc',
    extra: async (page) => { await page.getByLabel('Pattern').fill('[a-z]+'); },
  },
  { title: 'Timestamp Converter', inputLabel: /Timestamp input/, input: '1700000000000', output: 'Timestamp output', run: /Chạy/, expected: '2023' },
  { title: 'Date Calculation', inputLabel: /Date input/, input: '2024-01-10', output: 'Date result', run: /Chạy/, expected: '2024-01-11' },
  {
    title: 'Text Utilities', inputLabel: /Text utilities input/, input: 'hello world-foo', output: 'Text utilities output', run: /Chạy/, expected: 'helloWorldFoo',
    extra: async (page) => { await page.getByLabel('Phép biến đổi').selectOption('camel'); },
  },
  { title: 'Cron Expression', inputLabel: /Cron expression/, input: '*/15 9 * * 1-5', output: 'Cron runs', run: /5 lần chạy tiếp/, expected: 'T' },
  { title: 'Hash & UUID', inputLabel: /Hash input/, input: 'hello', output: 'Hash output', run: /^Hash$/, expected: '2cf24d' },
  { title: 'JWT Decoder', inputLabel: /JWT token/, input: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sig', output: 'JWT decoded', run: /Chạy/, expected: '123' },
];

test.describe('8 newly-added tool explorer tools — behavior audit', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/task-management/');
  });

  for (const c of cases) {
    test(`${c.title}: explicit Run button and correct output`, async ({ page }) => {
      await openTool(page, c.title);
      await page.getByLabel(c.inputLabel).fill(c.input);
      if (c.extra) await c.extra(page);
      // No auto-run: output must stay empty before clicking Run.
      const output = page.getByLabel(c.output);
      await expect(output).toHaveText('');
      await page.getByRole('button', { name: c.run }).first().click();
      await expect(output).toContainText(c.expected);
    });
  }
});
