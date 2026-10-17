# Phase 20: Benchmark Evaluation Suite, Integrity Hardening & Credential Isolation - Pattern Map

**Mapped:** 2026-10-17
**Files analyzed:** 12
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `tests/fixtures/ai/grounded-reference-fixture-schema.ts` | model / schema | transform | `tests/fixtures/ai/grounded-reference-fixture-schema.ts` | exact |
| `tests/fixtures/ai/grounded-assistant-reference.json` | test fixture (data) | batch | `tests/fixtures/ai/grounded-assistant-reference.json` | exact |
| `src/services/ai/benchmarkReportSchemas.ts` | model / schema | transform | `tests/fixtures/ai/grounded-reference-fixture-schema.ts` | role-match |
| `tests/ai/evaluatorCore.ts` | service / utility | request-response | `tests/ai/groundedAssistantEval.test.ts` | role-match |
| `tests/ai/releaseGate.ts` | service / utility | transform | `src/services/ai/evidencePack.ts` | role-match |
| `tests/ai/reportGenerator.ts` | utility | file-I/O | `knowledge-server/src/indexing/snapshotStore.ts` | role-match |
| `scripts/run-benchmark.ts` | script / CLI | batch | `scripts/test-knowledge-live.mjs` | role-match |
| `package.json` | config | config | `package.json` | exact |
| `tests/ai/groundedAssistantEval.test.ts` | test | batch | `tests/ai/groundedAssistantEval.test.ts` | exact |
| `knowledge-server/tests/graphRebuildEquivalence.test.ts` | test | batch | `knowledge-server/tests/graphRebuild.test.ts` | exact |
| `tests/knowledge/offlineIsolation.test.ts` | test | batch | `tests/knowledge/offlineIsolation.test.ts` | exact |
| `tests/security/credentialIsolation.test.ts` | test | batch | `tests/knowledge/publishDlpGate.test.ts` | role-match |

---

## Pattern Assignments

### `tests/fixtures/ai/grounded-reference-fixture-schema.ts` (model / schema, transform)

**Analog:** `tests/fixtures/ai/grounded-reference-fixture-schema.ts`

**Imports pattern** (lines 1-2):
```typescript
import { z } from 'zod';
```

**Core validation pattern** (lines 3-49, 51-77):
```typescript
export const BenchmarkCategorySchema = z.enum([
  'multi_hop_path',
  'semantic_scope',
  'conflict_abstention',
  'security_integrity',
  'rebuild_offline',
]);

export const GroundedReferenceExpectedSchema = z.strictObject({
  kind: z.enum([
    'operational',
    'clarify_intent',
    'clarify_entity',
    'refine',
    'grounded_answer',
    'local_fallback_results',
    'evidence_only',
    'error',
  ]),
  outcome: z
    .enum([
      'READY',
      'DEGRADED',
      'NEEDS_CLARIFICATION',
      'NO_EVIDENCE',
      'UNSUPPORTED',
      'LOCAL_FALLBACK_SYNTHESIS',
      'LOCAL_FALLBACK_RESULTS',
      'MODEL_UNAVAILABLE',
      'INVALID_GROUNDED_OUTPUT',
      'ERROR_AUTH',
      'ERROR_CONFIG',
      'ERROR_INVALID_RESPONSE',
    ])
    .nullable(),
  requiredCitationIds: z.array(z.string()),
  forbiddenClaims: z.array(z.string()),
  requiredFacts: z.array(z.string()),
  requiredPathIds: z.array(z.string()),
  requiredConflictBranches: z.number().int().nonnegative().optional(),
  requiredCoverageWarnings: z.array(z.string()),
  requiredFallbackReason: z.string().nullable(),
  requiredRefinementCount: z.number().int().nonnegative().nullable(),
  requiredCandidates: z
    .array(
      z.strictObject({
        canonicalName: z.string(),
        kind: z.string(),
      })
    )
    .nullable(),
  forbiddenFallback: z.boolean(),
  requiredResponseLanguage: z.enum(['vi', 'en']).optional(),
  requiredByteIdenticalQuotes: z.array(z.string()).optional(),
});

export const GroundedReferenceCaseSchema = z.strictObject({
  id: z.string().min(1),
  category: BenchmarkCategorySchema,
  language: z.enum(['vi', 'en', 'mixed']),
  query: z.string().min(1),
  recentTurns: z.array(
    z.strictObject({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })
  ),
  routeOverride: z.enum(['knowledge', 'operational', 'mixed']).nullable(),
  capabilities: z.strictObject({
    serverEnabled: z.boolean(),
    modelConfigured: z.boolean(),
  }),
  retrievalMock: z
    .strictObject({
      outcome: z.string(),
      errorCode: z.string().nullable(),
      response: z.record(z.string(), z.unknown()),
    })
    .nullable(),
  localResultMock: z.record(z.string(), z.unknown()).nullable(),
  synthesisMock: z.record(z.string(), z.unknown()).nullable(),
  expected: GroundedReferenceExpectedSchema,
  rubricIds: z.array(z.string()),
});
```

---

### `src/services/ai/benchmarkReportSchemas.ts` (model / schema, transform)

**Analog:** `tests/fixtures/ai/grounded-reference-fixture-schema.ts` lines 1-50

**Imports pattern**:
```typescript
import { z } from 'zod';
```

**Core schema pattern**:
```typescript
export const BenchmarkReportSchema = z.strictObject({
  schemaVersion: z.literal('1.0.0'),
  runId: z.string().uuid(),
  timestamp: z.string().datetime(),
  environment: z.strictObject({
    nodeVersion: z.string(),
    mode: z.enum(['deterministic_offline', 'live_smoke']),
  }),
  thresholds: z.strictObject({
    aggregatePassRate: z.number(),
    categoryPassRate: z.number(),
    threeHopPassRate: z.number(),
    pathFidelityRate: z.number(),
    maxInvariantViolations: z.literal(0),
  }),
  summary: z.strictObject({
    totalCases: z.number().int(),
    passedCases: z.number().int(),
    failedCases: z.number().int(),
    aggregatePassRate: z.number(),
    passedGate: z.boolean(),
  }),
  categoryScores: z.record(
    z.string(),
    z.strictObject({
      total: z.number().int(),
      passed: z.number().int(),
      passRate: z.number(),
      passedGate: z.boolean(),
    })
  ),
  threeHopScore: z.strictObject({
    total: z.number().int(),
    passed: z.number().int(),
    passRate: z.number(),
    passedGate: z.boolean(),
  }),
  pathFidelity: z.strictObject({
    totalEvaluated: z.number().int(),
    passed: z.number().int(),
    fidelityRate: z.number(),
    passedGate: z.boolean(),
  }),
  invariants: z.strictObject({
    totalViolations: z.number().int(),
    passedGate: z.boolean(),
    violations: z.array(
      z.strictObject({
        caseId: z.string(),
        violation: z.string(),
      })
    ),
  }),
  failedCaseDetails: z.array(
    z.strictObject({
      id: z.string(),
      category: z.string(),
      reasons: z.array(z.string()),
    })
  ),
});

export type BenchmarkReport = z.infer<typeof BenchmarkReportSchema>;
```

---

### `tests/ai/evaluatorCore.ts` (service / utility, request-response)

**Analog:** `tests/ai/groundedAssistantEval.test.ts` lines 44-297

**Imports pattern** (lines 8-23):
```typescript
import {
  runGroundedTurn,
  type GroundedTurnDeps,
  type GroundedTurnInput,
} from '../../src/services/ai/groundedTurn';
import {
  packEvidence,
  validateGroundedAnswerClosure,
} from '../../src/services/ai/evidencePack';
import { ChatMessageGroundingSchema } from '../../src/services/ai/groundedAnswerSchemas';
import { KnowledgeClientError } from '../../src/services/knowledge/knowledgeClient';
import type { FederatedRetrievalResponse } from '../../src/services/knowledge/retrievalProtocol';
import type { LocalGroundedResult } from '../../src/services/search/localGroundedRetrieval';
import type { GroundedReferenceCase } from '../fixtures/ai/grounded-reference-fixture-schema';
```

**Core evaluation pattern**:
```typescript
export interface CaseEvaluationResult {
  readonly id: string;
  readonly category: string;
  readonly passed: boolean;
  readonly isThreeHop: boolean;
  readonly hasExpectedPaths: boolean;
  readonly pathFidelityPassed: boolean;
  readonly failureReasons: readonly string[];
  readonly invariantViolations: readonly string[];
  readonly actualOutcome: string | null;
}

export function createMockDepsForCase(
  tc: GroundedReferenceCase,
  networkSpy: { calls: number },
  synthesizeCalls: Array<{ query: string; targetLanguage?: string; promptVersion?: string }> = []
): GroundedTurnDeps {
  return {
    routeIntent: async (query: string) => {
      if (tc.routeOverride) return { route: tc.routeOverride, confidence: 1.0 };
      if (query.toLowerCase().includes('tạo công việc')) return { route: 'operational', confidence: 1.0 };
      return { route: 'knowledge', confidence: 1.0 };
    },
    routeScope: async () => ({
      setTierAssignments: [{ setId: '10000000-0000-4000-8000-000000000001', tier: 'REQUIRED', roleGroup: 'baseline' }],
      comparisonMode: 'single',
      routerSource: 'base_default',
    }),
    retrieveFederated: async () => {
      networkSpy.calls++;
      if (!tc.retrievalMock) throw new Error('Unexpected retrieveFederated call');
      if (tc.retrievalMock.errorCode) {
        if (tc.retrievalMock.errorCode === 'TIMEOUT') throw new KnowledgeClientError('TIMEOUT', 'Timeout from server');
        if (tc.retrievalMock.errorCode.startsWith('REMOTE_ERROR_401')) throw new KnowledgeClientError('REMOTE_ERROR', 'Unauthorized', 401);
        if (tc.retrievalMock.errorCode === 'NETWORK_ERROR') throw new KnowledgeClientError('NETWORK_ERROR', 'Failed to fetch');
        throw new KnowledgeClientError('REMOTE_ERROR', 'Remote error', 500);
      }
      return tc.retrievalMock.response as unknown as FederatedRetrievalResponse;
    },
    runLocalBm25: async () => {
      if (tc.localResultMock) return tc.localResultMock as unknown as LocalGroundedResult;
      return { ranges: [], strongEvidence: false, totalScanned: 0 };
    },
    localBm25Deps: {
      loadSetMembers: async () => [],
      loadNoteBody: async () => null,
    },
    packEvidence: (inp, opts) => packEvidence(inp, opts),
    synthesizeGroundedAnswer: async (synthInput) => {
      synthesizeCalls.push({
        query: synthInput.query,
        targetLanguage: synthInput.responseLanguage,
        promptVersion: synthInput.promptVersion,
      });
      if (!tc.synthesisMock) throw new Error('Unexpected synthesizeGroundedAnswer call');
      const closureCheck = validateGroundedAnswerClosure(tc.synthesisMock as any, synthInput.pack);
      if (!closureCheck.valid) {
        throw new Error(`Closure validation failed: ${JSON.stringify(closureCheck.issues)}`);
      }
      const responseLang = synthInput.responseLanguage === 'vi' || synthInput.responseLanguage === 'en'
        ? synthInput.responseLanguage
        : tc.language === 'en' ? 'en' : 'vi';
      return { answer: tc.synthesisMock as any, attempts: [], responseLanguage: responseLang };
    },
    now: () => '2026-10-11T12:00:00.000Z',
  };
}
```

---

### `tests/ai/releaseGate.ts` (service / utility, transform)

**Analog:** `src/services/ai/evidencePack.ts` validation and scoring logic

**Threshold definition and calculation pattern**:
```typescript
export interface GateThresholds {
  readonly aggregatePassRate: number; // 0.90
  readonly categoryPassRate: number;  // 0.80
  readonly threeHopPassRate: number;  // 0.90
  readonly pathFidelityRate: number;  // 1.00
  readonly maxInvariantViolations: number; // 0
}

export const DEFAULT_GATE_THRESHOLDS: GateThresholds = {
  aggregatePassRate: 0.90,
  categoryPassRate: 0.80,
  threeHopPassRate: 0.90,
  pathFidelityRate: 1.00,
  maxInvariantViolations: 0,
};

export interface GateVerdict {
  readonly passedGate: boolean;
  readonly aggregatePassRate: number;
  readonly passesAggregate: boolean;
  readonly categoryScores: Record<string, { total: number; passed: number; passRate: number; passedGate: boolean }>;
  readonly passesCategories: boolean;
  readonly threeHopScore: { total: number; passed: number; passRate: number; passedGate: boolean };
  readonly passesThreeHop: boolean;
  readonly pathFidelity: { totalEvaluated: number; passed: number; fidelityRate: number; passedGate: boolean };
  readonly passesPathFidelity: boolean;
  readonly invariantViolations: readonly { caseId: string; violation: string }[];
  readonly passesInvariants: boolean;
}
```

---

### `tests/ai/reportGenerator.ts` (utility, file-I/O)

**Analog:** `knowledge-server/src/indexing/snapshotStore.ts` lines 1-45

**Imports pattern**:
```typescript
import fs from 'node:fs';
import path from 'node:path';
import type { BenchmarkReport } from '../../src/services/ai/benchmarkReportSchemas';
```

**Core write pattern**:
```typescript
export function writeBenchmarkReports(
  report: BenchmarkReport,
  outputDir = path.resolve(process.cwd(), '.benchmark-reports')
): { jsonPath: string; markdownPath: string } {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const jsonPath = path.join(outputDir, 'latest.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');

  const markdownPath = path.join(outputDir, 'latest.md');
  const markdownContent = renderBenchmarkMarkdown(report);
  fs.writeFileSync(markdownPath, markdownContent, 'utf-8');

  return { jsonPath, markdownPath };
}
```

---

### `scripts/run-benchmark.ts` (script / CLI, batch)

**Analog:** `scripts/test-knowledge-live.mjs` lines 1-30, 136-140

**Execution pattern**:
```typescript
import { evaluateAllCases } from '../tests/ai/evaluatorCore.ts';
import { evaluateReleaseGate, DEFAULT_GATE_THRESHOLDS } from '../tests/ai/releaseGate.ts';
import { writeBenchmarkReports } from '../tests/ai/reportGenerator.ts';
import fixtureData from '../tests/fixtures/ai/grounded-assistant-reference.json' with { type: 'json' };

async function main() {
  console.log('[BENCHMARK] Executing 40 deterministic replay cases...');
  const results = await evaluateAllCases(fixtureData);
  const verdict = evaluateReleaseGate(results, DEFAULT_GATE_THRESHOLDS);
  // generate report and write
  const report = buildReportFromVerdict(results, verdict);
  const { jsonPath, markdownPath } = writeBenchmarkReports(report);
  console.log(`[REPORT] Written to ${jsonPath} and ${markdownPath}`);

  // Summary table
  printConsoleSummary(verdict);

  if (!verdict.passedGate) {
    console.error('[GATE FAILED] Benchmark thresholds or trust invariants breached.');
    process.exit(1);
  }
  console.log('[GATE PASSED] All release gate thresholds and trust invariants satisfied.');
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
```

---

### `package.json` (config, config)

**Analog:** `package.json` lines 6-21

**Diff pattern**:
```json
    "test:knowledge": "npm --prefix knowledge-server test",
    "test:knowledge:live": "node scripts/test-knowledge-live.mjs",
    "benchmark": "node --experimental-strip-types scripts/run-benchmark.ts",
```

---

### `tests/ai/groundedAssistantEval.test.ts` (test, batch)

**Analog:** `tests/ai/groundedAssistantEval.test.ts` lines 24-310

**Integration pattern**:
```typescript
import { describe, it, expect } from 'vitest';
import fixtureData from '../fixtures/ai/grounded-assistant-reference.json';
import {
  GroundedReferenceCaseSchema,
  type GroundedReferenceCase,
} from '../fixtures/ai/grounded-reference-fixture-schema';
import { evaluateBenchmarkCase } from './evaluatorCore';
import { evaluateReleaseGate } from './releaseGate';

describe('groundedAssistantEval: 40-case reference fixture replay', () => {
  const cases: GroundedReferenceCase[] = fixtureData.map((c) =>
    GroundedReferenceCaseSchema.parse(c)
  );

  it('contains exactly 40 cases with valid schema (D-06)', () => {
    expect(cases.length).toBe(40);
  });

  const results: any[] = [];

  cases.forEach((tc) => {
    it(`evaluates [${tc.id}] (${tc.category}/${tc.language}): ${tc.query.slice(0, 40)}...`, async () => {
      const result = await evaluateBenchmarkCase(tc);
      results.push(result);

      expect(result.invariantViolations).toEqual([]);
      expect(result.failureReasons).toEqual([]);
      expect(result.passed).toBe(true);
    });
  });

  it('satisfies release gate thresholds across all 40 cases (D-01, D-02, D-03)', () => {
    const verdict = evaluateReleaseGate(results);
    expect(verdict.passedGate).toBe(true);
    expect(verdict.aggregatePassRate).toBeGreaterThanOrEqual(0.90);
    expect(verdict.threeHopScore.passRate).toBeGreaterThanOrEqual(0.90);
    expect(verdict.pathFidelity.fidelityRate).toBe(1.00);
    expect(verdict.invariantViolations).toHaveLength(0);
  });
});
```

---

### `knowledge-server/tests/graphRebuildEquivalence.test.ts` (test, batch)

**Analog:** `knowledge-server/tests/graphRebuild.test.ts` lines 1-170

**Setup & Assertion pattern**:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SnapshotStore } from '../src/indexing/snapshotStore.js';
import { GraphBuildService } from '../src/services/graphBuildService.js';
import { InMemoryGraphRepository } from '../src/graph/graphRepository.js';

describe('Semantic Graph Rebuild Equivalence (D-17, QUAL-04)', () => {
  let tempDir: string;
  const setId = '60000006-0000-4000-8000-000000000000';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-store-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('preserves stable URNs, factKeys, classifications, and query paths across rebuilds (D-17)', async () => {
    const store = new SnapshotStore({ storageDir: tempDir });
    const repo = new InMemoryGraphRepository();
    const service = new GraphBuildService(repo, store);

    // Snapshot preparation & first rebuild
    // ...
    const graphId1 = await service.executeRebuildSync(setId);
    const facts1 = await service.getFacts(setId);

    // Second rebuild from identical Markdown
    const graphId2 = await service.executeRebuildSync(setId);
    const facts2 = await service.getFacts(setId);

    // Non-semantic identifiers may differ
    expect(graphId1).not.toBe(graphId2);

    // Semantic equivalence assertions
    const factKeys1 = new Set(facts1.facts.map((f) => f.factKey));
    const factKeys2 = new Set(facts2.facts.map((f) => f.factKey));
    expect(factKeys1).toEqual(factKeys2);

    for (const f1 of facts1.facts) {
      const f2 = facts2.facts.find((f) => f.factKey === f1.factKey);
      expect(f2).toBeDefined();
      expect(f1.subjectUrn).toBe(f2!.subjectUrn);
      expect(f1.relation).toBe(f2!.relation);
      expect(f1.objectUrn).toBe(f2!.objectUrn);
      expect(f1.effectiveClassification).toBe(f2!.effectiveClassification);
    }
  });
});
```

---

### `tests/knowledge/offlineIsolation.test.ts` (test, batch)

**Analog:** `tests/knowledge/offlineIsolation.test.ts` lines 84-200, 201-308

**Transport error matrix pattern** (D-20):
```typescript
// Test matrix covering all 5 failure modes:
// 1. Daemon disabled (serverEnabled: false) -> LOCAL_FALLBACK_SYNTHESIS, SERVER_DISABLED, zero egress
// 2. Connection refused (NETWORK_ERROR) -> LOCAL_FALLBACK_SYNTHESIS, NETWORK_ERROR, zero subsequent egress
// 3. Request timeout (TIMEOUT) -> LOCAL_FALLBACK_SYNTHESIS, TIMEOUT, zero subsequent egress
// 4. Remote 401 Unauthorized (REMOTE_ERROR_401) -> ERROR_AUTH visible, NO fallback to BM25
// 5. Invalid/malformed response (ERROR_INVALID_RESPONSE) -> ERROR_INVALID_RESPONSE visible, NO fallback
```

---

### `tests/security/credentialIsolation.test.ts` (test, batch)

**Analog:** `tests/knowledge/publishDlpGate.test.ts` lines 100-240

**Credential check and DLP verification pattern** (D-21, D-23):
```typescript
import { describe, it, expect, vi } from 'vitest';
import { evaluateAllCases } from '../ai/evaluatorCore';
import { buildReportFromVerdict } from '../ai/reportGenerator';
import { evaluateReleaseGate } from '../ai/releaseGate';
import { PublishSession } from '../../src/services/knowledge/publishOrchestrator';

describe('Credential Isolation & DLP Boundary Preservation (QUAL-05, D-21, D-23)', () => {
  const TEST_SECRET = 'super-secret-daemon-token-xyz987';

  it('ensures generated benchmark JSON and Markdown reports never contain configured test secret', async () => {
    // Generate report
    const results = await evaluateAllCases();
    const verdict = evaluateReleaseGate(results);
    const report = buildReportFromVerdict(results, verdict);
    const jsonStr = JSON.stringify(report);

    expect(jsonStr).not.toContain(TEST_SECRET);
    expect(jsonStr).not.toMatch(/Bearer\s+[a-zA-Z0-9_\-\.]+/);
  });

  it('retains Phase 16 DLP scanning and fresh one-time nonce check before document publication (D-21)', async () => {
    // Verify PublishSession requires fresh preview, scan, and explicit confirmation before POST
  });
});
```

---

## Shared Patterns

### Zero-Tolerance Invariant Checks
**Source:** `tests/ai/evaluatorCore.ts` & `src/services/ai/evidencePack.ts`
**Apply to:** All benchmark case evaluations
```typescript
// Any invariant breach fails release immediately regardless of aggregate score
if (tc.expected.forbiddenFallback && networkSpy.calls > 0) {
  invariantViolations.push(`Invariant breached: offline fallback triggered ${networkSpy.calls} network calls`);
}

if (result.kind === 'grounded_answer') {
  const combinedText = `${result.grounding.answer?.conclusion ?? ''} ${result.grounding.answer?.claims.map(c => c.text).join(' ') ?? ''}`;
  for (const forbidden of tc.expected.forbiddenClaims) {
    if (combinedText.includes(forbidden)) {
      invariantViolations.push(`Invariant breached: forbidden claim detected: "${forbidden}"`);
    }
  }
}
```

### Strict Zod Boundary Validation
**Source:** `src/validation/backupSchemas.ts`, `tests/fixtures/ai/grounded-reference-fixture-schema.ts`
**Apply to:** All fixture schemas and report schemas
```typescript
import { z } from 'zod';
// Always use z.strictObject() to reject unrecognized keys at trust boundaries
```

### Single Snapshot Path Scoping
**Source:** `src/services/ai/evidencePack.ts`
**Apply to:** Graph traversal and path validation
```typescript
// All nodes and edges in any evidence path must originate from the identical pinned snapshotId
```

---

## No Analog Found

All 12 files have exact or strong role-match analogs in the codebase.

| File | Role | Data Flow | Reason |
|---|---|---|---|
| *None* | — | — | Full analog coverage achieved. |

---

## Metadata

**Analog search scope:** `tests/`, `src/services/ai/`, `knowledge-server/tests/`, `scripts/`
**Files scanned:** 18
**Pattern extraction date:** 2026-10-17
