---
phase: 39-skill-versioning-enrichment-approval
fixed_at: 2026-11-14T06:31:00Z
review_path: .planning/phases/39-skill-versioning-enrichment-approval/39-REVIEW.md
iteration: 3
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Phase 39: Code Review Fix Report

**Fixed at:** 2026-11-14T06:31:00Z
**Source review:** `.planning/phases/39-skill-versioning-enrichment-approval/39-REVIEW.md`
**Iteration:** 3

**Summary:**
- Findings in scope: 9 (1 critical, 3 warnings, 5 info)
- Fixed: 9
- Skipped: 0

## Fixed Issues

### CR-01: `neutralizeDelimiters` over-redacts — the `\s+` widening now swallows legitimate body text across line breaks

**Files modified:** `src/services/ai/office/teamPrompts.ts`, `tests/services/ai/office/teamPrompts.test.ts`
**Commit:** `2ab5fdf6`
**Applied fix:** Replaced the bare-phrase pattern with a delimiter-shape pattern anchored to a leading `[` or the `KẾT THÚC` prefix, with `[^\S\n]` between words and `[^\]\n]*` for the tail — it can no longer cross a newline or eat following text. Probed against the real cases: the multi-step Vietnamese body, the single-line body and the phrase split across a line break all survive byte-identical, while `[KẾT THÚC …]`, double-space, tab, NBSP, em-space, NFD, `KẾT THÚC` without brackets, `[DỮ LIỆU KHÔNG ĐÁNG TIN — BẮT ĐẦU]` and a forged tag on its own line are still redacted. Two regression tests added (multi-step body intact; phrase split across a newline not redacted); both fail against the round-2 regex (mutation-checked).

### WR-01: WR-05 double-wraps linked-item names on the coordinator path

**Files modified:** `src/services/ai/office/teamTools.ts`, `tests/services/ai/office/teamTools.test.ts`
**Commit:** `de4e9380`
**Applied fix:** `list_linked_items` returns the raw name again; `buildLeadTurnRequest` owns the prompt boundary and wraps exactly once. Test drives `list_linked_items` → `buildLeadTurnRequest` end to end and asserts one header and one policy sentence per item, no `[redacted-tag]`, and every raw name present. Fails when the tool re-wraps (mutation-checked: 11 header occurrences instead of 6).

### WR-02: `SkillEditorDrawer` silently hides a pending proposal whose base cannot resolve

**Files modified:** `src/components/ai/office/SkillEditorDrawer.tsx`, `tests/components/ai/office/SkillEditorDrawer.test.tsx`
**Commit:** `76aa3088`
**Applied fix:** `pendingCount` now counts every pending row (matching `SkillCard`'s raw DB count), the section renders whenever any pending exists, and an unresolved pending surfaces through `skill-pending-unresolved` — the same overflow mechanism `PendingSkillProposals` uses. Test seeds a pending with `baseVersion: 9`, asserts badge `1 chờ duyệt`, header `Chờ duyệt (1)`, no card, and the unresolved line. Fails against the old filter (mutation-checked).

### WR-03: `decideSkillVersion` has no stale guard — the "newer version approved" protection is UI-only

**Files modified:** `src/db/repositories/aiSkillVersionRepo.ts`, `src/components/ai/office/SkillEditorDrawer.tsx`, `src/components/ai/office/PendingSkillProposals.tsx`, `tests/services/ai/office/aiSkillVersionRepo.test.ts`, `tests/components/ai/office/SkillEditorDrawer.test.tsx`, `tests/components/ai/office/PendingSkillProposals.test.tsx`
**Commits:** `76aa3088`, `d1a35055`
**Applied fix:** `decideSkillVersion` takes an optional `expectedBaseVersion` and refuses, inside the same `rw` transaction, when the reviewed base differs from the row's recorded base or from the live approved number. Both call sites pass `row.baseVersion ?? 0` and render `STALE_VERSION_MESSAGE` instead of the generic retry copy. The guard runs before the legacy-repair write, so a refused approval writes nothing. Repo tests cover the two-pendings-on-one-base case (A's content survives, B stays pending and unnumbered), a mismatched expected base, and rejection still working on a stale row.

### IN-01: `AiOfficeView`'s new delete alert uses the deprecated `message` / `onClose` props

**Files modified:** `src/views/AiOfficeView.tsx`, `src/workbench/toolwindows/AiStaffExplorer.tsx`
**Commits:** `a1c4e219`, `5669a9e6`
**Applied fix:** Both surfaces now use `title={…}` and `closable={{ onClose: … }}`. The deprecation existed on two surfaces, so both were fixed.

### IN-02: The IN-02 caption still promises a version on every save

**Files modified:** `src/components/ai/office/SkillEditorDrawer.tsx`, `tests/components/ai/office/SkillEditorDrawer.test.tsx`
**Commit:** `a1c4e219`
**Applied fix:** Save is disabled until the form differs from the stored skill (`dirty`), and the caption reads `Lưu thay đổi (nếu có) sẽ tạo một phiên bản mới trong lịch sử.` Test asserts disabled on open, enabled after a real edit, disabled again when the value is typed back.

### IN-03: `get_linked_context` returns `name` raw while `list_linked_items` now wraps it

**Files modified:** `src/services/ai/office/teamTools.ts`, `tests/services/ai/office/teamTools.test.ts`
**Commit:** `e9f2e535`
**Applied fix:** Both tool paths return the raw name; the prompt assembler is the single wrap point (WR-01's decision). Test asserts `result.name` is exactly the note title on the context path.

### IN-04: `runDelete` and its failure copy are now duplicated across two surfaces

**Files modified:** `src/components/ai/office/deleteRefusalMessage.ts`, `src/views/AiOfficeView.tsx`, `src/workbench/toolwindows/AiStaffExplorer.tsx`
**Commits:** `a1c4e219`, `a6b67c96`
**Applied fix:** `DELETE_FAILED_COPY` and a shared `deleteFailureMessage(run)` runner live in `deleteRefusalMessage.ts`; both surfaces call it and no longer carry their own try/catch. The now-unused `applyRefusal` helper was removed.

### IN-05: IN-06's test proves the call reaches the MCP dispatcher, not a team-tool handler

**Files modified:** `tests/ai/chatTurnRuntime.test.ts`
**Commit:** `df81e986`
**Applied fix:** Rewrote the inline comment and the hoisted-stub comment to state what the test actually proves — the read-only gate lets `propose_skill_version` reach dispatch — and to say explicitly that `executeDynamicMcpTool` is the fall-through, not a team-tool handler.

## Verification

- `npx tsc --noEmit`: clean.
- Scoped suites (19 files, 597 tests): all passing — `aiOfficeRepo`, `teamTools`, `teamPrompts`, `aiSkillVersionRepo`, `teamRunCoordinator`, `schemaV19Migration`, `schemaV26Migration`, `SkillEditorDrawer`, `PendingSkillProposals`, `AiOfficeView`, `AiExplorers`, `chatTurnRuntime`, `officeBackup`, `validateBackup`, `backupSchemas`, `patchProposal`, `aiTools`, `PatchDiffApprovalCard`, `aiOrchestratorLoop`.
- Mutation checks: reverting CR-01's regex, WR-01's wrap point and WR-02's count each fails the new test; the tree was restored after each probe.

---

_Fixed: 2026-11-14T06:31:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 3_
