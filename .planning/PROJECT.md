# Personal Task & Workload Planner

## What This Is

A private, offline-first web application for one person to manage projects, milestones, and tasks while planning work against daily capacity. It combines fast task management with workload forecasting, feasibility checks, and suggested daily hour allocation, and runs as an installable PWA hosted on GitHub Pages.

## Core Value

Make planned work realistically fit available time by exposing overload early and suggesting feasible daily workload distributions.

## Current State

Shipped **v1.0 MVP** on 2026-09-27 with all 8 foundational phases complete (28 plans, 69 tasks, 59/59 requirements satisfied, 0 audit gaps). Codebase comprises 14,384 LOC TypeScript/React across 324 files with 386 passing automated tests. Deployed as an installable PWA on GitHub Pages with offline IndexedDB storage and encrypted GitHub backup sync.

## Current Milestone: v1.2 Hybrid GraphRAG Knowledge Assistant MVP

**Goal:** Query normalized local Markdown for scheduled process `60000006`, returning evidence-grounded answers, citations, and multi-hop dependency paths.

**Target features:**
- Publish and incrementally index PlannerMate Markdown through an optional knowledge server.
- Combine keyword, vector, and Neo4j graph retrieval over the scheduled-process pilot corpus.
- Extract evidence-backed process steps, call chains, database objects, cycles, statuses, and diagnostic relationships.
- Answer through the existing AI assistant with citations, graph paths, conflicts, and missing-evidence handling.
- Verify quality with a benchmark corpus covering retrieval, flow, and impact queries of at least three hops.

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
- ✓ Track Banking IT domain fields (Ops Owner, BA, Work Type) across projects, milestones, tasks. — Phase 9 (SHB-01..SHB-05)
- ✓ Connect to Jira Cloud REST API v3, create issues, link keys, execute transitions, filter tasks by Jira key/status, and format standup exports. — Phase 11 (JIRA-01..JIRA-05)
- ✓ AI Chat Drawer with 9router API integration, scoped item context grounding, local file head extraction, and Claude Code CLI terminal bridge. — Phase 13.2 (AI-01..AI-05)

### Active

- [ ] Publish normalized Markdown to an optional knowledge server without breaking local/offline document use.
- [ ] Incrementally index changed Markdown sections for keyword and semantic retrieval.
- [ ] Build an evidence-backed Neo4j graph for scheduled process `60000006` using collision-safe composite identities.
- [ ] Query process flow, call chain, dependencies, data objects, cycles, statuses, and diagnostics through bounded graph traversal.
- [ ] Return AI answers with source citations, graph paths, conflicts, and explicit missing-evidence handling.
- [ ] Keep technical reconstruction facts classified as observed or inferred unless business approval is documented.
- [ ] Verify retrieval and multi-hop answer quality against a benchmark corpus.

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
- **Knowledge source**: Markdown remains canonical; Neo4j and retrieval indexes must be fully rebuildable from published documents.
- **Offline behavior**: Existing local document editing and search remain available when the optional knowledge server is unavailable.
- **Evidence integrity**: Every extracted relationship must retain document, section, and source-range provenance plus evidence classification.
- **Pilot scope**: MVP targets only `docs/sample-markdown-flow/60000006-SHB-Credit-calculations/`; broader card-system ingestion is deferred.
- **Sensitive data**: MVP corpus must exclude real PAN, CVV, PIN/PIN block, HSM keys, production credentials, and customer PII.

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
| Keep Markdown as canonical knowledge source | Human-readable documents remain reviewable and portable; graph/indexes can be rebuilt | — Pending |
| Use collision-safe composite graph identities | Prevents namespace collisions such as `PRC_PROCESS:60000006` and `PRC_CONTAINER:60000006` | — Pending |
| Start with scheduled process `60000006` as pilot corpus | Small enough to validate, rich enough for scheduler, call-chain, data, and diagnostic multi-hop queries | — Pending |

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
*Last updated: 2026-10-07 after starting v1.2 Hybrid GraphRAG Knowledge Assistant MVP*
