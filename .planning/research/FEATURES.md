# Feature Research

**Domain:** Banking IT Task Management, Jira Cloud Integration, Date-Range Workload Search & Analytics
**Researched:** 2026-09-27
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in personal workload tools tailored for banking IT development and Jira Cloud environments. Missing these makes the workflow feel disjointed, requiring manual double-entry or fallback to spreadsheets.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Ops Owner & BA fields across hierarchy | Banking IT projects (e.g. SHB) coordinate across multiple Business Analysts and Operations team owners. Tracking who owns operations and requirements is essential context. | LOW | Add `opsOwners: string[]` and `businessAnalysts: string[]` to Project, Milestone, and Task models. Store as string arrays to support multiple owners. Use Ant Design `Select mode="tags"`. |
| Hierarchical inheritance / fallback for Ops Owner & BA | Tasks often belong to milestones or projects with known BAs and Ops Owners. Redundant entry on every subtask is friction. | LOW | Display inherited Ops Owner / BA from parent Milestone or Project when task level is unset, marked with clear visual badge (e.g., muted pill or tooltip "Inherited from Milestone"). |
| Jira Cloud credentials & connection test | Users need to verify API token, email, and domain connectivity before attempting issue operations. | MEDIUM | Support Jira Cloud domain (`xxx.atlassian.net`), email, Atlassian API Token, and optional CORS Proxy URL. Provide a "Test Connection" button testing `GET /rest/api/3/myself` or `/rest/api/2/myself`. |
| Create Jira issue from Task | Eliminates manual copy-paste between personal planner and team tracking system. | MEDIUM | Generate Jira issue via `POST /rest/api/3/issue` (or v2) with summary from task name, description from task notes/description, and mapped issue type/project key. Store returned `jiraKey` and `jiraUrl` on Task. |
| Link existing Jira issue to Task | Many tasks originate in Jira before personal planning begins. | LOW | Allow entering Jira issue key (e.g., `SHB-1234`). Store key, browse link, and fetch current Jira summary and status. |
| Jira status transition viewing & syncing | Once work is resolved or started locally, user expects linked Jira issue to reflect status without navigating away. | MEDIUM | Fetch valid transitions via `GET /rest/api/3/issue/{key}/transitions`. Allow executing transition via `POST /rest/api/3/issue/{key}/transitions`. Provide clear transition dropdown or sync prompt on local status change. |
| Execution date-range task search | Core value is planning against calendar capacity. Users must find tasks planned for execution during a specific date window (e.g., this sprint or release window). | MEDIUM | Query Dexie `PlannedAllocation` table by `date` range `[startDate, endDate]`, gather distinct `taskId`s, and join with `Task` records. Distinguish planned execution dates from deadline dates. |
| Multi-criteria task filtering | In banking IT, users must isolate tasks by project, milestone, status, priority, BA, Ops Owner, and Jira link presence. | MEDIUM | Ant Design filter drawer/bar with compound predicate: text match, status tags, project/milestone cascading select, Ops Owner tags, BA tags, and Jira status. |
| Quick date range presets | Speed requirement: users need one-click access to common operational horizons. | LOW | Preset buttons: "Today", "This Week", "Next Week", "This Month", "Next 14 Days", "Overdue", and "Unscheduled/Unplanned". |
| Milestone burndown & status distribution | Release managers and tech leads need visual status of milestone deliverables. | MEDIUM | Aggregate milestone tasks by status (`Open`, `In Progress`, `Resolved`, `In Review`, `Done`, `Cancelled`) and planned hours vs estimated hours. Render with Ant Design `Progress` and stacked distribution bars. |
| Workload distribution by BA & Ops Owner | Answers: "Which BA or Ops Owner is demanding the most capacity this sprint/month?" Vital for managing stakeholder commitments. | MEDIUM | Group planned allocation hours and active task counts by distinct BA and Ops Owner names across the chosen horizon. Render in compact ranking/breakdown table and bar visual. |

### Differentiators (Competitive Advantage)

Features that set this product apart from generic task managers (Todoist, TickTick) and heavy project suites (Jira native UI, Monday.com).

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Execution Date vs. Deadline Date Separation | Most tools only offer a single "Due Date", obscuring when the work will actually take place. We allow searching by both planned execution window (from capacity ledger) and final deadline. | MEDIUM | Explicit search toggle: "Filter by Planned Execution Date" vs "Filter by Due Date / Deadline" vs "Filter by Actual Execution Date". |
| Stakeholder Capacity Allocation Breakdown | Visualizes single-developer bottleneck across multiple banking stakeholders (Ops teams vs BAs) without requiring an enterprise BI tool. | MEDIUM | Instant pivot view: see total planned hours committed to BA "Nguyen Van A" vs BA "Le Thi B" over next 14 days. Exposes stakeholder over-commitment early. |
| Local-First Jira Bridge with CORS Proxy Flexibility | Direct, private Jira integration without routing personal planning data through a third-party multi-tenant SaaS server. | MEDIUM | Works offline with cached Jira issue keys; syncs on-demand when connected. Supports custom CORS proxy (Cloudflare Worker, local proxy, or reverse proxy) to bypass browser CORS restrictions. |
| Bi-directional Status Transition Mapping | User defines how local task states (`In Progress`, `Resolved`, `Done`) map to team Jira workflow states without strict schema locking. | MEDIUM | Configurable mapping in Settings: e.g., local `Resolved` triggers Jira transition `Resolve Issue` (ID `5`), local `Done` triggers `Close Issue`. |
| Standup & Release Clipboard / CSV Exporter | Generates formatted Markdown/text snippet or CSV of tasks completed or planned within a date range for banking IT standups and status emails. | LOW | One-click button: "Copy Standup Summary" formatted with Jira keys, task names, status, and Ops/BA names. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem appealing on the surface but create significant architectural risk, bloat, or violate core constraints.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time two-way Jira background daemon / webhooks | Users want Jira updates to appear instantaneously without clicking sync. | Requires a persistent public backend server with public URL endpoints for Atlassian webhooks. Violates static GitHub Pages and offline-first architecture. Polling background workers drain mobile/laptop battery and hit Atlassian rate limits. | User-initiated on-demand sync (single task refresh or "Sync Linked Jira Issues" button) with last-synced timestamp. |
| Active Directory / LDAP / HR system sync for Ops Owner & BA | Users want automatic employee directory search when typing names. | Massive security/compliance barrier in banking IT. Requires enterprise intranet proxy, corporate OAuth, and backend directory service. | Ant Design `Select mode="tags"` with local autocomplete derived from distinct names previously saved in IndexedDB. |
| Full Atlassian Document Format (ADF) WYSIWYG editor | Users want rich Jira description formatting with tables, mentions, and macros. | ADF is a deeply nested, proprietary JSON structure (`type: doc, content: [...]`). Rendering and round-tripping ADF in a browser client requires heavy Atlassian libraries (>2MB bundle) and frequently breaks on unsupported node types. | Use plain text or standard Markdown. Map to Jira REST API v2 string format or minimal ADF text paragraphs in v3. |
| User permissions, assignments & role-based access control (RBAC) | Teams ask "Can we restrict who can edit tasks based on Ops Owner or BA?" | App is strictly single-user personal task & capacity planner. RBAC introduces multi-user auth, session management, and server authorization logic, destroying simplicity. | Ops Owner and BA are informational metadata tags, not app user logins. |
| Embedded heavy BI/charting framework (e.g. Apache ECharts, Chart.js, D3) | Users want 3D pie charts, radar graphs, and customizable dashboards. | Adds 300KB-1MB+ bundle weight, complex canvas lifecycle management, and high maintenance overhead for simple time-series and categorical distributions. | Ant Design native visualization components (`Progress`, `Statistic`, `Timeline`, `Segmented`, `Badge`, `Table`) combined with clean, responsive HTML/SVG bar/burndown meters. |

---

## Feature Dependencies

```
[Project, Milestone, Task Models]
    ├──extended-by──> [Ops Owner & BA Fields]
    │                     ├──enables──> [Stakeholder Workload Analytics]
    │                     └──enables──> [Ops Owner & BA Multi-Filter]
    │
    └──extended-by──> [Jira Linkage Metadata (jiraKey, jiraUrl)]
                          ├──requires──> [Jira Settings & Auth State]
                          │                 └──requires──> [CORS Proxy Configuration]
                          ├──enables──> [Create Jira Issue from Task]
                          └──enables──> [Jira Status Transition Sync]

[PlannedAllocation Ledger (Phase 4)]
    └──enables──> [Execution Date-Range Search]
                      ├──enhances──> [Multi-Criteria Filter Drawer]
                      └──enables──> [Standup / Report Clipboard Exporter]

[Task & Milestone State History]
    └──enables──> [Milestone Burndown & Completion Trends]
```

### Dependency Notes

- **[Ops Owner & BA Fields] extends [Project, Milestone, Task Models]:** Dexie schema version increment required. Must handle backward compatibility for existing v1.0 records (defaulting to empty arrays).
- **[Stakeholder Workload Analytics] requires [Ops Owner & BA Fields]:** Workload calculations group existing `PlannedAllocation` minutes by task/milestone/project `businessAnalysts` and `opsOwners`.
- **[Jira Status Transition Sync] requires [Jira Settings & Auth State]:** API calls require Jira domain, email, API token, and optional CORS proxy URL configured in settings.
- **[CORS Proxy Configuration] required for [Jira Cloud REST API]:** Jira Cloud does not return CORS headers for browser Basic Auth requests. Without a proxy URL, direct browser `fetch` fails with CORS error.
- **[Execution Date-Range Search] requires [PlannedAllocation Ledger]:** Searching tasks by planned work dates queries the allocation table (`date` range), returning the matching tasks regardless of their final deadline.

---

## MVP Definition (Milestone v1.1)

### Launch With (v1.1)

Minimum viable enhancements to satisfy banking IT requirements and Jira workflow integration:

- [ ] **SHB Domain Fields:** Add `opsOwners` and `businessAnalysts` (`string[]`) to Project, Milestone, and Task models with Ant Design tag inputs and parent-fallback display.
- [ ] **Jira Connection Settings:** Store Jira domain, email, optional CORS proxy URL, default project key, and default issue type. Keep API token in session memory. Include "Test Connection" button.
- [ ] **Create Jira Issue:** Modal/drawer action on Task to create issue in Jira Cloud and link back `jiraKey` and `jiraUrl`.
- [ ] **Link Existing Jira Issue:** Manual entry of Jira key on Task with fetch of summary and status.
- [ ] **Jira Status Transition:** Fetch available transitions for linked issue and allow one-click transition execution from task view.
- [ ] **Date-Range Task Search:** Search tasks across Planned Execution Date range, Deadline range, and Actual Date range with presets (This Week, Next Week, This Month, Custom).
- [ ] **Multi-Criteria Filter Drawer/Bar:** Filter tasks by status, priority, project, milestone, Ops Owner, BA, and Jira status.
- [ ] **Analytics Dashboard - Milestone Burndown:** Milestone status distribution, completed vs remaining hours, and delivery health flags.
- [ ] **Analytics Dashboard - Stakeholder Breakdown:** Table and bar visual showing planned hours and task counts grouped by BA and Ops Owner.
- [ ] **Standup Summary Exporter:** Quick "Copy Standup Markdown" to clipboard for daily/weekly reporting.

### Add After Validation (v1.2+)

Features to add once core banking IT fields and Jira connectivity are proven:

- [ ] **Bulk Jira Status Transition:** Transition multiple linked tasks at once after milestone completion.
- [ ] **Custom Jira Field Mapping:** Map custom Jira fields (e.g. Jira `customfield_10010` sprint or component) to local task attributes.
- [ ] **Saved Filter Combinations (PROD-01):** Persist named search/filter presets (e.g. "My SHB Core Banking Tasks - Due This Week") in IndexedDB.
- [ ] **Richer Velocity & Throughput Trends:** Multi-sprint velocity tracking (average completed hours per week over past 8 weeks).

### Future Consideration (v2+)

- [ ] **Jira Personal Access Token (PAT) support for Jira Data Center:** Support on-prem Jira DC environments if migrated away from Jira Cloud.
- [ ] **Two-way conflict resolution:** Detailed diff inspector if Jira issue summary/description deviates from local task note.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Ops Owner & BA fields in models & forms | HIGH | LOW | P1 |
| Parent Ops/BA inheritance & badge display | MEDIUM | LOW | P1 |
| Jira configuration & connection test | HIGH | MEDIUM | P1 |
| Create Jira issue from task | HIGH | MEDIUM | P1 |
| Link existing Jira issue by key | HIGH | LOW | P1 |
| Jira status transition execute | HIGH | MEDIUM | P1 |
| Date-range search (execution vs deadline) | HIGH | MEDIUM | P1 |
| Multi-criteria task filter (BA/Ops/Project) | HIGH | MEDIUM | P1 |
| Milestone burndown & status distribution | HIGH | MEDIUM | P1 |
| Stakeholder (BA/Ops) workload breakdown | HIGH | MEDIUM | P1 |
| Standup summary clipboard copy | MEDIUM | LOW | P1 |
| Status transition mapping config | MEDIUM | MEDIUM | P2 |
| Saved filter presets | MEDIUM | MEDIUM | P2 |
| Bulk Jira transition | LOW | HIGH | P3 |
| Two-way conflict resolution engine | LOW | HIGH | P3 |

**Priority key:**
- **P1:** Must have for v1.1 milestone launch
- **P2:** Should have, implement if time permits or in immediate patch
- **P3:** Nice to have, defer to v2+

---

## Competitor & Alternative Analysis

| Feature | Jira Native UI | Generic Task Apps (Todoist / TickTick) | Personal Workload Planner (Our Approach) |
|---------|----------------|----------------------------------------|------------------------------------------|
| **Ops Owner & BA Attribution** | Requires Jira admin custom fields, rigid user accounts, and license for each person. | Single "Assignee" or custom label/tag with no domain hierarchy. | First-class `opsOwners` and `businessAnalysts` tags across Project, Milestone, and Task with automatic hierarchy inheritance. |
| **Execution Date vs Deadline Planning** | Start Date and Due Date exist, but no daily hour ledger against developer capacity. | Tasks are either scheduled on a day or due on a day; cannot spread a 16h task over 3 days. | Full integration between daily planned hour allocation ledger and date-range search. |
| **Jira Integration** | Native, but heavy, slow, and exposes whole enterprise backlog. | Third-party Zapier/Make integrations or complex marketplace plugins. | Direct, client-side REST bridge via personal API token & optional CORS proxy. Instant issue creation and status transition. |
| **Stakeholder Capacity Analytics** | Requires Jira Service Management or complex Jira dashboards / EazyBI plugins. | None. Analytics only track personal task completion counts. | Direct pivot breakdown: planned hours and open tasks grouped by BA and Ops Owner over any date horizon. |
| **Data Privacy & Offline Availability** | Dependent on corporate network/VPN and Atlassian Cloud uptime. | Cloud-dependent, multi-tenant database. | 100% offline-first IndexedDB storage with optional encrypted GitHub backup. |

---

## Sources

- [Atlassian Jira Cloud REST API Developer Documentation](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/) — Issue creation, transitions, and issue link endpoints.
- [Atlassian Developer Community: CORS and Basic Authentication](https://community.atlassian.com/t5/Jira-questions/CORS-issue-with-Jira-REST-API/qa-q/1381387) — Browser CORS limitations on Jira Cloud API token requests and proxy requirement.
- [Ant Design Component Specifications](https://ant.design/components/select/) — `Select mode="tags"` behavior and tokenization patterns.
- [Project Specification & v1.0 Milestone Context](.planning/PROJECT.md) — Domain constraints, existing models, and v1.1 milestone targets.

---
*Feature research for: Banking IT Enhancements & Jira Cloud Integration (Milestone v1.1)*
*Researched: 2026-09-27*
