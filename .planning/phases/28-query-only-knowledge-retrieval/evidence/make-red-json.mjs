import { readFileSync, writeFileSync } from 'node:fs';

const base = '.planning/phases/28-query-only-knowledge-retrieval/evidence';
const xmlPath = `${base}/28-02-task1-red.xml`;
const rec = {
  command:
    'npx --no-install vitest run tests/knowledge/retrievalProtocolParity.test.ts --reporter=junit --outputFile=.planning/phases/28-query-only-knowledge-retrieval/evidence/28-02-task1-red.xml',
  exitCode: 1,
  output: readFileSync(xmlPath, 'utf8'),
  reportPath: xmlPath,
  runStartedAt: '2026-11-17T06:40:58Z',
  reportModifiedAt: '2026-11-17T06:41:02Z',
  targetTest:
    'tests/knowledge/retrievalProtocolParity.test.ts#retrieval protocol server/client parity > appends NO_PUBLISHED_SETS to the mirrored outcomes in server order',
  targetFile: 'tests/knowledge/retrievalProtocolParity.test.ts',
  expected:
    'client RETRIEVAL_OUTCOMES equals server outcomes including NO_PUBLISHED_SETS; thin request schema and coverage mirror exist',
  actual:
    '7 of 13 tests fail on planned parity assertions: outcomes order, federated diagnostics keys, thin request keys, default limit, coverage state schema, coverage ledger',
  semanticAssessment:
    'JUnit report shows all 13 tests executed with 7 planned assertion failures; target test failed on missing NO_PUBLISHED_SETS in the client outcomes array; no load/syntax faults.',
};
writeFileSync(`${base}/28-02-task1-red.json`, JSON.stringify(rec, null, 2));
console.log('wrote red json');
