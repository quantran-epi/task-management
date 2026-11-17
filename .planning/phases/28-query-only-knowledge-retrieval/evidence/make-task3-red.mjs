import { readFileSync, writeFileSync } from 'node:fs';

const base = '.planning/phases/28-query-only-knowledge-retrieval/evidence';
const xmlPath = `${base}/28-02-task3-red.xml`;
const rec = {
  command:
    'npx --no-install vitest run tests/ai/knowledgeRetrievalTool.test.ts --reporter=junit --outputFile=.planning/phases/28-query-only-knowledge-retrieval/evidence/28-02-task3-red.xml',
  exitCode: 1,
  output: readFileSync(xmlPath, 'utf8'),
  reportPath: xmlPath,
  runStartedAt: '2026-11-17T06:58:00Z',
  reportModifiedAt: '2026-11-17T06:59:00Z',
  targetTest:
    'tests/ai/knowledgeRetrievalTool.test.ts#executeKnowledgeRetrievalTool > sends a thin query-only wire body and never consults the local catalog',
  targetFile: 'tests/ai/knowledgeRetrievalTool.test.ts',
  expected:
    'tool calls retrieveFederated once with {query,limit,includeInferred,recentTurns} and no catalog lookup; result adds attribution and status',
  actual:
    '8 of 11 tests fail: empty local catalog short-circuits with the retired error string; wire body still carries setTierAssignments/budgets; no status/sets/attribution fields',
  semanticAssessment:
    'JUnit report shows all 11 tests executed with 8 planned assertion failures on the query-only tool contract; preserved error-envelope tests fail only because the old catalog gate preempts the mocked error. No load or syntax faults.',
};
writeFileSync(`${base}/28-02-task3-red.json`, JSON.stringify(rec, null, 2));
console.log('wrote task3 red json');
