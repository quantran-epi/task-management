import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { InMemoryGraphRepository } from '../src/graph/graphRepository.js';
import { GraphBuildService } from '../src/routes/graph.js';
import { mergeFactsDeterministicFirst } from '../src/graph/candidate.js';
import { buildUrn } from '../src/graph/identity.js';
import { GraphNode } from '../src/types/graphProtocol.js';

describe('GraphBuildService entity fidelity & Vietnamese canonical names (ENTITY-FIDELITY-01)', () => {
  it('preserves true Vietnamese canonicalName on FactSummaryDTO without URN slice mutilation', async () => {
    const repository = new InMemoryGraphRepository();
    const service = new GraphBuildService({
      repository,
      snapshotStore: {
        getApprovals: () => [],
        getActiveSnapshot: () => ({ snapshotId: 'source-1' } as any),
      } as any,
    });

    const setId = randomUUID();
    const candidateSnapshotId = randomUUID();
    const sourceSnapshotId = randomUUID();

    const vietnameseStepName = 'Xử lý merchant bị từ chối (Bước 20)';
    const vietnameseTargetName = 'Tài khoản thanh toán trung gian';

    const subjectUrn = buildUrn('system', 'ProcessStep', vietnameseStepName);
    const objectUrn = buildUrn('system', 'DatabaseObject', vietnameseTargetName);

    const nodes: GraphNode[] = [
      {
        urn: subjectUrn,
        kind: 'ProcessStep',
        canonicalName: vietnameseStepName,
        sourceSystem: 'system',
        nativeType: 'ProcessStep',
        normalizedKey: 'Xu_ly_merchant_bi_tu_choi_Buoc_20',
        properties: {},
        aliases: [],
      },
      {
        urn: objectUrn,
        kind: 'DatabaseObject',
        canonicalName: vietnameseTargetName,
        sourceSystem: 'system',
        nativeType: 'DatabaseObject',
        normalizedKey: 'Tai_khoan_thanh_toan_trung_gian',
        properties: {},
        aliases: [],
      },
    ];

    const factKey = '3333333333333333333333333333333333333333333333333333333333333333';
    const candidate = mergeFactsDeterministicFirst({
      graphSnapshotId: candidateSnapshotId,
      sourceSnapshotId,
      setId,
      ontologyVersion: '2026.10.1',
      nodes,
      deterministicFacts: [
        {
          factKey,
          ontologyVersion: '2026.10.1',
          subjectUrn,
          relation: 'WRITES_TO',
          objectUrn,
          qualifiers: { operation: 'INSERT' },
          classification: 'OBSERVED',
        },
      ],
      deterministicEvidence: [],
      quarantines: [],
    });

    await repository.writeCandidate(candidate);
    await repository.activateCandidate(setId, candidateSnapshotId);

    const result = await service.getFacts(setId);

    expect(result.totalFacts).toBe(1);
    const fact = result.facts[0]!;
    expect(fact.subjectName).toBe(vietnameseStepName);
    expect(fact.subjectKind).toBe('ProcessStep');
    expect(fact.objectName).toBe(vietnameseTargetName);
    expect(fact.objectKind).toBe('DatabaseObject');
  });

  it('falls back gracefully to relation URN and "Entity" kind when node is not found', async () => {
    const repository = new InMemoryGraphRepository();
    const service = new GraphBuildService({
      repository,
      snapshotStore: {
        getApprovals: () => [],
        getActiveSnapshot: () => ({ snapshotId: 'source-fallback' } as any),
      } as any,
    });

    const setId = randomUUID();
    const candidateSnapshotId = randomUUID();
    const sourceSnapshotId = randomUUID();

    const subjectUrn = 'urn:plannermate:unknown:Entity:orphan_sub';
    const objectUrn = 'urn:plannermate:unknown:Entity:orphan_obj';
    const factKey = '4444444444444444444444444444444444444444444444444444444444444444';

    const candidate = mergeFactsDeterministicFirst({
      graphSnapshotId: candidateSnapshotId,
      sourceSnapshotId,
      setId,
      ontologyVersion: '2026.10.1',
      nodes: [],
      deterministicFacts: [
        {
          factKey,
          ontologyVersion: '2026.10.1',
          subjectUrn,
          relation: 'CALLS',
          objectUrn,
          qualifiers: {},
          classification: 'OBSERVED',
        },
      ],
      deterministicEvidence: [],
      quarantines: [],
    });

    await repository.writeCandidate(candidate);
    await repository.activateCandidate(setId, candidateSnapshotId);

    const result = await service.getFacts(setId);

    expect(result.totalFacts).toBe(1);
    const fact = result.facts[0]!;
    expect(fact.subjectName).toBe(subjectUrn);
    expect(fact.subjectKind).toBe('Entity');
    expect(fact.objectName).toBe(objectUrn);
    expect(fact.objectKind).toBe('Entity');
  });
});
