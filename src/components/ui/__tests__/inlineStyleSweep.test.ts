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

function manifestNames(): string[] {
  return readdirSync(MANIFEST_DIR).filter((name) => /^wave-.*\.txt$/.test(name)).sort();
}

function pathsIn(name: string): string[] {
  return readFileSync(join(MANIFEST_DIR, name), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
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

describe('D-10 inline token literal sweep over all wave manifests', () => {
  it('has a non-empty set of wave manifests', () => {
    expect(manifestNames().length).toBeGreaterThan(0);
  });

  it('finds no token-valued inline style literal in any migrated wave', () => {
    for (const name of manifestNames()) {
      expect(pathsIn(name).flatMap(violations), `manifest ${name}`).toEqual([]);
    }
  });
});
