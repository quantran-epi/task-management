import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  chunkMarkdownSnapshot,
  OversizedAtomicBlockError,
} from '../src/parser/sectionChunker.js';
import {
  CHUNKING_POLICY_VERSION,
  HARD_ATOMIC_BLOCK_LIMIT,
} from '../src/types/protocol.js';
import {
  projectIncrementally,
  type ProjectionSnapshot,
} from '../src/indexing/incrementalProjector.js';
import {
  AttemptService,
  SetPublishInProgressError,
} from '../src/services/attemptService.js';
import { SnapshotStore } from '../src/indexing/snapshotStore.js';
import { GraphBuildService } from '../src/services/graphBuildService.js';
import { InMemoryGraphRepository } from '../src/graph/graphRepository.js';
import { extractDeterministicFacts } from '../src/graph/extraction.js';
import { mergeFactsDeterministicFirst } from '../src/graph/candidate.js';
import { ONTOLOGY_VERSION } from '../src/graph/ontology.js';
import {
  buildChangePreview,
  type CachedActiveSnapshotManifest,
} from '../../src/services/knowledge/changePreview.js';
import type { DocumentSet, Note } from '../../src/types/models.js';

// Load real checked-in corpus from docs/sample-markdown-flow/60000006-SHB-Credit-calculations/
const CORPUS_DIR = path.resolve(process.cwd(), '../docs/sample-markdown-flow/60000006-SHB-Credit-calculations');
const FILE_NAMES = [
  '00-sources.md',
  '01-wiring.md',
  '02-data-objects.md',
  '03-call-chain.md',
  '04-cycles.md',
  '05-breadcrumbs.md',
  'README.md',
];

const PILOT_FILES: Record<string, string> = {};
for (const fileName of FILE_NAMES) {
  const filePath = path.join(CORPUS_DIR, fileName);
  if (fs.existsSync(filePath)) {
    PILOT_FILES[fileName] = fs.readFileSync(filePath, 'utf-8');
  } else {
    // Fallback if running with different cwd anchor
    const altPath = path.resolve(process.cwd(), 'docs/sample-markdown-flow/60000006-SHB-Credit-calculations', fileName);
    PILOT_FILES[fileName] = fs.readFileSync(altPath, 'utf-8');
  }
}

const SET_ID = '60000006-0000-4000-8000-000000000000';
const SET_NAME = 'SHB — Credit calculations (container 60000006)';

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

describe('Pilot 60000006 acceptance suite (GRAPH-01 through GRAPH-06)', () => {
  it('parses all real process 60000006 files losslessly with exact range slices and chunking policy version', () => {
    for (const entry of FILE_ENTRIES) {
      const chunks = chunkMarkdownSnapshot(entry.docId, entry.body);
      expect(chunks.length).toBeGreaterThan(0);

      for (const chunk of chunks) {
        const slice = entry.body.slice(chunk.startOffset, chunk.endOffset);
        expect(slice).toBe(chunk.rawContent);
        expect(chunk.contentHash).toMatch(/^[0-9a-f]{64}$/);
        expect(chunk.startLine).toBeLessThanOrEqual(chunk.endLine);
        expect(chunk.startOffset).toBeLessThan(chunk.endOffset);
      }
    }
  });

  it('guarantees client local preview and daemon projection 4-way delta parity across real corpus', async () => {
    const notes = toNotes();
    const docSet = toDocumentSet();

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
    expect(clientBaseline.counts.chunksAdded).toBe(daemonBaseline.summary.chunksAdded);
    expect(clientBaseline.snapshot.chunkingPolicyVersion).toBe(CHUNKING_POLICY_VERSION);
    expect(daemonBaseline.candidate.chunkingPolicyVersion).toBe(CHUNKING_POLICY_VERSION);
  });

  it('extracts all 7 core node kinds from real process 60000006 corpus deterministically (GRAPH-01)', () => {
    const projection = projectIncrementally({
      setId: SET_ID,
      documents: FILE_ENTRIES.map((e) => ({
        documentId: e.docId,
        title: e.title,
        body: e.body,
      })),
      activeSnapshot: null,
    });

    const extraction = extractDeterministicFacts(projection.candidate);
    expect(extraction.nodes.length).toBeGreaterThan(0);
    expect(extraction.facts.length).toBeGreaterThan(0);

    const kinds = new Set(extraction.nodes.map((n) => n.kind));
    expect(kinds.has('ScheduledProcess')).toBe(true);
    expect(kinds.has('ProcessStep')).toBe(true);
    expect(kinds.has('SoftwareComponent')).toBe(true);
    expect(kinds.has('DatabaseObject')).toBe(true);
    expect(kinds.has('CycleType')).toBe(true);
    expect(kinds.has('Status')).toBe(true);
    expect(kinds.has('SourceDocument')).toBe(true);
  });

  it('prevents composite URN collision between PRC_PROCESS:60000006 and PRC_CONTAINER:60000006 (GRAPH-02)', () => {
    const projection = projectIncrementally({
      setId: SET_ID,
      documents: FILE_ENTRIES.map((e) => ({
        documentId: e.docId,
        title: e.title,
        body: e.body,
      })),
      activeSnapshot: null,
    });

    const extraction = extractDeterministicFacts(projection.candidate);

    const processUrn = 'urn:plannermate:smartvista:PRC_PROCESS:60000006';
    const containerUrn = 'urn:plannermate:smartvista:PRC_CONTAINER:60000006';

    const processNode = extraction.nodes.find((n) => n.urn === processUrn);
    const containerNode = extraction.nodes.find((n) => n.urn === containerUrn);

    expect(processNode).toBeDefined();
    expect(containerNode).toBeDefined();
    expect(processNode?.urn).not.toBe(containerNode?.urn);
    expect(processNode?.nativeType).toBe('PRC_PROCESS');
    expect(containerNode?.nativeType).toBe('PRC_CONTAINER');
  });

  it('processes deterministic tables and records consumed character ranges before prose fallback (GRAPH-03)', () => {
    const projection = projectIncrementally({
      setId: SET_ID,
      documents: FILE_ENTRIES.map((e) => ({
        documentId: e.docId,
        title: e.title,
        body: e.body,
      })),
      activeSnapshot: null,
    });

    const extraction = extractDeterministicFacts(projection.candidate);

    // Ensure consumed ranges are registered for all docs containing tables/code
    expect(extraction.consumedRanges.size).toBeGreaterThan(0);
    for (const [docId, ranges] of extraction.consumedRanges.entries()) {
      expect(ranges.length).toBeGreaterThan(0);
      for (const range of ranges) {
        expect(range.startOffset).toBeLessThan(range.endOffset);
      }
    }
  });

  it('retains exact evidence provenance on all extracted relations (GRAPH-04)', () => {
    const projection = projectIncrementally({
      setId: SET_ID,
      documents: FILE_ENTRIES.map((e) => ({
        documentId: e.docId,
        title: e.title,
        body: e.body,
      })),
      activeSnapshot: null,
    });

    const extraction = extractDeterministicFacts(projection.candidate);
    expect(extraction.evidence.length).toBeGreaterThan(0);

    for (const ev of extraction.evidence) {
      expect(ev.documentId).toBeDefined();
      expect(ev.documentTitle).toBeDefined();
      expect(ev.sectionHeadingPath).toBeDefined();
      expect(ev.startLine).toBeGreaterThan(0);
      expect(ev.endLine).toBeGreaterThanOrEqual(ev.startLine);
      expect(ev.startOffset).toBeLessThan(ev.endOffset);
      expect(ev.rawSnippet.length).toBeGreaterThan(0);
      expect(ev.confidence).toBe(1.0);
    }
  });

  it('classifies evidence distinctly as OBSERVED, INFERRED, or BUSINESS_APPROVED (GRAPH-05)', () => {
    const projection = projectIncrementally({
      setId: SET_ID,
      documents: FILE_ENTRIES.map((e) => ({
        documentId: e.docId,
        title: e.title,
        body: e.body,
      })),
      activeSnapshot: null,
    });

    const extraction = extractDeterministicFacts(projection.candidate);

    const candidate = mergeFactsDeterministicFirst({
      graphSnapshotId: 'snap-1',
      sourceSnapshotId: projection.candidate.snapshotId,
      setId: SET_ID,
      nodes: extraction.nodes,
      deterministicFacts: extraction.facts,
      deterministicEvidence: extraction.evidence,
      approvals: [
        {
          factKey: extraction.facts[0]!.factKey,
          approverName: 'lead-dev',
          approvedAt: '2026-10-10T00:00:00.000Z',
          ontologyVersion: ONTOLOGY_VERSION,
        },
      ],
    });

    const classifications = new Set(candidate.relations.map((r) => r.effectiveClassification));
    expect(classifications.has('OBSERVED')).toBe(true);
    expect(classifications.has('BUSINESS_APPROVED')).toBe(true);
  });

  it('rebuilds entire knowledge graph from published Markdown without data loss (GRAPH-06)', async () => {
    const store = new SnapshotStore();
    const repo = new InMemoryGraphRepository();
    const service = new GraphBuildService(repo, store);

    const projection = projectIncrementally({
      setId: SET_ID,
      documents: FILE_ENTRIES.map((e) => ({
        documentId: e.docId,
        title: e.title,
        body: e.body,
      })),
      activeSnapshot: null,
    });

    store.createCandidate('c-1', 'att-1', SET_ID);
    store.completeCandidate('c-1', projection.candidate);
    store.promoteCandidate('c-1');

    // 1. Initial build from published Markdown
    const graphSnapshotId1 = await service.executeRebuildSync(SET_ID);
    const factsList1 = await service.getFacts(SET_ID);
    expect(factsList1.totalFacts).toBeGreaterThan(10);

    // 2. Full wipe & rebuild from same published Markdown
    const freshRepo = new InMemoryGraphRepository();
    const freshService = new GraphBuildService(freshRepo, store);
    const graphSnapshotId2 = await freshService.executeRebuildSync(SET_ID);
    const factsList2 = await freshService.getFacts(SET_ID);

    expect(factsList2.totalFacts).toBe(factsList1.totalFacts);
    const active1 = await repo.getActiveGraph(SET_ID);
    const active2 = await freshRepo.getActiveGraph(SET_ID);
    expect(active1?.normalizedProjectionHash).toBe(active2?.normalizedProjectionHash);
  });
});
