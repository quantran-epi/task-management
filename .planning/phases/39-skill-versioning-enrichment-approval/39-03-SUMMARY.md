---
phase: 39-skill-versioning-enrichment-approval
plan: 03
subsystem: ai-office / skill-versioning / run-pin
tags: [skill-version, pin, dexie, d-17, d-18, d-19, d-22]
requires:
  - "39-01 AiSkillVersion.version optional + getLatestApprovedVersionNumber"
  - "Phase 36 aiSkillVersions [skillId+version] compound index"
provides:
  - "TeamToolContext.skillVersion?: number | undefined"
  - "AttemptRef.skillVersion?: number | undefined"
  - "pinnedSkillVersion: Map<string, number> (coordinator-local)"
  - "read_skill resolves the pinned approved version, falls back to aiSkills"
  - "pin computed at dispatch, inherited at amend, recomputed at retry"
affects:
  - "39-04 (tool payload + propose_skill_version), 39-05/39-06 (approval UI)"
tech-stack:
  added: []
  patterns:
    - "exact compound-index lookup (`.equals`), never a range scan"
    - "pin carried on the attempt row, never re-derived from the roster"
key-files:
  created: []
  modified:
    - src/services/ai/office/teamTools.ts
    - src/services/ai/office/teamRunCoordinator.ts
    - tests/services/ai/office/teamTools.test.ts
    - tests/services/ai/office/teamRunCoordinator.test.ts
decisions:
  - "D-18: read_skill resolves the pinned approved version; baseline reads aiSkills"
  - "D-19: a mid-batch approval never changes a running attempt; the next attempt sees it"
  - "D-19a: a retry repins to the newest approved version instead of inheriting"
  - "T-39-09: a pin that resolves to a non-approved row falls back to aiSkills"
  - "Baseline pins are omitted, never 0 — the backup schema requires a positive int"
metrics:
  duration: "~12 min"
  completed: "2026-11-14"
---

# Phase 39 Plan 03: Pinned skill reads Summary

A dispatched attempt now carries the approved skill version it must read, `read_skill` resolves that exact version through the `[skillId+version]` index, and a mid-batch approval provably leaves a running agent on its pinned body while the next attempt sees the new one.

## What changed

**`src/services/ai/office/teamTools.ts`**
- `TeamToolContext.skillVersion?: number | undefined` — D-18, absent means the implicit baseline.
- `readSkill` rewritten: `!ctx.skillId` guard unchanged, then an exact `.where('[skillId+version]').equals([ctx.skillId, ctx.skillVersion]).first()` lookup (no `.between(...).last()` — that would serve the highest version ≤ the pin, T-39-11). The row is accepted only when `pinned?.status === 'approved'` (T-39-09); otherwise the handler falls back to `db.aiSkills.get(ctx.skillId)`. The existing `!skill` refusal is kept with the same message.
- `description` is now wrapped with `wrapUntrusted` as well as `body` (AIO-SKILL-06, D-22). Tool results bypass the prompt assembler, so this is a second injection channel with the same provenance argument.

**`src/services/ai/office/teamRunCoordinator.ts`**
- `pinnedSkillVersion: Map<string, number>` beside `activeAssignmentByAgent`.
- `AttemptRef.skillVersion?: number | undefined` — the only carrier from the three `createAssignment` sites into `startEmployeeTurn`, so the hot path takes no extra DB read.
- `toolContext(agentId)` spreads the pin from the map; it deliberately does not read `roster.skills`, which holds the CURRENT approved rows — exactly what a mid-batch approval changes.
- `startEmployeeTurn` deletes the entry before the `if (attempt)` block (a mention / `send_message` turn has no pin), then sets it when `attempt.skillVersion !== undefined`.
- `finalizeAttempt` deletes the entry inside the same identity guard as `activeAssignmentByAgent.delete`, so a late finalize of attempt 1 cannot clear attempt 2's pin.
- Pin computation, three sites, three rules:
  - **Dispatch** — `getLatestApprovedVersionNumber(skill.id, db)`, spread only when `> 0`, on both `createAssignment` and the `AttemptRef` literal (D-17).
  - **Amend** — unchanged inheritance from `row.skillVersion` on `createAssignment`, plus the matching spread on its `AttemptRef` (D-19).
  - **Retry** — `source.skillVersion` inheritance removed; a fresh `getLatestApprovedVersionNumber(source.skillId, db)` guarded by `source.skillId !== undefined` (D-19a).

**Tests**
- `teamTools.test.ts`: four new `read_skill` tests (pinned version served, missing pin falls back, rejected row never served, both fields wrapped) plus the existing verbatim test relaxed from `toBe` to `toContain` on `description` only — the body assertion is untouched.
- `teamRunCoordinator.test.ts`: new `skill version pin (AIO-SKILL-05, D-17, D-18, D-19)` describe with three tests, each building its own harness; the mid-batch tests share a local `startParkedBatch` helper but no mutable state.

## Verification

- `npx tsc --noEmit -p tsconfig.json` — 0 `error TS` lines
- `npx vitest run tests/services/ai/office/teamTools.test.ts -t "read_skill"` — 5 passed
- `npx vitest run tests/services/ai/office/teamTools.test.ts` — 32 passed
- `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "skill version pin"` — 3 passed
- `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "a new attempt after the approval"` — 1 passed (test 3 stands alone)
- `npx vitest run tests/services/ai/office/teamRunCoordinator.test.ts -t "payload"` — 10 passed
- Both suites together — 190 passed
- Acceptance greps: `skillVersion?: number | undefined` in both files; `equals([ctx.skillId, ctx.skillVersion])` present; no `between([ctx.skillId` in `teamTools.ts`; `pinned?.status === 'approved'` present; `grep -c wrapUntrusted` = 7; `pinnedSkillVersion` = 5 occurrences; `getLatestApprovedVersionNumber` = 3; no `source.skillVersion`; `row.skillVersion !== undefined` = 2 (amend create + amend ref)

## Deviations from Plan

**1. [Rule 1 - Bug] `finalizeAttempt`'s pin delete needed the same identity guard as the link delete**
- **Found during:** Task 2
- **Issue:** the plan said to add `pinnedSkillVersion.delete(finalized.agentId)` beside the two existing deletes inside the `finalized !== null` guard. Placed there literally, a late finalize of attempt 1 would clear attempt 2's pin — the exact WR-07 race the surrounding code already guards against for `activeAssignmentByAgent`.
- **Fix:** moved the delete inside the `active?.assignmentId === finalized.id` branch, mirroring the adjacent link cleanup.
- **Files modified:** `src/services/ai/office/teamRunCoordinator.ts`
- **Commit:** 5507d644

No architectural changes, no auth gates, no package installs.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-39-09 (approved-only pin), T-39-10 (description wrapped), T-39-11 (`.equals` only), T-39-12 (pin cleared on pin-less turns and at finalize) are each covered by a test.

## Self-Check: PASSED

- FOUND: src/services/ai/office/teamTools.ts
- FOUND: src/services/ai/office/teamRunCoordinator.ts
- FOUND: tests/services/ai/office/teamTools.test.ts
- FOUND: tests/services/ai/office/teamRunCoordinator.test.ts
- FOUND: 30364aa9
- FOUND: 5507d644
- FOUND: 18b2a8a5
