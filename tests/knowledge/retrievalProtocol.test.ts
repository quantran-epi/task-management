import { describe, it, expect } from 'vitest';
import {
  FederatedRetrievalBudgetsSchema,
  FederatedRetrievalResponseSchema,
  ModalityStatusDetailSchema,
  RetrievalResponseSchema,
  TraversalStepSchema,
} from '../../src/services/knowledge/retrievalProtocol';

describe('FederatedRetrievalBudgetsSchema validation', () => {
  it('accepts elapsedMs up to 300,000 ms (5 minutes)', () => {
    const valid = FederatedRetrievalBudgetsSchema.safeParse({
      concurrency: 4,
      elapsedMs: 300_000,
      maxSets: 10,
      maxItems: 50,
      maxEvidenceChars: 30_000,
    });
    expect(valid.success).toBe(true);
  });

  it('rejects elapsedMs exceeding 300,000 ms', () => {
    const invalid = FederatedRetrievalBudgetsSchema.safeParse({
      concurrency: 4,
      elapsedMs: 300_001,
      maxSets: 10,
      maxItems: 50,
      maxEvidenceChars: 30_000,
    });
    expect(invalid.success).toBe(false);
  });

  it('rejects elapsedMs below 100 ms', () => {
    const invalid = FederatedRetrievalBudgetsSchema.safeParse({
      concurrency: 4,
      elapsedMs: 99,
      maxSets: 10,
      maxItems: 50,
      maxEvidenceChars: 30_000,
    });
    expect(invalid.success).toBe(false);
  });
});

const SNAPSHOT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const SEED_URN = 'urn:plannermate:oracle:DatabaseObject:MAIN1.EVT_EVENT';

const provider = {
  provider: 'local-onnx',
  model: 'multilingual-e5-small',
  revision: '1',
  dimensions: 384,
  policyVersion: 'v1',
};

const modalityStatus = {
  fulltext: { status: 'ok', latencyMs: 1, itemCount: 0 },
  vector: { status: 'ok', latencyMs: 1, itemCount: 0 },
  graph: {
    status: 'ok',
    latencyMs: 2,
    itemCount: 1,
    entityCount: 1,
    edgeCount: 0,
    pathCount: 0,
  },
};

const planTrace = { fastPath: true };

const seedEntity = {
  type: 'entity',
  id: SEED_URN,
  score: 1,
  modalitiesContributed: ['graph'],
  urn: SEED_URN,
  canonicalName: 'EVT_EVENT',
  kind: 'DatabaseObject',
  snapshotId: SNAPSHOT_ID,
  hasConflict: false,
};

describe('client traversal depth parsing', () => {
  it('parses a depth-5 step and rejects depth 0', () => {
    expect(
      TraversalStepSchema.safeParse({ relationType: 'READS_FROM', maxHops: 5 }).success
    ).toBe(true);
    expect(
      TraversalStepSchema.safeParse({ relationType: 'READS_FROM', maxHops: 0 }).success
    ).toBe(false);
  });
});

describe('client modality status counts', () => {
  it('accepts entity/edge/path counts and rejects negatives', () => {
    expect(
      ModalityStatusDetailSchema.safeParse({
        status: 'ok',
        latencyMs: 1,
        itemCount: 1,
        entityCount: 1,
        edgeCount: 0,
        pathCount: 0,
      }).success
    ).toBe(true);
    expect(
      ModalityStatusDetailSchema.safeParse({
        status: 'ok',
        latencyMs: 1,
        itemCount: 1,
        entityCount: -1,
      }).success
    ).toBe(false);
  });
});

describe('client SEED_ONLY invariant', () => {
  const seedOnly = {
    outcome: 'SEED_ONLY',
    snapshotId: SNAPSHOT_ID,
    embeddingProvider: provider,
    items: [seedEntity],
    totalCandidates: 1,
    modalitiesUsed: ['graph'],
    modalityStatus,
    diagnostics: { degraded: false },
    planTrace,
    reason: 'SEED_FOUND_NO_RELATION',
  };

  it('accepts a valid seed-only response', () => {
    expect(RetrievalResponseSchema.safeParse(seedOnly).success).toBe(true);
  });

  it('rejects missing entity, paths, conflicts, or wrong reason', () => {
    expect(RetrievalResponseSchema.safeParse({ ...seedOnly, items: [] }).success).toBe(false);
    expect(RetrievalResponseSchema.safeParse({ ...seedOnly, reason: 'NO_MATCHING' }).success).toBe(
      false
    );
    expect(
      RetrievalResponseSchema.safeParse({
        ...seedOnly,
        conflictGroups: [
          { conflictGroupId: 'g1', dimension: 'Unknown', scopeProof: null },
        ],
      }).success
    ).toBe(false);
  });
});

describe('client federated diagnostics', () => {
  const base = {
    outcome: 'READY',
    items: [],
    paths: [],
    conflictGroups: [],
    modalityStatus,
    diagnostics: {
      degraded: false,
      coverageWarnings: [],
    },
  };

  const stageRow = {
    stage: 'fusion',
    status: 'ok',
    latencyMs: 4,
    accepted: 3,
    rejected: 1,
    truncated: false,
    fallback: true,
    fallbackReason: 'FALLBACK_ONE_HOP',
    reasonCodes: ['FALLBACK_ONE_HOP'],
  };

  it('accepts stage diagnostics and failed seeds', () => {
    const parsed = FederatedRetrievalResponseSchema.safeParse({
      ...base,
      diagnostics: {
        ...base.diagnostics,
        stageDiagnostics: [stageRow],
        failedSeeds: [{ urn: 'urn:plannermate:oracle:DatabaseObject:MISSING', reasonCode: 'SEED_NOT_FOUND' }],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects unknown keys inside a stage row', () => {
    const parsed = FederatedRetrievalResponseSchema.safeParse({
      ...base,
      diagnostics: {
        ...base.diagnostics,
        stageDiagnostics: [{ ...stageRow, message: 'raw query leaked' }],
      },
    });
    expect(parsed.success).toBe(false);
  });

  it('still parses a federated response without the optional diagnostic keys', () => {
    expect(FederatedRetrievalResponseSchema.safeParse(base).success).toBe(true);
  });
});
