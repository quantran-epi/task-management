---
phase: 39-skill-versioning-enrichment-approval
fixed_at: 2026-11-14T05:07:00Z
review_path: .planning/phases/39-skill-versioning-enrichment-approval/39-REVIEW.md
iteration: 1
findings_in_scope: 21
fixed: 21
skipped: 0
status: all_fixed
---

# Phase 39: Code Review Fix Report

**Fixed at:** 2026-11-14T05:07:00Z
**Source review:** `.planning/phases/39-skill-versioning-enrichment-approval/39-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 21 (4 critical, 10 warning, 7 info)
- Fixed: 21
- Skipped: 0

Verification: `npx tsc --noEmit` clean; 354 tests green across the 16 scoped suites
(`aiSkillVersionRepo`, `aiOfficeRepo`, `teamTools`, `teamPrompts`, `teamRunCoordinator`,
`officeBackup`, `validateBackup`, `backupSchemas`, `schemaV26Migration`, `schemaV19Migration`,
`aiTeamRepo`, `tableListParity`, `chatTurnRuntime`, `PendingSkillProposals`, `SkillEditorDrawer`,
`AiOfficeView`, `AiExplorers`).

## Fixed Issues

### CR-01: Version numbering collides with pre-39 numbered rows

**Files modified:** `src/db/schema.ts`, `src/db/index.ts`, `src/db/repositories/aiSkillVersionRepo.ts`, `src/db/repositories/aiOfficeRepo.ts`, `tests/db/schemaV26Migration.test.ts`, `tests/services/ai/office/aiTeamRepo.test.ts`, `tests/services/backup/officeBackup.test.ts`, `tests/services/ai/office/aiSkillVersionRepo.test.ts`
**Commit:** `781b3647`, `ca53a99d`
**Applied fix:** Added `SCHEMA_V26` and a `version(26)` upgrade hook that deletes `version` from every non-approved row (`LATEST_SCHEMA_VERSION` is now 26). The invariant is also enforced on write: `stripNonApprovedVersionNumbers` runs inside the same `rw` transaction that assigns the next number, in both `decideSkillVersion` and `updateSkill`, so a legacy numbered row cannot re-enter through a direct write or a pre-39 restore. New `tests/db/schemaV26Migration.test.ts` seeds a V25 database and proves the strip plus content preservation; a repo test proves numbering no longer collides.
**Status:** fixed: requires human verification (semantic — migration + numbering invariant)

### CR-02: Rejecting a legacy numbered pending keeps its version number

**Files modified:** `src/db/repositories/aiSkillVersionRepo.ts`, `tests/services/ai/office/aiSkillVersionRepo.test.ts`
**Commit:** `ca53a99d`
**Applied fix:** The rejected branch destructures `version` out of the spread (`const { version: _dropped, ...rest } = existing`) so the key is dropped rather than preserved. Test seeds a legacy numbered pending and asserts the stored row has no `version` key.

### CR-03: The first approval destroys the user-authored original body

**Files modified:** `src/db/repositories/aiSkillVersionRepo.ts`, tests in `aiSkillVersionRepo.test.ts`, `aiOfficeRepo.test.ts`, `PendingSkillProposals.test.tsx`, `SkillEditorDrawer.test.tsx`, `teamRunCoordinator.test.ts`
**Commit:** `ca53a99d`
**Applied fix:** Took the smaller-diff variant from the review: when `getLatestApprovedVersionNumber` returns 0, `decideSkillVersion` snapshots the current `aiSkills` row as approved v1 (`baseVersion: 0`, `createdAt`/`decidedAt` from the skill row) and numbers the proposal v2. Chose this over making `createSkill` append a baseline because it keeps the "baseline 0 = no approved row" semantics the pin and backup schemas rely on. Every test that asserted the old numbering (v1 for the first approval) was updated to the new correct values; no coverage was deleted. The `schemaV19Migration` round-trip test was left asserting a pending row verbatim because it seeds the row directly and never runs the V26 hook backwards.
**Status:** fixed: requires human verification (semantic — numbering semantics changed)

### CR-04: `wrapUntrusted` does not neutralize the label

**Files modified:** `src/services/ai/office/teamPrompts.ts`, `src/services/ai/office/teamTools.ts`, `tests/services/ai/office/teamPrompts.test.ts`, `tests/services/ai/office/teamTools.test.ts`
**Commit:** `ff1b5379`
**Applied fix:** `wrapUntrusted` now runs `neutralizeDelimiters` on the label and strips `[`, `]`, CR and LF, capped at 120 chars. The employee prompt no longer interpolates the raw name into a header — it wraps it as `wrapUntrusted('TÊN KỸ NĂNG', skill.name)` under a static `[KỸ NĂNG]` header. A regression test feeds the exact escape payload from the review and asserts the injected text stays on the header line with a single header occurrence.

### WR-01: A no-op skill save appends a new approved version

**Files modified:** `src/db/repositories/aiOfficeRepo.ts`, `tests/services/ai/office/aiOfficeRepo.test.ts`
**Commit:** `ca53a99d`
**Applied fix:** `updateSkill` compares the merged row against the existing one and returns early when name, description and body are all unchanged — no version row, no stale flip. Test asserts both `{}` and a patch restating current values leave the version count at 1.
**Status:** fixed: requires human verification (semantic — early return path)

### WR-02: `read_skill` falls back to the current row when a pin does not resolve

**Files modified:** `src/services/ai/office/teamTools.ts`, `tests/services/ai/office/teamTools.test.ts`
**Commit:** `ff1b5379`
**Applied fix:** A present pin that is missing or not approved now returns `refuse('SKILL_NOT_ASSIGNED', 'Không đọc được đúng phiên bản kỹ năng đã ghim.')`. Only an absent pin reads `aiSkills`. The test that asserted the fallback was inverted (renamed to `read_skill refuses when a present pin does not resolve (WR-02)`), and the tamper-guard test now asserts refusal instead of the current body.
**Status:** fixed: requires human verification (semantic — refusal branch)

### WR-03: `SkillEditorDrawer.handleSave` has no `catch`

**Files modified:** `src/components/ai/office/SkillEditorDrawer.tsx`
**Commit:** `7ebf54e8`
**Applied fix:** Added `saveError` state, a `catch` that sets the Vietnamese retry copy, reset on drawer open, and an `Alert type="error" role="alert"` (`data-testid="skill-editor-save-error"`) above the form.

### WR-04: Explorer delete paths are fire-and-forget

**Files modified:** `src/workbench/toolwindows/AiStaffExplorer.tsx`
**Commit:** `948bc1c6`
**Applied fix:** Added one `runDelete` helper that wraps the repo call in `try/catch` and routes both success and failure to the existing refusal alert state. Both `handleDeleteSkill` and `confirmDelete`'s `onOk` go through it.

### WR-05: Backup schema accepts `status: 'approved'` with no `version`

**Files modified:** `src/validation/backupSchemas.ts`, `tests/services/backup/validateBackup.test.ts`, `tests/validation/backupSchemas.test.ts`
**Commit:** `180f5386`
**Applied fix:** Added the bidirectional `superRefine` to `BackupAiSkillVersionRecordSchema`. New tests cover approved-without-number, non-approved-with-number, and the legal unnumbered pending. The existing evidence-cap fixture was updated to `status: 'approved'` because it carried a number.

### WR-06: `propose_skill_version` computes `baseVersion` outside the transaction

**Files modified:** `src/services/ai/office/teamTools.ts`, `src/db/repositories/aiSkillVersionRepo.ts`
**Commit:** `ff1b5379`
**Applied fix:** `createSkillVersion` takes an optional `baseVersion`; the tool reads the number once, builds the diff from it, and passes it into the repo. The stored row and the diff label can no longer disagree. Callers that do not render a diff keep the previous behaviour (the repo reads it inside the transaction).

### WR-07: `PendingSkillProposals` decided-card list is unbounded

**Files modified:** `src/components/ai/office/PendingSkillProposals.tsx`
**Commit:** `4cf9f24f`
**Applied fix:** The decided list is sorted and `.slice(0, MAX_VISIBLE)` so `slots` can never be permanently 0.

### WR-08: A proposal whose base cannot be resolved disappears silently

**Files modified:** `src/components/ai/office/PendingSkillProposals.tsx`
**Commit:** `4cf9f24f`
**Applied fix:** `unresolved = remaining.length - eligible.length` is added into `overflow`, and the early return now requires `overflow === 0` too, so the overflow line renders even when no card does.
**Status:** fixed: requires human verification (semantic — count reconciliation)

### WR-09: `chatTurnRuntime.test.ts` mocks `nineRouterClient` wholesale

**Files modified:** `tests/ai/chatTurnRuntime.test.ts`
**Commit:** `87fed272`
**Applied fix:** The mock now spreads `await importOriginal<typeof import(...)>()` and overrides only `streamChatEvents`, so `redactApiKey`, `streamChatCompletion` and `stripThinkingBlocks` stay real.

### WR-10: History tag derives "Đã duyệt" from the number

**Files modified:** `src/components/ai/office/SkillEditorDrawer.tsx`
**Commit:** `7ebf54e8`
**Applied fix:** Both the `v{n}` chip and the success tag are gated on `row.status === 'approved'`; the chip additionally requires a number. A legacy numbered rejected row now renders "Đề xuất bị từ chối" + "Đã từ chối".

### IN-01: `getLatestSkillVersion` is dead in `src`

**Files modified:** `src/db/repositories/aiSkillVersionRepo.ts`, `tests/services/ai/office/aiSkillVersionRepo.test.ts`
**Commit:** `ca53a99d`
**Applied fix:** Deleted the function and its only test. It was test-only and its doc comment overclaimed (it could return a rejected row).

### IN-02: `decideSkillVersion` duplicates the numbering query

**Files modified:** `src/db/repositories/aiSkillVersionRepo.ts`
**Commit:** `ca53a99d`
**Applied fix:** `decideSkillVersion` now calls `getLatestApprovedVersionNumber` — one numbering reader, one place to fix.

### IN-03: `PendingSkillProposals` takes an unused `team` prop

**Files modified:** `src/components/ai/office/PendingSkillProposals.tsx`, `src/components/ai/office/TeamWorkspace.tsx`, `tests/components/ai/office/PendingSkillProposals.test.tsx`
**Commit:** `4cf9f24f`
**Applied fix:** Dropped `team` from the interface, the destructure and both call sites.

### IN-04: `SkillCard`'s "dead `AiOfficeView` call site" comment is wrong

**Files modified:** `src/components/ai/office/SkillCard.tsx`, `src/views/AiOfficeView.tsx`, `src/workbench/toolwindows/AiStaffExplorer.tsx`, `tests/views/AiOfficeView.test.tsx`
**Commit:** `948bc1c6`
**Applied fix:** `AiOfficeView` now reads pending rows once and passes `pendingCount` to `SkillCard`; both misleading comments were corrected. New test asserts the badge renders on that surface.

### IN-05: The new runtime test asserts an error string as proof of success

**Files modified:** `tests/ai/chatTurnRuntime.test.ts`
**Commit:** `87fed272`
**Applied fix:** Replaced the `toContain('propose_skill_version')` assertion with assertions that the result carries neither `READ_ONLY_EMPLOYEE` nor a `refused` marker.

### IN-06: Redundant `aiSkills` write in the coordinator pin test

**Files modified:** `tests/services/ai/office/teamRunCoordinator.test.ts`
**Commit:** `ca53a99d`
**Applied fix:** Dropped the manual `aiSkills.put` so the test proves `decideSkillVersion`'s D-07 write actually fired. The pin assertion moved from 1 to 2 to match CR-03's baseline snapshot.

### IN-07: `read_skill` returns `name` unwrapped

**Files modified:** `src/services/ai/office/teamTools.ts`, `tests/services/ai/office/teamTools.test.ts`
**Commit:** `ff1b5379`
**Applied fix:** `name` is now `wrapUntrusted(...)` like description and body; the verbatim-body test asserts the wrapper instead of equality.

---

_Fixed: 2026-11-14T05:07:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
