# Phase 20 Plan 01 Summary: 40-Case Risk-Weighted Benchmark Suite

## Delivered Scope

1. **Requirements Codification (`.planning/REQUIREMENTS.md`)**
   - Restored and defined `QUAL-01` through `QUAL-05` requirements with explicit traceability.
   - Verified mapping across 5 milestone themes: Reference benchmark coverage, release gate automation, report generation without secret leakage, graph rebuild semantic equivalence, and offline isolation.

2. **Benchmark Schemas (`src/services/ai/benchmarkReportSchemas.ts` & `tests/fixtures/ai/grounded-reference-fixture-schema.ts`)**
   - Codified `BenchmarkCategorySchema`: `multi_hop_path`, `semantic_scope`, `conflict_abstention`, `security_integrity`, `rebuild_offline`.
   - Codified strict contracts for case inputs, mocks, expected invariants, and canonical benchmark report structure.

3. **40-Case Reference Fixture (`tests/fixtures/ai/grounded-assistant-reference.json`)**
   - Preserved original 20 cases from Phase 19 (`GR-01`..`GR-20`).
   - Expanded with 20 risk-weighted cases (`GR-21`..`GR-40`) covering 3-hop call chains, single-snapshot path fidelity, conflict abstention, prompt injection resilience, canary credential isolation, and offline timeout/network degradation.

4. **Shared Evaluator Core (`tests/ai/evaluatorCore.ts`)**
   - Extracted deterministic mock construction `createMockDepsForCase`.
   - Built zero-tolerance invariant checks for forbidden fallback egress and credential leaks.
   - Built path fidelity verification across node URNs, edge fact keys, and snapshot boundaries.

5. **Deterministic Replay Test (`tests/ai/groundedAssistantEval.test.ts`)**
   - Replays all 40 reference benchmark cases deterministically.
   - 42/42 tests pass in < 700ms with zero network egress.
