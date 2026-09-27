# Personal Task & Workload Planner

## What This Is

A private, offline-first web application for one person to manage projects, milestones, and tasks while planning work against daily capacity. It combines fast task management with workload forecasting, feasibility checks, and suggested daily hour allocation, and runs as an installable PWA hosted on GitHub Pages.

## Core Value

Make planned work realistically fit available time by exposing overload early and suggesting feasible daily workload distributions.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Manage projects, milestones, and standalone or nested tasks through fast, simple interactions.
- [ ] Give every project, milestone, task, and planning record a stable identifier.
- [ ] Record item details, dates, notes, statuses, task priority, progress, document links, and actual start/end dates.
- [ ] Configure normal weekly work capacity with per-date overrides for leave, meetings, overtime, and other exceptions.
- [ ] Allocate planned task hours to individual dates and show daily load as available, busy, or overloaded.
- [ ] Evaluate whether estimated work fits a date range or deadline and suggest a distribution favoring lowest-load eligible days.
- [ ] Show actionable dashboard views for today, urgent work, and workload over 7-day, 14-day, and next-month horizons.
- [ ] Persist application data locally in IndexedDB and remain usable offline after installation.
- [ ] Export and import complete local backups.
- [ ] Synchronize a client-side encrypted backup file through the GitHub Contents API in the same repository.
- [ ] Provide a responsive, accessible, productive interface using Ant Design.
- [ ] Deploy the static PWA through GitHub Pages.

### Out of Scope

- Collaboration, shared workspaces, and multi-user permissions — application is strictly for personal use.
- Authentication and an application backend — all product behavior remains local-first and static-host compatible.
- Recurring tasks — deferred until core scheduling proves useful.
- Subtasks and task dependencies — excluded from v1 to keep planning interactions direct.
- External calendar integrations — not needed for initial workload planning.
- Push or email notifications — no backend and not essential to core value.
- Timers and actual-hours tracking — v1 tracks planned hours plus actual start/end dates only.
- Native mobile applications — installable responsive PWA is sufficient.

## Context

Current task tools often separate task organization from realistic capacity planning. This product should answer not only what needs doing, but whether work can fit before its deadline and where it should be placed. The primary user values quick actions, low UI complexity, clear workload signals, and durable ownership of local data.

Projects contain multiple milestones. Milestones belong to projects. Tasks may belong to a milestone, belong directly to a project, or remain standalone. Project and milestone statuses are Open, In Progress, Done, and Cancelled. Task statuses are Open, In Progress, Resolved, In Review, Done, and Cancelled.

GitHub synchronization is backup synchronization, not collaborative live sync. Backup content must be encrypted in the browser before upload because the GitHub Pages repository may be public. GitHub access credentials and the encryption passphrase must never be included in source control or the deployed bundle.

## Constraints

- **Audience**: One personal user — no collaboration model or role system.
- **Runtime**: 100% local application behavior — no application server.
- **Hosting**: GitHub Pages — production build must support a repository subpath and static routing.
- **Persistence**: IndexedDB is the working data store — the app must continue functioning offline.
- **Synchronization**: GitHub Contents API stores only an encrypted backup artifact — secrets remain client-side.
- **UI**: Ant Design — interactions must remain simple, fast, responsive, and accessible.
- **PWA**: Installable and offline-capable — service worker updates must not cause data loss.
- **Data safety**: Backup import must validate format and avoid replacing good local data without explicit confirmation.
- **Identifiers**: Stable client-generated UUIDs — hierarchy changes must not alter IDs.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build a React, TypeScript, and Vite static PWA | Fits Ant Design, GitHub Pages, and rich local interactions without a backend | ✓ Validated — Phase 7 |
| Use IndexedDB as source of truth | Supports structured local persistence and offline use | — Pending |
| Model weekly capacity plus per-date overrides | Low maintenance while supporting holidays and exceptional workload | — Pending |
| Suggest work on lowest-load eligible days first | Balances workload and directly supports overload prevention | — Pending |
| Keep actual-hours tracking outside v1 | Protects focus on planning rather than timekeeping | — Pending |
| Encrypt GitHub backup in the browser | Prevents readable personal data entering a potentially public repository | — Pending |
| Keep direct GitHub sync optional | Local data and export/import must work without a token or network connection | — Pending |

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
*Last updated: 2026-09-27 after Phase 7*
