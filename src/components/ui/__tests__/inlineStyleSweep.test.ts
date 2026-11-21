import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MANIFEST_DIR = join('tests', 'fixtures', 'adoption');
// D-09 tokens that must reach views through CSS vars, not inline literals.
const TOKEN_LITERALS = [
  /fontSize:\s*(?:11|12|13\.5)\b/,
  /borderRadius:\s*[68]\b/,
  /#(?:1677ff|4f46e5|8c8c8c|ffffff)\b/i,
  /\bgap:\s*[diagram]\b/i,
];

function migratedPaths(): string[] {
  const paths = new Set<string>();
  for (const name of readdirSync(MANIFEST_DIR)) {
    if (!/^wave-.*\.txt$/.test(name)) continue;
    for (const line of readFileSync(join(MANIFEST_DIR, name), 'utf8').split('\n')) {
      const path = line.trim();
      if (path && !path.startsWith('#')) paths.add(path);
    }
  }
  return [...paths].sort();
}

function violations(path: string): string[] {
  const found: string[] = [];
  for (const [index, line] of readFileSync(path, 'utf8').split('\n').entries()) {
    // D-10: documented dynamic-value exceptions (and rule comments) are allowed.
    if (/ponytail:|^\s*(\/\/|\/\*|\*)/.test(line)) continue;
    if (TOKEN_LITERALS.some((pattern) => pattern.test(line))) {
      found.push(`${path}:${index + 1}: ${line.trim()}`);
    }
  }
  return found;
}

describe('D-10 inline token literal sweep over migrated waves', () => {
  it('has a non-empty migration manifest', () => {
    expect(migratedPaths().length).toBeGreaterThan(0);
  });

  it('finds no token-valued inline style literal in migrated files', () => {
    expect(migratedPaths().flatMap(violations)).toEqual([]);
  });
});
