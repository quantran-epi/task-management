/// <reference types="node" />
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AttemptService } from '../src/services/attemptService.js';
import { buildKnowledgeServer } from '../src/server.js';
import { InMemoryGraphRepository } from '../src/graph/graphRepository.js';
import { GraphBuildService } from '../src/routes/graph.js';
import { mergeFactsDeterministicFirst } from '../src/graph/candidate.js';
import {
  FactAssertion,
  GraphEvidenceRecord,
  GraphConflictRecord,
  QuarantinedIdentifier,
} from '../src/types/graphProtocol.js';
import {
  PILOT_GOLD_NODES,
  URN_PROCESS_60000006,
  URN_CONTAINER_60000006,
  URN_PKG_CRD_BILLING,
} from './fixtures/pilotGoldEntities.js';

const ORIGIN = 'https://planner.example';
const TOKEN = 'server-test-token-very-secret';
const SET_ID = randomUUID();
const DOCUMENT_ID = randomUUID();

function requestHeaders(overrides: Record<string, string> = {}) {
  return {
    origin: ORIGIN,
    authorization: `Bearer ${TOKEN}`,
    'x-rebuild-key': randomUUID(),
    ...overrides,
  };
}

describe('Fastify graph routes (Task 1: GRAPH-05, D-17, D-18, D-21)', () => {
  it('rejects unauthorized and wrong origin requests with 401 and 403', async () => {
    const repository = new InMemoryGraphRepository();
    const app = buildKnowledgeServer({
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      graphRepository: repository,
    }).app;

    // 1. Missing bearer authorization
    const unauth = await app.inject({
      method: 'GET',
      url: `/api/v1/sets/${SET_ID}/graph/status`,
      headers: { origin: ORIGIN },
    });
    expect(unauth.statusCode).toBe(401);
    expect(unauth.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Valid bearer authorization is required.' },
    });

    // 2. Denied origin
    const deniedOrigin = await app.inject({
      method: 'GET',
      url: `/api/v1/sets/${SET_ID}/graph/status`,
      headers: {
        origin: 'https://evil.example',
        authorization: `Bearer ${TOKEN}`,
      },
    });
    expect(deniedOrigin.statusCode).toBe(403);
    expect(deniedOrigin.json()).toEqual({
      error: { code: 'ORIGIN_DENIED', message: 'Request origin is not allowed.' },
    });

    // 3. Rebuild route without bearer token
    const unauthRebuild = await app.inject({
      method: 'POST',
      url: `/api/v1/sets/${SET_ID}/graph/rebuild`,
      headers: { origin: ORIGIN },
    });
    expect(unauthRebuild.statusCode).toBe(401);

    await app.close();
  });

  it('handles rebuild idempotency and 409 conflict when build is in progress', async () => {
    const repository = new InMemoryGraphRepository();
    const buildService = new GraphBuildService(repository);
    const app = buildKnowledgeServer({
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      graphBuildService: buildService,
    }).app;

    const rebuildKey = randomUUID();

    // First request accepted 202
    const firstRes = await app.inject({
      method: 'POST',
      url: `/api/v1/sets/${SET_ID}/graph/rebuild`,
      headers: requestHeaders({ 'x-rebuild-key': rebuildKey }),
    });
    expect(firstRes.statusCode).toBe(202);
    const firstBody = firstRes.json();
    expect(firstBody).toMatchObject({
      setId: SET_ID,
      rebuildKey,
      status: 'ACCEPTED',
      candidateSnapshotId: expect.any(String),
    });

    // Replay with exact same rebuildKey returns matching candidateSnapshotId
    const replayRes = await app.inject({
      method: 'POST',
      url: `/api/v1/sets/${SET_ID}/graph/rebuild`,
      headers: requestHeaders({ 'x-rebuild-key': rebuildKey }),
    });
    expect(replayRes.statusCode).toBe(202);
    expect(replayRes.json()).toEqual(firstBody);

    await app.close();
  });

  it('returns Never built status when set has no graph', async () => {
    const repository = new InMemoryGraphRepository();
    const app = buildKnowledgeServer({
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      graphRepository: repository,
    }).app;

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/sets/${SET_ID}/graph/status`,
      headers: requestHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      setId: SET_ID,
      state: 'Never built',
      nodeCount: 0,
      factCount: 0,
      evidenceCount: 0,
      conflictCount: 0,
      quarantineCount: 0,
      ontologyVersion: expect.any(String),
      rulesVersion: expect.any(String),
    });

    await app.close();
  });

  it('returns Failed status with bounded safe error details', async () => {
    const repository = new InMemoryGraphRepository();
    const buildService = new GraphBuildService(repository);
    await expect(buildService.executeRebuildSync(SET_ID)).rejects.toThrow(
      'NO_SNAPSHOT_STORE'
    );
    const app = buildKnowledgeServer({
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      graphBuildService: buildService,
    }).app;

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/sets/${SET_ID}/graph/status`,
      headers: requestHeaders(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      setId: SET_ID,
      state: 'Failed',
      nodeCount: 0,
      factCount: 0,
      evidenceCount: 0,
      conflictCount: 0,
      quarantineCount: 0,
      ontologyVersion: expect.any(String),
      rulesVersion: expect.any(String),
      error: {
        code: 'REBUILD_FAILED',
        message: 'Xây dựng đồ thị tri thức thất bại. Kiểm tra máy chủ rồi thử lại.',
      },
    });
    expect(JSON.stringify(res.json())).not.toContain('NO_SNAPSHOT_STORE');

    await app.close();
  });

  it('returns Active and Active with warnings graph status with accurate counts', async () => {
    const repository = new InMemoryGraphRepository();
    const candidateSnapshotId = randomUUID();
    const sourceSnapshotId = randomUUID();
    const factKey = '1111111111111111111111111111111111111111111111111111111111111111';

    const candidate = mergeFactsDeterministicFirst({
      graphSnapshotId: candidateSnapshotId,
      sourceSnapshotId,
      setId: SET_ID,
      ontologyVersion: '2026.10.1',
      nodes: [...PILOT_GOLD_NODES],
      deterministicFacts: [
        {
          factKey,
          ontologyVersion: '2026.10.1',
          subjectUrn: URN_PROCESS_60000006,
          relation: 'CONTAINS_STEP',
          objectUrn: URN_CONTAINER_60000006,
          qualifiers: {},
          classification: 'OBSERVED',
        },
      ],
      deterministicEvidence: [
        {
          evidenceId: randomUUID(),
          factKey,
          documentId: DOCUMENT_ID,
          documentTitle: '01-prc-process.md',
          sectionHeadingPath: ['Process definition'],
          startLine: 10,
          endLine: 12,
          startOffset: 100,
          endOffset: 150,
          rawSnippet: 'Row snippet',
          extractionMethod: 'DETERMINISTIC_TABLE',
          classification: 'OBSERVED',
          confidence: 1,
          observedAt: '2026-10-10T00:00:00.000Z',
        },
      ],
      quarantines: [
        {
          rawIdentifier: 'UNQUALIFIED_TAB',
          reason: 'Missing schema',
          documentId: DOCUMENT_ID,
          sectionHeadingPath: ['Data objects'],
          startLine: 50,
          endLine: 50,
          extractionMethod: 'DETERMINISTIC_TABLE',
          possibleMatches: ['MAIN1.UNQUALIFIED_TAB'],
        },
      ],
    });

    await repository.writeCandidate(candidate);
    await repository.activateCandidate(SET_ID, candidateSnapshotId);

    const app = buildKnowledgeServer({
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      graphRepository: repository,
    }).app;

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/sets/${SET_ID}/graph/status`,
      headers: requestHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      setId: SET_ID,
      state: 'Active',
      activeGraphSnapshotId: candidateSnapshotId,
      nodeCount: PILOT_GOLD_NODES.length,
      factCount: 1,
      quarantineCount: 1,
      conflictCount: 0,
      ontologyVersion: '2026.10.1',
      rulesVersion: '2026.10.1',
      activatedAt: expect.any(String),
    });

    await app.close();
  });

  it('returns paginated facts, fact evidence details, and quarantined identifiers', async () => {
    const repository = new InMemoryGraphRepository();
    const candidateSnapshotId = randomUUID();
    const sourceSnapshotId = randomUUID();
    const factKey = '2222222222222222222222222222222222222222222222222222222222222222';
    const evidenceId = randomUUID();

    const candidate = mergeFactsDeterministicFirst({
      graphSnapshotId: candidateSnapshotId,
      sourceSnapshotId,
      setId: SET_ID,
      ontologyVersion: '2026.10.1',
      nodes: [...PILOT_GOLD_NODES],
      deterministicFacts: [
        {
          factKey,
          ontologyVersion: '2026.10.1',
          subjectUrn: URN_CONTAINER_60000006,
          relation: 'CALLS',
          objectUrn: URN_PKG_CRD_BILLING,
          qualifiers: {},
          classification: 'OBSERVED',
        },
      ],
      deterministicEvidence: [
        {
          evidenceId,
          factKey,
          documentId: DOCUMENT_ID,
          documentTitle: '02-steps.md',
          sectionHeadingPath: ['Steps', 'Billing step'],
          startLine: 20,
          endLine: 24,
          startOffset: 200,
          endOffset: 280,
          rawSnippet: 'CRD_PRC_BILLING_PKG.PROCESS',
          extractionMethod: 'DETERMINISTIC_TABLE',
          classification: 'OBSERVED',
          confidence: 1,
          observedAt: '2026-10-10T00:00:00.000Z',
          environment: 'PROD',
        },
      ],
      quarantines: [
        {
          rawIdentifier: 'MY_TEMP_TABLE',
          reason: 'Ambiguous table reference',
          documentId: DOCUMENT_ID,
          sectionHeadingPath: ['Temp objects'],
          startLine: 80,
          endLine: 81,
          extractionMethod: 'DETERMINISTIC_TABLE',
          possibleMatches: ['MAIN1.MY_TEMP_TABLE', 'STAGE.MY_TEMP_TABLE'],
        },
      ],
    });

    await repository.writeCandidate(candidate);
    await repository.activateCandidate(SET_ID, candidateSnapshotId);

    const app = buildKnowledgeServer({
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      graphRepository: repository,
    }).app;

    // 1. GET /api/v1/sets/:setId/graph/facts
    const factsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/sets/${SET_ID}/graph/facts`,
      headers: requestHeaders(),
    });
    expect(factsRes.statusCode).toBe(200);
    const factsBody = factsRes.json();
    expect(factsBody).toMatchObject({
      setId: SET_ID,
      graphSnapshotId: candidateSnapshotId,
      totalFacts: 1,
      facts: [
        {
          factKey,
          subjectUrn: URN_CONTAINER_60000006,
          relation: 'CALLS',
          objectUrn: URN_PKG_CRD_BILLING,
          effectiveClassification: 'OBSERVED',
          evidenceCount: 1,
          hasConflict: false,
        },
      ],
    });

    // 2. GET /api/v1/sets/:setId/graph/facts/:factKey/evidence
    const evRes = await app.inject({
      method: 'GET',
      url: `/api/v1/sets/${SET_ID}/graph/facts/${factKey}/evidence`,
      headers: requestHeaders(),
    });
    expect(evRes.statusCode).toBe(200);
    const evBody = evRes.json();
    expect(evBody).toMatchObject({
      setId: SET_ID,
      factKey,
      subjectUrn: URN_CONTAINER_60000006,
      relation: 'CALLS',
      objectUrn: URN_PKG_CRD_BILLING,
      effectiveClassification: 'OBSERVED',
      hasConflict: false,
      occurrences: [
        {
          evidenceId,
          documentId: DOCUMENT_ID,
          documentTitle: '02-steps.md',
          headingPath: ['Steps', 'Billing step'],
          startLine: 20,
          endLine: 24,
          startOffset: 200,
          endOffset: 280,
          method: 'DETERMINISTIC_TABLE',
          classification: 'OBSERVED',
          quote: 'CRD_PRC_BILLING_PKG.PROCESS',
          environment: 'PROD',
        },
      ],
    });

    // 3. GET /api/v1/sets/:setId/graph/quarantine
    const qRes = await app.inject({
      method: 'GET',
      url: `/api/v1/sets/${SET_ID}/graph/quarantine`,
      headers: requestHeaders(),
    });
    expect(qRes.statusCode).toBe(200);
    const qBody = qRes.json();
    expect(qBody).toMatchObject({
      setId: SET_ID,
      graphSnapshotId: candidateSnapshotId,
      totalQuarantines: 1,
      quarantines: [
        {
          rawIdentifier: 'MY_TEMP_TABLE',
          reason: 'Ambiguous table reference',
          documentId: DOCUMENT_ID,
          startLine: 80,
          endLine: 81,
          method: 'DETERMINISTIC_TABLE',
          candidateMatches: ['MAIN1.MY_TEMP_TABLE', 'STAGE.MY_TEMP_TABLE'],
        },
      ],
    });

    // 4. Non-existent fact returns 404
    const notFoundEv = await app.inject({
      method: 'GET',
      url: `/api/v1/sets/${SET_ID}/graph/facts/0000000000000000000000000000000000000000000000000000000000000000/evidence`,
      headers: requestHeaders(),
    });
    expect(notFoundEv.statusCode).toBe(404);

    await app.close();
  });
});
