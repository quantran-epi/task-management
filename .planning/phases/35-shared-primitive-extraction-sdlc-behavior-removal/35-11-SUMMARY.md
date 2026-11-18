---
phase: 35-shared-primitive-extraction-sdlc-behavior-removal
plan: 11
subsystem: persistence
tags: [dexie, migration, sdlc-removal, ai-remove-05, data-safety]
dependency_graph:
  requires: [35-06, 35-07, 35-08, 35-09, 35-10]
  provides:
    - "Dexie version(18) with the SDLC purge upgrade hook"
    - "SCHEMA_V18 constant"
    - "tests/db/sdlcPurgeMigration.test.ts (6 cases)"
  affects: [35-12, 36]
tech_stack:
  added: []
  patterns: [dexie-upgrade-hook, bulk-collect-then-delete, typeof-guarded-row-access]
key_files:
  created:
    - tests/db/sdlcPurgeMigration.test.ts
  modified:
    - src/db/schema.ts
    - src/db/index.ts
    - tests/db/schemaV15Migration.test.ts
    - tests/db/schemaV17Migration.test.ts
decisions:
  - "V18 is a row delete only: SCHEMA_V18 spreads SCHEMA_V17, so no index rebuild and no store reshape"
  - "Purge order is tabs -> messages -> tabs-by-thread -> thread -> settings; messages precede their thread so validateBackup's threadId ∈ chatThreads invariant still holds (L5)"
  - "Every legacy field is read through Record<string, unknown> + typeof guard, so a malformed row cannot throw mid-upgrade (T-35-28)"
  - "The V14 hook is untouched — migration history stays byte-identical (T-35-30)"
  - "Phase 36's aiSkillVersions therefore becomes V19 (research L4)"
metrics:
  duration: "~25m"
  tasks: 2
  files: 3
  completed: 2026-11-10
  commits: 2
  plan_head_before: f2c2386925f7ab89a7a63b296c771684f0578be9
  plan_head_after: 7d6bbd32b27cc3ac2bd42fd06e3416ac4c1b5017
actuals:
  tokens: 605
  tasks: 2
  commits: 2
requirements-completed: [AIO-REMOVE-05]
status: complete
---

# Phase 35 Plan 11: Dexie V18 SDLC Purge Migration Summary

Dexie `version(18)` deletes every surviving SDLC row class — tabs, `:sdlc` threads, their messages, and `sdlc_workflow:*` settings — proving with a seeded-database test that ordinary chat data survives byte-identical.

## Tasks

| # | Task | Commit | Outcome |
|---|------|--------|---------|
| 1 (RED) | Failing migration test | `8c37dee4` | `tests/db/sdlcPurgeMigration.test.ts` seeds a raw V17 database (`SCHEMA_V17`) with an `sdlc` tab, a `cr:cr-1:sdlc` thread plus two messages, an `sdlc_workflow:cr-1:t1` setting, and an ordinary `chat` tab/thread/two messages/`theme` setting, then opens `new TaskPlannerDatabase(name)`. Six cases go red on planned assertions (`verno` is 17; every SDLC row survives). |
| 2 (GREEN) | `SCHEMA_V18` + purge hook | `7d6bbd32` | `SCHEMA_V18 = { ...SCHEMA_V17 }` in `schema.ts`; `this.version(18).stores(SCHEMA_V18).upgrade(...)` in `index.ts` collects-then-deletes by id, deleting messages before their thread, with `typeof` guards on every legacy field. V14 hook byte-identical. |

## Verification

- `./node_modules/.bin/vitest run tests/db/sdlcPurgeMigration.test.ts tests/db/schemaV17Migration.test.ts` — 11 tests passed, exit 0.
- `./node_modules/.bin/vitest run tests/db` — whole `tests/db` folder green (0 `not ok`).
- `./node_modules/.bin/vitest run tests/db.test.ts` — 6 tests passed (no name clash with the new file).
- `grep -c "SCHEMA_V18" src/db/index.ts` — 2 (import + `stores`); `grep -c "export const SCHEMA_V18" src/db/schema.ts` — 1; `grep -c "this.version(18)" src/db/index.ts` — 1.
- `grep -c "tx.table('chatMessages')\|tx.table('chatTabs')\|tx.table('chatThreads')\|tx.table('settings')" src/db/index.ts` — 16 vs 8 before the plan (+8 in the V18 hook).
- `git diff <red>..<green> -- src/db/index.ts` — zero removed lines: the V14 hook is untouched.
- `./node_modules/.bin/tsc --noEmit` — 0 errors mentioning `db/index` or `db/schema`.
- TDD RED evidence: `gsd_run check tdd-red-evidence .gsd-tdd/red-evidence.json --raw` → `RED_EVIDENCE_OK`, verdict reason `target_test_failed`, 6/6 failing, matched target test, no report errors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two live-version assertions broke from the version bump**
- **Found during:** Task 2 (GREEN)
- **Issue:** `tests/db/schemaV17Migration.test.ts:117` asserted `db.verno === 17` and `tests/db/schemaV15Migration.test.ts:51` asserted `upgradedDb.verno === 17`. Both open at the *current* schema, so registering V18 made them read 18 and fail. The V15 file's own comment already states "Opening at the current version runs every later upgrade, so verno is the live schema."
- **Fix:** Bumped both to 18 (and the V17 test's name to "opens at version 18"). No other assertion in either file referenced the version.
- **Files modified:** `tests/db/schemaV17Migration.test.ts`, `tests/db/schemaV15Migration.test.ts`
- **Verification:** `vitest run tests/db` green; `tests/db/schemaV16Migration.test.ts` still passes unchanged.
- **Commit:** `7d6bbd32`

**2. [Rule 1 - Bug] Malformed-row fixture used keys that violated two "unique" indexes**
- **Found during:** Task 1 (RED)
- **Issue:** The first malformed-fixture draft added a `chatTabs` row reusing `threadId: 'thread-chat'` (the `&threadId` unique index) and two `settings` rows with duplicate/missing `key` (the primary key). fake-indexeddb threw `ConstraintError` during the *seed*, so all six tests failed for a setup reason instead of the planned assertion — INVALID_RED by the fail-fast rules.
- **Fix:** Gave the malformed tab its own thread id, seeded `thread-malformed` to satisfy it, and used a non-duplicate, non-prefixed settings key plus one numeric key. Every malformed row now exercises a `typeof` guard rather than an index constraint.
- **Files modified:** `tests/db/sdlcPurgeMigration.test.ts`
- **Verification:** RED evidence classifier returned `RED_EVIDENCE_OK` with all six failures on planned assertions; GREEN then passes all six.
- **Commit:** `8c37dee4` (amended into the RED commit before it landed)

### Scope boundary (not a deviation)

`npx tsc --noEmit` reports one pre-existing tree-wide error: `tests/components/HierarchyView.test.tsx:113` still passes the obsolete `onOpenSdlcStudio` prop. That belongs to plan 35-12 and was explicitly excluded from this plan's scope — left untouched. Zero `db/index` or `db/schema` errors.

## Known Stubs

None.

## Threat Flags

None. The V18 hook is the mitigation for T-35-28 (every field behind a `typeof` guard), T-35-29 (messages deleted before their thread), and T-35-30 (V14 hook byte-identical). No new network, auth, or filesystem surface.

## TDD Gate Compliance

| Gate | Required | Commit |
|---|---|---|
| RED | Yes | `8c37dee4` `test(35-11): add failing SDLC purge migration test` |
| GREEN | Yes | `7d6bbd32` `feat(35-11): add Dexie V18 hook that purges SDLC rows` |
| REFACTOR | No | Not needed — GREEN is already minimal |

## Self-Check: PASSED

- `src/db/schema.ts` — FOUND
- `src/db/index.ts` — FOUND
- `tests/db/sdlcPurgeMigration.test.ts` — FOUND
- `tests/db/schemaV17Migration.test.ts` — FOUND
- `tests/db/schemaV15Migration.test.ts` — FOUND
- commits `8c37dee4`, `7d6bbd32` — FOUND (both ancestors of HEAD `7d6bbd32`)
