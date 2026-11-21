import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'vitest';

const codemod = resolve('scripts/adoption-codemod.mjs');

function run(source) {
  const root = mkdtempSync(join(tmpdir(), 'adoption-codemod-test-'));
  try {
    const file = 'probe.tsx';
    writeFileSync(join(root, file), source);
    const result = spawnSync(process.execPath, [codemod, '--root', root, '--dry-run', file], {
      encoding: 'utf8',
    });
    return { status: result.status, stderr: result.stderr, original: readFileSync(join(root, file), 'utf8') };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('adoption-codemod static API warnings', () => {
  it('warns for Modal.confirm so it is not silently rewritten to the declarative barrel (WR-03)', () => {
    const { stderr } = run("import { Modal, message } from 'antd'\nModal.confirm({ title: 'x' });\n");
    assert.match(stderr, /static API Modal\b/);
    assert.match(stderr, /static API .*message\b/);
  });

  it('keeps message and notification on the warning list', () => {
    const { stderr } = run("import { notification } from 'antd'\nnotification.open({});\n");
    assert.match(stderr, /static API notification\b/);
  });
});
