import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { globToRegExp, matchesPath, resolveScope } from '../scripts/detect-changes.mjs';

const workbenchRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(
  readFileSync(resolve(workbenchRoot, 'gate-map.json'), 'utf8')
);

test('knowledge path maps to knowledge unit + grounded E2E', () => {
  const result = resolveScope(['src/services/knowledge/knowledgeClient.ts'], manifest);
  assert.equal(result.scope, 'changed');
  assert.ok(result.unit.includes('tests/knowledge'));
  assert.deepEqual(result.e2e, ['e2e/grounded-knowledge.e2e.ts']);
});

test('db and backup paths map to backup unit + backup E2E', () => {
  const result = resolveScope(
    ['src/db/index.ts', 'src/services/backup/exportBackup.ts'],
    manifest
  );
  assert.equal(result.scope, 'changed');
  assert.ok(result.unit.includes('tests/backup'));
  assert.ok(result.unit.includes('tests/migrations.test.tsx'));
  assert.deepEqual(result.e2e, ['e2e/backup-roundtrip.e2e.ts']);
});

test('Docs actions + change-pack fixture map to change-pack E2E with dedupe', () => {
  const result = resolveScope(
    [
      'src/components/notes/DocsLibraryActions.tsx',
      'tests/fixtures/ai/change-packs/valid.zip',
      'tests/fixtures/ai/change-packs/valid.zip',
    ],
    manifest
  );
  assert.deepEqual(result.e2e, ['e2e/change-pack.e2e.ts']);
  assert.equal(result.changed.length, 2);
});

test('unmapped path falls back to nearest unit + smoke, never full suite', () => {
  const result = resolveScope(['docs/README.md'], manifest);
  assert.equal(result.scope, 'fallback');
  assert.deepEqual(result.unit, ['workbench/unit/detectChanges.test.mjs']);
  assert.deepEqual(result.e2e, ['e2e/smoke.e2e.ts']);
});

test('multiple matching rules union and dedupe', () => {
  const result = resolveScope(
    [
      'src/services/knowledge/knowledgeClient.ts',
      'src/db/index.ts',
      'workbench/gate-map.json',
    ],
    manifest
  );
  assert.equal(result.scope, 'changed');
  assert.deepEqual(result.e2e.sort(), [
    'e2e/backup-roundtrip.e2e.ts',
    'e2e/grounded-knowledge.e2e.ts',
    'e2e/smoke.e2e.ts',
  ]);
});

test('glob boundaries: **/ matches nested only at directory boundary', () => {
  assert.equal(matchesPath('src/db/repositories/foo.ts', ['src/db/**']), true);
  assert.equal(matchesPath('src/db/index.ts', ['src/db/**']), true);
  assert.equal(matchesPath('src/dbase/index.ts', ['src/db/**']), false);
  assert.equal(globToRegExp('a/*.ts').test('a/b/c.ts'), false);
});
