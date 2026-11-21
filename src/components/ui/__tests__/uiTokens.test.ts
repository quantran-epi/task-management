import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../../../..');
const UI = join(ROOT, 'src/components/ui');

/** Every `--ui-*` custom property a wrapper injects must be consumed in ui-tokens.css (WR-02). */
describe('wrapper --ui-* contract has real CSS consumers', () => {
  const injected = new Set<string>();
  for (const file of readdirSync(UI)) {
    if (!file.endsWith('.tsx')) continue;
    const source = readFileSync(join(UI, file), 'utf8');
    for (const match of source.matchAll(/'(--ui-[a-z-]+)'/g)) injected.add(match[1]!);
  }

  const css = readFileSync(join(UI, 'ui-tokens.css'), 'utf8');

  it('injects a non-empty set of contract properties', () => {
    expect(injected.size).toBeGreaterThan(0);
  });

  it('references every injected property with var() in the consumed stylesheet', () => {
    const unconsumed = [...injected].filter((name) => !css.includes(`var(${name},`));
    expect(unconsumed).toEqual([]);
  });

  it('applies the consumer stylesheet to the workbench shell only', () => {
    expect(css).toContain('.taskmate-workbench-theme :where([style*="--ui-"])');
  });
});
