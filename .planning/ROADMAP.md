# Project Roadmap

## Active Phase

- Phase 25.1.1: Unify SDLC workflow into the hub, retire the wizard (COMPLETE — verified 2026-11-01)
- Phase 25.1.2: Fix the SDLC hub user flow end to end (COMPLETE — verified 2026-11-01)
- Phase 25.2: Fix TaskMate mutation flow & standardize AI Core Engine for SDLC Studio (COMPLETE)
- Phase 25.3: SDLC Workflow Engine Hardening, Unified AI Chat Widget & Prompt Architecture (COMPLETE)
- Phase 26: SDLC Prompt Grounding & Tool-Use Policy (NOT STARTED — v1.3)
- Phase 27: Studio Artifact Tools & Diff Approval (v1.3)
- Phase 28: Query-Only Knowledge Retrieval (v1.3, parallel-capable)
- Phase 29: fs-gw Client & Headless Repository Runs (v1.3)
- Phase 30: Automatic Change Packs, Fallback & Run Reliability (v1.3)
- Phase 31: Organization Conventions in the Solution Pipeline (v1.3)
- Phase 32: External Research via Claude Code Headless (v1.3)
- Phase 33: Prompt Transparency & Contract Documentation (v1.3)

## Milestone: Knowledge System Implementation

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

Plans:

**Wave 1**
- [ ] 25.4-01-PLAN.md — Khung Workbench & Light Theme (`tokens.css`, `TitleBar`, `Stripe`, `StatusBar`, `layoutStore.ts` Zustand)

**Wave 2** *(depends on 25.4-01)*
- [ ] 25.4-02-PLAN.md — Tích hợp Views hiện có vào các Slots (`AntdThemeAdapter`, Left slot, Center Editor Area, Bottom slot)

**Wave 3** *(depends on 25.4-02)*
- [x] 25.4-03-PLAN.md — Search Everywhere (`Double Shift` / `Ctrl+K`) & Centralized Keymaps Registry

**Wave 4** *(depends on 25.4-03)*
- [ ] 25.4-04-PLAN.md — Tối ưu hiệu năng ảo hóa (@tanstack/react-virtual) & Switchover test (`AppIntelliJ.tsx`)

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

- [ ] 27-01-PLAN.md — `get_artifact` read tool with section index and `patch_artifact_section` diff tool (no editor write)

**Wave 2** *(depends on 27-01; edits `AiChatWidget` and `StepChatPanel`)*

- [ ] 27-02-PLAN.md — Artifact-diff approval card: added/removed rendering, approve/reject, transcript decision record

**Wave 3** *(depends on 27-02; edits SDLC host handlers)*

- [ ] 27-03-PLAN.md — Approve writes editor draft, marks step stale via existing revision rules, and never commits a version

**Wave 4** *(depends on 27-03)*

- [ ] 27-04-PLAN.md — Intent routing regression: small "add this content" request produces get + patch and a bounded diff

**Wave 5** *(depends on 27-01)*

- [ ] 27-05-PLAN.md — Read-only and prerequisite guards: refused in preview/historical, allowed in active CR, blocked without prerequisite artifact

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

### Phase 29: fs-gw Client & Headless Repository Runs

**Goal:** TaskMate can drive a real repository through fs-gw — health, process execution and streaming, opt-in per project, and a dedicated git worktree — without ever spawning repo processes itself.
**Requirements**: SDLC-REPO-01, SDLC-REPO-02, SDLC-REPO-03, SDLC-REPO-06
**Depends on:** Phase 26
**Success Criteria** (what must be TRUE):

1. A gateway that is down reports "unavailable" and never throws an unhandled error; health, `exec/run`, and `exec/stream` are typed and support timeouts and cancellation.
2. Repository operations are opt-in per project with a configured path; TaskMate performs no repository write before the user starts a coding run.
3. A coding run builds its prompt from the approved SOLUTION and step context, streams stdout/stderr/exit into the UI, and can stop the process tree.
4. Before a run, a dedicated worktree is created or reused and its path, branch, and base commit are reported; after the run, `git status` and `git diff` are visible for review.
**UI hint**: yes

**Plans:** 4 plans in 4 waves

Plans:

**Wave 1** *(no dependencies; new `src/services/fsGateway/`)*

- [ ] 29-01-PLAN.md — Typed fs-gw client: health, `exec/run`, `exec/stream` SSE, timeout, cancellation, unavailable status

**Wave 2** *(depends on 29-01; edits project settings and SDLC step 3 host)*

- [ ] 29-02-PLAN.md — Per-project opt-in repository path and write boundary; no write before run start

**Wave 3** *(depends on 29-02)*

- [ ] 29-03-PLAN.md — Worktree create/reuse through fs-gw, reported path/branch/base commit, post-run status and diff

**Wave 4** *(depends on 29-03)*

- [ ] 29-04-PLAN.md — Claude Code headless run from approved SOLUTION, streamed output, process-tree stop

### Phase 30: Automatic Change Packs, Fallback & Run Reliability

**Goal:** A completed coding run produces a change pack from the real repository diff in the existing format, the manual script remains an explicit fallback, and failure paths leave no orphans or half-written artifacts.
**Requirements**: SDLC-REPO-04, SDLC-REPO-05, SDLC-REPO-07
**Depends on:** Phase 29
**Success Criteria** (what must be TRUE):

1. After a run, a change pack is generated from the real diff (modified/added/deleted paths, git hunks, SQL artifacts) in the existing format, and step 4 validation/drift consumes it unchanged.
2. The manual `generate-change-pack.mjs` script is presented as a labelled fallback used only when fs-gw is unavailable or the run produced no diff — never as a silent default.
3. Stream disconnect, gateway crash mid-run, process kill, worktree cleanup failure, and a stale re-run all end without orphaned processes or half-written artifacts, and the failure state is visible.
4. An end-to-end walkthrough goes approved SOLUTION → coding run → automatic pack → step 4 drift without a manually built zip.
**UI hint**: yes

**Plans:** 4 plans in 4 waves

Plans:

**Wave 1** *(depends on Phase 29; edits change-pack services)*

- [ ] 30-01-PLAN.md — Change-pack generator from real diff, preserving the existing manifest/entry format

**Wave 2** *(depends on 30-01; edits SDLC step 3/4 host)*

- [ ] 30-02-PLAN.md — Explicitly labelled manual-script fallback and its trigger conditions

**Wave 3** *(depends on 30-01)*

- [ ] 30-03-PLAN.md — Failure/recovery hardening: disconnect, crash, kill, cleanup, stale re-run without orphans

**Wave 4** *(depends on 30-02 and 30-03)*

- [ ] 30-04-PLAN.md — End-to-end acceptance: SOLUTION → run → auto pack → step 4 drift with no manual zip

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

**Plans:** 4 plans in 4 waves
**UI hint**: yes

Plans:

**Wave 1** *(depends on Phase 29; edits Settings and Dexie/SQLite settings)*

- [ ] 31-01-PLAN.md — Global convention document: schema, Settings editor, persistence, backup inclusion

**Wave 2** *(depends on 31-01; depends on Phase 29 fs-gw client)*

- [ ] 31-02-PLAN.md — Repository `CONVENTIONS.md` read through fs-gw, per-project binding, absence-tolerant loading

**Wave 3** *(depends on 31-02 and Phase 26 composer; edits `sdlcPromptComposer.ts` and `ProjectSdlcView.tsx`)*

- [ ] 31-03-PLAN.md — Convention prompt segment (global → repo → conflict rule), intake visibility of in-effect sources

**Wave 4** *(depends on 31-03)*

- [ ] 31-04-PLAN.md — Conflict-surfacing + convention-following exemplar tests and an intake-status regression

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

**Plans:** 4 plans in 4 waves
**UI hint**: yes

Plans:

**Wave 1** *(depends on Phase 29 fs-gw client; edits research service and artifact repo)*

- [ ] 32-01-PLAN.md — Research proposal gate (explicit confirmation), Claude Code headless research run over web + repo, stop handling

**Wave 2** *(depends on 32-01; edits artifact persistence and step chat)*

- [ ] 32-02-PLAN.md — Sourced research artifact (findings, sources, web/repo scope marker) persisted per CR and rendered in its step

**Wave 3** *(depends on 32-02 and Phase 26 composer; edits `sdlcPromptComposer.ts`)*

- [ ] 32-03-PLAN.md — EXTERNAL evidence class in the prompt with rank disclosure and attribution; fs-gw-unavailable message path

**Wave 4** *(depends on 32-03)*

- [ ] 32-04-PLAN.md — Reuse-in-later-steps, proposal-gate, and unavailable-gateway regression tests

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
