import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SnapshotStore } from '../src/indexing/snapshotStore.js';
import { GraphBuildService } from '../src/services/graphBuildService.js';
import { InMemoryGraphRepository } from '../src/graph/graphRepository.js';
import type { ProjectionSnapshot } from '../src/indexing/incrementalProjector.js';
import type { FactAssertion, GraphEvidenceRecord, GraphApprovalRecord } from '../src/types/graphProtocol.js';

describe('Graph Rebuild Orchestration & Snapshot Persistence (D-19, D-20, D-21)', () => {
  let tempDir: string;
  const setId = '60000006-0000-4000-8000-000000000000';

  const mockSnapshot: ProjectionSnapshot = {
    snapshotId: 'source-snapshot-v1',
    setId,
    chunkingPolicyVersion: '2026.04.1',
    documents: [
      {
        documentId: 'doc-1',
        title: '01-wiring.md',
        contentHash: '1'.repeat(64),
        chunks: [
          {
            occurrenceId: 'occ-1',
            representationId: 'rep-1',
            contentHash: '1'.repeat(64),
            chunkIndex: 0,
            headingPath: ['Container / processes'],
            startLine: 1,
            endLine: 15,
            startOffset: 0,
            endOffset: 350,
            rawContent: `# Wiring\n| ID | PROCEDURE_NAME | IS_EXTERNAL | IS_CONTAINER | INST_ID | IS_PARALLEL |\n|---|---|---|---|---|---|\n| 60000006 | CONTAINER | 0 | 1 | 1001 | 0 |\n| 10000304 | FCL_PRC_CYCLE_COUNTER_PKG.PROCESS | 0 | 0 | 9999 | 1 |\n`,
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-store-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('durably persists active published snapshots across daemon restarts (Pitfall 1)', () => {
    // 1. Instance A writes snapshot
    const storeA = new SnapshotStore({ storageDir: tempDir });
    storeA.createCandidate('c-1', 'att-1', setId);
    storeA.completeCandidate('c-1', mockSnapshot);
    storeA.promoteCandidate('c-1');

    expect(storeA.getActiveSnapshot(setId)?.snapshotId).toBe('source-snapshot-v1');

    // 2. Instance B loads from same directory
    const storeB = new SnapshotStore({ storageDir: tempDir });
    const loaded = storeB.getActiveSnapshot(setId);
    expect(loaded).not.toBeNull();
    expect(loaded?.snapshotId).toBe('source-snapshot-v1');
    expect(loaded?.documents.length).toBe(1);
    expect(loaded?.documents[0]?.title).toBe('01-wiring.md');
  });

  it('durably persists human approval ledger across restarts (D-19)', () => {
    const storeA = new SnapshotStore({ storageDir: tempDir });
    const approval: GraphApprovalRecord = {
      factKey: 'fact-approved-1',
      approverName: 'lead-architect',
      approvedAt: '2026-10-10T00:00:00.000Z',
      ontologyVersion: '2026.10.1',
      rationale: 'Verified in user source',
    };
    storeA.recordApproval(setId, approval);

    // Instance B recovers approvals
    const storeB = new SnapshotStore({ storageDir: tempDir });
    const approvals = storeB.getApprovals(setId);
    expect(approvals).toHaveLength(1);
    expect(approvals[0]?.factKey).toBe('fact-approved-1');
    expect(approvals[0]?.approverName).toBe('lead-architect');
  });

  it('executes atomic pointer promotion leaving prior active graph unchanged until swap', async () => {
    const store = new SnapshotStore({ storageDir: tempDir });
    const repo = new InMemoryGraphRepository();
    const service = new GraphBuildService(repo, store);

    // Establish source snapshot
    store.createCandidate('c-1', 'att-1', setId);
    store.completeCandidate('c-1', mockSnapshot);
    store.promoteCandidate('c-1');

    // Initial build
    const firstGraphId = await service.executeRebuildSync(setId);
    const firstActive = await repo.getActiveGraph(setId);
    expect(firstActive?.graphSnapshotId).toBe(firstGraphId);

    // Controlled pause during activation
    let releaseActivation!: () => void;
    const activationHold = new Promise<void>((resolve) => {
      releaseActivation = resolve;
    });

    const origActivate = repo.activateCandidate.bind(repo);
    repo.activateCandidate = async (sId, snapId) => {
      await activationHold;
      return origActivate(sId, snapId);
    };

    // Trigger second build (runs asynchronously)
    const rebuildAccepted = await service.triggerRebuild(setId, 'rebuild-key-1');
    expect(rebuildAccepted.status).toBe('ACCEPTED');

    // Prior active graph remains accessible and unchanged while rebuild is underway
    const activeDuringBuild = await repo.getActiveGraph(setId);
    expect(activeDuringBuild?.graphSnapshotId).toBe(firstGraphId);

    // Release activation and wait for completion
    releaseActivation();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const activeAfterPromotion = await repo.getActiveGraph(setId);
    expect(activeAfterPromotion?.graphSnapshotId).toBe(rebuildAccepted.candidateSnapshotId);
  });

  it('preserves prior active graph completely if candidate build fails (D-21)', async () => {
    const store = new SnapshotStore({ storageDir: tempDir });
    const repo = new InMemoryGraphRepository();
    const service = new GraphBuildService(repo, store);

    // Initial valid build
    store.createCandidate('c-1', 'att-1', setId);
    store.completeCandidate('c-1', mockSnapshot);
    store.promoteCandidate('c-1');
    const firstGraphId = await service.executeRebuildSync(setId);

    // Inject failure into repository for second write
    const writeOriginal = repo.writeCandidate.bind(repo);
    repo.writeCandidate = async () => {
      throw new Error('SIMULATED_CANDIDATE_WRITE_FAILURE');
    };

    await expect(service.executeRebuildSync(setId)).rejects.toThrow('SIMULATED_CANDIDATE_WRITE_FAILURE');

    // Active pointer remains exactly the first snapshot
    const activeAfterFailure = await repo.getActiveGraph(setId);
    expect(activeAfterFailure?.graphSnapshotId).toBe(firstGraphId);
  });

  it('produces identical normalizedProjectionHash when rebuilding twice from identical Markdown (D-21)', async () => {
    const store = new SnapshotStore({ storageDir: tempDir });
    const repo = new InMemoryGraphRepository();
    const service = new GraphBuildService(repo, store);

    store.createCandidate('c-1', 'att-1', setId);
    store.completeCandidate('c-1', mockSnapshot);
    store.promoteCandidate('c-1');

    await service.executeRebuildSync(setId);
    const active1 = await repo.getActiveGraph(setId);

    await service.executeRebuildSync(setId);
    const active2 = await repo.getActiveGraph(setId);

    expect(active1?.normalizedProjectionHash).toBe(active2?.normalizedProjectionHash);
  });

  it('aborts candidate promotion if source snapshot changes during candidate build (stale-source guard)', async () => {
    const store = new SnapshotStore({ storageDir: tempDir });
    const repo = new InMemoryGraphRepository();
    const service = new GraphBuildService(repo, store);

    store.createCandidate('c-1', 'att-1', setId);
    store.completeCandidate('c-1', mockSnapshot);
    store.promoteCandidate('c-1');

    // Intercept writeCandidate to advance source snapshot mid-build
    const origWrite = repo.writeCandidate.bind(repo);
    repo.writeCandidate = async (candidate) => {
      // Simulate new publish completing before promotion
      const newerSnapshot: ProjectionSnapshot = {
        ...mockSnapshot,
        snapshotId: 'source-snapshot-v2-newer',
      };
      store.createCandidate('c-2', 'att-2', setId);
      store.completeCandidate('c-2', newerSnapshot);
      store.promoteCandidate('c-2');

      await origWrite(candidate);
    };

    await expect(service.executeRebuildSync(setId)).rejects.toThrow('STALE_SOURCE_SNAPSHOT');
  });

  it('retains approved facts with sourceMissing=true and BUSINESS_APPROVED when source evidence disappears (D-20)', async () => {
    const store = new SnapshotStore({ storageDir: tempDir });
    const repo = new InMemoryGraphRepository();
    const service = new GraphBuildService(repo, store);

    const factKey = 'approved-fact-that-got-deleted-from-source';
    const approvedFact: FactAssertion = {
      factKey,
      ontologyVersion: '2026.10.1',
      subjectUrn: 'urn:plannermate:smartvista:PRC_PROCESS:60000006',
      relation: 'INVOKES',
      objectUrn: 'urn:plannermate:smartvista:PRC_PROCESS:10000304',
      qualifiers: {},
      classification: 'OBSERVED',
    };

    // Store approval ledger containing this fact
    store.recordApproval(setId, {
      factKey,
      approverName: 'tech-lead',
      approvedAt: '2026-10-10T00:00:00.000Z',
      ontologyVersion: '2026.10.1',
      rationale: 'Approved manually',
      ...( { fact: approvedFact } as any ),
    });

    // Published source document does NOT contain this fact
    store.createCandidate('c-1', 'att-1', setId);
    store.completeCandidate('c-1', mockSnapshot);
    store.promoteCandidate('c-1');

    const graphId = await service.executeRebuildSync(setId);
    const factsList = await service.getFacts(setId);

    const retained = factsList.facts.find((f) => f.factKey === factKey);
    expect(retained).toBeDefined();
    expect(retained?.effectiveClassification).toBe('BUSINESS_APPROVED');
    expect(retained?.evidenceCount).toBe(0);

    const factDetail = await service.getEvidence(setId, factKey);
    expect(factDetail.occurrences).toHaveLength(0);
    expect(factDetail.effectiveClassification).toBe('BUSINESS_APPROVED');
  });
});
