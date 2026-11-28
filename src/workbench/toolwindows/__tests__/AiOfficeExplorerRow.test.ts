import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/workbench/toolwindows/AiOfficeExplorer.tsx'),
  'utf8'
);

describe('AI office explorer team rows', () => {
  it('does not paint a fallback-white border on each group row', () => {
    expect(source).not.toContain('--border-subtle');
    expect(source).not.toContain("border: '1px solid var(--border-subtle, #f0f2f5)'");
    expect(source).toContain("borderBottom: '1px solid var(--border, #e9eaee)'");
  });
});
