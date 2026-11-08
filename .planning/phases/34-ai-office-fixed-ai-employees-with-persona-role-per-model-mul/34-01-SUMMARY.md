---
phase: 34-ai-office-fixed-ai-employees-with-persona-role-per-model-mul
plan: 01
subsystem: ai-office, data-layer
tags: [dexie, migration, schema, zod, chat-scope, sqlite-mirror]
requires: []
provides:
  - src/types/aiOffice.ts
  - src/validation/aiOfficeSchemas.ts
  - SCHEMA_V17
  - Dexie version 17
  - ChatScopeType 'team'
  - ChatMessage attribution fields
affects:
  - src/db/index.ts
  - src/db/schema.ts
  - src/types/models.ts
  - src/db/repositories/chatTabRepo.ts
  - src/services/localSqlitePersistence.ts
  - src-tauri/src/sqlite_persistence.rs
tech-stack:
  added: []
  patterns:
    - union-first-then-records domain type module
    - additive Dexie version step with no upgrade hook
    - input/update Zod schema pair
key-files:
  created:
    - src/types/aiOffice.ts
    - src/validation/aiOfficeSchemas.ts
    - tests/db/schemaV17Migration.test.ts
  modified:
    - src/db/schema.ts
    - src/db/index.ts
    - src/types/models.ts
    - src/db/repositories/chatTabRepo.ts
    - src/services/localSqlitePersistence.ts
    - src-tauri/src/sqlite_persistence.rs
    - tests/db.test.ts
    - src/db/repositories/__tests__/chatTabRepo.test.ts
decisions:
  - skillId is a scalar so "at most one skill per agent" is structural, not a runtime check
  - version(17) has no upgrade hook because the migration is purely additive
  - 'team' is a first-class ChatScopeType member and a threadScopeParts whitelist member
metrics:
  duration: ~14m
  completed: 2026-11-08
---

# Phase 34 Plan 01: AI Office Data Foundation Summary

Six AI Office object stores at Dexie version 17, one typed contract shared by repos/services/views, `'team'` as a first-class chat scope, and chat-message agent attribution — all additive, with V16 data proven to survive.

## What Was Built

**Type contract (`src/types/aiOffice.ts`, 120 lines).** Union-first then records, mirroring `src/types/agent.ts`. Exports `AiEmployee`, `AiLead`, `AiSkill`, `AiTeam`, `AiTeamStatus`, `AiTeamMember`, `AiTeamLink`, `AiTeamLinkItemType`, `TeamRunPhase`, `AgentRunStatus`, `AgentRunState`, `AgentIdentity`, plus `MAX_ACTIVE_TEAMS`, `MAX_EMPLOYEES_PER_TEAM`, `MAX_BATCH_SIZE`, `RECENT_WINDOW_TURNS`, `ASSIGNMENT_HISTORY_CAP`, `BUDGET_PAUSE_THRESHOLD`.

`TeamRunPhase` is an independent union — it does not reference `ChatTurnStatus` (verified: `grep -c ChatTurnStatus` returns 0). No persisted record carries a credential or instruction-text field name that the backup denylist rejects; the only free-text carriers are `persona` and `body`.

`AiEmployee.skillId` is `skillId?: string | undefined` — a scalar, so D-25's "at most one skill per agent" is enforced structurally.

**Boundary schemas (`src/validation/aiOfficeSchemas.ts`).** Ten schemas: `AiEmployeeInputSchema`/`UpdateSchema`, `AiLeadInputSchema`/`UpdateSchema`, `AiSkillInputSchema`/`UpdateSchema`, `AiTeamInputSchema`/`UpdateSchema`, `AiTeamMemberInputSchema`, `AiTeamLinkInputSchema`, plus `z.infer` input types. Length caps: name 60, role 60, capability 300, skill description 300. `budgetTokens` is `int().nonnegative()`.

**Migration.** `SCHEMA_V17` spreads `SCHEMA_V16` and adds exactly six stores. `this.version(17).stores(SCHEMA_V17)` has no `.upgrade()` — nothing to backfill. No existing store index spec was touched (in particular `chatMessages` gained no index; `where('threadId')` was already indexed).

**Chat scope.** `ChatScopeType` gains `'team'`; `threadScopeParts` whitelists it so `team:<id>` rehydrates as `{ scopeType: 'team', entityId }` rather than colliding with the shared global thread. The unknown-prefix `global` fallback is unchanged.

**Mirror allowlists.** Six names appended to `SQLITE_DOMAIN_TABLES` and to the Rust `ALLOWED_TABLES`.

## Verification

```
npx vitest run tests/db.test.ts tests/db/schemaV17Migration.test.ts \
  tests/db/schemaV16Migration.test.ts src/db/repositories/__tests__/chatTabRepo.test.ts
→ 4 files passed, 29 tests passed
npx tsc --noEmit → exit 0
git diff --stat package.json package-lock.json → empty
```

`tests/db.test.ts` now asserts the full 29-name table list. `tests/db/schemaV17Migration.test.ts` seeds a real `version(16)` fixture and asserts `verno === 17`, six surviving rows intact, six new stores empty, a `team:` thread round-trip, and agent attribution round-trip.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Comment text tripped the plan's own acceptance grep**
- **Found during:** Task 1
- **Issue:** The file header and the `TeamRunPhase` doc comment named the forbidden identifiers verbatim, so `grep -v '^#' src/types/aiOffice.ts | grep -c "ChatTurnStatus"` returned 1 and the `systemPrompt|prompt` grep returned 1 even though no code referenced them.
- **Fix:** Reworded both comments to describe the constraint without spelling the identifiers.
- **Files modified:** `src/types/aiOffice.ts`
- **Commit:** 6d8670cc

## TDD Gate Compliance

Plan frontmatter is `type: execute`, not `type: tdd`, so the plan-level RED/GREEN gate does not apply. Task 3 is the test gate for Tasks 1-2 and passes; Task 1's automated gate is the negated tsc grep (documented in the plan's own `<note>`), which passes.

## Known Stubs

None. All six stores are intentionally empty until later waves populate them; no UI renders them yet, so nothing is a stub.

## Threat Flags

None. No new network endpoint, auth path, or trust boundary was introduced beyond the three the plan's threat model already covers (persisted row → runtime, backup payload → restore, renderer → SQLite mirror).

## Commits

- `6d8670cc` feat(34-01): add AI Office type contract and Zod input schemas
- `be925f01` feat(34-01): add Dexie version(17), team chat scope and message attribution
- `468ad817` test(34-01): prove the V16 to V17 upgrade preserves data
