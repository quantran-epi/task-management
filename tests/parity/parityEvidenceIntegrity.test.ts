import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Phase 59 gate: evidence is a claim, not proof. This module owns the 56-control
 * registry and refuses to certify a control whose interaction trace is missing,
 * whose focused test only asserts static shape, or whose PASS.json claims a
 * human verdict. HGC-01: only the owner may set status:"pass" / humanVerdict:"pass".
 */

const ROOT = process.cwd();
const ARTIFACTS = resolve(ROOT, '.planning/debug/artifacts/control-parity');

export interface ControlEntry {
  id: string;
  wrapperSelector: string;
  referenceSelector: string;
  proofSelector: string;
  states: string[];
  fixture: string;
}

const wrap = (id: string) => `[data-oi-control="${id}"]`;

/** 56 controls from 59-PATTERNS.md §4. One row = one control = one human gate. */
const ROWS: Array<[string, string[], string]> = [
  ['button', ['default', 'hover', 'active', 'focus', 'disabled', 'loading', 'selected'], 'Button / Button.module.css'],
  ['input', ['hover', 'focus', 'disabled', 'invalid', 'placeholder', 'search', 'password'], 'Input / Input.module.css'],
  ['textarea', ['focus', 'disabled', 'invalid', 'typing'], 'Input.module.css .multiline'],
  ['checkbox', ['checked', 'indeterminate', 'disabled', 'focus'], 'Checkbox / Checkbox.module.css'],
  ['radio', ['checked', 'disabled', 'arrow'], 'Checkbox.module.css .radio'],
  ['switch', ['on', 'off', 'disabled', 'focus'], 'Checkbox.module.css .switch'],
  ['select', ['open', 'lead', 'selected', 'disabled', 'clear', 'empty', 'search'], 'Select / List / Select.module.css'],
  ['auto-complete', ['typing', 'filter', 'lead', 'selected', 'empty', 'escape'], 'Select.module.css'],
  ['mentions', ['trigger', 'arrow', 'enter', 'empty'], 'Input.module.css + Select.module.css'],
  ['date-picker', ['open', 'nav', 'lead', 'disabledDate', 'clear', 'range'], 'N-08 / Popup.module.css'],
  ['time-picker', ['open', 'arrow', 'enter', 'clear', 'range'], 'N-30 / Popup.module.css'],
  ['icon', ['decorative', 'aria', 'spin', 'rotate', 'click'], 'icons.tsx / N-13'],
  ['tag', ['tone', 'checkable', 'hover', 'close'], 'Chip / Chip.module.css'],
  ['breadcrumb', ['link', 'hover', 'focus', 'ellipsis'], 'Menu.module.css / N-04'],
  ['tabs', ['selected', 'hover', 'focus', 'disabled', 'closable', 'arrow'], 'Tabs / Tabs.module.css'],
  ['segmented', ['selected', 'hover', 'arrow', 'disabled'], 'Tabs.module.css / S-TAB'],
  ['menu', ['active', 'disabled', 'danger', 'submenu', 'escape'], 'Menu / Menu.module.css'],
  ['tooltip', ['placed', 'shortcut', 'hover-out', 'escape', 'delay'], 'Tooltip / Tooltip.module.css'],
  ['popover', ['hover', 'click', 'focus', 'open', 'close', 'outside'], 'Popup.module.css / N-19'],
  ['popconfirm', ['open', 'confirm', 'cancel', 'escape'], 'Dialog.module.css .popup'],
  ['modal', ['mask-false', 'footer-none', 'trap', 'escape'], 'Dialog.module.css / S-DLG'],
  ['drawer', ['silent', 'escape', 'trap', 'mask'], 'S-DLG panel'],
  ['dropdown', ['click', 'hover', 'arrow', 'enter', 'escape', 'outside'], 'Select.module.css + Menu.module.css'],
  ['pagination', ['page', 'prev-next', 'size', 'disabled'], 'Button.module.css / N-18'],
  ['upload', ['select', 'uploading', 'done', 'error', 'remove'], 'List.module.css / N-34'],
  ['list', ['empty', 'loading', 'selected', 'lead', 'extra', 'pagination'], 'List / List.module.css'],
  ['table', ['sort', 'filter', 'clear', 'select', 'sticky', 'empty'], 'List.module.css / N-29'],
  ['tree', ['collapsed', 'expanded', 'selected', 'checkable', 'arrow'], 'Tree / Tree.module.css'],
  ['tree-select', ['open', 'expand', 'lead', 'selected', 'clear'], 'Select.module.css + Tree.module.css'],
  ['progress', ['zero', 'partial', 'full', 'exception', 'status'], 'density.ts / N-20'],
  ['slider', ['hover', 'drag', 'arrow', 'disabled', 'range'], 'Splitter.module.css / N-23'],
  ['splitter', ['hover', 'dragging', 'keyboard'], 'Splitter.module.css / S-SPL'],
  ['form', ['required', 'invalid', 'submitting', 'preserve', 'rules'], 'S-FLD'],
  ['input-number', ['typing', 'arrow', 'min-max', 'precision'], 'Input.module.css / S-FLD'],
  ['collapse', ['collapsed', 'expanded', 'focus', 'disabled', 'nested'], 'Menu.module.css / N-06'],
  ['image', ['open', 'zoom', 'rotate', 'reset', 'arrow', 'escape'], 'Popup.module.css / N-14'],
  ['alert', ['status', 'closable', 'close'], 'Feedback.module.css / N-01'],
  ['message', ['kind', 'dismiss'], 'Feedback.module.css / N-16'],
  ['notification', ['open', 'pause', 'close', 'timeout'], 'Feedback.module.css / N-17'],
  ['result', ['status', 'extra'], 'List.module.css / N-21'],
  ['statistic', ['precision', 'prefix-suffix', 'loading'], 'tokens.css:293 / N-27'],
  ['status-dot', ['status', 'with-label', 'without-label'], 'D-12'],
  ['card', ['hover', 'clickable', 'loading', 'grid'], 'Dialog.module.css / N-05'],
  ['descriptions', ['bordered', 'column', 'empty'], 'DialogFieldset.module.css / N-09'],
  ['avatar', ['image', 'text', 'icon', 'group'], 'Chip.module.css / N-03'],
  ['divider', ['horizontal', 'vertical', 'text', 'dashed'], 'Splitter.module.css / N-10'],
  ['grid', ['span', 'offset', 'responsive', 'nested'], 'tokens.css:19-24 / N-12'],
  ['layout', ['header', 'footer', 'sider', 'breakpoint'], 'tokens.css / N-15'],
  ['space', ['horizontal', 'vertical', 'wrap', 'compact'], 'tokens.css / N-24'],
  ['typography', ['level', 'strong', 'code', 'copyable', 'link'], 'tokens.css:293 / N-33'],
  ['badge', ['count', 'dot', 'status', 'overflow'], 'Chip.module.css / D-12'],
  ['app', ['mount', 'hook', 'nested'], 'N-02 holder'],
  ['config-provider', ['theme', 'nested', 'tokens'], 'N-07 provider'],
  ['spin', ['spinning', 'static', 'tip', 'nested'], 'Spinner.module.css / N-25'],
  ['skeleton', ['active', 'rows', 'avatar', 'image'], 'density.ts / N-22'],
  ['empty', ['default', 'custom-image', 'description'], 'List.module.css / N-11'],
];

/** 56 controls from 59-PATTERNS.md §4. One row = one control = one human gate. */
export const CONTROL_REGISTRY: ControlEntry[] = ROWS.map(([id, states, fixture]) => ({
  id,
  wrapperSelector: wrap(id),
  // Fixture routes render the same vendored OpenIDEA DOM/class on both scratchpad apps.
  referenceSelector: wrap(id),
  proofSelector: wrap(id),
  states,
  fixture,
}));

export const PREFLIGHT_URLS = [
  'http://localhost:1420/',
  'http://127.0.0.1:5180/',
  'http://127.0.0.1:5173/task-management/',
] as const;

const INTERACTION_VERBS = /\b(click|type|key|focus|hover)\b/i;
const BEHAVIOR_CALL = /\b(fireEvent|userEvent)\./;
const STATE_ASSERTION = /\b(toHaveBeenCalled|aria-|getAttribute|toBeFocused|textContent|value)\b/i;
const STATIC_ONLY_ASSERTION = /\b(expect\([^)]*\.className|expect\([^)]*\.style\b)/;

export interface PassArtifact {
  id?: unknown;
  status?: unknown;
  humanVerdict?: unknown;
  consoleErrors?: unknown;
  geometry?: unknown;
  focusedTest?: unknown;
}

export interface Interaction {
  state?: unknown;
  action?: unknown;
  before?: unknown;
  after?: unknown;
  asserted?: unknown;
  reference?: unknown;
  wrapper?: unknown;
}

/** Pure shape check, usable with fabricated evidence in tests and real files in harness. */
export function checkPassArtifact(pass: PassArtifact | null): string[] {
  const errors: string[] = [];
  if (!pass) return ['PASS.json missing or invalid JSON'];
  if (!['pending-human', 'pass'].includes(String(pass.status))) errors.push('invalid status');
  if (!['pass', null].includes(pass.humanVerdict as string | null)) errors.push('invalid humanVerdict');
  if (pass.status === 'pass' && pass.humanVerdict !== 'pass') errors.push('pass status without owner verdict');
  if (pass.status === 'pending-human' && pass.humanVerdict === 'pass') errors.push('gate self-certified human verdict');
  if (!Array.isArray(pass.consoleErrors) || (pass.consoleErrors as unknown[]).length) errors.push('console errors present');
  if (!pass.geometry) errors.push('geometry missing');
  return errors;
}

export function checkInteractions(trace: Interaction[] | null, entry: ControlEntry): string[] {
  const errors: string[] = [];
  if (!Array.isArray(trace) || !trace.length) return ['interactions.json missing or empty'];
  for (const row of trace) {
    if (!entry.states.includes(String(row.state))) errors.push(`unknown state ${String(row.state)}`);
    if (!INTERACTION_VERBS.test(String(row.action ?? ''))) errors.push(`no real interaction verb in ${String(row.action)}`);
    if (!row.before || !row.after) errors.push('missing before/after');
    if (row.asserted !== true) errors.push('state not asserted');
    if (!row.reference || !row.wrapper) errors.push('missing reference/wrapper observation');
  }
  return errors;
}

export function focusedTestSource(id: string): string | null {
  const path = resolve(ROOT, `src/components/ui/__tests__/parity-${id}.test.tsx`);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

export function focusedTestErrors(source: string | null): string[] {
  if (!source) return ['focused test file missing'];
  const errors: string[] = [];
  if (!BEHAVIOR_CALL.test(source)) errors.push('no fireEvent/userEvent');
  if (!STATE_ASSERTION.test(source)) errors.push('no state-change assertion');
  if (STATIC_ONLY_ASSERTION.test(source)) errors.push('static shape assertion present');
  return errors;
}

export function preflightUnreachable(urls: readonly string[], reachable: (url: string) => boolean): string[] {
  return urls.filter((url) => !reachable(url));
}

export function checkScreenshotsDiffer(lightHash: unknown, darkHash: unknown): string[] {
  if (!lightHash || !darkHash) return ['screenshot hash missing'];
  return lightHash === darkHash ? ['light and dark screenshots identical'] : [];
}

export function registryErrors(ids: string[]): string[] {
  const errors: string[] = [];
  if (ids.length !== 56 || new Set(ids).size !== 56) errors.push('registry must have exactly 56 unique ids');
  for (const id of ids) {
    const entry = CONTROL_REGISTRY.find((c) => c.id === id);
    if (!entry) { errors.push(`missing registry entry for ${id}`); continue; }
    if (entry.wrapperSelector !== wrap(id)) errors.push(`bad wrapperSelector for ${id}`);
    if (!entry.referenceSelector.includes(id) || !entry.proofSelector.includes(id)) errors.push(`bad fixture selector for ${id}`);
    if (!entry.fixture || !entry.states.length) errors.push(`incomplete fixture/states for ${id}`);
  }
  return errors;
}

function readJson(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

/** Full on-disk gate: every criterion, no relaxation in SMOKE mode. */
export function assertEvidence(id: string, registry: ControlEntry[] = CONTROL_REGISTRY): void {
  const entry = registry.find((c) => c.id === id);
  expect(entry, `unknown control id: ${id}`).toBeDefined();

  const dir = resolve(ARTIFACTS, id);
  const files = [
    'reference-light.png', 'reference-dark.png', 'wrapper-light.png', 'wrapper-dark.png',
    'dom-light.json', 'dom-dark.json', 'geometry-light.json', 'geometry-dark.json',
    'interactions.json', 'DIFF.md', 'PASS.md', 'PASS.json',
  ];
  for (const file of files) expect(existsSync(resolve(dir, file)), `${id}/${file} missing`).toBe(true);

  const pass = readJson(resolve(dir, 'PASS.json')) as PassArtifact | null;
  expect(checkPassArtifact(pass)).toEqual([]);
  expect(pass!.id).toBe(id);
  expect(focusedTestErrors(focusedTestSource(id))).toEqual([]);

  const trace = readJson(resolve(dir, 'interactions.json')) as unknown;
  expect(checkInteractions(trace as Interaction[] | null, entry!)).toEqual([]);

  const light = readJson(resolve(dir, 'geometry-light.json')) as { screenshotHash?: string } | null;
  const dark = readJson(resolve(dir, 'geometry-dark.json')) as { screenshotHash?: string } | null;
  expect(checkScreenshotsDiffer(light?.screenshotHash, dark?.screenshotHash)).toEqual([]);
}

// Playwright imports CONTROL_REGISTRY from this module; Vitest's describe()
// proxy cannot initialize outside a Vitest runner, so register the suite only
// when Vitest is the active host. The registry itself is runtime-agnostic.
const runGateSuite = Boolean(process.env.VITEST);

if (runGateSuite) describe('Phase 59 parity evidence integrity gate', () => {
  const smoke = process.env.SMOKE === '1';
  const controlIds = smoke ? [process.env.PARITY_CONTROL ?? 'button'] : CONTROL_REGISTRY.map((c) => c.id);
  const button = CONTROL_REGISTRY.find((c) => c.id === 'button')!;
  const validPass: PassArtifact = {
    id: 'button', status: 'pending-human', humanVerdict: null,
    consoleErrors: [], geometry: { width: 72 },
  };
  const validTrace: Interaction[] = button.states.slice(0, 2).map((state) => ({
    state, action: 'click', before: 'aria-pressed=false', after: 'aria-pressed=true',
    asserted: true, reference: 'reference observation', wrapper: 'wrapper observation',
  }));

  it('artifact missing interactions.json fails', () => {
    expect(checkInteractions(null, button)).toContain('interactions.json missing or empty');
    expect(checkInteractions([], button)).toContain('interactions.json missing or empty');
    expect(checkInteractions(validTrace, button)).toEqual([]);
  });

  it('screenshot-only trace fails', () => {
    expect(checkInteractions([{
      state: 'default', action: 'screenshot', before: 'a', after: 'b',
      asserted: true, reference: 'r', wrapper: 'w',
    }], button)).toContain('no real interaction verb in screenshot');
    expect(checkInteractions([{ ...validTrace[0]!, action: 'hover' }], button)).toEqual([]);
  });

  it('static-shape-only focused test fails', () => {
    expect(focusedTestErrors("expect(el.className).toBe('btn')")).toEqual(
      expect.arrayContaining(['no fireEvent/userEvent', 'static shape assertion present']),
    );
    expect(focusedTestErrors("fireEvent.click(el); expect(el.getAttribute('aria-pressed')).toBe('true')")).toEqual([]);
  });

  it('self-assigned humanVerdict fails', () => {
    expect(checkPassArtifact({ ...validPass, status: 'pass', humanVerdict: 'pass' })).toEqual([]);
    expect(checkPassArtifact({ ...validPass, status: 'pass', humanVerdict: null })).toContain('pass status without owner verdict');
    expect(checkPassArtifact({ ...validPass, status: 'pending-human', humanVerdict: 'pass' })).toContain('gate self-certified human verdict');
    expect(checkPassArtifact(validPass)).toEqual([]);
  });

  it('light and dark screenshots differ', () => {
    expect(checkScreenshotsDiffer('aaa', 'aaa')).toContain('light and dark screenshots identical');
    expect(checkScreenshotsDiffer('aaa', 'bbb')).toEqual([]);
    expect(checkScreenshotsDiffer(null, 'bbb')).toContain('screenshot hash missing');
  });

  it('on-disk button evidence satisfies every criterion', () => {
    assertEvidence('button');
  });

  it('registry has exactly 56 ids with selectors, fixtures and states (B1)', () => {
    expect(registryErrors(CONTROL_REGISTRY.map((c) => c.id))).toEqual([]);
    expect(registryErrors(CONTROL_REGISTRY.slice(1).map((c) => c.id))).toContain('registry must have exactly 56 unique ids');
    expect(registryErrors(['button', 'ghost'])).toEqual(expect.arrayContaining(['missing registry entry for ghost']));
  });

  it('pre-flight unreachable URL fails hard, never skips (B3)', () => {
    expect(preflightUnreachable(PREFLIGHT_URLS, () => true)).toEqual([]);
    expect(preflightUnreachable(PREFLIGHT_URLS, (url) => url !== PREFLIGHT_URLS[1])).toEqual([PREFLIGHT_URLS[1]]);
  });

  it('SMOKE=1 validates exactly the selected control with the same criteria (B4)', () => {
    if (smoke) {
      expect(controlIds).toEqual([process.env.PARITY_CONTROL ?? 'button']);
      for (const id of controlIds) assertEvidence(id);
    } else {
      expect(controlIds.length).toBe(56);
      for (const id of controlIds) assertEvidence(id);
    }
  });
});
