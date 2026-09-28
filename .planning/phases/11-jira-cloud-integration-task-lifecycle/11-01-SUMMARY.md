---
phase: 11-jira-cloud-integration-task-lifecycle
plan: 01
subsystem: jira-integration
tags: [jira, rest-api-v3, adf, basic-auth, settings, dexie-v3]
dependency_graph:
  requires: []
  provides: [jiraKey-task-field, jira-api-client, minimal-adf-v3, jira-status-mapping, jira-settings-tab]
  affects: [Task, db.settings, SettingsView]
tech_stack:
  added: []
  patterns: [Basic Auth with token redaction, client-side CORS proxy forwarding, native minimal ADF serialization, smart regex status mapping]
key_files:
  created:
    - src/services/jira/types.ts
    - src/services/jira/jiraApi.ts
    - src/services/jira/adf.ts
    - src/services/jira/statusMapping.ts
    - src/components/settings/JiraConfigCard.tsx
    - tests/services/jira/adf.test.ts
    - tests/services/jira/jiraApi.test.ts
    - tests/services/jira/statusMapping.test.ts
    - tests/db/schemaV3Migration.test.ts
    - tests/components/settings/JiraConfigCard.test.tsx
  modified:
    - src/types/models.ts
    - src/db/schema.ts
    - src/db/index.ts
    - src/validation/schemas.ts
    - src/views/SettingsView.tsx
    - tests/db/schemaV2Migration.test.ts
    - tests/validation/domainSchemas.test.ts
    - tests/views/SettingsView.test.tsx
decisions:
  - "Extended Dexie with SCHEMA_V3 indexing jiraKey for fast search queries while preserving v1/v2 records"
  - "Zero npm dependencies for Jira REST v3: native fetch, btoa, and custom minimal ADF serializer"
  - "Smart status mapping with word-boundary regex for PR and Review to avoid false matches on progress"
  - "Diagnostic feedback in Settings distinguishing success, CORS blockage, and 401/403 credentials failure"
metrics:
  duration: 9m
  completed_date: "2026-09-28"
---

# Phase 11 Plan 01: Jira Cloud Data Layer & Settings Summary

Jira Cloud REST API v3 foundation with Dexie schema v3 migration (`jiraKey`), zero-dependency API client with token redaction and CORS proxy support, minimal ADF v3 serializer, smart status mapper, and Jira Settings configuration card with diagnostic connection testing.

## Completed Tasks

| Task | Name | Commit | Files |
| --- | --- | --- | --- |
| 1 (RED) | Add failing test for Jira core services | `841e97f` | `tests/services/jira/adf.test.ts`, `tests/services/jira/jiraApi.test.ts`, `tests/services/jira/statusMapping.test.ts` |
| 1 (GREEN) | Schema v3 migration, models, schemas, and Jira core services | `3c216ef` | `src/types/models.ts`, `src/db/schema.ts`, `src/db/index.ts`, `src/validation/schemas.ts`, `src/services/jira/types.ts`, `src/services/jira/jiraApi.ts`, `src/services/jira/adf.ts`, `src/services/jira/statusMapping.ts`, `tests/db/schemaV3Migration.test.ts`, `tests/validation/domainSchemas.test.ts` |
| 2 | JiraConfigCard component, diagnostic test connection, and SettingsView Tab 3 integration | `f392bdd` | `src/components/settings/JiraConfigCard.tsx`, `src/views/SettingsView.tsx`, `tests/components/settings/JiraConfigCard.test.tsx`, `tests/views/SettingsView.test.tsx` |

## Key Decisions Made

- **SCHEMA_V3 indexing `jiraKey`**: Added Dexie schema version 3 indexing `jiraKey` on `tasks` table, allowing rapid lookups and key-based filtering without mutating legacy data.
- **Zero new npm dependencies**: Implemented Atlassian Document Format (ADF) v3 paragraph serialization in `adf.ts` (~35 LOC) and HTTP Basic Auth fetch client in `jiraApi.ts` using native browser capabilities, avoiding heavy external SDKs like `@atlaskit/adf-utils` or `jira.js`.
- **Word-boundary regex for PR status mapping**: Enforced `/\bpr\b/` in `statusMapping.ts` to prevent false positive matching of "pr" inside "in progress" or "sprint".
- **Three-tier diagnostic feedback**: Categorized network diagnostic responses in `JiraConfigCard` into success (showing user display name and email), CORS blockage (warning prompt to configure CORS Proxy URL), and 401/403 authentication failures.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Substring check on 'pr' erroneously matched 'In Progress'**
- **Found during:** Task 1 GREEN verification
- **Issue:** `normName.includes('pr')` matched "In Progress" because the substring "pr" is contained inside "progress".
- **Fix:** Switched to regex `/\bpr\b/` ensuring only standalone "PR" or word-bounded terms match the In Review rule.
- **Files modified:** `src/services/jira/statusMapping.ts`
- **Commit:** `3c216ef`

**2. [Rule 1 - Bug] Legacy schema migration test asserted strict `verno === 2`**
- **Found during:** Task 1 database test run
- **Issue:** `tests/db/schemaV2Migration.test.ts` asserted `expect(v2Db.verno).toBe(2)`. Upgrading database class to version 3 caused this check to receive 3.
- **Fix:** Updated expectation to `expect(v2Db.verno).toBeGreaterThanOrEqual(2)` and added dedicated `tests/db/schemaV3Migration.test.ts`.
- **Files modified:** `tests/db/schemaV2Migration.test.ts`, `tests/db/schemaV3Migration.test.ts`
- **Commit:** `3c216ef`

## Self-Check: PASSED

- All 10 key files created and verified on disk.
- All 3 git commits present in log (`841e97f`, `3c216ef`, `f392bdd`).
- Full project test suite passed: 480 tests across 76 test files green.
