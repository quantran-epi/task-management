# Project Research Summary

**Project:** Personal Task & Workload Planner
**Domain:** Single-user, offline-first task and workload planning PWA
**Researched:** 2026-09-26
**Confidence:** High

## Executive Summary

Build a static local-first React PWA with IndexedDB as source of truth, pure TypeScript capacity and feasibility engines, and derived dashboard projections. Core promise is determining whether estimated work fits available time and suggesting a transparent lowest-load distribution.

Use normalized records, stable UUIDs, canonical `YYYY-MM-DD` planning dates, and integer minutes for estimates, capacity, and allocations. Deliver safe local export/import before optional encrypted GitHub backup. Keep collaboration, backend authentication, live sync, recurring tasks, subtasks, dependencies, timers, notifications, external calendars, and AI scheduling outside v1.

Primary risks are date drift, unsafe IndexedDB migrations, false feasibility, destructive imports, service-worker/schema mismatch, GitHub token leakage, and UI scope creep.

## Recommended Stack

- Node.js 24 LTS and npm
- React 19, TypeScript 7, and Vite 8
- Ant Design 6
- Dexie 4 with `dexie-react-hooks`
- `vite-plugin-pwa` and Workbox
- Native Web Crypto using PBKDF2-SHA-256 and AES-256-GCM
- GitHub Contents API through `@octokit/request`
- Zod for validation at import, decrypted payload, migration, and API boundaries
- Day.js for display and range helpers; persisted planning dates remain strings
- Vitest, fake-indexeddb, Testing Library, and Playwright

Use GitHub Actions Pages deployment, repository base `/task-management/`, and `HashRouter` only if bookmarkable routes are needed. Generate IDs with `crypto.randomUUID()`. Never bundle or commit GitHub credentials or encryption secrets.

## Product Scope

### Table Stakes

- Project, milestone, and task CRUD with stable IDs
- Standalone, project-level, and milestone-level tasks
- Fixed statuses, priority, progress, dates, notes, links, and estimates
- Weekly capacity baseline and per-date overrides
- Planned task minutes per date
- Available, busy, overloaded, and no-capacity load states
- Manual allocation editing
- Today, urgent, 7-day, 14-day, and next-month views
- Deterministic feasibility result with shortage or remaining capacity
- Lowest-load suggested distribution requiring user acceptance
- IndexedDB persistence, safe export/import, offline installation, and GitHub Pages deployment
- Basic search, filtering, and sorting

### Later

- Encrypted GitHub backup after local backup safety is proven
- Timeline or heatmap polish after load model stabilizes
- Saved views, templates, planning history, and import merge mode only after demonstrated need

### Anti-Features for v1

- Collaboration, shared workspaces, roles, backend accounts, and live sync
- AI scheduling, external calendars, recurring tasks, subtasks, and dependencies
- Timers, actual-hours tracking, habits, notifications, custom workflows, gamification, and native apps

## Architecture

Use four layers:

1. React and Ant Design UI renders read models and sends commands.
2. Application services coordinate writes, queries, imports, and backup operations.
3. Pure TypeScript domain functions enforce hierarchy, capacity, feasibility, and projections.
4. Dexie repositories own IndexedDB access and transactions.

IndexedDB stores normalized source facts. Daily totals, load states, remaining estimates, dashboard counts, and feasibility warnings remain derived. UI never writes IndexedDB directly; domain code never imports React, IndexedDB, `fetch`, or browser storage APIs.

Planned hours use one row per task and date. Estimates, capacity, and allocations use integer minutes. Moving an item changes references, not IDs. A milestone task references its milestone and matching project; a project-level task has no milestone; a standalone task has neither.

GitHub integration uploads and downloads a manually triggered encrypted backup artifact. It is not synchronization or automatic merge. Remote conflicts stop and require explicit user choice.

## Critical Pitfalls

1. Store planning dates as `YYYY-MM-DD`; never treat them as UTC instants or add fixed milliseconds per day.
2. Calculate feasibility from weekly capacity, date overrides, existing allocations, zero-capacity days, and stable tie-breakers.
3. Use ordered transactional IndexedDB migrations with blocked-tab handling and upgrade tests.
4. Request persistent browser storage, expose backup early, handle quota errors, and provide recovery when data is unexpectedly absent.
5. Validate and migrate imports before replacement; preview contents, create recovery backup, confirm explicitly, and preserve current data on failure.
6. Use random salt and fresh 96-bit IV for every encrypted backup; do not persist passphrase by default.
7. Accept GitHub token only at runtime, recommend fine-grained Contents permission, redact logs, and never use `VITE_GITHUB_TOKEN`.
8. Treat Contents API as manual backup. Use current remote `sha`, serialize writes, and stop on conflict.
9. Test Vite base, assets, manifest, and service-worker scope at exact GitHub Pages repository URL.
10. Prompt for PWA updates rather than forcing `skipWaiting()` during active data work.
11. Provide keyboard access, visible focus, status announcements, and text/icon alternatives to load-state colors.
12. Protect core planning loop from adjacent productivity-suite scope.

## Roadmap Implications

Recommended dependency order:

1. Application shell, Pages deployment, IndexedDB schema, date model, UUIDs, and migration framework
2. Project, milestone, and task hierarchy CRUD
3. Weekly capacity, date overrides, and planned-hours ledger
4. Feasibility engine and accepted workload suggestions
5. Dashboard and forecast projections
6. Safe backup export and replacement import
7. PWA install, offline, storage, and update hardening
8. Optional encrypted GitHub backup

Focused phase research is most valuable for backup import safety and encrypted GitHub backup. Feasibility needs more research only if rules exceed deterministic lowest-load allocation.

## Open Decisions

- Default weekly capacity values
- Estimate input format while persisting integer minutes
- Inclusive or exclusive date-range boundaries
- Treatment of completed and cancelled allocations in active load views
- Browser support target
- Exact GitHub backup file path and whether credentials may ever persist locally

## Sources

Detailed sources and evidence appear in:

- `.planning/research/STACK.md`
- `.planning/research/FEATURES.md`
- `.planning/research/ARCHITECTURE.md`
- `.planning/research/PITFALLS.md`

Primary external references include official Vite, React, Ant Design, Dexie, MDN, GitHub, Node.js, Workbox, React Router, and package-registry documentation cited in those files.

---
*Research completed: 2026-09-26*
*Ready for requirements and roadmap: yes*
