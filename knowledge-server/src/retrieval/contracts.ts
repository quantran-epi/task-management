import type {
  LogicalQueryPlan,
  RetrievalRequest,
  EmbeddingProviderMetadata,
  ChunkItem,
  EntityItem,
  EdgeItem,
  ClarificationCandidate,
} from '../types/retrievalProtocol.js';
import type { Urn, NodeKind, RelationType, EvidenceClassification } from '../types/graphProtocol.js';
import type { PlanValidationReasonCode } from './retrievalPlanDerivation.js';

export type { PlanValidationReasonCode };

/**
 * Common cancellation / timeout options accepted across all external collaborators.
 */
export interface OperationOptions {
  readonly signal?: AbortSignal | undefined;
  readonly timeoutMs?: number | undefined;
}

/**
 * Provider-neutral interface for semantic vector embeddings (D-07, D-09, D-10).
 * Implemented by LocalOnnxAdapter and RemoteOpenAiAdapter in downstream plans.
 */
export interface EmbeddingProvider {
  /**
   * Describes the provider/model/dimensions metadata for validation against index generation (D-09).
   */
  describe(): EmbeddingProviderMetadata;

  /**
   * Generates embeddings for a batch of markdown document chunks.
   * Rejects empty batch or empty strings.
   */
  embedDocuments(texts: readonly string[], options?: OperationOptions): Promise<number[][]>;

  /**
   * Generates embedding vector for a single search query.
   */
  embedQuery(text: string, options?: OperationOptions): Promise<number[]>;
}

/**
 * Planning context provided server-side to the query planner (D-05, D-16).
 */
export interface QueryPlannerContext {
  readonly resolvedCandidates: readonly ClarificationCandidate[];
  readonly registeredNodeKinds: readonly NodeKind[];
  readonly registeredRelationTypes: readonly RelationType[];
  /**
   * Set only on the single bounded repair call. Carries stable reason codes and
   * nothing else (no Cypher, secrets, source content, or raw error detail).
   */
  readonly repair?: { readonly attempt: 1; readonly reasonCodes: readonly PlanValidationReasonCode[] } | undefined;
}

/**
 * Outcome of the query planning step.
 * Planner either returns a validated LogicalQueryPlan, or requests clarification if seeds/terms are ambiguous (D-04).
 */
export type QueryPlanResult =
  | { readonly type: 'plan'; readonly plan: LogicalQueryPlan; readonly repaired?: boolean | undefined }
  | { readonly type: 'clarification'; readonly candidates: readonly ClarificationCandidate[] }
  | { readonly type: 'unsupported'; readonly reason: string; readonly unsupportedConstructs: readonly string[] };

/**
 * Provider-neutral interface for query planning (D-02, D-05, D-16).
 * Translates natural language into a strict logical plan referencing only closed ontology and resolved URNs.
 */
export interface QueryPlanner {
  /**
   * Generates a logical query plan or clarification candidates.
   */
  plan(
    request: RetrievalRequest,
    context: QueryPlannerContext,
    options?: OperationOptions
  ): Promise<QueryPlanResult>;
}

/**
 * Full-text search criteria for index gateway.
 */
export interface FulltextQueryCriteria {
  readonly keywords: readonly string[];
  readonly limit: number;
}

/**
 * Vector similarity search criteria for index gateway.
 */
export interface VectorQueryCriteria {
  readonly vector: readonly number[];
  readonly limit: number;
}

/**
 * Active snapshot lease contract per D-24.
 * Guarantees pinned snapshot remains accessible for the duration of the query.
 */
export interface PinnedSnapshotLease {
  readonly snapshotId: string;
  readonly setId: string;
  readonly acquiredAt: string;
  release(): Promise<void>;
}

/**
 * Provider-neutral gateway for index operations (full-text Lucene, Neo4j vector index, snapshot leases) (D-08, D-24).
 */
export interface RetrievalIndexGateway {
  /**
   * Pins active snapshot for request lifetime (D-24). Returns null if no active snapshot exists.
   */
  acquirePinnedSnapshot(setId: string): Promise<PinnedSnapshotLease | null>;

  /**
   * Queries full-text Lucene index for chunk items in the pinned snapshot.
   */
  queryFulltext(
    snapshotId: string,
    criteria: FulltextQueryCriteria,
    options?: OperationOptions
  ): Promise<ChunkItem[]>;

  /**
   * Queries vector index on Chunk nodes for chunk items in the pinned snapshot.
   */
  queryVector(
    snapshotId: string,
    criteria: VectorQueryCriteria,
    options?: OperationOptions
  ): Promise<ChunkItem[]>;

  /**
   * Verifies that the vector index for snapshotId matches the given provider metadata (D-09).
   */
  validateVectorIndexMetadata(
    snapshotId: string,
    metadata: EmbeddingProviderMetadata
  ): Promise<boolean>;

  /**
   * Cleans up superseded generation indexes/nodes once grace period expired and leases hit zero (D-24).
   */
  cleanupSupersededSnapshots(setId: string, gracePeriodMs: number): Promise<number>;
}

/**
 * Graph traversal criteria derived from LogicalQueryPlan.
 */
export interface GraphTraversalCriteria {
  readonly seedUrns: readonly Urn[];
  readonly plan: LogicalQueryPlan;
  readonly evidenceClasses: readonly EvidenceClassification[];
  readonly limitNodes: number;
  readonly limitEdges: number;
}

/**
 * Result of graph traversal containing reached entities and traversed edges.
 */
export interface GraphTraversalPathRecord {
  readonly nodeUrns: readonly Urn[];
  readonly edgeFactKeys: readonly string[];
  readonly hopClassifications: readonly EvidenceClassification[];
  readonly hopSupportingChunkIds: readonly (readonly string[])[];
  readonly edgeSnapshotIds: readonly string[];
  readonly hasConflict: boolean;
}

export interface GraphTraversalResult {
  readonly chunks?: readonly ChunkItem[] | undefined;
  readonly entities: readonly EntityItem[];
  readonly edges: readonly EdgeItem[];
  /**
   * Resolved seed entities, kept independent of path completion so a seed with
   * zero matching edges still reaches the response (D-01, SC-2). Typed as
   * EntityItem so snapshot identity travels with the seed.
   */
  readonly seedEntities?: readonly EntityItem[] | undefined;
  readonly paths?: readonly GraphTraversalPathRecord[] | undefined;
  readonly truncated: boolean;
  readonly truncationReason?: string | undefined;
}

/**
 * Provider-neutral gateway for graph retrieval (entity resolution & bounded traversal) (D-12..D-16).
 */
export interface GraphRetrievalGateway {
  /**
   * Resolves query identifiers or tokens to candidate entities against the pinned snapshot (D-04, D-05).
   */
  resolveEntities(
    snapshotId: string,
    queryTokens: readonly string[],
    options?: OperationOptions
  ): Promise<ClarificationCandidate[]>;

  /**
   * Executes bounded parameterized Cypher traversal starting from resolved seeds (D-13..D-16).
   */
  traverse(
    snapshotId: string,
    criteria: GraphTraversalCriteria,
    options?: OperationOptions
  ): Promise<GraphTraversalResult>;
}
