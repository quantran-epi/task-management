# Roadmap: Personal Task & Workload Planner

## Milestones

- ✅ **v1.0 MVP** — Phases 1-8 (shipped 2026-09-27)
- 🟡 **v1.1 Banking IT Enhancements & Jira Integration** — Phases 9-15 (completed baseline)
- 📋 **v1.2 Hybrid GraphRAG Knowledge Assistant MVP** — Phases 16-20 (planning)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-8) — SHIPPED 2026-09-27</summary>

- [x] Phase 1: Foundation & Deployment Shell (4/4 plans) — completed 2026-09-26
- [x] Phase 2: Work Hierarchy & Fast Task Management (3/3 plans) — completed 2026-09-26
- [x] Phase 3: Capacity Model & Daily Planning Ledger (4/4 plans) — completed 2026-09-26
- [x] Phase 4: Feasibility Engine & Workload Distribution (3/3 plans) — completed 2026-09-27
- [x] Phase 5: Actionable Dashboard & Workload Forecasting (4/4 plans) — completed 2026-09-27
- [x] Phase 6: Safe Local Backup & Restore (3/3 plans) — completed 2026-09-27
- [x] Phase 7: PWA Offline Capability & Lifecycle Hardening (4/4 plans) — completed 2026-09-27
- [x] Phase 8: Optional Encrypted GitHub Backup (3/3 plans) — completed 2026-09-27

</details>

### Milestone v1.1: Banking IT Enhancements & Jira Integration

- [x] **Phase 9: Banking IT Domain Fields & Work Types** - Schema v2 migration with multi-entry indexes, Ops Owner / BA tag management with inheritance, and task work type classification. (completed 2026-09-28)
- [x] **Phase 10: Date-Range Search, Multi-Criteria Filtering & Standup Export** - Planned execution and deadline date range search, multi-criteria filter bar, and formatted standup Markdown summary clipboard export. (completed 2026-09-28)
- [x] **Phase 11: Jira Cloud Integration & Task Lifecycle** - Jira Cloud REST API v3 connection settings with CORS proxy support, connection diagnostics, issue creation, key linking, and status transitions. (completed 2026-09-28)
- [x] **Phase 12: In-App Notifications, Proactive Alerts & Custom Reminders** - In-app header alert badge and drawer, custom item reminders, and automated alerts for overdue tasks, imminent deadlines, capacity overload, and stale work. (completed 2026-09-29)
- [x] **Phase 12.1: Task Timer, Work Session Logs & Spent Time Tracking** (INSERTED) - Start/pause/finish task timer, work session persistence across reload, concurrent timers, allocation limit notifications, remaining day feasibility alerts, and spent time aggregation per task, milestone, and project. (completed 2026-09-29)
- [x] **Phase 12.2: Multiple Reminders with Time, Notification Settings, Table Customization & Sidebar Persistence** (INSERTED) - Multiple reminders with optional time per item, persistent browser notifications (no auto-dismiss), configurable notification settings, table column visibility picker and sortable headers, and persisted sidebar collapse state. (completed 2026-09-29)
- [x] **Phase 13: Enhanced Workload Analytics & Milestone Burndown** - Dedicated analytics view with lightweight SVG vector burndown, completion velocity metrics, and stakeholder workload allocation breakdowns. (completed 2026-09-30)
- [x] **Phase 13.1: Timer, Jira, Sticky Notes, Actual Worklog & Sync Improvements** (INSERTED) - Pause/resume timer segments, Project-Epic Jira mapping with reachable status transitions, offline Sticky Notes with screenshot attachments & pop-out window, weekly Actual Worklog Planner, and secure OS credential storage with auto-sync recovery. (completed 2026-10-01)
- [x] **Phase 13.2: AI Chat Drawer, Item Context Grounding & 9router Ask-Answer Integration** (INSERTED) - Right-side pinnable chat drawer, standalone and entity-scoped (Task/Project/Milestone) conversations, prompt grounding on item fields and referenced links/notes, and 9router API integration with local IndexedDB thread persistence. (completed 2026-10-03)
- [x] **Phase 14: Knowledge Base Integration (Docs, Linking & AI Retrieval)** - Offline-first PKM engine with 3-column Docs workspace, folder tree taxonomy, Markdown split editor/reader, Wiki-links, BM25 search, and grounded AI retrieval. (completed 2026-10-04)
- [x] **Phase 15: Ghost Dev: Local Claude Code Headless Orchestration with Agent Control Page and Live Git Diff Reviewer** - Local Claude Code CLI orchestration via native Rust agent manager with Git worktree isolation, 3-column Agent Control center, and Live Git Diff Reviewer. (completed 2026-10-06)

### Milestone v1.2: Hybrid GraphRAG Knowledge Assistant MVP

- [ ] **Phase 16: Knowledge Server Foundation, DLP Checks & AST Ingestion** - Optional knowledge service, pre-ingestion sensitive-data warnings with fresh explicit override, AST evidence chunking, and SHA-256 incremental chunk projection.
- [ ] **Phase 17: Pilot Ontology, Deterministic Extraction & Neo4j Knowledge Graph** - Controlled process 60000006 ontology, composite URNs, deterministic table extraction, evidence classification, and rebuildable Neo4j graph.
- [ ] **Phase 18: Multi-Modal Hybrid Retrieval Engine** - Full-text identifier search, semantic vector search, bounded 1-3 hop Cypher traversal, and Reciprocal Rank Fusion.
- [ ] **Phase 19: Grounded Assistant, Provenance Citations & Offline Fallback** - AI Chat Drawer synthesis with source citations, step-by-step path cards, conflict warnings, abstention handling, and local BM25 fallback.
- [ ] **Phase 20: Benchmark Evaluation Suite, Integrity Hardening & Credential Isolation** - 30-50 question evaluation benchmark, path/claim verification, index rebuild tests, and server-side secret isolation.

## Phase Details

### Phase 9: Banking IT Domain Fields & Work Types

**Goal**: Enable tracking of Banking IT operational ownership and work classification across all work hierarchy levels with non-destructive schema migration.
**Depends on**: Phase 8 (v1.0 baseline)
**Requirements**: SHB-01, SHB-02, SHB-03, SHB-04, SHB-05
**Success Criteria** (what must be TRUE):

  1. User can assign and edit multiple Ops Owner names on projects, milestones, and tasks.
  2. User can assign and edit multiple Business Analyst names on projects, milestones, and tasks.
  3. Milestone and task views visually display inherited Ops Owner and BA tags from parent items when not explicitly overridden.
  4. User can assign one of five Work Types ('code', 'document', 'meeting', 'support_testing', 'investigate') to a task with a distinct visual badge.
  5. Existing v1.0 local database records and backup files seamlessly upgrade to schema v2 without data loss or error.

**Plans**: 3/3 plans complete in 3 waves

- [x] 09-01-PLAN.md
- [x] 09-02-PLAN.md
- [x] 09-03-PLAN.md

**UI hint**: yes

### Phase 10: Date-Range Search, Multi-Criteria Filtering & Standup Export

**Goal**: Allow users to query scheduled work across execution date windows and copy formatted standup summaries.
**Depends on**: Phase 9
**Requirements**: SRCH-01, SRCH-02, SRCH-03, SRCH-04
**Success Criteria** (what must be TRUE):

  1. User can filter tasks by planned execution date window querying the daily allocation ledger.
  2. User can filter tasks by deadline date range.
  3. User can filter tasks simultaneously by status, priority, workType, project, milestone, Ops Owner, and BA.
  4. User can click a button to copy filtered task results as formatted Markdown standup summary to clipboard.

**Plans**: 2/2 plans complete in 2 waves

**UI hint**: yes

### Phase 11: Jira Cloud Integration & Task Lifecycle

**Goal**: Connect the planner to Jira Cloud for issue creation, linking, and status transitions directly from task details.
**Depends on**: Phase 9
**Requirements**: JIRA-01, JIRA-02, JIRA-03, JIRA-04, JIRA-05
**Success Criteria** (what must be TRUE):

  1. User can configure Jira Cloud domain, email, API token, and optional CORS Proxy URL in Settings.
  2. User can test Jira Cloud connection and receive immediate diagnostic feedback (authentication, CORS proxy check, success/failure).
  3. User can create a new Jira issue directly from a task with summary and ADF description, automatically linking the generated Jira issue key.
  4. User can manually link an existing Jira issue key to a local task and click to open the issue in Jira web UI.
  5. User can view available Jira workflow transitions and execute a status transition directly from the task modal.

**Plans**: 3/3 plans complete in 3 waves

**UI hint**: yes

### Phase 12: In-App Notifications, Proactive Alerts & Custom Reminders

**Goal**: Proactively alert the user to approaching deadlines, overdue work, capacity overload, and stale tasks without external dependencies.
**Depends on**: Phase 9, Phase 10
**Requirements**: NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04, NOTIF-05
**Success Criteria** (what must be TRUE):

  1. User can set a custom reminder date and optional note on projects, milestones, and tasks.
  2. User sees an alert badge with counter in the app header and can open a notification drawer listing active notifications.
  3. Notification drawer lists all overdue tasks and tasks due today or tomorrow.
  4. Notification drawer flags calendar days where planned workload exceeds 100% capacity.
  5. Notification drawer flags stale tasks that have remained in 'In Progress' or 'In Review' with no updates for over 5 days.

**Plans**: 3/3 plans complete in 3 waves

**UI hint**: yes

### Phase 12.1: Task timer — start/pause/finish per task, work session logs, reload persistence, multiple concurrent timers, time allocation notifications, spent time aggregations (INSERTED)

**Goal:** Provide a local-first task timer engine (start/pause/finish) with reload persistence, multiple concurrent timers, work session history logs in Dexie SCHEMA_V5, 3-tier allocation & feasibility alerts, and spent time rollups across tasks, milestones, and projects.
**Requirements**: TIMER-01, TIMER-02, TIMER-03, TIMER-04, TIMER-05, TIMER-06, TIMER-07, TIMER-08, TIMER-09
**Depends on:** Phase 12
**Plans:** 4/4 plans executed (1 gap closure plan)

### Phase 12.2: Multiple Reminders with Time, Notification Settings, Table Customization & Sidebar Persistence (INSERTED)

**Goal:** Provide multi-reminder management with optional time for all hierarchy items (projects, milestones, tasks), persistent non-auto-dismissing browser notifications (`requireInteraction: true`), user-configurable notification settings, customizable table columns with header sorting, and remembered sidebar collapse state.
**Requirements**: NOTIF-06, NOTIF-07, NOTIF-08, NOTIF-09, NOTIF-10
**Depends on:** Phase 12, Phase 12.1
**Success Criteria** (what must be TRUE):

  1. User can add, view, and delete multiple custom reminders on projects, milestones, and tasks with date and optional time (`HH:mm`).
  2. Browser notifications do not auto-dismiss (`requireInteraction: true`), remaining on desktop screen until user clicks or closes them.
  3. Settings includes a dedicated Notification Settings tab allowing configuration of master toggle, persistent interaction toggle, threshold days/percentages, and category mutes.
  4. TaskTable includes a column visibility control (show/hide columns) and clickable header column sorting, persisted in client storage.
  5. AppShell Sider remembers collapsed/expanded state across browser reloads.

**Plans:** 4/4 plans complete

### Phase 13: Enhanced Workload Analytics & Milestone Burndown

**Goal**: Provide visual insights into delivery velocity, milestone burndown, and stakeholder workload distribution.
**Depends on**: Phase 9, Phase 10
**Requirements**: ANLT-01, ANLT-02, ANLT-03
**Success Criteria** (what must be TRUE):

  1. User can view a lightweight SVG vector burndown chart for any selected milestone showing remaining work versus ideal pace.
  2. User can inspect task status distribution bars and completion velocity across projects.
  3. User can view workload allocation broken down by Ops Owner, Business Analyst, and Work Type in both planned hours and active task counts.

**Plans**: 3/3 plans complete

**UI hint**: yes

### Phase 13.1: Timer, Jira, Sticky Notes, Actual Worklog & Sync Improvements (INSERTED)

**Goal:** Deliver accurate pause/resume timer segments with safe auto-status and hierarchy subtitle; local Project to Jira Epic mapping with one-to-many reachable status transitions and native Tauri proxy/browser links; offline-first Sticky Notes with Markdown, screenshot attachments, and reusable pop-out window; weekly Actual Worklog Planner with variance and inline work sessions; and secure credential storage in OS keychain with robust auto-sync recovery.
**Depends on:** Phase 11, Phase 12.1, Phase 12.2, Phase 13
**Requirements**: TIMER-01, TIMER-02, JIRA-01, JIRA-04, JIRA-05, NOTE-01, NOTE-02, NOTE-03, WORKLOG-01, SYNC-01
**Success Criteria** (what must be TRUE):

  1. Timer tracks exact pause/resume timestamps via running segments, safely moves task to In Progress on start/resume without overwriting terminal statuses, and displays Project › Milestone subtitle.
  2. Projects can link or create Jira Epics, task status change evaluates one-to-many mapped reachable Jira transitions with user confirmation, and Tauri runs Jira calls via built-in proxy with system browser links.
  3. User can create standalone or entity-attached (Task/Project/Milestone) Sticky Notes with Markdown preview, attach up to 5 screenshots (5MB each), search/filter all notes in a dedicated view, and pop out a pinned multi-note window.
  4. Weekly Actual Worklog Planner displays planned vs actual hours per day and task with variance indicators, quick minute entry, and inline WorkSession management.
  5. Tauri securely stores GitHub PAT, passphrase, and Jira token in OS Credential Manager/Keychain, while Web/PWA supports password managers; GitHub auto-sync displays real-time status with retry/backoff on network errors.

**Plans:** 5/5 plans executed

**UI hint**: yes

### Phase 13.2: AI Chat Drawer, Item Context Grounding & 9router Ask-Answer Integration (INSERTED)

**Goal:** Deliver a pinnable right-side AI Chat Drawer with 9router API integration, capable of operating standalone or grounded in the context of a selected Task, Project, or Milestone with item field serialization and local note/link content ingestion for accurate ask-and-answer assistance.
**Depends on:** Phase 9, Phase 13.1
**Requirements**: AI-01, AI-02, AI-03, AI-04, AI-05
**Success Criteria** (what must be TRUE):

  1. User can configure 9router API endpoint, API key, and model name in Settings with immediate connection test verification.
  2. Right-side AI Chat drawer can be opened, collapsed, and pinned (docked side-by-side with main content without covering UI) globally across all views.
  3. Chat can operate standalone or attach to an active context item (Task, Project, or Milestone), maintaining persistent conversation history per scope in local IndexedDB.
  4. Context item fields (title, status, priority, estimates, tags, notes, dates, subtasks) are automatically structured into LLM system and conversation context.
  5. Chat can ingest and ground answers on local file notes, attachments, and referenced URLs associated with the context item, answering reference-based questions directly.

**Plans:** 3/3 plans complete

**UI hint**: yes

### Phase 14: Knowledge Base Integration (Docs, Linking & AI Retrieval)

**Goal:** Deliver an offline-first Personal Knowledge Management (PKM) engine with 3-column Docs workspace, folder tree taxonomy, Markdown split preview with outline ToC, Wiki-link bidirectional linking, 1-Click Smart Ingestion flow, lexical BM25 search with Vietnamese diacritic tolerance, and grounded AI retrieval with clickable citations.
**Requirements**: REQ-14.1, REQ-14.2, REQ-14.3, REQ-14.4, REQ-14.5, REQ-14.6
**Depends on:** Phase 13
**Plans:** 4/4 plans complete

### Phase 15: Ghost Dev: Local Claude Code Headless Orchestration with Agent Control Page and Live Git Diff Reviewer

**Goal:** Orchestrate local Claude Code Headless CLI (`stream-json`) via native Rust multi-agent manager (Master-Worker) with Git worktree isolation, a dedicated 3-column Agent Control center, and an interactive Live Git Diff Reviewer with side-by-side/unified diff modes and click-to-comment inline feedback.
**Requirements**: GHOST-01, GHOST-02, GHOST-03, GHOST-04
**Depends on:** Phase 14
**Plans:** 4/4 plans complete

### Phase 16: Knowledge Server Foundation, DLP Checks & AST Ingestion

**Goal**: Establish an optional knowledge-server publishing pipeline with pre-ingestion sensitive-data warnings and fresh explicit override, AST-based evidence chunking, and SHA-256 incremental chunk projection.
**Depends on**: Phase 15
**Requirements**: INGEST-01, INGEST-02, INGEST-03, INGEST-04, INGEST-05
**Success Criteria** (what must be TRUE):

  1. User can publish selected Markdown documents to the optional knowledge server without altering local Markdown copies.
  2. Before content leaves PlannerMate, findings for PAN, CVV, PIN, HSM keys, credentials, or customer PII show masked actionable details and require fresh explicit confirmation before publishing may continue.
  3. Published documents preserve headings, tables, code blocks, SQL, ASCII diagrams, and exact source ranges as versioned evidence chunks.
  4. Republishing unchanged or partially modified documents projects only added, changed, or removed chunks via SHA-256 comparison; unchanged chunks retain their indexed representation.
  5. User can inspect publish and indexing status for each document set in PlannerMate.

**Plans**: 13 plans in 9 waves
Plans:
**Wave 1**

- [x] 16-01-PLAN.md — Client publish contracts and additive Dexie V10 stores (Wave 1)
- [x] 16-03-PLAN.md — Deterministic client DLP scanner, masking, and safe audit (Wave 1)
- [x] 16-04-PLAN.md — Independent daemon package and strict shared protocol (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 16-02-PLAN.md — Stable document sets and bounded status cache (Wave 2)
- [x] 16-05-PLAN.md — Isomorphic lossless AST chunking and shared hash policy (Wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 16-06-PLAN.md — Exact zero-network document-and-chunk four-way preview (Wave 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 16-07-PLAN.md — Incremental projection, idempotent attempts, and atomic activation (Wave 4)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 16-08-PLAN.md — Authenticated exact-origin daemon API (Wave 5)

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 16-09-PLAN.md — Safe client, preview-bound DLP gate, and polling (Wave 6)

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 16-10-PLAN.md — Optional daemon Settings configuration (Wave 7)
- [x] 16-11-PLAN.md — Document-set management and guarded publish UI (Wave 7)

**Wave 8** *(blocked on Wave 7 completion)*

- [ ] 16-12-PLAN.md — Docs badges, management wiring, and no-daemon isolation (Wave 8)

**Wave 9** *(blocked on Wave 8 completion)*

- [ ] 16-13-PLAN.md — Pilot and client Phase 16 acceptance gates (Wave 9)

### Phase 17: Pilot Ontology, Deterministic Extraction & Neo4j Knowledge Graph

**Goal**: Build a rebuildable Neo4j knowledge graph for process 60000006 using collision-safe composite identities, deterministic table extraction, and explicit evidence classification.
**Depends on**: Phase 16
**Requirements**: GRAPH-01, GRAPH-02, GRAPH-03, GRAPH-04, GRAPH-05, GRAPH-06
**Success Criteria** (what must be TRUE):

  1. User can build a controlled graph projection for process 60000006 covering scheduled processes, container steps, software components, database objects, cycle types, statuses, and source documents.
  2. Graph keeps identically numbered domain objects distinct through namespaced composite identities (such as `PRC_PROCESS:60000006` vs `PRC_CONTAINER:60000006`).
  3. Structured Markdown tables and explicit identifiers are extracted deterministically before LLM extraction is used for prose-only relationships.
  4. Every graph relation retains source document, section, source range, extraction method, and evidence classification (`OBSERVED`, `INFERRED`, or `BUSINESS_APPROVED`).
  5. User can distinguish `OBSERVED`, `INFERRED`, and `BUSINESS_APPROVED` knowledge in graph-backed results.
  6. User can rebuild graph and indexes from published Markdown without treating Neo4j as canonical storage.

**Plans**: TBD

### Phase 18: Multi-Modal Hybrid Retrieval Engine

**Goal**: Execute fused keyword, semantic vector, and bounded Cypher graph retrieval over scheduled process 60000006.
**Depends on**: Phase 17
**Requirements**: RETR-01, RETR-02, RETR-03, RETR-04, RETR-05
**Success Criteria** (what must be TRUE):

  1. User can find exact technical identifiers (process IDs, package names, table names, cycle codes, status codes) through full-text search.
  2. User can find relevant English technical documentation using semantically equivalent Vietnamese or English questions.
  3. User can query process flow and runtime call chains through bounded graph traversal.
  4. User can run dependency and impact queries across one to three graph hops with bounded result counts.
  5. Hybrid results combine full-text, semantic, and graph evidence into one ranked, deduplicated evidence set.

**Plans**: TBD

### Phase 19: Grounded Assistant, Provenance Citations & Offline Fallback

**Goal**: Deliver evidence-grounded AI assistant responses in Chat Drawer with interactive citations, step-by-step graph paths, conflict detection, and local BM25 fallback.
**Depends on**: Phase 18
**Requirements**: ANSWER-01, ANSWER-02, ANSWER-03, ANSWER-04, ANSWER-05, ANSWER-06, ANSWER-07
**Success Criteria** (what must be TRUE):

  1. User receives AI answers whose material claims cite exact source documents, sections, and ranges.
  2. User can inspect a step-by-step graph path for flow, dependency, and impact answers.
  3. User sees evidence classification on facts and clear labeling when a conclusion is inferred.
  4. User is warned when indexed sources conflict by version, environment, or behavior.
  5. Assistant explicitly reports missing evidence instead of inventing an answer.
  6. When knowledge server is unavailable, user can continue searching local Markdown through existing BM25 retrieval.
  7. Citations and graph paths open the corresponding PlannerMate document context.

**Plans**: TBD
**UI hint**: yes

### Phase 20: Benchmark Evaluation Suite, Integrity Hardening & Credential Isolation

**Goal**: Validate answer quality, multi-hop path fidelity, credential isolation, and recovery behavior using a 30-50 question benchmark harness.
**Depends on**: Phase 19
**Requirements**: QUAL-01, QUAL-02, QUAL-03, QUAL-04, QUAL-05
**Success Criteria** (what must be TRUE):

  1. Maintainer can run a 30–50 question benchmark covering exact lookup, semantic retrieval, process flow, call chain, three-hop impact, conflict, and abstention cases.
  2. Benchmark verifies expected sources, required graph paths, required facts, and forbidden unsupported claims.
  3. Milestone meets an agreed accuracy threshold for three-hop pilot queries and reports failures rather than masking them.
  4. Automated checks prove indexes are rebuildable, sensitive-data checks and any required fresh override confirmation run before external calls, and local search remains available offline.
  5. Claude and Neo4j credentials remain server-side and never enter PlannerMate source, IndexedDB, logs, or published bundles.

**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|---|---|---|---|---|
| 1. Foundation & Deployment Shell | v1.0 | 4/4 | Complete | 2026-09-26 |
| 2. Work Hierarchy & Fast Task Management | v1.0 | 3/3 | Complete | 2026-09-26 |
| 3. Capacity Model & Daily Planning Ledger | v1.0 | 4/4 | Complete | 2026-09-26 |
| 4. Feasibility Engine & Workload Distribution | v1.0 | 3/3 | Complete | 2026-09-27 |
| 5. Actionable Dashboard & Workload Forecasting | v1.0 | 4/4 | Complete | 2026-09-27 |
| 6. Safe Local Backup & Restore | v1.0 | 3/3 | Complete | 2026-09-27 |
| 7. PWA Offline Capability & Lifecycle Hardening | v1.0 | 4/4 | Complete | 2026-09-27 |
| 8. Optional Encrypted GitHub Backup | v1.0 | 3/3 | Complete | 2026-09-27 |
| 9. Banking IT Domain Fields & Work Types | v1.1 | 3/3 | Complete | 2026-09-28 |
| 10. Date-Range Search, Multi-Criteria Filtering & Standup Export | v1.1 | 2/2 | Complete | 2026-09-28 |
| 11. Jira Cloud Integration & Task Lifecycle | v1.1 | 3/3 | Complete | 2026-09-28 |
| 12. In-App Notifications, Proactive Alerts & Custom Reminders | v1.1 | 3/3 | Complete | 2026-09-29 |
| 12.1. Task Timer, Work Session Logs & Spent Time Tracking | v1.1 | 4/4 | Complete | 2026-09-29 |
| 12.2. Multiple Reminders with Time, Notification Settings, Table Customization & Sidebar Persistence | v1.1 | 4/4 | Complete | 2026-09-29 |
| 13. Enhanced Workload Analytics & Milestone Burndown | v1.1 | 3/3 | Complete | 2026-09-30 |
| 13.1. Timer, Jira, Sticky Notes, Actual Worklog & Sync Improvements | v1.1 | 5/5 | Complete | 2026-10-01 |
| 13.2. AI Chat Drawer, Item Context Grounding & 9router Ask-Answer Integration | v1.1 | 3/3 | Complete | 2026-10-03 |
| 14. Knowledge Base Integration (Docs, Linking & AI Retrieval) | v1.1 | 4/4 | Complete | 2026-10-04 |
| 15. Ghost Dev: Local Claude Code Headless Orchestration with Agent Control Page and Live Git Diff Reviewer | v1.1 | 4/4 | Complete | 2026-10-06 |
| 16. Knowledge Server Foundation, DLP Checks & AST Ingestion | v1.2 | 11/13 | In Progress|  |
| 17. Pilot Ontology, Deterministic Extraction & Neo4j Knowledge Graph | v1.2 | 0/TBD | Not started | - |
| 18. Multi-Modal Hybrid Retrieval Engine | v1.2 | 0/TBD | Not started | - |
| 19. Grounded Assistant, Provenance Citations & Offline Fallback | v1.2 | 0/TBD | Not started | - |
| 20. Benchmark Evaluation Suite, Integrity Hardening & Credential Isolation | v1.2 | 0/TBD | Not started | - |
