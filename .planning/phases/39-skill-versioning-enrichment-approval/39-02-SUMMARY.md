---
phase: 39-skill-versioning-enrichment-approval
plan: 02
subsystem: ai-office / skill-versioning
tags: [skill-version, dexie, transaction, d-09, d-10, d-14]
requires:
  - "39-01 getLatestApprovedVersionNumber + optional AiSkillVersion.version"
  - "Phase 36 aiSkillVersions table + [skillId+version] index"
provides:
  - "updateSkill writes an approved version row in the same rw transaction"
  - "no unversioned name/description/body write path remains"
affects:
  - "39-04 (run pin), 39-05/39-06 (UI surfaces) read the same version history"
tech-stack:
  added: []
  patterns:
    - "read -> guard -> compute -> write inside one Dexie rw transaction"
    - "version row snapshots the MERGED row, never the all-optional patch"
key-files:
  created: []
  modified:
    - src/db/repositories/aiOfficeRepo.ts
    - tests/services/ai/office/aiOfficeRepo.test.ts
decisions:
  - "D-09: manual save = approved version row + aiSkills put in one transaction"
  - "D-14: numbering reads approved rows only, so a pending row cannot shift a manual save"
  - "D-10: createSkill stays version-free — implicit baseline while the table is empty"
  - "D-28: deleteSkill cascade unchanged"
metrics:
  duration: "~15 min"
  completed: "2026-11-14"
---

# Phase 39 Plan 02: Versioned manual skill saves Summary

`updateSkill` now opens `db.transaction('rw', [db.aiSkills, db.aiSkillVersions])` and writes one approved version row per save, so a manual edit in `SkillEditorDrawer` leaves the same history an approval does — and no caller can bypass it.

## What changed

**`src/db/repositories/aiOfficeRepo.ts`** — `updateSkill` rewritten:
- Whole body moved inside one `rw` transaction over `[db.aiSkills, db.aiSkillVersions]`; the `Không tìm thấy kỹ năng: ${id}` guard now runs inside it, so a missing row leaves both tables untouched.
- `now` computed once and used for `updatedAt`, `createdAt` and `decidedAt`, so a save's version row is self-consistent (`decidedAt === createdAt`).
- `baseVersion = await getLatestApprovedVersionNumber(id, db)` (imported from `./aiSkillVersionRepo`), `version: baseVersion + 1`. Approved-only, so a pending proposal cannot shift a manual save's number (D-14).
- The version row copies `updated.name` / `updated.description` / `updated.body` — the MERGED row. `AiSkillUpdate` is all-optional, so copying the raw patch would have written `undefined` into required string fields.
- `db.aiSkillVersions.add(versionRow)` before `db.aiSkills.put(updated)`.
- `createSkill` and `deleteSkill` are byte-identical (D-10, D-28).

**`tests/services/ai/office/aiOfficeRepo.test.ts`** — four new tests, real Dexie, no repo mocks:
- `updateSkill tạo một phiên bản đã duyệt cùng transaction (D-09)` — one row, `status: 'approved'`, `version: 1`, `baseVersion: 0`, new name/description/body, `decidedAt === createdAt`, and `aiSkills` carries the same three values.
- `updateSkill numbers the next manual save as max(approved) + 1 (D-09, D-14)` — two saves give 1 and 2; a pending row inserted directly (no `version` key) does not shift the third save, which is 3.
- `updateSkill leaves both tables unchanged when the skill row is missing (D-09)` — rejects with `/Không tìm thấy kỹ năng/` and `aiSkillVersions.count()` is 0.
- `createSkill writes no version row (D-10)` — the guard against a later "helpful" implicit v1.

## Verification

- `npx tsc --noEmit -p tsconfig.json` — 0 `error TS` lines
- `npx vitest run tests/services/ai/office/aiOfficeRepo.test.ts tests/views/AiOfficeView.test.tsx` — 2 files, 48 passed
- `git diff --stat tests/views/AiOfficeView.test.tsx` — empty (D-32 honoured)
- Acceptance greps: `db.transaction('rw', [db.aiSkills, db.aiSkillVersions]` (line 269), `getLatestApprovedVersionNumber` (import + line 281), `version: baseVersion + 1` (line 285), `status: 'approved'` (line 287), `grep -c aiSkillVersions` = 4
- `it(` count in the repo test file: 25 → 29

## Deviations from Plan

None - plan executed exactly as written.

No architectural changes, no auth gates, no package installs.

## Known Stubs

None.

## Threat Flags

None — no new network endpoint, auth path, or file-access pattern. T-39-06 (both tables in one `rw` scope), T-39-07 (versioning lives in the repo) and T-39-08 (approved-only numbering) are each covered by a test above.

## Self-Check: PASSED

- FOUND: src/db/repositories/aiOfficeRepo.ts
- FOUND: tests/services/ai/office/aiOfficeRepo.test.ts
- FOUND: fbf03861
- FOUND: ec4f7496
