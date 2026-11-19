---
phase: 45-knowledge-sets-docs-workspace-oracle-connections-team-pinned
plan: 01
subsystem: knowledge
tags: [fastify, zod, react, antd, vitest, published-sets, purge]
requires:
  - phase: 16
    provides: knowledge client/server publish and purge endpoints
provides:
  - GET /api/v1/sets server-authoritative snapshot enumeration with Bearer/origin parity
  - listPublishedSets() typed client method with KnowledgeClientError propagation
  - Quản lý set section in Settings > Knowledge Daemon with confirm-gated purge and offline degradation
  - shared DocumentSetDeleteDialog with full-delete default and exact-name local-only gate, mounted by legacy drawer
affects:
  - plan 02 Docs doc_set detail must mount the shared DocumentSetDeleteDialog
  - knowledge daemon set lifecycle and retrieval scope contracts
tech-stack:
  added: []
  patterns:
    - "Server-authoritative enumeration exposed verbatim; no local-catalog filtering or GC"
    - "Shared delete dialog owned by plan 01, reused by the future doc_set detail"
key-files:
  created:
    - knowledge-server/tests/setListRoutes.test.ts
    - src/components/knowledge/DocumentSetDeleteDialog.tsx
    - src/components/knowledge/__tests__/DocumentSetDeleteDialog.test.tsx
  modified:
    - knowledge-server/src/routes/snapshots.ts
    - src/services/knowledge/knowledgeClient.ts
    - tests/knowledge/knowledgeClient.test.ts
    - src/components/settings/KnowledgeServerConfigCard.tsx
    - tests/knowledge/KnowledgeServerConfigCard.test.tsx
    - src/components/knowledge/DocumentSetDrawer.tsx
key-decisions:
  - "GET /sets returns listActiveSnapshots() verbatim through buildKnowledgeServer auth, with no TTL/GC/reconciliation"
  - "Purge UI is an explicit admin action; offline daemon renders a fixed diagnostic and local Settings paths remain usable"
  - "Full delete is the primary action; local-only stays available only after typing the exact set name"
  - "Delete logic lives in a self-contained shared dialog so the gate survives Docs drawer retirement in plan 02"
patterns-established:
  - "PublishedSetListSchema uses passthrough so optional server metadata is tolerated without new plumbing"
  - "Focused Vitest files per task plus tsc --noEmit; full suite intentionally not run"
requirements-completed: [D-01, D-02, D-03, D-04, D-05]
coverage:
  - id: D1
    description: "GET /api/v1/sets returns authoritative sorted snapshot list with auth parity"
    requirement: D-04
    verification:
      - kind: unit
        ref: knowledge-server/tests/setListRoutes.test.ts#GET /api/v1/sets
        status: pass
    human_judgment: false
  - id: D2
    description: "listPublishedSets parses {setId,snapshotId}, tolerates optional metadata and propagates KnowledgeClientError"
    requirement: D-04
    verification:
      - kind: unit
        ref: tests/knowledge/knowledgeClient.test.ts#published set list
        status: pass
    human_judgment: false
  - id: D3
    description: "Settings Quản lý set lists sets, confirms purge, refreshes and degrades gracefully offline"
    requirement: D-03
    verification:
      - kind: unit
        ref: tests/knowledge/KnowledgeServerConfigCard.test.tsx#lists published server sets and refreshes after a confirmed purge
        status: pass
    human_judgment: false
  - id: D4
    description: "Shared DocumentSetDeleteDialog pins full-delete default, exact type-to-confirm, purge ordering and local-only behavior"
    requirement: D-01
    verification:
      - kind: unit
        ref: src/components/knowledge/__tests__/DocumentSetDeleteDialog.test.tsx#DocumentSetDeleteDialog
        status: pass
    human_judgment: false
  - id: D5
    description: "Retrieval scope and live-server state untouched; no destructive cleanup issued"
    requirement: D-05
    verification:
      - kind: unit
        ref: npm --prefix knowledge-server test -- --run tests/publishedSetDiscovery.test.ts
        status: pass
    human_judgment: false
  - id: D6
    description: "Settings set-management UI in a real Tauri walkthrough (one screen, bounded list, confirm copy)"
    requirement: D-03
    human_judgment: true
    rationale: "Component tests prove behavior with stubs; visual adequacy against a live daemon requires a human UI walkthrough."
commits: 3
plan_head_before: c583a114832ed3060873ea038dec8b5bb5529819
plan_head_after: 8fe1821f69923473c4765f4286f1d247a79f6709
actuals:
  tokens: 181
  tasks: 3
  commits: 3
duration: 32m
completed: 2026-11-19
status: complete
---

# Phase 45 Plan 01: Knowledge Set Lifecycle Hardening Summary

**Server-authoritative GET /sets, typed client list, Settings purge UI, and a shared full-delete-default / type-to-confirm dialog wired into the legacy drawer**

## Performance

- **Duration:** 32 min
- **Started:** 2026-11-19T03:43:02Z
- **Completed:** 2026-11-19T04:15:28Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- `GET /api/v1/sets` exposes `listActiveSnapshots()` verbatim through the existing auth/allowedOrigins hooks; no GC, TTL or local-catalog filtering was added.
- `listPublishedSets()` extends the knowledge client with a passthrough zod schema and unchanged typed error propagation.
- Settings > Knowledge Daemon now has a bounded "Quản lý set" table with Popconfirm purge, reload after purge, and offline diagnostics.
- Shared `DocumentSetDeleteDialog` owns full-delete-first and exact-name local-only gating; the legacy drawer mounts it, so plan 02 can reuse it from the `doc_set` detail.
- Focused server/client/component tests and `tsc --noEmit` pass; no full Vitest suite was run and no live-server DELETE was issued.

## Task Commits

1. **Task 1: List published sets end-to-end — server route to typed client** — `da757c79` (feat)
2. **Task 2: Quản lý set section in Settings > Knowledge Daemon** — `e1dd7b47` (feat)
3. **Task 3: Full-delete default and type-to-confirm local-only** — `8fe1821f` (refactor)

**Plan metadata:** pending final docs commit

## Files Created/Modified
- `knowledge-server/src/routes/snapshots.ts` — GET /sets route with auth parity.
- `knowledge-server/tests/setListRoutes.test.ts` — route ordering and auth tests.
- `src/services/knowledge/knowledgeClient.ts` — PublishedSetListSchema + listPublishedSets().
- `tests/knowledge/knowledgeClient.test.ts` — parse/metadata/error tests.
- `src/components/settings/KnowledgeServerConfigCard.tsx` — Quản lý set section.
- `tests/knowledge/KnowledgeServerConfigCard.test.tsx` — list/purge/offline tests.
- `src/components/knowledge/DocumentSetDeleteDialog.tsx` — shared hardened dialog.
- `src/components/knowledge/DocumentSetDrawer.tsx` — mounts shared dialog instead of inline modal.
- `src/components/knowledge/__tests__/DocumentSetDeleteDialog.test.tsx` — four delete-path cases.

## Decisions Made
- Server remains authoritative; no retrieval-scope filtering or automatic reconciliation was introduced (D-03/D-05).
- Purge is always explicit (`Popconfirm`), and offline daemon failures never block local Settings/Docs paths.
- Local-only delete remains an advanced path requiring exact typed name; full delete stays primary and keeps purge-before-local ordering.
- `documentSets` local catalog is not used for orphan hints in this plan, avoiding any implicit or display-level coupling in the set list.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered
- One pre-existing failure in `tests/knowledge/knowledgeClient.test.ts` ("posts validated federated retrieval without a set route") was verified against the HEAD version of the same test before any changes from this plan; it fails due to an unrelated federated retrieval protocol schema drift and is out of scope.
- One pre-existing flake/failure in `KnowledgeServerConfigCard.test.tsx` ("maintains persisted token across views while excluding it from backups") was reproduced on the HEAD version of that test; the shared-client mock was adjusted to preserve all original client methods so the plan's tests are isolated.
- `knowledge-server/node_modules` was missing; `npm ci --ignore-scripts` inside `knowledge-server/` restored the locked dependencies (no package.json/lockfile change, zero new packages).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ready for plan 02: its new Docs `doc_set` detail can mount the exported `DocumentSetDeleteDialog` with `set`, `database`, optional `client`, `published` and `onClose` props.
- A real Tauri UI walkthrough of the Quản lý set section with a reachable daemon remains for phase verification.

## Self-Check: PASSED

---
*Phase: 45-knowledge-sets-docs-workspace-oracle-connections-team-pinned*
*Completed: 2026-11-19*
