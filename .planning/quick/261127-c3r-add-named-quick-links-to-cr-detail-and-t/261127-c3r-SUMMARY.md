---
phase: quick
plan: 261127-c3r
subsystem: data-model, validation, ui
tags: [named-quick-links, zod, dexie, antd, backup, cr-detail, task-detail]
requires: []
provides:
  - "NamedQuickLink type and optional quickLinks field on ChangeRequest and Task"
  - "zod validation for quickLinks in input/update/backup schemas with existing link rules"
  - "Named-link editors in ChangeRequestModal and TaskDrawer"
  - "Named-link display in CR detail (cr-detail-block-quick-links) and ItemInsightView"
affects: [changeRequests, tasks, encrypted-backup]
tech-stack:
  added: []
  patterns:
    - "Additive optional field — no Dexie version or backup schema version bump"
    - "Reuse linkSchema at trust boundary; form trims/drops empty rows only"
key-files:
  created:
    - src/db/repositories/__tests__/namedQuickLinks.test.ts
  modified:
    - src/types/models.ts
    - src/validation/schemas.ts
    - src/validation/backupSchemas.ts
    - src/db/repositories/changeRequestRepo.ts
    - src/db/repositories/taskRepo.ts
    - src/components/changeRequests/ChangeRequestModal.tsx
    - src/components/tasks/TaskDrawer.tsx
    - src/views/ChangeRequestDetailView.tsx
    - src/views/ItemInsightView.tsx
key-decisions:
  - "Added quickLinks instead of changing documentLinks shape; 15 knowledge/AI consumers require string[]"
  - "Backup schema version stays 13 — quickLinks is optional, old backups still validate"
  - "Update patch with quickLinks: undefined deletes the field so removed links do not linger"
requirements-completed: [NAMED_QUICK_LINKS_MODEL, NAMED_QUICK_LINKS_FORM, NAMED_QUICK_LINKS_DETAIL_DISPLAY, NO_REGRESSION]
coverage:
  - id: D1
    description: "NamedQuickLink model and zod validation on CR/Task input, update and backup schemas"
    requirement: NAMED_QUICK_LINKS_MODEL
    verification:
      - kind: unit
        ref: src/db/repositories/__tests__/namedQuickLinks.test.ts#accepts a named link on CR and Task input and update schemas
        status: pass
      - kind: unit
        ref: src/db/repositories/__tests__/namedQuickLinks.test.ts#rejects empty/overlong names and unsafe URLs
        status: pass
    human_judgment: false
  - id: D2
    description: "Repo create/update round-trip preserves name+url and clears links on undefined; legacy rows still parse"
    requirement: NO_REGRESSION
    verification:
      - kind: integration
        ref: src/db/repositories/__tests__/namedQuickLinks.test.ts#create then read preserves name, url and documentLinks shape
        status: pass
      - kind: integration
        ref: src/db/repositories/__tests__/namedQuickLinks.test.ts#update changes links and clears them when patch sends undefined
        status: pass
      - kind: unit
        ref: src/db/repositories/__tests__/namedQuickLinks.test.ts#backup envelope round-trips quickLinks without a schema version bump
        status: pass
    human_judgment: false
  - id: D3
    description: "CR modal and Task drawer can add, edit and remove named links"
    requirement: NAMED_QUICK_LINKS_FORM
    verification: []
    human_judgment: true
    rationale: "No component test drives the FormList interactions; visual/manual verification required."
  - id: D4
    description: "CR detail and task detail render names as labels and open the validated URLs"
    requirement: NAMED_QUICK_LINKS_DETAIL_DISPLAY
    verification:
      - kind: unit
        ref: src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx
        status: pass
    human_judgment: true
    rationale: "Existing CR detail test proves no regression only; named-link display and click behavior need human sign-off."
actuals:
  tokens: 6995
  tasks: 3
  commits: 4
plan_head_before: 0e72d371f6770910f1a56b2e6a70102ce23bc20d
plan_head_after: 488c8f69a08036d25cad121bd5ac2956ec647358
duration: 14min
completed: 2026-11-27
status: complete
---

# Quick 261127-c3r: Named Quick Links on CR and Task Detail Summary

**Additive `quickLinks` field with validated name+url pairs, editors in CR/Task forms, and labeled links on both detail surfaces without touching `documentLinks`**

## Performance

- **Duration:** 14 min
- **Started:** 2026-11-27T01:49:04Z
- **Completed:** 2026-11-27T02:03:41Z
- **Tasks:** 3 of 3
- **Files modified:** 10
- **Commits:** 4 (RED + GREEN for TDD Task 1, plus Task 2 and Task 3)

## Accomplishments

- `NamedQuickLink { name, url }` added to `ChangeRequest` and `Task`; `documentLinks` remains `string[]` for all knowledge/AI consumers.
- zod `namedQuickLinkSchema` reuses existing `linkSchema` rules (http/https, file://, absolute paths, UUID doc); backup schemas accept the field with version unchanged (13).
- Repo create/update copy `quickLinks`; patch with `undefined` deletes the field so stale names disappear.
- Separate "Liên kết nhanh" editors in `ChangeRequestModal` and `TaskDrawer` trim inputs and drop empty rows; documentLinks editor untouched.
- CR detail block `cr-detail-block-quick-links`, quick-link count stat, and ItemInsightView section render names as labels, `title={url}`, with the existing `openDocumentLink` handler.

## Task Commits

1. **Task 1 (RED):** `2faeea0d` — `test(261127-c3r): add failing test for named quick links`
2. **Task 1 (GREEN):** `d3c98851` — `feat(261127-c3r): implement named quick links model, schemas and repo round-trip`
3. **Task 2:** `33b9035d` — `feat(261127-c3r): add named-link editor to CR modal and Task drawer`
4. **Task 3:** `488c8f69` — `feat(261127-c3r): render named quick links on CR and task detail`

TDD RED evidence verified: `check tdd-red-evidence` returned `RED_EVIDENCE_OK` (target test failed intentionally before implementation).

## Verification

Commands run (full `npm test` intentionally not run — project rule: > 1 hour):

- `npx vitest run src/db/repositories/__tests__/namedQuickLinks.test.ts --bail=1` — 7 tests passed
- `npx vitest run src/views/__tests__/ChangeRequestDetailView.subsystemOptions.test.tsx src/db/repositories/__tests__/namedQuickLinks.test.ts --bail=1` — 9 tests passed
- `npx tsc --noEmit` — clean

## Files Created/Modified

- `src/types/models.ts` — `NamedQuickLink` interface + optional field on CR/Task
- `src/validation/schemas.ts`, `src/validation/backupSchemas.ts` — validation at input/update/backup boundaries
- `src/db/repositories/changeRequestRepo.ts`, `src/db/repositories/taskRepo.ts` — create/update copy and clear semantics
- `src/db/repositories/__tests__/namedQuickLinks.test.ts` — schema, backup, repo round-trip tests
- `src/components/changeRequests/ChangeRequestModal.tsx`, `src/components/tasks/TaskDrawer.tsx` — named-link editors
- `src/views/ChangeRequestDetailView.tsx`, `src/views/ItemInsightView.tsx` — detail display

## Decisions Made

- Separate `quickLinks` field avoids reshaping `documentLinks` (15 consumers require `string[]`).
- No backup schema version bump: field optional, no normalization needed, legacy rows still restore.
- Form validation limited to trim/empty-row removal; zod owns URL and name validation at the write boundary.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Task input/update schemas initially omitted `quickLinks`**
- **Found during:** Task 1 GREEN verification
- **Issue:** Only CR input/update schemas had the field after the first bulk edit; `TaskInputSchema.parse(...).quickLinks` stayed undefined and tsc flagged test/repo errors.
- **Fix:** Added `quickLinks` to both task schemas and corrected the backup test to read `result.envelope.tables` and use matching CR ids.
- **Files modified:** `src/validation/schemas.ts`, `src/db/repositories/__tests__/namedQuickLinks.test.ts`
- **Verification:** Targeted Vitest 7/7 passed; tsc clean.
- **Committed in:** `d3c98851`

**2. [Rule 1 - Bug] Mixed `||` and `??` in ItemInsightView expression**
- **Found during:** Task 3 typecheck
- **Issue:** TS5076 on `(currentTask?.quickLinks || currentCr?.quickLinks ?? [])`.
- **Fix:** Switched to explicit `??` chain.
- **Files modified:** `src/views/ItemInsightView.tsx`
- **Verification:** tsc clean; 9 targeted tests passed.
- **Committed in:** `488c8f69`

---

**Total deviations:** 2 auto-fixed (Rule 1 bugs). **Impact:** Both were correctness fixes inside planned files; no scope creep.

## Issues Encountered

- Vitest TAP reporter does not emit `# tests/# pass/# fail` markers; RED evidence was classified from a normalized TAP record built from the real failing run (target assertion: `expected undefined to deeply equal [ { name: 'API spec', … } ]`). Gate returned `RED_EVIDENCE_OK`.

## Known Stubs

None.

## Threat Flags

None. URLs stay validated by `linkSchema`; no `innerHTML`, no shell concatenation, no new network surface.

## Self-Check: PASSED

- 11 files verified present (10 code + SUMMARY)
- 4 task commits verified in git history
- Targeted Vitest 9/9 and `npx tsc --noEmit` clean

## Next Phase Readiness

Ready for human UAT: edit a CR with two named links, save, reopen, verify names persist; click links (HTTP and local path) from CR detail and Task detail; confirm legacy `documentLinks` display unchanged. No blockers.

---
*Plan: quick 261127-c3r*
*Completed: 2026-11-27*
