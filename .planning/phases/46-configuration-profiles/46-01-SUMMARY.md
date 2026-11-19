---
phase: 46-configuration-profiles
plan: 01
subsystem: configuration-profiles
tags: [zod, dexie, settings, secrets, export, import, localstorage, telegram-excluded]

requires:
  - phase: 45
    provides: "Preceding phase; no direct artifact dependency — all inputs are existing settings/backup/capacity primitives"
provides:
  - "Versioned strict Zod profile envelope with explicit blank-secret fields and no Telegram section"
  - "Catalog classifying all research-inventory keys as portable / secret-blank / machine-specific / excluded"
  - "Defaults assembled only from existing DEFAULT_* constants plus weekday capacity seed"
  - "Export of one in-memory profile to JSON with catalog-driven secret blanking, machine values preserved"
  - "Import with strict validation, snapshot, key-by-key merge in one Dexie transaction, natural-key capacity upserts, guarded Ghost Dev localStorage write, no Telegram writes"
  - "configuration_profiles denylisted from plaintext backups"
affects:
  - "46-02 authoring screen"
  - "46-03 import preview and post-import checklist"
  - "backup export semantics"

actuals:
  tokens: 255
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Independent profile schema (profileSchemaVersion=1) instead of reusing backup forbidden-key regex"
    - "Catalog-driven secret/machine classification sourced from exportBackup denylist + KEYRING_KEYS"
    - "Key-by-key Dexie merge with snapshot, never settings.clear()"
    - "Natural-key upsert for capacity rules/overrides with fresh IDs for new rows"

key-files:
  created:
    - "src/validation/configProfileSchemas.ts"
    - "src/services/configProfiles/types.ts"
    - "src/services/configProfiles/defaults.ts"
    - "src/services/configProfiles/catalog.ts"
    - "src/services/configProfiles/exportProfile.ts"
    - "src/services/configProfiles/importProfile.ts"
    - "tests/services/configProfiles/profileRoundTrip.test.ts"
    - "tests/validation/configProfileSchemas.test.ts"
    - "tests/services/configProfiles/exportProfile.test.ts"
    - "tests/services/configProfiles/importProfile.test.ts"
  modified:
    - "src/services/backup/exportBackup.ts"

key-decisions:
  - "Profile envelope is strictObject at envelope and config level; any telegramSettings section is rejected (owner-machine-only user decision)"
  - "Secrets are declared explicitly and must be '' — backup findForbiddenBackupKey would reject blank token/key/secret fields"
  - "getSecretFields() is derived from the catalog (denylist, suffix rule, KEYRING_KEYS), not a new hand-written list"
  - "SSH/Oracle connectionString is blanked wholesale; host/service siblings stay machine-specific for review"
  - "Import never reads/writes db.telegramSettings and never touches the OS keyring; blanks never overwrite real recipient values"
  - "-x was replaced with --bail=1 because Vitest 5 rejects the legacy flag"

patterns-established:
  - "One-row-array named profile CRUD on db.settings key configuration_profiles — no Dexie version bump"
  - "Ghost Dev localStorage write only after the Dexie transaction commits, guarded by typeof window and try/catch"
  - "Snapshot row last_pre_import_snapshot written before profile settings merge"

requirements-completed: [D-01, D-02, D-03, D-04, D-05, D-07]

coverage:
  - id: D1
    description: "Named profile round-trips export JSON → strict validation → key-by-key import with snapshot and capacity/Ghost Dev restore"
    requirement: D-01
    verification:
      - kind: unit
        ref: "tests/services/configProfiles/profileRoundTrip.test.ts#exports with blank secrets and imports key-by-key without touching Telegram"
        status: pass
    human_judgment: false
  - id: D2
    description: "All in-scope setting types and clean AI-team template are represented; Telegram and operational/bookkeeping data excluded"
    requirement: D-02
    verification:
      - kind: unit
        ref: "tests/validation/configProfileSchemas.test.ts#classifies every research-inventory key exactly once, with Telegram excluded"
        status: pass
    human_judgment: false
  - id: D3
    description: "Exported JSON contains no keyring-facing secret value; every catalog secret field is blank; import never overwrites real secrets with blanks"
    requirement: D-03
    verification:
      - kind: unit
        ref: "tests/services/configProfiles/exportProfile.test.ts#blanks every catalog secret, preserves machine values and omits Telegram"
        status: pass
      - kind: unit
        ref: "tests/services/configProfiles/importProfile.test.ts#merges key-by-key, skips blank secrets and takes a snapshot"
        status: pass
    human_judgment: false
  - id: D4
    description: "Machine-specific hosts, endpoints and paths survive in JSON and are classified for UI flagging"
    requirement: D-04
    verification:
      - kind: unit
        ref: "tests/validation/configProfileSchemas.test.ts#classifies every research-inventory key exactly once, with Telegram excluded"
        status: pass
    human_judgment: false
  - id: D5
    description: "Invalid payload produces zero db writes; valid import merges with snapshot and capacity upserts by natural key without duplicates"
    requirement: D-05
    verification:
      - kind: unit
        ref: "tests/services/configProfiles/importProfile.test.ts#writes nothing on invalid input"
        status: pass
    human_judgment: false
  - id: D6
    description: "Telegram is excluded: schema rejection plus byte-for-byte unchanged recipient row"
    requirement: D-07
    verification:
      - kind: unit
        ref: "tests/validation/configProfileSchemas.test.ts#rejects a telegramSettings section"
        status: pass
      - kind: unit
        ref: "tests/services/configProfiles/importProfile.test.ts#never reads or writes the Telegram row"
        status: pass
    human_judgment: false
  - id: D7
    description: "Saved profile list is denylisted from plaintext backups"
    requirement: D-03
    verification:
      - kind: unit
        ref: "tests/services/configProfiles/exportProfile.test.ts#denylists the profile list from plaintext backups"
        status: pass
    human_judgment: false
  - id: D8
    description: "Native Tauri/browser save-dialog chain for exported profile JSON"
    verification: []
    human_judgment: true
    rationale: "jsdom exercises the File System Access fallback only; native Tauri save dialog needs a real desktop walkthrough (deferred to phase validation)."

duration: 6min
completed: 2026-11-19
status: complete
---

# Phase 46 Plan 01: Configuration Profile Core Summary

**Versioned profile envelope with catalog-driven secret blanking, validation, and transaction-safe key-by-key import that excludes Telegram**

## Performance

- **Duration:** 6 min
- **Started:** 2026-11-19T05:43:22Z
- **Completed:** 2026-11-19T05:50:21Z
- **Tasks:** 3
- **Files modified:** 11 (10 created, 1 modified)

## Accomplishments

- Tracer proves one named profile round-trips from in-memory export to validated import with secrets preserved, snapshot written, capacity/Ghost Dev restored and Telegram untouched.
- Full key inventory classified once across portable, secret-blank, machine-specific and excluded buckets; all Telegram keys explicitly excluded.
- Defaults assembled only from existing `DEFAULT_*` constants (no db/localStorage/keyring reads) with clean AI-team template and weekday capacity seed.
- Export/import hardened: catalog-driven blanking, machine-value preservation, blank-skip on import, fresh IDs for new capacity rows, guarded localStorage write, zero writes on invalid payload, profile list denylisted from backups.

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer — one named profile round-trips export → JSON → import → db readback** - `824587c3` (feat)
2. **Task 2: Complete the key catalog and defaults from existing DEFAULT_* constants** - `70cc4753` (feat)
3. **Task 3: Harden export/import against secret leakage, collisions and backup exposure** - `2007c347` (harden)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `src/validation/configProfileSchemas.ts` — versioned strict envelope, blank-secret literals, Telegram rejection
- `src/services/configProfiles/types.ts` — ProfileConfig / ConfigurationProfile / AiTeamDefaultsTemplate
- `src/services/configProfiles/defaults.ts` — pure defaults from existing constants
- `src/services/configProfiles/catalog.ts` — key classification and secret/machine field lists
- `src/services/configProfiles/exportProfile.ts` — build payload + 3-layer file picker export
- `src/services/configProfiles/importProfile.ts` — CRUD + validate/snapshot/merge import
- `src/services/backup/exportBackup.ts` — `configuration_profiles` denylisted
- `tests/services/configProfiles/profileRoundTrip.test.ts` — end-to-end tracer
- `tests/validation/configProfileSchemas.test.ts` — schema/catalog/defaults boundary tests
- `tests/services/configProfiles/exportProfile.test.ts` — secret-leak and picker tests
- `tests/services/configProfiles/importProfile.test.ts` — merge/no-clear/capacity/Ghost Dev/Telegram tests

## Decisions Made

- Telegram excluded entirely by the owner-machine-only decision: no schema section, no export field, no import read/write.
- Profile schema is deliberately separate from backup schema; blank secret fields are legal here.
- Secret classification derives from `isSafeBackupSetting`, `UNSAFE_OR_EPHEMERAL_SETTING_KEYS` and `KEYRING_KEYS` rather than a parallel list.
- Import uses a single `rw` transaction over settings/capacityRules/capacityOverrides and writes Ghost Dev localStorage only after commit.
- Verification uses `--bail=1` because Vitest 5 rejects the legacy `-x` flag in the plan's command text.

## Deviations from Plan

None - plan executed exactly as written. The only implementation adjustments were the Vitest 5 `--bail=1` flag substitution (command-level, documented in Decisions) and reusing the Task 1 schema file unchanged in Task 2 because it already carried the required teamDefaults/Ghost Dev/strictObject shape.

**Total deviations:** 0 auto-fixed
**Impact on plan:** No scope change; all must-haves and acceptance criteria verified.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 46-02 (authoring screen and export button) and 46-03 (import preview + post-import checklist): all four service/schema modules and their tests are in place.
- Native Tauri save-dialog walkthrough remains a manual-only validation item (jsdom covers the browser fallback only).
- No blockers.

---
*Phase: 46-configuration-profiles*
*Completed: 2026-11-19*
