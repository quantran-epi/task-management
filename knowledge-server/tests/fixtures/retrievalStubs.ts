import type {
  EmbeddingProvider,
  QueryPlanner,
  RetrievalIndexGateway,
  GraphRetrievalGateway,
  PinnedSnapshotLease,
  QueryPlanResult,
  QueryPlannerContext,
  GraphTraversalResult,
  GraphTraversalCriteria,
  FulltextQueryCriteria,
  VectorQueryCriteria,
  OperationOptions,
} from '../../src/retrieval/contracts.js';
import type {
  EmbeddingProviderMetadata,
  RetrievalRequest,
  LogicalQueryPlan,
  ChunkItem,
  EntityItem,
  EdgeItem,
  ClarificationCandidate,
} from '../../src/types/retrievalProtocol.js';

/**
 * Deterministic 384-dimensional embedding stub without network or model dependencies.
 */
export class DeterministicEmbeddingStub implements EmbeddingProvider {
  public embedDocumentsCalls: string[][] = [];
  public embedQueryCalls: string[] = [];
  public failNextWith: Error | null = null;
  public simulatedLatencyMs: number = 0;

  constructor(
    private readonly metadata: EmbeddingProviderMetadata = {
      provider: 'local-onnx',
      model: 'multilingual-e5-small',
      revision: 'v1.0.0',
      dimensions: 384,
      policyVersion: '2026.10.1',
    }
  ) {}

  describe(): EmbeddingProviderMetadata {
    return this.metadata;
  }

  private generateVector(seed: string): number[] {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash << 5) - hash + seed.charCodeAt(i);
      hash |= 0;
    }
    const vector: number[] = new Array(this.metadata.dimensions);
    for (let i = 0; i < this.metadata.dimensions; i++) {
      // Deterministic finite numbers in range [-1, 1]
      vector[i] = Math.sin(hash + i);
    }
    return vector;
  }

  private async checkLatencyAndFailure(options?: OperationOptions): Promise<void> {
    if (options?.signal?.aborted) {
      throw new Error('Operation aborted');
    }
    if (this.simulatedLatencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.simulatedLatencyMs));
    }
    if (options?.signal?.aborted) {
      throw new Error('Operation aborted');
    }
    if (this.failNextWith) {
      const err = this.failNextWith;
      this.failNextWith = null;
      throw err;
    }
  }

  async embedDocuments(
    texts: readonly string[],
    options?: OperationOptions
  ): Promise<number[][]> {
    await this.checkLatencyAndFailure(options);
    this.embedDocumentsCalls.push([...texts]);
    return texts.map((t) => this.generateVector(t));
  }

  async embedQuery(text: string, options?: OperationOptions): Promise<number[]> {
    await this.checkLatencyAndFailure(options);
    this.embedQueryCalls.push(text);
    return this.generateVector(text);
  }
}

/**
 * Deterministic query planner stub with scripted outcomes and call records.
 */
export class DeterministicPlannerStub implements QueryPlanner {
  public planCalls: Array<{ request: RetrievalRequest; context: QueryPlannerContext }> = [];
  public scriptedResult: QueryPlanResult | null = null;
  public failNextWith: Error | null = null;
  public simulatedLatencyMs: number = 0;

  async plan(
    request: RetrievalRequest,
    context: QueryPlannerContext,
    options?: OperationOptions
  ): Promise<QueryPlanResult> {
    if (options?.signal?.aborted) {
      throw new Error('Planner aborted');
    }
    if (this.simulatedLatencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.simulatedLatencyMs));
    }
    if (options?.signal?.aborted) {
      throw new Error('Planner aborted');
    }
    if (this.failNextWith) {
      const err = this.failNextWith;
      this.failNextWith = null;
      throw err;
    }

    this.planCalls.push({ request, context });

    if (this.scriptedResult) {
      return this.scriptedResult;
    }

    // Default fallback: single seed lookup or clarification
    if (context.resolvedCandidates.length === 1) {
      const seed = context.resolvedCandidates[0]!;
      const defaultPlan: LogicalQueryPlan = {
        planId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        queryIntent: 'LOOKUP',
        seedUrns: [seed.urn],
        traversalSteps: [],
        overallMaxDepth: 1,
        includeInferred: false,
        fulltextKeywords: [seed.canonicalName],
        semanticQuery: request.query,
      };
      return { type: 'plan', plan: defaultPlan };
    }

    if (context.resolvedCandidates.length > 1) {
      return { type: 'clarification', candidates: context.resolvedCandidates };
    }

    return {
      type: 'unsupported',
      reason: 'No recognized seed in query',
      unsupportedConstructs: [],
    };
  }
}

/**
 * Deterministic retrieval index stub with snapshot leasing and mock search.
 */
export class DeterministicIndexGatewayStub implements RetrievalIndexGateway {
  public activeSnapshotId: string = 'snapshot-test-01';
  public fulltextChunks: ChunkItem[] = [];
  public vectorChunks: ChunkItem[] = [];
  public activeLeases: Set<string> = new Set();
  public cleanupCount: number = 0;

  async acquirePinnedSnapshot(setId: string): Promise<PinnedSnapshotLease | null> {
    if (!this.activeSnapshotId) return null;
    const leaseId = `lease-${Date.now()}-${Math.random()}`;
    this.activeLeases.add(leaseId);
    return {
      snapshotId: this.activeSnapshotId,
      setId,
      acquiredAt: new Date().toISOString(),
      release: async () => {
        this.activeLeases.delete(leaseId);
      },
    };
  }

  async queryFulltext(
    snapshotId: string,
    criteria: FulltextQueryCriteria,
    options?: OperationOptions
  ): Promise<ChunkItem[]> {
    if (options?.signal?.aborted) throw new Error('Fulltext query aborted');
    return this.fulltextChunks.slice(0, criteria.limit);
  }

  async queryVector(
    snapshotId: string,
    criteria: VectorQueryCriteria,
    options?: OperationOptions
  ): Promise<ChunkItem[]> {
    if (options?.signal?.aborted) throw new Error('Vector query aborted');
    return this.vectorChunks.slice(0, criteria.limit);
  }

  async validateVectorIndexMetadata(
    snapshotId: string,
    metadata: EmbeddingProviderMetadata
  ): Promise<boolean> {
    return metadata.dimensions === 384;
  }

  async cleanupSupersededSnapshots(setId: string, gracePeriodMs: number): Promise<number> {
    return this.cleanupCount;
  }
}

/**
 * Deterministic graph retrieval gateway stub.
 */
export class DeterministicGraphGatewayStub implements GraphRetrievalGateway {
  public mockCandidates: ClarificationCandidate[] = [];
  public mockEntities: EntityItem[] = [];
  public mockEdges: EdgeItem[] = [];
  public isTruncated: boolean = false;

  async resolveEntities(
    snapshotId: string,
    queryTokens: readonly string[],
    options?: OperationOptions
  ): Promise<ClarificationCandidate[]> {
    if (options?.signal?.aborted) throw new Error('Entity resolution aborted');
    return this.mockCandidates;
  }

  async traverse(
    snapshotId: string,
    criteria: GraphTraversalCriteria,
    options?: OperationOptions
  ): Promise<GraphTraversalResult> {
    if (options?.signal?.aborted) throw new Error('Graph traversal aborted');
    return {
      entities: this.mockEntities.slice(0, criteria.limitNodes),
      edges: this.mockEdges.slice(0, criteria.limitEdges),
      truncated: this.isTruncated,
      truncationReason: this.isTruncated ? 'RESULT_LIMIT_REACHED' : undefined,
    };
  }
}
