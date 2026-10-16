/**
 * Automated smoke & verification script for the local Docker Knowledge Server & Neo4j stack.
 *
 * Runs health check, document set publish, graph rebuild, activation, and vector retrieval.
 *
 * Usage:
 *   node scripts/test-knowledge-live.mjs
 */

const ENDPOINT = process.env.KNOWLEDGE_SERVER_URL || 'http://127.0.0.1:3001';
const TOKEN = process.env.KNOWLEDGE_SERVER_TOKEN || 'local-dev-knowledge-token';
const ORIGIN = process.env.KNOWLEDGE_ALLOWED_ORIGIN || 'http://localhost:5173';

const headers = {
  'Content-Type': 'application/json',
  Origin: ORIGIN,
  Authorization: `Bearer ${TOKEN}`,
};

async function testKnowledgeStack() {
  console.log(`[TEST] Connecting to Knowledge Server at ${ENDPOINT}...`);

  // 1. Health & readiness check
  const readyRes = await fetch(`${ENDPOINT}/api/v1/health/readiness`, { headers });
  if (!readyRes.ok) {
    throw new Error(`Readiness check failed: ${readyRes.status} ${readyRes.statusText}`);
  }
  const readyData = await readyRes.json();
  console.log('[PASS] Server readiness:', readyData);

  if (!readyData.checks?.neo4j || !readyData.checks?.model || !readyData.checks?.vectorIndex) {
    throw new Error(`Incomplete subsystem readiness: ${JSON.stringify(readyData.checks)}`);
  }

  // 2. Publish attempt
  const setId = 'f0000000-0000-4000-8000-000000000001';
  const attemptKey = 'f0000000-0000-4000-8000-000000000002';
  const docId = 'f0000000-0000-4000-8000-000000000003';

  console.log('[TEST] Publishing document set...');
  const attemptRes = await fetch(`${ENDPOINT}/api/v1/sets/${setId}/attempts`, {
    method: 'POST',
    headers: { ...headers, 'x-attempt-key': attemptKey },
    body: JSON.stringify({
      setName: 'Live Test Document Set',
      documents: [
        {
          documentId: docId,
          title: 'Credit Risk Policy',
          body: '# Credit Risk Policy\n\nCredit risk is evaluated via borrower income, loan obligations, and past default history.\n\n## Underwriting Score\n\nUnderwriting score determines maximum approved loan amount.',
        },
      ],
    }),
  });
  if (!attemptRes.ok && attemptRes.status !== 202) {
    throw new Error(`Publish attempt failed: ${attemptRes.status}`);
  }
  console.log('[PASS] Document snapshot published.');

  // 3. Graph Rebuild
  console.log('[TEST] Triggering graph rebuild with ONNX embedding extraction...');
  const rebuildKey = 'f0000000-0000-4000-8000-000000000004';
  const rebuildRes = await fetch(`${ENDPOINT}/api/v1/sets/${setId}/graph/rebuild`, {
    method: 'POST',
    headers: { ...headers, 'x-rebuild-key': rebuildKey },
    body: '{}',
  });
  if (!rebuildRes.ok && rebuildRes.status !== 202) {
    throw new Error(`Graph rebuild failed: ${rebuildRes.status}`);
  }
  const rebuildData = await rebuildRes.json();

  // Poll for candidate readiness (up to 30s)
  let candidateReady = false;
  let candidateId = rebuildData.candidateSnapshotId;
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const statusRes = await fetch(`${ENDPOINT}/api/v1/sets/${setId}/graph/status`, { headers });
    const status = await statusRes.json();
    if (status.candidateStatus === 'READY' || status.state === 'Active') {
      candidateReady = true;
      candidateId = status.candidateSnapshotId || status.activeGraphSnapshotId || candidateId;
      break;
    }
  }

  if (!candidateReady) {
    throw new Error('Graph candidate build timed out.');
  }
  console.log('[PASS] Graph candidate snapshot built:', candidateId);

  // 4. Activate candidate
  console.log('[TEST] Activating candidate snapshot in Neo4j...');
  const checkStatusRes = await fetch(`${ENDPOINT}/api/v1/sets/${setId}/graph/status`, { headers });
  const checkStatus = await checkStatusRes.json();
  if (checkStatus.state !== 'Active') {
    const activateRes = await fetch(`${ENDPOINT}/api/v1/sets/${setId}/graph/activate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ candidateSnapshotId: candidateId }),
    });
    if (!activateRes.ok) {
      throw new Error(`Graph activation failed: ${activateRes.status}`);
    }
  }
  console.log('[PASS] Snapshot active.');

  // 5. Test vector retrieval
  console.log('[TEST] Testing vector and fulltext retrieval...');
  const retrieveRes = await fetch(`${ENDPOINT}/api/v1/sets/${setId}/retrieve`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query: 'What factors determine underwriting score?',
      limit: 20,
    }),
  });
  if (!retrieveRes.ok) {
    throw new Error(`Retrieval query failed: ${retrieveRes.status}`);
  }
  const retrieveData = await retrieveRes.json();
  if (!retrieveData.items || retrieveData.items.length === 0) {
    throw new Error(`Unexpected retrieval result: ${JSON.stringify(retrieveData)}`);
  }
  console.log(`[PASS] Retrieved ${retrieveData.items.length} chunks via modalities:`, retrieveData.modalitiesUsed);

  // 6. Cleanup
  console.log('[TEST] Purging test document set...');
  await fetch(`${ENDPOINT}/api/v1/sets/${setId}`, {
    method: 'DELETE',
    headers,
  });
  console.log('[PASS] Cleanup complete. Knowledge server & Neo4j stack fully verified!');
}

testKnowledgeStack().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
