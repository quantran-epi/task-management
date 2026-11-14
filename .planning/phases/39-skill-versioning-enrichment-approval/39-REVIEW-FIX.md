---
phase: 39-skill-versioning-enrichment-approval
fixed_at: 2026-11-14T06:05:00Z
review_path: .planning/phases/39-skill-versioning-enrichment-approval/39-REVIEW.md
iteration: 2
findings_in_scope: 13
fixed: 13
skipped: 0
status: all_fixed
---

# Phase 39: Code Review Fix Report

**Fixed at:** 2026-11-14T06:05:00Z
**Source review:** `.planning/phases/39-skill-versioning-enrichment-approval/39-REVIEW.md`
**Iteration:** 2

**Summary:**
- Findings in scope: 13 (2 critical, 5 warning, 6 info)
- Fixed: 13
- Skipped: 0

Round 1's 21 fixes are untouched; the round-2 report confirmed all of them as holding.
`validateBackup.ts`'s pre-schema strip (commit `07e9a428`) is also untouched — the WR-05
`superRefine` and the strip at the validation boundary stay as a pair.

## Fixed Issues

### CR-01 (and IN-05): `propose_skill_version` ignored the attempt pin

**Files modified:** `src/services/ai/office/teamTools.ts`, `tests/services/ai/office/teamTools.test.ts`
**Commit:** `4f26fa4b`
**Applied fix:** Extracted the existing pin lookup from `read_skill` into one
`resolvePinnedSkill(skillId, ctx)` helper and used it on both paths. `proposeSkillVersion` now
diffs against the pinned version row and numbers the proposal with `ctx.skillVersion`, so a
run pinned to v2 whose skill got v3 approved mid-batch produces `baseVersion: 2` — the card's
stale check (`2 < 3`) disables Approve instead of silently discarding v3. An unresolved pin is
refused, never silently re-based. IN-05: the refusal message now names the real cause and
points the agent at the description. Regression tests mirror the reviewer's probe (pin 2,
approve 3, propose → diff contains `-# V2`, not `V3-IMPORTANT`; `baseVersion === 2`) plus an
unresolved-pin refusal that writes no row.

### CR-02: The first manual save destroyed the create-time body

**Files modified:** `src/db/repositories/aiOfficeRepo.ts`, `src/components/ai/office/SkillEditorDrawer.tsx`, `tests/services/ai/office/aiOfficeRepo.test.ts`, `tests/components/ai/office/SkillEditorDrawer.test.tsx`
**Commit:** `1e3e9b2e`
**Applied fix:** `updateSkill` now uses the same baseline convention `decideSkillVersion`
established: when no approved row exists, snapshot the existing `aiSkills` row as v1 (with its
create-time `createdAt`/`updatedAt`), then number the save v2. One convention on both write
paths, not two. Tests: the first-save assertions moved from `version === 1` to a v1-snapshot +
v2 assertion, and a new test proves the create-time body survives (`[1,'# GOC'],[2,'# SUA']`)
plus one proving a manual save continues from a v1 baseline an approval already created.

### WR-01 (and IN-02): A just-approved card rendered the "newer version approved" warning

**Files modified:** `src/components/ai/office/PendingSkillProposals.tsx`, `src/components/ai/office/SkillEditorDrawer.tsx`, `tests/components/ai/office/PendingSkillProposals.test.tsx`, `tests/components/ai/office/SkillEditorDrawer.test.tsx`
**Commit:** `edd1e05c`
**Applied fix:** `stale={!decision.get(row.id) && …}` on both surfaces — a decided card is not
stale, the decision supersedes the check. IN-02: the drawer caption now reads "Lưu thay đổi sẽ
tạo một phiên bản mới…", which matches the no-op early return. Tests assert the decided card
has no `role="alert"` and no "đề xuất lại" text on both surfaces.

### WR-02: The drawer badge and header counted already-decided cards

**Files modified:** `src/components/ai/office/SkillEditorDrawer.tsx`, `tests/components/ai/office/SkillEditorDrawer.test.tsx`
**Commit:** `67ca907e`
**Applied fix:** `pendingCount` now counts `pending.filter((row) => patches.has(row.id)).length`.
The decided cards stay in `pendingSectionRows` (D-25 keeps them visible), the header renders
only when `pendingCount > 0`, and the section itself stays mounted while any card remains so
the decided card does not vanish. Test asserts the badge disappears and the header no longer
reads "Chờ duyệt (1)" after an approval, while the card stays.

### WR-03: `AiOfficeView` skill delete was fire-and-forget

**Files modified:** `src/views/AiOfficeView.tsx`, `tests/views/AiOfficeView.test.tsx`
**Commit:** `d0a1b3ec`
**Applied fix:** Added the same `runDelete(run)` helper `AiStaffExplorer` uses and routed all
three deletes through it, so a rejected promise sets "Không xóa được. Thử lại." instead of
escaping as an unhandled rejection. Test spies `deleteSkill` to reject and asserts the alert.

### WR-04 (and IN-01): `neutralizeDelimiters` missed whitespace and NFD variants

**Files modified:** `src/services/ai/office/teamPrompts.ts`, `tests/services/ai/office/teamPrompts.test.ts`
**Commit:** `9a1feac2`
**Applied fix:** `.normalize('NFC')` first, then `\s+` between every word of the tag with the
`u` flag. IN-01: the label sanitiser's character class now includes `\u2028`, `\u2029` and
`\u0085`. Tests cover double space, tab, NBSP and NFD, and assert only the wrapper's own
closing tag survives in each case.

### WR-05: `list_linked_items` returned the item name raw, and the lead prompt interpolated it raw

**Files modified:** `src/services/ai/office/teamTools.ts`, `src/services/ai/office/teamPrompts.ts`, `tests/services/ai/office/teamTools.test.ts`, `tests/services/ai/office/teamPrompts.test.ts`
**Commit:** `4fb12da3`
**Applied fix:** `name: wrapUntrusted('TÊN MỤC LIÊN KẾT', label?.name ?? link.itemId)` in the
tool result and the same wrap in `buildLeadTurnRequest`. The linked-item test now asserts the
wrapper is present and the raw name still readable inside it; a new prompt test proves a forged
closing tag inside a name is redacted.

### IN-03: `schemaV19Migration.test.ts` still asserted a numbered pending round-trips

**Files modified:** `tests/db/schemaV19Migration.test.ts`
**Commit:** `cd24f201`
**Applied fix:** Dropped `version: 1` from the seeded row and added
`expect(...?.version).toBeUndefined()`, so the test no longer encodes the pre-39 shape.

### IN-04: The strip rule exists twice

**Files modified:** `src/db/repositories/aiSkillVersionRepo.ts`, `src/services/backup/validateBackup.ts`
**Commit:** `40bab359`
**Applied fix:** Bidirectional cross-reference comments naming the other copy and the rule
("change both or neither"). No behavioural change, so no test.

### IN-06: The IN-05 fix did not prove the handler ran

**Files modified:** `tests/ai/chatTurnRuntime.test.ts`
**Commit:** `8c0d2807`
**Applied fix:** Stubbed `executeDynamicMcpTool` (the path the loop actually dispatches
`propose_skill_version` to) and asserted it was called with the tool name and args, that the
result parses to the stub's payload, and that it contains no `error`. The old assertions
passed on the unknown-MCP error string; this one cannot.

## Skipped Issues

None — all in-scope findings were fixed.

## Verification

- `npx tsc --noEmit`: clean.
- Scoped vitest runs (never the full suite): `aiOfficeRepo`, `teamTools`, `teamPrompts`,
  `aiSkillVersionRepo`, `teamRunCoordinator`, `schemaV19Migration`, `SkillEditorDrawer`,
  `PendingSkillProposals`, `AiOfficeView`, `AiExplorers`, `chatTurnRuntime`, `officeBackup`,
  `validateBackup`, `exportBackup` — 437 tests passed, 0 failed.
- No round-1 fix was reverted or weakened.

---

_Fixed: 2026-11-14T06:05:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
