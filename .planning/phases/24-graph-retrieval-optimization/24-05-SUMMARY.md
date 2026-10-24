---
phase: 24-graph-retrieval-optimization
plan: 05
subsystem: client/grounded-turn
tags: [seed-only, evidence-packing, grounded-turn, telegram, mcp-boundary, sc-6]
requires:
  - 24-02
  - 24-04
provides:
  - "Entity-aware EvidencePack with entities and graphCounts"
  - "Explicit SEED_ONLY branch before refine/NO_EVIDENCE/graph-fallback"
  - "Persisted entities, graphCounts, stageDiagnostics, failedSeeds"
  - "Existence-only seed synthesis instruction"
  - "Safe Telegram seed-only rendering; MCP boundary assertion"
affects:
  - src/services/ai/evidencePack.ts
  - src/services/ai/groundedTurn.ts
  - src/services/ai/groundedSynthesis.ts
  - src/services/telegram/telegramHeadlessWorker.ts
tech-stack:
  added: []
  patterns:
    - "Entity items stay entities; never coerced into citations"
    - "Outcome branch ordered before fallback heuristics"
    - "Existence-only synthesis constraint injected per turn"
key-files:
  created: []
  modified:
    - src/services/ai/evidencePack.ts
    - src/services/ai/groundedTurn.ts
    - src/services/ai/groundedSynthesis.ts
    - src/services/telegram/telegramHeadlessWorker.ts
    - tests/ai/evidencePack.test.ts
    - tests/ai/groundedTurn.test.ts
    - tests/telegram/telegramHeadlessWorker.test.ts
decisions:
  - "PackedEntity identity comes from server-validated URN/kind/snapshotId/setId, never display labels"
  - "Entity dedupe key is setId:urn so cross-set duplicates stay distinguishable"
  - "Graph counts read only from modalityStatus.graph; absent fields default to zero, never inferred from item count"
  - "SEED_ONLY short-circuits before refine, NO_EVIDENCE, and isGraphNonProductive"
  - "isGraphNonProductive treats entityCount > 0 or entity items as productive"
  - "Synthesis abstention guard extended to zero citations, zero paths, and zero seed entities"
  - "Telegram prints entity identity, counts, and URN+reasonCode only; no stage text or excerpts"
metrics:
  duration: 18m
  completed: 2026-10-24
---

# Phase 24 Plan 05: Seed-Only Flow Through Packing, Grounding, and Non-Web Consumers Summary

A resolved seed now survives from the federated response to persisted grounding and Telegram output: entity items are packed as entities (never citations), `SEED_ONLY` is routed before every fallback heuristic, and synthesis is constrained to existence claims so no relationship is invented.

## Objective

Protocol parity (24-04) alone did not change client behavior. `groundedTurn` treated graph-empty responses as nonproductive, packed chunks rather than entities, and could route a valid found seed into BM25 or no-evidence paths; Telegram rendered `evidence_only` as no-evidence copy (D-01, D-02, D-03, D-13, D-19, Open Question 6).

## What Was Built

### `src/services/ai/evidencePack.ts`

- `PackedEntity` (`urn`, `canonicalName`, `kind`, `snapshotId`, `setId`, optional `evidenceClass`) and `GraphCounts` (`entity`, `edge`, `path`).
- `EvidencePack.entities` and `EvidencePack.graphCounts` added as optional so existing literal fixtures keep compiling; `packEvidence` always populates both.
- Federated branch collects `type === 'entity'` items, maps listed fields only, dedupes on `setId:urn`, caps at 50, and never creates a citation or prompt-evidence row from an entity.
- Graph counts copied from `response.modalityStatus.graph.entityCount|edgeCount|pathCount`, each defaulting to `0` when absent — never derived from `itemCount`.
- Chunk packing, edge/conflict handling, and path closure untouched.

### `src/services/ai/groundedTurn.ts`

- `SEED_ONLY` branch placed after `NEEDS_CLARIFICATION` and before empty-item/refine and `isGraphNonProductive` fallback checks.
- Packs evidence once, then builds grounding with `paths: []`, `conflicts: []`, `entities`, `graphCounts`, `stageDiagnostics`, `failedSeeds`, plus unchanged scope/router/model/modality provenance.
- Model configured: synthesizes with an explicit existence-only instruction. No model: returns `evidence_only` with `outcome: 'SEED_ONLY'`.
- Both paths never call `runLocalBm25`, never return `refine`, never issue a second retrieval, and never emit NO_EVIDENCE copy.
- `isGraphNonProductive` now requires zero entity count and no entity items before treating graph as failed, while keeping the existing network/provider/index/timeout allowlist.
- Synthesis failures under seed-only map to `INVALID_GROUNDED_OUTPUT` (preserving Phase 24 metadata) or `evidence_only` on `MODEL_UNAVAILABLE`.

### `src/services/ai/groundedSynthesis.ts` (deviation, Rule 3)

- `SynthesisInput.instructions` appends a turn-specific constraint that overrides conflicting base rules.
- `seedEntities` included in the user payload so the model receives entity labels.
- Abstention guard now requires zero citations, zero paths, **and** zero seed entities; otherwise a seed-only pack would return the no-evidence answer.

### `src/services/telegram/telegramHeadlessWorker.ts`

- `formatGroundedAnswerForTelegram` branches on `outcome === 'SEED_ONLY'` before `!ans`: `Đã tìm thấy thực thể` plus up to 5 canonical names/URNs, `Thực thể: {entity} · Cạnh: {edge} · Đường dẫn: {path}`, and failed seeds as URN + reason code pairs only.
- `evidence_only` dispatch sends the formatter result for seed-only grounding; all local/no-evidence outcomes keep the existing fallback copy.
- Auth, scope, routing, logging, and token handling unchanged.

### Tests

- `tests/ai/evidencePack.test.ts`: 7 seed-only cases (identity fields, per-set dedupe, count copy, zero defaults, no citations from entities, unchanged chunk packing, unchanged path closure).
- `tests/ai/groundedTurn.test.ts`: 8 cases (grounded answer, evidence-only, zero BM25 / single retrieval, persisted metadata, existence-only instruction, productivity rule, no NO_EVIDENCE or query broadening, closure rejection of unsupported relation claims).
- `tests/telegram/telegramHeadlessWorker.test.ts`: 5 cases (found-entity message, failed-seed code-only text, evidence-only dispatch, unchanged READY formatting, MCP source boundary).

## Verification

```
npx vitest run tests/ai/evidencePack.test.ts tests/ai/groundedTurn.test.ts \
  tests/telegram/telegramHeadlessWorker.test.ts
→ 3 files, 116 tests passed

npx vitest run tests/ai/groundedSynthesis.test.ts   → 39 passed
npx tsc --noEmit                                    → exit 0
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Synthesis could not receive seed entities or a turn constraint**
- **Found during:** Task 2
- **Issue:** `groundedSynthesis` abstained whenever citations and paths were empty, so a seed-only pack always produced the no-evidence answer; there was also no way to inject the existence-only rule.
- **Fix:** Added optional `SynthesisInput.instructions`, included `seedEntities` in the user payload, and extended the abstention guard to require zero seed entities as well.
- **Files modified:** `src/services/ai/groundedSynthesis.ts`, `src/services/ai/groundedTurn.ts`
- **Commit:** acabc98

**2. [Rule 3 - Blocking] `EvidencePack` literal fixtures would need every new field**
- **Found during:** Task 1
- **Issue:** `entities`/`graphCounts` were declared required, breaking nine existing literal packs across tests and `groundedTurn.synthesizeFromStoredEvidence`.
- **Fix:** Declared both fields optional on the interface; `packEvidence` still always returns them.
- **Files modified:** `src/services/ai/evidencePack.ts`
- **Commit:** 9ad7f3a

**3. [Rule 1 - Bug] Entity fixture `kind` widened to `string` in tests**
- **Found during:** Task 1
- **Issue:** `makeEntityItem` defaulted `kind` to an inferred `string`, which does not satisfy `NodeKind`.
- **Fix:** Typed the parameter as `NodeKind` and imported the type.
- **Files modified:** `tests/ai/evidencePack.test.ts`
- **Commit:** acabc98

## Deferred Issues

- `synthesizeFromStoredEvidence` does not rebuild `entities`/`graphCounts`; a seed-only history retry would lose them. Not required by this plan's success criteria; a follow-up can rehydrate them from stored grounding.
- Telegram `grounded_answer` with `outcome: 'SEED_ONLY'` (model available) is already handled because `formatGroundedAnswerForTelegram` branches on outcome before reading `answer`.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. Telegram output is limited to entity identity, counts, and URN/reasonCode pairs; persisted diagnostics reuse the strict content-free protocol schemas.

## Self-Check: PASSED

- Modified files verified on disk: `src/services/ai/evidencePack.ts`, `src/services/ai/groundedTurn.ts`, `src/services/ai/groundedSynthesis.ts`, `src/services/telegram/telegramHeadlessWorker.ts`, and their three test files.
- Commits verified: 9ad7f3a, acabc98, e8b81f5.
- Targeted suite: 116 tests passed; `groundedSynthesis` 39 passed; `tsc --noEmit` exit 0.
