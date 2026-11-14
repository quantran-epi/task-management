# Project Roadmap

## Active Milestone

- Phase 35: Shared-primitive extraction + SDLC behavior removal (v1.4)
- Phase 36: Data model, multi-chat identity, backup/migration (v1.4) (COMPLETE — verified 2026-11-11)
- Phase 37: Runtime reliability + concurrency (v1.4)
- Phase 38: Hard token budget + accurate measurement (v1.4) (COMPLETE — verified 2026-11-14)
- Phase 39: Skill versioning + enrichment approval (v1.4)
- Phase 40: Explorer UX, CRUD correctness, observed walkthrough (v1.4)

## Previous Milestone: v1.3

- Phase 25.1.1: Unify SDLC workflow into the hub, retire the wizard (COMPLETE — verified 2026-11-01)
- Phase 25.1.2: Fix the SDLC hub user flow end to end (COMPLETE — verified 2026-11-01)
- Phase 25.2: Fix TaskMate mutation flow & standardize AI Core Engine for SDLC Studio (COMPLETE)
- Phase 25.3: SDLC Workflow Engine Hardening, Unified AI Chat Widget & Prompt Architecture (COMPLETE)
- Phase 25.4: IntelliJ ExpUI (Light Theme) Workbench Migration (COMPLETE)
- Phase 25.5: TaskMate Workbench UI/UX Comprehensive Restructure & Precision Layout (COMPLETE — verified 2026-11-04)
- Phase 26: SDLC Prompt Grounding & Tool-Use Policy (COMPLETE — verified 2026-11-05)
- Phase 27: Studio Artifact Tools & Diff Approval (COMPLETE — verified 2026-11-05)
- Phase 28: Query-Only Knowledge Retrieval (v1.3, parallel-capable)
- Phase 29: SSH Remote Repository Branch & Diff Review (v1.3)
- Phase 29.1: Remote SSH Git Explorer & Headless Claude Code Trace Flow (v1.3)
- Phase 30: Automatic Change Pack Packaging & Drift Reconciliation (v1.3)
- Phase 31: Organization Conventions in the Solution Pipeline (COMPLETE — verified 2026-11-07)
- Phase 31.1: Enterprise Systems Catalog & CR Transformation (v1.3, INSERTED)
- Phase 31.2: Enterprise Systems Catalog and CR Normalization (v1.3, INSERTED)
- Phase 32: External Research via Claude Code Headless (v1.3)
- Phase 33: Prompt Transparency & Contract Documentation (v1.3)
- Phase 34: AI Office — AI Employees, Teams, and Skills (v1.3)

---

## Milestone: v1.4 Unified AI Office (Phase Details)

**Goal:** Hợp nhất SDLC Studio và AI Office thành một workspace AI duy nhất dạng chat-first, free-style; xóa hoàn toàn SDLC Studio; đội ngũ AI leader + agent với kỹ năng chuyên biệt, token budget cứng, concurrency cấu hình được, và skill enrichment có duyệt version.

**Requirements:** AIO-REMOVE-01..05, AIO-NAV-01..05, AIO-GROUP-01..05, AIO-LEAD-01..05, AIO-RUNTIME-01..05, AIO-BUDGET-01..09, AIO-SKILL-01..06, AIO-DATA-01..05, AIO-VERIFY-01..03
**Source:** `.planning/MILESTONE-CONTEXT.md` (C-01..C-15 locked, R-01..R-21 open), `.planning/research/SUMMARY.md`
**UI hint:** yes

> **Quality gate (C-15):** Phase 34 was marked complete with zero tests covering the AI Office runtime and five live defects. No phase in this milestone closes on code reading alone. Every phase ends with an observed behavior.

### Phase 35: Shared-primitive extraction + SDLC behavior removal

**Goal:** Extract the primitives AI Office reuses, then remove every SDLC Studio behavior entry point — without breaking ordinary chat, knowledge publish, or backup.
**Requirements**: AIO-REMOVE-01, AIO-REMOVE-02, AIO-REMOVE-03, AIO-REMOVE-04, AIO-REMOVE-05
**Depends on:** —
**Success Criteria** (what must be TRUE):

1. `conventionsSegment.ts`, `components/common/DiffSyntaxHighlighter.tsx`, `patchProposal.ts`, and `PatchDiffApprovalCard.tsx` exist and are imported by the surviving consumers. (Corrected from the original criterion, which named `types/legacySdlc.ts` and `teamRunManager.ts` — both are void under C-16 and D-12; `teamRunRegistry.ts` already exists and `TeamWorkspace.tsx` has zero SDLC references.)
2. No SDLC launch point remains; `grep -rn "sdlc\|Sdlc" src` returns only the enumerated residual list (Dexie migration history, Dexie upgrade hooks, neutral identifiers), with no stubs and no `as any`.
3. Ordinary chat, knowledge publish, and backup round-trip still pass after deletion.
4. A persisted `viewType:'sdlc'` tab is dropped on launch and `activeTabId` re-points to a valid tab.
5. `restoreBackup` no longer creates SDLC tabs; `validateBackup` no longer enforces SDLC invariants.

**Status:** Complete — 2026-11-10; accepted fresh-data-only scope, verification debt recorded in 35-VERIFICATION.md.
**Plans:** 12/12 plans complete in 7 waves (plus two corrective fixes)

Plans:
**Wave 1**

- [x] 35-01-PLAN.md — Extract the generic patch core into `services/ai/patchProposal.ts` (D-02/D-03) + its test
- [x] 35-02-PLAN.md — Extract `conventionsSegment.ts` and move `DiffSyntaxHighlighter` to `components/common/`

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 35-03-PLAN.md — Move + rename `ArtifactDiffApprovalCard` → `PatchDiffApprovalCard` (D-04)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 35-04-PLAN.md — Rescope `get_artifact`/`patch_artifact_section` to `{noteId}|{skillId}`; delete `propose_subsystems`/`propose_research`

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 35-05-PLAN.md — Delete SDLC-only tests; rewrite `tests/phase25_1SafetyGates.test.ts`

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 35-06-PLAN.md — Wave 5a: delete the five SDLC directories, eight orphaned services, and the wizard chat branch
- [x] 35-07-PLAN.md — Wave 5b: delete the SDLC view + six launch points; prune `'sdlc'` from the editor; apply AIO-REMOVE-04
- [x] 35-08-PLAN.md — Wave 5c: clean the last chat-UI consumers; trim `InterruptedBanner`; recreate its test + the artifact-tool allowlist test
- [x] 35-09-PLAN.md — Wave 5d: strip SDLC fields from `models.ts`, validation schemas, and three repositories
- [x] 35-10-PLAN.md — Wave 5e: narrow the backup envelope to `type: z.enum(['chat'])`; strip restore/validate SDLC logic

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 35-11-PLAN.md — Add Dexie V18 with the SDLC row-purge migration

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 35-12-PLAN.md — Finish test rewrites; run the phase acceptance sweep (tsc, greps, scoped suites, build)

> **Wave 5 is atomic.** Plans 06-10 are mutually dependent: delete-set files read the domain fields plan 09 removes, and `backupSchemas.ts` imports the schema modules plan 06 deletes. They must land together; `npx tsc --noEmit` is clean at every wave boundary.

**Research flag:** needs `--research-phase` — audit verdicts must be re-verified against the live tree before deletion.

### Phase 36: Data model, multi-chat identity, backup/migration

**Goal:** Establish the group-chat data model, the skill-version store, and a backup path that loses nothing — before any runtime work depends on it.
**Requirements**: AIO-GROUP-02, AIO-GROUP-03, AIO-GROUP-05, AIO-DATA-01, AIO-DATA-02, AIO-DATA-03, AIO-DATA-04, AIO-DATA-05
**Depends on:** Phase 35
**Success Criteria** (what must be TRUE):

1. Dexie V19 adds `aiSkillVersions` and the additive indexes; all five coordinated table lists are updated in one change, with a TS⊆Rust assertion test. (V18 is taken by Phase 35's SDLC purge migration.)
2. `targetAgentId` survives export → restore; agent assignment history is no longer stripped.
3. Export → validate → restore round-trips a pre-v1.4 fixture and a v1.4 fixture with matching counts.
4. A backup from the previous build still imports; a backup from this build is read by the previous build without corruption.
5. Deleting a leader, agent, or skill with live references refuses or cascades in one transaction; the user's own next export validates.
6. `MAX_ACTIVE_TEAMS` and `MAX_EMPLOYEES_PER_TEAM` are gone; roster editing after creation works.

**Criterion overrides (locked in 36-CONTEXT.md):** criterion 3's pre-v1.4 fixture and criterion 4's two-way old-build compatibility are **replaced by C-16** (D-23) — verified instead as a fresh-data v12 round-trip covering IDs, counts, attribution, pending state and the leader lock. Criterion 1 reads **V19**, not V18 (D-22). AIO-DATA-05's "keep SDLC rows" is replaced by C-16 + the Phase 35 deletion (D-24). See `36-CONTEXT.md` D-22..D-25.

**Plans:** 5/5 plans complete

**Wave 1**

- [x] 36-01-PLAN.md — Tracer: `aiSkillVersions` end-to-end (Dexie V19 → all nine coordinated lists → export → validate → restore → TS/Rust SQLite parity), envelope v12

**Wave 2** *(blocked on Wave 1)*

- [x] 36-02-PLAN.md — Optional leader + durable `leaderLockedAt` (lock enforced on every repo write path), cap removal, `targetAgentId`/`leaderLockedAt` round-trip, live-vs-historical validation

**Wave 3** *(blocked on Wave 2)*

- [x] 36-03-PLAN.md — Live-use registry, guarded deletes with typed refusal + skill-version cascade, per-turn roster snapshot

**Wave 4** *(blocked on Wave 3)*

- [x] 36-04-PLAN.md — Minimal roster/leader UI, first-run lock wiring, delete-refusal alerts and corrected copy

**Wave 5** *(blocked on Wave 4)*

- [x] 36-05-PLAN.md — `aiSkillVersionRepo` contract tests + D-19 unfinished-turn inference reader (no persisted runtime status) and its workspace warning

**Research flag:** resolved — R-02 (envelope version) is settled at v12 by D-23, and R-14 (multi-chat migration) is settled by D-25 (one team = one chat, no namespace). No `--research-phase` needed.

### Phase 37: Runtime reliability + concurrency

**Goal:** A run always terminates, a double submit never corrupts state, and the number of agents running at once is a real, configurable limit.
**Requirements**: AIO-GROUP-04, AIO-RUNTIME-01, AIO-RUNTIME-02, AIO-RUNTIME-03, AIO-RUNTIME-04, AIO-RUNTIME-05, AIO-LEAD-05
**Depends on:** Phase 36
**Success Criteria** (what must be TRUE):

1. Injecting a throwing `registry.start` produces an error row and a resolved batch — never a hang.
2. Double-submit yields one user message, one turn, and phase `ready`; the rejection is visible at the composer.
3. `getActiveTurns()` is empty after every run; the status indicator clears.
4. With limit 2 and a batch of 5, at most 2 agents run at once and all 5 settle.
5. Deleting a group mid-run leaves no active turns and no further writes.
6. Per-agent stop and global abort both work; stopped work is marked incomplete.

**Research flag:** standard patterns — skip research-phase; defects are specified to `file:line`.

> **Criterion 2 is superseded by D-20.** The user locked a queue/outbox model during discuss: a second submit is *not* rejected at the composer — it is queued visibly and dispatched when the current turn settles. Verify against D-20, not against the "rejection is visible at the composer" wording above.

**Plans:** 8/8 plans executed in 7 waves

Plans:
**Wave 1**

- [x] 37-01-PLAN.md — Ledger contract: Dexie V22 tables, guarded `transitionAssignment`, `concurrencyLimit` on `AiTeam` (D-02/D-03/D-09/D-22/D-24)

**Wave 2** *(parallel: runtime primitives vs backup surface)*

- [x] 37-02-PLAN.md — `scheduler.ts` (FIFO, live limit) + `teamRunManager.ts` + coordinator `dispose()` (D-01/D-04/D-07/D-18)
- [x] 37-05-PLAN.md — Backup envelope 12→13, two ledger tables through export/restore/validate/SQLite TS+Rust, parity test (D-26)

**Wave 3**

- [x] 37-03-PLAN.md — Ledger writes in the run path; thrown `start()` terminates; `teamTurnId` finished in `finally` (AIO-RUNTIME-01/03, D-16/D-17/D-19)

**Wave 4**

- [x] 37-04-PLAN.md — Scheduler-gated `runBatch`, live limit changes, `MAX_BATCH_SIZE` deleted, stop/abort reach the queue (D-04/D-05/D-06/D-10/D-11)

**Wave 5**

- [x] 37-06-PLAN.md — Outbox replaces fire-and-forget submit; manager ownership; dispose-before-delete in the explorer (D-18/D-20/D-21)

**Wave 6**

- [x] 37-07-PLAN.md — Retry one assignment + re-synthesize the batch; lead names unfinished work (D-12/D-13/D-14)

**Wave 7**

- [x] 37-08-PLAN.md — "Chưa hoàn tất" + "Chạy lại" bubble affordance wiring; observed Tauri walkthrough closing the phase (D-13/D-27, C-15)

### Phase 37.1: Live steering — leader amends assignments and steers running agents mid-run (INSERTED)

**Goal:** The user can add a requirement mid-run, the leader re-plans against the live ledger, cancels or rewrites `queued` assignments, and pushes a steering message that a running agent actually reads at its next tool round — without restarting the batch.
**Requirements**: AIO-STEER-01, AIO-STEER-02, AIO-STEER-03, AIO-STEER-04, AIO-STEER-05, AIO-LEAD-03
**Depends on:** Phase 37
**Success Criteria** (what must be TRUE):

1. A message sent while a batch is running reaches the leader and produces a visible re-plan, not a queued second turn.
2. The leader can cancel a `queued` assignment and update the task of another via `amend_assignments`; the scheduler honours both without a second source of truth.
3. A steering message addressed to a running agent is drained at its next `beforeToolRound` and appears in its transcript attribution.
4. Steering an agent that already settled is refused visibly; the ledger stays consistent.
5. Abort/teardown while steering is in flight leaves no active turns and no further writes.

**Scope source:** deferred from `.planning/phases/37-runtime-reliability-concurrency/37-CONTEXT.md` (D-08/D-19/D-22/D-24). Schema is already in place from Phase 37.
**Research flag:** standard patterns — `beforeToolRound` seam exists at `src/services/ai/aiOrchestratorLoop.ts`; defects/contracts are at `file:line` in 37-CONTEXT.

**Plans:** 6/6 plans complete
Plans:
**Wave 1**

- [x] 37.1-01-PLAN.md — D-24 event-driven: `dispatchBatch` + `onBatchSettled`, batch abort controller, per-turn usage baseline, team turn lifetime
- [x] 37.1-02-PLAN.md — return-value `beforeToolRound` hook firing on round 1

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 37.1-03-PLAN.md — persisted contract: `'steer'` in six `messageKind` sites, `steerMessageIds`, `'leader-amend'`, `'skipped'`

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 37.1-04-PLAN.md — `send()` steer routing, leader-as-gate `deliver_steer`, inbox drain, lead prompt, SC5 teardown

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 37.1-05-PLAN.md — `amend_assignments` (cancel/rewrite `queued`)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 37.1-06-PLAN.md — team chat UI: remove outbox + streaming bubbles, inline indicator + popover, hover-gated Stop

### Phase 38: Hard token budget + accurate measurement

**Goal:** The budget is genuinely hard, input and output are both charged on every request, and the numbers the user sees are correct.
**Requirements**: AIO-BUDGET-01, AIO-BUDGET-02, AIO-BUDGET-03, AIO-BUDGET-04, AIO-BUDGET-05, AIO-BUDGET-06, AIO-BUDGET-07, AIO-BUDGET-08, AIO-BUDGET-09
**Depends on:** Phase 37
**Success Criteria** (what must be TRUE):

1. A turn whose prompt already exceeds the remaining budget still runs; crossing the threshold is warned in-app plus one OS notification per level, and is never refused or parked — overrides the original wording per D-01/D-02.
2. A response with no usage still increments the ledger under a stated policy.
3. A retry charges both attempts.
4. 20 concurrent increments sum correctly with no lost update.
5. Starting a group splits the budget evenly with a deterministic remainder.
6. The threshold warning fires at a configurable value (global default in Settings plus an optional per-team override); reaching it raises a member-level badge and a stronger group-level badge plus one OS notification per level, and never pauses the run — overrides the original wording per D-01/D-02/D-06.
7. Topping up one agent raises that agent's share and the group total in one transaction.
8. The display shows granted, used, and remaining per group and per member, with input and output separate.

**Plans:** 12/12 plans complete

Plans:
**Wave 1** *(no dependencies)*

- [x] 38-01-PLAN.md — V25 schema/type/zod foundation + repair the two red migration tests
- [x] 38-02-PLAN.md — record the D-01/D-02 override in REQUIREMENTS.md and ROADMAP.md

**Wave 2**

- [x] 38-03-PLAN.md — atomic usage increment + one shared even-split module
- [x] 38-06-PLAN.md — backup envelope v14 + record schemas + fixture sweep (SQLite parity split to 38-12)
- [x] 38-11-PLAN.md — global budget-warning threshold setting + Settings card

**Wave 3**

- [x] 38-05-PLAN.md — threshold math, resolved-vs-override snapshot fields, shared snapshot helper
- [x] 38-12-PLAN.md — SQLite/parity confirmation: no structural change + membership test

**Wave 4**

- [x] 38-04-PLAN.md — additive two-table top-up + absolute two-table Settings save (WR-13, 3000→4000)

**Wave 5**

- [x] 38-07-PLAN.md — typed usage chain, per-request accounting, pre-call tokenizer warning, terminal flush + reconcile

**Wave 6**

- [x] 38-08-PLAN.md — remove the gate, two-level team-scoped warnings + OS notifications
- [x] 38-10-PLAN.md — install js-tiktoken@1.0.21 behind a human checkpoint

**Wave 7**

- [x] 38-09-PLAN.md — split budget display, estimate marker, resolved threshold in the UI (global source wired into the team list; clear-override traversal test)

**WR-13** (from the phase 36 review) is answered by plan 38-04: `topUp` reads the roster fresh inside the transaction instead of the `ensureMembers` cache.

**Plan-check round 3 changes:** 38-04 gained the absolute `applyTeamBudgetSettings` verb (3000→4000 no longer becomes 5000); 38-05 split its Settings card into 38-11; 38-06 split its SQLite/parity work into 38-12; 38-07 gained the pre-call tokenizer warning and memory-only accounting; 38-08 re-keyed notifications to `(team, level)` with team-scoped resets.

**Plan-check round 4 changes (R3 findings):** the per-team threshold override is now three-state end to end — drawer `number | null | undefined` where `null` = delete, carried into `applyTeamBudgetSettings` as `null` and normalized to `undefined` only at `coordinator.setTeamThresholdPct` — so "dùng mặc định toàn cục" actually deletes the stored override (R3-B1); 38-09 also owns `tests/ai/ActiveAiTurnIndicator.test.tsx` (`baseProps` gains `thresholdPct`, label assertion becomes prop-driven) so its `tsc` gate is green (R3-B2); `TeamsView` reads `getGlobalBudgetWarnThresholdPct` and resolves per team, so no card falls back to 80 after a global change (R3-W1); `38-VALIDATION.md` wave sets are now the union of their tasks' commands and the sign-off counts 32 tasks (R3-W2). Task count and wave assignment are unchanged.

### Phase 39: Skill versioning + enrichment approval

**Goal:** An agent can propose a lesson, the user reviews it as a diff, and only an explicit approval creates a new skill version.
**Requirements**: AIO-SKILL-01, AIO-SKILL-02, AIO-SKILL-03, AIO-SKILL-04, AIO-SKILL-05, AIO-SKILL-06
**Depends on:** Phase 38
**Success Criteria** (what must be TRUE):

1. Skill CRUD works with validation, empty states, and error handling — no crash on network or AI failure. Leader/agent CRUD is Phase 40 (AIO-LEAD-01..04).
2. After a run an agent can propose a lesson; the proposal changes nothing until approved.
3. The user reviews the proposal as a diff and approves or rejects; approval creates exactly one new approved version and the previous stays retrievable.
4. No AI tool can write an approved version.
5. Approving mid-batch does not change a running agent's skill — the assignment pins its version.
6. Skill bodies, including approved ones, are wrapped as untrusted data.

**Research flag:** needs `--research-phase` — R-11/R-12 are open and the feature has zero existing code.

**Plans:** 7/7 plans complete

Plans:
**Wave 1**

- [x] 39-01-PLAN.md — Version model + repo rewrite: optional `version`, `baseVersion`, numbering at approval, atomic `aiSkills` overwrite, backup parity
- [x] 39-02-PLAN.md — `updateSkill` writes an approved version row in the same transaction (D-09)

**Wave 2**

- [x] 39-03-PLAN.md — Real pin: `skillVersion` on the attempt, threaded to `read_skill` (D-17/D-18/D-19/D-19a)

**Wave 3**

- [x] 39-04-PLAN.md — `propose_skill_version` tool + three-field diff + prompt truth (D-01..D-06, D-21)

**Wave 4**

- [x] 39-05-PLAN.md — Transcript approval card via `transcriptExtensions` (D-24, D-25)

**Wave 5**

- [x] 39-06-PLAN.md — `SkillEditorDrawer` pending queue + version history; `SkillCard` pending badge (D-26)

**Wave 6**

- [x] 39-07-PLAN.md — `AiStaffExplorer` "Kỹ năng" section + D-30 doc override

### Phase 40: Explorer UX, CRUD correctness, observed walkthrough

**Goal:** One AI Office trigger, two explorer sections, correct CRUD, and a real walkthrough that replaces "Phase 34 complete" as the quality gate.
**Requirements**: AIO-NAV-01, AIO-NAV-02, AIO-NAV-03, AIO-NAV-04, AIO-NAV-05, AIO-LEAD-01, AIO-LEAD-02, AIO-LEAD-03, AIO-LEAD-04, AIO-VERIFY-01, AIO-VERIFY-02, AIO-VERIFY-03
**Depends on:** Phase 39
**Success Criteria** (what must be TRUE):

1. Exactly one sidebar trigger opens AI Office; Alt+7 is bound and works.
2. The explorer has two sections — leaders + agents above, conversations below — with a virtualized conversation list and create CTAs in both empty states.
3. Clicking any entry opens its detail in the center editor; switching tool windows and relaunching does not lose the tab or its state.
4. The leader delegates a free-style request with a visible plan and per-agent attribution; the user can @mention an agent.
5. CR/PL attachments are optional and their absence does not degrade output quality.
6. Automated tests cover the coordinator, budget gate, team tools, and team repository.
7. Each of the five live defects is reproduced by a failing test before its fix.
8. The full walkthrough runs in the real UI: create a group, staff it, assign work, watch delegation, hit the budget warning, top up, approve a skill version, restore a backup.

**Research flag:** standard patterns — skip research-phase.

## Milestone: v1.2 Knowledge System Implementation

### Phase 18: Multi-Modal Hybrid Retrieval Engine

- Fulltext BM25 search
- Dense vector retrieval
- Hybrid reciprocal rank fusion (RRF)
- Fallback strategies for offline/local environments

### Phase 19: Local Knowledge Base Infrastructure

- Fastify Knowledge Server
- IndexedDB local document storage
- Bi-directional sync with background daemon
- Document sets and metadata tagging

### Phase 19.1: Production Neo4j Integration & Live Retrieval Validation

- Neo4j schema & constraints
- Production bolt connection pool
- Cypher graph query builders
- Live entity resolution pipeline

### Phase 20: Knowledge Graph Extraction & Graphiti Pipeline

- Entity and relationship extraction from Markdown notes
- Graphiti memory integration
- Temporal graph representations
- Automated community detection

### Phase 21: Ontology & Graph Alignment Hardening

- Ontology constraints and entity schema validation
- Step-by-step extraction pipeline
- Grounded synthesis with graph seeds
- Local/server hybrid fallback

### Phase 22: Federated MCP Knowledge & Hybrid Tool Grounding

**Goal:** Provide generic, server-agnostic MCP integration for AI Chat Drawer and Telegram assistant across ALL currently enabled MCP servers (not hardcoded to Graphiti). Dynamically discover capabilities and instructions from all active MCP endpoints, determine MCP relevance via intentRouter, execute parallel retrieval (Knowledge Docs + dynamic MCP tools), and synthesize unified evidence-grounded answers.
**Requirements**: MCP-ROUTE-01, MCP-FEDERATED-01, MCP-SYNTH-01, MCP-TELE-01
**Depends on:** Phase 21
**Success Criteria** (what must be TRUE):

  1. System discovers and aggregates tools and instructions dynamically from ALL enabled MCP servers in Dexie settings (generic/agnostic, zero hardcoded server IDs).
  2. `intentRouter` inspects the dynamic catalog of enabled MCP servers (name, instruction, tool summaries) and flags `require_mcp` plus matching `target_mcp_servers` for any relevant query.
  3. Grounded Turn pipeline executes parallel multi-source retrieval: Knowledge Docs (Fulltext/Vector/Graph) alongside dynamic MCP tool execution for all selected MCP servers.
  4. Evidence from any MCP tool response is packed into `EvidencePack` using a generic MCP citation format (`[MCP:serverName/toolName]`, provenance timestamp, server authority).
  5. Final synthesis combines internal docs and live MCP tool findings into a coherent, non-hallucinated response with distinct MCP citation badges.
  6. Telegram AI gateway dynamically loads all enabled MCP servers and supports MCP tool execution for authorized users.

**Plans:** 4 plans in 4 waves

Plans:

**Wave 1**

- [x] 22-01-PLAN.md — Dynamic MCP capability discovery & IntentRouter extension (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 22-02-PLAN.md — MCP Retrieval Runner, parallel grounded turn orchestration & evidence packing (Wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 22-03-PLAN.md — Unified Grounded UI rendering with [M*] citation chips and source exploration (Wave 3)

**Wave 4** *(blocked on Wave 2 completion)*

- [x] 22-04-PLAN.md — Telegram AI Gateway MCP tool integration and access control parity (Wave 4)

### Phase 23: Knowledge Graph Build Reliability & Entity Fidelity

**Goal:** Eliminate OOM crashes during vector embedding and Neo4j writing, introduce durable incremental extraction caching on disk, and ensure high-fidelity Vietnamese entity naming and URN slugification.
**Requirements**: BUILD-OOM-01, BUILD-CACHE-01, ENTITY-FIDELITY-01
**Depends on:** Phase 22
**Success Criteria** (what must be TRUE):

  1. Rebuilding large document sets (>200 chunks) processes embeddings and writes in bounded batches with event-loop yield, keeping RAM consumption under 1.5Gi with zero OOM/Exit Code 137 kills.
  2. Chunk extraction results are cached persistently on disk keyed by `chunkContentHash` + model + promptVersion; subsequent builds or retries load cached extractions in < 3s without redundant LLM calls.
  3. Entity URN generation uses Unicode NFD-to-ASCII slugification rather than replacing Vietnamese accented characters with underscore chains.
  4. Fact queries (`GET_FACTS_BY_SNAPSHOT`) and FactSummaryDTO return and render original `canonicalName` from Neo4j nodes rather than string-splitting sanitized URN segments.
  5. LLM extraction prompts include entity naming constraints ensuring concise, noun-centric entity names without whole-sentence bloat.

**Plans:** 3 plans in 3 waves

Plans:

**Wave 1**

- [x] 23-01-PLAN.md — Vietnamese Entity Fidelity, Unicode NFD Slugification & Canonical Name Joins (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 23-02-PLAN.md — Persistent Disk-Backed Chunk Extraction Cache (Wave 2)

**Wave 3** *(blocked on Wave 1 and Wave 2 completion)*

- [x] 23-03-PLAN.md — Stream Batching for Vector Embedding & Neo4j Insertion (Wave 3)

### Phase 24: Graph Retrieval Optimization

**Goal:** Make Neo4j retrieval ontology-driven, bounded, deterministic, and observable so existing graph entities and valid evidence survive traversal, ranking, federated fusion, and AI Chat rendering.
**Requirements**: SC-1, SC-2, SC-3, SC-4, SC-5, SC-6, SC-7, SC-8
**Depends on:** Phase 23
**Source:** `docs/GRAPH_RETRIEVAL_OPTIMIZATION_ROADMAP.md`
**Success Criteria** (what must be TRUE):

  1. Regression coverage traces `MAIN1.EVT_EVENT` from AI Chat through planning, Neo4j retrieval, normalization, fusion, and rendering.
  2. Resolved seed entities remain retrievable when no matching edge or path exists, with separate entity, edge, and path counts.
  3. Traversal plans use existing ontology rules per seed, support mixed entity kinds and multiple valid relations, and never accept model-generated raw Cypher.
  4. Plans validate relations, directions, endpoint kinds, and hop limits before execution, returning stable reason codes for empty or rejected results.
  5. Stable graph identities, deterministic ranking, and correct deduplication preserve valid graph evidence through federated fusion.
  6. Stage diagnostics expose only safe metadata, timings, counts, and reason codes—never queries, source content, credentials, or raw Cypher.
  7. Reference queries measure zero-result rate, recall, precision, and latency before Neo4j performance tuning with `EXPLAIN` and `PROFILE`.
  8. Live Neo4j and knowledge-server checks prove entity lookup, read/write relations, seed-only results, bounded multi-hop retrieval, and AI Chat Drawer rendering while preserving offline BM25 fallback.

**Plans:** 7/8 plans executed

Plans:

**Wave 1**

- [x] 24-01-PLAN.md — Registry-derived per-seed planning, stable validation codes, one repair, and reject-not-clamp traversal

**Wave 2** *(blocked on Wave 1)*

- [x] 24-02-PLAN.md — Seed-preserving traversal, SEED_ONLY outcome, failed seeds, counts, and stage diagnostics

**Wave 3** *(blocked on Wave 2)*

- [x] 24-03-PLAN.md — Atomic protected graph packages, deterministic ranking, and count/diagnostic-preserving federation

**Wave 4** *(parallel after Wave 3)*

- [x] 24-04-PLAN.md — Client protocol/federated-schema parity and backward-compatible grounding persistence
- [x] 24-07-PLAN.md — Deterministic graph reference set, correctness evaluator, and hashed offline baseline

**Wave 5** *(blocked on 24-04)*

- [x] 24-05-PLAN.md — Entity-aware evidence packing, SEED_ONLY routing, and Telegram/MCP consumer safety

**Wave 6** *(blocked on 24-05)*

- [x] 24-06-PLAN.md — Seed-only UI, content-free diagnostics, and explicit non-mutating find-related turns

**Wave 7** *(blocked on 24-06 and 24-07)*

- [ ] 24-08-PLAN.md — Offline live-script self-check, gated live graph checks, offline BM25 proof, and human checkpoint

### Phase 25: Interactive SDLC Document Wizards & Bank Template Generator

**Goal:** Provide a closed-loop, interactive SDLC document workflow in AI Chat Drawer that carries a Dev from approved PL02 through versioned `SOLUTION.md`, external code execution, change-pack reconciliation, PL03/PL07 generation, and CAB summary — ending in verified client-side `.docx` output following bank templates.
**Requirements**: WIZ-UI-01, WIZ-INTERACTIVE-01, WIZ-DOCX-01, WIZ-FLOW-01, WIZ-LOOP-01, WIZ-PACK-01
**Depends on:** Phase 24
**Success Criteria** (what must be TRUE):

  1. Quick skill bar on AI Chat Drawer allows one-click activation of guided wizards: `PL02 (Phân tích NV)`, `PL03 (Thiết kế KT)`, `PL07 (Review Code)`, and `Tờ trình CAB`.
  2. Wizard execution guides user interactively through input collection, automatic grounded retrieval against system knowledge/codebase, gap-filling clarification questions, and Markdown preview review before final generation.
  3. Client-side `.docx` builder generates downloadable Word documents conforming strictly to bank standard templates (formatting, headers, metadata, section hierarchies, tables, sign-off blocks), and each generated document is persisted as a Project-linked Note.
  4. `SOLUTION.md` is produced interactively with the Dev, versioned as a Project-linked Note, and re-openable from the same persistent project chat thread when implementation drifts from the approved solution.
  5. Dev-generated `change-pack.zip` (diff, new files, SQL artifacts, metadata) can be dropped into the project chat thread, validated against size/artifact rules, and used to reconcile approved `SOLUTION.md` against actual implementation.
  6. PL03B/PL03 documents only the actual implementation, supported by validated Change Pack evidence; the SOLUTION-to-implementation drift matrix remains in TaskMate and is not included in PL03B/PL03. PL07 and the CAB summary are generated from the same thread context without re-supplying inputs.

**Plans:** 17/18 plans executed

### Phase 25.1: SDLC Flow Hardening & Multi-Tab AI Chat Isolation (INSERTED)

**Goal:** Harden existing Phase 25 AI Chat Drawer/SDLC workflow so every scope has durable fully isolated multi-tab execution, Project retains one fixed persistent SDLC tab, valid assistant turns commit atomically, interruptions/retries are recoverable, SDLC revisions use immutable cycles/versions with correct stale propagation, narrow-drawer UI remains accessible, and encrypted backup/import restores all canonical state without secrets or partial/error output.
**Requirements:** D-01–D-35
**Depends on:** Phase 25
**Success Criteria** (what must be TRUE):

  1. Every scope restores at least one ordinary chat tab from Dexie; Project also has exactly one fixed non-closeable SDLC tab, immediate deterministic editable ordinary titles, and independent active-tab memory.
  2. Every tab isolates history, draft, attachments, request/stream/tool state, errors/retry, wizard/export state, model/config, token usage, and AbortController; background requests continue concurrently and close-running-tab aborts before delete.
  3. User messages save before requests, while assistant output commits once only after complete validation; abort, timeout, parser/tool-schema failure, and retry never persist partial/error output or duplicate user input.
  4. SDLC restart recovery uses per-request plus per-workflow-step checkpoints; requirement/solution revisions preview diff/source/impact before immutable version commit, propagate exact stale steps, and retain prior cycles read-only in the same SDLC tab.
  5. A compact accessible six-step vertical timeline fits a 320px drawer; PL01/PL02 accept independent text/multi-Note sources whose merged input preserves source ID/version/hash citations, conflict warnings, and immutable source Notes.
  6. Existing `runGroundedTurn`, `runAiOrchestratorLoop`, and `runWizardStage` remain the AI core; SDLC forces request-local Analysis Mode/wrapper prompts without leaking into ordinary chat.
  7. Existing encrypted backup/local import and Tauri SQLite paths preserve canonical tabs, workflow/checkpoints, versions/cycles, artifact refs, and valid history while excluding secrets, partial buffers, errors, and raw diagnostics; corrupt imports fail before writes and missing sources restore a blocked recoverable checkpoint.
  8. Targeted unit/component/integration suites, actual-app Playwright acceptance, final source safety gates, and required manual Tauri checks pass with no skipped Phase 25.1 tests.

**Plans:** 12/15 plans complete; 3 gap-closure plans pending

Plans:

**Wave 1**

- [x] 25.1-01-PLAN.md — Durable tab contracts, SCHEMA_V14 migration, deterministic editable titles, repository invariants, and SQLite parity

**Wave 2** *(depends on 25.1-01)*

- [x] 25.1-02-PLAN.md — Per-tab runtime/request ownership and atomic assistant commit/retry behavior

**Wave 3** *(depends on 25.1-01, 25.1-02)*

- [x] 25.1-03-PLAN.md — Workflow checkpoints, immutable versions, revision cycles, active pointers, and stale propagation

**Wave 4** *(parallel after workflow/runtime contracts)*

- [x] 25.1-04-PLAN.md — Vertical timeline, revision impact gate, independent multi-source intake, and D-19 merge/citation/conflict contract
- [x] 25.1-05-PLAN.md — Durable accessible tab UI, isolated drawer state, and SDLC prompt/core routing
- [x] 25.1-06-PLAN.md — Backup types, safe export, strict validation, and missing-source normalization

**Wave 5** *(depends on 25.1-06)*

- [x] 25.1-07-PLAN.md — Atomic restore, pre-25.1 backfill, and snapshot rollback

**Wave 6** *(depends on 25.1-04, 25.1-05, 25.1-07)*

- [x] 25.1-08-PLAN.md — Actual-app multi-tab/SDLC/backup accessibility acceptance

**Wave 7** *(depends on 25.1-08)*

- [x] 25.1-09-PLAN.md — Final targeted regression and phase-scoped source safety gates

**Gap-Closure waves 1-6** *(from 25.1-VERIFICATION.md gaps_found; these are full-phase waves 8-13, strictly sequential 10 → 11 → 12 → 13 → 14 → 15, no parallel plans — every gap-closure plan edits `AIChatDrawer.tsx`)*

**Gap-Closure Wave 1 / full-phase Wave 8** *(no dependencies)*

- [x] 25.1-10-PLAN.md — Sanitized error diagnostics and structural D-09 safety gate (blockers)

**Gap-Closure Wave 2 / full-phase Wave 9** *(depends on 25.1-10)*

- [x] 25.1-11-PLAN.md — Real per-tab runtime seeding, durable per-tab model, transient-state isolation, and concurrent send guard

**Gap-Closure Wave 3 / full-phase Wave 10** *(depends on 25.1-11)*

- [x] 25.1-12-PLAN.md — SDLC checkpoint/resume, revision preview+commit, and cycle open/close wiring

**Gap-Closure Wave 4 / full-phase Wave 11** *(depends on 25.1-12)*

- [x] 25.1-13-PLAN.md — Merged cited SDLC intake, picker listbox semantics, and editable tab titles

**Gap-Closure Wave 5 / full-phase Wave 12** *(depends on 25.1-11, 25.1-13)*

- [x] 25.1-14-PLAN.md — Retry identity, restore missing-source surfacing, and durable-only analysis mode

**Gap-Closure Wave 6 / full-phase Wave 13** *(depends on 25.1-12, 25.1-13, 25.1-14)*

- [ ] 25.1-15-PLAN.md — Actual-app acceptance depth: concurrency, retry, revision/cycles, restore, backup round-trip

### Phase 25.1.1: Unify SDLC workflow: move change-pack, PL03B/PL07 generation, CAB, and DOCX export into the hub and retire the wizard entry points (INSERTED)

**Goal:** Make the SDLC Hub the single executable path from INTAKE to CAB. Steps 4–6 must run from the hub itself — change-pack upload/validate/reconcile, PL03B/PL07 generation, CAB generation, and bank-template `.docx` export — with one metadata source, no parallel wizard state machine, and no toolbar detour.
**Status:** ✅ COMPLETE — verifier passed 7/7 on 2026-11-01 (commit `3ddbd6bd`); report `25.1.1-VERIFICATION.md`
**Requirements**: WIZ-UI-01, WIZ-INTERACTIVE-01, WIZ-DOCX-01, WIZ-FLOW-01, WIZ-LOOP-01, WIZ-PACK-01 (re-homed), D-16, D-17
**Depends on:** Phase 25.1
**Success Criteria** (what must be TRUE):

  1. `commitChangePackAndDrift`, `commitTechDoc`, and `commitCab` each have a production caller in the hub path, so the SDLC artifact chain reaches `pl03b`, `pl07`, and `cab` without the wizard coordinator.
  2. Hub step 4 renders a change-pack dropzone in its own step panel; step 5 exposes a "generate PL03B & PL07" action; step 6 exposes CAB generation. No step instructs the user to use a separate toolbar.
  3. Every generated document (PL02, PL03B, PL07, CAB) can be exported as a bank-template `.docx` from the hub, and each export is persisted as a Project-linked Note.
  4. `WizardSkillBar`, `WizardMetadataModal`, and the drawer-global wizard session state are removed from production render; hub `StepInputDocsModal` metadata is the only metadata input for the flow.
  5. The existing SDLC guarantees still hold after the move: per-tab runtime isolation, checkpoint/resume, revision preview with stale propagation, immutable cycles, missing-source recovery, and the 320px accessible timeline.
  6. Focused suites for the hub, coordinator, change-pack, DOCX builders, and the Playwright SDLC acceptance spec pass with no skipped Phase 25.1.1 tests.

Plans: 11 plans in 11 sequential waves (every plan edits `AIChatDrawer.tsx` or its own service layer; `workflow.use_worktrees: false`)

**Wave 1** *(no dependencies)*

- [x] 25.1.1-01-PLAN.md — Wizard-free, content-addressed artifact persistence: identity assertions replace the wizard-snapshot gate; the key is addressed by `inputHash`, not `draftRevision`

**Wave 2** *(depends on 25.1.1-01)*

- [x] 25.1.1-02-PLAN.md — Hub shell: collapsible timeline, per-step panel contract (incl. INTAKE), stacked drift layout, focus rings, modal z-index, 11px retired directory-wide

**Wave 3** *(depends on 25.1.1-02)*

- [x] 25.1.1-03-PLAN.md — Hub step 2: SOLUTION writer (`saveHubSolution` → `commitSolution`) so `artifacts.solution` has a noteId before the wizard callbacks are deleted

**Wave 4** *(depends on 25.1.1-03)*

- [x] 25.1.1-04-PLAN.md — Hub step 4: change-pack validate/confirm/drift wired to `commitChangePackAndDrift`

**Wave 5** *(depends on 25.1.1-04)*

- [x] 25.1.1-05-PLAN.md — Hub step 5: PL03B/PL07 generation wired to `commitTechDoc`, stage call proven against the real `runWizardStage`, evidence scoped to the project's SDLC sets

**Wave 6** *(depends on 25.1.1-05)*

- [x] 25.1.1-06-PLAN.md — Export and CAB services: payload adapters, Note resolution, docx build/download, CAB that resolves its own PL02 pin and persists three pinned sources

**Wave 7** *(depends on 25.1.1-06)*

- [x] 25.1.1-07-PLAN.md — Hub export rows on steps 1/5/6 and CAB generation wired to `commitCab`; the PL02 pin stays internal to `generateHubCab` and is re-derived from the content hash, never written back into workflow state

**Wave 8** *(depends on 25.1.1-07)*

- [x] 25.1.1-08-PLAN.md — Remove the wizard surface: preview-only historic cards, drawer state retired, routing tests rewritten to assert the approval path is absent

**Wave 9** *(depends on 25.1.1-08)*

- [x] 25.1.1-09-PLAN.md — Delete the four wizard UI modules and their lifecycle suite; prove nothing imports them

**Wave 10** *(depends on 25.1.1-09)*

- [x] 25.1.1-10-PLAN.md — Delete `wizardCoordinator.ts` and its suites; replace the wizard Playwright spec with a hub-only spec

**Wave 11** *(depends on 25.1.1-10)*

- [x] 25.1.1-11-PLAN.md — Regressions sweep: safety-gate list repaired, every Phase 25.1 guarantee re-run scoped, real-function proofs recorded, evidence written up

**Phase 31 Progress:**

- [x] 31-01-PLAN.md — Global conventions storage, settings UI, and backup inclusion
- [x] 31-02-PLAN.md — Repository CONVENTIONS.md discovery and SSH loading
- [x] 31-03-PLAN.md — Conventions prompt segment, conflict policy, and Step 1/2 visibility
- [x] 31-04-PLAN.md — Exemplar and witness tests for convention compliance and conflict handling

### Phase 25.1.2: Fix the SDLC hub user flow end to end (INSERTED)

**Goal:** Everyone who touches the hub — the user, the AI turn, and the coordinator — acts on one agreed flow. After a deep discussion locks the canonical end-user journey from CR intake to CAB, every step must be reachable, actionable, and reversible: no dead ends, no step whose only exit is a hidden path, no button whose first press does nothing, and no action that silently resets work the user believes is kept.

**Why inserted:** Phase 25.1.1 moved every capability into the hub and deleted the wizard, but walking the flow with real data exposed defects that are structural rather than typos — a step with no forward action, a confirm dialog that swallowed the first click, a reset that did not reset, artifacts saved but unreadable. Patching these one at a time produced regressions; the flow itself has to be discussed and specified before more code moves.

**Requirements:** SC-1, SC-2, SC-3, SC-4, SC-5, SC-6, D-01, D-02, D-03, D-04, D-05
**Depends on:** Phase 25.1.1
**Success Criteria** (what must be TRUE):

  1. The canonical flow is written down as an explicit state machine: for every step, what the user sees, what actions exist, what each action commits, and what state it leaves behind.
  2. Every step has at least one forward action that a user can find without leaving the hub, and step 3 (external coding) has an explicit completion that advances the flow.
  3. Every destructive or reset action states exactly what it destroys and what survives, and does exactly that — verified by a test that reloads and checks persistence.
  4. Every confirm dialog commits on the first activation; no interaction requires a second click to have an effect.
  5. Every artifact the flow produces can be read back inside the hub, not only written.
  6. A single Playwright walk-through drives intake → SOLUTION → code → change pack → PL03B/PL07 → CAB → export in one session with no manual DB seeding beyond the initial intake.

**Plans:** 4 plans in 4 waves

Plans:

**Wave 1**

- [x] 25.1.2-01-PLAN.md — Decouple SDLC from AIChatDrawer, establish Multi-CR management and isolated step thread data layer

**Wave 2** *(depends on 25.1.2-01)*

- [x] 25.1.2-02-PLAN.md — Dedicated ProjectSdlcView with 2-column IDE layout, StepChatPanel, Step 1 Intake view, and Step 2 Solution two-way Document Editor

**Wave 3** *(depends on 25.1.2-02)*

- [x] 25.1.2-03-PLAN.md — Steps 3-6: Code guide, Multi-pack change-pack management with drift reconciliation, Tech Docs (PL03B/PL07), and CAB export

**Wave 4** *(depends on 25.1.2-03)*

- [x] 25.1.2-04-PLAN.md — Actionable Stale handling, first-click guarantees, new CR creation with context inheritance, and end-to-end integration verification

### Phase 25.2: Fix TaskMate mutation flow & standardize AI Core Engine for SDLC Studio

**Goal:** Fix TaskMate database mutations so AI can reliably create/update/delete tasks and projects with clear user confirmation/auto-approve, and unify SDLC Studio (StepChatPanel and Solution analysis) onto the shared `runAiOrchestratorLoop` engine with scoped project/CR context.

**Depends on:** Phase 25.1.2
**Success Criteria** (what must be TRUE):

1. In ordinary chat (Analysis Mode OFF), user requests to mutate tasks/projects/milestones (e.g. `create_task`, `update_task`) are correctly classified as `operate_taskmate`, pass mutation check, and execute either via confirmation popup or auto-approve mode without "không được phép" error.
2. In Analysis Mode, read-only guard is clear and consistent across tools and prompts, while allowing authorized operations when explicitly requested or switched out of analysis mode.
3. SDLC Studio `StepChatPanel` uses `runAiOrchestratorLoop` (with analysis mode active and step-isolated context), enabling real-time tool execution (`query_notes`, `query_tasks`, Graphiti facts, MCP tools) and live streaming.
4. SDLC Studio `Step2SolutionView` executes automated architectural analysis via `runAiOrchestratorLoop`, leveraging project context and tools to draft `SOLUTION.md` without hallucinations.
5. All SDLC and AI chat tests pass with zero regressions.

**Plans:** 6 plans (4 executed, 2 gap-closure plans)

Plans:

**Wave 1**

- [x] 25.2-01-PLAN.md — TaskMate mutation authorization & auto-approve hardening

**Wave 2** *(depends on 25.2-01)*

- [x] 25.2-02-PLAN.md — Standardize StepChatPanel on runAiOrchestratorLoop and fix Step 2 Solution remount pipeline

**Wave 3 (Gap Closure)** *(no dependencies)*

- [x] 25.2-03-PLAN.md — Compact StepChatPanel header layout and unify MCP controls in ChatTabToolbox

**Wave 4 (Gap Closure)** *(depends on 25.2-03)*

- [x] 25.2-04-PLAN.md — Harden stalenessDetector and isolate draft artifact state against white screen crash

**Wave 5 (Gap Closure)** *(no dependencies)*

- [x] 25.2-05-PLAN.md — Fix MCP button click in ChatTabToolbox: open popover without toggling active status

**Wave 6 (Gap Closure)** *(depends on 25.2-05)*

- [x] 25.2-06-PLAN.md — Immediate loading feedback, concise chat summary format, and message collapsing in StepChatPanel

### Phase 25.3: SDLC Workflow Engine Hardening, Unified Common AI Chat Widget & SDLC Prompt Architecture

**Goal:** Eliminate SDLC workflow coordinator initialization and persistence defects (`WORKFLOW_NOT_INITIALIZED`), enforce strict prerequisite action guards across all steps, remove obsolete step 3 checklists, architect a reusable `AiChatWidget` with instant loading feedback, and standardize the SDLC AI prompt architecture across all 6 steps for deterministic, bank-standard artifact generation.

**Depends on:** Phase 25.2
**Success Criteria** (what must be TRUE):

1. `workflowCoordinator` auto-restores its state from IndexedDB if `currentState` is undefined during any lifecycle or action call, surviving step transitions, re-renders, and page reloads.
2. Step 3 checklist card is completely removed; Step 3 code command and step transition are clean and purposeful.
3. Every SDLC step enforces strict prerequisite gates: actions (buttons, inputs, dropzones) are fully disabled with clear guidance when prerequisite artifacts are missing.
4. A single, unified `AiChatWidget` component encapsulates the AI orchestrator loop, MCP controls, model selection, live streaming transcript, and tool mutation approvals.
5. `AiChatWidget` displays immediate, visible loading feedback from the instant a turn starts until completion, eliminating perceived freezing.
6. A standardized SDLC Prompt Architecture defines structured system prompts, grounding rules, and few-shot templates across all 6 steps (Intake validation, Solution architecture, Coding guide, Drift interpretation, Bank PL03B/PL07 tech docs, and CAB defense).
7. SDLC Studio `StepChatPanel` and `AIChatDrawer` are refactored to consume `AiChatWidget` with custom prompts, contexts, and handlers via clean props.

**Plans:** 18/18 plans complete

**Wave 1** *(parallel, no dependencies)*

- [x] 25.3-01-PLAN.md — Coordinator restore-before-action, `ensureState()`, and stable guard-code registry
- [x] 25.3-03-PLAN.md — Layered SDLC prompt composer with shared policy, six step contracts, and few-shot exemplars
- [x] 25.3-07-PLAN.md — Framework-free chat turn runtime plus `useChatTurn` hook
- [x] 25.3-12-PLAN.md — Production wizard runtime wiring (`WizardModel`, evidence collection, published set ids)

**Wave 2** *(depends on Wave 1)*

- [x] 25.3-02-PLAN.md — Step 3 checklist removal, Step 4 pre-emptive gates, and four-finding drift matrix

**Wave 3** *(depends on Waves 1-2)*

- [x] 25.3-04-PLAN.md — Step 2 approval gated on the INTAKE baseline
- [x] 25.3-08-PLAN.md — `AiChatWidget`, staged loading, approval card, durable artifact event cards

**Wave 4** *(depends on Waves 1-3)*

- [x] 25.3-05-PLAN.md — PL03B actual-implementation-only, blank PL07, draft-only tech docs

**Wave 5** *(depends on Waves 1-4)*

- [x] 25.3-06-PLAN.md — Draft-only CAB generator, evidence-constrained CAB, TaskMate-only CR summary
- [x] 25.3-09-PLAN.md — StepChatPanel host adapter; coordinator restore and artifact event persistence in the SDLC view

**Wave 6** *(depends on Waves 3-5)*

- [x] 25.3-10-PLAN.md — AIChatDrawer consumes the shared widget and per-tab runtime registry

**Wave 7** *(depends on Waves 5-6)*

- [x] 25.3-11-PLAN.md — Cross-host lifecycle parity suite and removal of component-to-service re-export

**Wave 8 (Gap Closure)** *(no dependencies)*

- [x] 25.3-13-PLAN.md — Revision commit preserves `approvedAt`, analysis timer lifecycle, Step 2 approval sync
- [x] 25.3-16-PLAN.md — Bounded collapsible tool-activity list above the composer
- [x] 25.3-17-PLAN.md — Resizable 320/380/480 SDLC chat lane with keyboard and persisted width (`SDLC_CHAT_WIDTH_KEY = 'planner:sdlc_chat_width'`)

**Wave 9 (Gap Closure)** *(depends on 25.3-13)*

- [x] 25.3-14-PLAN.md — Step 1 activation starts the SOLUTION analysis exactly once, with synchronous `selectedStepRef` cancellation

**Wave 10 (Gap Closure)** *(depends on 25.3-14)*

- [x] 25.3-15-PLAN.md — Provider finish-reason guard, caller-supplied `maxTokens` forwarding on main/fallback/synthesis payloads, truncated-turn rejection before persistence

**Wave 11 (Gap Closure)** *(depends on 25.3-15)*

- [x] 25.3-18-PLAN.md — SOLUTION extraction and truncation safety: fence-aware parser, transcript summary removal, four-backtick output contract, context-window forwarding and rejection of length-truncated artifacts (no host completion cap)

### Phase 25.4: IntelliJ ExpUI (Light Theme) Workbench Migration (INSERTED)

**Goal:** Chuyển đổi giao diện TaskMate sang phong cách IntelliJ IDEA (ExpUI Islands Light) tương tự OpenIDEA theo mô hình Isolated Shell trên branch riêng `feature/intellij-workbench`. Đạt 60fps, low latency, fast docking/switching; giữ nguyên 100% logic nghiệp vụ, Dexie DB, các services và views hiện có.

**Architecture & Isolation:**

1. Giữ nguyên business logic: không can thiệp `src/db/*`, `src/services/*`, `src/domain/*`. Các views hiện tại đóng vai trò Plug-in Components cắm vào các slot của Workbench.
2. Shell mới cách ly: `src/workbench/`, `src/styles/workbench-tokens.css`, entry riêng `src/AppIntelliJ.tsx` (không ghi đè `src/App.tsx`).
3. Thư viện bổ sung: `react-resizable-panels`, `zustand`, `@tanstack/react-virtual`.

**Requirements:** EXPUI-01, EXPUI-02, EXPUI-03, EXPUI-04, EXPUI-05
**Depends on:** Isolated shell on branch `feature/intellij-workbench`
**Success Criteria** (what must be TRUE):

1. TitleBar tích hợp window controls, quick project switcher, Search Everywhere, mini timer widget.
2. Tool Window Stripes hẹp 32px ở trái, phải, đáy với badge và phím tắt `Alt+1`..`Alt+5`.
3. Docking slots / islands (left, right, bottom) resize mượt mà và lưu layout vào `localStorage`.
4. Editor Area tabbed hiển thị views hiện có (Tasks, Docs, Capacity Planner) bọc bởi `AntdThemeAdapter`.
5. Search Everywhere popup modal (`Double Shift` / `Ctrl+K`) hỗ trợ tabs All / Tasks / Projects / Docs / Actions.
6. Centralized Action & Keymap Registry (`src/workbench/actions/`) điều khiển toàn bộ app qua keyboard.
7. Danh sách dài được ảo hóa bằng `@tanstack/react-virtual`, đạt render 60fps.

**Plans:** 4 plans in 4 waves

**Wave 1**

- [x] 25.4-01-PLAN.md — Khung Workbench & Light Theme (`tokens.css`, `TitleBar`, `Stripe`, `StatusBar`, `layoutStore.ts` Zustand)

**Wave 2** *(depends on 25.4-01)*

- [x] 25.4-02-PLAN.md — Tích hợp Views hiện có vào các Slots (`AntdThemeAdapter`, Left slot, Center Editor Area, Bottom slot)

**Wave 3** *(depends on 25.4-02)*

- [x] 25.4-03-PLAN.md — Search Everywhere (`Double Shift` / `Ctrl+K`) & Centralized Keymaps Registry

**Wave 4** *(depends on 25.4-03)*

- [x] 25.4-04-PLAN.md — Tối ưu hiệu năng ảo hóa (@tanstack/react-virtual) & Switchover test (`AppIntelliJ.tsx`)

### Phase 25.5: TaskMate Workbench UI/UX Comprehensive Restructure & Precision Layout (INSERTED)

**Goal:** Tái cấu trúc toàn diện layout, UI và UX của TaskMate Workbench theo phong cách JetBrains ExpUI chuẩn mực: sửa triệt để cơ chế resize handles (`react-resizable-panels`) cho mượt mà và trực quan; tăng font-size/typography và padding dễ đọc; tái cơ cấu TopBar (loại bỏ controls vô nghĩa, đưa quick views & actions chuẩn lên toolbar); phân bổ đúng chức năng cho Left Explorer (tách Projects Tree và Docs Tree với action click mở tab chi tiết ở Center); chuyển AI Chat sang Right Dockable Tool Window; tích hợp Active Timer và system status vào StatusBar 26px; đảm bảo 100% tính năng của TaskMate được tiếp cận tự nhiên, không gượng ép.

**Architecture & Alignment:**

1. Layout Resizing: Sửa tận gốc `PanelResizeHandle` để thanh phân cách hiển thị rõ ràng, hover highlight xanh dương (`var(--accent)`), hit-box 6-8px, con trỏ `col-resize`/`row-resize` mượt mà, không bị kẹt hay giật lag.
2. Typography & Hierarchy: Chuẩn hóa scale chữ (`--font-size-ui: 13.5px`, body 14px, headers 15-16px, monospace 12.5px), khoảng cách giữa các island panel hài hòa, loại bỏ chữ li ti khó nhìn.
3. TopBar Refinement: Bỏ hoàn toàn 3 nút minimize/maximize/close vô nghĩa; bố trí lại Project Switcher, Search Everywhere (`Double Shift`), Quick Views (Dashboard, Planner, Analytics), Settings và AI Assistant trigger.
4. Left Explorer Specialization: Tách biệt rõ 2 panels dockable:
   - `Projects Explorer`: Cây Project → Milestone → Task (click mở chi tiết tab ở Center).
   - `Docs Explorer`: Cây danh mục Markdown Notes (click mở view soạn thảo ở Center).
5. Right Dockable Window: Đưa AI Assistant và Item Inspector về Right Tool Window (`Alt+3`, `Alt+4`), giải phóng hoàn toàn chiều dọc bằng cách thu hồi Bottom Tool Window.
6. StatusBar Integration: Giữ chân trang 26px siêu gọn, hiển thị trạng thái DB, Knowledge daemon, Active Timer thực tế có nút điều khiển nhanh.

**Requirements:** WB-RESIZE-01, WB-TYPO-01, WB-TOPBAR-01, WB-LEFT-EXPLORER-01, WB-RIGHT-DOCK-01, WB-STATUSBAR-01, WB-CENTER-TABS-01
**Depends on:** Phase 25.4
**Success Criteria** (what must be TRUE):

1. Thanh phân cách giữa các panels (Left/Center, Center/Right) hiển thị rõ đường kẻ chia, có hover/active effect xanh dương, kéo thả resize mượt mà không vỡ layout.
2. Cỡ chữ trên toàn bộ Workbench tăng lên 13.5px–14px, các chữ nhỏ 10px được nâng lên tối thiểu 11.5px–12px, độ tương phản và line-height đạt chuẩn JetBrains ExpUI.
3. TopBar không còn nút minimize/maximize/close; có đầy đủ Project Switcher, Search Everywhere button, Quick View navigation, nút Settings và AI Assistant.
4. Left Tool Window hỗ trợ chuyển đổi giữa Project Explorer (cây Project/Milestone/Task) và Docs Explorer (cây tài liệu); click vào bất kỳ item nào lập tức mở tab tương ứng ở Center Area.
5. AI Assistant hoạt động trơn tru trong Right Tool Window (dock/undock mượt mà); Bottom Tool Window được dọn sạch giúp Center Editor Area có không gian dọc tối đa.
6. StatusBar hiển thị gọn gàng: Ready status, Storage, Knowledge status ở bên trái; Active Timer Widget kèm nút Play/Pause và Sync status ở bên phải.
7. Toàn bộ các view hiện hữu của TaskMate (Tasks, Notes, Planner, Dashboard, Projects, Analytics, Settings, SDLC) mở và điều hướng trơn tru qua Center Tabs.

**Plans:** 4/4 plans complete

**Wave 1**

- [x] 25.5-01-PLAN.md — Resizable Panels Fix & Theme/Typography Scale Overhaul (`workbench-tokens.css`, `WorkbenchLayout.tsx`, `layoutStore.ts`)

**Wave 2** *(depends on 25.5-01)*

- [x] 25.5-02-PLAN.md — TopBar & StatusBar Streamlining (`TitleBar.tsx`, `StatusBar.tsx`, loại bỏ window controls, tích hợp Quick Nav & Timer)

**Wave 3** *(depends on 25.5-02)*

- [x] 25.5-03-PLAN.md — Left Tool Windows Restructure: Dual Explorer for Projects & Docs (`LeftToolWindow.tsx`, `DocsTree.tsx`, `ProjectTree.tsx`, `Stripe.tsx`)

**Wave 4** *(depends on 25.5-03)*

- [x] 25.5-04-PLAN.md — Right Tool Window Integration (AI Assistant & Inspector), Bottom Window Retirement & Full Navigation Verification (`RightToolWindow.tsx`, `EditorArea.tsx`)

### Phase 34: AI Office — fixed AI employees with persona/role/per-model, multi-agent teams that work independently and converse to complete a request, employee list tab and team workspace page

**Goal:** A user can staff an AI Office of reusable employees and leads, assign one skill per employee, and run a team where a lead decomposes the request, proposes a confirmed assignment plan, and dispatches parallel read-only employee batches over a shared, offline-searchable transcript — with lead-only mutations parked on the existing approval card and per-team/per-agent token budgets that pause at 80% instead of auto-stopping.
**Requirements**: AIO-EMP-01, AIO-EMP-02, AIO-SKILL-01, AIO-SKILL-02, AIO-TEAM-01, AIO-TEAM-02, AIO-TEAM-03, AIO-TEAM-04, AIO-MEM-01, AIO-MEM-02, AIO-MEM-03, AIO-WRITE-01, AIO-WRITE-02, AIO-BUDGET-01, AIO-BUDGET-02, AIO-LINK-01, AIO-BG-01, AIO-UI-01, AIO-BACKUP-01
**Depends on:** Phase 33
**Success Criteria** (what must be TRUE):

1. A user can create employees (name, role, persona, per-agent model, at most one skill) and leads as separate global entities, and editing an employee persona changes it in every team that uses it.
2. Activating a team dispatches the lead, which emits an assignment plan (agent + skill + task) on a confirmation card; approving it runs the batch concurrently (cap 3) and the lead synthesizes only after the whole batch returns.
3. Every message in the team transcript is attributed to its agent and renders in one continuous channel; a user can `@agent` to address a specific employee, and a running agent streams into its own bubble with a status badge.
4. An employee turn can read but never write — its tool set contains no mutation tool — while every lead mutation parks on the existing `MutationApprovalCard` unless the team's auto-approve toggle is on.
5. With the Knowledge Server stopped and the network offline, an agent can still recall older team work through `search_team_history` and `read_team_turn`.
6. At 80% of the team budget or of one agent's budget, that scope pauses between tool rounds, preserves context, and shows a visible "needs more tokens" state that resumes exactly where it stopped — nothing is auto-aborted and no pause reads as a hang.
7. A stopped agent reports back to the lead explicitly marked incomplete, and a global Stop aborts the lead plus every running agent.
8. Team runs continue when the user leaves the tab, and returning shows the full result.

**Plans:** 10/10 plans complete

**Wave 1** *(no dependencies; the hard gate — every later plan imports these types and tables)*

- [x] 34-01-PLAN.md — AI Office type contract, Zod schemas, additive Dexie `version(17)`, `'team'` scope, message attribution, SQLite mirror allowlists

**Wave 2** *(depends on 34-01; four independent plans)*

- [x] 34-02-PLAN.md — Employee/lead/skill repo, team/member/link repo with activation and roster caps, team transcript repo
- [x] 34-03-PLAN.md — Runtime seams: read-only mutation policy, `persistUserMessage` opt-out, attribution forwarding, `beforeToolRound`, tool allowlists
- [x] 34-06-PLAN.md — Backup: six tables and four attribution fields through the five-file contract, envelope stays v11
- [x] 34-08-PLAN.md — Transcript attribution layer: attribution row, plan card, paused banner, top-up modal, team capsule

**Wave 3** *(depends on 34-02/34-03)*

- [x] 34-04-PLAN.md — Budget gate with the 80% crossing rule, per-agent runtime registry, lead/employee prompt assembly
- [x] 34-05-PLAN.md — Six team tools: offline BM25 search, team-scoped turn read, skill reader, linked-item full context, `delegate_batch` validation
- [x] 34-09-PLAN.md — Employee tab shell, cards, editor drawers, `'teams'` type/icon/title registration

**Wave 4** *(depends on 34-03/34-04/34-05)*

- [x] 34-07-PLAN.md — Headless team-run coordinator: `@agent` routing, plan park, concurrent batch, terminal-only settle, budget pause, both stop controls

**Wave 5** *(depends on 34-07/34-09)*

- [x] 34-10-PLAN.md — Team page: list, create/settings drawers, workspace with shared transcript, sidebar, linked items, `renderViewContent` routing, TitleBar entry

---

## Milestone: v1.3 SDLC Closed-Loop Engine & Repository Autonomy

### Phase 26: SDLC Prompt Grounding & Tool-Use Policy

**Goal:** Every SDLC chat turn runs on real project evidence with a per-step tool-use policy, an intent-correct output contract, tool-calling exemplars, and a bounded, visible tool loop.
**Requirements**: SDLC-PR-01, SDLC-PR-02, SDLC-PR-03, SDLC-PR-04, SDLC-PR-05, SDLC-PR-06
**Depends on:** Phase 25.3
**Success Criteria** (what must be TRUE):

1. A turn sent from the production SDLC view always carries grounding built from that step's own artifacts (PL01/PL02, pinned SOLUTION, change-pack manifest, prior tech docs, CR metadata) plus bounded retrieved evidence; an empty-grounding turn from the production view is impossible.
2. The composed system prompt names the tools offered in that step and when to call them, including "re-query narrower when evidence is thin" and "do not answer from memory when a tool could resolve it", and each step's exemplars include one tool-calling turn and one evidence-insufficient turn.
3. Artifact-intent turns for SOLUTION, PL03B, PL07, and CAB each receive their own output contract, and no step can send a mismatched contract from `StepChatPanel`.
4. The prompt stays layered in order (policy → step contract → tool policy → few-shot → grounding → output contract → language rule), and a test fails if any step or grounding text precedes the policy layer.
5. Multi-round tool calls stop at an explicit per-turn limit; every call appears in the widget's tool-activity list, and hitting the limit ends with a visible "evidence gathering stopped" status rather than a silent truncation.

**Plans:** 4 plans in 4 waves
**UI hint**: yes

Plans:

**Wave 1** *(no dependencies; edits `ProjectSdlcView.tsx`)*

- [ ] 26-01-PLAN.md — Step grounding builder and production view supply: per-step artifacts, CR metadata, bounded retrieved evidence; no empty-grounding path

**Wave 2** *(depends on 26-01; edits `sdlcPromptComposer.ts`)*

- [ ] 26-02-PLAN.md — Tool-use policy layer, tool-calling/evidence-insufficient few-shots, and the layer-order assertion

**Wave 3** *(depends on 26-02; edits `StepChatPanel.tsx`)*

- [ ] 26-03-PLAN.md — Intent-driven artifact contract selection; remove the hardcoded `artifact: 'SOLUTION'`

**Wave 4** *(depends on 26-02; edits turn runtime and `AiChatWidget`)*

- [ ] 26-04-PLAN.md — Bounded multi-round tool loop, visible tool activity, and explicit "evidence gathering stopped" terminal status

### Phase 27: Studio Artifact Tools & Diff Approval

**Goal:** Studio chat can inspect the current artifact and propose edits as unified diffs that the user explicitly approves before the editor changes; approval updates the draft and marks staleness without committing a version.
**Requirements**: SDLC-ART-01, SDLC-ART-02, SDLC-ART-03, SDLC-ART-04, SDLC-ART-05, SDLC-ART-06
**Depends on:** Phase 26
**Success Criteria** (what must be TRUE):

1. `get_artifact` returns the current artifact's kind, version, approval state, full Markdown, and stable section index, so the model can inspect before proposing.
2. `patch_artifact_section` returns a unified diff plus the resulting Markdown and does not write the editor.
3. Every patch result renders an approval card with added/removed lines; approve writes the editor draft and marks the step stale, reject leaves the editor untouched, and the decision is recorded in the transcript.
4. Approving never commits a version and never claims the document was approved or saved.
5. "Add this content to the solution" resolves to `get_artifact` + `patch_artifact_section` with a bounded diff, and artifact tools are refused in preview/historical versions and when the prerequisite artifact is missing.

**UI hint**: yes

**Plans:** 5 plans in 5 waves

Plans:

**Wave 1** *(depends on Phase 26; edits tool registry and artifact repository reads)*

- [x] 27-01-PLAN.md — `get_artifact` read tool with section index and `patch_artifact_section` diff tool (no editor write)

**Wave 2** *(depends on 27-01; edits `AiChatWidget` and `StepChatPanel`)*

- [x] 27-02-PLAN.md — Artifact-diff approval card: added/removed rendering, approve/reject, transcript decision record

**Wave 3** *(depends on 27-02; edits SDLC host handlers)*

- [x] 27-03-PLAN.md — Approve writes editor draft, marks step stale via existing revision rules, and never commits a version

**Wave 4** *(depends on 27-03)*

- [x] 27-04-PLAN.md — Intent routing regression: small "add this content" request produces get + patch and a bounded diff

**Wave 5** *(depends on 27-01)*

- [x] 27-05-PLAN.md — Read-only and prerequisite guards: refused in preview/historical, allowed in active CR, blocked without prerequisite artifact

### Phase 28: Query-Only Knowledge Retrieval

**Goal:** Retrieval works from a device that has no local documents: the client sends `{query, limit}` and the server chooses joined published sets, while trust guarantees and cross-surface messaging stay intact.
**Requirements**: SDLC-RET-01, SDLC-RET-02, SDLC-RET-03, SDLC-RET-04, SDLC-RET-05
**Depends on:** Phase 25.3 (independent of Phases 26–27; server work can start immediately)
**Success Criteria** (what must be TRUE):

1. `retrieve_knowledge` succeeds with `query` and `limit` only on a profile with no local document sets; the default path no longer calls `fetchSetCatalog`.
2. The server federates a query-only request across every published set and returns which sets and snapshots answered alongside evidence, entities, paths, and warnings.
3. Bounded budgets, single-snapshot path closure, citation IDs, and truthful degraded/unavailable outcomes still hold for query-only requests.
4. When no published set exists, the response is a clear actionable message, not a generic exception, and AI Chat, SDLC step chat, and Telegram surface it identically.
5. An explicit set restriction still works for callers that know their sets, is optional, and is never the default.

**Plans:** 4 plans in 4 waves

Plans:

**Wave 1** *(no dependencies; edits knowledge-server retrieval service)*

- [ ] 28-01-PLAN.md — Query-only federated retrieval across all published sets with set/snapshot attribution

**Wave 2** *(depends on 28-01; edits client retrieval service and tool)*

- [ ] 28-02-PLAN.md — Client query-only request path, `fetchSetCatalog` removal, and optional explicit set restriction

**Wave 3** *(depends on 28-01)*

- [ ] 28-03-PLAN.md — Trust-guarantee regression: budgets, single-snapshot closure, citations, degraded/unavailable truthfulness

**Wave 4** *(depends on 28-02)*

- [ ] 28-04-PLAN.md — Empty-set actionable outcome normalized across AI Chat, SDLC chat, and Telegram

### Phase 29: SSH Remote Repository Branch & Diff Review

**Goal:** In SDLC Step 3, TaskMate leverages native Tauri SSH & SFTP backend to connect to the remote host/WSL repository, inspect the active CR git branch, fetch commit history and changed files, and present an interactive diff & commit review UI before proceeding to change pack generation.
**Requirements**: SDLC-REPO-01, SDLC-REPO-02, SDLC-REPO-03, SDLC-REPO-06
**Depends on:** Phase 26
**Success Criteria** (what must be TRUE):

1. Step 3 can select an SSH profile from Settings with native OS keyring authentication and verify connection status to the target repository path.
2. Step 3 automatically targets the CR branch (`feature/{crCode}` with fallback to current HEAD or custom branch input), fetching commit log (`git log $BASE..HEAD`) and changed files status (`git diff --name-status $BASE..HEAD`).
3. UI presents a clean review interface: commit timeline, changed file list with diff stats (+/-), and diff preview.
4. User can approve the review, transitioning smoothly to Step 4 with verified branch snapshot context ({ base, head, branch, commits, files, diff }).

**UI hint**: yes

**Plans:** 3 plans in 3 waves

Plans:

**Wave 1** *(no dependencies; SSH git query service)*

- [x] 29-01-PLAN.md — SSH git execution service: branch detection, `git log`, `git diff --name-status`, uncommitted changes check, and typed branch snapshot models

**Wave 2** *(depends on 29-01; Step 3 UI overhaul)*

- [x] 29-02-PLAN.md — SDLC Step 3 interactive remote branch review UI: SSH profile picker, commit timeline, changed files tree, and diff preview

**Wave 3** *(depends on 29-02; approval & transition bridge)*

- [ ] 29-03-PLAN.md — Branch snapshot approval and state handoff to Step 4 with regression tests

### Phase 29.1: Remote SSH Git Explorer & Headful Claude Code Terminal Flow (INSERTED)

**Goal:** Provide an IDE-grade Remote File Explorer on Workbench Left Stripe (below Diagram Explorer) that connects over SSH, lazy-loads git directory trees and views file contents strictly read-only by branch without altering the remote working tree, embeds an interactive xterm.js remote terminal in Workbench bottom panel connected via Tauri SSH PTY streaming session, allowing the user to run headful `claude` CLI or any shell commands in the repository working directory, inspect generated files/diagrams in Explorer or terminal, and bridge Mermaid diagrams to Diagram Studio.
**Requirements**: SDLC-REPO-EXP-01, SDLC-REPO-EXP-02, SDLC-REPO-EXP-03, SDLC-REPO-EXP-04, SDLC-REPO-EXP-05
**Depends on:** Phase 29
**Success Criteria** (what must be TRUE):

1. Left Stripe displays a dedicated File Explorer icon below Diagram Explorer, opening a docked `RemoteFileExplorer` tool window.
2. User can select saved SSH configurations, choose/input remote repository paths, pick git branches, and browse directory hierarchy via read-only git tree operations (`git ls-tree -l <ref>[:<path>]`) without dirtying remote working copy.
3. Clicking any file opens a read-only editor tab displaying file contents retrieved via `git show <ref>:<file_path>` with syntax formatting and 2MB preview guard.
4. Workbench Bottom Panel hosts an interactive remote terminal powered by `@xterm/xterm` and Tauri SSH PTY streaming, automatically anchored to repository working directory for headful `claude` CLI or arbitrary shell execution.
5. User can extract Mermaid diagrams from remote files or terminal logs with 1-click bridge saving to Diagram Studio (`type: 'diagram'`).

**Plans:** 3 plans in 3 waves
**UI hint**: yes

Plans:

**Wave 1** *(no dependencies; remote git tree & PTY streaming backend)*

- [x] 29.1-01-PLAN.md — Remote git read-only tree service (`ls-tree`, `show`), branch switcher, and Tauri SSH PTY streaming backend + `sshPtyService.ts`
- [x] 29.1-02-PLAN.md — `RemoteGitExplorer` Left Tool Window, Stripe integration, branch selector, and read-only Center Editor Tab
- [x] 29.1-03-PLAN.md — Workbench Bottom Terminal Tool Window (`RemoteTerminalPanel.tsx`), xterm.js integration, Claude Code headful session flow, and Diagram Studio bridge

### Phase 30: Automatic Change Pack Packaging & Drift Reconciliation

**Goal:** In SDLC Step 4, TaskMate automatically collects git diff and required artifacts (new-files, sql/*) over SSH, generates an in-memory change pack zip conforming to `ChangePackManifestSchema`, runs `validateHubChangePack`, and triggers drift reconciliation against the approved SOLUTION with no manual zip handling.
**Requirements**: SDLC-REPO-04, SDLC-REPO-05, SDLC-REPO-07
**Depends on:** Phase 29
**Success Criteria** (what must be TRUE):

1. Step 4 automatically receives the approved branch snapshot from Step 3, collects required new files and SQL scripts via SSH tarball over stdout, and constructs an in-memory zip adhering strictly to `entryPolicy` and size limits (< 5MB compressed, < 2MB per entry).
2. The generated zip passes `validateHubChangePack` with matching CR identity, and immediately executes `buildHubReconciliation` against the approved SOLUTION.
3. The manual dropzone in Step 4 remains an explicit, labelled fallback for offline, disconnected, or manually built change packs.
4. Edge cases (uncommitted changes, connection failure, non-zero git exit, oversized diff) display informative error banners without leaving orphan artifacts or blocking workflow navigation.

**UI hint**: yes

**Plans:** 3 plans in 3 waves

Plans:

**Wave 1** *(depends on Phase 29; in-memory zip packager)*

- [x] 30-01-PLAN.md — SSH file collector and in-memory JSZip change-pack builder conforming to ChangePackManifestSchema & desktop limits

**Wave 2** *(depends on 30-01; Step 4 auto-packaging integration)*

- [x] 30-02-PLAN.md — Step 4 auto-packaging trigger, progress stepper, drift reconciliation, and manual dropzone accordion fallback

**Wave 3** *(depends on 30-02; error hardening & end-to-end walkthrough)*

- [x] 30-03-PLAN.md — Reliability hardening (missing snapshot CTA, remote drift handling, dirty tree info, SSH failure auto-expansion)

### Phase 31: Organization Conventions in the Solution Pipeline

**Goal:** Generated solutions follow the organization's real development standards: one global convention document lives in TaskMate, each repository contributes its own `CONVENTIONS.md` through fs-gw, both reach every SDLC solution prompt, and conflicts between them are surfaced instead of silently resolved.
**Requirements**: SDLC-CONV-01, SDLC-CONV-02, SDLC-CONV-03, SDLC-CONV-04, SDLC-CONV-05, SDLC-CONV-06
**Depends on:** Phases 26 and 29 (needs the tool-aware composer and the fs-gw client)
**Success Criteria** (what must be TRUE):

1. User can create and edit one global convention document in Settings; it persists with canonical app data and survives reload and backup.
2. A project bound to a repository reads that repository's `CONVENTIONS.md` through fs-gw; a project without a repository or without the file still generates solutions using the global document alone.
3. Every SDLC solution/artifact turn carries both convention sources in the composed prompt — global first, repository last — inside a delimited, data-not-instructions segment that cannot override the safety policy.
4. When a global rule and a repository rule conflict, the AI names both sources and the conflict; it does not pick one silently, and the witness case is covered by a test.
5. The intake step shows which conventions are in effect (global present/absent, repository present/absent, last-read time) before the solution is generated.
6. A generated SOLUTION observably follows an in-effect convention the user never restated — proven by an exemplar test that asserts the mandated rule appears in the output.

**Plans:** 4/4 plans executed (COMPLETE)
**UI hint**: yes

Plans:

**Wave 1** *(depends on Phase 29; edits Settings and Dexie/SQLite settings)*

- [x] 31-01-PLAN.md — Global convention document: schema, Settings editor, persistence, backup inclusion

**Wave 2** *(depends on 31-01; depends on Phase 29 fs-gw client)*

- [x] 31-02-PLAN.md — Repository `CONVENTIONS.md` read through fs-gw, per-project binding, absence-tolerant loading

**Wave 3** *(depends on 31-02 and Phase 26 composer; edits `sdlcPromptComposer.ts` and `ProjectSdlcView.tsx`)*

- [x] 31-03-PLAN.md — Convention prompt segment (global → repo → conflict rule), intake visibility of in-effect sources

**Wave 4** *(depends on 31-03)*

- [x] 31-04-PLAN.md — Conflict-surfacing + convention-following exemplar tests and an intake-status regression

### Phase 31.1: Enterprise Systems Catalog & CR Transformation (INSERTED)

**Goal:** Establish an Enterprise System Catalog with hierarchical parent-child systems (e.g. SmartCard -> accounting-service, credit-service, cardappdb) where physical systems own SSH and repository configurations, and transform the "Project" domain entity into "Change Request (CR)" with 3 types (New Feature, Enhancement, Bugfix) impacting 1..N systems.
**Requirements**: ENT-SYS-01, ENT-SYS-02, ENT-SYS-03, ENT-SYS-04, ENT-CR-01, ENT-CR-02
**Depends on:** Phase 31
**Success Criteria** (what must be TRUE):

1. IndexedDB schema version upgrade adds `systems` table (supporting hierarchical parent/child links, SSH host, and repo path) and migrates existing `projects` records safely into `changeRequests` with `targetSystemIds: string[]`.
2. Dedicated System Catalog UI supports full CRUD for logical parent systems and deployable child subsystems (services, schemas, UIs), allowing editing, reparenting, and SSH/repo binding at any time.
3. Project management UI is rebranded and restructured as CR (Change Request) management with 3 explicit types: New Feature, Enhancement, Bugfix, and allows selecting 1 or more target subsystems.
4. Tasks and checklists remain intact, explicitly linked to the parent CR.
5. SDLC Studio and AI Chat Drawer automatically resolve SSH connections, repo paths, and conventions from the selected CR's target systems without redundant global configuration.

**Plans:** 4/4 plans complete
**UI hint**: yes

Plans:

**Wave 1**

- [x] 31.1-01-PLAN.md — Schema migration: `systems` table, `changeRequests` entity model, and safe data migration from `projects`

**Wave 2** *(depends on 31.1-01)*

- [x] 31.1-02-PLAN.md — System Catalog management UI: hierarchical tree view, CRUD modal, SSH/repo binding configuration

**Wave 3** *(depends on 31.1-02)*

- [x] 31.1-03-PLAN.md — CR management UI overhaul: Project -> CR terminology, 3 CR types, multi-system selector, and task linkage

**Wave 4** *(depends on 31.1-03)*

- [x] 31.1-04-PLAN.md — SDLC Studio & AI Chat multi-system wiring: auto-load SSH and conventions from CR target systems, E2E verification

### Phase 31.2: Enterprise Systems Catalog and CR Normalization (INSERTED)

**Goal:** Chuẩn hoá toàn diện mô hình "TaskMate xoay quanh CR": khai tử `Project`/`Milestone` (Task trỏ trực tiếp `crId` + `systemId?`); System Catalog phân định Logical Parent (không repo/SSH/CR) vs Subsystem (đúng 1 repo remote SSH); SystemDetailView dạng tab + 1-click Git/Terminal; CR Detail View mới; SDLC Studio bỏ hẳn màn cấu hình Repo & SSH, thay bằng view quan sát read-only "Subsystems & Repos", Subsystem Context Bar dùng chung, Step 2 phân tách giải pháp theo Subsystem, Step 4 pack từng Subsystem + Pack All; AI đề xuất subsystem ảnh hưởng có xác nhận của user.
**Requirements**: ENT-NORM-01, ENT-NORM-02, ENT-NORM-03, ENT-NORM-04, ENT-NORM-05, ENT-NORM-06
**Depends on:** Phase 31.1
**Success Criteria** (what must be TRUE):

1. Không còn `projects`/`milestones` trong schema, types, code hay test; `Task.crId` bắt buộc và `Task.systemId` (nếu có) luôn thuộc `cr.targets`; `cr.targets` chỉ chứa subsystem, không chứa Logical Parent. Mọi surface daily (Tasks view, TaskDrawer, filter, chat scope, backup, notifications, standup, planner, palette, export) đã chuyển sang CR/Subsystem; backup định dạng cũ bị từ chối rõ ràng.
2. System Catalog enforce bất biến: Logical Parent không có SSH/repo và không có nút tạo CR; Subsystem có đúng 1 repo remote SSH; tạo CR từ Subsystem tự điền sẵn subsystem đó.
3. SystemDetailView có 4 tab (Overview / Subsystems / Impacted CRs / Git & Branches) và mỗi Subsystem có 1-click mở Remote Git Explorer và SSH Terminal đúng repo.
4. CR Explorer là tool window mặc định (Alt+1) hiển thị CR → Subsystem → Task, không còn tầng Milestone; click CR mở tab CR Detail với bảng Task có cột Subsystem và nút mở SDLC Studio.
5. SDLC Studio không còn cấu hình Repo & SSH; có view read-only "Subsystems & Repos"; Subsystem Context Bar dùng chung cho Step 3/4; Step 2 sinh solution phân mục theo từng Subsystem; Step 4 pack riêng từng Subsystem và Pack All có báo cáo lỗi từng phần.
6. Khi CR chưa gán hoặc thiếu subsystem, AI đề xuất subsystem ảnh hưởng kèm lý do và độ tin cậy; chỉ ghi vào CR sau khi user xác nhận.

**Plans:** 24/24 plans complete
**UI hint**: yes

Plans:

**Wave 1** *(no dependencies — data contract)*

- [x] 31.2-01-PLAN.md — Domain types + Zod: `CrTarget`, required `code`, `Task.crId`/`systemId`, System shape invariants
- [x] 31.2-02-PLAN.md — Dexie V16: drop `projects`/`milestones`, re-axis tasks, migrate CR targets, purge legacy chat scopes + SSH bindings

**Wave 2** *(depends on Wave 1 — repo invariants)*

- [x] 31.2-03-PLAN.md — `isLogicalParent`/`isSubsystem` predicates, System/CR/Task invariant enforcement, CR cascade replacement
- [x] 31.2-04-PLAN.md — Re-axis tag, document-link, document-set, chat-scope, notification and work-session repos

**Wave 3** *(depends on Wave 2 — legacy deletion + utilities)*

- [x] 31.2-05-PLAN.md — Delete Project/Milestone files + `RepoConfigView`, rename SDLC view, remove the legacy SSH/repo binding
- [x] 31.2-06-PLAN.md — Real CR Explorer, shared 1-click Git/Terminal hook, layout store re-axis
- [x] 31.2-07-PLAN.md — Utility/label surfaces: filter, selection context, recurrence, notifications, standup, day insight, planner hooks

**Wave 4** *(depends on Wave 3 — daily surfaces)*

- [x] 31.2-08-PLAN.md — Tasks view/table/drawer/filter/quick-add/breadcrumb + ItemInsightView on CR/Subsystem
- [x] 31.2-09-PLAN.md — Backup version 11, legacy payload rejection before any write
- [x] 31.2-10-PLAN.md — AI tools, grounding and chat scope on CR/System
- [x] 31.2-11-PLAN.md — Dashboard, timer, planner, palette, notes, search, docx exports
- [x] 31.2-12-PLAN.md — Fix the parent predicate at all 7 sites, divergent Catalog action sets, pre-filled CR creation

**Wave 5** *(depends on Wave 4 — new views)*

- [x] 31.2-13-PLAN.md — `ChangeRequestDetailView` + `cr_detail` tab renderer
- [x] 31.2-14-PLAN.md — `SystemDetailView` 4 tabs with 1-click Git/Terminal
- [x] 31.2-15-PLAN.md — `SubsystemsReposPanel` (read-only) + `SubsystemContextBar` shared by Step 3/4

**Wave 6** *(depends on Wave 5 — SDLC content)*

- [x] 31.2-16-PLAN.md — Step 2 per-subsystem solution contract + Step 3 branch from `cr.targets`
- [x] 31.2-17-PLAN.md — Step 4 per-subsystem pack cards + Pack All with partial-failure reporting

**Wave 7** *(depends on Wave 6 — AI proposal)*

- [x] 31.2-18-PLAN.md — `propose_subsystems` tool (6 registration points) + `SubsystemProposalCard` confirm-only write

**Wave 8** *(depends on Wave 7 — test sweep)*

- [x] 31.2-19-PLAN.md — Wave 0 suites, legacy test deletion, survivor rewrites, repo-wide `tsc --noEmit` gate

### Phase 32: External Research via Claude Code Headless

**Goal:** When internal evidence is insufficient the AI proposes research instead of guessing; after explicit confirmation it runs Claude Code headless through fs-gw over both the web and the repository, stores a sourced EXTERNAL-marked report, and combines it with internal evidence in the resulting solution.
**Requirements**: SDLC-RES-01, SDLC-RES-02, SDLC-RES-03, SDLC-RES-04, SDLC-RES-05, SDLC-RES-06
**Depends on:** Phases 26, 29, 31 (needs the tool-aware composer, fs-gw execution, and convention context)
**Success Criteria** (what must be TRUE):

1. When internal evidence cannot answer a solution question, the AI proposes research naming the specific questions it would research, and performs none until the user explicitly confirms.
2. A confirmed research run executes Claude Code headless through fs-gw over web and repository, streams its progress into the UI, and can be stopped without orphaned processes.
3. The report is stored as a project/CR-scoped artifact with findings, per-claim sources, and a scope marker distinguishing web findings from repository findings.
4. Research findings enter the composed prompt as an explicitly EXTERNAL-marked evidence class that never outranks internal evidence without saying so, and external claims stay attributable in the generated solution.
5. When fs-gw is not running, the AI states research is unavailable and offers to continue on internal evidence alone; it never substitutes unmarked model knowledge.
6. Research artifacts appear in the step where they were produced, persist with the CR, and can be reopened and reused in later steps without re-running.

**Plans:** 6/6 plans complete
**UI hint**: yes

Plans:

**Wave 1** *(no dependencies; edits Tauri SSH backend and `sshService.ts`)*

- [x] 32-01-PLAN.md — Non-PTY line streaming over SSH (`ssh_exec_stream`) with PID capture and SIGTERM stop (`ssh_kill_process`)

**Wave 2** *(depends on 32-01; edits artifact repo and AI tool dispatch)*

- [x] 32-02-PLAN.md — `RESEARCH` artifact kind + versioned persistence, `propose_research` tool wired through the `executeAiTool` switch, CR-scoped target resolution

**Wave 3** *(depends on 32-02; creates `researchService.ts` schemas and pre-flight)*

- [x] 32-03-PLAN.md — Research payload schemas, shell escaping, JSON parser, SSH availability pre-flight

**Wave 4** *(32-04 depends on 32-03; 32-05 depends on 32-02 and 32-03)*

- [x] 32-04-PLAN.md — `executeMultiSystemResearch` orchestrator: sequential runs, 300s timeout, cancellation, SSH-error mapping, versioned persistence
- [x] 32-05-PLAN.md — EXTERNAL evidence class with rank disclosure and attribution; `propose_research` tool policy and unavailability message path

**Wave 5** *(depends on 32-04 and 32-05; edits SDLC Studio UI)*

- [x] 32-06-PLAN.md — Research summary card with historical version selector, manual trigger modal wired through `ChangeRequestSdlcView`, in-chat proposal/streaming/completion/error cards, Step 1 & 2 integration

### Phase 33: Prompt Transparency & Contract Documentation

**Goal:** What the composer emitted for the current step is inspectable in the app, and one written contract matches the composer with a drift test guarding it.
**Requirements**: SDLC-OBS-01, SDLC-OBS-02
**Depends on:** Phases 26, 27, 31, 32 (documents the final composer shape including conventions and research evidence)
**Success Criteria** (what must be TRUE):

1. A developer-facing view shows the current step's emitted segments, each segment's length, which tools were offered, and which convention sources were included — without reading source.
2. One documented prompt contract covers every SDLC step, every artifact intent, the convention segment, and the EXTERNAL research evidence segment; it matches what the composer emits, and a test fails when the two drift apart.

**Plans:** 2 plans in 2 waves
**UI hint**: yes

Plans:

**Wave 1** *(depends on Phases 26–27, 31–32)*

- [ ] 33-01-PLAN.md — Composer inspection view: segments, lengths, offered tools, and convention sources for the current step

**Wave 2** *(depends on 33-01)*

- [ ] 33-02-PLAN.md — Prompt contract document for all steps, artifact intents, convention segment, and EXTERNAL evidence, plus drift-detection test
