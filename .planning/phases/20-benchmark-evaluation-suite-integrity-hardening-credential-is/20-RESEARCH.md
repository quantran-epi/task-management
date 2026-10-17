# Phase 20: Benchmark Evaluation Suite, Integrity Hardening & Credential Isolation - Research

**Researched:** 2026-10-17
**Domain:** Benchmark evaluation, GraphRAG answer quality, release gating, semantic rebuild equivalence, offline recovery, credential isolation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Scoring and release gate
- **D-01:** Use hybrid release gates: aggregate score, per-category score, explicit three-hop score, path-fidelity gate, and zero-tolerance trust invariants.
- **D-02:** Required thresholds are overall pass rate `>= 90%`, every category `>= 80%`, three-hop answer success `>= 90%`, and graph path fidelity `100%`.
- **D-03:** Trust invariants have zero tolerance. Any unsupported material claim, invalid or cross-snapshot path, suppressed conflict branch or silently selected winner, credential leakage, Phase 16 DLP bypass, or network egress from an offline fallback path fails the release regardless of aggregate score.
- **D-04:** Run all cases and report all failures. Never mask a failure with retry. Retry may diagnose nondeterminism, but an unstable first result remains a failure.
- **D-05:** A correct conclusion with an invalid hop fails path fidelity. Every expected path edge must match its source identity, relation type, target identity, and snapshot boundary.

#### Benchmark case mix
- **D-06:** Benchmark contains exactly 40 version-controlled cases for this phase: preserve the existing 20 Phase 19 reference cases and add 20 risk-weighted cases.
- **D-07:** Allocate the 20 new cases as: 6 multi-hop/path, 4 semantic/scope, 3 conflict/abstention, 4 security/integrity, and 3 rebuild/offline recovery.
- **D-08:** Use mixed fixtures. Representative user queries and three-hop acceptance cases use the canonical process `60000006` pilot corpus. Rare corruption, cycle, timeout, isolation, and other controlled failure states may use small synthetic fixtures.
- **D-09:** Each case uses a semantic expected contract, not an exact prose snapshot. Contracts may assert expected outcome, required facts, required paths, expected sources and ranges, forbidden claims, and behavioral invariants.
- **D-10:** Existing exact lookup, process flow, call chain, conflict, abstention, fallback, language-lock, prompt-injection, and navigation cases remain regression baseline. New cases concentrate on uncovered high-risk behavior rather than inflate scores with duplicate easy lookups.

#### Harness and reports
- **D-11:** `npm run benchmark` is the maintainer entry point. It runs the deterministic suite and applies release gates. Targeted Vitest invocation remains available for debugging individual cases; do not create an independent duplicate assertion engine.
- **D-12:** Deterministic, offline replay is the authoritative release gate. Provider calls are mocked or replaced by fixed fixtures, making the gate reproducible, free of network dependencies, and safe for CI.
- **D-13:** An optional live-provider smoke mode may exist only behind explicit opt-in. It uses sanitized fixtures, writes a separate advisory report, and never replaces or changes the deterministic release score.
- **D-14:** Each benchmark run produces one schema-versioned canonical JSON report and one Markdown report rendered from that JSON. Console output is a concise summary.
- **D-15:** Reports include thresholds, aggregate and category scores, failed case IDs, expected-versus-actual semantic failures, path failures, and invariant violations. Reports must not dump secrets, raw sensitive payloads, or full private documents.
- **D-16:** Generated reports are ignored locally. CI uploads JSON and Markdown reports for both passing and failing runs. Fixtures, schemas, and report rendering code remain version-controlled; timestamped run outputs do not.

#### Integrity, recovery, and credential boundaries
- **D-17:** Prove rebuildability through semantic equivalence, not byte-identical storage. Before/after rebuild comparisons cover stable entity URNs, `factKey` values, relation endpoints, classifications, conflicts, provenance locators, required graph paths, and gold retrieval results. Internal database IDs, timestamps, and physical index order are non-semantic.
- **D-18:** Use a layered gate after Phase 19.1: the 40-case deterministic suite is the primary gate, plus a focused integration subset against the real Neo4j artifact for rebuild equivalence, representative one-, two-, and three-hop paths, and recovery behavior.
- **D-19:** The real-artifact subset must use Phase 19.1's final runtime contract. Do not invent container topology, artifact paths, schema commands, readiness probes, or reset/rebuild commands in Phase 20 context or planning.
- **D-20:** Automated offline coverage includes daemon disabled, connection refused, timeout, `401`, and invalid response. Only the transport states allowed by Phase 19 trigger local BM25 fallback; authentication/configuration/invalid-response failures stay visible. Every offline fallback case proves zero external egress.
- **D-21:** Keep the Phase 16 DLP boundary unchanged: publish attempts retain sensitive-data scanning and fresh confirmation. Do not expand DLP to every AI chat prompt or query in this phase. Optional live smoke uses sanitized fixtures, and remote providers remain off by default.
- **D-22:** Keep provider and Neo4j secrets in knowledge-daemon environment variables. Do not add OS-keyring integration, encrypted config files, secret dashboards, rotation workflows, or client-supplied provider keys.
- **D-23:** Credential-isolation verification stays minimal: one focused protocol-boundary regression check proves representative API output and generated benchmark reports do not include a configured test secret. Phase 20 must focus effort on main benchmark, rebuild, path, and recovery flows rather than build a general secret-scanning framework.

#### Requirements traceability
- **D-24:** `QUAL-01` through `QUAL-05` are referenced by `.planning/ROADMAP.md` but are absent from `.planning/REQUIREMENTS.md`. Planning must restore concise requirement definitions and traceability without changing this phase's scope or overriding decisions above.

### Claude's Discretion
- Exact names and JSON fields for case definitions and reports, provided they are schema-versioned and represent all semantic assertions in D-09/D-15.
- Exact selection of cases within each D-07 allocation and the size of the real-Neo4j integration subset, provided all required categories, one-/two-/three-hop paths, rebuild equivalence, and recovery states are covered.
- Exact local report output directory and CI artifact name.
- Exact optional live-smoke command name and provider adapter, provided opt-in, sanitization, separation from release score, and remote-off-by-default rules hold.

### Deferred Ideas (OUT OF SCOPE)
- General DLP coverage for every AI chat prompt, retrieval query, and provider request — not needed for Phase 20; retain Phase 16 publish boundary.
- OS keyring or encrypted secret-file support for the knowledge daemon — deferred unless deployment evidence proves environment variables insufficient.
- Full live-provider benchmark as a release gate — rejected because cost, network state, and model drift make it nondeterministic.
- Full-corpus expansion beyond process `60000006` — outside v1.2 pilot scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QUAL-01 | Maintainer can execute a version-controlled 40-case benchmark harness covering exact lookup, semantic retrieval, process flow, call chain, three-hop impact, conflict, abstention, security, and offline recovery cases. | Expanded fixture JSON (`tests/fixtures/ai/grounded-assistant-reference.json`) with exactly 40 cases (20 Phase 19 baseline + 20 risk-weighted cases per D-06/D-07), evaluated via deterministic replay in `src/services/ai/benchmarkRunner.ts` and `tests/ai/groundedAssistantEval.test.ts`. |
| QUAL-02 | Benchmark asserts semantic expectations (expected sources/ranges, required graph paths with hop source/rel/target, required facts) and zero-tolerance trust invariants (no unsupported claims, single-snapshot path closure, balanced conflicts, zero credential leakage, zero offline egress). | Zod schema extensions (`GroundedReferenceCaseSchema`, `BenchmarkReportSchema`), `validateGroundedAnswerClosure()` in `src/services/ai/evidencePack.ts`, and strict invariant evaluators in `src/services/ai/benchmarkInvariants.ts`. |
| QUAL-03 | Automated release gate enforces aggregate pass rate `>= 90%`, per-category pass rate `>= 80%`, three-hop answer success `>= 90%`, graph path fidelity `100%`, and zero invariant violations, reporting all failures without masking retries. | Release gate evaluator and CLI runner `scripts/run-benchmark.ts` invoked via `npm run benchmark`, generating canonical schema-versioned JSON and rendered Markdown reports without test retries. |
| QUAL-04 | Automated checks prove knowledge graph rebuild produces semantic equivalence (stable URNs, factKeys, classifications, paths, retrieval results) and offline transport failures (connection refused, timeout) safely fall back to local BM25 with zero network egress while auth/config/parse errors remain visible. | Semantic equivalence comparator in `knowledge-server/tests/graphRebuildEquivalence.test.ts` and offline transport taxonomy test matrix in `tests/knowledge/offlineIsolation.test.ts`. |
| QUAL-05 | Verification proves daemon secrets never leak across API endpoints or generated benchmark reports, and Phase 16 sensitive-data scanning / fresh confirmation remains enforced before document publication. | Protocol boundary regression test in `tests/security/credentialIsolation.test.ts` asserting absence of configured test secrets across API outputs and generated benchmark reports, plus preservation of `PublishSession` DLP scanning and fresh one-time nonce checks. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Single Personal User**: One personal user, no multi-tenant roles or collaboration model.
- **Offline-First & Local Authority**: Core PlannerMate application behavior remains 100% local; knowledge daemon is optional. If daemon is absent, disabled, or unreachable, local Docs, autosave, IndexedDB, and BM25 search continue working with zero network egress.
- **No External Secrets in Client**: Never store API tokens or passphrases in `.env`, bundle, or client source. Daemon credentials remain in knowledge-daemon environment variables.
- **Canonical Markdown Storage**: Published Markdown is the canonical truth. Neo4j graph nodes, full-text indexes, and vector embeddings are rebuildable projections.
- **Pinned Snapshots**: Graph traversal and citations are valid only within a single pinned snapshot. Cross-snapshot edge chaining is forbidden.
- **DLP Boundary Integrity**: Document publishing retains client-side sensitive-data scanning and fresh explicit confirmation for every affected attempt without persisted trust bypass.
- **Strict Anti-Loop Tool Usage**: Broad single reads (100-300+ lines); no repeated small chunk reads or read loops.

## Summary

Phase 20 delivers the automated benchmark evaluation suite, integrity hardening, and credential isolation verification that serves as the final release gate for the GraphRAG knowledge milestone (Phases 16–19.2). It expands the existing 20-case grounded assistant replay harness to exactly 40 risk-weighted cases, enforces explicit release thresholds, verifies semantic rebuild equivalence against the real Neo4j projection, hardens offline recovery behavior across all transport failure modes, and proves credential isolation across API boundaries and benchmark reports.

The evaluation architecture is strictly deterministic and offline-first: `npm run benchmark` executes the 40 cases through deterministic dependency injection (mocked retrieval and synthesis responses) in under 5 seconds, eliminating network flakiness, token cost, and LLM drift. Every run outputs a schema-versioned canonical JSON report and an executive Markdown report detailing category pass rates, 3-hop fidelity, and zero-tolerance trust invariant checks. A companion integration test suite verifies semantic rebuild equivalence against the persistent Neo4j artifact and validates client fallback with zero network egress.

**Primary recommendation:** Build a unified `benchmarkRunner.ts` core engine consumed by both `tests/ai/groundedAssistantEval.test.ts` (Vitest interactive debugging) and `scripts/run-benchmark.ts` (`npm run benchmark` CLI entry point with JSON/Markdown reporting and exit-code gates), ensuring zero assertion engine duplication while meeting all D-01 through D-24 release gate criteria.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 40-case benchmark execution & evaluation | Client / Node Test Harness | Vitest Runner | Deterministic replay validates client grounded turn state machine, closure validator, and fallback taxonomy with zero network dependencies. |
| Hybrid release gate & reporting | Maintainer CLI (`npm run benchmark`) | CI/CD Runner | Evaluates aggregate, category, 3-hop, path fidelity, and trust invariant thresholds; produces canonical JSON and rendered Markdown reports. |
| Semantic rebuild equivalence verification | Knowledge Server / Services | Neo4j Repository | Compares graph projection before and after rebuild (stable URNs, factKeys, endpoints, classifications, retrieval results) ignoring non-semantic database IDs. |
| Offline recovery & transport error taxonomy | Browser Client (`groundedTurn.ts`) | IndexedDB (`TaskPlannerDatabase`) | Enforces safe local BM25 fallback on network errors/timeouts while keeping auth, config, and malformed response errors visible with zero egress. |
| Protocol credential isolation & DLP regression | Knowledge Server API & Client Publish Session | Benchmark Reporter | Ensures configured daemon environment secrets never leak to API responses or benchmark reports, and Phase 16 DLP publish checks remain enforced. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 5.0.2 [VERIFIED: npm registry] | Unit and benchmark test runner | Standard test runner in project; fast ESM execution, snapshot support, built-in mocking (`vi.fn()`). |
| zod | 4.6.5 [VERIFIED: npm registry] | Runtime schema validation | Fixed project standard for all protocol boundaries, case contracts, and report schemas. |
| typescript | 7.0.2 [VERIFIED: npm registry] | Static typing & interface definitions | Enforces strict compiler safety (`strict: true`, `noUncheckedIndexedAccess`). |
| node:crypto | stdlib (Node 24 LTS) | SHA-256 hash calculation & UUID generation | Native high-performance cryptography for checksums, run IDs, and nonces without external dependencies. |
| node:fs / node:path | stdlib (Node 24 LTS) | File system operations & report persistence | Native file writing for canonical JSON and rendered Markdown benchmark reports. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tsx | 4.23.15 [VERIFIED: npm registry] | TypeScript script executor | Used for `npm run benchmark` CLI script execution without build step. |
| fake-indexeddb | 6.2.5 [VERIFIED: npm registry] | Dexie test database shim | In-memory IndexedDB emulation for offline recovery and local BM25 tests. |
| fastify | 5.12.5 [VERIFIED: npm registry] | Knowledge server HTTP framework | Knowledge daemon API server for testing credential isolation on `/api/v1/*` routes. |
| neo4j-driver | 6.2.0 [VERIFIED: npm registry] | Neo4j graph database client | Driver for querying and verifying real Neo4j graph projection during integration tests. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Deterministic offline replay | Live LLM provider benchmark | Live provider calls are nondeterministic, cost money, suffer network latency/flakiness, and fail CI reliability requirements (D-12). |
| Shared core runner module | Duplicate Vitest and CLI assertion code | Duplication violates D-11; bugs emerge when CLI and Vitest report different numbers. |
| Semantic graph comparison | Raw database dump / byte comparison | Internal database IDs, timestamps, and B-tree storage layouts differ between rebuilds; semantic comparison correctly isolates true equivalence (D-17). |

**Installation:**
No new external packages are required. All tooling is present in the workspace.

## Package Legitimacy Audit

No external packages installed for this phase. All required dependencies (`vitest`, `zod`, `tsx`, `neo4j-driver`) are already installed and locked in `package.json` and `knowledge-server/package.json`.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| zod | npm | 4 yrs | 346M/wk | github.com/colinhacks/zod | [OK] | Existing dependency (v4.6.5) |
| vitest | npm | 3 yrs | 125M/wk | github.com/vitest-dev/vitest | [OK] | Existing dependency (v5.0.2) |

**Packages removed due to [SLOP] verdict:** None
**Packages flagged as suspicious [SUS]:** None

## Architecture Patterns

### System Architecture Diagram

```
+--------------------------------------------------------------------------------------------------+
| Maintainer Entry Point: npm run benchmark (scripts/run-benchmark.ts)                            |
| Target Vitest: npx vitest run tests/ai/groundedAssistantEval.test.ts                            |
+--------------------------------------------------------------------------------------------------+
                                                 |
                                                 v
                     +-------------------------------------------------------+
                     |         Benchmark Runner (evaluatorCore.ts)           |
                     |  - Loads 40 cases from grounded-assistant-ref.json    |
                     |  - Injects Mock Deps (routeIntent, retrieve, synth)   |
                     |  - Invokes runGroundedTurn()                          |
                     |  - Asserts Semantic Contract & Path Fidelity          |
                     |  - Evaluates Zero-Tolerance Invariants                |
                     +-------------------------------------------------------+
                                                 |
                         +-----------------------+-----------------------+
                         |                                               |
                         v                                               v
     +---------------------------------------+       +---------------------------------------+
     |        Release Gate Evaluator         |       |      Semantic Rebuild & Isolation     |
     | - Aggregate pass rate >= 90%          |       | - Semantic Rebuild Equivalence        |
     | - Per-category pass rate >= 80%       |       |   (stable URNs, factKeys, paths)      |
     | - Three-hop answer success >= 90%     |       | - Offline transport error matrix      |
     | - Graph path fidelity 100%            |       |   (refused, timeout, 401, malformed)  |
     | - Invariant violations == 0           |       | - Protocol credential isolation check |
     | - Zero masked retries                 |       | - Phase 16 DLP publish check          |
     +---------------------------------------+       +---------------------------------------+
                         |                                               |
                         +-----------------------+-----------------------+
                                                 |
                                                 v
                     +-------------------------------------------------------+
                     |                Report Output Generator                |
                     |  1. Canonical JSON: .benchmark-reports/latest.json    |
                     |  2. Markdown: .benchmark-reports/latest.md            |
                     |  3. Console concise summary table                     |
                     |  (No raw secrets, no full docs, exit code 0 or 1)     |
                     +-------------------------------------------------------+
```

### Recommended Project Structure

```
tests/
├── ai/
│   ├── groundedAssistantEval.test.ts      # 40-case Vitest replay test (uses evaluatorCore)
│   ├── evaluatorCore.ts                   # Core case evaluator, contract checker, and invariant auditor
│   ├── releaseGate.ts                     # Threshold evaluator (90% agg, 80% cat, 90% 3-hop, 100% path)
│   └── reportGenerator.ts                 # JSON and Markdown report rendering
├── fixtures/
│   └── ai/
│       ├── grounded-assistant-reference.json     # Exactly 40 version-controlled benchmark cases
│       └── grounded-reference-fixture-schema.ts  # Zod schema with categories and invariants
├── security/
│   └── credentialIsolation.test.ts        # Zero-leakage regression check on API & reports
└── knowledge/
    └── offlineIsolation.test.ts           # Matrix of offline transport states & zero egress

knowledge-server/
└── tests/
    └── graphRebuildEquivalence.test.ts    # Semantic equivalence test across graph rebuilds

scripts/
└── run-benchmark.ts                       # Maintainer CLI entry point for `npm run benchmark`
```

### Pattern 1: Unified Replay Core with Deterministic Dependency Injection
**What:** Decouple case evaluation logic from test framework assertions so that both Vitest and the standalone `run-benchmark` CLI execute identical evaluation logic without duplicating code.
**When to use:** Whenever a test suite serves dual roles: interactive unit testing during development and an authoritative release gate CLI in CI.
**Example:**
```typescript
// tests/ai/evaluatorCore.ts
import { runGroundedTurn, type GroundedTurnDeps, type GroundedTurnInput } from '../../src/services/ai/groundedTurn';
import { validateGroundedAnswerClosure } from '../../src/services/ai/evidencePack';
import type { GroundedReferenceCase } from '../fixtures/ai/grounded-reference-fixture-schema';

export interface CaseEvaluationResult {
  readonly id: string;
  readonly category: string;
  readonly passed: boolean;
  readonly isThreeHop: boolean;
  readonly pathFidelityPassed: boolean;
  readonly failureReasons: readonly string[];
  readonly invariantViolations: readonly string[];
  readonly actualOutcome: string | null;
}

export async function evaluateBenchmarkCase(
  tc: GroundedReferenceCase,
  networkSpy: { calls: number }
): Promise<CaseEvaluationResult> {
  const failureReasons: string[] = [];
  const invariantViolations: string[] = [];
  let pathFidelityPassed = true;

  // 1. Build deterministic mock dependencies
  const mockDeps = createMockDepsForCase(tc, networkSpy);

  // 2. Execute turn
  const result = await runGroundedTurn(createTurnInput(tc), mockDeps);

  // 3. Evaluate kind and outcome
  if (result.kind !== tc.expected.kind) {
    failureReasons.push(`Expected kind '${tc.expected.kind}', got '${result.kind}'`);
  }

  // 4. Evaluate Zero-Tolerance Invariants
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

    // 5. Evaluate Path Fidelity (100% required)
    if (tc.expected.requiredPathIds.length > 0) {
      const actualPathIds = new Set(result.grounding.paths?.map(p => p.pathId) ?? []);
      for (const reqPid of tc.expected.requiredPathIds) {
        if (!actualPathIds.has(reqPid)) {
          pathFidelityPassed = false;
          failureReasons.push(`Missing required path ID: ${reqPid}`);
        }
      }
    }
  }

  const passed = failureReasons.length === 0 && invariantViolations.length === 0 && pathFidelityPassed;
  return {
    id: tc.id,
    category: tc.category,
    passed,
    isThreeHop: tc.rubricIds.includes('ANSWER-02') && tc.expected.requiredPathIds.length > 0,
    pathFidelityPassed,
    failureReasons,
    invariantViolations,
    actualOutcome: 'outcome' in result ? (result.outcome as string) : null,
  };
}
```

### Pattern 2: Hybrid Release Gate Scoring
**What:** Release gate evaluates aggregate score, category scores, 3-hop score, path fidelity, and trust invariants simultaneously. If ANY invariant fails, the release fails even if aggregate pass rate is 100%.
**When to use:** High-trust AI systems where safety, accuracy, and credential isolation must not be compromised by statistical averaging.
**Example:**
```typescript
// tests/ai/releaseGate.ts
export interface GateThresholds {
  readonly aggregatePassRate: number; // 0.90
  readonly categoryPassRate: number;  // 0.80
  readonly threeHopPassRate: number;  // 0.90
  readonly pathFidelityRate: number;  // 1.00
  readonly maxInvariantViolations: number; // 0
}

export function evaluateReleaseGate(results: readonly CaseEvaluationResult[]): GateVerdict {
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const aggregateRate = total > 0 ? passed / total : 0;

  const categories: Record<string, { total: number; passed: number; rate: number }> = {};
  for (const r of results) {
    const cat = categories[r.category] ?? { total: 0, passed: 0, rate: 0 };
    cat.total++;
    if (r.passed) cat.passed++;
    cat.rate = cat.passed / cat.total;
    categories[r.category] = cat;
  }

  const threeHopCases = results.filter(r => r.isThreeHop);
  const threeHopPassed = threeHopCases.filter(r => r.passed).length;
  const threeHopRate = threeHopCases.length > 0 ? threeHopPassed / threeHopCases.length : 1.0;

  const pathCases = results.filter(r => r.expectedPathsCount > 0);
  const pathFidelityPassed = pathCases.filter(r => r.pathFidelityPassed).length;
  const pathFidelityRate = pathCases.length > 0 ? pathFidelityPassed / pathCases.length : 1.0;

  const allViolations = results.flatMap(r => r.invariantViolations);

  const passesAggregate = aggregateRate >= 0.90;
  const passesCategories = Object.values(categories).every(c => c.rate >= 0.80);
  const passesThreeHop = threeHopRate >= 0.90;
  const passesPathFidelity = pathFidelityRate === 1.0;
  const passesInvariants = allViolations.length === 0;

  const passedGate = passesAggregate && passesCategories && passesThreeHop && passesPathFidelity && passesInvariants;

  return {
    passedGate,
    aggregateRate,
    categories,
    threeHopRate,
    pathFidelityRate,
    invariantViolations: allViolations,
  };
}
```

### Pattern 3: Semantic Rebuild Equivalence Assertion
**What:** Compare two graph snapshots generated independently from the same published Markdown documents. Assert that domain entities, relations, classifications, provenance, and graph queries match exactly, while ignoring physical internal database IDs and creation timestamps.
**When to use:** Testing graph rebuildability and atomic swap mechanisms.
**Example:**
```typescript
// knowledge-server/tests/graphRebuildEquivalence.test.ts
export function assertSemanticGraphEquivalence(snapshotA: GraphSnapshot, snapshotB: GraphSnapshot) {
  // 1. Compare node count and stable URN sets
  const urnsA = new Set(snapshotA.nodes.map(n => n.urn));
  const urnsB = new Set(snapshotB.nodes.map(n => n.urn));
  expect(urnsA).toEqual(urnsB);

  // 2. Compare relation endpoints and factKeys
  const factsA = new Map(snapshotA.relations.map(r => [r.factKey, r]));
  const factsB = new Map(snapshotB.relations.map(r => [r.factKey, r]));
  expect(factsA.size).toBe(factsB.size);

  for (const [key, relA] of factsA.entries()) {
    const relB = factsB.get(key);
    expect(relB).toBeDefined();
    expect(relA.subjectUrn).toBe(relB!.subjectUrn);
    expect(relA.relation).toBe(relB!.relation);
    expect(relA.objectUrn).toBe(relB!.objectUrn);
    expect(relA.effectiveClassification).toBe(relB!.effectiveClassification);
  }

  // 3. Normalized projection hash must match byte-for-byte
  expect(snapshotA.normalizedProjectionHash).toBe(snapshotB.normalizedProjectionHash);
}
```

### Anti-Patterns to Avoid
- **Masking Flaky Cases with Retries:** Retrying failed cases until they pass conceals nondeterminism. D-04 requires running each case once and recording every failure.
- **Asserting Exact Prose Snapshots:** LLM phrasing fluctuates. Asserting full raw prose strings creates brittle tests. Assert required facts, citation identifiers, graph paths, and forbidden claims instead (D-09).
- **Evaluating Path Correctness Only at the Endpoint:** Reaching the correct target via an hallucinated or cross-snapshot intermediate node is an invalid path. D-05 mandates 100% path fidelity for every hop.
- **Serializing Raw Secrets or Full Documents into Benchmark Reports:** Printing error traces containing authorization headers or unmasked sensitive PII violates D-15 and D-23. Reports must remain strictly metadata-only.
- **Allowing Silent Fallback on Auth/Config Errors:** Swallowing 401 or configuration errors into local search hides critical infrastructure failures. Only network/timeout errors should trigger local fallback (D-20).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test Execution & Runner | Custom test framework | `vitest` 5.0.2 | Already integrated with TypeScript, fast worker threads, zero config needed. |
| Schema & Report Validation | Hand-rolled property checks | `zod` 4.6.5 | Standard throughout repository; provides descriptive error paths and strict type inference. |
| Report Output File Generation | Heavy reporting library (Allure, Istanbul) | Node `fs.writeFileSync` with template string | Zero dependencies, predictable output format, directly converts JSON to clean Markdown. |
| Checksums & Unique Identifiers | Custom hashing or Math.random | `node:crypto` (`createHash`, `randomUUID`) | Standard cryptographically secure native primitives. |

## Runtime State Inventory

Category: Greenfield evaluation harness & hardening phase.
No files or database schemas are being renamed or migrated.
Runtime state inventory: None — verified by phase boundary analysis.

## Common Pitfalls

### Pitfall 1: Non-Deterministic Provider Latency in Benchmark Gate
**What goes wrong:** Calling live LLMs or remote APIs during `npm run benchmark` causes timeouts, rate limits, non-reproducible scores, and CI failures.
**Why it happens:** External AI APIs are inherently stochastic and network-dependent.
**How to avoid:** Use deterministic offline replay (D-12) with fixed mock fixtures as the authoritative release gate. Optional live provider testing remains strictly behind an opt-in flag (D-13) and does not affect the gate score.

### Pitfall 2: False Sense of Security from Statistical Averaging
**What goes wrong:** A model scores 95% overall, but leaks a credential or hallucinates an unsupported security claim.
**Why it happens:** Traditional benchmark harnesses use only aggregate accuracy.
**How to avoid:** Enforce hybrid release gates (D-01, D-03). Trust invariants (zero unsupported claims, zero credential leakage, zero DLP bypass, zero offline network egress) have zero tolerance. A single violation triggers an immediate release gate failure.

### Pitfall 3: Path Fidelity Evaluated Without Snapshot Boundary Check
**What goes wrong:** A multi-hop query chains node A (from snapshot 1) to node B (from snapshot 2).
**Why it happens:** Traversals that do not scope each hop by `graphSnapshotId` can bridge stale and new entity versions.
**How to avoid:** Every hop assertion in path fidelity must verify that all participating nodes and edges share the identical pinned `snapshotId` (D-05, D-17).

### Pitfall 4: Local Fallback Leaking Network Calls
**What goes wrong:** The knowledge client experiences a timeout, falls back to local BM25, but background retry logic or prefetch tasks still trigger network calls.
**Why it happens:** Incomplete error handling or unstopped async promises in the client.
**How to avoid:** Explicit offline isolation tests mock global `fetch` with a spy and assert zero calls during local BM25 execution.

## Code Examples

### 40-Case Benchmark Schema Structure
```typescript
// tests/fixtures/ai/grounded-reference-fixture-schema.ts
import { z } from 'zod';

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
  outcome: z.enum([
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
  ]).nullable(),
  requiredCitationIds: z.array(z.string()),
  forbiddenClaims: z.array(z.string()),
  requiredFacts: z.array(z.string()),
  requiredPathIds: z.array(z.string()),
  requiredConflictBranches: z.number().int().nonnegative().optional(),
  requiredCoverageWarnings: z.array(z.string()),
  requiredFallbackReason: z.string().nullable(),
  requiredRefinementCount: z.number().int().nonnegative().nullable(),
  requiredCandidates: z.array(
    z.strictObject({
      canonicalName: z.string(),
      kind: z.string(),
    })
  ).nullable(),
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
  retrievalMock: z.strictObject({
    outcome: z.string(),
    errorCode: z.string().nullable(),
    response: z.record(z.string(), z.unknown()),
  }).nullable(),
  localResultMock: z.record(z.string(), z.unknown()).nullable(),
  synthesisMock: z.record(z.string(), z.unknown()).nullable(),
  expected: GroundedReferenceExpectedSchema,
  rubricIds: z.array(z.string()),
});
```

### Canonical Benchmark Report Schema
```typescript
// src/services/ai/benchmarkReportSchemas.ts
import { z } from 'zod';

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

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Aggregate accuracy scoring only | Hybrid multi-tier release gates (category, path, invariant) | Phase 20 (D-01) | Prevents averaging out critical security/integrity failures. |
| Exact string prose snapshot matching | Semantic expectation contracts (facts, paths, forbidden claims) | Phase 19/20 (D-09) | Eliminates test brittleness while rigorously validating evidence grounding. |
| Byte-identical database comparisons for rebuild | Semantic equivalence (stable URNs, factKeys, classifications) | Phase 17/20 (D-17) | Allows internal Neo4j ID churn while ensuring true graph projection consistency. |
| Silent fallback on any server error | Explicit error taxonomy (fallback only on transport failures) | Phase 19/19.1 (D-20) | Prevents concealing authentication and configuration bugs. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Exactly 40 cases (20 existing + 20 new) is sufficient to achieve complete coverage across all 5 risk categories without test runtime degradation. | Benchmark Case Mix | Low — test suite runs in < 2 seconds; additional synthetic edge cases can be added easily if gaps appear. |
| A2 | Canonical JSON and Markdown reports stored under `.benchmark-reports/` should be gitignored locally and uploaded as CI artifacts. | Harness and Reports | Low — standard CI artifact pattern prevents dirtying working tree during local runs. |

## Open Questions (RESOLVED)

1. **How should `npm run benchmark` interact with Vitest?** — RESOLVED: Use shared `tests/ai/evaluatorCore.ts` engine called by both Vitest runner (`tests/ai/groundedAssistantEval.test.ts`) and standalone CLI script (`scripts/run-benchmark.ts`).
   - What we know: Maintainers need a fast CLI entry point (`npm run benchmark`) that returns exit code 0 on pass or 1 on fail and produces JSON/Markdown reports, while developers also want `npx vitest run tests/ai/groundedAssistantEval.test.ts` for step-through debugging.
   - What's clear: Building a shared `evaluatorCore.ts` library allows the CLI runner script (`scripts/run-benchmark.ts`) and the Vitest test file to share 100% of the evaluation logic without duplicate assertion engines.
   - Recommendation: Implement `tests/ai/evaluatorCore.ts` as the single authoritative evaluator, called by both `tests/ai/groundedAssistantEval.test.ts` and `scripts/run-benchmark.ts`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build & Test Runtime | ✓ | v24.16.0 | — |
| npm | Package Management | ✓ | 11.13.0 | — |
| Docker | Local Knowledge Daemon & Neo4j | ✓ | 24.0.2 | InMemoryGraphRepository for unit tests |
| Knowledge Server | Live Integration Smoke | ✓ | Alive (port 3001) | In-memory mocks (deterministic gate) |
| Neo4j | Knowledge Graph Persistence | ✓ | Ready (port 7687) | In-memory repository (unit tests) |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 |
| Config file | `vite.config.ts` (root) and `knowledge-server/vite.config.ts` |
| Quick run command | `npx vitest run tests/ai/groundedAssistantEval.test.ts` |
| Full suite command | `npm run benchmark` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QUAL-01 | Run 40-case benchmark harness covering all risk domains | unit / replay | `npx vitest run tests/ai/groundedAssistantEval.test.ts` | ✅ (extend from 20 to 40) |
| QUAL-02 | Assert semantic expectations, paths, facts, and invariants | unit / contract | `npx vitest run tests/ai/groundedAssistantEval.test.ts` | ✅ |
| QUAL-03 | Apply release gates (>=90% agg, >=80% cat, >=90% 3-hop, 100% path) & reports | integration / CLI | `npm run benchmark` | ❌ (Wave 1/2) |
| QUAL-04 | Semantic rebuild equivalence and offline transport error matrix | integration | `npx vitest run knowledge-server/tests/graphRebuildEquivalence.test.ts tests/knowledge/offlineIsolation.test.ts` | ❌ (graphRebuildEquivalence.test.ts in Wave 2) |
| QUAL-05 | Credential isolation check on API / reports & Phase 16 DLP preservation | security / regr | `npx vitest run tests/security/credentialIsolation.test.ts` | ❌ (Wave 3) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/ai/groundedAssistantEval.test.ts` (< 1.5s)
- **Per wave merge:** `npm run benchmark && npx vitest run tests/knowledge/offlineIsolation.test.ts`
- **Phase gate:** Full suite green and `npm run benchmark` reports `PASSED` before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/ai/evaluatorCore.ts` — shared case evaluation core
- [ ] `tests/ai/releaseGate.ts` — release threshold scoring logic
- [ ] `tests/ai/reportGenerator.ts` — canonical JSON and Markdown report writer
- [ ] `scripts/run-benchmark.ts` — CLI runner script for `npm run benchmark`
- [ ] `knowledge-server/tests/graphRebuildEquivalence.test.ts` — semantic graph rebuild equivalence test
- [ ] `tests/security/credentialIsolation.test.ts` — protocol boundary credential isolation test

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Knowledge Server Bearer token authorization header check; rejected on 401. |
| V3 Session Management | yes | Session-only client credentials, zero persistent storage of tokens in localStorage. |
| V4 Access Control | yes | Pinned snapshot scoping on every graph traversal, preventing cross-snapshot hop chaining. |
| V5 Input Validation | yes | Strict Zod validation on all fixture cases, retrieval responses, and report schemas. |
| V6 Cryptography | yes | Web Crypto native AES-GCM/PBKDF2 for backups; native SHA-256 for binding hashes and factKeys. |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Indirect prompt injection via Markdown tables | Tampering / Elevation of Privilege | Escaped delimiters, schema-locked JSON structured synthesis, strict evidence pack closure validation. |
| Credential leakage in benchmark reports or logs | Information Disclosure | Metadata-only reporting; regex redaction for bearer tokens, passwords, and API keys; protocol isolation regression test. |
| Cross-snapshot graph path tampering | Tampering / Integrity | Strict validation that all nodes and edges in a path share the identical pinned `snapshotId`. |
| Hallucinated / unsupported factual claims | Repudiation / Integrity | Closure validator (`validateGroundedAnswerClosure`) checks all claims against citations in evidence pack; forbidden claims trigger immediate release gate failure. |
| Offline fallback network data exfiltration | Information Disclosure | Network spy ensures 0 outbound `fetch` calls during local BM25 fallback execution. |

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `tests/ai/groundedAssistantEval.test.ts`, `tests/fixtures/ai/grounded-reference-fixture-schema.ts`, `tests/fixtures/ai/grounded-assistant-reference.json` — existing 20-case deterministic replay test harness and schema.
- Codebase inspection: `src/services/ai/evidencePack.ts`, `src/services/ai/groundedTurn.ts` — evidence packing, closure validation, and grounded turn state machine.
- Codebase inspection: `knowledge-server/tests/graphRebuild.test.ts`, `knowledge-server/src/indexing/snapshotStore.ts` — snapshot persistence, candidate build, and atomic pointer swap.
- Codebase inspection: `tests/knowledge/offlineIsolation.test.ts` — offline zero-egress assertions and error handling.
- Codebase inspection: `.planning/phases/20-benchmark-evaluation-suite-integrity-hardening-credential-is/20-CONTEXT.md` — locked user decisions D-01 through D-24.

### Secondary (MEDIUM confidence)
- `gsd-tools query classify-confidence` — provider confidence scoring.
- `gsd-tools query package-legitimacy check` — package legitimacy audit for `zod` and `vitest`.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — uses existing verified workspace dependencies (`vitest`, `zod`, `tsx`, native stdlib).
- Architecture: HIGH — directly extends Phase 19 replay harness and Phase 19.1/19.2 acceptance patterns per CONTEXT.md decisions.
- Pitfalls: HIGH — addresses known failure modes (retries masking bugs, brittle prose checks, cross-snapshot paths).

**Research date:** 2026-10-17
**Valid until:** 2026-11-17 (stable internal test harness architecture)
