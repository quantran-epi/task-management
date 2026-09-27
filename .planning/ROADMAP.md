# Roadmap: Personal Task & Workload Planner

## Overview

Deliver a production-ready, client-side, offline-first task and capacity planning PWA deployed on GitHub Pages. The roadmap progresses through eight cohesive phases: foundational IndexedDB persistence and CI/CD shell; full hierarchical work and task management; weekly capacity and daily ledger allocations; deterministic feasibility checking and lowest-load suggestions; multi-horizon dashboard forecasting; safe JSON backup import/export; PWA offline and lifecycle hardening; and optional client-side encrypted GitHub backup synchronization.

## Phases

- [ ] **Phase 1: Foundation & Deployment Shell** - Scaffolding, GitHub Actions Pages deployment, Dexie IndexedDB persistence, UUIDs, migrations, and responsive shell. (gap closure in progress)
- [ ] **Phase 2: Work Hierarchy & Fast Task Management** - Projects, milestones, and task CRUD with reparenting, cascading confirmations, search, filters, and fast controls.
- [x] **Phase 3: Capacity Model & Daily Planning Ledger** - Weekly capacity templates, per-date overrides, daily minute allocations, and accessible load status indicators. (gap closure in progress) (completed 2026-09-26)
- [x] **Phase 4: Feasibility Engine & Workload Distribution** - Deadline and range feasibility checks with deterministic lowest-load candidate distributions. (completed 2026-09-27)
- [x] **Phase 5: Actionable Dashboard & Workload Forecasting** - Today, urgent, 7-day, 14-day, and next-month workload forecasting with direct navigation links. (completed 2026-09-27)
- [x] **Phase 6: Safe Local Backup & Restore** - Complete JSON backup export, Zod structural validation, pre-import snapshots, and non-destructive restore failures. (completed 2026-09-27)
- [ ] **Phase 7: PWA Offline Capability & Lifecycle Hardening** - Installable manifest, Workbox offline caching, non-destructive update prompts, and cross-browser audit.
- [ ] **Phase 8: Optional Encrypted GitHub Backup** - Browser-side PBKDF2/AES-GCM encryption, runtime-only credentials, GitHub Contents API backup push/pull, and conflict protection.

## Phase Details

### Phase 1: Foundation & Deployment Shell

**Goal**: Establish repository runtime, GitHub Pages CI/CD, Dexie IndexedDB persistence, UUID generation, migration framework, and Ant Design responsive application shell
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, PWA-04, PWA-05, UX-01
**Success Criteria** (what must be TRUE):

  1. User can access deployed static application at GitHub Pages subpath `/task-management/` on desktop and mobile screens.
  2. User data created in session persists across browser restarts and page reloads via IndexedDB.
  3. Planning records persist canonical string dates (`YYYY-MM-DD`) and integer minutes without timezone drift.
  4. Database migration framework executes cleanly and provides clear notification when another tab blocks upgrade.

**Plans**: 4 plans
**UI hint**: yes
Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Scaffold runtime, core models, UUID generator, date utilities, and Dexie persistence substrate with capacity seeds (DATA-01, DATA-02, DATA-03)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Implement responsive Ant Design shell, hash routing, multi-tab upgrade alert modal, and guarded reset (DATA-04, UX-01)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — Configure static production build for subpath hosting and implement GitHub Actions CI/CD deployment workflow (PWA-04, PWA-05)

**Wave 4** *(gap closure)*

- [x] 01-04-PLAN.md — Resolve dark mode header/sider contrast, add unique dayOfWeek index, and make capacity seeding atomic (UX-01, DATA-02)

### Phase 2: Work Hierarchy & Fast Task Management

**Goal**: Enable CRUD and hierarchy movement for projects, milestones, and tasks with validation, cascade protection, search, filtering, and inline controls
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: WORK-01, WORK-02, WORK-03, WORK-04, WORK-05, TASK-01, TASK-02, TASK-03, TASK-04, TASK-05, TASK-06, UX-02, UX-03, UX-05
**Success Criteria** (what must be TRUE):

  1. User can create, edit, view, and delete projects, milestones, and standalone/project/milestone tasks.
  2. User can reparent tasks between standalone, project-level, and milestone-level placement while retaining original stable UUIDs.
  3. Deletion of projects or milestones requires explicit user confirmation before cascading to child records.
  4. User can search items by text and filter/sort by status, project, priority, and date horizon.
  5. User can adjust task status and progress percentages via quick controls without navigating into full modal editors.

**Plans**: 3 plans
**UI hint**: yes
Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Implement typed Dexie repositories, Zod validation schemas, time estimate utilities, task reparenting, and atomic cascade deletions (WORK-01, WORK-02, WORK-03, WORK-04, WORK-05, TASK-02, TASK-04)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02-PLAN.md — Build in-memory task filtering/sorting, keyboard shortcuts, fast inline controls, QuickAddBar, and TaskDrawer with cascading reparenting (WORK-03, WORK-04, TASK-01, TASK-02, TASK-03, TASK-05, TASK-06, UX-02, UX-03, UX-05)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-03-PLAN.md — Assemble unified TasksView, TaskFilterBar, TaskTable with batch actions, expandable ProjectTable, CascadeDeleteModal, and route integration (WORK-01, WORK-02, WORK-03, WORK-04, WORK-05, TASK-03, TASK-04, TASK-05, TASK-06, UX-02, UX-05)

### Phase 3: Capacity Model & Daily Planning Ledger

**Goal**: Configure weekly work capacity, per-date overrides, and assign or edit planned task minutes per calendar date with load state indicators
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: CAP-01, CAP-02, CAP-03, CAP-04, PLAN-01, PLAN-02, PLAN-03, PLAN-04, PLAN-05, PLAN-06
**Success Criteria** (what must be TRUE):

  1. User can configure weekly base capacity in minutes (seeded at 8h M-F, 0h Sa-Su) and add specific date overrides for leave or overtime.
  2. User can assign, edit, and delete planned minutes per task across calendar dates and view total allocated minutes against estimate.
  3. User can inspect daily capacity, total allocations, and net balance with load states (available, busy, overloaded, no-capacity) displayed via text, icons, and color.
  4. Allocations on Done or Cancelled tasks remain stored in historical records but are omitted from active daily capacity calculations.

**Plans**: 4 plans
**UI hint**: yes
Plans:
**Wave 1**

- [x] 03-01-PLAN.md — Implement weekly capacity rules, date overrides repository, pure capacity engine, and settings configuration UI (CAP-01, CAP-02, CAP-03, CAP-04)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03-02-PLAN.md — Build daily task allocation ledger repository, allocation modal with estimate tracking, and TaskDrawer integration (PLAN-01, PLAN-02, PLAN-05, PLAN-06)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 03-03-PLAN.md — Assemble 7-day weekly planner board, accessible load indicators, responsive grid, and route integration (PLAN-03, PLAN-04, UX-02, UX-03, UX-04, UX-05)

**Wave 4** *(gap closure)*

- [x] 03-04-PLAN.md — Fix desktop grid column squashing, day header overclipping, and task card label truncation (PLAN-03, PLAN-04, UX-02, UX-04)

### Phase 4: Feasibility Engine & Workload Distribution

**Goal**: Calculate whether task estimates fit dates or deadlines and generate deterministic lowest-load candidate distributions requiring user acceptance
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: CALC-01, CALC-02, CALC-03, CALC-04, CALC-05, CALC-06
**Success Criteria** (what must be TRUE):

  1. User can test whether an unallocated task estimate fits within a chosen date range or deadline.
  2. Calculation evaluates base weekly capacity, date overrides, non-working days, and existing active allocations.
  3. User receives clear feasible/infeasible determination with explicit surplus or deficit in hours and minutes.
  4. Feasible tasks generate a deterministic suggested allocation distribution prioritizing lowest-load days (ties broken by earlier date).
  5. Candidate allocations require explicit user review and confirmation before writing to IndexedDB.

**Plans**: 3 plans
**UI hint**: yes
Plans:
**Wave 1**

- [x] 04-01-PLAN.md — Build pure feasibility calculation engine, deficit metrics, forward date projection, and distribution algorithms (CALC-01, CALC-02, CALC-03, CALC-04, CALC-05)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 04-02-PLAN.md — Build interactive FeasibilityModal, candidate review table, date inspection breakdown, and atomic commit workflow (CALC-03, CALC-04, CALC-05, CALC-06)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 04-03-PLAN.md — Integrate entry points in TaskDrawerPlanning, PlannerView, and TasksView with end-to-end integration tests (CALC-01, CALC-06)

### Phase 5: Actionable Dashboard & Workload Forecasting

**Goal**: Deliver actionable today, urgent, 7-day, 14-day, and next-month workload views with direct links to tasks and dates
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06
**Success Criteria** (what must be TRUE):

  1. User can view overdue tasks, urgent work, and today's allocated workload versus available capacity on landing.
  2. User can inspect visual workload distributions and overload warnings across 7-day, 14-day, and next-month projection horizons.
  3. Dashboard metrics provide direct clickable links that navigate immediately to targeted tasks or planning dates.

**Plans**: 4 plans
**UI hint**: yes
Plans:
**Wave 1**

- [x] 05-01-PLAN.md — Define dashboard types, pure domain utilities, and hash route query parameter parsing (DASH-01, DASH-04, DASH-05, DASH-06) (completed 2026-09-27)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 05-02-PLAN.md — Build Today Summary KPI card and Attention Today task list with inline controls (DASH-01, DASH-02, DASH-06)
- [x] 05-03-PLAN.md — Build multi-horizon forecasting hook, MiniDayCard grid, and Overload Alert banner (DASH-03, DASH-04, DASH-05, DASH-06) (completed 2026-09-27)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 05-04-PLAN.md — Assemble DashboardView, update Navigation and App default routing, and synchronize PlannerView (DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06)

### Phase 6: Safe Local Backup & Restore

**Goal**: Export versioned JSON backups and safely restore data with schema validation, pre-import snapshots, and failure protection
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: BACK-01, BACK-02, BACK-03, BACK-04, BACK-05, UX-04
**Success Criteria** (what must be TRUE):

  1. User can download a complete JSON backup containing application metadata, versioning, and all domain records.
  2. User can select an import file and inspect application version, creation timestamp, and record counts prior to execution.
  3. Application performs strict structural and referential validation, preventing corrupted imports from modifying existing records.
  4. System takes a local snapshot before replacement and requires explicit confirmation before overwriting existing data.
  5. Backup and restore outcomes are announced with visible screen status messages and assistive-technology alerts.

**Plans**: 2 plans
**UI hint**: yes
Plans:
**Wave 1**

- [x] 06-01-PLAN.md — Build export payload engine, timestamped download, aria-live announcement region, and settings two-tab layout (BACK-01, UX-04)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 06-02-PLAN.md — Build strict validation engine, atomic restore and snapshot rollback services, comparison modal with RESTORE gate, and snapshot management card (BACK-02, BACK-03, BACK-04, BACK-05, UX-04)

### Phase 7: PWA Offline Capability & Lifecycle Hardening

**Goal**: Make application fully installable and operational offline with non-disruptive update prompts and cross-browser support
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: PWA-01, PWA-02, PWA-03, PWA-06
**Success Criteria** (what must be TRUE):

  1. User can install application directly to desktop or mobile home screen via browser PWA prompts.
  2. User can load and operate all previously accessed core task management, capacity, and dashboard views without network connectivity.
  3. Service worker update triggers a non-disruptive update banner that prevents reload activation during pending local database writes.
  4. Core task, planning, dashboard, and backup workflows operate without error across Chrome, Edge, Firefox, and Safari.

**Plans**: TBD
**UI hint**: yes

### Phase 8: Optional Encrypted GitHub Backup

**Goal**: Enable manual browser-side PBKDF2/AES-GCM encrypted backup upload and restore via GitHub Contents API with conflict detection and memory-only secrets
**Mode:** mvp
**Depends on**: Phase 7
**Requirements**: SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05, SYNC-06, SYNC-07
**Success Criteria** (what must be TRUE):

  1. User can input GitHub personal access token and encryption passphrase at runtime without values persisting to disk, bundle, or logs.
  2. Closing or refreshing browser tab completely purges GitHub credentials and passphrase from memory.
  3. User can export and encrypt backup payload in-browser via Web Crypto (PBKDF2/AES-GCM) and upload to `.task-management/backup.enc.json`.
  4. User can download, decrypt, validate, preview, and restore encrypted remote backup.
  5. Application tracks remote file SHA and halts upload with explicit conflict notification if remote file changed since last read.
  6. Application remains 100% operational offline and for local JSON backups without GitHub token or internet access.

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|---|---|---|---|
| 1. Foundation & Deployment Shell | 4/4 | Complete | 2026-09-26 |
| 2. Work Hierarchy & Fast Task Management | 2/3 | In Progress|  |
| 3. Capacity Model & Daily Planning Ledger | 4/4 | Complete   | 2026-09-26 |
| 4. Feasibility Engine & Workload Distribution | 3/3 | Complete   | 2026-09-27 |
| 5. Actionable Dashboard & Workload Forecasting | 4/4 | Complete   | 2026-09-27 |
| 6. Safe Local Backup & Restore | 2/2 | Complete   | 2026-09-27 |
| 7. PWA Offline Capability & Lifecycle Hardening | 0/TBD | Not started | - |
| 8. Optional Encrypted GitHub Backup | 0/TBD | Not started | - |
