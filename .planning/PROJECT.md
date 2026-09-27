# Personal Task & Workload Planner

## What This Is

A private, offline-first web application for one person to manage projects, milestones, and tasks while planning work against daily capacity. It combines fast task management with workload forecasting, feasibility checks, and suggested daily hour allocation, and runs as an installable PWA hosted on GitHub Pages.

## Core Value

Make planned work realistically fit available time by exposing overload early and suggesting feasible daily workload distributions.

## Current State

Shipped **v1.0 MVP** on 2026-09-27 with all 8 foundational phases complete (28 plans, 69 tasks, 59/59 requirements satisfied, 0 audit gaps). Codebase comprises 14,384 LOC TypeScript/React across 324 files with 386 passing automated tests. Deployed as an installable PWA on GitHub Pages with offline IndexedDB storage and encrypted GitHub backup sync.

## Requirements

### Validated

- ✓ Manage projects, milestones, and standalone or nested tasks through fast, simple interactions. — v1.0
- ✓ Give every project, milestone, task, and planning record a stable identifier. — v1.0
- ✓ Record item details, dates, notes, statuses, task priority, progress, document links, and actual start/end dates. — v1.0
- ✓ Configure normal weekly work capacity with per-date overrides for leave, meetings, overtime, and other exceptions. — v1.0
- ✓ Allocate planned task hours to individual dates and show daily load as available, busy, or overloaded. — v1.0
- ✓ Evaluate whether estimated work fits a date range or deadline and suggest a distribution favoring lowest-load eligible days. — v1.0
- ✓ Show actionable dashboard views for today, urgent work, and workload over 7-day, 14-day, and next-month horizons. — v1.0
- ✓ Persist application data locally in IndexedDB and remain usable offline after installation. — v1.0
- ✓ Export and import complete local backups. — v1.0
- ✓ Synchronize a client-side encrypted backup file through the GitHub Contents API in the same repository. — v1.0
- ✓ Provide a responsive, accessible, productive interface using Ant Design. — v1.0
- ✓ Deploy the static PWA through GitHub Pages. — v1.0

### Active (Next Milestone Candidates)

- [ ] Save and reuse preferred filter combinations (PROD-01).
- [ ] Duplicate a task or create one from a personal template (PROD-02).
- [ ] Inspect a simple history of allocation changes (PROD-03).
- [ ] Merge selected records from a valid backup rather than replacing all local data (PROD-04).
- [ ] Richer timeline or heatmap workload visualizations (PROD-05).

### Out of Scope

- Collaboration, shared workspaces, and multi-user permissions — application is strictly for personal use.
- Authentication and an application backend — all product behavior remains local-first and static-host compatible.
- Recurring tasks — deferred until core scheduling proves useful.
- Subtasks and task dependencies — excluded from v1 to keep planning interactions direct.
- External calendar integrations — manual capacity overrides cover current need.
- Push or email notifications — no backend and not essential to core value.
- Timers and actual-hours tracking — planned hours plus actual start/end dates remain sufficient.
- Native mobile applications — installable responsive PWA is sufficient.

## Context

Current task tools often separate task organization from realistic capacity planning. This product answers not only what needs doing, but whether work can fit before its deadline and where it should be placed. The primary user values quick actions, low UI complexity, clear workload signals, and durable ownership of local data.

Projects contain multiple milestones. Milestones belong to projects. Tasks may belong to a milestone, belong directly to a project, or remain standalone. Project and milestone statuses are Open, In Progress, Done, and Cancelled. Task statuses are Open, In Progress, Resolved, In Review, Done, and Cancelled.

GitHub synchronization is backup synchronization, not collaborative live sync. Backup content is encrypted in the browser before upload because the GitHub Pages repository may be public. GitHub access credentials and the encryption passphrase never enter source control, persistent storage, or the deployed bundle.

## Constraints

- **Audience**: One personal user — no collaboration model or role system.
- **Runtime**: 100% local application behavior — no application server.
- **Hosting**: GitHub Pages — production build supports repository subpath (`/task-management/`) and static routing.
- **Persistence**: IndexedDB is the working data store — app functions offline.
- **Synchronization**: GitHub Contents API stores only an encrypted backup artifact — secrets remain client-side and session-only.
- **UI**: Ant Design — interactions remain simple, fast, responsive, and accessible.
- **PWA**: Installable and offline-capable — service worker updates do not cause data loss.
- **Data safety**: Backup import validates format and avoids replacing good local data without explicit confirmation.
- **Identifiers**: Stable client-generated UUIDs — hierarchy changes do not alter IDs.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build a React, TypeScript, and Vite static PWA | Fits Ant Design, GitHub Pages, and rich local interactions without a backend | ✓ Validated — Phase 1 & 7 |
| Use IndexedDB as source of truth | Supports structured local persistence and offline use | ✓ Validated — Phase 1 & 6 |
| Model weekly capacity plus per-date overrides | Low maintenance while supporting holidays and exceptional workload | ✓ Validated — Phase 3 |
| Suggest work on lowest-load eligible days first | Balances workload and directly supports overload prevention | ✓ Validated — Phase 4 |
| Keep actual-hours tracking outside v1 | Protects focus on planning rather than timekeeping | ✓ Validated — Phase 2 & 3 |
| Encrypt GitHub backup in the browser | Prevents readable personal data entering a potentially public repository | ✓ Validated — Phase 8 |
| Keep direct GitHub sync optional | Local data and export/import must work without a token or network connection | ✓ Validated — Phase 8 |
| Session-only in-memory storage for PAT and passphrase | Eliminates credential leak surface in localStorage, IndexedDB, or logs | ✓ Validated — Phase 8 |
| Pre-import snapshots with one-click rollback | Prevents accidental data replacement during restore | ✓ Validated — Phase 6 & 8 |
| ActiveFormGuard reload interception | Prevents service worker updates from destroying dirty form state | ✓ Validated — Phase 7 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-27 after v1.0 milestone*
