import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('Single-shell boot entrypoint (SHELL-01)', () => {
  const mainSource = readSource('src/main.tsx');

  it('renders AppIntelliJ unconditionally', () => {
    expect(mainSource.includes('<AppIntelliJ />')).toBe(true);
  });

  it('has no shell selection function', () => {
    expect(mainSource.includes('shouldBootIntelliJ')).toBe(false);
  });

  it('has no legacy shell flag token', () => {
    expect(mainSource.includes('taskmate_ui_shell')).toBe(false);
  });

  it('has no ?ui= query flag', () => {
    expect(mainSource.includes('?ui=')).toBe(false);
  });

  it('does not import the legacy App shell', () => {
    expect(/from ['"]\.\/App['"]/.test(mainSource)).toBe(false);
  });
});
