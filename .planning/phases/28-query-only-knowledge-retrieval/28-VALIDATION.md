---
phase: "28"
slug: "query-only-knowledge-retrieval"
status: completed
execution_walkthrough: not_performed_stack_unavailable
closure_basis: user_accepted_automated_contract_2026-11-17
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-05"
updated: "2026-11-17"
replanned: "2026-11-17"
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Re-scoped 2026-11-17 to 5 plans over the live surfaces only. This document describes the planned verification contract and its sign-off; the checks themselves run at execution time per plan `<verify>` blocks.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 (root, jsdom) and Vitest 5.0.2 (`knowledge-server`, node) |
| **Config file** | `vite.config.ts` (root), `knowledge-server/vitest.config.ts` (server) |
| **Quick run command (root)** | `npx vitest run tests/knowledge/retrievalProtocolParity.test.ts tests/ai/knowledgeRetrievalTool.test.ts tests/ai/groundedTurn.test.ts tests/ai/evidencePack.test.ts` |
| **Server quick command** | `npm --prefix knowledge-server test -- tests/retrievalProtocol.test.ts tests/federatedRetrieval.test.ts tests/retrievalRoutes.test.ts` |
| **Full suite command** | **Deliberately not run** — the project's full Vitest suite takes about an hour. Per-wave verification is the union of focused commands for the files that wave touched. |
| **Estimated runtime** | Root focused set ~30 s; server focused set ~20 s |

---

## Sampling Rate

- **After every task commit:** Run the single narrowest focused test file for the seam touched.
- **After every plan wave:** Run the union of focused commands for files touched in that wave (never the full suite).
- **Before `/gsd-verify-work`:** All focused commands listed in the Per-Task Verification Map must be green.
- **Max feedback latency:** 60 seconds per task.

---

## Replan Change Log (2026-11-17)

- Re-scoped from 4 to 5 plans: 28-01 server foundation, 28-02 client wire + catalog removal, 28-03 trust guarantees + source inspection, 28-04 canonical notice on live surfaces, 28-05 end-to-end contract + observed walkthrough.
- Removed every deleted Phase 35-06 SDLC/wizard file from plan file sets, `<read_first>` blocks and verify commands. No SDLC code is resurrected.
- Fixed checker C2: the all-unknown explicit `setIds` case is explicitly wired in 28-01 (resolver DEGRADED + UNAVAILABLE ledger → route DEGRADED response) and re-proven at the HTTP boundary in 28-05.
- Fixed checker W1: 28-04 now declares real dependencies on 28-02 and 28-03, shares their files, and runs in wave 4.
- Fixed checker W2: the former 18-file 28-02 is now 10 files after removing deleted SDLC/wizard work; every plan is at or below 15 files.
- Fixed checker INFO: 28-01 `estimate.tasks` is 3; ROADMAP plan list matches the 5-plan, 5-wave structure.
- Added absolute non-regression clauses and focused regression tests for existing `groundedTurn` / `knowledgeRetrievalTool` / `aiOrchestratorLoop` / Telegram flows in every affected plan.

---

## Per-Task Verification Map

Every `<automated>` command in the plans is paired with an observable `<fails_when>` failure signal. This table records the union per task.

| Task ID | Plan / Wave | Requirement (historical ID) | Secure Behavior | Automated Command | File Exists | Status |
|---------|-------------|------------------------------|-----------------|-------------------|-------------|--------|
| 28-01-01 | 01 / 1 | SDLC-RET-01 (setup) | Existing pinned deps installed; manifests unchanged | `test -d knowledge-server/node_modules/vitest && test -d knowledge-server/node_modules/@fastify/cors && echo INSTALLED` | ✅ manifests tracked | ⬜ gated (blocking human) |
| 28-01-02 | 01 / 1 | SDLC-RET-02 | Thin wire → one published set → attributed snapshot-lexical evidence | `npm --prefix knowledge-server test -- tests/snapshotLexicalRetrieval.test.ts tests/perSetRetrievalRouter.test.ts tests/retrievalRoutes.test.ts` | ❌ W0 new tests | ⬜ pending |
| 28-01-03 | 01 / 1 | SDLC-RET-01/05 | Authoritative discovery; all-unknown `setIds` → DEGRADED + full UNAVAILABLE ledger | `npm --prefix knowledge-server test -- tests/publishedSetDiscovery.test.ts tests/retrievalProtocol.test.ts tests/retrievalRoutes.test.ts` | ❌ W0 new tests | ⬜ pending |
| 28-02-01 | 02 / 2 | SDLC-RET-01/05 | Client wire parity mirrors server; existing schemas still pass | `npx vitest run tests/knowledge/retrievalProtocolParity.test.ts` | ✅ partial | ⬜ pending |
| 28-02-02 | 02 / 2 | SDLC-RET-01 | No catalog gate; local/MCP/clarify flows proven unchanged | `npx vitest run tests/ai/groundedTurn.test.ts tests/ai/AIChatDrawerGroundedWiring.test.tsx tests/telegram/telegramHeadlessWorker.test.ts` | ✅ partial | ⬜ pending |
| 28-02-03 | 02 / 2 | SDLC-RET-01/05 | Tool sends thin wire body + attribution; abort/error/clamp unchanged | `npx vitest run tests/ai/knowledgeRetrievalTool.test.ts` | ✅ partial | ⬜ pending |
| 28-03-01 | 03 / 3 | SDLC-RET-02/03 | Real deadline/cap, coverage ledger, truthful no-success, hop closure, all-unknown stays green | `npm --prefix knowledge-server test -- tests/federatedRetrieval.test.ts tests/publishedSetDiscovery.test.ts tests/retrievalProtocol.test.ts tests/retrievalRoutes.test.ts` | ✅ partial | ⬜ pending |
| 28-03-02 | 03 / 3 | SDLC-RET-03 | Snapshot-aware packing; local/MCP packs unchanged | `npx vitest run tests/ai/evidencePack.test.ts` | ✅ partial | ⬜ pending |
| 28-03-03 | 03 / 3 | SDLC-RET-03 | Attribution persists; local-absent inspection; local-note rendering unchanged | `npx vitest run tests/ai/SourcesPanel.test.tsx tests/ai/CitationChipAndQuickPreview.test.tsx` | ✅ partial | ⬜ pending |
| 28-04-01 | 04 / 4 | SDLC-RET-04 | One pure canonical-outcome module | `npx vitest run tests/ai/knowledgeOutcome.test.ts` | ❌ W0 new test | ⬜ pending |
| 28-04-02 | 04 / 4 | SDLC-RET-04/03 | `server_empty` with ordered local fallback; other outcomes unchanged | `npx vitest run tests/ai/groundedTurn.test.ts` | ✅ partial | ⬜ pending |
| 28-04-03 | 04 / 4 | SDLC-RET-04 | Identical notice on AI Chat + Telegram, grounded + tool-driven; orchestrator untouched | `npx vitest run tests/ai/AIChatDrawerGroundedWiring.test.tsx tests/telegram/telegramHeadlessWorker.test.ts` | ✅ partial | ⬜ pending |
| 28-05-01 | 05 / 5 | SDLC-RET-01..05 | Server HTTP-boundary end-to-end contract incl. all-unknown and empty set | `npm --prefix knowledge-server test -- tests/queryOnlyEndToEnd.test.ts` | ❌ W0 new test | ⬜ pending |
| 28-05-02 | 05 / 5 | SDLC-RET-01..05 | Client surface end-to-end contract incl. cross-surface notice and deleted-path guard | `npx vitest run tests/ai/queryOnlyEndToEnd.test.ts` | ❌ W0 new test | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Status is execution-time state; the planning sign-off below certifies the contract, not that the tests have already run.*

---

## Wave 0 Requirements

- [x] `knowledge-server/tests/snapshotLexicalRetrieval.test.ts` — Vietnamese normalization, heading/line/offset provenance, empty corpus, deterministic ranking (28-01 Task 2).
- [x] `knowledge-server/tests/perSetRetrievalRouter.test.ts` — readiness split, lexical fallback, no fabricated snapshot (28-01 Task 2).
- [x] `knowledge-server/tests/publishedSetDiscovery.test.ts` — enumeration order, empty store, explicit unknown/unpublished, `publishedSnapshotIdBySet` producer, all-unknown DEGRADED (28-01 Task 3, 28-03 Task 1).
- [x] Extend `knowledge-server/tests/federatedRetrieval.test.ts` — coverage ledger, deadline with queued work, first-item char cap, all-failed truthfulness, orphan path rejection (28-03 Task 1).
- [x] Extend `knowledge-server/tests/retrievalRoutes.test.ts` — `{query, limit}` accepted, all-unknown `setIds` → DEGRADED + full UNAVAILABLE ledger, mixed known/unknown, auth/origin preserved (28-01 Tasks 2/3, 28-03 Task 1).
- [x] Extend `knowledge-server/tests/retrievalProtocol.test.ts` — thin wire request, new outcome, coverage schema, hop closure, internal snapshot map (28-01, 28-03).
- [x] Extend `tests/knowledge/retrievalProtocolParity.test.ts` — new outcome, attribution, request shape (28-02 Task 1).
- [x] Extend `tests/ai/groundedTurn.test.ts` — empty catalog → server, local/MCP/clarify regression, `server_empty` with ordered fallback (28-02 Task 2, 28-04 Task 2).
- [x] Extend `tests/ai/evidencePack.test.ts` — cross-snapshot citations, conflict attribution, coverage, local/MCP regression (28-03 Task 2).
- [x] Extend `tests/ai/knowledgeRetrievalTool.test.ts` — no catalog call, query-only payload, attribution, abort/error/clamp regression (28-02 Task 3).
- [x] Extend `tests/ai/SourcesPanel.test.tsx` / `tests/ai/CitationChipAndQuickPreview.test.tsx` — set/snapshot details, local-absent excerpt, local-note regression (28-03 Task 3).
- [x] `tests/ai/knowledgeOutcome.test.ts` — exact canonical notice and tool-result detector (28-04 Task 1).
- [x] Extend `tests/telegram/telegramHeadlessWorker.test.ts` — grounded empty notice, tool-driven notice, existing copy regression (28-04 Task 3).
- [x] `knowledge-server/tests/queryOnlyEndToEnd.test.ts` and `tests/ai/queryOnlyEndToEnd.test.ts` — boundary-level zero-local-docs contract (28-05).
- [x] Environment: `npm --prefix knowledge-server install` (existing pinned deps) is declared as a blocking human checkpoint in 28-01 Task 1; it is not a Wave-0 code dependency for planning.
- [x] Framework install: none — existing infrastructure covers the phase; no new package.

---

## Non-Regression Contract (absolute)

Preserve current AI-engine flows. The only permitted behavior changes are the no-local-docs query-only path and truthful empty/unavailable outcomes.

| Preserved flow | Guard | Plan |
|----------------|-------|------|
| `groundedTurn` routing flags, MCP merge, genuine `clarify_intent`, local BM25 fallback + local-only label | Dedicated regression cases assert unchanged kind/label/copy; routing flags untouched | 28-02 Task 2, 28-04 Task 2 |
| `knowledgeRetrievalTool` abort rethrow, error envelope, 10..50 limit clamp, existing output keys | Pre-existing cases kept passing; new fields are additive | 28-02 Task 3 |
| `aiOrchestratorLoop` | Byte-identical (`git diff` empty); existing `onToolResult` seam reused, not changed | 28-04 Task 3 |
| Telegram non-answer copy for all kinds except the new `server_empty` | Existing cases kept passing; only new branch adds copy | 28-04 Task 3 |
| Local/MCP evidence packs and local-note source rendering | Pre-existing cases kept passing; new schema fields default to empty | 28-03 Tasks 2/3 |
| Additional AI tool files (`aiTools.ts`, `groundedTurnDeps.ts`, `semanticScopeRouter.ts`) | Byte-identical (`git diff` empty); read-only verification | 28-02 |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live graph/vector/lexical readiness reporting against a real Neo4j | SDLC-RET-02, SDLC-RET-03 | No Docker/Neo4j/knowledge-server running in this environment; readiness seams are mocked | With the local stack up (`docker compose up -d`), publish one set and query with graph building, ONLINE and failed states; confirm attribution matches each state. |
| Real fresh-device retrieval over the network | SDLC-RET-01, SDLC-RET-02 | Requires a published set on a second device/profile | Publish a set from a device with documents; from a profile with an empty catalog ask a grounded question in AI Chat and via Telegram; confirm evidence plus set/snapshot attribution. |
| Canonical empty notice observed on live surfaces | SDLC-RET-04 | Observed walkthrough, never an autonomous verify | With no published sets, ask a grounded question in AI Chat and via Telegram; confirm the identical notice, then publish a set and confirm it disappears. |

These are the only remaining gates when the live stack is unavailable; mock-based end-to-end tests cover the same contracts at the boundary.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — every `<automated>` is paired with an observable `<fails_when>`.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all MISSING references; every new test file is assigned to a task.
- [x] No watch-mode flags.
- [x] Feedback latency < 60s (focused commands only; full suite deliberately excluded).
- [x] `nyquist_compliant: true` set in frontmatter.
- [x] Every plan is at or below 15 files; every plan passes `frontmatter.validate` and `verify.plan-structure` with zero errors and zero warnings.
- [x] Checker C1/C2/W1/W2/W3 and the INFO item are addressed in the replan change log above.
- [x] Absolute non-regression contract is present with focused regression tests per affected flow.
- [x] No deleted SDLC/wizard path is referenced by any phase-28 artifact; SDLC-RET IDs are documented as historical tooling IDs mapped to live user outcomes.
- [x] Supreme goal is preserved end to end: zero-local-docs query-only retrieve works via published sets on live AI surfaces (28-05).

**Approval:** planning sign-off complete 2026-11-17. Execution-time outcome: live-stack walkthrough was NOT performed (stack unavailable); user accepted the mock-based automated contract as the closing basis for plan 28-05 on 2026-11-17 (see "Human decision" below). No claim of an observed live walkthrough is made.

---

## Execution-Time Walkthrough Record (28-05, 2026-11-17)

**Status: LIVE WALKTHROUGH NOT PERFORMED — user accepted the mock-based automated contract as the closing basis for plan 28-05.**

This section records the execution-time outcome of the 28-05 checkpoint. The live
Docker/Neo4j/Knowledge Server walkthrough was **NOT performed** — the stack was
unavailable in this environment — and is **not claimed to have passed**. The
human decision below closes plan 28-05 on the automated evidence only; the manual
walkthrough remains documented as not done, not as observed or waived-by-success.

### Automated end-to-end contract (executed, green)

Both focused end-to-end commands ran in the isolated worktree and passed:

| Command | Result |
|---------|--------|
| `npm --prefix knowledge-server test -- tests/queryOnlyEndToEnd.test.ts` | 1 file, 5 tests passed |
| `npx vitest run tests/ai/queryOnlyEndToEnd.test.ts` | 1 file, 5 tests passed |
| Client non-regression: retrievalProtocolParity, knowledgeRetrievalTool, evidencePack, SourcesPanel, CitationChipAndQuickPreview | 5 files, 96 tests passed |
| Server non-regression: publishedSetDiscovery, snapshotLexicalRetrieval, federatedRetrieval, retrievalProtocol, retrievalRoutes | 5 files, 90 tests passed |
| `npx tsc --noEmit` | exit 0 |
| Deleted-ref gate (`NO_DELETED_REFS` over all five `28-*-PLAN.md`) | passed |

The automated contract proves at the observable boundary: zero-local-docs
`{query, limit}` over two published sets returns set/snapshot-attributed evidence
with one coverage row per set; explicit `setIds:[known]` searches only that set;
all-unknown `setIds` returns HTTP 200 DEGRADED with a full UNAVAILABLE ledger; zero
published sets returns HTTP 200 NO_PUBLISHED_SETS; an orphan hop path never reaches
a validated 200. On the client surface: grounded and tool paths emit a thin wire
body and return attributed evidence with no catalog lookup; NO_PUBLISHED_SETS
renders one byte-identical canonical notice across AI Chat (grounded + tool-driven)
and Telegram (grounded + tool-driven); NO_EVIDENCE and unreachable stay distinct
with no canonical notice. `git diff` over the plan base confirms only the two new
test files changed — no production file was modified.

### Live stack availability check (executed)

- `docker ps` → Docker WSL integration is not active in this distro ("command 'docker' could not be found in this WSL 2 distro").
- `http://127.0.0.1:3001/health` → connection refused (curl 000).
- `http://127.0.0.1:7474` (Neo4j browser) → connection refused (curl 000).

No knowledge daemon, Neo4j or published document set is running, so checkpoint
items (1)-(4) could not be observed by this executor: attributed evidence on a
live grounded question in AI Chat and a live `retrieve_knowledge` query via
Telegram; the exact canonical notice on all live surfaces with no published sets;
the DEGRADED/unavailable message for unknown `setIds`; and local Docs/autosave/
offline non-regression.

### Human decision — close 28-05 on automated evidence (2026-11-17)

The user made the explicit decision to **accept the mock-based automated contract
evidence as the closing basis for plan 28-05**. This decision was conveyed to the
executor by the coordinator. It is a human acceptance of the evidence actually
produced — not a claim that the live walkthrough occurred.

Truthfulness record:
- The live Docker/Neo4j/Knowledge Server walkthrough was **NOT performed**. The
  stack was unavailable (Docker WSL integration inactive; :3001 and :7474 refused),
  so checkpoint items (1)-(4) were never observed.
- It is **not claimed that the walkthrough passed**; there is no observed result
  to report for it.
- Plan 28-05 is closed on the strength of the automated end-to-end contract alone
  (10 focused cases across the two new files, plus non-regression and tsc), which
  the user accepted.

### If a live walkthrough is wanted later (not a plan-28-05 gate)

This is retained as reference only; it is not an open blocker for 28-05. With the
local stack up (`docker compose up -d`, Knowledge Server at `127.0.0.1:3001`, per
CLAUDE.md), a human could still:

1. Use a profile with no local document sets; publish one document set from a
   device that has documents.
2. Ask a grounded question in AI Chat and send a `retrieve_knowledge` query via
   Telegram; confirm attributed evidence with setId/snapshotId details appears.
3. With no published sets, confirm the exact canonical notice appears identically
   on both surfaces; with an explicit unknown `setIds` list, confirm the
   DEGRADED/unavailable message (not an empty answer).
4. Confirm local Docs/autosave/offline behavior is unaffected.
