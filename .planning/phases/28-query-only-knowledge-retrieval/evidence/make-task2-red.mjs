import { readFileSync, writeFileSync } from 'node:fs';

const base = '.planning/phases/28-query-only-knowledge-retrieval/evidence';
const xmlPath = `${base}/28-02-task2-red.xml`;
const rec = {
  command:
    'npx --no-install vitest run tests/ai/groundedTurn.test.ts --reporter=junit --outputFile=.planning/phases/28-query-only-knowledge-retrieval/evidence/28-02-task2-red.xml',
  exitCode: 1,
  output: readFileSync(xmlPath, 'utf8'),
  reportPath: xmlPath,
  runStartedAt: '2026-11-17T06:48:00Z',
  reportModifiedAt: '2026-11-17T06:49:00Z',
  targetTest:
    'tests/ai/groundedTurn.test.ts#groundedTurn state machine > 16. Server enabled + empty scope -> query-only retrieveFederated without clarify_intent',
  targetFile: 'tests/ai/groundedTurn.test.ts',
  expected:
    'server enabled with empty catalog calls retrieveFederated with {query, limit, includeInferred} and returns grounded_answer rather than clarify_intent',
  actual:
    '4 target tests fail: empty scope returns clarify_intent; wire body still has setTierAssignments/budgets/comparisonMode; explicitSetIds ignored; recent turns include 4 entries',
  semanticAssessment:
    'JUnit report shows all 56 tests ran with 4 planned assertion failures in the newly rewritten query-only cases; regression cases 16e/16f passed on the old code, confirming they pin preserved behavior. No load or syntax faults.',
};
writeFileSync(`${base}/28-02-task2-red.json`, JSON.stringify(rec, null, 2));
console.log('wrote task2 red json');
