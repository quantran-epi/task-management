import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  findMissingWrappers,
  isPassThroughWrapper,
  scanConsumedAntd,
  scanWrappers,
} from '../../../../tests/helpers/antdInventory';

const SRC = 'src';
const UI = 'src/components/ui';

function walkUi(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : walkUi(path);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('D-04 live-tree wrapper coverage', () => {
  const consumed = scanConsumedAntd(SRC);
  const wrapped = scanWrappers(UI);

  it('scans a non-empty set of consumed runtime components and icons', () => {
    expect(consumed.components.length).toBeGreaterThan(0);
    expect(consumed.icons.length).toBeGreaterThan(0);
  });

  it('fails if any consumed AntD component or icon lacks a wrapper', () => {
    expect(findMissingWrappers(consumed, wrapped)).toEqual([]);
  });

  it('covers the icon inventory through src/components/ui/icon.tsx exports', () => {
    const iconSource = readFileSync(join(UI, 'icon.tsx'), 'utf8');
    for (const name of consumed.icons) {
      expect(wrapped.has(name), `${name} must be exported from icon.tsx`).toBe(true);
    }
    expect(consumed.icons.length).toBeGreaterThan(0);
    expect(iconSource).toContain('wrapIcon');
  });

  it('has no pass-through wrapper under src/components/ui/', () => {
    const passThrough = walkUi(UI).filter((file) =>
      isPassThroughWrapper(readFileSync(file, 'utf8')),
    );
    expect(passThrough).toEqual([]);
  });
});
