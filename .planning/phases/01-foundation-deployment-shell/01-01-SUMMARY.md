---
phase: 01-foundation-deployment-shell
plan: 01
subsystem: persistence
tags:
  - dexie
  - indexeddb
  - vite
  - vitest
  - react19
  - typescript
dependency_graph:
  requires: []
  provides:
    - TaskPlannerDatabase
    - db
    - generateId
    - isValidUuid
    - isValidCalendarDate
    - getTodayDateString
    - isValidMinutes
    - toMinutes
    - initializeDatabaseDefaults
    - resetDatabaseToDefaults
    - Project
    - Milestone
    - Task
    - CapacityRule
    - CapacityOverride
    - PlannedAllocation
    - Setting
    - BackupMetadata
  affects:
    - 01-02
    - 01-03
    - 02-01
    - 03-01
tech_stack:
  added:
    - vite: ^8.3.1
    - vitest: ^5.0.2
    - react: ^19.3.0
    - react-dom: ^19.3.0
    - antd: ^6.6.5
    - "@ant-design/icons": ^6.3.4
    - dexie: ^4.4.6
    - dexie-react-hooks: ^4.4.0
    - dayjs: ^1.11.23
    - zod: ^4.6.5
    - fake-indexeddb: ^6.2.5
    - jsdom: ^29.1.1
    - "@testing-library/react": ^16.3.3
    - "@testing-library/jest-dom": ^7.0.1
    - "@testing-library/dom": ^10.4.2
  patterns:
    - Native Web Crypto RFC 4122 v4 UUID generator (no external uuid package)
    - Strict YYYY-MM-DD calendar date string parsing with dayjs customParseFormat
    - Non-negative integer minute duration and capacity representations
    - Dexie IndexedDB singleton with 8 typed tables and multi-tab lifecycle listeners
    - Idempotent baseline capacity initialization (Mon-Fri 480 mins, Sat-Sun 0 mins)
    - Guarded full database purge and reseed wrapped in atomic readwrite transaction
key_files:
  created:
    - package.json
    - tsconfig.json
    - vite.config.ts
    - tests/setup.ts
    - src/types/models.ts
    - src/types/navigation.ts
    - src/utils/uuid.ts
    - src/utils/date.ts
    - src/db/schema.ts
    - src/db/index.ts
    - src/db/seeds.ts
    - tests/uuid.test.ts
    - tests/schema.test.ts
    - tests/db.test.ts
    - .gitignore
  modified: []
decisions:
  - "Used jsdom@29.1.1 to align with Node 20.19.5 engine requirements avoiding undici 8 webidl incompatibility"
  - "Explicitly added @testing-library/dom peer dependency to support jest-dom test matchers in Vitest"
metrics:
  duration: 15m
  completed_date: "2026-09-26"
---

# Phase 1 Plan 1: Foundation Runtime & Persistence Layer Summary

**Scaffolded Vite + React 19 + TypeScript runtime and established Dexie IndexedDB persistence layer with UUID generation, canonical date/minute schemas, baseline capacity seeding, and automated test harness.**

## Performance & Verification

- **UUID Generator (DATA-01):** Verified RFC 4122 v4 compliance and collision-free generation across 1,000 continuous iterations using native `crypto.randomUUID()`.
- **Date & Minute Schema (DATA-03):** Strict calendar date regex and `dayjs/plugin/customParseFormat` validation rejecting ISO timestamps, Date objects, non-leap year February 29 dates, and invalid months/days. Enforced non-negative integer minute values.
- **Dexie Persistence & Seeding (DATA-02, D-05, D-07):** Version 1 schema registering all 8 core stores (`projects`, `milestones`, `tasks`, `capacityRules`, `capacityOverrides`, `plannedAllocations`, `settings`, `backupMetadata`). Verified persistence across connection close/reopen, idempotent default seeding of Mon-Fri 480m / Sat-Sun 0m, and atomic transaction-wrapped database reset.
- **Test Suite:** 16 tests passing across 3 test suites (`tests/uuid.test.ts`, `tests/schema.test.ts`, `tests/db.test.ts`).

## Completed Tasks

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Scaffold Vite, React 19, TypeScript strict config, and Vitest test harness | fd3b8db | package.json, tsconfig.json, vite.config.ts, tests/setup.ts, .gitignore |
| 2 | Define entity models, native UUID generator, and canonical date/minute utilities (DATA-01, DATA-03) | 98e0e08 | src/types/models.ts, src/types/navigation.ts, src/utils/uuid.ts, src/utils/date.ts, tests/uuid.test.ts, tests/schema.test.ts |
| 3 | Implement Dexie database instance, table schemas, default capacity seed, and guarded reset (DATA-02) | 65f9166 | src/db/schema.ts, src/db/index.ts, src/db/seeds.ts, tests/db.test.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] Downgraded jsdom to 29.1.1 for Node 20 runtime compatibility**
- **Found during:** Task 2 verification
- **Issue:** jsdom 30.1.1 imports undici 8, which calls `webidl.util.markAsUncloneable` requiring Node >= 22.22.2. The local environment runs Node v20.19.5, causing Vitest pool fork worker failures.
- **Fix:** Pinned `jsdom` to `^29.1.1`, which officially supports Node `^20.19.0` while maintaining full DOM compatibility.
- **Files modified:** `package.json`, `package-lock.json`
- **Commit:** 98e0e08

**2. [Rule 3 - Blocking Issue] Installed missing @testing-library/dom peer dependency**
- **Found during:** Task 2 verification
- **Issue:** `@testing-library/jest-dom` v7 failed to import `@testing-library/dom` because `--legacy-peer-deps` did not auto-install unbundled peers.
- **Fix:** Added `@testing-library/dom@^10.4.2` to devDependencies.
- **Files modified:** `package.json`, `package-lock.json`
- **Commit:** 98e0e08

## Threat Mitigations

- **T-01-01 (Tampering):** Implemented strict regex `^\d{4}-\d{2}-\d{2}$` and `dayjs.extend(customParseFormat)` strict parsing in `src/utils/date.ts` to prevent timezone-shifted date strings entering storage.
- **T-01-02 (Denial of Service):** Wrapped database purge and reseed inside `targetDb.transaction('rw', targetDb.tables, ...)` in `src/db/seeds.ts` for atomic table reset.
- **T-01-SC (Supply Chain):** Clean package installation with zero vulnerabilities reported by npm audit.

## Self-Check: PASSED

- All 15 created files verified on disk.
- All 3 commit hashes (`fd3b8db`, `98e0e08`, `65f9166`) confirmed in git history.
- 16/16 automated tests passing via Vitest.
- TypeScript compiler passes with 0 errors via `tsc --noEmit`.
