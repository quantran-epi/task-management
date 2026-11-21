import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MANIFEST_DIR = join('tests', 'fixtures', 'adoption');
const STATIC_IMPORT = /\bimport\s*\{[^}]*\b(message|notification|Modal)\b[^}]*\}\s*from\s*['"]antd['"]/;
const STATIC_CALL =
  /\b(Modal)\.confirm\(|\b(message|notification)\.(success|error|warning|warn|info|loading|open|destroy)\(/g;

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

function executableLines(source: string): string[] {
  return source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line));
}

/**
 * A context instance (`const message = useMessage()`) has the same call syntax as
 * AntD's static API. Only a call whose receiver is NOT bound to a context hook is
 * a violation; files importing the static symbol from antd always violate.
 */
function violations(path: string): string[] {
  const source = readFileSync(path, 'utf8');
  const lines = executableLines(source);
  const code = lines.join('\n');
  const localMessage = /\b(?:const|let|var)\s+message\s*=\s*useMessage\s*\(/.test(code);
  const localNotification = /\b(?:const|let|var)\s+notification\s*=\s*useNotification\s*\(/.test(code) ||
    /\b(?:const|let|var)\s*\{[^}]*\bnotification\b[^}]*\}\s*=\s*[^;]*useNotification\s*\(/.test(code);
  const localModal = /\b(?:const|let|var)\s*\{[^}]*\bmodal\b[^}]*\}\s*=\s*useTaskMateModal\s*\(/.test(code);

  const found: string[] = [];
  if (STATIC_IMPORT.test(code)) found.push(`${path}: static antd API import`);
  for (const [index, line] of lines.entries()) {
    for (const match of line.matchAll(STATIC_CALL)) {
      const receiver = match[1] ?? match[2];
      const bound =
        (receiver === 'Modal' && localModal) ||
        (receiver === 'message' && localMessage) ||
        (receiver === 'notification' && localNotification);
      if (!bound) found.push(`${path}:${index + 1}: ${match[0]}`);
    }
  }
  return found;
}

describe('D-07 static AntD API guard over migrated waves', () => {
  it('has a non-empty migration manifest', () => {
    expect(migratedPaths().length).toBeGreaterThan(0);
  });

  it('finds no unbound message/notification/Modal.confirm call in migrated files', () => {
    expect(migratedPaths().flatMap(violations)).toEqual([]);
  });
});
