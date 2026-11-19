---
phase: 45-knowledge-sets-docs-workspace-oracle-connections-team-pinned
plan: 03
subsystem: ai
tags: [oracle, sqlcl, multi-connection, settings-migration, backup-denylist, tool-gating, react, antd, vitest]
requires:
  - phase: 31.1
    provides: SSH configs and remote SQLcl-over-SSH execution used by Oracle tools
  - phase: 41
    provides: team enablement flags driving the gated tool addendum
  - phase: 45
    provides: plan 01 shared set/backup patterns (settings row denylist seam)
provides:
  - Named OracleConnectionProfile list with stable id/name/environment/isActive and all legacy fields
  - Single-transaction migration of the legacy config into active profile #1 with legacy-row deletion
  - Selector resolution (exact id -> case-insensitive name/env -> active) with name-only errors
  - oracle_query / oracle_describe selection on a resolved profile under the unchanged read-only guard
  - oracle_list_connections safe-metadata discovery tool inside the same gated addendum
  - Both Oracle settings keys denylisted from plaintext backups
  - Shared profile-management UI in the chat toolbox modal and Settings card
affects:
  - plan 04 team pinned context must select Oracle connections by name only (no global active mutation)
  - backup export/restore denylist and all Oracle tool call sites
tech-stack:
  added: []
  patterns:
    - "Settings-row list migration wraps the legacy value into profile #1 then deletes the legacy row in one Dexie rw transaction"
    - "Selector resolution fails closed with safe metadata only (id/name/environment), never connection strings"
    - "Shared UI component (OracleProfileManager) reused by modal and settings card with secret redaction on every error path"
key-files:
  created:
    - src/services/ai/__tests__/oracleMultiConnection.test.ts
  modified:
    - src/types/oracleSqlcl.ts
    - src/services/ai/oracleSqlclService.ts
    - src/services/ai/aiTools.ts
    - src/services/ai/chatTurnTools.ts
    - src/services/ai/office/teamRunCoordinator.ts
    - src/services/backup/exportBackup.ts
    - src/components/ai/OracleSqlclSettingsModal.tsx
    - src/components/settings/OracleAiToolConfigCard.tsx
    - src/services/ai/__tests__/oracleSqlclService.test.ts
    - src/services/ai/__tests__/chatTurnTools.test.ts
    - tests/services/backup/exportBackup.test.ts
key-decisions:
  - "Migration deletes oracle_ai_tool_config in the same transaction that persists the profile list; no rollback copy of the raw secret is kept"
  - "Both the profile-list key and the legacy key are denylisted from backups as defense in depth against partial/failed migration"
  - "Active default applies only when NO selector is supplied; an unknown selector errors with names only"
  - "getOracleToolConfig is retained as a compatibility accessor that resolves the active profile, so chat/Telegram gating keeps working after the legacy row is removed"
  - "oracle_list_connections joins the ORACLE_READ_TOOLS gated addendum; a disabled Oracle advertises no Oracle tool"
  - "No PROD confirmation guard added; read-only guard assertReadOnlyQuery stays byte-identical"
patterns-established:
  - "Migration tests seed a keyed settings mock (list key vs legacy key) so one-shot migration and deletion are asserted separately"
  - "Secret-bearing UI strings pass through a redact() helper before any toast, alert or stored test metadata"
requirements-completed: [D-09, D-10, D-11, D-12, D-13, D-14, D-15]
coverage:
  - id: D1
    description: "Named profile types plus one-shot migration wraps the working connection into active profile #1 and deletes the plaintext legacy row"
    requirement: D-09
    verification:
      - kind: unit
        ref: src/services/ai/__tests__/oracleSqlclService.test.ts#migrates the legacy single config into active profile #1 then deletes the legacy row
        status: pass
      - kind: unit
        ref: src/services/ai/__tests__/oracleMultiConnection.test.ts#migrates legacy config into active profile #1 then deletes the plaintext legacy row
        status: pass
    human_judgment: false
  - id: D2
    description: "Selector resolution by exact id, case-insensitive name/environment, active fallback, and name-only errors for unknown selectors"
    requirement: D-11
    verification:
      - kind: unit
        ref: src/services/ai/__tests__/oracleSqlclService.test.ts#resolves selectors by exact id, case-insensitive name/env, then active fallback
        status: pass
      - kind: unit
        ref: src/services/ai/__tests__/oracleMultiConnection.test.ts#unknown selector error lists names only, never a connection string or host
        status: pass
    human_judgment: false
  - id: D3
    description: "oracle_query / oracle_describe execute on the resolved profile under the unchanged read-only guard"
    requirement: D-15
    verification:
      - kind: unit
        ref: src/services/ai/__tests__/oracleSqlclService.test.ts#routes a query to the selected profile under the unchanged read-only guard
        status: pass
    human_judgment: false
  - id: D4
    description: "oracle_list_connections advertises only safe metadata and is offered only under the team enablement gate"
    requirement: D-12
    verification:
      - kind: unit
        ref: src/services/ai/__tests__/oracleMultiConnection.test.ts#oracle_list_connections advertises only safe metadata via the dispatch path
        status: pass
      - kind: unit
        ref: src/services/ai/__tests__/chatTurnTools.test.ts#advertises oracle_list_connections only under the Oracle enablement gate
        status: pass
    human_judgment: false
  - id: D5
    description: "Both Oracle settings keys are excluded from plaintext backup exports regardless of migration state"
    requirement: D-13
    verification:
      - kind: unit
        ref: tests/services/backup/exportBackup.test.ts#excludes both Oracle connection settings keys from a settings export
        status: pass
    human_judgment: false
  - id: D6
    description: "Settings modal/card manage named profiles with active selection, per-profile test/delete and no plaintext secrets in UI or errors"
    requirement: D-14
    human_judgment: true
    rationale: "No dedicated component test file exists in this tree for the modal; visual/interaction adequacy and secret masking require a real Tauri UI walkthrough. Behavior of the service API the modal calls is covered by focused unit tests."
actuals:
  tokens: 1035
  tasks: 3
  commits: 3
duration: 13m
completed: 2026-11-19
status: complete
---

# Phase 45 Plan 03: Oracle Multi-Connection Profiles Summary

**Named Oracle SQLcl connection profiles with single-transaction legacy migration, selector-based per-call routing, a gated safe-metadata discovery tool, backup denylisting, and shared profile-management UI**

## Performance

- **Duration:** 13 min
- **Started:** 2026-11-19T04:17:33Z
- **Completed:** 2026-11-19T04:30:45Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments
- Introduced `OracleConnectionProfile` / `OracleToolConfigList` with stable UUID id, display name, environment and active flag; query/describe args gained an optional selector.
- Migration wraps the existing working connection into active profile #1, persists the list, and deletes `oracle_ai_tool_config` in one Dexie `rw` transaction so no plaintext secret survives in settings.
- `resolveOracleConnection` resolves exact id -> case-insensitive name/environment -> active default; unknown selectors error with names only (no host/password).
- `oracle_query` / `oracle_describe` now execute on the resolved profile; `assertReadOnlyQuery` and the shell-command path are unchanged and a DELETE is still refused.
- Added `oracle_list_connections` returning only `{id, name, environment, isActive}`, registered in the same gated `ORACLE_READ_TOOLS` addendum.
- Coordinator readiness derives from any ready profile; both Oracle settings keys are denylisted from plaintext backups.
- Replaced the single-config Settings form with a shared `OracleProfileManager` (list/add/edit/test/delete/set-active) used by both the AI chat toolbox modal and Settings card, with `Input.Password` and redaction on every error/test path.
- All focused tests pass (26 across the two service suites in Task 3; 21 across the three Task 2 suites; 20 in Task 1) and `tsc --noEmit` is clean. No full suite was run, per project rule.

## Task Commits

Each task was committed atomically:

1. **Task 1: One Oracle call selects a named profile end-to-end** — `a58d2b16` (feat)
2. **Task 2: Advertise profiles safely, gate readiness, close backup leak** — `ca544f55` (feat)
3. **Task 3: Settings UI — list/add/edit/test/delete profiles and set active** — `0879a5ca` (feat)

**Plan metadata:** pending final docs commit

## Files Created/Modified
- `src/types/oracleSqlcl.ts` — profile/list/selector/summary types; selector args on query/describe.
- `src/services/ai/oracleSqlclService.ts` — load/save list, one-shot migration with legacy-row deletion, resolver, safe summaries; legacy accessor kept as active-profile shim.
- `src/services/ai/aiTools.ts` — selector fields on query/describe definitions, `oracle_list_connections` definition + dispatch, expanded `ORACLE_READ_TOOLS`.
- `src/services/ai/chatTurnTools.ts` — usage catalog entry for the new tool.
- `src/services/ai/office/teamRunCoordinator.ts` — readiness from any ready profile.
- `src/services/backup/exportBackup.ts` — both Oracle keys added to the denylist.
- `src/components/ai/OracleSqlclSettingsModal.tsx` — shared `OracleProfileManager` + modal wrapper.
- `src/components/settings/OracleAiToolConfigCard.tsx` — card now reuses the shared manager.
- `src/services/ai/__tests__/oracleSqlclService.test.ts` — migration, resolution, safe-error and read-only routing tests.
- `src/services/ai/__tests__/oracleMultiConnection.test.ts` — new focused suite for resolution/safe metadata/dispatch/backup.
- `src/services/ai/__tests__/chatTurnTools.test.ts` — gating assertion for the new tool.
- `tests/services/backup/exportBackup.test.ts` — both-keys-excluded test.

## Decisions Made
- Legacy row is deleted after a successful copy (D-13 rollback choice resolved toward security); the working connection is preserved inside profile #1, so no secret is lost and none is left readable.
- Denylisting the legacy key is defense in depth for partial/failed migrations or older builds, not a substitute for the migration delete.
- Active fallback is scoped to "no selector supplied"; a supplied-but-unknown selector must fail loudly with safe names only.
- `getOracleToolConfig` remains a thin compatibility accessor (active profile) so AIChatDrawer and Telegram gating keep working without editing those files.
- One shared UI component avoids divergent profile-management behavior between the chat toolbox and Settings.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered
- The existing `oracleSqlclService.test.ts` used a shared `fakeDb` whose `mockResolvedValueOnce` seeds matched the old single-config read. Focused tests were updated to seed the new keyed profile-list shape and to reset mock implementations per case; this is test maintenance for the declared storage migration, not a production change.
- No live Oracle/SSH verification (credentials unavailable, manual-only per 45-VALIDATION.md); all evidence is focused automated tests plus typecheck.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ready for plan 04: team pinned context can name an Oracle environment (e.g. "SIT") and agents select it via `oracle_query`/`oracle_describe` by `name`/`environment`; the pin never mutates the global active profile (D-19).
- A real Tauri UI walkthrough of profile add/edit/test/delete/set-active and secret masking remains for phase verification (D6 above).

## Self-Check: PASSED

---
*Phase: 45-knowledge-sets-docs-workspace-oracle-connections-team-pinned*
*Completed: 2026-11-19*
