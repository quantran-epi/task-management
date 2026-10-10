import { describe, it, expect } from 'vitest';
import {
  mergeFactsDeterministicFirst,
  computeEffectiveClassification,
  computeNormalizedProjectionHash,
} from '../src/graph/candidate.js';
import {
  FactAssertion,
  GraphApprovalRecord,
  GraphEvidenceRecord,
  GraphNode,
} from '../src/types/graphProtocol.js';
import {
  PILOT_GOLD_NODES,
  URN_PROCESS_60000006,
  URN_CONTAINER_60000006,
  URN_SUBPROCESS_10000304,
} from './fixtures/pilotGoldEntities.js';

describe('Candidate Merge Engine & Conflict Detection (GRAPH-04, D-04, D-12, D-14, D-18)', () => {
  const setId = 'set-pilot-test';
  const sourceSnapshotId = 'source-snap-1';
  const graphSnapshotId = 'graph-snap-1';

  it('deduplicates repeated facts across files and attaches multiple evidence records to one factKey (D-04, D-14)', () => {
    const factKey = '1111111111111111111111111111111111111111111111111111111111111111';

    const fact1: FactAssertion = {
      factKey,
      ontologyVersion: '2026.10.1',
      subjectUrn: URN_PROCESS_60000006,
      relation: 'INVOKES',
      objectUrn: URN_SUBPROCESS_10000304,
      qualifiers: {},
      classification: 'OBSERVED',
    };

    const evidenceFromDoc1: GraphEvidenceRecord = {
      evidenceId: 'e1111111-1111-4111-8111-111111111111',
      factKey,
      documentId: 'd1111111-1111-4111-8111-111111111111',
      documentTitle: '01-wiring.md',
      sectionHeadingPath: ['Wiring'],
      startLine: 10,
      endLine: 12,
      startOffset: 100,
      endOffset: 150,
      rawSnippet: 'Snippet from 01-wiring',
      extractionMethod: 'DETERMINISTIC_TABLE',
      classification: 'OBSERVED',
      confidence: 1,
      observedAt: '2026-10-10T00:00:00.000Z',
    };

    const evidenceFromDoc2: GraphEvidenceRecord = {
      evidenceId: 'e2222222-2222-4222-8222-222222222222',
      factKey,
      documentId: 'd2222222-2222-4222-8222-222222222222',
      documentTitle: '03-call-chain.md',
      sectionHeadingPath: ['Call chain'],
      startLine: 25,
      endLine: 27,
      startOffset: 250,
      endOffset: 300,
      rawSnippet: 'Snippet from 03-call-chain',
      extractionMethod: 'DETERMINISTIC_TABLE',
      classification: 'OBSERVED',
      confidence: 1,
      observedAt: '2026-10-10T00:00:00.000Z',
    };

    const candidate = mergeFactsDeterministicFirst({
      graphSnapshotId,
      sourceSnapshotId,
      setId,
      nodes: PILOT_GOLD_NODES as GraphNode[],
      deterministicFacts: [fact1, fact1], // Repeated fact in list
      deterministicEvidence: [evidenceFromDoc1, evidenceFromDoc2],
    });

    expect(candidate.relations.length).toBe(1);
    expect(candidate.relations[0]!.factKey).toBe(factKey);
    expect(candidate.relations[0]!.effectiveClassification).toBe('OBSERVED');
    expect(candidate.relations[0]!.hasConflict).toBe(false);

    // Both occurrences are attached in candidate evidence
    expect(candidate.evidence.length).toBe(2);
    expect(candidate.evidence.filter((e) => e.factKey === factKey).length).toBe(2);
  });

  it('detects direct contradictions in functional relation slots and preserves both branches (D-12)', () => {
    const factKeyStatusReady = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const factKeyStatusFailed = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    const factReady: FactAssertion = {
      factKey: factKeyStatusReady,
      ontologyVersion: '2026.10.1',
      subjectUrn: URN_CONTAINER_60000006,
      relation: 'HAS_STATUS',
      objectUrn: 'urn:plannermate:smartvista:Status:READY',
      qualifiers: {},
      classification: 'OBSERVED',
    };

    const factFailed: FactAssertion = {
      factKey: factKeyStatusFailed,
      ontologyVersion: '2026.10.1',
      subjectUrn: URN_CONTAINER_60000006,
      relation: 'HAS_STATUS',
      objectUrn: 'urn:plannermate:smartvista:Status:FAILED',
      qualifiers: {},
      classification: 'INFERRED',
    };

    const evReady: GraphEvidenceRecord = {
      evidenceId: 'e3333333-3333-4333-8333-333333333333',
      factKey: factKeyStatusReady,
      documentId: 'd1111111-1111-4111-8111-111111111111',
      documentTitle: '01-wiring.md',
      sectionHeadingPath: ['Status'],
      startLine: 5,
      endLine: 6,
      startOffset: 50,
      endOffset: 80,
      rawSnippet: 'READY',
      extractionMethod: 'DETERMINISTIC_TABLE',
      classification: 'OBSERVED',
      confidence: 1,
      observedAt: '2026-10-10T00:00:00.000Z',
    };

    const evFailed: GraphEvidenceRecord = {
      evidenceId: 'e4444444-4444-4444-8444-444444444444',
      factKey: factKeyStatusFailed,
      documentId: 'd2222222-2222-4222-8222-222222222222',
      documentTitle: '05-breadcrumbs.md',
      sectionHeadingPath: ['Audit'],
      startLine: 15,
      endLine: 16,
      startOffset: 120,
      endOffset: 150,
      rawSnippet: 'FAILED',
      extractionMethod: 'LLM_PROSE',
      classification: 'INFERRED',
      confidence: 0.8,
      observedAt: '2026-10-10T00:00:00.000Z',
    };

    const candidate = mergeFactsDeterministicFirst({
      graphSnapshotId,
      sourceSnapshotId,
      setId,
      nodes: PILOT_GOLD_NODES as GraphNode[],
      deterministicFacts: [factReady],
      deterministicEvidence: [evReady],
      inferredFacts: [factFailed],
      inferredEvidence: [evFailed],
    });

    expect(candidate.conflicts.length).toBe(1);
    const conflict = candidate.conflicts[0]!;
    expect(conflict.conflictType).toBe('DIRECT_CONTRADICTION');
    expect(conflict.subjectUrn).toBe(URN_CONTAINER_60000006);
    expect(conflict.relation).toBe('HAS_STATUS');
    expect(conflict.factKeyA).toBe(factKeyStatusReady);
    expect(conflict.factKeyB).toBe(factKeyStatusFailed);

    // Both relations remain visible and marked with hasConflict: true
    const relReady = candidate.relations.find((r) => r.factKey === factKeyStatusReady);
    const relFailed = candidate.relations.find((r) => r.factKey === factKeyStatusFailed);
    expect(relReady?.hasConflict).toBe(true);
    expect(relFailed?.hasConflict).toBe(true);
  });

  it('overlays exact-key approvals and upgrades classification to BUSINESS_APPROVED (D-18, D-19)', () => {
    const factKey = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

    const inferredFact: FactAssertion = {
      factKey,
      ontologyVersion: '2026.10.1',
      subjectUrn: URN_PROCESS_60000006,
      relation: 'INVOKES',
      objectUrn: URN_SUBPROCESS_10000304,
      qualifiers: {},
      classification: 'INFERRED',
    };

    const inferredEvidence: GraphEvidenceRecord = {
      evidenceId: 'e5555555-5555-4555-8555-555555555555',
      factKey,
      documentId: 'd1111111-1111-4111-8111-111111111111',
      documentTitle: '05-breadcrumbs.md',
      sectionHeadingPath: ['Audit'],
      startLine: 1,
      endLine: 2,
      startOffset: 0,
      endOffset: 20,
      rawSnippet: 'quote',
      extractionMethod: 'LLM_PROSE',
      classification: 'INFERRED',
      confidence: 0.85,
      observedAt: '2026-10-10T00:00:00.000Z',
    };

    const approval: GraphApprovalRecord = {
      factKey,
      approverName: 'lead-dev',
      approvedAt: '2026-10-10T01:00:00.000Z',
      ontologyVersion: '2026.10.1',
      rationale: 'Confirmed manually in code inspection',
    };

    const candidate = mergeFactsDeterministicFirst({
      graphSnapshotId,
      sourceSnapshotId,
      setId,
      nodes: PILOT_GOLD_NODES as GraphNode[],
      deterministicFacts: [],
      deterministicEvidence: [],
      inferredFacts: [inferredFact],
      inferredEvidence: [inferredEvidence],
      approvals: [approval],
    });

    expect(candidate.relations.length).toBe(1);
    expect(candidate.relations[0]!.effectiveClassification).toBe('BUSINESS_APPROVED');
  });

  it('produces identical normalized projection hash for identical entities and relations', () => {
    const factKey = 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';
    const fact: FactAssertion = {
      factKey,
      ontologyVersion: '2026.10.1',
      subjectUrn: URN_PROCESS_60000006,
      relation: 'INVOKES',
      objectUrn: URN_SUBPROCESS_10000304,
      qualifiers: {},
      classification: 'OBSERVED',
    };
    const ev: GraphEvidenceRecord = {
      evidenceId: 'e6666666-6666-4666-8666-666666666666',
      factKey,
      documentId: 'd1111111-1111-4111-8111-111111111111',
      documentTitle: '01-wiring.md',
      sectionHeadingPath: [],
      startLine: 1,
      endLine: 2,
      startOffset: 0,
      endOffset: 10,
      rawSnippet: 'Snippet',
      extractionMethod: 'DETERMINISTIC_TABLE',
      classification: 'OBSERVED',
      confidence: 1,
      observedAt: '2026-10-10T00:00:00.000Z',
    };

    const run1 = mergeFactsDeterministicFirst({
      graphSnapshotId: 'snap-1',
      sourceSnapshotId: 'src-1',
      setId: 'set-1',
      nodes: PILOT_GOLD_NODES as GraphNode[],
      deterministicFacts: [fact],
      deterministicEvidence: [ev],
      createdAt: '2026-10-10T00:00:00.000Z',
    });

    const run2 = mergeFactsDeterministicFirst({
      graphSnapshotId: 'snap-2', // Differing snapshot ID and time
      sourceSnapshotId: 'src-1',
      setId: 'set-1',
      nodes: PILOT_GOLD_NODES as GraphNode[],
      deterministicFacts: [fact],
      deterministicEvidence: [ev],
      createdAt: '2026-10-10T12:34:56.000Z',
    });

    expect(run1.normalizedProjectionHash).toBe(run2.normalizedProjectionHash);
  });
});
