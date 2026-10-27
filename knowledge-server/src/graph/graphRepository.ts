import { createHash, randomUUID } from 'node:crypto';
import type {
  ActiveGraphView,
  FactDetail,
  GraphCandidate,
  QuarantinedIdentifier,
  RetrievalGenerationMetadata,
  PinnedRetrievalSnapshot,
} from '../types/graphProtocol.js';
import type { ChunkItem } from '../types/retrievalProtocol.js';
import type { ProjectionSnapshot } from '../indexing/incrementalProjector.js';
import type { EmbeddingProvider } from '../retrieval/contracts.js';

export const RETRIEVAL_GENERATION_GRACE_MS = 600000; // 10 minutes per D-24

export const DEFAULT_RETRIEVAL_BATCH_SIZE = 32;

export function getRetrievalBatchSize(): number {
  const envVal = process.env.RETRIEVAL_BATCH_SIZE;
  if (!envVal) return DEFAULT_RETRIEVAL_BATCH_SIZE;
  const parsed = parseInt(envVal, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_RETRIEVAL_BATCH_SIZE;
  return Math.max(10, Math.min(100, parsed));
}

/**
 * Builds deterministic 16-character hex token from graph snapshot ID.
 */
export function deriveGenerationToken(graphSnapshotId: string): string {
  const hash = createHash('sha256').update(graphSnapshotId, 'utf8').digest('hex');
  return hash.slice(0, 16);
}

export interface ChunkNodeRecord {
  chunkKey: string;
  documentId: string;
  documentTitle: string;
  publishedContentHash: string;
  headingPath: string[];
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
  rawContent: string;
  embedding?: number[] | undefined;
  graphSnapshotId: string;
}

/**
 * Graph Repository contract defining operations against the projected graph and retrieval generation.
 */
export interface GraphRepository {
  /**
   * Writes candidate graph nodes, facts, evidence occurrences, conflicts, and quarantines in isolation.
   */
  writeCandidate(candidate: GraphCandidate): Promise<void>;

  /**
   * Builds retrieval generation (chunks, fulltext index, vector index) before atomic activation.
   */
  buildRetrievalGeneration(
    candidate: GraphCandidate,
    sourceSnapshot: ProjectionSnapshot,
    embeddingProvider?: EmbeddingProvider | undefined
  ): Promise<RetrievalGenerationMetadata>;

  /**
   * Validates retrieval generation readiness (counts, dimensions, online status).
   */
  validateRetrievalGeneration(graphSnapshotId: string): Promise<boolean>;

  /**
   * Atomically switches the set's active graph pointer to the specified graph snapshot.
   */
  activateCandidate(setId: string, graphSnapshotId: string): Promise<void>;

  /**
   * Retrieves the current active graph metadata for a document set.
   */
  getActiveGraph(setId: string): Promise<ActiveGraphView | null>;

  /**
   * Retrieves all projected facts and their provenance details for a given graph snapshot.
   */
  getFacts(graphSnapshotId: string): Promise<FactDetail[]>;

  /**
   * Retrieves all quarantined identifiers captured during extraction for a given graph snapshot.
   */
  getQuarantines(graphSnapshotId: string): Promise<QuarantinedIdentifier[]>;

  /**
   * Acquires a lease on the active snapshot, guaranteeing retention during retrieval.
   */
  acquirePinnedSnapshot(setId: string): Promise<PinnedRetrievalSnapshot | null>;

  /**
   * Releases an acquired snapshot lease.
   */
  releasePinnedSnapshot(leaseId: string): Promise<void>;

  /**
   * Queries full-text lexical chunks scoped to snapshotId.
   */
  queryFullText(snapshotId: string, query: string, limit: number): Promise<ChunkItem[]>;

  /**
   * Queries vector semantic chunks scoped to snapshotId.
   */
  queryVector(snapshotId: string, queryVector: readonly number[], limit: number): Promise<ChunkItem[]>;

  /**
   * Fetches chunks belonging to the given documents in the snapshot, in document order.
   */
  queryChunksByDocument(snapshotId: string, documentIds: readonly string[], limit: number): Promise<ChunkItem[]>;

  /**
   * Cleans up superseded generation indexes/nodes where grace period elapsed and active lease count is zero.
   * Returns number of generations cleaned.
   */
  cleanupSupersededGenerations(now?: number, gracePeriodMs?: number): Promise<number>;

  /**
   * Purges all graph data, snapshots, candidates, generations, and leases for a specific document set.
   */
  purgeSet?(setId: string): Promise<boolean>;
}

interface StoredGeneration {
  metadata: RetrievalGenerationMetadata;
  chunks: ChunkNodeRecord[];
  activeLeases: Set<string>;
  supersededAt?: number | undefined;
}

/**
 * In-memory Graph Repository for fast offline unit tests without requiring live Neo4j daemon.
 */
export class InMemoryGraphRepository implements GraphRepository {
  private candidates = new Map<string, GraphCandidate>();
  private activeGraphPointers = new Map<string, string>(); // setId -> graphSnapshotId
  private activeViews = new Map<string, ActiveGraphView>(); // setId -> ActiveGraphView
  private generations = new Map<string, StoredGeneration>(); // graphSnapshotId -> StoredGeneration
  private leases = new Map<string, { leaseId: string; graphSnapshotId: string; setId: string }>(); // leaseId -> lease

  async writeCandidate(candidate: GraphCandidate): Promise<void> {
    this.candidates.set(candidate.graphSnapshotId, candidate);
  }

  async buildRetrievalGeneration(
    candidate: GraphCandidate,
    sourceSnapshot: ProjectionSnapshot,
    embeddingProvider?: EmbeddingProvider | undefined
  ): Promise<RetrievalGenerationMetadata> {
    const token = deriveGenerationToken(candidate.graphSnapshotId);
    const fulltextIndexName = `chunk_fulltext_${token}`;
    const vectorIndexName = `chunk_vector_${token}`;

    const chunkRecords: ChunkNodeRecord[] = [];

    for (const doc of sourceSnapshot.documents) {
      for (const c of doc.chunks) {
        chunkRecords.push({
          chunkKey: c.occurrenceId, // occurrenceId as unique chunkKey
          documentId: doc.documentId,
          documentTitle: doc.title,
          publishedContentHash: doc.contentHash,
          headingPath: [...c.headingPath],
          startLine: c.startLine,
          endLine: c.endLine,
          startOffset: c.startOffset,
          endOffset: c.endOffset,
          rawContent: c.rawContent,
          graphSnapshotId: candidate.graphSnapshotId,
        });
      }
    }

    const embeddingMetadata = embeddingProvider?.describe();
    const hasVectors = Boolean(embeddingProvider && chunkRecords.length > 0);
    const batchSize = getRetrievalBatchSize();

    if (embeddingProvider && chunkRecords.length > 0) {
      for (let i = 0; i < chunkRecords.length; i += batchSize) {
        const batchSlice = chunkRecords.slice(i, i + batchSize);
        const batchTexts = batchSlice.map((c) => c.rawContent);
        const vectors = await embeddingProvider.embedDocuments(batchTexts);
        if (vectors.length !== batchSlice.length) {
          throw new Error('EMBEDDING_COUNT_MISMATCH: Batch length mismatch');
        }

        const expectedDim = embeddingMetadata?.dimensions;
        for (let j = 0; j < vectors.length; j++) {
          const vec = vectors[j]!;
          if (expectedDim && vec.length !== expectedDim) {
            throw new Error(`DIMENSION_MISMATCH: Expected ${expectedDim}, got ${vec.length}`);
          }
          batchSlice[j]!.embedding = vec;
        }

        // Yield event loop between batches
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    const metadata: RetrievalGenerationMetadata = {
      graphSnapshotId: candidate.graphSnapshotId,
      sourceSnapshotId: candidate.sourceSnapshotId,
      fulltextIndexName,
      vectorIndexName,
      embeddingMetadata,
      chunkCount: chunkRecords.length,
      hasVectors,
      builtAt: new Date().toISOString(),
    };

    this.generations.set(candidate.graphSnapshotId, {
      metadata,
      chunks: chunkRecords,
      activeLeases: new Set(),
    });

    return metadata;
  }

  async validateRetrievalGeneration(graphSnapshotId: string): Promise<boolean> {
    const gen = this.generations.get(graphSnapshotId);
    if (!gen) return false;
    if (gen.metadata.hasVectors) {
      const expectedDim = gen.metadata.embeddingMetadata?.dimensions;
      for (const c of gen.chunks) {
        if (!c.embedding || (expectedDim && c.embedding.length !== expectedDim)) {
          return false;
        }
      }
    }
    return true;
  }

  async activateCandidate(setId: string, graphSnapshotId: string): Promise<void> {
    const candidate = this.candidates.get(graphSnapshotId);
    if (!candidate) {
      throw new Error(`Candidate ${graphSnapshotId} not found`);
    }
    if (candidate.setId !== setId) {
      throw new Error(`Candidate setId ${candidate.setId} does not match target ${setId}`);
    }

    const previousSnapshotId = this.activeGraphPointers.get(setId);
    if (previousSnapshotId && previousSnapshotId !== graphSnapshotId) {
      const prevGen = this.generations.get(previousSnapshotId);
      if (prevGen && !prevGen.supersededAt) {
        prevGen.supersededAt = Date.now();
      }
    }

    this.activeGraphPointers.set(setId, graphSnapshotId);

    const approvedCount = candidate.relations.filter(
      (r) => r.effectiveClassification === 'BUSINESS_APPROVED'
    ).length;

    const gen = this.generations.get(graphSnapshotId);

    const view: ActiveGraphView = {
      setId,
      graphSnapshotId,
      sourceSnapshotId: candidate.sourceSnapshotId,
      ontologyVersion: candidate.ontologyVersion,
      normalizedProjectionHash: candidate.normalizedProjectionHash,
      activatedAt: new Date().toISOString(),
      nodeCount: candidate.nodes.length,
      relationCount: candidate.relations.length,
      factCount: candidate.relations.length,
      conflictCount: candidate.conflicts.length,
      quarantineCount: candidate.quarantines.length,
      approvedFactCount: approvedCount,
      evidenceCount: new Set(candidate.evidence.map((evidence) => evidence.factKey)).size,
      retrievalGeneration: gen?.metadata,
    };

    this.activeViews.set(setId, view);
  }

  async getActiveGraph(setId: string): Promise<ActiveGraphView | null> {
    return this.activeViews.get(setId) || null;
  }

  async getFacts(graphSnapshotId: string): Promise<FactDetail[]> {
    const candidate = this.candidates.get(graphSnapshotId);
    if (!candidate) return [];

    const evidenceByFactKey = new Map<string, typeof candidate.evidence>();
    for (const ev of candidate.evidence) {
      const list = evidenceByFactKey.get(ev.factKey) || [];
      list.push(ev);
      evidenceByFactKey.set(ev.factKey, list);
    }

    const conflictsByFactKey = new Map<string, typeof candidate.conflicts>();
    for (const conf of candidate.conflicts) {
      const listA = conflictsByFactKey.get(conf.factKeyA) || [];
      listA.push(conf);
      conflictsByFactKey.set(conf.factKeyA, listA);

      const listB = conflictsByFactKey.get(conf.factKeyB) || [];
      listB.push(conf);
      conflictsByFactKey.set(conf.factKeyB, listB);
    }

    const approvalsByFactKey = new Map<string, typeof candidate.approvals>();
    for (const app of candidate.approvals) {
      const list = approvalsByFactKey.get(app.factKey) || [];
      list.push(app);
      approvalsByFactKey.set(app.factKey, list);
    }

    const nodeByUrn = new Map<string, (typeof candidate.nodes)[number]>();
    for (const node of candidate.nodes) {
      nodeByUrn.set(node.urn, node);
    }

    return candidate.relations.map((relation) => {
      const subjectNode = nodeByUrn.get(relation.subjectUrn);
      const objectNode = nodeByUrn.get(relation.objectUrn);

      return {
        relation,
        evidence: evidenceByFactKey.get(relation.factKey) || [],
        conflicts: conflictsByFactKey.get(relation.factKey) || [],
        approvals: approvalsByFactKey.get(relation.factKey) || [],
        subjectCanonicalName: subjectNode?.canonicalName || relation.subjectUrn,
        subjectKind: subjectNode?.kind || 'Entity',
        objectCanonicalName: objectNode?.canonicalName || relation.objectUrn,
        objectKind: objectNode?.kind || 'Entity',
      };
    });
  }

  async getQuarantines(graphSnapshotId: string): Promise<QuarantinedIdentifier[]> {
    const candidate = this.candidates.get(graphSnapshotId);
    return candidate ? [...candidate.quarantines] : [];
  }

  async acquirePinnedSnapshot(setId: string): Promise<PinnedRetrievalSnapshot | null> {
    const active = await this.getActiveGraph(setId);
    if (!active || !active.retrievalGeneration) {
      return null;
    }

    const gen = this.generations.get(active.graphSnapshotId);
    if (!gen) {
      return null;
    }

    const leaseId = randomUUID();
    gen.activeLeases.add(leaseId);
    this.leases.set(leaseId, { leaseId, graphSnapshotId: active.graphSnapshotId, setId });

    return {
      leaseId,
      snapshotId: active.graphSnapshotId,
      setId,
      generation: gen.metadata,
      acquiredAt: new Date().toISOString(),
      release: () => this.releasePinnedSnapshot(leaseId),
    };
  }

  async releasePinnedSnapshot(leaseId: string): Promise<void> {
    const record = this.leases.get(leaseId);
    if (!record) return;

    this.leases.delete(leaseId);
    const gen = this.generations.get(record.graphSnapshotId);
    if (gen) {
      gen.activeLeases.delete(leaseId);
    }
  }

  async queryFullText(snapshotId: string, query: string, limit: number): Promise<ChunkItem[]> {
    const gen = this.generations.get(snapshotId);
    if (!gen) return [];

    const lowerQuery = query.toLowerCase();
    const hits: ChunkItem[] = [];

    for (const c of gen.chunks) {
      if (c.rawContent.toLowerCase().includes(lowerQuery)) {
        hits.push({
          type: 'chunk',
          id: c.chunkKey,
          score: 1.0,
          modalitiesContributed: ['fulltext'],
          sourceDocumentId: c.documentId,
          sourceDocumentTitle: c.documentTitle,
          sectionAnchor: c.headingPath.join(' > '),
          lineStart: c.startLine,
          lineEnd: c.endLine,
          rawSnippet: c.rawContent,
          publishedContentHash: c.publishedContentHash,
          snapshotId,
          hasConflict: false,
        });
        if (hits.length >= limit) break;
      }
    }

    return hits;
  }

  async queryVector(snapshotId: string, queryVector: readonly number[], limit: number): Promise<ChunkItem[]> {
    const gen = this.generations.get(snapshotId);
    if (!gen || !gen.metadata.hasVectors) return [];

    // Cosine similarity ranking
    const scored: Array<{ chunk: ChunkNodeRecord; score: number }> = [];

    for (const c of gen.chunks) {
      if (!c.embedding) continue;
      let dot = 0;
      let normA = 0;
      let normB = 0;
      for (let i = 0; i < queryVector.length; i++) {
        const a = queryVector[i]!;
        const b = c.embedding[i]!;
        dot += a * b;
        normA += a * a;
        normB += b * b;
      }
      const sim = (normA > 0 && normB > 0) ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
      scored.push({ chunk: c, score: Math.max(0, sim) });
    }

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map(({ chunk, score }) => ({
      type: 'chunk',
      id: chunk.chunkKey,
      score: score > 0 ? score : 0.001,
      modalitiesContributed: ['vector'],
      sourceDocumentId: chunk.documentId,
      sourceDocumentTitle: chunk.documentTitle,
      sectionAnchor: chunk.headingPath.join(' > '),
      lineStart: chunk.startLine,
      lineEnd: chunk.endLine,
      rawSnippet: chunk.rawContent,
      publishedContentHash: chunk.publishedContentHash,
      snapshotId,
      hasConflict: false,
    }));
  }

  async queryChunksByDocument(
    snapshotId: string,
    documentIds: readonly string[],
    limit: number
  ): Promise<ChunkItem[]> {
    const gen = this.generations.get(snapshotId);
    if (!gen || documentIds.length === 0) return [];
    const wanted = new Set(documentIds);

    const hits: ChunkItem[] = [];
    for (const c of gen.chunks) {
      if (!wanted.has(c.documentId)) continue;
      hits.push({
        type: 'chunk',
        id: c.chunkKey,
        score: 1.0,
        modalitiesContributed: ['graph'],
        sourceDocumentId: c.documentId,
        sourceDocumentTitle: c.documentTitle,
        sectionAnchor: c.headingPath.join(' > '),
        lineStart: c.startLine,
        lineEnd: c.endLine,
        rawSnippet: c.rawContent,
        publishedContentHash: c.publishedContentHash,
        snapshotId,
        hasConflict: false,
      });
      if (hits.length >= limit) break;
    }

    return hits;
  }

  async cleanupSupersededGenerations(
    now: number = Date.now(),
    gracePeriodMs: number = RETRIEVAL_GENERATION_GRACE_MS
  ): Promise<number> {
    let cleaned = 0;

    for (const [snapshotId, gen] of this.generations.entries()) {
      if (!gen.supersededAt) continue; // Not superseded
      if (gen.activeLeases.size > 0) continue; // Active leases held
      if (now - gen.supersededAt < gracePeriodMs) continue; // In grace period

      this.generations.delete(snapshotId);
      cleaned++;
    }

    return cleaned;
  }

  async purgeSet(setId: string): Promise<boolean> {
    let purged = false;
    if (this.activeGraphPointers.has(setId)) {
      this.activeGraphPointers.delete(setId);
      purged = true;
    }
    if (this.activeViews.has(setId)) {
      this.activeViews.delete(setId);
      purged = true;
    }
    for (const [key, candidate] of this.candidates.entries()) {
      if (candidate.setId === setId) {
        this.candidates.delete(key);
        this.generations.delete(candidate.graphSnapshotId);
        purged = true;
      }
    }
    for (const [leaseId, lease] of this.leases.entries()) {
      if (lease.setId === setId) {
        this.leases.delete(leaseId);
      }
    }
    return purged;
  }
}
