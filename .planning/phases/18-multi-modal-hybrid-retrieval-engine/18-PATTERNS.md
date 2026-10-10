# Phase 18: Multi-Modal Hybrid Retrieval Engine - Pattern Map

**Mapped:** 2026-10-10  
**Files analyzed:** 19 (15 new, 4 modified)  
**Analogs found:** 17 / 19  

---

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `knowledge-server/src/types/retrievalProtocol.ts` | model / protocol | request-response | `knowledge-server/src/types/graphProtocol.ts` | exact |
| `knowledge-server/src/routes/retrieval.ts` | route / controller | request-response | `knowledge-server/src/routes/graph.ts` | exact |
| `knowledge-server/src/services/retrievalService.ts` | service | parallel fan-out | `knowledge-server/src/services/graphBuildService.ts` | exact |
| `knowledge-server/src/retrieval/rrf.ts` | utility / algorithm | transform | `knowledge-server/src/graph/candidate.ts` (lines 86–135) | role-match |
| `knowledge-server/src/retrieval/identifierClassifier.ts` | utility | request-response | `knowledge-server/src/graph/identity.ts` (lines 28–60) | exact |
| `knowledge-server/src/retrieval/entityResolver.ts` | service | request-response | `knowledge-server/src/graph/extraction.ts` (lines 20–70) | role-match |
| `knowledge-server/src/retrieval/queryPlanner.ts` | service | request-response | `knowledge-server/src/ai/proseExtraction.ts` (lines 19–40) | exact |
| `knowledge-server/src/retrieval/graphTraversal.ts` | service / query runner | request-response | `knowledge-server/src/graph/neo4jRepository.ts` (lines 156–230) | exact |
| `knowledge-server/src/retrieval/conflictDetector.ts` | utility | transform | `knowledge-server/src/graph/candidate.ts` (lines 147–195) | exact |
| `knowledge-server/src/retrieval/vectorStore.ts` | repository | CRUD / request-response | `knowledge-server/src/graph/neo4jRepository.ts` (lines 23–55) | exact |
| `knowledge-server/src/embedding/embeddingService.ts` | service interface | transform | `knowledge-server/src/graph/graphRepository.ts` (lines 11–36) | role-match |
| `knowledge-server/src/embedding/localOnnxAdapter.ts` | adapter / service | request-response | `knowledge-server/src/graph/neo4jRepository.ts` (lines 11–18) | role-match |
| `knowledge-server/src/embedding/remoteOpenAiAdapter.ts` | adapter / service | request-response | `knowledge-server/src/graph/neo4jRepository.ts` (lines 11–18) | role-match |
| `knowledge-server/src/graph/neo4jRepository.ts` *(modified)* | repository | CRUD | `knowledge-server/src/graph/neo4jRepository.ts` | exact |
| `knowledge-server/src/graph/ontology.ts` *(modified)* | model / config | static | `knowledge-server/src/graph/ontology.ts` | exact |
| `knowledge-server/src/server.ts` *(modified)* | config / bootstrap | request-response | `knowledge-server/src/server.ts` (lines 68–124) | exact |
| `knowledge-server/package.json` *(modified)* | config | static | `knowledge-server/package.json` | exact |
| `knowledge-server/tests/retrievalProtocol.test.ts` | test | schema validation | `knowledge-server/tests/protocol.test.ts` | exact |
| `knowledge-server/tests/rrf.test.ts` | test | transform / unit | `knowledge-server/tests/graphCandidate.test.ts` | exact |
| `knowledge-server/tests/retrievalAcceptance.test.ts` | test | integration / acceptance | `knowledge-server/tests/pilotAcceptance.test.ts` | exact |

---

## Pattern Assignments

### 1. `knowledge-server/src/types/retrievalProtocol.ts` (model / protocol)

**Analog:** `knowledge-server/src/types/graphProtocol.ts`

**Imports Pattern** (lines 1–8):
```typescript
import { z } from 'zod';
import {
  UrnSchema,
  FactKeySchema,
  EvidenceClassificationSchema,
  GraphEvidenceRecordSchema,
} from './graphProtocol.js';
```

**Core DTO Schemas Pattern** (mimics `graphProtocol.ts` lines 8–39, 105–125):
```typescript
// Strict enum schemas
export const RetrievalOutcomeSchema = z.enum([
  'READY',
  'NEEDS_CLARIFICATION',
  'NO_EVIDENCE',
  'UNSUPPORTED',
  'DEGRADED',
]);
export type RetrievalOutcome = z.infer<typeof RetrievalOutcomeSchema>;

export const ModalityKindSchema = z.enum(['fulltext', 'vector', 'graph']);
export type ModalityKind = z.infer<typeof ModalityKindSchema>;

export const ModalityStatusValueSchema = z.enum([
  'ok',
  'unavailable',
  'timeout',
  'stale',
  'truncated',
]);

export const ModalityStatusDetailSchema = z
  .object({
    status: ModalityStatusValueSchema,
    latencyMs: z.number().int().nonnegative(),
    itemCount: z.number().int().nonnegative(),
    reason: z.string().optional(),
  })
  .strict();

// Discriminated union item payload
export const ChunkItemSchema = z
  .object({
    type: z.literal('chunk'),
    chunkId: z.string(),
    score: z.number().positive(),
    modalitiesContributed: z.array(ModalityKindSchema).min(1),
    sourceDocumentId: z.string().uuid(),
    sectionAnchor: z.string(),
    lineStart: z.number().int().positive(),
    lineEnd: z.number().int().positive(),
    rawSnippet: z.string(),
    snapshotId: z.string().uuid(),
    conflictGroupId: z.string().optional(),
    hasConflict: z.boolean().default(false),
  })
  .strict();

export const EntityItemSchema = z
  .object({
    type: z.literal('entity'),
    urn: UrnSchema,
    score: z.number().positive(),
    modalitiesContributed: z.array(ModalityKindSchema).min(1),
    canonicalName: z.string(),
    kind: z.string(),
    snapshotId: z.string().uuid(),
    firstSeenInDoc: z.string().uuid().optional(),
    conflictGroupId: z.string().optional(),
    hasConflict: z.boolean().default(false),
  })
  .strict();

export const EdgeItemSchema = z
  .object({
    type: z.literal('edge'),
    factKey: FactKeySchema,
    score: z.number().positive(),
    modalitiesContributed: z.array(ModalityKindSchema).min(1),
    sourceUrn: UrnSchema,
    targetUrn: UrnSchema,
    relation: z.string(),
    evidenceClass: EvidenceClassificationSchema,
    supportingChunkIds: z.array(z.string()),
    snapshotId: z.string().uuid(),
    conflictGroupId: z.string().optional(),
    hasConflict: z.boolean().default(false),
  })
  .strict();

export const RetrievalItemSchema = z.discriminatedUnion('type', [
  ChunkItemSchema,
  EntityItemSchema,
  EdgeItemSchema,
]);
export type RetrievalItem = z.infer<typeof RetrievalItemSchema>;

// Uniform Envelope Schema per D-23
export const RetrievalResponseEnvelopeSchema = z
  .object({
    outcome: RetrievalOutcomeSchema,
    snapshotId: z.string().uuid(),
    embeddingProvider: z.string(),
    items: z.array(RetrievalItemSchema),
    totalCandidates: z.number().int().nonnegative(),
    modalityStatus: z.record(ModalityKindSchema, ModalityStatusDetailSchema),
    planTrace: z.record(z.string(), z.unknown()).optional(),
    candidates: z.array(UrnSchema).optional(),
    reason: z.string().optional(),
    suggestedRefinements: z.array(z.string()).optional(),
    unsupportedConstructs: z.array(z.string()).optional(),
    diagnostics: z
      .object({
        executionTimeMs: z.number().nonnegative(),
        degraded: z.boolean(),
        degradedReason: z.string().optional(),
      })
      .strict(),
  })
  .strict();
```

---

### 2. `knowledge-server/src/routes/retrieval.ts` (route / controller)

**Analog:** `knowledge-server/src/routes/graph.ts`

**Imports Pattern** (lines 1–10):
```typescript
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  RetrievalRequestDTOSchema,
  RetrievalResponseEnvelopeSchema,
} from '../types/retrievalProtocol.js';
import { RetrievalService } from '../services/retrievalService.js';
```

**Handler & Error Response Pattern** (lines 162–194):
```typescript
const uuid = z.string().uuid();
const SetParamsSchema = z.object({ setId: uuid }).strict();

function invalid(reply: FastifyReply) {
  return reply.code(400).send({
    error: { code: 'INVALID_REQUEST', message: 'Request could not be processed.' },
  });
}

export function registerRetrievalRoutes(
  app: FastifyInstance,
  retrievalService: RetrievalService
) {
  app.post('/api/v1/sets/:setId/retrieve', async (request, reply) => {
    const params = SetParamsSchema.safeParse(request.params);
    const body = RetrievalRequestDTOSchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return invalid(reply);
    }

    try {
      // Semantic status returns HTTP 200 with typed envelope outcome per D-23
      const responseEnvelope = await retrievalService.retrieve(
        params.data.setId,
        body.data
      );
      return reply.code(200).send(RetrievalResponseEnvelopeSchema.parse(responseEnvelope));
    } catch (err: unknown) {
      request.log.error(err, 'Retrieval orchestration error');
      return reply.code(500).send({
        error: { code: 'INTERNAL_ERROR', message: 'Request could not be processed.' },
      });
    }
  });
}
```

---

### 3. `knowledge-server/src/services/retrievalService.ts` (service / orchestrator)

**Analog:** `knowledge-server/src/services/graphBuildService.ts` & `src/indexing/snapshotStore.ts`

**Imports Pattern:**
```typescript
import { randomUUID } from 'node:crypto';
import type { SnapshotStore } from '../indexing/snapshotStore.js';
import type { GraphRepository } from '../graph/graphRepository.js';
import type { EmbeddingService } from '../embedding/embeddingService.js';
import { runRrfFusion } from '../retrieval/rrf.ts';
import { classifyIdentifierFastPath } from '../retrieval/identifierClassifier.js';
import { resolveEntities } from '../retrieval/entityResolver.js';
import { planRetrieval } from '../retrieval/queryPlanner.js';
import { runBoundedTraversal } from '../retrieval/graphTraversal.js';
import { detectConflicts } from '../retrieval/conflictDetector.js';
import type { RetrievalRequestDTO, RetrievalResponseEnvelope } from '../types/retrievalProtocol.js';
```

**Snapshot Pinning & Modality Parallel Fan-Out Pattern** (lines 40–80):
```typescript
export class RetrievalService {
  constructor(
    private readonly snapshotStore: SnapshotStore,
    private readonly graphRepository: GraphRepository,
    private readonly embeddingService: EmbeddingService,
    private readonly defaultTimeouts = {
      fulltext: Number(process.env.RETRIEVAL_TIMEOUT_FULLTEXT_MS ?? 500),
      vector: Number(process.env.RETRIEVAL_TIMEOUT_VECTOR_MS ?? 1500),
      graph: Number(process.env.RETRIEVAL_TIMEOUT_GRAPH_MS ?? 2000),
    }
  ) {}

  async retrieve(setId: string, request: RetrievalRequestDTO): Promise<RetrievalResponseEnvelope> {
    const startTime = Date.now();

    // 1. D-24: Pin active snapshot at request start
    const activeSnapshot = this.snapshotStore.getActiveSnapshot(setId);
    if (!activeSnapshot) {
      return {
        outcome: 'NO_EVIDENCE',
        snapshotId: randomUUID(),
        embeddingProvider: this.embeddingService.providerName,
        items: [],
        totalCandidates: 0,
        modalityStatus: {},
        reason: 'ACTIVE_SNAPSHOT_NOT_FOUND',
        diagnostics: { executionTimeMs: Date.now() - startTime, degraded: false },
      };
    }
    const pinnedSnapshotId = activeSnapshot.snapshotId;

    // 2. Fast-path classifier vs LLM Query Planner (D-02, D-03, D-05)
    let plan = classifyIdentifierFastPath(request.query);
    if (!plan) {
      const resolvedSeeds = await resolveEntities(this.graphRepository, pinnedSnapshotId, request.query, request.recentTurns);
      plan = await planRetrieval(request.query, resolvedSeeds);
    }

    // 3. Parallel modality fan-out with AbortSignal.timeout (D-01, D-11, D-25)
    const [fulltextResult, vectorResult, graphResult] = await Promise.allSettled([
      this.executeFullText(pinnedSnapshotId, plan, this.defaultTimeouts.fulltext),
      this.executeVector(pinnedSnapshotId, plan, this.defaultTimeouts.vector),
      this.executeGraph(pinnedSnapshotId, plan, this.defaultTimeouts.graph),
    ]);

    // 4. Reciprocal Rank Fusion k=60 (D-17, D-18)
    const fusedItems = runRrfFusion([fulltextResult, vectorResult, graphResult], request.limit ?? 20);

    // 5. Conflict surfacing (D-21)
    const itemsWithConflicts = detectConflicts(fusedItems);

    // 6. Assemble uniform envelope (D-23)
    return assembleEnvelope({
      pinnedSnapshotId,
      items: itemsWithConflicts,
      plan,
      results: [fulltextResult, vectorResult, graphResult],
      startTime,
      provider: this.embeddingService.providerName,
    });
  }
}
```

---

### 4. `knowledge-server/src/retrieval/graphTraversal.ts` & `neo4jRepository.ts` extension (repository / query runner)

**Analog:** `knowledge-server/src/graph/neo4jRepository.ts`

**Static Traversal Query Catalog Pattern** (lines 23–35, 156–180):
```typescript
/**
 * Static parameterized Cypher query definitions per D-15, D-16.
 * Zero string interpolation or dynamic clauses.
 */
export const TRAVERSAL_CYPHER_QUERIES = {
  // 1-to-3 hop outgoing/incoming traversal templates
  TRAVERSE_OUTGOING_1HOP: `
    MATCH (start:Entity {urn: $seedUrn, graphSnapshotId: $graphSnapshotId})
    MATCH (start)-[r]->(target:Entity {graphSnapshotId: $graphSnapshotId})
    WHERE type(r) IN $allowedRelations
      AND (r.effectiveClassification IN ['OBSERVED', 'BUSINESS_APPROVED'] OR $includeInferred = true)
    OPTIONAL MATCH (ev:Evidence {graphSnapshotId: $graphSnapshotId})-[:EVIDENCE_FOR]->(f:Fact {factKey: r.factKey})
    RETURN target, r, collect(ev.evidenceId) AS supportingChunkIds
    LIMIT 100
  `,

  TRAVERSE_IMPACT_3HOPS: `
    MATCH (start:Entity {urn: $seedUrn, graphSnapshotId: $graphSnapshotId})
    MATCH path = (start)<-[r1]-(n1)<-[r2]-(n2)<-[r3]-(target:Entity {graphSnapshotId: $graphSnapshotId})
    WHERE all(rel IN relationships(path) WHERE (rel.effectiveClassification IN ['OBSERVED', 'BUSINESS_APPROVED'] OR $includeInferred = true))
    RETURN nodes(path) AS pathNodes, relationships(path) AS pathRels
    LIMIT 100
  `,
} as const;
```

**Safe Parameter Execution Pattern** (lines 230–270):
```typescript
export async function executeGraphTraversal(
  session: Session,
  params: {
    graphSnapshotId: string;
    seedUrns: string[];
    allowedRelations: string[];
    maxHops: number;
    includeInferred: boolean;
  }
) {
  // Enforce D-13, D-15 caps
  const clampedDepth = Math.min(Math.max(params.maxHops, 1), 3);
  const result = await session.run(TRAVERSAL_CYPHER_QUERIES.TRAVERSE_OUTGOING_1HOP, {
    seedUrn: params.seedUrns[0],
    graphSnapshotId: params.graphSnapshotId,
    allowedRelations: params.allowedRelations,
    includeInferred: params.includeInferred,
  });

  return result.records.map((rec) => ({
    target: rec.get('target').properties,
    rel: rec.get('r').properties,
    supportingChunkIds: rec.get('supportingChunkIds'),
  }));
}
```

---

### 5. `knowledge-server/src/retrieval/identifierClassifier.ts` (utility)

**Analog:** `knowledge-server/src/graph/identity.ts`

**Pure Identifier Parsing Pattern** (lines 28–60):
```typescript
/**
 * Regex for technical identifiers: Oracle qualified tables, process IDs, cycle codes.
 * D-03: Fast-path bypasses LLM planner for pure identifiers.
 */
export const QUALIFIED_TABLE_REGEX = /^[A-Z0-9_]{1,30}\.[A-Z0-9_]{1,30}$/;
export const PROCESS_ID_REGEX = /^[0-9]{8}$/;
export const IDENTIFIER_NAME_REGEX = /^[A-Z][A-Z0-9_]{2,40}$/;

export interface FastPathPlan {
  isFastPath: true;
  identifier: string;
  type: 'DATABASE_OBJECT' | 'PROCESS' | 'IDENTIFIER';
  suggestedUrnPattern: string;
}

export function classifyIdentifierFastPath(query: string): FastPathPlan | null {
  const trimmed = query.trim();
  if (QUALIFIED_TABLE_REGEX.test(trimmed)) {
    return {
      isFastPath: true,
      identifier: trimmed,
      type: 'DATABASE_OBJECT',
      suggestedUrnPattern: `urn:plannermate:oracle:ORACLE_TABLE:${trimmed.replace('.', ':')}`,
    };
  }
  if (PROCESS_ID_REGEX.test(trimmed)) {
    return {
      isFastPath: true,
      identifier: trimmed,
      type: 'PROCESS',
      suggestedUrnPattern: `urn:plannermate:scheduler:ScheduledProcess:${trimmed}`,
    };
  }
  return null;
}
```

---

### 6. `knowledge-server/src/retrieval/conflictDetector.ts` (utility)

**Analog:** `knowledge-server/src/graph/candidate.ts`

**Deterministic Conflict Detection Pattern** (lines 147–195):
```typescript
import { sha256Hex } from '../indexing/chunkHashPolicy.js';
import type { RetrievalItem } from '../types/retrievalProtocol.js';

export function detectConflicts(items: RetrievalItem[]): RetrievalItem[] {
  // D-21: Group functional relation contradictions and divergent targets
  const edges = items.filter((item): item is Extract<RetrievalItem, { type: 'edge' }> => item.type === 'edge');
  const edgeBuckets = new Map<string, typeof edges>();

  for (const edge of edges) {
    // Key by (sourceUrn, relation) for functional conflict check
    const bucketKey = `${edge.sourceUrn}:${edge.relation}`;
    const list = edgeBuckets.get(bucketKey) ?? [];
    list.push(edge);
    edgeBuckets.set(bucketKey, list);
  }

  const conflictingFactKeys = new Map<string, string>(); // factKey -> conflictGroupId

  for (const [key, bucket] of edgeBuckets.entries()) {
    if (bucket.length > 1) {
      const distinctTargets = new Set(bucket.map((e) => e.targetUrn));
      if (distinctTargets.size > 1) {
        // Deterministic conflict group ID (D-21)
        const conflictGroupId = sha256Hex(`CONFLICT:${key}`).slice(0, 32);
        for (const edge of bucket) {
          conflictingFactKeys.set(edge.factKey, conflictGroupId);
        }
      }
    }
  }

  // Tag items without picking a winner
  return items.map((item) => {
    if (item.type === 'edge' && conflictingFactKeys.has(item.factKey)) {
      return {
        ...item,
        hasConflict: true,
        conflictGroupId: conflictingFactKeys.get(item.factKey),
      };
    }
    return item;
  });
}
```

---

### 7. `knowledge-server/src/retrieval/rrf.ts` (utility / algorithm)

**Analog:** Pure transform / scoring function (analogous to `src/utils/bm25.ts` math and `src/graph/candidate.ts` dedup logic)

**Reciprocal Rank Fusion Implementation Pattern** (per D-17, D-18):
```typescript
import type { ModalityKind, RetrievalItem } from '../types/retrievalProtocol.js';

export const RRF_K = 60; // Locked per D-17

export interface ModalityRankEntry {
  modality: ModalityKind;
  rank: number; // 1-based rank
  item: RetrievalItem;
}

export function runRrfFusion(
  rankedLists: Array<{ modality: ModalityKind; items: RetrievalItem[] }>,
  limit = 20
): RetrievalItem[] {
  // Composite key: (type, id)
  const candidateScores = new Map<string, {
    item: RetrievalItem;
    score: number;
    modalitiesContributed: Set<ModalityKind>;
  }>();

  for (const { modality, items } of rankedLists) {
    items.forEach((item, index) => {
      const rank = index + 1;
      const compositeKey = `${item.type}:${item.type === 'chunk' ? item.chunkId : item.type === 'entity' ? item.urn : item.factKey}`;
      const rrfContribution = 1 / (RRF_K + rank);

      const existing = candidateScores.get(compositeKey);
      if (existing) {
        existing.score += rrfContribution;
        existing.modalitiesContributed.add(modality);
      } else {
        candidateScores.set(compositeKey, {
          item,
          score: rrfContribution,
          modalitiesContributed: new Set([modality]),
        });
      }
    });
  }

  // Sort: score DESC -> modalities count DESC -> ID lexicographical
  const merged = Array.from(candidateScores.values()).map(({ item, score, modalitiesContributed }) => ({
    ...item,
    score,
    modalitiesContributed: Array.from(modalitiesContributed),
  }));

  merged.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.modalitiesContributed.length !== a.modalitiesContributed.length) {
      return b.modalitiesContributed.length - a.modalitiesContributed.length;
    }
    return a.type.localeCompare(b.type);
  });

  return merged.slice(0, limit);
}
```

---

### 8. `knowledge-server/src/retrieval/queryPlanner.ts` (service)

**Analog:** `knowledge-server/src/ai/proseExtraction.ts`

**Input Boundary & Error Retry Pattern** (lines 19–35):
```typescript
import { z } from 'zod';
import { RELATION_TYPES, RelationTypeSchema } from '../types/graphProtocol.js';

export const LogicalQueryPlanSchema = z
  .object({
    seedUrns: z.array(z.string()).min(1),
    traversalSteps: z.array(
      z.object({
        relationType: RelationTypeSchema,
        direction: z.enum(['OUTGOING', 'INCOMING', 'BOTH']),
        maxHops: z.number().int().min(1).max(3),
      }).strict()
    ).max(5),
    fullTextKeywords: z.array(z.string()).min(1),
    includeInferred: z.boolean().default(false),
  })
  .strict();

export type LogicalQueryPlan = z.infer<typeof LogicalQueryPlanSchema>;

export async function planRetrievalWithRetry(
  query: string,
  resolvedUrns: string[],
  invokeLlm: (prompt: string) => Promise<string>
): Promise<LogicalQueryPlan> {
  // Single repair round per RESEARCH Section 2.5
  try {
    const raw = await invokeLlm(buildPrompt(query, resolvedUrns));
    return LogicalQueryPlanSchema.parse(JSON.parse(raw));
  } catch {
    // 1 repair retry
    try {
      const repaired = await invokeLlm(buildRepairPrompt(query, resolvedUrns));
      return LogicalQueryPlanSchema.parse(JSON.parse(repaired));
    } catch {
      // Deterministic degraded fallback per D-06
      return {
        seedUrns: resolvedUrns,
        traversalSteps: [{ relationType: 'INVOKES', direction: 'BOTH', maxHops: 1 }],
        fullTextKeywords: [query],
        includeInferred: false,
      };
    }
  }
}
```

---

### 9. Test Patterns

**Analog:** `knowledge-server/tests/graphRoutes.test.ts` & `tests/neo4jRepository.test.ts`

**Route & Mock Injection Pattern:**
```typescript
import { describe, expect, it } from 'vitest';
import { buildKnowledgeServer } from '../src/server.js';
import { InMemoryGraphRepository } from '../src/graph/graphRepository.js';

describe('Retrieval route endpoint', () => {
  it('returns HTTP 200 with typed envelope and RRF items', async () => {
    const repository = new InMemoryGraphRepository();
    const app = buildKnowledgeServer({
      token: 'test-token',
      allowedOrigins: ['https://planner.example'],
      graphRepository: repository,
    }).app;

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sets/${SET_ID}/retrieve`,
      headers: {
        origin: 'https://planner.example',
        authorization: 'Bearer test-token',
      },
      payload: { query: 'AML_RISK đổi tên ảnh hưởng gì' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.outcome).toBe('READY');
    expect(Array.isArray(body.items)).toBe(true);
  });
});
```

---

## Shared Patterns

### 1. Request Authorization & Origin Hook
**Source:** `knowledge-server/src/server.ts` lines 84–97  
**Apply to:** All Fastify endpoints in `knowledge-server/src/routes/*.ts`
```typescript
app.addHook('onRequest', async (request, reply) => {
  if (!request.url.startsWith('/api/v1/')) return;
  const origin = request.headers.origin;
  if (!origin || !allowedOrigins.has(origin)) {
    return reply.code(403).send({
      error: { code: 'ORIGIN_DENIED', message: 'Request origin is not allowed.' },
    });
  }
  if (!authorized(request.headers.authorization, token)) {
    return reply.code(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Valid bearer authorization is required.' },
    });
  }
});
```

### 2. Request-Start Active Snapshot Pinning
**Source:** `knowledge-server/src/indexing/snapshotStore.ts` lines 145–148  
**Apply to:** All retrieval queries (enforces D-24)
```typescript
getActiveSnapshot(setId: string): ProjectionSnapshot | null {
  const snapshot = this.#activeBySet.get(setId);
  return snapshot ? clone(snapshot) : null;
}
```

### 3. Strict Zod Validation & Safe Error Mapping
**Source:** `knowledge-server/src/routes/graph.ts` lines 162–166  
**Apply to:** All route parameter, body, and query parsing
```typescript
function invalid(reply: FastifyReply) {
  return reply.code(400).send({
    error: { code: 'INVALID_REQUEST', message: 'Request could not be processed.' },
  });
}
```

### 4. Zero-Interpolation Cypher Query Templates
**Source:** `knowledge-server/src/graph/neo4jRepository.ts` lines 23–35, 156–180  
**Apply to:** Neo4j repository methods, vector queries, traversal queries (enforces D-16)
```typescript
// Define template with strictly typed parameters; never use `${variable}` in query strings.
const query = `
  MATCH (e:Entity {urn: $seedUrn, graphSnapshotId: $graphSnapshotId})
  RETURN e
  LIMIT $limit
`;
await session.run(query, { seedUrn, graphSnapshotId, limit: neo4j.int(10) });
```

### 5. Content-Free Error Redaction
**Source:** `knowledge-server/src/server.ts` lines 58–66  
**Apply to:** Logging across all retrieval services
```typescript
redact: {
  paths: ['req.headers.authorization', 'req.body', 'request.body', 'body', 'payload', 'stack'],
  censor: '[REDACTED]',
  remove: true,
}
```

---

## Shared-File Conflict Hotspots & Recommended Plan Boundaries

| Shared File | Potential Conflicting Areas | Recommended Plan Ownership Boundary |
|---|---|---|
| `knowledge-server/src/types/retrievalProtocol.ts` | Protocol schemas used across routes, RRF, traversal, and service. | **Wave 1 (Protocol)** owns all initial schemas. Later waves import only; do not restructure. |
| `knowledge-server/src/graph/neo4jRepository.ts` | Adding Lucene full-text index DDL and vector index querying. | **Wave 2 (Indexes)** owns Neo4j index schema updates and vector query procedures. |
| `knowledge-server/src/graph/ontology.ts` | Traversal direction hints and relation hop bounds. | **Wave 5 (Traversal)** edits ontology registry for retrieval metadata. |
| `knowledge-server/src/server.ts` | Mounting `registerRetrievalRoutes` and passing `RetrievalService`. | **Wave 6 (Route/Wiring)** modifies `server.ts` only after all services are instantiated. |
| `knowledge-server/package.json` | Adding `@xenova/transformers@2.17.2`. | **Wave 3 (Embedding)** owns package addition and adapter creation. |

---

## No Analog Found

| File | Role | Data Flow | Reason / Recommended Guidance |
|---|---|---|---|
| `knowledge-server/src/embedding/localOnnxAdapter.ts` | adapter | CPU transform | First ONNX feature extraction runtime in the project. Follow `@xenova/transformers` standard pipeline pattern with `Xenova/multilingual-e5-small`, `passage: ` / `query: ` prefixing, and int8 quantized weights. |
| `knowledge-server/src/embedding/remoteOpenAiAdapter.ts` | adapter | HTTP request-response | First external embedding REST client in `knowledge-server`. Use native Node 24 `fetch` + `AbortSignal.timeout`, honoring D-10 DLP banner and environment variable isolation. |

---

## Metadata

- **Analog search scope:** `knowledge-server/src/`, `knowledge-server/tests/`, `src/utils/`
- **Files scanned:** 23
- **Pattern extraction date:** 2026-10-10
