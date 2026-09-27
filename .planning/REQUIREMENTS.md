# Requirements: Personal Task & Workload Planner

**Defined:** 2026-09-26
**Core Value:** Make planned work realistically fit available time by exposing overload early and suggesting feasible daily workload distributions.

## v1 Requirements

### Data Foundation

- [x] **DATA-01**: User-created projects, milestones, tasks, capacity overrides, and task allocations each retain a stable UUID across edits, moves, exports, imports, and synchronization.
- [x] **DATA-02**: User data persists locally in IndexedDB across reloads and browser restarts.
- [x] **DATA-03**: Planning dates persist as calendar-date values independent of timezone, while estimates, capacity, and allocations persist as integer minutes.
- [x] **DATA-04**: Application upgrades migrate supported existing data without silent loss and explain when another open tab blocks an upgrade.

### Work Hierarchy

- [x] **WORK-01**: User can create, view, edit, and delete a project with name, description, deadline, notes, and status.
- [x] **WORK-02**: User can create, view, edit, and delete multiple milestones under a project with name, description, deadline, notes, and status.
- [x] **WORK-03**: User can create, view, edit, and delete a standalone task, a task directly under a project, or a task under a project milestone.
- [x] **WORK-04**: User can move a task between standalone, project-level, and milestone-level placement without changing its stable ID.
- [x] **WORK-05**: User receives an explicit confirmation before deletion cascades to child records; cancellation leaves records available.

### Task Details

- [x] **TASK-01**: User can record task name, description, deadline, notes, actual start date, actual end date, status, progress percentage, priority, estimate, and document links.
- [x] **TASK-02**: User can enter estimates using hours and minutes while the application stores an exact integer-minute value.
- [x] **TASK-03**: User can use task statuses Open, In Progress, Resolved, In Review, Done, and Cancelled.
- [x] **TASK-04**: User can use project and milestone statuses Open, In Progress, Done, and Cancelled.
- [x] **TASK-05**: User can search work items by text and filter or sort tasks by status, project, priority, and date horizon.
- [x] **TASK-06**: User can update task status and progress through fast controls without opening a complex editor.

### Capacity

- [x] **CAP-01**: User can configure available work minutes for each weekday using a weekly template.
- [x] **CAP-02**: New local data starts with 8 hours for Monday through Friday and 0 hours for Saturday and Sunday, and every value remains editable.
- [x] **CAP-03**: User can override capacity for a specific date, including zero-capacity leave and increased-capacity overtime.
- [x] **CAP-04**: Effective daily capacity uses a date override when one exists and otherwise uses the matching weekly-template value.

### Workload Planning

- [x] **PLAN-01**: User can assign planned hours and minutes from a task to individual calendar dates.
- [x] **PLAN-02**: User can edit or remove a daily task allocation and see the task's total allocated time.
- [x] **PLAN-03**: User can see each date's capacity, allocated time, and remaining or excess time.
- [x] **PLAN-04**: User can distinguish available, busy, overloaded, and no-capacity days using text or icons in addition to color.
- [x] **PLAN-05**: Done and Cancelled task allocations remain stored for history but are excluded from active workload totals.
- [x] **PLAN-06**: User can manually adjust suggested or existing allocations before saving them.

### Feasibility Calculator

- [x] **CALC-01**: User can evaluate a task estimate against an inclusive date range or a deadline.
- [x] **CALC-02**: Feasibility calculation accounts for weekly capacity, date overrides, zero-capacity days, and existing active allocations.
- [x] **CALC-03**: User receives a clear feasible or infeasible result with remaining capacity or shortage in hours and minutes.
- [x] **CALC-04**: User can inspect which dates were available, full, overloaded, or excluded from the calculation.
- [x] **CALC-05**: When capacity permits, user receives a deterministic candidate distribution that favors eligible dates with the lowest current load and uses earlier dates to break ties.
- [x] **CALC-06**: Suggested allocations do not modify saved data until the user reviews and accepts them.

### Dashboard

- [x] **DASH-01**: User can see tasks requiring attention today, including overdue and urgent work.
- [x] **DASH-02**: User can see today's active planned load, available capacity, and overload status.
- [x] **DASH-03**: User can review active workload and overloaded dates over the next 7 days.
- [x] **DASH-04**: User can review active workload and overloaded dates over the next 14 days.
- [x] **DASH-05**: User can review active workload and overloaded dates for the next calendar month.
- [x] **DASH-06**: Dashboard presents actionable task and date links rather than only aggregate metrics.

### Backup and Restore

- [ ] **BACK-01**: User can export a complete versioned JSON backup of all local application data.
- [ ] **BACK-02**: User can select a backup for import and review its application marker, version, timestamp, and record counts before any local data changes.
- [ ] **BACK-03**: Application validates backup structure, IDs, dates, enums, minute values, and hierarchy references before restore.
- [ ] **BACK-04**: Application creates a recoverable pre-import snapshot and requires explicit confirmation before replacing local data.
- [ ] **BACK-05**: Failed validation, migration, or restore leaves existing local data unchanged and reports the failure.

### GitHub Backup

- [ ] **SYNC-01**: User can enter a fine-grained GitHub token and encryption passphrase at runtime without either value entering source control, exports, logs, or the deployed bundle.
- [ ] **SYNC-02**: Token and passphrase remain in session memory only and are cleared when the tab closes or reloads.
- [ ] **SYNC-03**: User can encrypt a current backup in the browser using a passphrase-derived key and authenticated encryption before upload.
- [ ] **SYNC-04**: User can manually upload the encrypted backup to `.task-management/backup.enc.json` through the GitHub Contents API.
- [ ] **SYNC-05**: User can manually download, decrypt, validate, preview, and explicitly restore the encrypted GitHub backup.
- [ ] **SYNC-06**: Application detects remote-content conflicts using the current file SHA and never silently overwrites or automatically merges a conflicting backup.
- [ ] **SYNC-07**: Local operation and file export/import remain fully functional without GitHub credentials or network access.

### PWA and Delivery

- [ ] **PWA-01**: User can install the application as a PWA on a supported browser.
- [ ] **PWA-02**: User can open and use previously loaded core features without a network connection.
- [ ] **PWA-03**: Application prompts before activating an update that requires reload and avoids interrupting pending data writes.
- [x] **PWA-04**: Production assets, manifest, navigation, and service-worker scope work under the GitHub Pages `/task-management/` repository path.
- [x] **PWA-05**: Application is deployed from the requested GitHub repository using GitHub Actions and GitHub Pages.
- [ ] **PWA-06**: Current Chrome, Edge, Firefox, and Safari can use core task, planning, dashboard, and backup features; install behavior may follow browser capabilities.

### User Experience and Accessibility

- [x] **UX-01**: Application uses Ant Design and responsive layouts for desktop and mobile-width screens.
- [x] **UX-02**: Core create, edit, status, progress, allocation, and navigation actions remain keyboard accessible with visible focus.
- [x] **UX-03**: Forms provide labels, inline validation, safe defaults, and focus restoration after modal or drawer actions.
- [x] **UX-04**: Save, import, encryption, synchronization, and update results are announced in visible text and appropriate assistive-technology status regions.
- [x] **UX-05**: Common task updates and workload adjustments require minimal navigation and avoid mandatory multi-step wizards.

## v2 Requirements

### Planning Productivity

- **PROD-01**: User can save and reuse preferred filter combinations.
- **PROD-02**: User can duplicate a task or create one from a personal template.
- **PROD-03**: User can inspect a simple history of allocation changes.
- **PROD-04**: User can merge selected records from a valid backup rather than replacing all local data.
- **PROD-05**: User can use richer timeline or heatmap interactions after the basic accessible workload view proves useful.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Collaboration, sharing, roles, and permissions | Product is explicitly for one personal user |
| Application backend and account authentication | Conflicts with 100% local and GitHub Pages constraints |
| Live or automatic multi-device synchronization | GitHub integration is manual encrypted backup, not a sync database |
| Recurring tasks | Deferred until core planning loop is validated |
| Subtasks and task dependencies | Add hierarchy and scheduling complexity without proving core value |
| External calendar integration | Manual capacity overrides cover v1 need |
| AI or opaque automatic scheduling | Deterministic, explainable suggestions are safer and sufficient |
| Timers, Pomodoro, and actual-hours tracking | v1 focuses on planned capacity; actual start/end dates remain supported |
| Push and email notifications | Not core and complicates local-only delivery |
| Custom workflows and statuses | Fixed statuses keep UI and projections predictable |
| Gamification and productivity scores | Not aligned with practical workload planning |
| Native mobile application | Responsive installable PWA is sufficient |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 1 | Complete |
| DATA-02 | Phase 1 | Complete |
| DATA-03 | Phase 1 | Complete |
| DATA-04 | Phase 1 | Complete |
| WORK-01 | Phase 2 | Complete |
| WORK-02 | Phase 2 | Complete |
| WORK-03 | Phase 2 | Complete |
| WORK-04 | Phase 2 | Complete |
| WORK-05 | Phase 2 | Complete |
| TASK-01 | Phase 2 | Complete |
| TASK-02 | Phase 2 | Complete |
| TASK-03 | Phase 2 | Complete |
| TASK-04 | Phase 2 | Complete |
| TASK-05 | Phase 2 | Complete |
| TASK-06 | Phase 2 | Complete |
| CAP-01 | Phase 3 | Complete |
| CAP-02 | Phase 3 | Complete |
| CAP-03 | Phase 3 | Complete |
| CAP-04 | Phase 3 | Complete |
| PLAN-01 | Phase 3 | Complete |
| PLAN-02 | Phase 3 | Complete |
| PLAN-03 | Phase 3 | Complete |
| PLAN-04 | Phase 3 | Complete |
| PLAN-05 | Phase 3 | Complete |
| PLAN-06 | Phase 3 | Complete |
| CALC-01 | Phase 4 | Complete |
| CALC-02 | Phase 4 | Pending |
| CALC-03 | Phase 4 | Complete |
| CALC-04 | Phase 4 | Complete |
| CALC-05 | Phase 4 | Complete |
| CALC-06 | Phase 4 | Complete |
| DASH-01 | Phase 5 | Complete |
| DASH-02 | Phase 5 | Complete |
| DASH-03 | Phase 5 | Complete |
| DASH-04 | Phase 5 | Complete |
| DASH-05 | Phase 5 | Complete |
| DASH-06 | Phase 5 | Complete |
| BACK-01 | Phase 6 | Pending |
| BACK-02 | Phase 6 | Pending |
| BACK-03 | Phase 6 | Pending |
| BACK-04 | Phase 6 | Pending |
| BACK-05 | Phase 6 | Pending |
| PWA-01 | Phase 7 | Pending |
| PWA-02 | Phase 7 | Pending |
| PWA-03 | Phase 7 | Pending |
| PWA-04 | Phase 1 | Complete |
| PWA-05 | Phase 1 | Complete |
| PWA-06 | Phase 7 | Pending |
| SYNC-01 | Phase 8 | Pending |
| SYNC-02 | Phase 8 | Pending |
| SYNC-03 | Phase 8 | Pending |
| SYNC-04 | Phase 8 | Pending |
| SYNC-05 | Phase 8 | Pending |
| SYNC-06 | Phase 8 | Pending |
| SYNC-07 | Phase 8 | Pending |
| UX-01 | Phase 1 | Complete |
| UX-02 | Phase 2 | Complete |
| UX-03 | Phase 2 | Complete |
| UX-04 | Phase 6 | Complete |
| UX-05 | Phase 2 | Complete |

**Coverage:**

- v1 requirements: 59 total
- Mapped to phases: 59
- Unmapped: 0

---
*Requirements defined: 2026-09-26*
*Last updated: 2026-09-26 after initial definition*
