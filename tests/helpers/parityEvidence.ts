import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Writes the Phase 59 §5 artifact contract. PASS.json is always pending-human:
 * the machine never sets the owner's verdict (HGC-01).
 */

export const ARTIFACT_ROOT = resolve(process.cwd(), '.planning/debug/artifacts/control-parity');

/**
 * WR-R2-02: scratchpad fixtures live outside the repo (~600 MB, not committed).
 * PARITY_SP is an explicit precondition — no session-specific /private/tmp
 * default that vanishes on reboot and silently looks runnable on fresh clone.
 * Pure + lazy so importing this module never hard-crashes test collection.
 */
export function resolveSp(env: NodeJS.ProcessEnv = process.env): string {
  const value = typeof env.PARITY_SP === 'string' ? env.PARITY_SP.trim() : '';
  if (!value) {
    throw new Error(
      'PARITY_SP is required: set it to the scratchpad root containing openidea/ and ' +
      'oi-prototype/ fixtures (see phase 59 SMOKE.md / PATTERNS §0.1). ' +
      'Fixtures are ~600 MB and kept outside the repo by design.',
    );
  }
  return value;
}

export function controlDir(id: string): string {
  return resolve(ARTIFACT_ROOT, id);
}

export function prepareControlDir(id: string): string {
  const dir = controlDir(id);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function json(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2));
}

export function screenshotHash(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16);
}

export interface Geometry {
  width: number;
  height: number;
  fontSize: string;
  padding: string;
  margin: string;
  border: string;
  borderRadius: string;
  boxShadow: string;
  iconWidth?: number;
  iconHeight?: number;
  alignment?: string;
  overflow?: string;
  screenshotHash?: string;
  /** IN-01: which app last wrote this shared geometry-{theme}.json file. */
  app?: string;
}

export interface Interaction {
  state: string;
  action: string;
  before: string;
  after: string;
  asserted: boolean;
  reference: string;
  wrapper: string;
}

export interface PassArtifact {
  id: string;
  status: 'pending-human';
  humanVerdict: null;
  chromeTabUrl: string;
  seedDescription: string;
  geometry: Record<string, Geometry>;
  interactions: Interaction[];
  consoleErrors: string[];
  focusedTest: string;
}

export function writeGeometry(dir: string, theme: 'light' | 'dark', geometry: Geometry): void {
  json(resolve(dir, `geometry-${theme}.json`), geometry);
}

/**
 * WR-01: one DOM snapshot per app+theme so reference/proof are not overwritten
 * by wrapper. Also keep the legacy `dom-{theme}.json` (wrapper copy) for the
 * §5 artifact contract.
 */
export function writeDom(dir: string, theme: 'light' | 'dark', app: string, dom: unknown): void {
  json(resolve(dir, `dom-${app}-${theme}.json`), dom);
  if (app === 'wrapper') json(resolve(dir, `dom-${theme}.json`), dom);
}

export function writeInteractions(dir: string, interactions: Interaction[]): void {
  json(resolve(dir, 'interactions.json'), interactions);
}

export function writePass(dir: string, artifact: Omit<PassArtifact, 'status' | 'humanVerdict'>): PassArtifact {
  const pass: PassArtifact = {
    ...artifact,
    status: 'pending-human',
    humanVerdict: null,
  };
  json(resolve(dir, 'PASS.json'), pass);
  return pass;
}

export function writeDiff(dir: string, id: string, rows: Array<[string, string, string, string]>): void {
  const body = [
    `# DIFF — ${id}`,
    '',
    '| thuộc tính | reference | wrapper | verdict |',
    '|---|---|---|---|',
    ...rows.map(([prop, reference, wrapper, verdict]) => `| ${prop} | ${reference} | ${wrapper} | ${verdict} |`),
    '',
  ].join('\n');
  writeFileSync(resolve(dir, 'DIFF.md'), body);
}

export function writeHandoff(dir: string, id: string, steps: string[], notes: string[] = []): void {
  const body = [
    `# PASS (chờ sếp) — ${id}`,
    '',
    'Trạng thái: `pending-human`. Chữ "pass" của sếp là nguồn duy nhất để sang control kế.',
    '',
    '## Các bước thao tác ngắn',
    ...steps.map((step, i) => `${i + 1}. ${step}`),
    ...(notes.length ? ['', '## Ghi chú', ...notes.map((n) => `- ${n}`)] : []),
    '',
  ].join('\n');
  writeFileSync(resolve(dir, 'PASS.md'), body);
}

export function writeSmoke(id: string, content: string): string {
  const dir = controlDir(id);
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, 'SMOKE.md');
  writeFileSync(path, content);
  return path;
}

export function artifactExists(id: string, file: string): boolean {
  return existsSync(resolve(controlDir(id), file));
}
