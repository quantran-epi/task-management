# Milestone v1.3 Requirements

**Milestone:** v1.3 SDLC Closed-Loop Engine & Repository Autonomy
**Goal:** Turn SDLC Studio into a real AI-agent loop — prompt architecture with a working tool-use policy, chat turns that edit studio artifacts through reviewable diffs, query-only knowledge retrieval, and repository coding through fs-gw + Claude Code headless.
**Defined:** 2026-11-03
**Core Value:** Make planned work realistically fit available time while giving the personal user evidence-grounded access to their local banking IT knowledge.

## Requirements

### SDLC Prompt Architecture (SDLC-PR)

- [x] **SDLC-PR-01**: Every SDLC turn carries real grounding — the project SDLC view supplies `stepGroundingContext` built from the step's own artifacts (PL01/PL02, pinned SOLUTION, change-pack manifest, prior tech docs, CR metadata) plus bounded retrieved evidence; an empty-grounding turn is impossible from the production view.
- [x] **SDLC-PR-02**: The composer emits a per-step tool-use policy layer naming which tools are available in that step and when to call them (`query_notes`, `search_knowledge_base`, `retrieve_knowledge`, `read_file`, read-only MCP tools, artifact tools), including "call again with a narrower query when evidence is thin" and "do not answer from memory when a tool could resolve it".
- [ ] **SDLC-PR-03**: Artifact output contracts are selected from the turn's real intent — SOLUTION, PL03B, PL07, and CAB each reach their own contract — and `StepChatPanel` no longer hardcodes `artifact: 'SOLUTION'`.
- [x] **SDLC-PR-04**: Few-shot exemplars cover, per step, at least one tool-calling turn and one evidence-insufficient turn, so the model sees how to combine retrieval with an answer.
- [x] **SDLC-PR-05**: The composed system prompt stays layered and ordered (policy → step contract → tool policy → few-shot → grounding → output contract → language rule); an existing test asserts no step or grounding text can precede the policy layer.
- [ ] **SDLC-PR-06**: The tool loop is bounded and observable: multi-round tool calls run up to an explicit per-turn limit, every call shows in the widget's tool-activity list, and hitting the limit ends the turn with a visible "evidence gathering stopped" status instead of silently truncating.

### Studio Artifact Tools (SDLC-ART)

- [x] **SDLC-ART-01**: A read tool (`get_artifact`) returns the current artifact for a step — kind, version, approval state, full Markdown, and a stable section index — so the model can inspect what exists before proposing edits.
- [x] **SDLC-ART-02**: A patch tool (`patch_artifact_section`) takes a target section and replacement/addition text and returns a unified diff plus the resulting Markdown, without writing to the editor.
- [x] **SDLC-ART-03**: The studio chat renders an artifact-diff approval card for every patch tool result: the user sees added/removed lines, can approve (writes the editor draft) or reject (leaves the editor untouched), and the decision is recorded in the transcript.
- [x] **SDLC-ART-04**: Approving a patch updates the step editor draft and marks the step stale, following the existing revision/staleness rules; it never commits a version, claims approval, or claims the document was saved.
- [x] **SDLC-ART-05**: "Add this content to the solution" style requests resolve to `get_artifact` + `patch_artifact_section` rather than regenerating the whole document, and a regression test proves a small addition produces a bounded diff.
- [x] **SDLC-ART-06**: Artifact tools respect read-only rules — refused in preview/historical versions, available in the active CR, and blocked when the prerequisite artifact for that step does not exist.

### Knowledge Retrieval (SDLC-RET)

- [ ] **SDLC-RET-01**: `retrieve_knowledge` accepts a query and `limit` only and no longer requires a locally derived set ID list; a machine with no local documents still retrieves.
- [ ] **SDLC-RET-02**: The knowledge server federates a query-only request across every published set and returns which sets and snapshots answered, alongside existing evidence, entities, paths, and warnings.
- [ ] **SDLC-RET-03**: Query-only requests keep the existing trust guarantees: bounded budgets, single-snapshot path closure, citation IDs, and degraded/unavailable outcomes reported truthfully.
- [ ] **SDLC-RET-04**: When no published set exists the response is a clear, actionable message (not a generic exception), and the client surfaces it in AI Chat, SDLC step chat, and Telegram identically.
- [ ] **SDLC-RET-05**: An explicit set restriction remains available for callers that already know their sets (for example project-scoped SDLC evidence), but it is optional and never the default.

### Repository Autonomy via fs-gw (SDLC-REPO)

- [ ] **SDLC-REPO-01**: A TaskMate fs-gw client in `src/services/fsGateway/` provides health check, `exec/run`, and `exec/stream` (SSE) with typed request/response models, timeouts, and cancellation; an unreachable gateway is reported unavailable, never thrown as an unhandled error.
- [ ] **SDLC-REPO-02**: SDLC coding runs Claude Code headless inside a real repository worktree through fs-gw — TaskMate builds the prompt from the approved SOLUTION and step context, streams stdout/stderr/exit into the UI, and can stop the process tree.
- [ ] **SDLC-REPO-03**: Before a coding run, TaskMate creates or reuses a dedicated git worktree through fs-gw and reports the worktree path, branch, and base commit; after the run it exposes `git status` and `git diff` output for review.
- [ ] **SDLC-REPO-04**: A change pack is generated automatically from the real repository diff (modified, added, deleted paths, git hunks, SQL artifacts) and written in the existing change-pack format, so downstream validation and drift reconciliation consume it unchanged.
- [ ] **SDLC-REPO-05**: The manual `generate-change-pack.mjs` script remains an explicit, labelled fallback used only when fs-gw is unavailable or a run produced no repository diff.
- [ ] **SDLC-REPO-06**: Repository operations are opt-in per project with a configured repository path; TaskMate performs no repository write before the user starts a coding run, and every run's prompts, streams, and artifacts stay local.
- [ ] **SDLC-REPO-07**: Reliability checks cover stream disconnect, gateway crash mid-run, process kill, worktree cleanup on failure, and re-running a step after a stale check, without leaving orphaned processes or half-written artifacts.

### Organization Conventions (SDLC-CONV)

- [ ] **SDLC-CONV-01**: User can maintain one global convention document in TaskMate carrying the rules every system must follow (org standards, unwritten conventions, internal process rules), editable in Settings and stored locally with the app's canonical data.
- [ ] **SDLC-CONV-02**: Each project can bind a repository, and its `CONVENTIONS.md` is read through fs-gw and treated as that repository's own rules; a project without a repository or without the file still works with the global document alone.
- [ ] **SDLC-CONV-03**: Every SDLC solution/artifact turn carries both convention sources in the composed prompt — global first, repository last — in a clearly delimited, untrusted-data-framed segment that cannot be mistaken for instructions overriding the safety policy.
- [ ] **SDLC-CONV-04**: When a global rule and a repository rule conflict, the AI names the conflict with both sources and does not silently pick one; the composed prompt states this rule explicitly.
- [ ] **SDLC-CONV-05**: The intake step shows which conventions are in effect (global file present/absent, repository file present/absent, last-read time), so the user knows the basis before the solution is generated.
- [ ] **SDLC-CONV-06**: Generated solutions follow the in-effect conventions observably — an exemplar test proves a convention (for example a mandated layering or logging rule) appears in a generated SOLUTION without the user restating it.

### External Research (SDLC-RES)

- [ ] **SDLC-RES-01**: When internal evidence cannot answer a solution question, the AI proposes research with the specific questions it would research, and performs none until the user explicitly confirms.
- [ ] **SDLC-RES-02**: A confirmed research run executes Claude Code headless through fs-gw over both the web and the repository, streams its progress into the UI, and can be stopped without leaving orphaned processes.
- [ ] **SDLC-RES-03**: The research result is stored as a project/CR-scoped artifact containing findings, per-claim sources, and a scope marker showing which part came from the web and which from the repository.
- [ ] **SDLC-RES-04**: Research findings enter the composed prompt as an explicitly EXTERNAL-marked evidence class that never outranks internal evidence without saying so, and every external claim remains attributable to its source in the generated solution.
- [ ] **SDLC-RES-05**: Research is unavailable when fs-gw is not running; the AI says so and offers to continue on internal evidence alone instead of silently substituting model knowledge.
- [ ] **SDLC-RES-06**: Research artifacts persist with the CR, appear in the step where they were produced, and can be reopened and re-used in later steps without re-running the research.

### SDLC Prompt & Tool Transparency (SDLC-OBS)

- [ ] **SDLC-OBS-01**: A developer-facing view shows exactly what the SDLC composer emitted for the current step (which segments, how long each is, which tools were offered, which convention sources were included), so prompt changes are inspectable without reading source.
- [ ] **SDLC-OBS-02**: The current prompt contract for every SDLC step and artifact intent is documented in one file that matches what the composer emits, with a test that fails when they drift.

## Future Requirements (Deferred)

- **FUTR-SDLC-01**: Multi-agent coding runs (several worktrees in parallel) — needs reliability evidence from single-run first.
- **FUTR-SDLC-02**: Automatic merge/PR creation after a coding run — repository write scope stays limited to worktree + change pack for now.
- **FUTR-SDLC-03**: Retrieval over a shared team corpus — current milestone remains single-user.

## Out of Scope

| Feature | Reason |
|---------|--------|
| TaskMate spawning repo processes itself (git/claude) via Tauri Rust | EDR policy blocks headless child processes; all repository work goes through fs-gw. |
| Rewriting the shared `AiChatWidget` or chat runtime | The shared widget already works for both hosts; this milestone extends host adapters, not the widget core. |
| New third-party dependencies for fs-gw integration | `fetch` + `EventSource` cover the gateway protocol; no new npm packages. |
| Storing repository credentials or tokens in TaskMate | Coding runs target a local worktree through a local gateway; no remote auth involved. |
| Replacing the strict-JSON wizard-stage prompts for PL03B/PL07/CAB with free-form chat | Structured generation stays; only the chat composer and its artifact selection change. |
| Live multi-user sync of studio artifacts | Personal single-user app; local persistence remains canonical. |

## Traceability

| Requirement | Phase | Status |
|---|---|---|
| SDLC-PR-01 | Phase 26 | Complete |
| SDLC-PR-02 | Phase 26 | Complete |
| SDLC-PR-03 | Phase 26 | Pending |
| SDLC-PR-04 | Phase 26 | Complete |
| SDLC-PR-05 | Phase 26 | Complete |
| SDLC-PR-06 | Phase 26 | Pending |
| SDLC-ART-01 | Phase 27 | Complete |
| SDLC-ART-02 | Phase 27 | Complete |
| SDLC-ART-03 | Phase 27 | Complete |
| SDLC-ART-04 | Phase 27 | Complete |
| SDLC-ART-05 | Phase 27 | Complete |
| SDLC-ART-06 | Phase 27 | Complete |
| SDLC-RET-01 | Phase 28 | Pending |
| SDLC-RET-02 | Phase 28 | Pending |
| SDLC-RET-03 | Phase 28 | Pending |
| SDLC-RET-04 | Phase 28 | Pending |
| SDLC-RET-05 | Phase 28 | Pending |
| SDLC-REPO-01 | Phase 29 | Pending |
| SDLC-REPO-02 | Phase 29 | Pending |
| SDLC-REPO-03 | Phase 29 | Pending |
| SDLC-REPO-04 | Phase 30 | Pending |
| SDLC-REPO-05 | Phase 30 | Pending |
| SDLC-REPO-06 | Phase 29 | Pending |
| SDLC-REPO-07 | Phase 30 | Pending |
| SDLC-CONV-01 | Phase 31 | Pending |
| SDLC-CONV-02 | Phase 31 | Pending |
| SDLC-CONV-03 | Phase 31 | Pending |
| SDLC-CONV-04 | Phase 31 | Pending |
| SDLC-CONV-05 | Phase 31 | Pending |
| SDLC-CONV-06 | Phase 31 | Pending |
| SDLC-RES-01 | Phase 32 | Pending |
| SDLC-RES-02 | Phase 32 | Pending |
| SDLC-RES-03 | Phase 32 | Pending |
| SDLC-RES-04 | Phase 32 | Pending |
| SDLC-RES-05 | Phase 32 | Pending |
| SDLC-RES-06 | Phase 32 | Pending |
| SDLC-OBS-01 | Phase 33 | Pending |
| SDLC-OBS-02 | Phase 33 | Pending |

**Coverage:**

- v1 requirements: 38 total
- Mapped to phases: 38
- Unmapped: 0 ✓

**Phase totals:**

- Phase 26 (SDLC Prompt Grounding & Tool-Use Policy): 6 requirements, 4 plans
- Phase 27 (Studio Artifact Tools & Diff Approval): 6 requirements, 5 plans
- Phase 28 (Query-Only Knowledge Retrieval): 5 requirements, 4 plans
- Phase 29 (fs-gw Client & Headless Repository Runs): 4 requirements, 4 plans
- Phase 30 (Automatic Change Packs, Fallback & Run Reliability): 3 requirements, 4 plans
- Phase 31 (Org Conventions in the Solution Pipeline): 6 requirements, ~4 plans
- Phase 32 (External Research via Claude Code): 6 requirements, ~4 plans
- Phase 33 (Prompt Transparency & Contract Documentation): 2 requirements, 2 plans

**Mapping changes vs initial proposal:** SDLC-REPO-06 moved from Phase 30 to Phase 29 so per-project opt-in and the repository path exist before any run or change-pack work relies on them. SDLC-CONV and SDLC-RES were added after the initial roadmap and occupy Phases 31–32; SDLC-OBS moved from Phase 31 to Phase 33 so it documents the final composer shape after conventions and research exist.

---
*Requirements defined: 2026-11-03*
*Last updated: 2026-11-03 — added SDLC-CONV (6) and SDLC-RES (6); total 38 requirements across Phases 26–33*
