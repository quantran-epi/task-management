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
