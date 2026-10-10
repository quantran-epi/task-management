# Milestone v1.1 Requirements

**Milestone:** v1.1 Banking IT Enhancements & Jira Integration
**Goal:** Enhance application for banking IT development environment (SHB) with operational ownership fields, task work types, Jira Cloud connectivity, date-range task search, custom reminders, and advanced workload analytics.

## Requirements

### Banking IT Domain Fields (SHB)

- [x] **SHB-01**: User can add and edit multiple Ops Owner names (`opsOwners: string[]`) on Project, Milestone, and Task.
- [x] **SHB-02**: User can add and edit multiple Business Analyst names (`businessAnalysts: string[]`) on Project, Milestone, and Task.
- [x] **SHB-03**: Tasks and milestones visually display inherited Ops Owner and BA tags from parent project/milestone when not overridden.
- [x] **SHB-04**: User can assign a Work Type (`workType: 'code' | 'document' | 'meeting' | 'support_testing' | 'investigate'`) to each Task with visual badge and filter support.
- [x] **SHB-05**: Database upgrades to schema v2 with multi-entry indexes for `*opsOwners`, `*businessAnalysts`, and index for `workType`, preserving v1 data and backup compatibility.

### Jira Cloud Integration

- [x] **JIRA-01**: User can configure Jira Cloud domain (`xxx.atlassian.net`), email, API token, and optional CORS Proxy URL in Settings.
- [x] **JIRA-02**: User can test Jira Cloud connection with immediate diagnostic feedback (authenticating, CORS detection, success/failure).
- [x] **JIRA-03**: User can create a new Jira issue directly from a local task with summary and minimal ADF description, auto-linking the Jira key.
- [x] **JIRA-04**: User can manually link an existing Jira issue key to a local task and open the Jira web URL in one click.
- [x] **JIRA-05**: User can inspect and execute Jira status transitions directly from the task detail modal.

### Date-Range Search & Multi-Criteria Filtering

- [x] **SRCH-01**: User can search and filter tasks by planned execution date window (via daily allocation ledger).
- [x] **SRCH-02**: User can search and filter tasks by deadline date range.
- [x] **SRCH-03**: User can filter tasks simultaneously by status, priority, workType, project, milestone, Ops Owner, and BA.
- [x] **SRCH-04**: User can copy filtered task results as formatted Markdown standup summary to clipboard.

### Notifications & Custom Reminders

- [x] **NOTIF-01**: User can set custom reminder date (`reminderDate: YYYY-MM-DD`) and optional note on Project, Milestone, and Task.
- [x] **NOTIF-02**: User sees proactive in-app alert badge and notification drawer in application header showing active alerts.
- [x] **NOTIF-03**: System alerts user to overdue tasks and tasks approaching deadline (today/tomorrow).
- [x] **NOTIF-04**: System alerts user to days where planned work exceeds available capacity (>100% overload).
- [x] **NOTIF-05**: System alerts user to stale tasks in 'In Progress' or 'In Review' status with no activity for more than 5 days.

### Task Timer & Work Session Logs (Phase 12.1 INSERTED)

- [x] **TIMER-01**: Dexie SCHEMA_V5 adds `workSessions` and `activeTimers` stores without data loss.
- [x] **TIMER-02**: User can create, view, edit, and delete work session logs per task with duration, date, and optional note.
- [x] **TIMER-03**: User can start, pause, resume, and finish task timers with real wall-clock delta calculation and reload survival.
- [x] **TIMER-04**: System cascades task, milestone, and project deletion to clean up associated work sessions and active timers.
- [x] **TIMER-05**: Backup export and restore schemas bump to v3 and serialize `workSessions` with cryptographic validation.
- [x] **TIMER-06**: User can run multiple concurrent timers simultaneously with reactive UI ticker loop.
- [x] **TIMER-07**: System alerts user with 3-tier allocation warnings (task spent >= estimate toast, daily overload drawer alert, daily feasibility risk).
- [x] **TIMER-08**: User can view and control active timers via AppHeader capsule widget and multi-timer dropdown badge.
- [x] **TIMER-09**: User can inspect and manage task work history in TaskDrawer dedicated Work Sessions tab and record manual sessions via modal.

### Multi-Reminder, Notification Settings & UI Controls (Phase 12.2 INSERTED)

- [x] **NOTIF-06**: User can configure multiple custom reminders with date (`YYYY-MM-DD`), optional time (`HH:mm`), and note on Projects, Milestones, and Tasks.
- [x] **NOTIF-07**: Browser notifications support persistent display (`requireInteraction: true`) so notifications stay on screen until user interaction.
- [x] **NOTIF-08**: User can configure notification settings in Settings (master toggle, persistent alert toggle, deadline warning threshold days, stale task threshold days, capacity overload threshold percentage, category toggles).
- [x] **NOTIF-09**: User can pick which columns to display or hide on task tables and click column headers to sort table data, with column preferences saved across sessions.
- [x] **NOTIF-10**: AppShell sidebar collapse/expand state is remembered and restored across sessions/reloads.

### Enhanced Analytics Dashboard

- [x] **ANLT-01**: User can view milestone burndown chart (lightweight SVG vector) tracking remaining vs completed work over time.
- [x] **ANLT-02**: User can view task status distribution and completion velocity across projects.
- [x] **ANLT-03**: User can view workload allocation broken down by Ops Owner, Business Analyst, and Work Type (hours and active task counts).

### Sticky Notes with Attachments & Pop-Out (Phase 13.1 INSERTED)

- [x] **NOTE-01**: User can create, edit, pin, and delete standalone or entity-attached (Task, Project, Milestone) sticky notes with safe Common Markdown formatting.
- [x] **NOTE-02**: User can attach up to 5 screenshot images (PNG/JPEG/GIF/WebP, max 5MB each) per note stored as Blobs and serialized in backups.
- [x] **NOTE-03**: User can search and filter notes in a dedicated full view and pop out a pinned, floating, resizable notes window with Always on Top on Tauri and browser popup fallback.

### Actual Worklog Planner (Phase 13.1 INSERTED)

- [x] **WORKLOG-01**: User can view weekly planned vs actual work comparison matrix with midnight segment splitting, color-coded variance, quick inline minute entry, and full work session detail editing.

### Native Credential Storage & Auto-Sync Hardening (Phase 13.1 INSERTED)

- [x] **SYNC-01**: Native desktop OS Keychain credential persistence via Rust keyring crate with Web password-manager compatibility, safe legacy Jira token migration, zero-secret SQLite/IndexedDB boundaries, and resilient GitHub auto-sync with exponential backoff and SHA conflict pausing.

### AI Chat Drawer & 9router Integration (Phase 13.2 INSERTED)

- [x] **AI-01**: User can configure 9router API endpoint, API key, and model name in Settings with connection test verification.
- [x] **AI-02**: Right-side collapsible and pinnable chat drawer (docked side-by-side or overlay) accessible globally and from task/project/milestone views.
- [x] **AI-03**: Chat sessions can be standalone or scoped to a specific Task, Project, or Milestone, retaining conversation history per scope in local IndexedDB.
- [x] **AI-04**: Prompt context engine serializes scoped item fields (title, status, priority, estimates, tags, notes, dates) into system/user instructions for grounded responses.
- [x] **AI-05**: Item link and document grounding extracts text from item links/notes (local attachments, URLs, note content) to answer reference-based questions directly.

### Knowledge Base Integration (Phase 14 INSERTED)

- [ ] **REQ-14.1**: Database schema upgrades to Dexie SCHEMA_V9 supporting document type, folder hierarchy (parentId), tags, and soft delete (deletedAt) without data loss on existing sticky notes.
- [ ] **REQ-14.2**: Offline lexical BM25 search engine with field weighting (Title x3, Tags x2, Body x1) and Vietnamese diacritic normalization.
- [x] **REQ-14.3**: Markdown renderer parses inline Wiki-links (`[[doc:id|Title]]`, `[[task:id|Title]]`, `[[project:id|Title]]`) into interactive chips and binary attachments (`attachment:uuid`) safely without XSS.
- [x] **REQ-14.4**: Smart Ingestion flow extracts markdown headings/hashtags and regex-detects Jira keys and existing task/project titles with a 1-click "Áp dụng tất cả" banner.
- [x] **REQ-14.5**: AI tools `search_knowledge_base` and `get_document_details` provide BM25-ranked snippets within character budget, supported by `@doc:` autocomplete and clickable citation chips opening a Quick Preview Drawer.
- [x] **REQ-14.6**: NotesView provides a unified 3-column document workspace (Folder Tree + Document List + Split Editor/Reader with ToC and Backlinks), TaskDrawer Linked Knowledge integration, and Markdown/Zip export.

### Ghost Dev: Headless Claude Code Orchestration (Phase 15 INSERTED)

- [ ] **GHOST-01**: Zero-dependency Git unified diff parser converts raw diff strings into structured files, line counts, hunks, and individual additions/deletions.
- [ ] **GHOST-02**: Prompt builder utilities format task context for Master Agent orchestration and package inline diff code comments (`file_path:line_number`) for iterative code refinement.
- [ ] **GHOST-03**: Rust backend enforces shell command whitelist for autonomous diagnostic runs and blocks unwhitelisted commands until explicit user approval via modal gate.
- [ ] **GHOST-04**: Agent Control view delivers a 3-column layout (Session List, Terminal Stream Log, Live Git Diff Reviewer) accessible via Sidebar badge and integrated with task triggers.

### Knowledge Server Foundation, DLP Checks & AST Ingestion (Phase 16 INSERTED)

- [x] **INGEST-01**: User can manually publish stable named sets of selected PlannerMate Markdown document UUIDs to an optional independently deployed knowledge server without changing, deleting, or replacing canonical local Markdown; folder-based creation captures a one-time explicit ordered membership snapshot.
- [x] **INGEST-02**: Before any user-authored document-set name, document title, Markdown body, tag, or other payload text leaves PlannerMate, client-side checks detect PAN, CVV, PIN/PIN block, HSM keys, credentials, and customer PII, show category/document/location with masked context, and require fresh explicit confirmation for every affected publish attempt without any persisted trust bypass or sensitive audit content.
- [x] **INGEST-03**: Published immutable Markdown snapshots are parsed into versioned section-first AST evidence chunks that preserve headings, tables, fenced code/SQL, ASCII diagrams, duplicate occurrences, exact raw source ranges, and atomic blocks without truncation; an atomic block over 50,000 characters rejects the candidate with exact location and split guidance.
- [x] **INGEST-04**: Pre-send preview and daemon projection use the same versioned AST/newline-normalization policy and SHA-256 document/chunk hashes to classify added, changed, removed, and unchanged documents and chunks, reuse unchanged content representations, keep occurrence identity separate, and activate a candidate snapshot only after every document succeeds while preserving the prior active snapshot on failure.
- [x] **INGEST-05**: User can inspect each document set and member using exactly `Never published`, `In sync`, `Local changes`, `Publishing`, `Warning`, or `Failed`, including subordinate connectivity uncertainty and the 10 newest content-free attempt records, while local Docs CRUD, autosave, folder navigation, and BM25 search continue when the optional knowledge server is disabled, unreachable, or absent.

### Pilot Ontology, Deterministic Extraction & Neo4j Knowledge Graph (Phase 17)

- [x] **GRAPH-01**: User can build a controlled graph projection for process 60000006 covering scheduled processes, container steps, software components, database objects, cycle types, statuses, and source documents.
- [x] **GRAPH-02**: Graph keeps identically numbered domain objects distinct through namespaced composite identities (such as `PRC_PROCESS:60000006` vs `PRC_CONTAINER:60000006`).
- [x] **GRAPH-03**: Structured Markdown tables and explicit identifiers are extracted deterministically before LLM extraction is used for prose-only relationships.
- [x] **GRAPH-04**: Every graph relation retains source document, section, source range, extraction method, and evidence classification (`OBSERVED`, `INFERRED`, or `BUSINESS_APPROVED`).
- [ ] **GRAPH-05**: User can distinguish `OBSERVED`, `INFERRED`, and `BUSINESS_APPROVED` knowledge in graph-backed results.
- [ ] **GRAPH-06**: User can rebuild graph and indexes from published Markdown without treating Neo4j as canonical storage.

## Future Requirements (Deferred)

- **FUTR-01**: Full bidirectional Jira issue webhook sync (deferred - requires server/push).
- **FUTR-02**: Jira sprint and epic hierarchical import (deferred - v1.2 candidate).
- **FUTR-03**: Native browser Push Notification API with service worker background sync.

## Out of Scope

- Direct OAuth 2.0 PKCE flow for Jira Cloud (requires registered client ID/secret; API tokens provide zero-config per-user access).
- Public third-party CORS proxy services (blocked to protect confidential banking tokens and data).
- Complex chart libraries (`@ant-design/plots`, `recharts`, `chart.js`) — keep zero new dependencies; lightweight native React SVG suffices.

## Traceability

| Requirement | Phase | Status |
|---|---|---|
| SHB-01 | Phase 9 | Complete |
| SHB-02 | Phase 9 | Complete |
| SHB-03 | Phase 9 | Complete |
| SHB-04 | Phase 9 | Complete |
| SHB-05 | Phase 9 | Complete |
| SRCH-01 | Phase 10 | Complete |
| SRCH-02 | Phase 10 | Complete |
| SRCH-03 | Phase 10 | Complete |
| SRCH-04 | Phase 10 | Complete |
| JIRA-01 | Phase 11 | Complete |
| JIRA-02 | Phase 11 | Complete |
| JIRA-03 | Phase 11 | Complete |
| JIRA-04 | Phase 11 | Complete |
| JIRA-05 | Phase 11 | Complete |
| NOTIF-01 | Phase 12 | Complete |
| NOTIF-02 | Phase 12 | Complete |
| NOTIF-03 | Phase 12 | Complete |
| NOTIF-04 | Phase 12 | Complete |
| NOTIF-05 | Phase 12 | Complete |
| TIMER-01 | Phase 12.1 | Complete |
| TIMER-02 | Phase 12.1 | Complete |
| TIMER-03 | Phase 12.1 | Complete |
| TIMER-04 | Phase 12.1 | Complete |
| TIMER-05 | Phase 12.1 | Complete |
| TIMER-06 | Phase 12.1 | Complete |
| TIMER-07 | Phase 12.1 | Complete |
| TIMER-08 | Phase 12.1 | Complete |
| TIMER-09 | Phase 12.1 | Complete |
| NOTIF-06 | Phase 12.2 | Complete |
| NOTIF-07 | Phase 12.2 | Complete |
| NOTIF-08 | Phase 12.2 | Complete |
| NOTIF-09 | Phase 12.2 | Complete |
| NOTIF-10 | Phase 12.2 | Complete |
| ANLT-01 | Phase 13 | Complete |
| ANLT-02 | Phase 13 | Complete |
| ANLT-03 | Phase 13 | Complete |
| NOTE-01 | Phase 13.1 | Complete |
| NOTE-02 | Phase 13.1 | Complete |
| NOTE-03 | Phase 13.1 | Complete |
| WORKLOG-01 | Phase 13.1 | Complete |
| SYNC-01 | Phase 13.1 | Complete |
| AI-01 | Phase 13.2 | Complete |
| AI-02 | Phase 13.2 | Complete |
| AI-03 | Phase 13.2 | Complete |
| AI-04 | Phase 13.2 | Complete |
| AI-05 | Phase 13.2 | Complete |
| REQ-14.1 | Phase 14 | Pending |
| REQ-14.2 | Phase 14 | Pending |
| REQ-14.3 | Phase 14 | Complete |
| REQ-14.4 | Phase 14 | Complete |
| REQ-14.5 | Phase 14 | Complete |
| REQ-14.6 | Phase 14 | Complete |
| GHOST-01 | Phase 15 | Pending |
| GHOST-02 | Phase 15 | Pending |
| GHOST-03 | Phase 15 | Pending |
| GHOST-04 | Phase 15 | Pending |
| INGEST-01 | Phase 16 | Complete |
| INGEST-02 | Phase 16 | Complete |
| INGEST-03 | Phase 16 | Complete |
| INGEST-04 | Phase 16 | Complete |
| INGEST-05 | Phase 16 | Complete |
| GRAPH-01 | Phase 17 | Complete |
| GRAPH-02 | Phase 17 | Complete |
| GRAPH-03 | Phase 17 | Complete |
| GRAPH-04 | Phase 17 | Complete |
| GRAPH-05 | Phase 17 | Pending |
| GRAPH-05 | Phase 17 | Pending |
| GRAPH-06 | Phase 17 | Pending |
