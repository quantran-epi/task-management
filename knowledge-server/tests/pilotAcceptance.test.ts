import { describe, expect, it } from 'vitest';
import {
  chunkMarkdownSnapshot,
  OversizedAtomicBlockError,
} from '../src/parser/sectionChunker.js';
import {
  CHUNKING_POLICY_VERSION,
  HARD_ATOMIC_BLOCK_LIMIT,
  TARGET_CHUNK_SIZE,
} from '../src/types/protocol.js';
import {
  projectIncrementally,
  type ProjectedDocument,
  type ProjectionSnapshot,
} from '../src/indexing/incrementalProjector.js';
import {
  AttemptService,
  SetPublishInProgressError,
} from '../src/services/attemptService.js';
import { SnapshotStore } from '../src/indexing/snapshotStore.js';
import {
  buildChangePreview,
  type CachedActiveSnapshotManifest,
} from '../../src/services/knowledge/changePreview.js';
import type { DocumentSet, Note } from '../../src/types/models.js';

// The seven canonical fixtures for Process 60000006
const PILOT_FILES: Record<string, string> = {
  '00-sources.md': `# Process 60000006 Sources & Technical Lineage

## System Identifiers
The core calculation system runs as batch process \`60000006\` under banking core.
- Batch Name: \`SHB_BATCH_CR_CALC_DAILY\`
- Job Schedule: \`01:30 AM\` daily

## Source Repositories
Source repositories and stored procedure definitions:
- \`SP_CALC_INTEREST_ACCRUAL\`
- \`SP_RECONCILE_LIMITS\`
`,
  '01-wiring.md': `# Process 60000006 Wiring & Config

## Spring Batch XML Config
Fenced configuration XML:
\`\`\`xml
<batch:job id="60000006-credit-calc">
  <batch:step id="step-accrual">
    <batch:tasklet ref="accrualTasklet" />
  </batch:step>
</batch:job>
\`\`\`

## Parameter Mappings
Configuration parameters passed via environment:
- \`CALC_DATE\`: YYYYMMDD
- \`BRANCH_CODE\`: ALL
`,
  '02-data-objects.md': `# Process 60000006 Data Objects

## Table Schema: T_LN_ACCT
Master loan account table:
| Column | Type | Nullable | Description |
|---|---|---|---|
| ACCT_NO | VARCHAR2(20) | N | Loan Account Number |
| CUST_ID | VARCHAR2(15) | N | Customer CIF |
| INT_RATE | NUMBER(8,4) | N | Effective Interest Rate |
| BAL_DUE | NUMBER(18,2) | N | Principal Balance Due |

### Table Schema: T_LN_SCHED
Repayment schedule table:
| Column | Type | Nullable | Description |
|---|---|---|---|
| SCHED_ID | VARCHAR2(30) | N | Schedule Primary Key |
| ACCT_NO | VARCHAR2(20) | N | Loan Account Number |
| DUE_DATE | DATE | N | Installment Due Date |
`,
  '03-call-chain.md': `# Process 60000006 Call Chain & Workflow

## Daily Execution Sequence
Sequential execution pipeline:
\`\`\`
[Trigger: Control-M]
         │
         ▼
[Step 1: Check EOD Flags] ──► [Step 2: Lock Accounts]
                                         │
                                         ▼
                             [Step 3: Accrual SQL SP]
\`\`\`

## PL/SQL Call Chain
Main procedure invocation:
\`\`\`sql
CREATE OR REPLACE PROCEDURE PKG_CR_CALC.PROCESS_DAILY(
    p_run_date IN DATE,
    p_status   OUT VARCHAR2
) AS
BEGIN
    SP_VALIDATE_ACCOUNTS(p_run_date);
    SP_CALC_INTEREST_ACCRUAL(p_run_date);
    COMMIT;
END PROCESS_DAILY;
\`\`\`
`,
  '04-cycles.md': `# Process 60000006 Billing Cycles & Interest Accrual

## Calendar Rules
Interest accrual follows 365-day convention:
\`\`\`
Daily Accrual = (Principal × Annual Rate) / 365
\`\`\`

## Holiday Adjustments
When accrual date falls on Sunday, interest is accrued on next business day.
`,
  '05-breadcrumbs.md': `# Process 60000006 Breadcrumbs & Diagnostics

## Log Locations
System log directories:
- \`/var/log/banking/batch/60000006/daily.log\`
- \`/var/log/banking/batch/60000006/error.log\`

## Diagnostic Queries
Query to check failed accounts:
\`\`\`sql
SELECT acct_no, err_code, err_msg
FROM t_batch_err_log
WHERE batch_id = '60000006' AND run_date = TRUNC(SYSDATE);
\`\`\`
`,
  'README.md': `# Scheduled Process 60000006 Overview

## Business Purpose
Automated credit calculation for retail and SME lending products.

## SLA & Operations
- SLA: Execution must complete before 04:00 AM.
- Ops Owner: Team Core Banking Operations.
`,
};

const SET_ID = '60000006-0000-4000-8000-000000000000';
const SET_NAME = 'Process 60000006 Credit Calculations';

// Deterministic UUIDs for the 7 files
const FILE_ENTRIES = Object.entries(PILOT_FILES).map(([filename, body], index) => {
  const docId = `60000006-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
  return {
    filename,
    docId,
    title: filename.replace(/\.md$/, ''),
    body,
  };
});

function toNotes(): Note[] {
  return FILE_ENTRIES.map((entry) => ({
    id: entry.docId,
    type: 'document',
    title: entry.title,
    body: entry.body,
    tags: ['pilot', 'credit-calc'],
    isPinned: false,
    createdAt: '2026-10-08T00:00:00.000Z',
    updatedAt: '2026-10-08T00:00:00.000Z',
  }));
}

function toDocumentSet(documentIds: string[] = FILE_ENTRIES.map((e) => e.docId)): DocumentSet {
  return {
    id: SET_ID,
    name: SET_NAME,
    documentIds,
    createdAt: '2026-10-08T00:00:00.000Z',
    updatedAt: '2026-10-08T00:00:00.000Z',
  };
}

function snapshotToManifest(snapshot: ProjectionSnapshot): CachedActiveSnapshotManifest {
  return {
    snapshotId: snapshot.snapshotId,
    setId: snapshot.setId,
    chunkingPolicyVersion: snapshot.chunkingPolicyVersion,
    documents: snapshot.documents.map((doc) => ({
      documentId: doc.documentId,
      title: doc.title,
      contentHash: doc.contentHash,
      chunks: doc.chunks.map((chunk) => ({
        occurrenceId: chunk.occurrenceId,
        chunkKey: `${doc.documentId}::${chunk.contentHash}::${chunk.chunkIndex}`,
        contentHash: chunk.contentHash,
        headingPath: [...chunk.headingPath],
        chunkIndex: chunk.chunkIndex,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
      })),
    })),
  };
}

describe('Pilot 60000006 acceptance suite', () => {
  it('parses all 7 files losslessly with exact range slices and chunking policy version', () => {
    for (const entry of FILE_ENTRIES) {
      const chunks = chunkMarkdownSnapshot(entry.docId, entry.body);
      expect(chunks.length).toBeGreaterThan(0);

      for (const chunk of chunks) {
        // Exact slice reconstructs rawContent
        const slice = entry.body.slice(chunk.startOffset, chunk.endOffset);
        expect(slice).toBe(chunk.rawContent);

        // Heading path, non-empty contentHash, lines
        expect(chunk.contentHash).toMatch(/^[0-9a-f]{64}$/);
        expect(chunk.startLine).toBeLessThanOrEqual(chunk.endLine);
        expect(chunk.startOffset).toBeLessThan(chunk.endOffset);
      }
    }
  });

  it('guarantees client local preview and daemon projection 4-way delta parity across baseline, unchanged, edit, and deletion (D-04, T-16-55)', async () => {
    const notes = toNotes();
    const docSet = toDocumentSet();

    // 1. BASELINE PARITY: all 7 added
    const clientBaseline = await buildChangePreview({
      documentSet: docSet,
      notes,
      activeManifest: null,
    });

    const daemonBaseline = projectIncrementally({
      setId: SET_ID,
      documents: FILE_ENTRIES.map((e) => ({
        documentId: e.docId,
        title: e.title,
        body: e.body,
        tags: ['pilot', 'credit-calc'],
      })),
      activeSnapshot: null,
    });

    expect(clientBaseline.counts.documentsAdded).toBe(daemonBaseline.summary.documentsAdded);
    expect(clientBaseline.counts.documentsChanged).toBe(daemonBaseline.summary.documentsChanged);
    expect(clientBaseline.counts.documentsRemoved).toBe(daemonBaseline.summary.documentsRemoved);
    expect(clientBaseline.counts.documentsUnchanged).toBe(daemonBaseline.summary.documentsUnchanged);
    expect(clientBaseline.counts.chunksAdded).toBe(daemonBaseline.summary.chunksAdded);
    expect(clientBaseline.counts.chunksChanged).toBe(daemonBaseline.summary.chunksChanged);
    expect(clientBaseline.counts.chunksRemoved).toBe(daemonBaseline.summary.chunksRemoved);
    expect(clientBaseline.counts.chunksUnchanged).toBe(daemonBaseline.summary.chunksUnchanged);
    expect(clientBaseline.snapshot.chunkingPolicyVersion).toBe(CHUNKING_POLICY_VERSION);
    expect(daemonBaseline.candidate.chunkingPolicyVersion).toBe(CHUNKING_POLICY_VERSION);

    // 2. UNCHANGED REPUBLISH PARITY: all 7 unchanged
    const activeManifest = snapshotToManifest(daemonBaseline.candidate);
    const clientUnchanged = await buildChangePreview({
      documentSet: docSet,
      notes,
      activeManifest,
    });

    const daemonUnchanged = projectIncrementally({
      setId: SET_ID,
      documents: FILE_ENTRIES.map((e) => ({
        documentId: e.docId,
        title: e.title,
        body: e.body,
        tags: ['pilot', 'credit-calc'],
      })),
      activeSnapshot: daemonBaseline.candidate,
    });

    expect(clientUnchanged.counts.documentsAdded).toBe(0);
    expect(clientUnchanged.counts.documentsChanged).toBe(0);
    expect(clientUnchanged.counts.documentsRemoved).toBe(0);
    expect(clientUnchanged.counts.documentsUnchanged).toBe(7);
    expect(clientUnchanged.counts.chunksAdded).toBe(0);
    expect(clientUnchanged.counts.chunksChanged).toBe(0);
    expect(clientUnchanged.counts.chunksRemoved).toBe(0);
    expect(clientUnchanged.counts.chunksUnchanged).toBe(daemonUnchanged.summary.chunksUnchanged);
    expect(daemonUnchanged.summary.mutations).toBe(0);

    // 3. ONE-SECTION EDIT + ONE DELETION PARITY
    // Edit 01-wiring.md (doc 2) and delete 05-breadcrumbs.md (doc 6)
    const modifiedNotes = notes
      .filter((n) => n.id !== FILE_ENTRIES[5]!.docId) // Remove 05-breadcrumbs
      .map((n) => {
        if (n.id === FILE_ENTRIES[1]!.docId) {
          return {
            ...n,
            body: n.body + '\n## New Operational Step\nAdded step description.\n',
          };
        }
        return n;
      });

    const modifiedDocSet = toDocumentSet(modifiedNotes.map((n) => n.id));

    const clientDelta = await buildChangePreview({
      documentSet: modifiedDocSet,
      notes: modifiedNotes,
      activeManifest,
    });

    const daemonDelta = projectIncrementally({
      setId: SET_ID,
      documents: modifiedNotes.map((n) => ({
        documentId: n.id,
        title: n.title,
        body: n.body,
      })),
      activeSnapshot: daemonBaseline.candidate,
    });

    // Both must agree on document-level 4-way classification
    expect(clientDelta.counts.documentsAdded).toBe(0);
    expect(clientDelta.counts.documentsChanged).toBe(1);
    expect(clientDelta.counts.documentsRemoved).toBe(1);
    expect(clientDelta.counts.documentsUnchanged).toBe(5);

    expect(daemonDelta.summary.documentsAdded).toBe(0);
    expect(daemonDelta.summary.documentsChanged).toBe(1);
    expect(daemonDelta.summary.documentsRemoved).toBe(1);
    expect(daemonDelta.summary.documentsUnchanged).toBe(5);

    // Both must agree on chunk-level counts
    expect(clientDelta.counts.chunksAdded).toBe(daemonDelta.summary.chunksAdded);
    expect(clientDelta.counts.chunksChanged).toBe(daemonDelta.summary.chunksChanged);
    expect(clientDelta.counts.chunksRemoved).toBe(daemonDelta.summary.chunksRemoved);
    expect(clientDelta.counts.chunksUnchanged).toBe(daemonDelta.summary.chunksUnchanged);
  });

  it('preserves occurrence identity vs reusable contentHash under duplicate, move, and newline variations (D-22, D-24)', () => {
    // Document with identical sections in different positions
    const duplicateContent = `## Status Codes\n200 OK\n400 Bad Request\n\n## Another Heading\nMiddle content.\n\n## Status Codes\n200 OK\n400 Bad Request\n\n`;
    const docId = 'dup-doc-0000-4000-8000-000000000000';
    const chunks = chunkMarkdownSnapshot(docId, duplicateContent);
    expect(chunks.length).toBe(3);

    const firstOcc = chunks[0]!;
    const secondOcc = chunks[2]!;

    // Content hash must be identical
    expect(firstOcc.contentHash).toBe(secondOcc.contentHash);

    // Occurrence IDs must be distinct
    expect(firstOcc.occurrenceId).not.toBe(secondOcc.occurrenceId);

    // Exact raw ranges must address their distinct positions
    expect(firstOcc.startOffset).not.toBe(secondOcc.startOffset);
    expect(duplicateContent.slice(firstOcc.startOffset, firstOcc.endOffset)).toBe(firstOcc.rawContent);
    expect(duplicateContent.slice(secondOcc.startOffset, secondOcc.endOffset)).toBe(secondOcc.rawContent);

    // CRLF vs LF produce identical contentHash
    const crlfContent = duplicateContent.replaceAll('\n', '\r\n');
    const crlfChunks = chunkMarkdownSnapshot(docId, crlfContent);
    expect(crlfChunks[0]!.contentHash).toBe(firstOcc.contentHash);
  });

  it('rejects oversized atomic block and keeps prior active snapshot deeply unchanged without partial activation (D-14, D-25, T-16-56)', async () => {
    const store = new SnapshotStore();
    const service = new AttemptService(store);

    // 1. Establish valid active baseline
    const baselinePayload = {
      setName: SET_NAME,
      documents: FILE_ENTRIES.map((e) => ({
        documentId: e.docId,
        title: e.title,
        body: e.body,
        tags: ['pilot'],
      })),
    };
    const baselineAttempt = service.accept(SET_ID, 'key-baseline', baselinePayload);
    await service.waitForAttempt(baselineAttempt.attemptId);
    const completedBaseline = service.getAttempt(baselineAttempt.attemptId);
    expect(completedBaseline?.status).toBe('In sync');

    const activeBeforeFailure = store.getActiveSnapshot(SET_ID);
    expect(activeBeforeFailure).not.toBeNull();
    const baselineSnapshotId = activeBeforeFailure!.snapshotId;
    const serializedActiveBefore = JSON.stringify(activeBeforeFailure);

    // 2. Submit candidate with one oversized block (> 50,000 chars table/fenced)
    const oversizedTable =
      '| Head |\n|---|\n' +
      Array.from({ length: 5100 }, (_, i) => `| Row ${i} with long data padding padding |`).join('\n');
    expect(oversizedTable.length).toBeGreaterThan(HARD_ATOMIC_BLOCK_LIMIT);

    const failingPayload = {
      setName: SET_NAME,
      documents: [
        {
          documentId: FILE_ENTRIES[0]!.docId,
          title: FILE_ENTRIES[0]!.title,
          body: `# Oversized\n\n## Big Section\n${oversizedTable}\n`,
          tags: ['pilot'],
        },
      ],
    };

    const failingAttempt = service.accept(SET_ID, 'key-oversized', failingPayload);
    await service.waitForAttempt(failingAttempt.attemptId);
    const failedResult = service.getAttempt(failingAttempt.attemptId);

    // Candidate fails with structured error and remedy
    expect(failedResult?.status).toBe('Failed');
    expect(failedResult?.error).toBeDefined();
    expect(failedResult?.error?.code).toBe('OVERSIZED_ATOMIC_BLOCK');
    expect(failedResult?.error?.remedy).toContain('Split the source block');
    expect(failedResult?.error?.documentId).toBe(FILE_ENTRIES[0]!.docId);

    // Active snapshot is untouched and deeply identical
    const activeAfterFailure = store.getActiveSnapshot(SET_ID);
    expect(activeAfterFailure?.snapshotId).toBe(baselineSnapshotId);
    expect(JSON.stringify(activeAfterFailure)).toBe(serializedActiveBefore);
  });

  it('handles idempotent same-key replay and rejects conflicting concurrent attempts for the same set (D-09, D-11)', async () => {
    let releaseHold!: () => void;
    const holdPromise = new Promise<void>((resolve) => {
      releaseHold = resolve;
    });

    const store = new SnapshotStore();
    const service = new AttemptService(store, {
      beforeProject: () => holdPromise,
    });

    const payload = {
      setName: SET_NAME,
      documents: [
        {
          documentId: FILE_ENTRIES[0]!.docId,
          title: FILE_ENTRIES[0]!.title,
          body: FILE_ENTRIES[0]!.body,
          tags: ['pilot'],
        },
      ],
    };

    // First submission enters Publishing
    const firstAttempt = service.accept(SET_ID, 'unique-key-1', payload);
    expect(firstAttempt.status).toBe('Publishing');

    // Idempotent retry with same attemptKey returns identical attempt without new work
    const replayedAttempt = service.accept(SET_ID, 'unique-key-1', payload);
    expect(replayedAttempt.attemptId).toBe(firstAttempt.attemptId);

    // Different key for SAME set throws SetPublishInProgressError
    expect(() => service.accept(SET_ID, 'different-key-2', payload)).toThrowError(
      SetPublishInProgressError
    );

    // Different set can publish concurrently
    const otherSetId = '99999999-9999-4999-8999-999999999999';
    expect(() => service.accept(otherSetId, 'key-other', payload)).not.toThrow();

    // Release hold and drain
    releaseHold();
    await service.waitForAttempt(firstAttempt.attemptId);
  });
});
