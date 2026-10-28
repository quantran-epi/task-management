import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const manifestPath = resolve(root, 'tests/fixtures/ai/pl-template-manifest.json');
const baselinePath = resolve(root, 'tests/fixtures/ai/pl07-baseline.json');
const structureKeys = ['pl02', 'pl03b', 'pl07'] as const;

type Manifest = {
  schemaVersion: number;
  extractionVersion: string;
  templates: Record<string, { path: string; sha256: string; sizeBytes: number }>;
};

type Baseline = {
  sourcePath: string;
  sourceSha256: string;
  extractionVersion: string;
  sections: Array<{
    id: string;
    title: string;
    items: Array<{
      number: string;
      text: string;
      subItems?: Array<{ number: string; text: string }>;
    }>;
  }>;
};

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function sha256(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

describe('wizard source fixtures', () => {
  it('pins exactly three source templates with byte hashes and sizes', async () => {
    const manifest = await readJson<Manifest>(manifestPath);
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.extractionVersion).toMatch(/^ooXML-/);
    expect(Object.keys(manifest.templates).sort()).toEqual([...structureKeys].sort());

    for (const key of structureKeys) {
      const entry = manifest.templates[key];
      expect(entry).toBeDefined();
      if (!entry) throw new Error(`Missing manifest template: ${key}`);
      expect(entry.path).toMatch(/^docs\/pl-templates\/.+\.docx$/);
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.sizeBytes).toBeGreaterThan(0);
      const sourcePath = resolve(root, entry.path);
      expect(await sha256(sourcePath)).toBe(entry.sha256);
      expect((await readFile(sourcePath)).byteLength).toBe(entry.sizeBytes);
    }
  });

  it('keeps PL07 sections I-V and II.5 sub-items verbatim and excludes generated VI', async () => {
    const manifest = await readJson<Manifest>(manifestPath);
    const baseline = await readJson<Baseline>(baselinePath);
    const pl07 = manifest.templates.pl07;
    expect(pl07).toBeDefined();
    if (!pl07) throw new Error('Missing PL07 manifest template');
    expect(baseline.sourcePath).toBe(pl07.path);
    expect(baseline.sourceSha256).toBe(pl07.sha256);
    expect(baseline.extractionVersion).toBe(manifest.extractionVersion);
    expect(baseline.sections.map(section => section.id)).toEqual(['I', 'II', 'III', 'IV', 'V']);
    expect(baseline.sections.some(section => section.id === 'VI')).toBe(false);

    const passwordSection = baseline.sections.find(section => section.id === 'II');
    const passwordPolicy = passwordSection?.items.find(item => item.number === '5');
    expect(passwordPolicy?.subItems).toEqual([
      { number: 'a', text: '- Độ dài mật khẩu tối thiểu là 7 ký tự.' },
      { number: 'b', text: '- Độ phức tạp của mật khẩu: Bao gồm các ký tự số, chữ và các ký tự đặc biệt khác.' },
      { number: 'c', text: '- Không hiển thị mật khẩu người dùng dưới dạng clear-text khi đăng nhập.' },
      { number: 'd', text: '- Khi người dùng nhập sai quá 3 lần phải yêu cầu nhập captcha trước khi đăng nhập, và sai quá 5 lần sẽ khóa tài khoản trong vòng 15 phút.' },
    ]);
    expect(baseline.sections.reduce((count, section) => count + section.items.length, 0)).toBe(27);
  });

  it('keeps each observed structure fixture tied to its source hash', async () => {
    const manifest = await readJson<Manifest>(manifestPath);
    for (const key of structureKeys) {
      const fixture = await readJson<{
        sourcePath: string;
        sourceSha256: string;
        sectionOrder: string[];
        tables: Array<{ columnCount: number; headerText: string[]; mergeSpans: number[] }>;
        numbering: { definitions: unknown[] };
        pageMargins: Record<string, number>;
        headers: unknown[];
        footers: unknown[];
        toc: { present: boolean };
        revisionTable: { present: boolean; columns: string[] };
        signature: { present: boolean };
        resolvedFindings: string[];
      }>(resolve(root, `tests/fixtures/docx/${key}-structure.json`));
      const entry = manifest.templates[key];
      expect(entry).toBeDefined();
      if (!entry) throw new Error(`Missing manifest template: ${key}`);
      expect(fixture.sourcePath).toBe(entry.path);
      expect(fixture.sourceSha256).toBe(entry.sha256);
      expect(fixture.sectionOrder.length).toBeGreaterThan(0);
      expect(fixture.tables.length).toBeGreaterThan(0);
      expect(fixture.tables.every(table => table.columnCount > 0)).toBe(true);
      expect(fixture.numbering.definitions.length).toBeGreaterThan(0);
      expect(Object.keys(fixture.pageMargins)).toEqual(expect.arrayContaining(['top', 'right', 'bottom', 'left']));
      expect(fixture.headers.length).toBeGreaterThan(0);
      expect(fixture.footers.length).toBeGreaterThan(0);
      expect(fixture.resolvedFindings.length).toBeGreaterThan(0);
    }
  });

  it.todo('asserts PL02 builder semantic OOXML against pl02-structure.json');
  it.todo('asserts PL03B builder semantic OOXML against pl03b-structure.json');
  it.todo('asserts PL07 builder semantic OOXML against pl07-structure.json');
});
