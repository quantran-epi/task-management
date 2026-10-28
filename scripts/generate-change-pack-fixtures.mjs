import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

const dir = path.resolve('tests/fixtures/ai/change-packs');
await fs.mkdir(dir, { recursive: true });
const meta = {
  cr: 'CR-25001',
  base: 'base-commit-001',
  head: 'head-commit-002',
  branch: 'feature/CR-25001',
  author: 'fixture',
  generatedAt: '2026-10-28T00:00:00.000Z',
  commits: [
    { sha: 'base-commit-001', subject: 'base' },
    { sha: 'head-commit-002', subject: 'head' },
  ],
  files: [
    { path: 'src/feature.ts', status: 'added' },
    { path: 'sql/alter.sql', status: 'modified' },
    { path: 'diff.patch', status: 'modified' },
  ],
};
const files = {
  'diff.patch': 'diff --git a/src/feature.ts b/src/feature.ts\n+export const feature = true;\n',
  'meta.json': JSON.stringify(meta),
  'new-files/src/feature.ts': 'export const feature = true;\n',
  'sql/alter.sql': 'ALTER TABLE SYN_LIMIT ADD STATUS VARCHAR2(8);\n',
};

async function write(name, entries) {
  const zip = new JSZip();
  for (const [entry, content] of Object.entries(entries)) zip.file(entry, content);
  await fs.writeFile(path.join(dir, name), await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' }));
}

await write('valid.zip', files);
await write('wrong-cr.zip', { ...files, 'meta.json': JSON.stringify({ ...meta, cr: 'CR-WRONG' }) });
await write('traversal.zip', { ...files, '../escape.txt': 'nope' });
await write('collision.zip', { ...files, 'NEW-FILES/src/feature.ts': 'alias' });
await write('prohibited.zip', { ...files, 'node_modules/pkg/index.js': 'nope' });
await write('binary.zip', { ...files, 'new-files/assets/logo.bin': Buffer.from([0, 1, 2, 3]) });
await write('partial.zip', { ...files, 'diff.patch': `${files['diff.patch']}WIZARD_DEFERRED_HUNK\n` });
await fs.writeFile(path.join(dir, 'corrupt.zip'), Buffer.from('not-a-zip'));
