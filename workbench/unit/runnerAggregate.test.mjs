import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const workbenchRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runner = readFileSync(resolve(workbenchRoot, 'run.sh'), 'utf8');

test('aggregate ch escalation path: no || OVERALL=1 overwrite', () => {
  assert.equal(/\|\|\s*OVERALL=1/.test(runner), false);
  assert.match(runner, /escalate\(\) \{/);
  assert.match(runner, /if \[\[ "\$code" -eq 2 \]\]; then\s*\n\s*OVERALL=2/);
});

test('missing knowledge token là BLOCKED=2, không phải skip=0', () => {
  assert.match(runner, /record_gate "knowledge-live" "knowledge-live \(BLOCKED: no token\)" 2/);
  assert.match(runner, /escalate 2/);
});

test('mọi gate aggregate đều đi qua escalate', () => {
  const calls = [...runner.matchAll(/escalate \$?\S*/g)].map((match) => match[0]);
  // 4 full gates + knowledge-live + e2e-all + 2 scoped unit + scoped e2e
  assert.ok(calls.length >= 8, `expected >=8 escalate calls, got ${calls.length}`);
});
