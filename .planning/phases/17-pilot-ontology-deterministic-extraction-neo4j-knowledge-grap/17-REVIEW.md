---
phase: 17-pilot-ontology-deterministic-extraction-neo4j-knowledge-grap
reviewed: 2026-10-10T00:00:00.000Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - knowledge-server/src/types/graphProtocol.ts
  - knowledge-server/src/graph/ontology.ts
  - knowledge-server/src/graph/identity.ts
  - knowledge-server/src/graph/extraction.ts
  - knowledge-server/src/ai/proseExtraction.ts
  - knowledge-server/src/graph/candidate.ts
  - knowledge-server/src/graph/graphRepository.ts
  - knowledge-server/src/graph/neo4jRepository.ts
  - knowledge-server/src/routes/graph.ts
  - knowledge-server/src/server.ts
  - knowledge-server/src/main.ts
  - knowledge-server/src/services/graphBuildService.ts
  - knowledge-server/src/indexing/snapshotStore.ts
  - src/services/knowledge/knowledgeClient.ts
  - src/components/knowledge/DocumentSetDrawer.tsx
  - src/components/knowledge/GraphEvidenceDrawer.tsx
findings:
  critical: 2
  warning: 5
  info: 4
  total: 11
status: issues_found
---

# Phase 17: Code Review Report

**Reviewed:** 2026-10-10T00:00:00.000Z
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

Code review conducted across 16 Phase 17 files covering ontology, identity, deterministic extraction, prose extraction, candidate merging, Neo4j repository adapter, Fastify routes, build orchestration, frontend client, and Ant Design inspection drawers.

Key architecture strengths: strict typing, closed ontology allow-lists, parameterized static Cypher queries preventing injection, and pure AST parsing with consumed range tracking.

Adversarial review identified 2 critical defects, 5 warnings, and 4 informational issues. Highest severity:
1. `DocumentSetDrawer.tsx` instantiates `createKnowledgeClient` inline without `useMemo` while passing `client` into `useEffect` dependency array, triggering infinite fetch and re-render loops on drawer open.
2. `Neo4jRepository.getActiveGraph` returns hardcoded zeros for all count metrics, causing active graph status to display 0 nodes/facts/conflicts and permanently suppressing the `Active with warnings` state in production.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Neo4jRepository.getActiveGraph hardcodes all metric counts to zero

**File:** `knowledge-server/src/graph/neo4jRepository.ts:459-465`
**Issue:** `getActiveGraph` returns `nodeCount: 0`, `relationCount: 0`, `factCount: 0`, `conflictCount: 0`, `quarantineCount: 0`, and `approvedFactCount: 0`. When running with Neo4j, `GraphBuildService.getStatus` evaluates `activeView.conflictCount > 0` to false, permanently masking conflicts as normal `Active` instead of `Active with warnings`. Furthermore, all UI statistic widgets in `DocumentSetDrawer` show 0.
**Fix:**
Store candidate metric counts onto `s:GraphSnapshot` during `writeCandidate` (or `INSERT_GRAPH_SNAPSHOT`), and return them from `GET_ACTIVE_GRAPH`:
```typescript
// In CYPHER_QUERIES.INSERT_GRAPH_SNAPSHOT:
SET s.sourceSnapshotId = $sourceSnapshotId,
    s.setId = $setId,
    s.ontologyVersion = $ontologyVersion,
    s.normalizedProjectionHash = $normalizedProjectionHash,
    s.state = 'READY',
    s.nodeCount = $nodeCount,
    s.relationCount = $relationCount,
    s.factCount = $factCount,
    s.conflictCount = $conflictCount,
    s.quarantineCount = $quarantineCount,
    s.createdAt = $createdAt

// In getActiveGraph:
return {
  setId: record.get('setId'),
  graphSnapshotId: record.get('graphSnapshotId'),
  sourceSnapshotId: record.get('sourceSnapshotId'),
  ontologyVersion: record.get('ontologyVersion'),
  normalizedProjectionHash: record.get('normalizedProjectionHash'),
  activatedAt: record.get('activatedAt'),
  nodeCount: record.get('nodeCount')?.toNumber?.() ?? record.get('nodeCount') ?? 0,
  relationCount: record.get('relationCount')?.toNumber?.() ?? record.get('relationCount') ?? 0,
  factCount: record.get('factCount')?.toNumber?.() ?? record.get('factCount') ?? 0,
  conflictCount: record.get('conflictCount')?.toNumber?.() ?? record.get('conflictCount') ?? 0,
  quarantineCount: record.get('quarantineCount')?.toNumber?.() ?? record.get('quarantineCount') ?? 0,
  approvedFactCount: record.get('approvedFactCount')?.toNumber?.() ?? 0,
};
```

---

### CR-02: Unmemoized knowledge client in DocumentSetDrawer causes infinite fetch loop

**File:** `src/components/knowledge/DocumentSetDrawer.tsx:141-146, 174-207`
**Issue:** `client` is created via `createKnowledgeClient` in the component body on every render without `useMemo`. `client` is listed in `useEffect` dependency array (`[selected?.id, client, props.open, props.graphStatusOverride]`). When `getGraphStatus` succeeds, it calls `setGraphStatus`, triggering a re-render, creating a new `client` instance, triggering `useEffect` again indefinitely.
**Fix:**
Memoize client instance with `useMemo`:
```typescript
const client = useMemo(() => {
  if (props.knowledgeClient) return props.knowledgeClient;
  if (props.configured && config.baseUrl && config.token) {
    return createKnowledgeClient({ baseUrl: config.baseUrl, token: config.token });
  }
  return undefined;
}, [props.knowledgeClient, props.configured, config.baseUrl, config.token]);
```

---

## Warnings

### WR-01: Neo4jRepository.getFacts returns empty conflicts and drops approval persistence

**File:** `knowledge-server/src/graph/neo4jRepository.ts:399-425, 508-510`
**Issue:** `getFacts` hardcodes `conflicts: []` and `approvals: []`. In `GraphBuildService.getEvidence`, `conflictBranch` ('A' vs 'B') relies on `detail.conflicts[0]`. Because `conflicts` is empty in `Neo4jRepository`, conflict branches are never populated for occurrences in `GraphEvidenceDrawer`. Furthermore, `writeCandidate` never inserts `candidate.approvals` into Neo4j, dropping persisted approval records.
**Fix:**
Query `OPTIONAL MATCH (f)-[:CONFLICTS_WITH]->(c:Conflict)` in `GET_FACTS_BY_SNAPSHOT` to return conflict records attached to each fact, and add `UNWIND_INSERT_APPROVALS` to `writeCandidate`.

---

### WR-02: D-20 fact retention relies on undeclared (app as any).fact field

**File:** `knowledge-server/src/graph/candidate.ts:140-147`
**Issue:** Line 141 checks `if (!factsByKey.has(app.factKey) && (app as any).fact)`. `GraphApprovalRecordSchema` in `graphProtocol.ts:170-180` is `.strict()` and has no `fact` property. Real approvals saved and retrieved through `SnapshotStore` contain only `{ factKey, approverName, approvedAt, rationale, ontologyVersion }`. In production, `(app as any).fact` is undefined, causing approved facts whose source is removed to disappear instead of being retained with `sourceMissing = true`.
**Fix:**
Include optional `retainedFact?: FactAssertion` in `GraphApprovalRecordSchema`, or store approved facts in an approval ledger mapping `factKey` -> `FactAssertion`:
```typescript
export const GraphApprovalRecordSchema = z
  .object({
    factKey: FactKeySchema,
    approverName: z.string().min(1),
    approvedAt: z.string().datetime(),
    rationale: z.string().optional(),
    ontologyVersion: z.string().min(1),
    retainedFact: FactAssertionSchema.optional(),
  })
  .strict();
```

---

### WR-03: Prose paragraph trimming creates character offset drift in extracted evidence

**File:** `knowledge-server/src/ai/proseExtraction.ts:83, 432-434`
**Issue:** `collectUncoveredProse` trims paragraph text: `fullBody.slice(startOffset, endOffset).trim()`. Leading whitespace characters are stripped without incrementing `startOffset`. When LLM returns `cand.evidence.startOffset`, adding `segment.startOffset + cand.evidence.startOffset` causes `absoluteStart` to be shifted by the count of stripped leading whitespace characters.
**Fix:**
Adjust `startOffset` and `endOffset` to match the trimmed slice boundaries:
```typescript
const slice = fullBody.slice(startOffset, endOffset);
const leading = slice.length - slice.trimStart().length;
const trailing = slice.length - slice.trimEnd().length;
const trimmedText = slice.trim();
if (trimmedText.length > 0) {
  const adjustedStart = startOffset + leading;
  const adjustedEnd = endOffset - trailing;
  // use adjustedStart, adjustedEnd for segment offsets
}
```

---

### WR-04: Loose heading regex in handleDataObjectsTables matches non-table prose headings

**File:** `knowledge-server/src/graph/extraction.ts:626-630`
**Issue:** `lastHeading.match(/`?([A-Za-z0-9_]{3,})`?/)` has optional backticks and no anchor. Headings like `## Id map` match `"map"` (first 3+ char word), which is not in the ignore list `['WHAT', 'HOW', 'SAMPLE', 'ONE', 'LAYER']`. This results in false table node creation `MAIN1.MAP`.
**Fix:**
Require backticks or exact SQL identifier formatting:
```typescript
const match = lastHeading.match(/`([A-Za-z0-9_]{3,})`/);
if (!match) return;
```

---

### WR-05: Rebuild failure is suppressed when activeView exists, deceiving client polling

**File:** `knowledge-server/src/services/graphBuildService.ts:183-195`, `src/components/knowledge/DocumentSetDrawer.tsx:223-228`
**Issue:** In `getStatus`, line 183 checks `if (this.buildErrors.has(setId) && !activeView)`. When a previous active graph exists, background build failure sets `buildErrors`, but `getStatus` ignores it and returns `state: 'Active'`. The client polling loop terminates seeing `state !== 'Building'`, and `DocumentSetDrawer` displays `message.success('Xây dựng đồ thị tri thức hoàn tất.')` despite the candidate build having failed.
**Fix:**
Track `lastBuildError` or compare candidate snapshot ID. If the last rebuild failed, report failure or preserve the candidate error in status:
```typescript
if (this.buildErrors.has(setId)) {
  const err = this.buildErrors.get(setId)!;
  return {
    setId,
    state: 'Failed',
    activeGraphSnapshotId: activeView?.graphSnapshotId,
    // ...
  };
}
```

---

## Info

### IN-01: evidenceCount duplicates relationCount in GraphStatusDTO

**File:** `knowledge-server/src/services/graphBuildService.ts:174, 219`
**Issue:** `evidenceCount` is assigned `activeView.relationCount`. When 10 relations are backed by 50 evidence citations, `evidenceCount` displays 10 instead of 50.
**Fix:**
Store `evidenceCount: candidate.evidence.length` on `ActiveGraphView` during candidate activation and return it in `getStatus`.

---

### IN-02: main.ts lacks Neo4j and storage directory environment configuration

**File:** `knowledge-server/src/main.ts:101-118`
**Issue:** `startKnowledgeServer` in `main.ts` does not parse `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` or `KNOWLEDGE_STORAGE_DIR`. Running the daemon via `npm start` always runs with in-memory graph repository and in-memory snapshot store.
**Fix:**
Add optional environment variable parsing in `readKnowledgeServerOptions` and instantiate `Neo4jRepository` and `SnapshotStore({ storageDir })` when configured.

---

### IN-03: Unhandled promise rejection in clipboard copy

**File:** `src/components/knowledge/GraphEvidenceDrawer.tsx:161-164`
**Issue:** `navigator.clipboard?.writeText(text)` returns a Promise. Calling `message.success` synchronously without awaiting or catching errors reports success even if copy is denied, and may cause unhandled rejection in non-secure contexts.
**Fix:**
```typescript
navigator.clipboard?.writeText(text)
  .then(() => message.success(`Đã sao chép ${label}`))
  .catch(() => message.error(`Không thể sao chép ${label}`));
```

---

### IN-04: Duplicated deterministicUuid implementation across four files

**File:** `knowledge-server/src/graph/extraction.ts:21-29`, `knowledge-server/src/ai/proseExtraction.ts:26-34`, `knowledge-server/src/graph/candidate.ts:211`, `knowledge-server/src/parser/sectionChunker.ts:25-34`
**Issue:** RFC 4122 v4 deterministic UUID generation from SHA-256 hash is re-implemented in four separate modules with slight slicing variations.
**Fix:**
Export a shared `deterministicUuid(seed: string): string` from `src/indexing/chunkHashPolicy.ts`.

---

_Reviewed: 2026-10-10T00:00:00.000Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
