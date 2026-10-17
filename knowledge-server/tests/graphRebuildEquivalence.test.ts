import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SnapshotStore } from '../src/indexing/snapshotStore.js';
import { GraphBuildService } from '../src/services/graphBuildService.js';
import { InMemoryGraphRepository } from '../src/graph/graphRepository.js';
import type { ProjectionSnapshot } from '../src/indexing/incrementalProjector.js';

describe('Semantic Graph Rebuild Equivalence (QUAL-04, D-17, D-18, D-19)', () => {
  let tempDir: string;
  const setId = '60000006-0000-4000-8000-000000000000';

  const pilotDocumentSnapshot: ProjectionSnapshot = {
    snapshotId: 'pilot-snapshot-canonical-v1',
    setId,
    chunkingPolicyVersion: '2026.04.1',
    documents: [
      {
        documentId: 'doc-wiring',
        title: '01-wiring.md',
        contentHash: 'a'.repeat(64),
        chunks: [
          {
            occurrenceId: 'occ-w1',
            representationId: 'rep-w1',
            contentHash: 'a'.repeat(64),
            chunkIndex: 0,
            headingPath: ['Process Wiring'],
            startLine: 1,
            endLine: 20,
            startOffset: 0,
            endOffset: 450,
            rawContent: `# Wiring
| ID | PROCEDURE_NAME | IS_EXTERNAL | IS_CONTAINER | INST_ID | IS_PARALLEL |
|---|---|---|---|---|---|
| 60000006 | CONTAINER | 0 | 1 | 1001 | 0 |
| 10000304 | FCL_PRC_CYCLE_COUNTER_PKG.PROCESS | 0 | 0 | 9999 | 1 |
| 20000405 | FCL_SETTLE_CARD_PKG.PROCESS | 0 | 0 | 1002 | 0 |
`,
          },
        ],
      },
      {
        documentId: 'doc-objects',
        title: '02-data-objects.md',
        contentHash: 'b'.repeat(64),
        chunks: [
          {
            occurrenceId: 'occ-o1',
            representationId: 'rep-o1',
            contentHash: 'b'.repeat(64),
            chunkIndex: 0,
            headingPath: ['Data Objects'],
            startLine: 1,
            endLine: 25,
            startOffset: 0,
            endOffset: 500,
            rawContent: `# Data Objects
| TABLE_NAME | PK_COLUMN | MODULE | PURPOSE |
|---|---|---|---|
| TBL_CARD_TRAN | TRAN_ID | CARD | Core Card Transactions |
| TBL_CFG_CREDIT | CFG_KEY | CREDIT | Credit System Configurations |
`,
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rebuild-equiv-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('produces semantic graph equivalence across independent rebuild cycles', async () => {
    const store = new SnapshotStore({ storageDir: tempDir });
    const repo = new InMemoryGraphRepository();
    const service = new GraphBuildService(repo, store);

    // Seed the snapshot store with the published projection snapshot
    store.createCandidate('c-init', 'att-init', setId);
    store.completeCandidate('c-init', pilotDocumentSnapshot);
    store.promoteCandidate('c-init');

    // 1. First Rebuild Cycle
    const run1SnapshotId = await service.executeRebuildSync(setId);
    const graph1 = await repo.getActiveGraph(setId);
    expect(graph1).not.toBeNull();
    const facts1 = await repo.getFacts(run1SnapshotId);
    const quarantines1 = await repo.getQuarantines(run1SnapshotId);

    // 2. Second Rebuild Cycle from identical snapshot
    const run2SnapshotId = await service.executeRebuildSync(setId);
    const graph2 = await repo.getActiveGraph(setId);
    expect(graph2).not.toBeNull();
    const facts2 = await repo.getFacts(run2SnapshotId);
    const quarantines2 = await repo.getQuarantines(run2SnapshotId);

    // Ephemeral / Runtime identifiers are allowed to differ
    expect(run1SnapshotId).not.toBe(run2SnapshotId);
    expect(graph1?.activatedAt).toBeDefined();
    expect(graph2?.activatedAt).toBeDefined();

    // SEMANTIC INVARIANTS:
    // (a) Normalized Projection Hash matches byte-for-byte
    expect(graph1?.normalizedProjectionHash).toBe(graph2?.normalizedProjectionHash);
    expect(typeof graph1?.normalizedProjectionHash).toBe('string');
    expect(graph1?.normalizedProjectionHash.length).toBe(64);

    // (b) Exact node counts, relation counts, and fact counts
    expect(graph1?.nodeCount).toBe(graph2?.nodeCount);
    expect(graph1?.relationCount).toBe(graph2?.relationCount);
    expect(graph1?.factCount).toBe(graph2?.factCount);
    expect(graph1?.conflictCount).toBe(graph2?.conflictCount);
    expect(graph1?.quarantineCount).toBe(graph2?.quarantineCount);

    // (c) Semantic factKey sets match identically
    const factKeys1 = facts1.map((f) => f.relation.factKey).sort();
    const factKeys2 = facts2.map((f) => f.relation.factKey).sort();
    expect(factKeys1).toEqual(factKeys2);

    // (d) Subject URN, Relation Type, Object URN, and Effective Classification match exactly
    const relations1 = facts1
      .map((f) => ({
        subjectUrn: f.relation.subjectUrn,
        relation: f.relation.relation,
        objectUrn: f.relation.objectUrn,
        classification: f.relation.effectiveClassification,
      }))
      .sort((a, b) => a.subjectUrn.localeCompare(b.subjectUrn));

    const relations2 = facts2
      .map((f) => ({
        subjectUrn: f.relation.subjectUrn,
        relation: f.relation.relation,
        objectUrn: f.relation.objectUrn,
        classification: f.relation.effectiveClassification,
      }))
      .sort((a, b) => a.subjectUrn.localeCompare(b.subjectUrn));

    expect(relations1).toEqual(relations2);

    // (e) Quarantines match identically
    expect(quarantines1).toEqual(quarantines2);
  });
});
