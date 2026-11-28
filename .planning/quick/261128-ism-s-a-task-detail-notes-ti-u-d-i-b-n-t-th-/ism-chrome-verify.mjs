import { chromium } from '@playwright/test';

const TITLE = 'Tiêu đề ghi chú dài để kiểm tra khả năng hiển thị trọn vẹn trên cột hẹp Tiêu đề ghi chú dài để kiểm tra khả năng hiển th';
const ARTIFACTS = new URL('./', import.meta.url);
const BASE = 'http://127.0.0.1:5173/task-management/';
const IDS = {
  system: '11111111-1111-4111-8111-111111111111',
  cr: '22222222-2222-4222-8222-222222222222',
  task: '33333333-3333-4333-8333-333333333333',
  note: '44444444-4444-4444-8444-444444444444',
};

function overlaps(a, b) {
  return !(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (err) => errors.push(err.message));
page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  const text = msg.text();
  if (text.includes('Warning:') || text.includes('%s')) return; // pre-existing AntD deprecations, outside this diff
  errors.push(`console: ${text}`);
});
await page.addInitScript((mode) => window.localStorage.setItem('taskmate_theme', mode), 'light');
await page.goto(BASE);
await page.locator('.taskmate-workbench-theme').first().waitFor({ state: 'visible' });
await page.waitForTimeout(2500);
await page.reload();
await page.locator('.taskmate-workbench-theme').first().waitFor({ state: 'visible' });
await page.waitForTimeout(2000);

await page.evaluate(({ ids, title }) => new Promise((resolve, reject) => {
  const open = indexedDB.open('PersonalTaskPlannerDB', 310);
  open.onsuccess = () => {
    const db = open.result;
    const now = new Date().toISOString();
    const tx = db.transaction(['systems', 'changeRequests', 'tasks', 'notes'], 'readwrite');
    tx.objectStore('systems').put({
      id: ids.system, name: 'Payment Service', code: 'PAYMENT_SVC', parentId: null, type: 'SERVICE', createdAt: now, updatedAt: now,
    });
    tx.objectStore('changeRequests').put({
      id: ids.cr, name: 'Thanh toán QR', code: 'CR-2026-ISM', type: 'NEW_FEATURE', status: 'In Progress',
      targets: [{ systemId: ids.system, featureBranch: 'feature/ism' }], createdAt: now, updatedAt: now,
    });
    tx.objectStore('tasks').put({
      id: ids.task, crId: ids.cr, systemId: ids.system, name: 'Tác vụ kiểm tra note dài',
      status: 'Open', progress: 0, priority: 'Medium', estimateMinutes: 60, createdAt: now, updatedAt: now,
    });
    tx.objectStore('notes').put({
      id: ids.note, type: 'quick_note', entityType: 'task', entityId: ids.task, title,
      body: 'Nội dung kiểm tra hiển thị', isPinned: false, createdAt: now, updatedAt: now,
    });
    tx.oncomplete = () => { db.close(); resolve(undefined); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  };
  open.onerror = () => reject(open.error);
}), { ids: IDS, title: TITLE });

// Dexie liveQuery observers do not see raw IDB writes; reload forces a fresh query.
await page.reload();
await page.locator('.taskmate-workbench-theme').first().waitFor({ state: 'visible' });
await page.waitForTimeout(1500);

await page.evaluate((id) => {
  window.dispatchEvent(new CustomEvent('taskmate:notification-deeplink', {
    detail: { route: `#/insight?type=task&id=${id}` },
  }));
}, IDS.task);
await page.waitForTimeout(1000);
await page.screenshot({ path: new URL('ism-debug-state.png', ARTIFACTS).pathname });
const debug = await page.evaluate(async () => {
  const open = indexedDB.open('PersonalTaskPlannerDB');
  const db = await new Promise((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
  const read = (store, key) => new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result ? { id: req.result.id, name: req.result.name } : null);
    req.onerror = () => reject(req.error);
  });
  return {
    hash: location.hash,
    version: db.version,
    stores: Array.from(db.objectStoreNames).slice(0, 12),
    seeded: await Promise.all([
      read('systems', '11111111-1111-4111-8111-111111111111'),
      read('changeRequests', '22222222-2222-4222-8222-222222222222'),
      read('tasks', '33333333-3333-4333-8333-333333333333'),
      read('notes', '44444444-4444-4444-8444-444444444444'),
    ]),
    tabText: document.body.innerText.slice(0, 2500),
  };
});
console.log(JSON.stringify(debug));
await page.getByTestId('insight-note-title').waitFor({ state: 'visible', timeout: 15000 });

const results = [];
for (const mode of ['light', 'dark']) {
  const current = await page.locator('.taskmate-workbench-theme').first().getAttribute('data-theme');
  if (current !== mode) {
    await page.getByRole('button', { name: 'Chuyển đổi giao diện sáng/tối' }).click();
    await page.waitForTimeout(100);
  }
  const after = await page.locator('.taskmate-workbench-theme').first().getAttribute('data-theme');
  if (after !== mode) throw new Error(`theme expected ${mode}, got ${after}`);
  for (const width of [1280, 768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    const note = page.getByTestId('insight-note-title');
    await note.waitFor({ state: 'visible' });
    const card = page.locator('.ant-card').filter({ has: page.getByText(/Ghi chú liên quan \(1\)/) }).first();
    const geometry = await page.evaluate(({ title }) => {
      const el = document.querySelector('[data-testid="insight-note-title"]');
      const cardEl = el.closest('.ant-card');
      const head = cardEl.querySelector('.ant-card-head').getBoundingClientRect();
      const headTitle = cardEl.querySelector('.ant-card-head-title').getBoundingClientRect();
      const extra = cardEl.querySelector('.ant-card-extra').getBoundingClientRect();
      const body = cardEl.querySelector('.ant-card-body').getBoundingClientRect();
      const noteRect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const rect = (r) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height });
      return {
        text: el.textContent,
        expected: title,
        style: { overflowWrap: style.overflowWrap, whiteSpace: style.whiteSpace, textOverflow: style.textOverflow, minWidth: style.minWidth },
        clipped: el.scrollWidth > el.clientWidth + 1,
        headTitleOverflows: cardEl.querySelector('.ant-card-head-title').scrollWidth > cardEl.querySelector('.ant-card-head-title').clientWidth + 1,
        lineHeight: parseFloat(style.lineHeight),
        rects: { head: rect(head), headTitle: rect(headTitle), extra: rect(extra), body: rect(body), note: rect(noteRect) },
      };
    }, { title: TITLE });
    const headButton = card.getByRole('button', { name: /thêm ghi chú/i });
    await headButton.click();
    const editorOpen = await page.getByRole('dialog').isVisible();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const headOverlap = overlaps(geometry.rects.headTitle, geometry.rects.extra);
    const noteOutside = geometry.rects.note.right > geometry.rects.body.right + 1 || geometry.rects.note.left < geometry.rects.body.left - 1;
    const pass = geometry.text === geometry.expected && !geometry.clipped && !geometry.headTitleOverflows
      && geometry.style.overflowWrap === 'anywhere' && geometry.style.whiteSpace === 'normal'
      && geometry.rects.note.height > geometry.lineHeight + 1
      && !headOverlap && !noteOutside && editorOpen;
    results.push({ mode, width, pass, headOverlap, noteOutside, clipped: geometry.clipped, headTitleOverflows: geometry.headTitleOverflows, editorOpen, lines: Math.round(geometry.rects.note.height / geometry.lineHeight), titleRight: Math.round(geometry.rects.headTitle.right), buttonLeft: Math.round(geometry.rects.extra.left) });
    if (width === 375 && mode === 'light') await page.screenshot({ path: new URL(`ism-note-375-light.png`, ARTIFACTS).pathname });
    if (width === 375 && mode === 'dark') await page.screenshot({ path: new URL(`ism-note-375-dark.png`, ARTIFACTS).pathname });
  }
}
console.log(JSON.stringify({ results, errors }, null, 2));
await browser.close();
if (results.some((r) => !r.pass) || errors.length) process.exitCode = 1;
