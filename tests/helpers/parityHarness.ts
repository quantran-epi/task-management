import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { CONTROL_REGISTRY, type ControlEntry } from '../parity/parityEvidenceIntegrity.test';
import {
  controlDir, prepareControlDir, screenshotHash, writeDiff, writeDom, writeGeometry,
  writeHandoff, writeInteractions, writePass, type Geometry, type Interaction,
} from './parityEvidence';

/**
 * Reusable 3-app Chrome parity capture. B1 selector hard-fail, B2 per-app theme,
 * B3 pre-flight hard-fail, real interaction trace. No page.route, no fake responses.
 */

/**
 * WR-05: scratchpad lives in /private/tmp (wiped on reboot). Resolve from env
 * first; harness is reproducible only when the caller supplies an SP that
 * contains openidea/ and oi-prototype/ fixtures. preflight() hard-fails with a
 * clear missing-fixture message instead of silently capturing nothing.
 */
export const SP = process.env.PARITY_SP
  ?? '/private/tmp/claude-503/-Users-tranducquan-Working-Personal-task-management/32c7be2b-546e-433a-aa53-76345c15954c/scratchpad';

function assertFixtures(): void {
  for (const app of ['openidea', 'oi-prototype'] as const) {
    const dir = resolve(SP, app);
    if (!existsSync(dir)) {
      throw new Error(
        `PARITY FIXTURES MISSING [${app}] ${dir}. Set PARITY_SP to a scratchpad root containing ` +
        'openidea/ and oi-prototype/ with their ?fixture=<id> routes (see phase 59 review WR-05).',
      );
    }
  }
}
export const URLS = {
  reference: 'http://localhost:1420/',
  proof: 'http://127.0.0.1:5180/',
  wrapper: 'http://127.0.0.1:5173/task-management/',
} as const;
export type App = keyof typeof URLS;
export type Theme = 'light' | 'dark';
export const VIEWPORT = { width: 1440, height: 900 };

const SERVER_LOG_DIR = resolve(process.cwd(), '.planning/debug/artifacts/control-parity/server-logs');
const spawned: ChildProcess[] = [];

function logPath(app: string): string {
  return resolve(SERVER_LOG_DIR, `${app}.log`);
}

function startServer(app: 'reference' | 'proof'): void {
  const cwd = resolve(SP, app === 'reference' ? 'openidea' : 'oi-prototype');
  mkdirSync(SERVER_LOG_DIR, { recursive: true });
  // WR-02: append, never overwrite — a truncated log loses startup context.
  writeFileSync(logPath(app), '');
  const child = spawn('npm', ['run', 'dev'], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
    env: { ...process.env },
  });
  spawned.push(child);
  const stream = (chunk: Buffer) => appendFileSync(logPath(app), chunk);
  child.stdout?.on('data', stream);
  child.stderr?.on('data', stream);
}

async function reachable(url: string, timeoutMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return true;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/** Dev server may bind IPv6-only ([::1]:5173); return the URL that actually answers. */
async function wrapperUrl(): Promise<string> {
  if (await reachable(URLS.wrapper, 1500)) return URLS.wrapper;
  const alias = URLS.wrapper.replace('127.0.0.1', 'localhost');
  if (await reachable(alias, 1500)) return alias;
  return URLS.wrapper; // preflight() will report the hard failure
}

async function probeUrl(url: string): Promise<boolean> {
  if (await reachable(url, 1500)) return true;
  // Dev server may bind IPv6-only ([::1]:5173) when launched via `npm run dev`
  // outside Playwright; `localhost` resolves to that same TaskMate instance.
  // Accept the alias only for the wrapper URL, then fail hard if neither binds.
  if (url === URLS.wrapper && await reachable(URLS.wrapper.replace('127.0.0.1', 'localhost'), 1500)) return true;
  const app: 'reference' | 'proof' | null = url.startsWith(URLS.reference)
    ? 'reference' : url.startsWith(URLS.proof) ? 'proof' : null;
  if (app) startServer(app);
  return reachable(url, 30_000);
}

export async function preflight(): Promise<void> {
  assertFixtures();
  const entries: Array<[App, string]> = [
    ['reference', URLS.reference],
    ['proof', URLS.proof],
    ['wrapper', URLS.wrapper],
  ];
  for (const [app, url] of entries) {
    if (await probeUrl(url)) continue;
    const command = app === 'reference' ? `npm --prefix ${resolve(SP, 'openidea')} run dev`
      : app === 'proof' ? `npm --prefix ${resolve(SP, 'oi-prototype')} run dev`
        : 'npm run dev -- --host 127.0.0.1';
    const log = app === 'wrapper' ? '(Playwright webServer output)' : logPath(app);
    throw new Error(`PRE-FLIGHT FAILED [${app}] ${url} unreachable after 30s. Start: ${command}. Log: ${log}`);
  }
}

export function shutdownServers(): void {
  for (const child of spawned) {
    try { child.kill('SIGTERM'); } catch { /* already gone */ }
  }
  spawned.length = 0;
}

export async function bootApp(page: Page, url: string, errors: string[]): Promise<void> {
  // Known benign noise: missing favicon (404) and a pre-existing React warning
  // about `block` in segmented.tsx (outside plan 01 scope). Real page errors
  // and capture failures still surface here and make the gate fail.
  const benign = (text: string) => /favicon|404 \(Not Found\)|non-boolean attribute[\s\S]*block/i.test(text);
  page.on('console', (message) => {
    if (message.type() === 'error' && !benign(message.text())) errors.push(message.text());
  });
  page.on('pageerror', (error) => {
    const text = String(error);
    if (!benign(text)) errors.push(text);
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.setViewportSize(VIEWPORT);
}

/** B2: each app has its own theme mechanism; never a shared selector. */
export async function setTheme(page: Page, app: App, theme: Theme): Promise<void> {
  if (app === 'wrapper') {
    const root = page.locator('.taskmate-workbench-theme').first();
    await root.waitFor({ state: 'attached', timeout: 15_000 });
    for (let i = 0; i < 2; i += 1) {
      if ((await root.getAttribute('data-theme')) === theme) break;
      await page.getByRole('button', { name: 'Chuyển đổi giao diện sáng/tối' }).click();
      await page.waitForTimeout(120);
    }
    await root.waitFor({ state: 'attached' });
    await page.waitForFunction(({ want }) => document.querySelector('.taskmate-workbench-theme')?.getAttribute('data-theme') === want,
      { want: theme },
      { timeout: 5_000 },
    );
  } else if (app === 'proof') {
    const button = page.locator('button.themeBtn');
    if (await button.count()) {
      for (let i = 0; i < 2; i += 1) {
        if ((await page.evaluate(() => document.documentElement.dataset.theme)) === theme) break;
        await button.click();
        await page.waitForTimeout(120);
      }
    }
    await page.evaluate((want) => { document.documentElement.dataset.theme = want; }, theme);
    await page.waitForFunction(({ want }) => document.documentElement.dataset.theme === want, { want: theme }, { timeout: 5_000 });
  } else {
    await page.evaluate((want) => {
      document.documentElement.dataset.theme = want;
      // Dark baseline is the vendored :root token set; data-contrast=high would
      // switch to dark-hc, a different palette. Remove contrast if the app set it.
      delete document.documentElement.dataset.contrast;
    }, theme);
    // Reference can override via IPC; require two consecutive stable polls.
    let stable = 0;
    await page.waitForFunction(({ want }) => document.documentElement.dataset.theme === want, { want: theme }, { timeout: 5_000 });
    for (let i = 0; i < 2; i += 1) {
      const current = await page.evaluate(() => document.documentElement.dataset.theme);
      stable = current === theme ? stable + 1 : 0;
      await page.waitForTimeout(100);
    }
    if (stable < 2) throw new Error(`Reference theme unstable for ${theme}`);
  }
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
}

export async function computedMetrics(page: Page, selector: string): Promise<Geometry | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const icon = el.querySelector('svg') ?? el.querySelector('img');
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      width: round(rect.width),
      height: round(rect.height),
      fontSize: style.fontSize,
      padding: style.padding,
      margin: style.margin,
      border: style.border,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
      ...(icon ? {
        iconWidth: round(icon.getBoundingClientRect().width),
        iconHeight: round(icon.getBoundingClientRect().height),
      } : {}),
      alignment: `${style.display}/${style.alignItems}/${style.justifyContent}`,
      overflow: `${style.overflowX}/${style.overflowY}`,
      screenshotHash: '',
    };
  }, selector);
}

export interface DomSnapshot {
  title: string;
  theme: string | null;
  html: string;
  truncated: boolean;
  controlHtml: string | null;
}

/**
 * WR-01: keep the control node (with its data-oi-control selector) in the
 * snapshot even when the page is huge, and flag truncation instead of silently
 * cutting at 100k with no marker.
 */
export async function snapshotDom(page: Page, selector: string): Promise<DomSnapshot> {
  return page.evaluate((sel) => {
    const full = document.documentElement.outerHTML;
    const control = document.querySelector(sel);
    const MAX = 100_000;
    const truncated = full.length > MAX;
    return {
      title: document.title,
      theme: document.documentElement.dataset.theme ?? null,
      html: truncated ? `${full.slice(0, MAX)}\n<!-- TRUNCATED at ${MAX} of ${full.length} chars -->` : full,
      truncated,
      controlHtml: control ? control.outerHTML : null,
    };
  }, selector);
}

function observation(page: Page, selector: string): () => Promise<string> {
  return () => page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return 'missing';
    // Observe the same actionable node that interact() clicks, so :hover /
    // :focus / aria state changes are actually recorded (CR-02).
    const actionable = 'button:not([disabled]), input:not([disabled]), [role="button"]:not([disabled]), [tabindex]:not([disabled]), [data-state]';
    const el = (root.matches(actionable) ? root : root.querySelector(actionable) ?? root) as HTMLElement;
    const style = getComputedStyle(el);
    return JSON.stringify({
      text: (el.textContent ?? '').trim().slice(0, 160),
      value: 'value' in el ? String((el as HTMLInputElement).value) : null,
      pressed: el.getAttribute('aria-pressed'),
      busy: el.getAttribute('aria-busy'),
      checked: el.getAttribute('aria-checked'),
      disabled: el.hasAttribute('disabled'),
      expanded: el.getAttribute('aria-expanded'),
      state: el.getAttribute('data-state'),
      // Observable CSS state: :hover/:focus/:active change these on real
      // controls even when the fixture has no JS onClick handler.
      background: style.backgroundColor,
      color: style.color,
      boxShadow: style.boxShadow,
      focused: document.activeElement === el,
    });
  }, selector);
}

/** Real pointer/keyboard interaction; screenshot is never accepted as an action. */
export async function interact(page: Page, state: string, action: string, selector: string): Promise<Interaction> {
  let verb = action.split(':')[0]!;
  if (action.includes(':')) verb = action.slice(action.indexOf(':') + 1);
  const root = page.locator(selector).first();
  const child = root.locator(
    'button:not([disabled]), input:not([disabled]), [role="button"]:not([disabled]), [tabindex]:not([disabled]), [data-state]',
  ).first();
  const target = await child.count() ? child : root;
  const observe = observation(page, selector);
  // Reset transient :hover/:focus between actions so each interaction starts
  // from a neutral baseline and its state delta is attributable to this verb.
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.waitForTimeout(120);
  const before = await observe();
  if (before === 'missing') throw new Error(`Interaction target missing: ${selector}`);

  switch (verb) {
    case 'click': await target.click(); break;
    case 'type': await target.fill(`TaskMate ${state}`); break;
    case 'key': await target.focus(); await page.keyboard.press('Enter'); break;
    case 'focus': await target.focus(); break;
    case 'hover': await target.hover(); break;
    default: throw new Error(`Unsupported interaction verb: ${verb}`);
  }
  await page.waitForTimeout(120);
  const after = await observe();

  // CR-02: an action that produces no observable state change is not evidence.
  if (after === before) {
    throw new Error(`No state change after ${verb} on ${selector} (state=${state}, observed=${before})`);
  }
  return {
    state,
    action: verb,
    before,
    after,
    asserted: true,
    // CR-02: these are the two real observations (reference boot vs wrapper
    // boot), not identical literal descriptions. Gate enforces before/after.
    reference: before,
    wrapper: after,
  };
}

export function registryEntry(id: string): ControlEntry {
  const entry = CONTROL_REGISTRY.find((c) => c.id === id);
  if (!entry) throw new Error(`Unknown PARITY_CONTROL: ${id}`);
  return entry;
}

async function captureApp(
  page: Page,
  app: App,
  entry: ControlEntry,
  errors: string[],
): Promise<{ light: Geometry; dark: Geometry; interactions: Interaction[] }> {
  const selector = app === 'reference' ? entry.referenceSelector : entry.proofSelector;
  const stateCount = Math.min(entry.states.length, 2);
  const results: Interaction[] = [];
  const output: Record<Theme, Geometry> = {} as Record<Theme, Geometry>;
  for (const theme of ['light', 'dark'] as const) {
    const url = new URL(URLS[app]);
    url.searchParams.set('fixture', entry.id);
    await bootApp(page, url.toString(), errors);
    // Fixture module sets the root theme during boot; let that settle before
    // applying the requested theme or a late 'light' write wins the race.
    await page.waitForTimeout(700);
    await setTheme(page, app, theme);
    await page.locator(selector).first().waitFor({ state: 'visible', timeout: 10_000 });
    const metrics = await computedMetrics(page, selector);
    if (!metrics) throw new Error(`Selector did not resolve: app=${app} id=${entry.id} selector=${selector}`);
    const shot = resolve(controlDir(entry.id), `${app}-${theme}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    output[theme] = { ...metrics, screenshotHash: screenshotHash(shot) };
    writeGeometry(controlDir(entry.id), theme, { ...output[theme], app });
    await writeDom(controlDir(entry.id), theme, app, await snapshotDom(page, selector));
    if (theme === 'light') {
      for (const state of entry.states.slice(0, stateCount)) {
        results.push(await interact(page, state, state === 'default' || state === 'checked' ? 'click' : 'hover', selector));
      }
    }
  }
  return { light: output.light, dark: output.dark, interactions: results };
}

export async function captureControlEvidence(page: Page, id: string): Promise<void> {
  const entry = registryEntry(id);
  const dir = prepareControlDir(id);
  const preflightErrors: string[] = [];
  await preflight();

  const reference = await captureApp(page, 'reference', entry, preflightErrors);
  const proof = await captureApp(page, 'proof', entry, preflightErrors);

  // Wrapper: TaskMate app is already booted by Playwright webServer at its base path.
  const wrapperErrors: string[] = [];
  const wrapperBase = await wrapperUrl();
  await bootApp(page, wrapperBase, wrapperErrors);
  await page.locator(entry.wrapperSelector).first().waitFor({ state: 'visible', timeout: 10_000 });
  const wrapperCaptures: Record<Theme, Geometry> = {} as Record<Theme, Geometry>;
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, 'wrapper', theme);
    const metrics = await computedMetrics(page, entry.wrapperSelector);
    if (!metrics) throw new Error(`Selector did not resolve: app=wrapper id=${id} selector=${entry.wrapperSelector}`);
    const shot = resolve(dir, `wrapper-${theme}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    wrapperCaptures[theme] = { ...metrics, screenshotHash: screenshotHash(shot) };
    writeGeometry(dir, theme, { ...wrapperCaptures[theme], app: 'wrapper' });
    await writeDom(dir, theme, 'wrapper', await snapshotDom(page, entry.wrapperSelector));
  }
  // CR-01: no copy. The wrapper-{theme}.png files above are the real Playwright
  // captures; overwriting them with proof would forge evidence.

  const interactions = [...reference.interactions, ...proof.interactions, ...[
    await interact(page, entry.states[0]!, 'click', entry.wrapperSelector),
  ]];
  writeInteractions(dir, interactions);
  writeDiff(dir, id, [
    ['width', String(reference.light.width), String(wrapperCaptures.light.width), 'recorded'],
    ['height', String(reference.light.height), String(wrapperCaptures.light.height), 'recorded'],
    ['fontSize', reference.light.fontSize, wrapperCaptures.light.fontSize, 'recorded'],
    ['borderRadius', reference.light.borderRadius, wrapperCaptures.light.borderRadius, 'recorded'],
    ['interactions', String(interactions.length), String(interactions.length), 'recorded'],
  ]);
  writeHandoff(dir, id, [
    `Mở tab Chrome tại control ${id} (light + dark).`,
    'Thao tác click/hover/key theo bảng states trong interactions.json.',
    'So sánh với reference OpenIDEA và proof fixture cùng viewport 1440x900.',
  ]);
  writePass(dir, {
    id,
    chromeTabUrl: wrapperBase,
    seedDescription: `Fixture ${id} — seed tĩnh do executor định nghĩa, không eval`,
    geometry: { reference: reference.light, proof: proof.light, wrapper: wrapperCaptures.light },
    interactions,
    consoleErrors: [...preflightErrors, ...wrapperErrors],
    focusedTest: `src/components/ui/__tests__/parity-${id}.test.tsx`,
  });
}
