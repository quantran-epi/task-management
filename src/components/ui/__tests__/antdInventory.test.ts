import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  extractNamedImportsForTest,
  findMissingWrappers,
  isPassThroughWrapper,
  scanConsumedAntd,
  scanWrappers,
  type ConsumedAntd,
} from '../../../../tests/helpers/antdInventory';

const tempDirs: string[] = [];

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'antd-inventory-'));
  tempDirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
  }
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('extractNamedImportsForTest (pure parser)', () => {
  it('parses a named component, a multiline import and an icon import', () => {
    const source = `
      import { Button, type ButtonProps, Input as AntdInput } from 'antd';
      import {
        SearchOutlined,
        type IconBaseProps,
      } from '@ant-design/icons';
    `;
    expect(extractNamedImportsForTest(source, 'antd')).toEqual(['Button', 'Input']);
    expect(extractNamedImportsForTest(source, '@ant-design/icons')).toEqual(['SearchOutlined']);
  });
});

describe('scanConsumedAntd', () => {
  it('buckets components, icons and utilities from source files', () => {
    const root = fixture({
      'a.tsx': "import { Button, type ButtonProps, message, theme } from 'antd';\nimport { SearchOutlined } from '@ant-design/icons';",
      'nested/b.ts': "import {\n  Modal,\n  notification,\n} from 'antd';",
      'ignored.md': "import { Tag } from 'antd';",
    });
    expect(scanConsumedAntd(root)).toEqual({
      components: ['Button', 'Modal'],
      icons: ['SearchOutlined'],
      utilities: ['message', 'notification', 'theme'],
    });
  });
});

describe('scanWrappers and findMissingWrappers', () => {
  it('reports a component with no wrapper and clears when it exists', () => {
    const root = fixture({
      'button.tsx': 'export function Button() { return null; }',
      'icon.tsx': 'export const SearchOutlined = wrapIcon(SearchComponent);',
    });
    const consumed: ConsumedAntd = { components: ['Button', 'Tag'], icons: ['SearchOutlined'], utilities: [] };
    expect(findMissingWrappers(consumed, scanWrappers(root))).toEqual(['Tag']);
    writeFileSync(join(root, 'tag.tsx'), 'export function Tag() { return null; }');
    expect(findMissingWrappers(consumed, scanWrappers(root))).toEqual([]);
  });
});

describe('isPassThroughWrapper', () => {
  it('rejects bare named and star re-exports', () => {
    expect(isPassThroughWrapper("export { Button } from 'antd';")).toBe(true);
    expect(isPassThroughWrapper("export * from 'antd';")).toBe(true);
  });

  it('accepts a wrapper that calls the shared contract', () => {
    const real = `
      import { Button as AntButton } from 'antd';
      import { getSharedControlTokens } from './tokens.contract';
      export function Button() { return <AntButton {...getSharedControlTokens()} />; }
    `;
    expect(isPassThroughWrapper(real)).toBe(false);
  });
});

describe('coverage gate ownership', () => {
  it('does not assert full-tree coverage — plan 08 owns that gate', () => {
    expect(Object.keys(scanConsumedAntd('/nonexistent-src-root'))).toEqual(['components', 'icons', 'utilities']);
  });
});
