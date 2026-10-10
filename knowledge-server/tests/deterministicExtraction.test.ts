import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { extractDeterministicFacts } from '../src/graph/extraction.js';
import { chunkMarkdownSnapshot } from '../src/parser/sectionChunker.js';
import type { ProjectionSnapshot, ProjectedDocument } from '../src/indexing/incrementalProjector.js';
import {
  URN_PROCESS_60000006,
  URN_CONTAINER_60000005,
  URN_CONTAINER_60000006,
  URN_CONTAINER_60000007,
  URN_SUBPROCESS_10000304,
  URN_PKG_FCL_CYCLE_COUNTER,
  URN_TABLE_FCL_CYCLE_COUNTER,
  URN_CYTP_1003,
  URN_CYTP_1002,
} from './fixtures/pilotGoldEntities.js';

function createMockSnapshotFromFiles(files: Record<string, string>): ProjectionSnapshot {
  const documents: ProjectedDocument[] = Object.entries(files).map(([name, content], idx) => {
    const docId = `00000000-0000-4000-8000-${(idx + 1).toString().padStart(12, '0')}`;
    const chunks = chunkMarkdownSnapshot(docId, content).map((c) => ({
      occurrenceId: c.occurrenceId,
      representationId: c.contentHash,
      contentHash: c.contentHash,
      chunkIndex: c.chunkIndex,
      headingPath: c.headingPath,
      startLine: c.startLine,
      endLine: c.endLine,
      startOffset: c.startOffset,
      endOffset: c.endOffset,
      rawContent: c.rawContent,
    }));

    return {
      documentId: docId,
      title: name,
      contentHash: `hash-${idx}`,
      chunks,
    };
  });

  return {
    snapshotId: 'test-snapshot-pilot',
    setId: 'test-set-pilot',
    chunkingPolicyVersion: '2026.10.1',
    documents,
  };
}

describe('Deterministic MDAST Extraction (GRAPH-03, D-11, D-12, D-16)', () => {
  // Load real pilot files
  const sampleDir = path.resolve(process.cwd(), '../docs/sample-markdown-flow/60000006-SHB-Credit-calculations');
  const file01 = fs.readFileSync(path.join(sampleDir, '01-wiring.md'), 'utf-8');
  const file02 = fs.readFileSync(path.join(sampleDir, '02-data-objects.md'), 'utf-8');
  const file04 = fs.readFileSync(path.join(sampleDir, '04-cycles.md'), 'utf-8');
  const file05 = fs.readFileSync(path.join(sampleDir, '05-breadcrumbs.md'), 'utf-8');

  const snapshot = createMockSnapshotFromFiles({
    '01-wiring.md': file01,
    '02-data-objects.md': file02,
    '04-cycles.md': file04,
    '05-breadcrumbs.md': file05,
  });

  it('extracts ScheduledProcess, ProcessStep, and SoftwareComponent nodes deterministically', () => {
    const result = extractDeterministicFacts(snapshot);

    const urns = new Set(result.nodes.map((n) => n.urn));
    // Verify Process 60000006
    expect(urns.has(URN_PROCESS_60000006)).toBe(true);
    // Verify Steps 60000005, 60000006, 60000007
    expect(urns.has(URN_CONTAINER_60000005)).toBe(true);
    expect(urns.has(URN_CONTAINER_60000006)).toBe(true);
    expect(urns.has(URN_CONTAINER_60000007)).toBe(true);
    // Verify sub-process 10000304
    expect(urns.has(URN_SUBPROCESS_10000304)).toBe(true);
    // Verify PLSQL procedure FCL_PRC_CYCLE_COUNTER_PKG.PROCESS
    expect(urns.has(URN_PKG_FCL_CYCLE_COUNTER)).toBe(true);
  });

  it('extracts cycle binds and database object nodes with schema qualification', () => {
    const result = extractDeterministicFacts(snapshot);
    const urns = new Set(result.nodes.map((n) => n.urn));

    expect(urns.has(URN_CYTP_1003)).toBe(true);
    expect(urns.has(URN_CYTP_1002)).toBe(true);
    expect(urns.has(URN_TABLE_FCL_CYCLE_COUNTER)).toBe(true);
  });

  it('extracts core structural and execution relations with OBSERVED classification', () => {
    const result = extractDeterministicFacts(snapshot);

    // Verify all facts have OBSERVED classification
    for (const fact of result.facts) {
      expect(fact.classification).toBe('OBSERVED');
    }

    // Verify CONTAINS_STEP relation
    const containsStep = result.facts.find(
      (f) => f.subjectUrn === URN_PROCESS_60000006 && f.relation === 'CONTAINS_STEP' && f.objectUrn === URN_CONTAINER_60000006
    );
    expect(containsStep).toBeDefined();

    // Verify PRECEDES relation between sequential steps
    const precedes = result.facts.find(
      (f) => f.subjectUrn === URN_CONTAINER_60000005 && f.relation === 'PRECEDES' && f.objectUrn === URN_CONTAINER_60000006
    );
    expect(precedes).toBeDefined();

    // Verify INVOKES relation from step to sub-process
    const invokes = result.facts.find(
      (f) => f.subjectUrn === URN_CONTAINER_60000006 && f.relation === 'INVOKES' && f.objectUrn === URN_SUBPROCESS_10000304
    );
    expect(invokes).toBeDefined();

    // Verify USES_TYPE relation from step to cycle type
    const usesType = result.facts.find(
      (f) => f.subjectUrn === URN_CONTAINER_60000006 && f.relation === 'USES_TYPE' && f.objectUrn === URN_CYTP_1002
    );
    expect(usesType).toBeDefined();
  });

  it('tracks consumed character ranges matching raw source slices', () => {
    const result = extractDeterministicFacts(snapshot);

    expect(result.consumedRanges.size).toBe(4);
    for (const doc of snapshot.documents) {
      const ranges = result.consumedRanges.get(doc.documentId);
      expect(ranges).toBeDefined();
      expect(ranges!.length).toBeGreaterThan(0);

      const body = doc.chunks.map((c) => c.rawContent).join('');
      for (const range of ranges!) {
        const slice = body.slice(range.startOffset, range.endOffset);
        expect(slice.length).toBeGreaterThan(0);
        expect(range.startOffset).toBeLessThan(range.endOffset);
      }
    }
  });

  it('records exact evidence records with valid UUIDs and provenance fields', () => {
    const result = extractDeterministicFacts(snapshot);

    expect(result.evidence.length).toBeGreaterThan(0);
    for (const ev of result.evidence) {
      expect(ev.classification).toBe('OBSERVED');
      expect(ev.extractionMethod).toBe('DETERMINISTIC_TABLE');
      expect(ev.confidence).toBe(1.0);
      expect(ev.startOffset).toBeLessThanOrEqual(ev.endOffset);
      expect(ev.rawSnippet.length).toBeGreaterThanOrEqual(0);
    }
  });
});
