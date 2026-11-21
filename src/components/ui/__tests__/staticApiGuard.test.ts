import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_DIR = 'src';
const UI_DIR = join('src', 'components', 'ui');
const STATIC_IMPORT = /\bimport\s*\{[^}]*\b(message|notification|Modal)\b[^}]*\}\s*from\s*['"]antd['"]/;
// D-05/D-07: block every static receiver including loading/open/destroy/warn.
const STATIC_CALL =
  /\b(Modal)\.confirm\(|\b(message|notification)\.(success|error|warning|warn|info|loading|open|destroy)\(/g;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

/** D-05: no zone exception — every src file outside ui/ is scanned. */
function guardedPaths(): string[] {
  return sourceFiles(SRC_DIR).filter((path) => !path.startsWith(`${UI_DIR}/`)).sort();
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

describe('D-07 static AntD API guard over whole src', () => {
  it('scans every src source file outside ui/', () => {
    expect(guardedPaths().length).toBeGreaterThan(0);
    expect(guardedPaths().some((path) => path.startsWith('src/components/ui/'))).toBe(false);
  });

  it('finds no unbound message/notification/Modal.confirm call outside ui/', () => {
    expect(guardedPaths().flatMap(violations)).toEqual([]);
  });
});
