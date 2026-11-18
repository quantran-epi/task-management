import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const dir = mkdtempSync(join(tmpdir(), 'anti-read-loop-test-'));
const source = readFileSync(new URL('./anti-read-loop.mjs', import.meta.url), 'utf8')
  .replace("'/tmp/claude_read_history.json'", JSON.stringify(join(dir, 'history.json')));
const settings = JSON.parse(readFileSync(new URL('../.claude/settings.json', import.meta.url), 'utf8'));
const run = (input) => spawnSync(process.execPath, ['--input-type=module', '-e', source], {
  input: JSON.stringify(input), encoding: 'utf8',
});

try {
  assert.equal(settings.worktree.baseRef, 'head');
  assert.equal(settings.hooks.PreToolUse[0].matcher, 'Read');
  assert.equal(settings.hooks.PreToolUse[0].hooks[0].type, 'command');
  assert.ok(!('PreToolCall' in settings.hooks));
  assert.equal(run({ tool_name: 'Bash' }).status, 0);
  const read = { tool_name: 'Read', tool_input: { file_path: '/test/file', limit: 200 } };
  assert.equal(run(read).status, 0);
  assert.equal(run(read).status, 0);
  assert.equal(run(read).status, 2, 'Repeated reads must block PreToolUse');
  assert.equal(run({ tool_name: 'Read', tool_input: { file_path: '/test/short', limit: 20 } }).status, 2);
  assert.equal(run({ tool_name: 'Read', tool_input: { file_path: '/test/large', limit: 20, allow_large: true } }).status, 0);
  console.log('PASS worktree settings and anti-read-loop hook');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
