---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Banking IT Enhancements & Jira Integration
status: ready to plan
last_updated: "2026-09-27T16:45:00.000Z"
last_activity: 2026-09-27
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-27)

**Core value:** Make planned work realistically fit available time by exposing overload early and suggesting feasible daily workload distributions.
**Current focus:** Milestone v1.1 — Banking IT Enhancements & Jira Integration

## Current Position

Phase: Phase 9: Banking IT Domain Fields & Work Types
Plan: —
Status: Ready for planning
Last activity: 2026-09-27 — Roadmap created for milestone v1.1 (Phases 9-13)

## Performance Metrics

**Velocity:**

- Total plans completed: 28 (v1.0)
- Average duration: 13.5 min
- Total execution time: 1.58 hours

**Historical by Phase (v1.0):**

| Phase | Plans | Total | Avg/Plan |
|---|---|---|---|
| 1. Foundation & Deployment Shell | 4 | 39m | 9.8m |
| 2. Work Hierarchy & Fast Task Management | 3 | 53m | 17.6m |
| 3. Capacity Model & Daily Planning Ledger | 4 | 59m | 14.8m |
| 4. Feasibility Engine & Workload Distribution | 3 | 45m | 15.0m |
| 5. Actionable Dashboard & Workload Forecasting | 3 | 34m | 11.3m |
| 6. Safe Local Backup & Restore | 3 | 28m | 9.3m |
| 7. PWA Offline Capability & Lifecycle Hardening | 4 | 38m | 9.5m |
| 8. Optional Encrypted GitHub Backup | 3 | 43m | 14.3m |

## Accumulated Context

### Decisions

Decisions logged across v1.0 and v1.1:

- [Milestone v1.1]: Defined tight 5-phase roadmap (Phases 9-13) covering Banking IT domain fields, search, Jira integration, notifications, and workload analytics.
- [Milestone v1.1]: Zero new dependencies — native React SVG for burndown chart, native fetch + Basic Auth for Jira REST API v3, Dexie v2 multi-entry indexes.
- [Roadmap]: Structured into 8 vertical delivery phases adhering to standard granularity and dependency constraints (v1.0).
- [Roadmap]: Prioritized local file backup and restore (Phase 6) before encrypted GitHub backup integration (Phase 8).
- [Roadmap]: Retained strict runtime session storage for GitHub credentials and Web Crypto passphrases.
- [Phase 01]: Used jsdom@29.1.1 to align with Node 20.19.5 engine requirements avoiding undici 8 webidl incompatibility
- [Phase 01]: Explicitly added @testing-library/dom peer dependency to support jest-dom test matchers in Vitest
- [Phase 01]: Configured JSDOM matchMedia mock in tests/setup.ts to simulate desktop min-width breakpoints for Ant Design ResponsiveObserver
- [Phase 01]: Added @testing-library/jest-dom/vitest to tsconfig.json types to provide full DOM assertion typing
- [Phase 01]: Configured GitHub Actions workflow with strict least-privilege permissions: contents: read, pages: write, id-token: write
- [Phase 01]: Enforced test execution step (npm test) prior to build and deployment in CI workflow
- [Phase 01]: Header background dynamically references token.colorBgContainer with token.colorBorderSecondary border to prevent dark mode contrast failure (CR-01)
- [Phase 01]: Sider theme dynamically switches to dark in dark mode via isDark prop (CR-01)
- [Phase 01]: Enforced unique index &dayOfWeek on capacityRules table to prevent duplicate weekday rows (CR-02)
- [Phase 01]: initializeDatabaseDefaults wrapped in atomic readwrite transaction with ConstraintError handling for multi-tab concurrency (CR-02)
- [Phase 01]: App.tsx queries capacity rules ordered by dayOfWeek (WR-01)
- [Phase 01]: ResetDbModal catches reset errors with logging (WR-02)
- [Phase 2]: Preserved exactOptionalPropertyTypes strict typing in repositories by using conditional assignment rather than spreading undefined values into models.
- [Phase 2]: Quick-add parser uses lastIndexOf('~') and regex matching on the trailing token to handle unspaced and multi-token task names robustly.
- [Phase 2]: Atomic transactions wrap all multi-table deletion routines in cascadeRepo, cleaning up plannedAllocations to eliminate orphaned allocations.
- [Phase 2]: Configured JSDOM global.ResizeObserver mock in tests/setup.ts to support Ant Design 6 dropdown, popover, and select animations
- [Phase 2]: Configured fileParallelism: false in vite.config.ts test runner to prevent Windows worker thread timeouts across concurrent test files
- [Phase 2]: Used strict YYYY-MM-DD calendar string comparisons in matchesHorizon to eliminate timezone drift across UTC midnight (T-02-06)
- [Phase 2]: Defaulted CascadeDeleteModal action to task-preserving orphan mode to prevent accidental data loss (T-02-08, D-13, D-14)
- [Phase 2]: Wrapped batch mutations in Dexie atomic transactions to guarantee data consistency during multi-record updates (T-02-09, D-11)
- [Phase 03]: Specific date overrides take precedence over weekly template rules in getEffectiveDailyCapacity
- [Phase 03]: Enforced unique constraint per (taskId, date) by transactional check-and-update in upsertAllocation per D-12
- [Phase 03]: Implemented date collision resolution in updateAllocation: moving an allocation to an already allocated date merges records per PLAN-02
- [Phase 03]: Filtered task status in getAllocationsForDate and getWeeklyAllocationsWithTasks to strictly exclude Done and Cancelled tasks from active load sums per PLAN-05 and D-16
- [Phase 03]: Displayed soft orange warning Alert when cumulative planned time exceeds task estimate without blocking saving per D-10 and PLAN-06
- [Phase 03]: Rendered inactive Done and Cancelled task allocation cards with 50% opacity, strikethrough, and exclusion badges per D-16
- [Phase 03]: Primary view on /#/planner displays 7-day Monday through Sunday grid with reactive capacity metrics per D-01
- [Phase 03]: Dual-encoded day column header with color, text, and icons satisfying WCAG 2.1 AA for all 4 load states (available, busy, overloaded, no-capacity) per D-14, D-15, PLAN-04
- [Phase 03]: Flagged days with >4 tasks using an accessible high context switching warning tag per D-13
- [Phase 03]: Implemented WeekNavigator with prev/next week controls, Today shortcut, and DatePicker week selector with Alt+Left/Right and Alt+T keyboard shortcuts per D-02
- [Phase 03]: Provided Show Completed toggle allowing muted display of Done/Cancelled tasks while strictly excluding them from active daily load sums per D-16, PLAN-05
- [Phase 03]: Mounted PlannerView and SettingsView on /#/planner and /#/settings routes without placeholder empty states
- [Phase 03]: Expanded desktop weekly grid column min-width from 135px to 180px with overflow-x auto to prevent squashing columns
- [Phase 03]: DayColumnHeader top row and metrics row wrap dynamically to avoid truncation in constrained widths
- [Phase 03]: TaskAllocationCard converted to 2-tier stacked structure with full-width 2-line clamped task titles
- [Phase 04]: Hard-capped forward projection search in findEarliestFeasibleDate at 365 days max to prevent DoS loops (T-04-01)
- [Phase 04]: Clamped remaining unallocated minutes and validated non-negative numbers to guard against numeric tampering (T-04-02)
- [Phase 04]: Consolidated non-quantum residual (< 15m) into first eligible day with available room per D-07
- [Phase 04]: Broken load ratio ties in distributeBalancedSpread and distributeGreedyFill deterministically using earlier calendar date string comparison
- [Phase 04]: Preserved candidates in local component state overrides without mutating IndexedDB during inline minute adjustments or checkbox toggling (T-04-03, CALC-06)
- [Phase 04]: Integrated action shortcuts Extend to Earliest Feasible Date and Allocate Available Capacity directly into warning alert banner (D-10, D-12)
- [Phase 04]: Implemented atomic multi-record commit inside Dexie transaction calling upsertAllocation for each selected candidate with merged existing minutes (D-08, D-16)
- [Phase 04]: Guarded FeasibilityModal live queries to only execute when open=true, avoiding background query overhead when closed
- [Phase 04]: Implemented on-demand direct db.tasks queries in PlannerView and TasksView toolbar triggers to guarantee immediate task resolution
- [Phase 05]: Extended AppRoute union with 'dashboard' as primary route
- [Phase 05]: Sanitized hash route date parameter via strict isValidCalendarDate check to prevent tampering (T-05-01)
- [Phase 05]: Whitelisted hash route against AppRoute union defaulting to 'dashboard' (T-05-02)
- [Phase 05]: Capped max forecast horizon at 30 days per threat model T-05-05
- [Phase 05]: Clamped MiniDayCard progress percent between 0 and 100 per threat model T-05-06
- [Phase 06]: Excluded settings and backupMetadata tables from exported backup payload to preserve client preferences and prevent token leaks (D-02, T-06-01)
- [Phase 06]: Formatted backup file name as task-planner-backup-YYYY-MM-DD-HHmmss.json for deterministic sorting and uniqueness (D-03)
- [Phase 06]: Logged export event into backupMetadata table upon each successful export for UI history (D-04)
- [Phase 06]: Implemented centralized AriaLiveRegion event dispatcher for accessible screen reader status feedback (D-15, UX-04)
- [Phase 06]: Restructured SettingsView into two tabs: 'capacity' (Công suất làm việc) and 'data' (Sao lưu & Dữ liệu) (D-16)
- [Phase 06]: Enforced two-stage validation separating structural envelope checks from in-memory referential integrity checks
- [Phase 06]: Automatically captured pre-import snapshot of 6 domain tables into settings.last_pre_import_snapshot before any destructive write
- [Phase 06]: Bound danger confirm button in ImportPreviewModal to exact keyword RESTORE to prevent accidental triggers
- [Phase 06]: Wrap downloadSnapshotFile payload in BackupEnvelope with APP_MARKER, CURRENT_SCHEMA_VERSION, and snapshot timestamp for re-import compatibility
- [Phase 07]: Configured VitePWA with registerType: 'prompt' to prevent unprompted auto-skipWaiting during active writes
- [Phase 07]: Set navigateFallback to /task-management/index.html to prevent 404s on deep hash navigation in GitHub Pages
- [Phase 07]: FormGuardContext tracks active editing sessions across drawers and modals to prevent data loss on reload
- [Phase 07]: Requested storage persistence automatically on boot alongside database seed initialization
- [Phase 07]: Gated StorageManager APIs defensively behind feature detection with empty state fallback for private/legacy browsers
- [Phase 07]: Displayed storage mode, quota progress, and safe advisory alert recommending JSON backups when unpersisted
- [Phase 07]: Surfaced PWA lifecycle status and manual update check trigger in Settings data tab
- [Phase 07]: Wrapped BeforeInstallPromptEvent prompt() in try/catch/finally to unconditionally nullify prompt reference and prevent InvalidStateError on dismissal
- [Phase 07]: Created ServiceWorkerContext provider as singleton at AppShell root to eliminate duplicate SW registrations and timer leaks
- [Phase 07]: Added useRegisterActiveForm hook and wired all 6 editing drawers and modals to prevent data loss on update reload
- [Phase 08]: OWASP-compliant PBKDF2 with 600,000 iterations and HMAC-SHA256 for browser-side AES-GCM-256 key derivation
- [Phase 08]: Strict transient in-memory secret holder with zero writes to IndexedDB, localStorage, sessionStorage, or logs
- [Phase 08]: Repository coordinates (owner, repo, branch) persisted in IndexedDB settings while PAT and passphrase remain in memory
- [Phase 08]: GitHubConfigCard mounted in SettingsView Data tab coexisting cleanly with local backup
- [Phase 08]: Native fetch for GitHub Contents API with Bearer token authentication and token redaction from errors (T-08-05)
- [Phase 08]: Pre-flight GET checks current blob SHA against last_synced_sha before payload assembly and upload (D-06, SYNC-06)
- [Phase 08]: Guarded conflict modal requires exact OVERWRITE keyword to prevent destructive accidental remote overwrites (D-08, T-08-08)
- [Phase 08]: Push orchestrator automatically creates .task-management/backup.enc.json on HTTP 404 without prior SHA (D-09)
- [Phase 08]: Record last_synced_sha and last_synced_at into db.settings and log audit trail to db.backupMetadata (D-17)
- [Phase 08]: Decrypted remote backup must validate structural and referential integrity using Phase 6 validation engine before touching IndexedDB
- [Phase 08]: Passphrase prompt modal activates only when in-memory passphrase is missing or incorrect, allowing seamless one-click pull when already entered
- [Phase 08]: Restoring remote backup executes atomically with pre-import safety snapshot in settings.last_pre_import_snapshot, requiring explicit RESTORE confirmation
- [Phase 08]: Corrupt remote payloads halt restore with zero local database mutation and provide immediate raw un-decrypted file download for offline diagnostics
- [Phase 08]: Local operations, weekly capacity configuration, and local JSON export/import operate 100% autonomously without network access or GitHub credentials

### Pending Todos

None yet.

### Blockers/Concerns

None.

## Deferred Items

| Category | Item | Status | Deferred At |
|---|---|---|---|
| *(none)* | - | - | - |

## Session Continuity

Last session: 2026-09-27T16:45:00.000Z
Stopped at: Roadmap created for Milestone v1.1
Resume file: .planning/ROADMAP.md

## Operator Next Steps

- Execute `/gsd-plan-phase 9` to plan Phase 9: Banking IT Domain Fields & Work Types
