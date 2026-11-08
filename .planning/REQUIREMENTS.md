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

### Repository Autonomy via Native SSH (SDLC-REPO)

- [ ] **SDLC-REPO-01**: SDLC Step 3 leverages existing Tauri native SSH service to connect to the remote host/WSL repo, supporting configured SSH profile selection and connection status verification.
- [ ] **SDLC-REPO-02**: Step 3 inspects remote git branch for the active CR (default `feature/{crCode}`), fetching commit log (`git log $BASE..HEAD`) and changed files diff summary (`git diff --stat`) for review.
- [ ] **SDLC-REPO-03**: Step 3 provides a visual diff & commit review UI (commits timeline, files changed with status +/~/-, inline diff) allowing user approval before proceeding to Step 4.
- [x] **SDLC-REPO-04**: Step 4 automatically collects git diff and required file contents (sql/*, new-files/*) over SSH, packaging an in-memory change pack zip via JSZip conforming to ChangePackManifestSchema.
- [x] **SDLC-REPO-05**: Step 4 immediately runs `validateHubChangePack` and triggers drift reconciliation against the approved SOLUTION, while keeping manual zip dropzone as an explicit fallback.
- [ ] **SDLC-REPO-06**: Repository SSH configurations respect native keyring credentials, opt-in per project, and never perform destructive write operations without explicit confirmation.
- [x] **SDLC-REPO-07**: Edge-case handling covers uncommitted changes warning, SSH timeout/disconnect, large diff size limits (< 5MB limit), and invalid CR metadata mismatch.

### Organization Conventions (SDLC-CONV)

- [x] **SDLC-CONV-01**: User can maintain one global convention document in TaskMate carrying the rules every system must follow (org standards, unwritten conventions, internal process rules), editable in Settings and stored locally with the app's canonical data.
- [x] **SDLC-CONV-02**: Each project can bind a repository, and its `CONVENTIONS.md` is read through fs-gw and treated as that repository's own rules; a project without a repository or without the file still works with the global document alone.
- [x] **SDLC-CONV-03**: Every SDLC solution/artifact turn carries both convention sources in the composed prompt — global first, repository last — in a clearly delimited, untrusted-data-framed segment that cannot be mistaken for instructions overriding the safety policy.
- [x] **SDLC-CONV-04**: When a global rule and a repository rule conflict, the AI names the conflict with both sources and does not silently pick one; the composed prompt states this rule explicitly.
- [x] **SDLC-CONV-05**: The intake step shows which conventions are in effect (global file present/absent, repository file present/absent, last-read time), so the user knows the basis before the solution is generated.
- [x] **SDLC-CONV-06**: Generated solutions follow the in-effect conventions observably — an exemplar test proves a convention (for example a mandated layering or logging rule) appears in a generated SOLUTION without the user restating it.

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

### Enterprise Systems Catalog & CR Normalization (ENT-NORM, Phase 31.2 INSERTED)

- [ ] **ENT-NORM-01**: `projects` and `milestones` no longer exist in schema, types, code or tests; `Task.crId` is required, `Task.systemId` is optional and must always belong to `cr.targets`; `cr.targets` is a `CrTarget[]` of `{ systemId, featureBranch? }` accepting only deployable subsystems, never a logical parent. Every daily surface (Tasks view, TaskDrawer, TaskFilterBar, chat scope, backup, notifications, standup, planner, command palette, doc export) reads CR/Subsystem instead, and a legacy backup containing `projects`/`milestones` is rejected with a clear message.
- [ ] **ENT-NORM-02**: System Catalog enforces the invariants — a logical parent has no SSH/repo/base-branch and offers no "create CR" action; a subsystem binds exactly one remote SSH repo; creating a CR from a subsystem pre-selects that subsystem.
- [ ] **ENT-NORM-03**: SystemDetailView is a 4-tab view (Overview / Subsystems / Impacted CRs / Git & Branches), and every subsystem offers one-click open of the Remote Git Explorer and one-click open of an SSH Terminal at its repo path.
- [ ] **ENT-NORM-04**: CR Explorer is the default left tool window (Alt+1) showing CR → Subsystem → Task with no Milestone tier; clicking a CR opens a CR Detail tab whose task table has a Subsystem column and a prominent "Open SDLC Studio" action.
- [ ] **ENT-NORM-05**: SDLC Studio has no repo/SSH configuration surface; it shows a read-only "Subsystems & Repos" view, a shared Subsystem Context Bar driving Step 3 and Step 4, a Step 2 solution split into per-subsystem sections, and a Step 4 that packs per subsystem plus Pack All with per-subsystem failure reporting.
- [ ] **ENT-NORM-06**: When a CR has no or too few target subsystems, the AI proposes affected subsystems with reasons and confidence; nothing is written to the CR until the user confirms.

### IntelliJ ExpUI Workbench Migration (Phase 25.4 INSERTED)

- [ ] **EXPUI-01**: User can boot TaskMate in IntelliJ ExpUI Islands Light workbench via `src/AppIntelliJ.tsx` side-by-side with zero changes to `src/db/*`, `src/services/*`, or `src/domain/*`.
- [ ] **EXPUI-02**: System renders OpenIDEA Islands Light palette and tokens with compact light Ant Design adapters (`#3871e1` accent, compact controls).
- [ ] **EXPUI-03**: User can resize and collapse docking slots (left, right, bottom) and stripes (32px) with persistent layout state surviving reloads.
- [ ] **EXPUI-04**: User can navigate and manage tabbed views in the center Editor Area (Tasks, Docs, Planner) and access docked tool windows (Project Tree, AI Chat).
- [x] **EXPUI-05**: User can invoke Search Everywhere modal via `Double Shift` or `Ctrl+K` to search entities and dispatch actions at 60fps virtualized performance.

### Remote SSH Git Explorer & Headful Claude Code Terminal Flow (Phase 29.1 INSERTED)

- [x] **SDLC-REPO-EXP-01**: Left Stripe provides `remote_explorer` tool window icon positioned below Diagram Explorer with persistent toggle and docking support.
- [x] **SDLC-REPO-EXP-02**: User can select saved SSH Host config, specify remote repository path (sets working directory), select git branches, and view repository tree read-only (`git ls-tree`) without dirtying remote working copy.
- [x] **SDLC-REPO-EXP-03**: User can open remote files in read-only editor tabs (`git show <ref>:<file_path>`) with code viewer and syntax highlighting to inspect repository code and files generated by Claude Code.
- [x] **SDLC-REPO-EXP-04**: Interactive Remote Terminal in Workbench Bottom Panel powered by xterm.js and Tauri SSH PTY streaming session, automatically set to repo working directory where user can run headful `claude` CLI or any shell commands.
- [x] **SDLC-REPO-EXP-05**: User can inspect Claude Code outputs/diagrams in terminal or remote files, with one-click copy or bridge to Diagram Studio (`type: 'diagram'`).

### AI Office — Employees, Teams, and Skills (AIO, Phase 34)

- [ ] **AIO-EMP-01**: Employees are global, reusable entities with name, role, persona, per-agent model, and at most one assigned skill; editing an employee changes it in every team that uses it. Leads are a separate global entity managed in their own section and selected per team.
- [ ] **AIO-EMP-02**: A team holds exactly one lead and at most three employees; at most three teams may be `active` at once, the rest are `idle`, and reactivating an idle team resumes its accumulated transcript rather than starting a new session.
- [ ] **AIO-SKILL-01**: A skill is a global `name` + `description` + Markdown `body` prompt template, managed in its own surface and assignable to at most one agent.
- [ ] **AIO-SKILL-02**: An agent's system prompt receives only the skill's `description`; the full `body` is read on demand through a `read_skill` tool and never pasted wholesale into the prompt.
- [ ] **AIO-TEAM-01**: The lead decomposes the user's request and emits an assignment plan (agent + skill + task) as a confirmation card; the batch runs only after approval, unless the team's "Tự động chia việc" bypass toggle is on.
- [ ] **AIO-TEAM-02**: The lead dispatches a batch through a single `delegate_batch([{ agentId, instruction }])` tool whose agents run concurrently (cap 3 per batch) and whose results the lead sees only after the whole batch completes; employees never choose the next speaker and cannot address each other.
- [ ] **AIO-TEAM-03**: Each agent sees its own system prompt plus persona/skill description, the lead's instruction, the original user request, the results of the other agents in its batch, its own full assignment history from this lead, and a recent-turn window — never the whole conversation.
- [ ] **AIO-TEAM-04**: The user can address any agent directly with `@agent` in the team composer; a message without a mention goes to the lead.
- [ ] **AIO-MEM-01**: One transcript per team, every message tagged by `agentId` (or lead/user), rendered as one continuous channel with avatar and agent name.
- [ ] **AIO-MEM-02**: `search_team_history({ query, limit? })` returns compact BM25 hits (turn id, agent, timestamp, kind, excerpt) and `read_team_turn({ turnId })` returns one turn's full text, using the existing local `src/utils/bm25.ts`.
- [ ] **AIO-MEM-03**: Transcript search works with the Knowledge Server stopped and the network offline — no retrieval path depends on the daemon.
- [ ] **AIO-WRITE-01**: Employee turns are structurally read-only — their tool set contains no mutation tool — while the lead holds the full read-only set plus the team tools.
- [ ] **AIO-WRITE-02**: Every lead mutation parks on the existing `MutationApprovalCard` for explicit approve/reject, and the team's auto-approve toggle still wins when enabled.
- [ ] **AIO-BUDGET-01**: The user sets a team token budget and the app suggests an even split across the lead plus every employee, editable per row; budgets accumulate for the life of the team and can be topped up at any time.
- [ ] **AIO-BUDGET-02**: At 80% of the team budget or of an agent's budget that scope pauses between tool rounds with context preserved, notifies the user, and resumes exactly where it stopped once tokens are granted — nothing is auto-aborted and no pause reads as a hang.
- [ ] **AIO-LINK-01**: A team links to N items of type CR, task, system, note, or document; the lead receives `list_linked_items()` and `get_linked_context({ itemId })` returning full retrievable content (note body, document content, CR tasks, system details), not just metadata.
- [ ] **AIO-BG-01**: Team runs continue when the user leaves the tab or switches views; returning shows the full result, each running agent streams into its own bubble with a status badge, and per-agent Stop plus a global Stop are both available.
- [ ] **AIO-UI-01**: The workbench exposes an employee tab (employees, leads, and skills) and a team page (`EditorViewType 'teams'`) with the shared team transcript workspace.

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
| SDLC-REPO-01 | Phase 29 | Complete |
| SDLC-REPO-02 | Phase 29 | Complete |
| SDLC-REPO-03 | Phase 29 | Complete |
| SDLC-REPO-04 | Phase 30 | Complete |
| SDLC-REPO-05 | Phase 30 | Complete |
| SDLC-REPO-06 | Phase 29 | Complete |
| SDLC-REPO-07 | Phase 30 | Complete |
| SDLC-CONV-01 | Phase 31 | Complete |
| SDLC-CONV-02 | Phase 31 | Complete |
| SDLC-CONV-03 | Phase 31 | Complete |
| SDLC-CONV-04 | Phase 31 | Complete |
| SDLC-CONV-05 | Phase 31 | Complete |
| SDLC-CONV-06 | Phase 31 | Complete |
| SDLC-RES-01 | Phase 32 | Pending |
| SDLC-RES-02 | Phase 32 | Pending |
| SDLC-RES-03 | Phase 32 | Pending |
| SDLC-RES-04 | Phase 32 | Pending |
| SDLC-RES-05 | Phase 32 | Pending |
| SDLC-RES-06 | Phase 32 | Pending |
| SDLC-OBS-01 | Phase 33 | Pending |
| SDLC-OBS-02 | Phase 33 | Pending |
| ENT-SYS-01 | Phase 31.1 | Complete |
| ENT-SYS-02 | Phase 31.1 | Complete |
| ENT-SYS-03 | Phase 31.1 | Complete |
| ENT-SYS-04 | Phase 31.1 | Complete |
| ENT-CR-01 | Phase 31.1 | Complete |
| ENT-CR-02 | Phase 31.1 | Complete |
| ENT-NORM-01 | Phase 31.2 | Pending |
| ENT-NORM-02 | Phase 31.2 | Pending |
| ENT-NORM-03 | Phase 31.2 | Pending |
| ENT-NORM-04 | Phase 31.2 | Pending |
| ENT-NORM-05 | Phase 31.2 | Pending |
| ENT-NORM-06 | Phase 31.2 | Pending |
| AIO-EMP-01 | Phase 34 | Pending |
| AIO-EMP-02 | Phase 34 | Pending |
| AIO-SKILL-01 | Phase 34 | Pending |
| AIO-SKILL-02 | Phase 34 | Pending |
| AIO-TEAM-01 | Phase 34 | Pending |
| AIO-TEAM-02 | Phase 34 | Pending |
| AIO-TEAM-03 | Phase 34 | Pending |
| AIO-TEAM-04 | Phase 34 | Pending |
| AIO-MEM-01 | Phase 34 | Pending |
| AIO-MEM-02 | Phase 34 | Pending |
| AIO-MEM-03 | Phase 34 | Pending |
| AIO-WRITE-01 | Phase 34 | Pending |
| AIO-WRITE-02 | Phase 34 | Pending |
| AIO-BUDGET-01 | Phase 34 | Pending |
| AIO-BUDGET-02 | Phase 34 | Pending |
| AIO-LINK-01 | Phase 34 | Pending |
| AIO-BG-01 | Phase 34 | Pending |
| AIO-UI-01 | Phase 34 | Pending |

| EXPUI-01 | Phase 25.4 | Pending |
| EXPUI-02 | Phase 25.4 | Pending |
| EXPUI-03 | Phase 25.4 | Pending |
| EXPUI-04 | Phase 25.4 | Pending |
| EXPUI-05 | Phase 25.4 | Complete |
| SDLC-REPO-EXP-01 | Phase 29.1 | Complete |
| SDLC-REPO-EXP-02 | Phase 29.1 | Complete |
| SDLC-REPO-EXP-03 | Phase 29.1 | Complete |
| SDLC-REPO-EXP-04 | Phase 29.1 | Complete |
| SDLC-REPO-EXP-05 | Phase 29.1 | Complete |

**Coverage:**

- v1 requirements: 61 total
- Mapped to phases: 61
- Unmapped: 0 ✓

**Phase totals:**

- Phase 26 (SDLC Prompt Grounding & Tool-Use Policy): 6 requirements, 4 plans
- Phase 27 (Studio Artifact Tools & Diff Approval): 6 requirements, 5 plans
- Phase 28 (Query-Only Knowledge Retrieval): 5 requirements, 4 plans
- Phase 29 (fs-gw Client & Headless Repository Runs): 4 requirements, 4 plans
- Phase 29.1 (Remote SSH Git Explorer & Headless Claude Code Trace Flow): 5 requirements, 3 plans
- Phase 30 (Automatic Change Packs, Fallback & Run Reliability): 3 requirements, 4 plans
- Phase 31 (Org Conventions in the Solution Pipeline): 6 requirements, ~4 plans
- Phase 31.2 (Enterprise Systems Catalog & CR Normalization): 6 requirements, plans TBD
- Phase 32 (External Research via Claude Code): 6 requirements, ~4 plans
- Phase 33 (Prompt Transparency & Contract Documentation): 2 requirements, 2 plans
- Phase 34 (AI Office — AI Employees, Teams, and Skills): 18 requirements, plans TBD

**Mapping changes vs initial proposal:** SDLC-REPO-06 moved from Phase 30 to Phase 29 so per-project opt-in and the repository path exist before any run or change-pack work relies on them. SDLC-CONV and SDLC-RES were added after the initial roadmap and occupy Phases 31–32; SDLC-OBS moved from Phase 31 to Phase 33 so it documents the final composer shape after conventions and research exist.

---
*Requirements defined: 2026-11-03*
*Last updated: 2026-11-03 — added SDLC-CONV (6) and SDLC-RES (6); total 38 requirements across Phases 26–33*
