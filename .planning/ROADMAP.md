# Roadmap: Personal Task & Workload Planner

## Milestones

- ✅ **v1.0 MVP** — Phases 1-8 (shipped 2026-09-27)
- 🟡 **v1.1 Banking IT Enhancements & Jira Integration** — Phases 9-13 (in progress)

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
- [ ] **Phase 12.1: Task Timer, Work Session Logs & Spent Time Tracking** (INSERTED) - Start/pause/finish task timer, work session persistence across reload, concurrent timers, allocation limit notifications, remaining day feasibility alerts, and spent time aggregation per task, milestone, and project.
- [ ] **Phase 13: Enhanced Workload Analytics & Milestone Burndown** - Dedicated analytics view with lightweight SVG vector burndown, completion velocity metrics, and stakeholder workload allocation breakdowns.

## Phase Details

### Phase 9: Banking IT Domain Fields & Work Types

**Goal**: Enable tracking of Banking IT operational ownership and work classification across all work hierarchy levels with non-destructive schema migration.
**Depends on**: Phase 8 (v1.0 baseline)
**Requirements**: SHB-01, SHB-02, SHB-03, SHB-04, SHB-05
**Success Criteria** (what must be TRUE):

  1. User can assign and edit multiple Ops Owner names on projects, milestones, and tasks.
  2. User can assign and edit multiple Business Analyst (BA) names on projects, milestones, and tasks.
  3. Milestone and task views visually display inherited Ops Owner and BA tags from parent items when not explicitly overridden.
  4. User can assign one of five Work Types ('code', 'document', 'meeting', 'support_testing', 'investigate') to a task with a distinct visual badge.
  5. Existing v1.0 local database records and backup files seamlessly upgrade to schema v2 without data loss or error.

**Plans**: 3/3 plans complete in 3 waves

- [x] 09-01-PLAN.md
- [x] 09-02-PLAN.md
- [x] 09-03-PLAN.md

- [ ] **Wave 1**: 09-01-PLAN.md — Schema v2 migration, model extensions, Zod normalization, and backup v2 compatibility
- [ ] **Wave 2**: 09-02-PLAN.md *(blocked on Wave 1)* — Transactional repositories, distinct tag autocomplete queries, and nearest-ancestor inheritance engine
- [ ] **Wave 3**: 09-03-PLAN.md *(blocked on Wave 2)* — WorkTypeBadge, TagSelect, TagListDisplay, drawer/modal tag inputs, and TaskTable integration

**UI hint**: yes

### Phase 10: Date-Range Search, Multi-Criteria Filtering & Standup Export

**Goal**: Allow users to query scheduled work across execution date windows and copy formatted standup summaries.
**Depends on**: Phase 9
**Requirements**: SRCH-01, SRCH-02, SRCH-03, SRCH-04
**Success Criteria** (what must be TRUE):

  1. User can filter tasks by planned execution date window querying the daily allocation ledger.
  2. User can filter tasks by deadline date range.
  3. User can filter tasks simultaneously by status, priority, workType, project, milestone, Ops Owner, and BA.
  4. User can click a button to copy filtered task results to clipboard as formatted Markdown standup summary.

**Plans**: 2/2 plans complete in 2 waves
**Wave 1**

- [x] 10-01-PLAN.md — Allocation date range query, multi-criteria filter pipeline, tag inheritance, and standup Markdown format utility (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 10-02-PLAN.md — Reactive filter hook, collapsible advanced filter bar UI, active filter badge, and clipboard standup export (Wave 2)

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

**Plans**: 2/3 plans executed
**Wave 1**

- [x] 11-01-PLAN.md — Schema v3 migration, models, Jira REST API v3 client, minimal ADF serializer, status mapping, and Settings Tab 3 with connection diagnostics (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 11-02-PLAN.md — Task detail Jira integration: issue creation modal, manual key linking/unlinking, transition execution with smart status mapping, and TaskDrawer integration (Wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 11-03-PLAN.md — TaskTable and weekly planner Jira Key badges with direct navigation, filter bar Jira search/status filter, and standup summary [JiraKey] formatting (Wave 3)

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

Plans:

- [x] 12-01-PLAN.md — Schema v4, models, validation schemas, reminder form inputs, and task updatedAt touch (Wave 1)
- [x] 12-02-PLAN.md — Alert evaluation engine, day-scoped dismiss repository, and reactive useNotifications hook (Wave 2)
- [x] 12-03-PLAN.md — NotificationBell badge, 5-tab NotificationDrawer, item navigation, and desktop notifications (Wave 3)

**Wave 1**

- [x] 12-01-PLAN.md — Schema v4 migration, models, validation schemas, reminder form inputs, and task updatedAt touch

**Wave 2** *(blocked on Wave 1)*

- [x] 12-02-PLAN.md — Alert evaluation engine, day-scoped dismiss repository, and reactive useNotifications hook

**Wave 3** *(blocked on Wave 2)*

- [x] 12-03-PLAN.md — NotificationBell badge, 5-tab NotificationDrawer, item navigation, and desktop notifications

- [x] 12-03-PLAN.md — NotificationBell badge, 5-tab NotificationDrawer, item navigation, and desktop notifications

**UI hint**: yes

### Phase 12.1: Task timer — start/pause/finish per task, work session logs, reload persistence, multiple concurrent timers, time allocation notifications, spent time aggregations (INSERTED)

**Goal:** Provide a local-first task timer engine (start/pause/finish) with reload persistence, multiple concurrent timers, work session history logs in Dexie SCHEMA_V5, 3-tier allocation & feasibility alerts, and spent time rollups across tasks, milestones, and projects.
**Requirements**: TIMER-01, TIMER-02, TIMER-03, TIMER-04, TIMER-05, TIMER-06, TIMER-07, TIMER-08, TIMER-09
**Depends on:** Phase 12
**Plans:** 2/3 plans executed

Plans:
**Wave 1**
- [x] 12.1-01-PLAN.md — Dexie SCHEMA_V5 (workSessions, activeTimers), models, repository CRUD, spent rollups, cascade cleanup, and backup v3 envelope

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 12.1-02-PLAN.md — TimerContext & useTimer hook with multi-timer concurrency, reload survival, and 3-tier allocation/feasibility alert evaluation engine

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 12.1-03-PLAN.md — AppShell ActiveTimerWidget header capsule/dropdown, TaskTable inline triggers/spent progress, and TaskDrawer WorkSessionsTab history & manual modal

### Phase 13: Enhanced Workload Analytics & Milestone Burndown

**Goal**: Provide visual insights into delivery velocity, milestone burndown, and stakeholder workload distribution.
**Depends on**: Phase 9, Phase 10
**Requirements**: ANLT-01, ANLT-02, ANLT-03
**Success Criteria** (what must be TRUE):

  1. User can view a lightweight SVG vector burndown chart for any selected milestone showing remaining work versus ideal pace.
  2. User can inspect task status distribution bars and completion velocity across projects.
  3. User can view workload allocation broken down by Ops Owner, Business Analyst, and Work Type in both planned hours and active task counts.

**Plans**: TBD
**UI hint**: yes

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
| 9. Banking IT Domain Fields & Work Types | v1.1 | 3/3 | Complete    | 2026-09-28 |
| 10. Date-Range Search, Multi-Criteria Filtering & Standup Export | v1.1 | 2/2 | Complete    | 2026-09-28 |
| 11. Jira Cloud Integration & Task Lifecycle | v1.1 | 3/3 | Complete    | 2026-09-28 |
| 12. In-App Notifications, Proactive Alerts & Custom Reminders | v1.1 | 3/3 | Complete    | 2026-09-29 |
| 12.1. Task Timer, Work Session Logs & Spent Time Tracking | v1.1 | 2/3 | In Progress|  |
| 13. Enhanced Workload Analytics & Milestone Burndown | v1.1 | 0/0 | Not started | - |
