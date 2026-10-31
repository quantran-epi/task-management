# Project Roadmap

## Active Phase

- Phase 25.1: SDLC Flow Hardening & Multi-Tab AI Chat Isolation

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
  6. PL03 reports the reconciliation as four sections (as-approved design, actual implementation, drift matrix, DB changes + rollback); PL07 and the CAB summary are generated from the same thread context without re-supplying inputs.

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

- [ ] 25.1.1-11-PLAN.md — Regressions sweep: safety-gate list repaired, every Phase 25.1 guarantee re-run scoped, real-function proofs recorded, evidence written up
