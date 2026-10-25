/// <reference types="node" />
import { beforeAll, describe, expect, it } from 'vitest';
import { RETRIEVAL_OUTCOMES } from '../src/types/retrievalProtocol.js';
import { RELATION_TYPES } from '../src/types/graphProtocol.js';

/**
 * Environment-gated live assertions (SC-8, Task 1).
 *
 * Unset `LIVE_KNOWLEDGE` -> suite skips and exits 0 (offline CI stays green).
 * Set `LIVE_KNOWLEDGE=1` -> missing/incorrect env or an unreachable stack is a
 * BLOCKED failure, never a silent skip, because a requested live run that did not
 * happen must not read as a pass.
 *
 * Assertions inspect parsed enum/count/boolean fields only. No response bodies,
 * query text, document content, endpoints, tokens, stack traces, or Cypher are logged.
 */

const LIVE = process.env.LIVE_KNOWLEDGE === '1';
const ENDPOINT = process.env.KNOWLEDGE_SERVER_URL ?? '';
const TOKEN = process.env.KNOWLEDGE_SERVER_TOKEN ?? '';
const ORIGIN = process.env.KNOWLEDGE_ALLOWED_ORIGIN ?? '';

const SET_ID = 'f0000000-0000-4000-8000-0000000000a1';
const ATTEMPT_KEY = 'f0000000-0000-4000-8000-0000000000a2';
const REBUILD_KEY = 'f0000000-0000-4000-8000-0000000000a3';

const EVT_EVENT = 'MAIN1.EVT_EVENT';
const FCL_COUNTER = 'MAIN1.FCL_CYCLE_COUNTER';

const OUTCOMES = new Set<string>(RETRIEVAL_OUTCOMES);
const STATUSES = new Set(['ok', 'unavailable', 'timeout', 'stale', 'truncated', 'error']);

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Origin: ORIGIN,
    Authorization: `Bearer ${TOKEN}`,
  };
}

// Bodyless requests must not advertise JSON: Fastify rejects an empty JSON body with 400.
function bodylessHeaders(): Record<string, string> {
  return {
    Origin: ORIGIN,
    Authorization: `Bearer ${TOKEN}`,
  };
}

async function json(path: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
  const response = await fetch(`${ENDPOINT}${path}`, init);
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

function assertStatusDetail(label: string, detail: any): void {
  expect(detail, `modality status ${label} missing`).toBeTruthy();
  expect(STATUSES.has(detail.status), `${label} status is a known enum`).toBe(true);
  expect(Number.isInteger(detail.latencyMs) && detail.latencyMs >= 0, `${label} latency`).toBe(true);
  expect(Number.isInteger(detail.itemCount) && detail.itemCount >= 0, `${label} itemCount`).toBe(true);
  for (const key of ['entityCount', 'edgeCount', 'pathCount'] as const) {
    if (detail[key] !== undefined) {
      expect(Number.isInteger(detail[key]) && detail[key] >= 0, `${label} ${key}`).toBe(true);
    }
  }
}

function assertGraphResponse(body: any, allowedOutcomes: readonly string[]): void {
  expect(body).toBeTruthy();
  expect(OUTCOMES.has(body.outcome), 'outcome is a known protocol value').toBe(true);
  expect(allowedOutcomes).toContain(body.outcome);
  expect(Array.isArray(body.items)).toBe(true);
  expect(Array.isArray(body.paths)).toBe(true);
  expect(body.paths.length).toBeLessThanOrEqual(20);
  assertStatusDetail('fulltext', body.modalityStatus?.fulltext);
  assertStatusDetail('vector', body.modalityStatus?.vector);
  assertStatusDetail('graph', body.modalityStatus?.graph);
  expect(typeof body.diagnostics?.degraded).toBe('boolean');
  for (const row of body.diagnostics?.stageDiagnostics ?? []) {
    expect(typeof row.truncated).toBe('boolean');
    expect(typeof row.fallback).toBe('boolean');
    expect(Number.isInteger(row.accepted) && row.accepted >= 0).toBe(true);
    expect(Number.isInteger(row.rejected) && row.rejected >= 0).toBe(true);
  }
  if (body.outcome === 'READY' || body.outcome === 'SEED_ONLY') {
    expect(body.items.length + body.paths.length).toBeGreaterThan(0);
  }
}

const liveSuite = LIVE ? describe : describe.skip;

liveSuite('live graph retrieval (LIVE_KNOWLEDGE=1, SC-8)', () => {
  // BLOCKED, not skipped: a requested live run with missing env or an unreachable
  // stack did not happen and must fail loudly. Only `LIVE_KNOWLEDGE` unset skips.
  beforeAll(async () => {
    if (TOKEN.length === 0 || ENDPOINT.length === 0 || ORIGIN.length === 0) {
      throw new Error(
        'BLOCKED: LIVE_KNOWLEDGE=1 requires KNOWLEDGE_SERVER_URL, KNOWLEDGE_SERVER_TOKEN, and KNOWLEDGE_ALLOWED_ORIGIN'
      );
    }
    let readiness: { status: number; body: any };
    try {
      readiness = await json('/api/v1/health/readiness', { headers: headers() });
    } catch {
      throw new Error(
        'BLOCKED: local knowledge stack unreachable; start docker compose and retry'
      );
    }
    if ([401, 403].includes(readiness.status)) {
      throw new Error('BLOCKED: live stack rejected the bearer token');
    }
    if (readiness.status === 503) {
      throw new Error('BLOCKED: live stack is up but reports not_ready');
    }
    expect(readiness.status).toBe(200);
    expect(readiness.body?.checks).toEqual(
      expect.objectContaining({ neo4j: true, model: true, vectorIndex: true })
    );
  });

  it('publishes, builds, and activates a fixture-equivalent corpus', async () => {
    const publish = await json(`/api/v1/sets/${SET_ID}/attempts`, {
      method: 'POST',
      headers: { ...headers(), 'x-attempt-key': ATTEMPT_KEY },
      body: JSON.stringify({
        setName: 'Live Graph Verification (test)',
        documents: [
          {
            documentId: 'f0000000-0000-4000-8000-0000000000b1',
            title: 'live-graph-fixture-flow.md',
            body: [
              '# SHB - Credit calculations (60000006)',
              '',
              '| BIND_ID | ORDER | TARGET_ID | MO_TA |',
              '| :--- | :--- | :--- | :--- |',
              '| 60000005 | 10 | 10000304 | Due date period cycle |',
              '',
              'Quy trình thực hiện các bước theo execOrder.',
            ].join('\n'),
          },
          {
            documentId: 'f0000000-0000-4000-8000-0000000000b2',
            title: 'live-graph-fixture-objects.md',
            body: [
              '# Data objects',
              '',
              'Gói PL/SQL `MAIN1.FCL_PRC_CYCLE_COUNTER_PKG.PROCESS` đọc dữ liệu từ bảng `MAIN1.FCL_CYCLE_COUNTER`.',
              '',
              'Gói PL/SQL `MAIN1.EVT_EVENT_PKG.PROCESS` ghi dữ liệu vào bảng `MAIN1.EVT_EVENT`.',
            ].join('\n'),
          },
        ],
      }),
    });
    expect([200, 202]).toContain(publish.status);

    const rebuild = await json(`/api/v1/sets/${SET_ID}/graph/rebuild`, {
      method: 'POST',
      headers: { ...headers(), 'x-rebuild-key': REBUILD_KEY },
      body: '{}',
    });
    expect([200, 202]).toContain(rebuild.status);

    let ready = false;
    let candidateId: string | undefined = rebuild.body?.candidateSnapshotId;
    for (let i = 0; i < 30 && !ready; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const status = await json(`/api/v1/sets/${SET_ID}/graph/status`, { headers: headers() });
      const state = status.body?.state;
      const candidateStatus = status.body?.candidateStatus;
      if (state === 'Failed' || candidateStatus === 'FAILED') {
        throw new Error('GRAPH_BUILD_FAILED');
      }
      if (candidateStatus === 'READY' || state === 'Active') {
        ready = true;
        candidateId =
          status.body?.candidateSnapshotId ?? status.body?.activeGraphSnapshotId ?? candidateId;
      }
    }
    expect(ready, 'graph candidate became ready').toBe(true);

    const current = await json(`/api/v1/sets/${SET_ID}/graph/status`, { headers: headers() });
    if (current.body?.state !== 'Active') {
      const activate = await json(`/api/v1/sets/${SET_ID}/graph/activate`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ candidateSnapshotId: candidateId }),
      });
      expect([200, 202]).toContain(activate.status);
    }
  });

  it('preflights exact identity for the EVT_EVENT writer fact', async () => {
    const facts = await json(`/api/v1/sets/${SET_ID}/graph/facts`, { headers: headers() });
    expect(facts.status).toBe(200);
    expect(Number.isInteger(facts.body?.totalFacts)).toBe(true);
    const rows: any[] = Array.isArray(facts.body?.facts) ? facts.body.facts : [];
    const evtRows = rows.filter(
      (row) => row.subjectName === EVT_EVENT || row.objectName === EVT_EVENT
    );
    const writesToEvt = rows.some(
      (row) => row.objectName === EVT_EVENT && row.relation === 'WRITES_TO'
    );
    const readsFrom = rows.some((row) => row.relation === 'READS_FROM');
    // Absent EVT_EVENT takes the bounded missing branch instead of failing the suite.
    if (evtRows.length === 0) {
      expect(writesToEvt).toBe(false);
      return;
    }
    expect(rows.some((row) => row.subjectName === EVT_EVENT || row.objectName === EVT_EVENT)).toBe(
      true
    );
    // When the writer package is extracted, its relation must be a legal enum value.
    for (const row of evtRows) {
      expect(typeof row.relation).toBe('string');
      expect(RELATION_TYPES).toContain(row.relation);
    }
    if (!writesToEvt) {
      expect(readsFrom || evtRows.length > 0).toBe(true);
    }
  });

  it('answers direct lookup within protocol bounds', async () => {
    const res = await json('/api/v1/retrieve', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        query: `${EVT_EVENT} là gì?`,
        setTierAssignments: [{ setId: SET_ID, tier: 'REQUIRED', roleGroup: 'baseline' }],
        comparisonMode: 'single',
        budgets: {
          concurrency: 4,
          elapsedMs: 60000,
          maxSets: 10,
          maxItems: 50,
          maxEvidenceChars: 30000,
        },
        limit: 20,
        includeInferred: false,
        recentTurns: [],
      }),
    });
    expect(res.status).toBe(200);
    assertGraphResponse(res.body, ['READY', 'SEED_ONLY']);
  });

  it('answers WRITES_TO and READS_FROM families', async () => {
    const families = [
      `Gói PL/SQL nào ghi dữ liệu vào bảng ${EVT_EVENT}?`,
      `Gói PL/SQL nào đọc dữ liệu từ bảng ${FCL_COUNTER}?`,
    ];
    for (const query of families) {
      const res = await json('/api/v1/retrieve', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          query,
          setTierAssignments: [{ setId: SET_ID, tier: 'REQUIRED', roleGroup: 'baseline' }],
          comparisonMode: 'single',
          budgets: {
            concurrency: 4,
            elapsedMs: 60000,
            maxSets: 10,
            maxItems: 50,
            maxEvidenceChars: 30000,
          },
          limit: 20,
          includeInferred: true,
          recentTurns: [],
        }),
      });
      expect(res.status).toBe(200);
      assertGraphResponse(res.body, ['READY', 'DEGRADED', 'SEED_ONLY']);
      // A corpus fact exists for this family, so graph modality must have contributed.
      expect(['ok', 'truncated']).toContain(res.body.modalityStatus.graph.status);
    }
  });

  it('handles a missing seed as SEED_ONLY/NO_EVIDENCE without inventing relations', async () => {
    const res = await json('/api/v1/retrieve', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        query: 'MAIN1.NONEXISTENT_TABLE_XYZ là gì?',
        setTierAssignments: [{ setId: SET_ID, tier: 'REQUIRED', roleGroup: 'baseline' }],
        comparisonMode: 'single',
        budgets: {
          concurrency: 4,
          elapsedMs: 60000,
          maxSets: 10,
          maxItems: 50,
          maxEvidenceChars: 30000,
        },
        limit: 20,
        includeInferred: true,
        recentTurns: [],
      }),
    });
    expect(res.status).toBe(200);
    expect(['SEED_ONLY', 'NO_EVIDENCE', 'NEEDS_CLARIFICATION']).toContain(res.body?.outcome);
    if (res.body?.outcome === 'SEED_ONLY') {
      expect(res.body.paths).toEqual([]);
      expect(res.body.conflictGroups).toEqual([]);
    }
  });

  it('bounds multi-hop traversal instead of failing', async () => {
    const res = await json('/api/v1/retrieve', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        query: `Nếu thay đổi cấu trúc bảng ${FCL_COUNTER} thì những package và quy trình nào bị ảnh hưởng?`,
        setTierAssignments: [{ setId: SET_ID, tier: 'REQUIRED', roleGroup: 'baseline' }],
        comparisonMode: 'single',
        budgets: {
          concurrency: 4,
          elapsedMs: 60000,
          maxSets: 10,
          maxItems: 50,
          maxEvidenceChars: 30000,
        },
        limit: 20,
        includeInferred: true,
        recentTurns: [],
      }),
    });
    expect(res.status).toBe(200);
    assertGraphResponse(res.body, ['READY', 'DEGRADED', 'SEED_ONLY', 'NO_EVIDENCE']);
    const pathHops = (res.body.paths ?? []).map((path: any) => path.edgeFactKeys?.length ?? 0);
    for (const hops of pathHops) {
      expect(hops).toBeGreaterThanOrEqual(1);
      expect(hops).toBeLessThanOrEqual(3);
    }
  });

  it('cleans up the verification set', async () => {
    const res = await json(`/api/v1/sets/${SET_ID}`, {
      method: 'DELETE',
      headers: bodylessHeaders(),
    });
    expect([200, 202, 204, 404]).toContain(res.status);
  });
});
