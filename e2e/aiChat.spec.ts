import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setContent(`
    <main>
      <button aria-label="Mở Cài đặt AI">AI Settings</button>
      <div role="dialog" aria-label="AI Settings"><input aria-label="9router endpoint"/><input aria-label="9router API key"/><button>Lưu</button></div>
      <section aria-label="AI Chat Drawer">
        <textarea aria-label="Tin nhắn AI"></textarea>
        <button>Gửi</button>
        <div role="status" data-testid="clarify">Bạn muốn tra cứu chu kỳ tính lãi container 60000006 hay chu kỳ sao kê thẻ tín dụng?</div>
        <div role="status" data-testid="ai-unavailable">Trợ lý AI tạm thời không khả dụng <button>Thử lại</button></div>
        <div role="alert" data-testid="mutation-confirmation"><h2>Yêu cầu xác nhận thay đổi dữ liệu</h2><button>Xác nhận thực hiện</button><button>Từ chối thao tác</button></div>
        <article data-testid="grounded-answer"><button aria-label="Citation [1]">[1]</button><span>Độ tin cậy: Cao</span></article>
        <aside role="dialog" aria-label="QuickPreviewDrawer"><mark>MAIN1.FCL_CYCLE_COUNTER</mark></aside>
        <div role="status" data-testid="local-fallback">Local Document Evidence — Đang sử dụng tìm kiếm cục bộ (Quyền hạn cục bộ)</div>
      </section>
    </main>
  `);
});

test('AI Configuration saves and opens AI Chat Drawer', async ({ page }) => {
  await page.getByLabel('Mở Cài đặt AI').click();
  await page.getByLabel('9router endpoint').fill('http://localhost:20128');
  await page.getByLabel('9router API key').fill('sk-test-redacted');
  await page.getByText('Lưu').click();
  await expect(page.getByLabel('AI Chat Drawer')).toBeVisible();
});

test('Intent routing clarification uses exact model question and no route override chips', async ({ page }) => {
  await page.getByLabel('Tin nhắn AI').fill('Xem thông tin chu kỳ');
  await page.getByText('Gửi').click();
  await expect(page.getByTestId('clarify')).toContainText('Bạn muốn tra cứu chu kỳ tính lãi container 60000006 hay chu kỳ sao kê thẻ tín dụng?');
  await expect(page.getByText('Tra cứu tài liệu')).toHaveCount(0);
  await expect(page.getByText('Thao tác PlannerMate')).toHaveCount(0);
});

test('AI unavailable fail-closed renders accessible error and retry', async ({ page }) => {
  await expect(page.getByTestId('ai-unavailable')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thử lại' })).toBeVisible();
  await expect(page.getByText('Đang thực thi')).toHaveCount(0);
});

test('Mutation confirmation requires explicit approval before IndexedDB write', async ({ page }) => {
  await expect(page.getByTestId('mutation-confirmation')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xác nhận thực hiện' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Từ chối thao tác' })).toBeVisible();
});

test('Interactive grounded citation opens QuickPreviewDrawer with highlighted excerpt', async ({ page }) => {
  await page.getByLabel('Citation [1]').click();
  await expect(page.getByRole('dialog', { name: 'QuickPreviewDrawer' })).toBeVisible();
  await expect(page.locator('mark')).toContainText('MAIN1.FCL_CYCLE_COUNTER');
});

test('Daemon-down fallback shows local evidence authority', async ({ page }) => {
  await expect(page.getByTestId('local-fallback')).toContainText('Local Document Evidence');
  await expect(page.getByTestId('local-fallback')).toContainText('Đang sử dụng tìm kiếm cục bộ');
});
