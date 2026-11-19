---
phase: 46-configuration-profiles
plan: 03
subsystem: ui
tags: [configuration-profiles, import-preview, confirm-gate, telegram-excluded, dexie-db-prop, ant-design, a11y]

requires:
  - phase: 46-configuration-profiles
    provides: "46-01 strict envelope + validateConfigProfilePayload + applyConfigProfile safe merge; 46-02 catalog-driven secret/machine classification and SettingsView six-tab shell"
provides:
  - "Guided profile import card in the Settings data tab with a 50MB size guard and JSON parse error visibility"
  - "In-memory preview modal that flags every catalog secret field and machine-specific field (including ghostDevConfig.claudePath), excludes Telegram, and gates apply on exact IMPORT"
  - "Explicit db threading card -> modal -> applyConfigProfile, with a test proving writes land on the injected db and never during preview"
  - "Accessible two-group post-import checklist (secrets vs machine-specific) with screen-reader announcement and dismissal"
  - "SettingsView six-tab lock intact and the DatabaseClosedError unhandled rejection in its test removed"
affects:
  - "46-04 final validation gate"
  - "Any future import/export UX touching configuration profiles"

actuals:
  tokens: 16800
  tasks: 2
  commits: 3
  plan_head_before: 9935932e6364a54236168b71a93a4f7ccd74a1d6
  plan_head_after: 992e4989ddaecf56861fa87aab12b48e43a642e9

tech-stack:
  added: []
  patterns:
    - "File import via Ant Upload.Dragger + FileReader in browser and Tauri; no select_local_file call"
    - "Zero-write in-memory Zod validation preview, then exact confirm-text gate before applyConfigProfile"
    - "Catalog-derived secret/machine review groups so UI flags cannot drift from the profile schema"
    - "Explicit db prop threading through every component and service call on the import path"
    - "One Dexie instance per test file with beforeAll/afterAll so late liveQuery subscriptions cannot hit a closed db"

key-files:
  created:
    - "src/components/settings/ConfigProfileImportCard.tsx"
    - "src/components/settings/ImportProfilePreviewModal.tsx"
    - "src/components/settings/PostProfileImportChecklist.tsx"
    - "tests/components/settings/ImportProfilePreviewModal.test.tsx"
    - "tests/components/settings/PostProfileImportChecklist.test.tsx"
  modified:
    - "src/views/SettingsView.tsx"
    - "tests/views/SettingsView.test.tsx"
    - ".planning/phases/46-configuration-profiles/46-03-PLAN.md"

key-decisions:
  - "The import path never imports defaultDb; SettingsView threads its db prop into the card, which forwards it to the preview modal and applyConfigProfile."
  - "All catalog secrets and all machine-specific fields are flagged unconditionally; filtering to only fields present in a file would omit blanks the recipient must re-enter."
  - "Telegram remains entirely absent from preview and checklist, consistent with the owner-machine-only scope decision."
  - "The literal IMPORT confirm text and valid-payload requirement share one okButtonProps.disabled gate; no replace-all wording is used because apply is a key-by-key merge."
  - "The SettingsView test keeps one Dexie instance for the whole file (unique name, cleared per test) so a late useLiveQuery read cannot reject against a deleted db; no seventh tab was added."
  - "The import card defers all db use to the preview/apply path so rendering the data tab cannot interfere with GitHub sync live queries."
  - "Verification uses --bail=1 instead of the plan's legacy -x flag because Vitest 5 rejects -x."

patterns-established:
  - "Profile preview: validate first, show a two-group warning table, require exact IMPORT, then call applyConfigProfile(envelope, db)."
  - "Checklist fields are derived from getSecretFields/getMachineSpecificFields, never hand-maintained in the component."
  - "Import UI sits in the existing data tab beside BackupImportCard; no navigation or tab-union change."

requirements-completed: [D-03, D-04, D-05, D-06]

coverage:
  - id: D1
    description: "Profile import card in the Settings data tab with 50MB guard and visible JSON parse errors"
    requirement: D-06
    verification:
      - kind: unit
        ref: "tests/components/settings/ImportProfilePreviewModal.test.tsx#blocks invalid profile, backup envelope and telegram-carrying payloads without any db write"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit -p tsconfig.json && npx vitest run tests/views/SettingsView.test.tsx --bail=1"
        status: pass
    human_judgment: false
  - id: D2
    description: "Preview flags every catalog secret and machine-specific field, shows no Telegram item, and keeps imported conventions read-only"
    requirement: D-03
    verification:
      - kind: unit
        ref: "tests/components/settings/ImportProfilePreviewModal.test.tsx#flags blank secrets and machine-specific fields, and excludes Telegram"
        status: pass
    human_judgment: false
  - id: D3
    description: "Invalid, backup-envelope and Telegram-carrying payloads stay disabled and cause zero db writes"
    requirement: D-05
    verification:
      - kind: unit
        ref: "tests/components/settings/ImportProfilePreviewModal.test.tsx#blocks invalid profile, backup envelope and telegram-carrying payloads without any db write"
        status: pass
    human_judgment: false
  - id: D4
    description: "Apply is gated on exact IMPORT and writes to the explicitly threaded db, skipping secrets"
    requirement: D-05
    verification:
      - kind: unit
        ref: "tests/components/settings/ImportProfilePreviewModal.test.tsx#keeps OK disabled until exact IMPORT is typed and writes only to the threaded db"
        status: pass
    human_judgment: false
  - id: D5
    description: "Post-import checklist separates secrets from machine-specific review, includes claudePath, announces, and can be dismissed"
    requirement: D-04
    verification:
      - kind: unit
        ref: "tests/components/settings/PostProfileImportChecklist.test.tsx#separates secret re-entry from machine-specific review, excludes Telegram and announces"
        status: pass
      - kind: unit
        ref: "tests/components/settings/PostProfileImportChecklist.test.tsx#can be hidden by the parent"
        status: pass
    human_judgment: false
  - id: D6
    description: "SettingsView keeps exactly six tabs and no unhandled DatabaseClosedError in its focused suite"
    requirement: D-06
    verification:
      - kind: other
        ref: "npx vitest run tests/views/SettingsView.test.tsx --bail=1 (9 passed, no Errors line)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Visual adequacy of import card, preview modal and checklist in the real Tauri workbench"
    verification: []
    human_judgment: true
    rationale: "jsdom proves behaviour and a11y calls but not desktop layout; a human visual walkthrough is deferred to phase validation."

duration: 53min
completed: 2026-11-19
status: complete
---

# Phase 46 Plan 03: Configuration Profile Import Summary

**Guided profile import with in-memory warnings, exact IMPORT confirm gate, injected-db apply, and a two-group post-import checklist**

## Performance

- **Duration:** 53 min
- **Started:** 2026-11-19T06:08:52Z
- **Completed:** 2026-11-19T07:02:19Z
- **Tasks:** 2
- **Files modified:** 8 (5 created, 3 modified)

## Accomplishments

- Selecting a profile JSON opens a preview that flags every catalog secret for re-entry and every machine-specific field (including Ghost Dev `claudePath`) for review, with no Telegram item anywhere.
- Invalid profile JSON, backup envelopes and payloads carrying `telegramSettings` render visible errors, keep OK disabled and perform zero db writes.
- Apply requires the exact text IMPORT and calls `applyConfigProfile(envelope, db)` with the explicitly threaded db; a focused test proves writes land on the injected instance and blank secrets are skipped.
- A two-group post-import checklist announces itself to screen readers and can be dismissed; it is mounted in the Settings data tab beside BackupImportCard without adding a seventh tab.
- The `DatabaseClosedError` unhandled rejection from `tests/views/SettingsView.test.tsx` was eliminated by keeping one Dexie instance per test file instead of closing/deleting it under live subscriptions.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the import card, preview modal and confirm-gated apply** - `02abe1dc` (feat)
2. **Task 2: Mount the import card in Settings data tab and build the post-import checklist** - `345d6d7e` (feat)
3. **Integration fix: avoid db access while rendering the import card** - `992e4989` (fix, part of Task 2 close-out)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `src/components/settings/ConfigProfileImportCard.tsx` — Upload.Dragger file picker, 50MB guard, JSON parse, db forwarding
- `src/components/settings/ImportProfilePreviewModal.tsx` — in-memory validation, warning summaries, confirm gate, safe apply
- `src/components/settings/PostProfileImportChecklist.tsx` — catalog-derived two-group checklist with a11y announcement
- `src/views/SettingsView.tsx` — import card and checklist mounted in the data tab only
- `tests/components/settings/ImportProfilePreviewModal.test.tsx` — warnings, Telegram exclusion, confirm gate, injected-db proof, zero-write proof
- `tests/components/settings/PostProfileImportChecklist.test.tsx` — group coverage, announcement, dismissal
- `tests/views/SettingsView.test.tsx` — shared per-file db lifecycle removes the unhandled rejection; six-tab assertions unchanged
- `.planning/phases/46-configuration-profiles/46-03-PLAN.md` — documented the Vitest 5 `--bail=1` flag substitution

## Decisions Made

- The preview flags the whole catalog rather than only fields present in the file, because every catalog secret is blank by design and must be reviewed on the recipient machine.
- The db prop is required at the view/card boundary but no db call occurs while merely rendering the card, preventing interference with GitHub sync live queries.
- The SettingsView test uses one uniquely named Dexie instance for the file, cleared per test, so liveQuery subscriptions never outlive the database.
- No "thay thế toàn bộ" / replace-all wording appears in the import flow; the UI consistently describes a key-by-key merge.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Vitest 5 rejects the plan's `-x` flag**
- **Found during:** Task 1 verification
- **Issue:** `npx vitest run ... -x` is not accepted by Vitest 5.0.2.
- **Fix:** Used `--bail=1` in every focused command and documented it in the plan verification block.
- **Files modified:** `.planning/phases/46-configuration-profiles/46-03-PLAN.md`
- **Verification:** All focused suites run green with `--bail=1`.
- **Committed in:** `02abe1dc`

**2. [Rule 1 - Bug] Preview initially filtered secret warnings to fields in the fixture**
- **Found during:** Task 1 test run
- **Issue:** A valid profile that omitted some catalog secrets did not warn about all secrets the recipient must re-enter.
- **Fix:** Preview and checklist now flag every catalog secret unconditionally, merged with any blank secrets reported by apply.
- **Files modified:** `ImportProfilePreviewModal.tsx`, `PostProfileImportChecklist.tsx`
- **Verification:** Focused test asserting every `getSecretFields()` entry appears now passes.
- **Committed in:** `02abe1dc` / `345d6d7e`

**3. [Rule 1 - Bug] Rendering the new import card interfered with GitHub sync live queries**
- **Found during:** wave verification
- **Issue:** The data-tab remote-pull test intermittently failed with the card mounted; the card's db-prop plumbing made the test sensitive to concurrent live-query timing.
- **Fix:** The card defers all db use to the preview/apply path; rendering it no longer touches db state.
- **Files modified:** `src/components/settings/ConfigProfileImportCard.tsx`
- **Verification:** Final wave run: 3 files / 14 tests passed, no unhandled errors.
- **Committed in:** `992e4989`

**4. [Rule 2 - Missing critical] Unhandled DatabaseClosedError in SettingsView test**
- **Found during:** Task 2 non-regression work (explicitly required by the dispatch brief)
- **Issue:** `afterEach` closed and deleted the test db while AI-tab cards' useLiveQuery subscriptions were still winding down, producing an unhandled rejection even though assertions passed.
- **Fix:** Switched the suite to a single uniquely named Dexie instance opened in `beforeAll`, closed in `afterAll`, with `settings`/`changeRequests` cleared in `beforeEach`; six-tab expectations untouched.
- **Files modified:** `tests/views/SettingsView.test.tsx`
- **Verification:** `npx vitest run tests/views/SettingsView.test.tsx --bail=1` — 9 passed, no Errors section; wave run clean.
- **Committed in:** `345d6d7e`

---

**Total deviations:** 4 auto-fixed (4 Rule 1/2 bugs in this plan's new code and test lifecycle)
**Impact on plan:** No scope change. All must-haves and acceptance criteria verified; the six-tab lock remains intact.

## Issues Encountered

- The harness temp volume filled repeatedly during verification, intermittently blocking Bash; tests were rerun once capacity returned. No code impact.
- No full suite was run (project rule: over an hour).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 46-04 final validation: focused suite plus typecheck gate across plans 01–03.
- Native Tauri save/import visual walkthrough remains a manual-only validation item.
- No blockers.

## Self-Check: PASSED

- All five created files exist on disk.
- Task commits `02abe1dc`, `345d6d7e`, and `992e4989` are present in HEAD history.
- Typecheck clean; wave verification: 3 focused suites, 14 tests passed, no unhandled errors.
- Six-tab SettingsView lock intact; DatabaseClosedError warning resolved.

---
*Phase: 46-configuration-profiles*
*Completed: 2026-11-19*
