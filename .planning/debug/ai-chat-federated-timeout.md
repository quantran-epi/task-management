---
status: awaiting_human_verify
trigger: "Fix AI Chat federated retrieval timeout: UI uses elapsedMs 2500 while live T2 needs ~12.6s, causing DEGRADED with zero evidence despite per-set retrieval passing. Apply bounded 20s deadline, correct timeout diagnostics/zero-evidence behavior, and add targeted regression coverage. Preserve existing user changes and run only targeted tests."
created: 2026-10-16
updated: 2026-10-16
---

## Symptoms

### Expected

TaskMate AI Chat query `Chu kỳ tính lãi/phí container 60000006` should retrieve live K8s evidence and answer from citations, matching Phase 19.2 T2 acceptance behavior.

### Actual

UI returns `DEGRADED`, zero evidence, unknown confidence, and says fulltext/vector/graph are unavailable even though direct per-set retrieval succeeds with 10 items and all modalities `ok`.

### Errors

Federated response contains `coverageWarnings: [{ code: "TIMEOUT", setId: "ae60b412-56ff-476b-9321-ed919600a94a", message: "Set ae60b412-56ff-476b-9321-ed919600a94a failed with TIMEOUT" }]`, no items, and misleading modality statuses.

### Timeline

Observed 2026-10-16 after Phase 19.2 T1-T7 acceptance passed on 2026-10-15.

### Reproduction

Enable knowledge server `http://10.4.97.70:30080` in TaskMate and ask `Chu kỳ tính lãi/phí container 60000006`. Direct `POST /api/v1/sets/:setId/retrieve` completes in about 12.6 seconds; UI-style `POST /api/v1/retrieve` uses `elapsedMs: 2500` and times out.

## Current Focus

hypothesis: Confirmed. UI deadline was 2500 ms, and server further divided global remaining time by all three tier slots; even a REQUIRED-only request received one-third of requested budget. All-timeout aggregation also reported modalities as `ok`.
test: UI now sends 20000 ms; REQUIRED retrieval can use full remaining global deadline; all-timeout response marks modalities `timeout`; client routes zero-evidence timeout to local fallback.
expecting: Deployed build returns READY within bounded 20-second UI deadline for T2; genuine timeout produces accurate timeout diagnostics and local fallback.
next_action: deploy changed knowledge-server and verify live TaskMate query
reasoning_checkpoint: Current live K8s still runs old scheduler. Live 20-second request timed out after about 6.8 seconds, proving one-third budget division. Equivalent 60-second request gave old server 20 seconds and returned READY with 20 items in 14.2 seconds.
tdd_checkpoint: passed

## Evidence

- timestamp: 2026-10-16
  observation: Direct T2 smoke against `POST /api/v1/sets/ae60b412-56ff-476b-9321-ed919600a94a/retrieve` passed with READY, 10 items, all modalities ok, latency 12619 ms.
- timestamp: 2026-10-16
  observation: UI-equivalent federated request with `elapsedMs: 2500` returned DEGRADED, zero items, set TIMEOUT warning, but all aggregate modality statuses remained ok with zero counts.
- timestamp: 2026-10-16
  observation: Browser DevTools shows no CORS failure; CORS hypothesis rejected.
- timestamp: 2026-10-16
  observation: Live federated request with elapsedMs 20000 returned DEGRADED after 6838 ms, matching server division of remaining budget by three tier slots.
- timestamp: 2026-10-16
  observation: Live request with elapsedMs 60000 gave old scheduler an effective 20000 ms REQUIRED-tier allowance and returned READY in 14192 ms with 20 items, 15 paths, all modalities ok, and no warnings.
- timestamp: 2026-10-16
  observation: Targeted client tests passed 27/27 and knowledge-server federated tests passed 10/10, including full remaining-deadline and all-timeout diagnostic regressions.

## Eliminated

- hypothesis: Knowledge server is disabled or unreachable.
  evidence: Live direct T2 request succeeds against configured K8s endpoint.
- hypothesis: Browser request fails due to CORS.
  evidence: User confirmed DevTools has no CORS error; allowed-origin request reaches server and returns semantic response.
- hypothesis: Published graph lacks T2 evidence.
  evidence: Direct per-set retrieval returns 10 matching items from active snapshot `348c928f-d6e8-4965-a706-73dae9e8e07d`.

## Resolution

root_cause: UI requested only 2500 ms, while knowledge-server divided remaining global deadline by `(tierOrder.length - tierIdx)`. REQUIRED-only work therefore received one-third of declared budget. Timed-out sets had no response to aggregate, leaving modality status falsely `ok`, then client synthesized zero evidence as absent knowledge.
fix: Raised bounded UI federated deadline to 20000 ms; let each concurrently executed tier use full remaining global deadline; mark all modalities timeout when every processed set times out; route zero-evidence TIMEOUT response through local fallback rather than absent-knowledge synthesis.
verification: Targeted tests pass: `tests/ai/groundedTurn.test.ts` 27/27 and `knowledge-server/tests/federatedRetrieval.test.ts` 10/10. Live old-server control with elapsedMs 60000 returned READY in 14192 ms with 20 items and 15 paths, proving corrected scheduler will fit same work inside new 20000 ms UI deadline after deployment.
files_changed:
  - src/services/ai/groundedTurn.ts
  - knowledge-server/src/services/federatedRetrievalService.ts
  - tests/ai/groundedTurn.test.ts
  - knowledge-server/tests/federatedRetrieval.test.ts
