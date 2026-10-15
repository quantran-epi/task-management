import { describe, expect, it } from 'vitest';
import { InMemoryGraphRepository } from '../src/graph/graphRepository.js';
import { SnapshotStore } from '../src/indexing/snapshotStore.js';
import { GraphBuildService } from '../src/services/graphBuildService.js';
import { executeCanaryLifecycle, runDiscoveryBaseline } from '../src/acceptance/canaryService.js';
import { runLiveRetrievalMatrix, LIVE_SCENARIOS, runDurabilityCheck } from '../src/acceptance/realDataAcceptance.js';
import type { RetrievalResponse } from '../src/types/retrievalProtocol.js';

describe('Real Data Acceptance & Canary Lifecycle', () => {
  it('runDiscoveryBaseline audits repository metadata without leaking secrets', async () => {
    const repo = new InMemoryGraphRepository();
    const setId = '11111111-1111-4111-8111-111111111111';
    const baseline = await runDiscoveryBaseline(setId, repo);

    expect(baseline.setId).toBe(setId);
    expect(baseline.constraintsCount).toBe(7);
    expect(baseline.vectorDimensions).toBe(384);
    expect(baseline.nodeCount).toBe(0);

    const serialized = JSON.stringify(baseline);
    expect(serialized).not.toMatch(/password|secret|bearer|token/i);
  });

  it('executeCanaryLifecycle executes prepare -> verify -> activate -> rollback -> reactivate on isolated set', async () => {
    const repo = new InMemoryGraphRepository();
    const snapshotStore = new SnapshotStore();
    const buildService = new GraphBuildService({ repository: repo, snapshotStore });

    const sourceSetId = '22222222-2222-4222-8222-222222222222';
    const sourceSnapshotId = 'snap_source_001';

    // Seed production snapshot
    snapshotStore.registerActiveSnapshot(sourceSetId, {
      snapshotId: sourceSnapshotId,
      setId: sourceSetId,
      chunkingPolicyVersion: 'v1',
      documents: [],
    });

    const canaryResult = await executeCanaryLifecycle({
      sourceSetId,
      graphRepository: repo,
      graphBuildService: buildService,
      snapshotStore,
    });

    expect(canaryResult.preActivationVerified).toBe(true);
    expect(canaryResult.activationVerified).toBe(true);
    expect(canaryResult.rollbackVerified).toBe(true);
    expect(canaryResult.reactivationVerified).toBe(true);

    // Production active snapshot remains untouched
    const prodActive = await repo.getActiveGraph(sourceSetId);
    expect(prodActive?.graphSnapshotId).toBeUndefined();

    // Canary active snapshot is the candidate
    const canaryActive = await repo.getActiveGraph(canaryResult.canarySetId);
    expect(canaryActive?.graphSnapshotId).toBe(canaryResult.candidateSnapshotId);
  });

  it('runDurabilityCheck verifies snapshot persistence', async () => {
    const repo = new InMemoryGraphRepository();
    const setId = '33333333-3333-4333-8333-333333333333';
    const snapshotId = 'gsnap_durable_123';

    await repo.writeCandidate({
      graphSnapshotId: snapshotId,
      sourceSnapshotId: 'snap_source',
      setId,
      ontologyVersion: '1.0.0',
      normalizedProjectionHash: 'hash',
      nodes: [],
      relations: [],
      evidence: [],
      conflicts: [],
      approvals: [],
      quarantines: [],
      createdAt: new Date().toISOString(),
    });

    await repo.activateCandidate(setId, snapshotId);

    const passCheck = await runDurabilityCheck(setId, repo, snapshotId);
    expect(passCheck.status).toBe('PASS');
    expect(passCheck.postRestartSnapshotId).toBe(snapshotId);

    const failCheck = await runDurabilityCheck(setId, repo, 'gsnap_other');
    expect(failCheck.status).toBe('FAIL');
  });

  it('runLiveRetrievalMatrix evaluates all scenarios and formats metadata evidence', async () => {
    const setId = '44444444-4444-4444-8444-444444444444';
    const mockSnapshotId = '4240bf63-95f7-4b96-a1c7-45c5f80ba3c4';

    const mockFetcher = async (scenario: (typeof LIVE_SCENARIOS)[number]): Promise<RetrievalResponse> => {
      const isFast = Boolean(scenario.expectedFastPath);
      const outcome = scenario.expectedOutcome ?? 'READY';
      const isPath = Boolean(scenario.requirePath);

      return {
        outcome,
        snapshotId: mockSnapshotId,
        embeddingProvider: {
          provider: 'local-onnx',
          model: 'multilingual-e5-small',
          revision: 'v1',
          dimensions: 384,
          policyVersion: 'v1',
        },
        items: outcome === 'NO_EVIDENCE' ? [] : [
          {
            type: 'chunk',
            id: 'c1',
            score: 0.95,
            modalitiesContributed: ['fulltext'],
            sourceDocumentId: '55555555-5555-4555-8555-555555555555',
            sourceDocumentTitle: 'Test Doc',
            sectionAnchor: '#sec1',
            lineStart: 1,
            lineEnd: 10,
            rawSnippet: 'safe text',
            publishedContentHash: 'a'.repeat(64),
            snapshotId: mockSnapshotId,
            hasConflict: false,
          },
          ...(isPath
            ? [
                {
                  type: 'edge' as const,
                  id: 'f'.repeat(64),
                  score: 0.9,
                  modalitiesContributed: ['graph' as const],
                  factKey: 'f'.repeat(64),
                  sourceUrn: 'urn:plannermate:sys:proc:p1',
                  relationType: 'INVOKES' as const,
                  targetUrn: 'urn:plannermate:sys:proc:p2',
                  evidenceClass: 'OBSERVED' as const,
                  supportingChunkIds: ['c1'],
                  snapshotId: mockSnapshotId,
                  hasConflict: false,
                },
              ]
            : []),
        ],
        paths: isPath
          ? [
              {
                pathId: 'P1',
                snapshotId: mockSnapshotId,
                nodeUrns: ['urn:plannermate:sys:proc:p1', 'urn:plannermate:sys:proc:p2'],
                edgeFactKeys: ['f'.repeat(64)],
                hopClassifications: ['OBSERVED'],
                hopCitationIds: [['c1']],
                hasConflict: false,
                classification: 'OBSERVED',
              },
            ]
          : [],
        conflictGroups: [],
        totalCandidates: 2,
        modalitiesUsed: ['fulltext'],
        modalityStatus: {
          fulltext: { status: 'ok', latencyMs: 1, itemCount: 1 },
          vector: { status: 'ok', latencyMs: 1, itemCount: 1 },
          graph: { status: 'ok', latencyMs: 1, itemCount: isPath ? 1 : 0 },
        },
        diagnostics: { degraded: false },
        planTrace: {
          fastPath: isFast,
          intent: scenario.expectedIntent ?? 'LOOKUP',
        },
        ...(outcome === 'NEEDS_CLARIFICATION'
          ? {
              candidates: [
                {
                  urn: 'urn:plannermate:sys:proc:c1',
                  canonicalName: 'Proc C1',
                  kind: 'ScheduledProcess' as const,
                },
              ],
            }
          : {}),
        ...(outcome === 'NO_EVIDENCE'
          ? {
              reason: 'No evidence found',
              suggestedRefinements: ['Try other terms'],
            }
          : {}),
      };
    };

    const matrixResult = await runLiveRetrievalMatrix({
      setId,
      fetcher: mockFetcher,
    });

    expect(matrixResult.passed).toBe(true);
    expect(matrixResult.results.length).toBe(LIVE_SCENARIOS.length);
    expect(matrixResult.smokeEvidence).toBeDefined();
    expect(matrixResult.smokeEvidence.cases.every((c) => c.status === 'PASS')).toBe(true);

    const t4 = matrixResult.results.find((item) => item.id === 'T4');
    const t5 = matrixResult.results.find((item) => item.id === 'T5');
    const t6 = matrixResult.results.find((item) => item.id === 'T6');
    const t7 = matrixResult.results.find((item) => item.id === 'T7');

    expect(t4?.pathCount).toBeGreaterThan(0);
    expect(t5?.pathCount).toBeGreaterThan(0);
    expect(t6?.citationCount).toBe(0);
    expect(t7?.citationCount).toBe(0);
    expect(matrixResult.activeSnapshotId).toBe(mockSnapshotId);
  });
});
