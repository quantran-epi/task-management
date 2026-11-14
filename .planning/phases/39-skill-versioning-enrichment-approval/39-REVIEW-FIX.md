---
phase: 39-skill-versioning-enrichment-approval
fixed_at: 2026-11-14T07:20:00Z
review_path: .planning/phases/39-skill-versioning-enrichment-approval/39-REVIEW.md
iteration: 4
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 39: Code Review Fix Report

**Fixed at:** 2026-11-14T07:20:00Z
**Source review:** `.planning/phases/39-skill-versioning-enrichment-approval/39-REVIEW.md`
**Iteration:** 4

**Summary:**
- Findings in scope: 8 (4 critical, 2 warnings, 2 info)
- Fixed: 8
- Skipped: 0

## Fixed Issues

### CR-01: `neutralizeDelimiters` still deletes legitimate body text — the `KẾT THÚC` prefix branch fires on ordinary prose

**Files modified:** `src/services/ai/office/teamPrompts.ts`, `tests/services/ai/office/teamPrompts.test.ts`
**Commit:** `514f9de0`
**Status:** fixed: requires human verification
**Applied fix:** The prefix branch now requires a delimiter TAIL — a lookahead for an optional horizontal-whitespace run followed by `—`, `]`, or end of line — before the tail body is consumed. Ordinary Vietnamese (`kết thúc dữ liệu không đáng tin cậy`, `KẾT THÚC DỮ LIỆU KHÔNG ĐÁNG TIN là dữ liệu`) has no such tail and is therefore unmatchable, while every forged shape (bracketed with a label, bare at end of line, bare on its own line, bare with a stray `]`, and the opening tag) still redacts. Probed against the real cases: prose at line start, prose mid-line, the plain prose sentence, and a realistic skill body that documents this very control all survive byte-identical.

Four regression tests added, driving every branch:
- ordinary phrase at line start survives byte-identical;
- ordinary phrase mid-line survives;
- a skill body documenting the untrusted-data control survives byte-identical;
- every forged delimiter shape still redacts.

The two round-3 regression tests (plain prose, phrase split across a newline) are untouched and still pass.

### CR-04: A single invisible format character defeats `neutralizeDelimiters`

**Files modified:** `src/services/ai/office/teamPrompts.ts`, `tests/services/ai/office/teamPrompts.test.ts`
**Commit:** `514f9de0`
**Status:** fixed: requires human verification
**Applied fix:** `neutralizeDelimiters` folds every `\p{Cf}` character (ZWSP, soft hyphen, ZWJ, …) to a space before NFC normalisation and matching, so a tag split by an invisible character is now visible to the pattern and redacts. Test added covering all three variants the review proved; it also asserts the body's trailing text stays INSIDE the block (after the forged tag but before the wrapper's own closing tag), which is the property the bug violated.

### CR-02: Approving a proposal then saving the form silently reverts the approved body

**Files modified:** `src/components/ai/office/SkillEditorDrawer.tsx`, `src/db/repositories/aiOfficeRepo.ts`, `tests/components/ai/office/SkillEditorDrawer.test.tsx`, `tests/services/ai/office/aiOfficeRepo.test.ts`
**Commit:** `9dc8fc18`
**Status:** fixed: requires human verification
**Applied fix:** Fixed at the state owner, in two layers.
1. The form is seeded from a live `useLiveQuery` read of `aiSkills` (falling back to the prop only while the query has not resolved), keyed on `[open, liveSkill?.id, liveSkill?.updatedAt]`. An approval from any surface re-seeds the textareas, and `dirty` is compared against the live row, so an untouched form cannot be saved at all.
2. `updateSkill` takes an optional `AiSkillSeed` (the name/description/body the draft was seeded from) and refuses inside the same `rw` transaction when the live row no longer matches, throwing `SKILL_MOVED_MESSAGE`. This covers the window before the live query lands, and the transcript-approval-while-drawer-open shape.

The seed is content, not `updatedAt`: a probe showed two writes inside one millisecond share a timestamp and the guard silently passed. The drawer surfaces `SKILL_MOVED_MESSAGE` distinctly from the generic retry copy.

Tests added: approve-in-drawer then edit-name-and-save keeps the approved body (mutation-checked — reverting the re-seed fails it); save with a moved underlying row surfaces the refusal and leaves the newer body intact; repo-level compare-and-swap refusal plus a save carrying the current content still landing (mutation-checked — removing the guard fails both).

### CR-03: `get_linked_context` returns raw sticky-note bodies for task/CR/system links

**Files modified:** `src/services/ai/office/teamTools.ts`, `tests/services/ai/office/teamTools.test.ts`
**Commit:** `4becb37f`, `d7b67292`
**Applied fix:** The delegated `get_item_details` result is parsed and every `stickyNotes[].body` is wrapped with `wrapUntrusted`, matching the note/document branch and the handler's own stated contract. Non-body fields are preserved. Tests added for the task branch (asserting the injection text is wrapped and intact) and for the CR and system branches.

### WR-01: The drawer renders the same pending row twice for one refresh tick after Approve, with a duplicate React key

**Files modified:** `src/components/ai/office/SkillEditorDrawer.tsx`, `tests/components/ai/office/SkillEditorDrawer.test.tsx`
**Commit:** `9dc8fc18`
**Applied fix:** The live pending list now excludes ids already in `recentlyDecided`, exactly as `PendingSkillProposals` does. Test added with the write held open so the refresh window is observable; it asserts one card, no React duplicate-key warning, and one status line after the write lands. Mutation-checked — removing the filter fails it.

### WR-02: Round 3's unresolved-pending line offers no action — the row can never be cleared

**Files modified:** `src/components/ai/office/SkillEditorDrawer.tsx`, `tests/components/ai/office/SkillEditorDrawer.test.tsx`
**Commit:** `9dc8fc18`
**Applied fix:** `unresolvedCount` became `unresolvedRows`, and each row renders its own line with a `Từ chối` button calling `decideUnresolved` → `decideSkillVersion(row.id, 'rejected', db, row.baseVersion ?? 0)`. Rejection is not blocked by the stale guard, so the queue can be cleared. The copy now says only what the user can do. The round-3 test asserting the old text line was updated to the new per-row testid and copy; a new test rejects the row and asserts the badge disappears, the row leaves the unresolved list, and it lands in history as rejected.

### IN-01: `Drawer width` is deprecated in antd 6

**Files modified:** `src/components/ai/office/SkillEditorDrawer.tsx`
**Commit:** `9dc8fc18`
**Applied fix:** `width={560}` → `size={560}`.

### IN-02: `refusalMessage` is exported but no longer used outside its module

**Files modified:** `src/components/ai/office/deleteRefusalMessage.ts`
**Commit:** `9dc8fc18`
**Applied fix:** Dropped the `export`; the function is module-private, with a comment naming the condition for exporting it again.

## Verification

- Scoped suites: `teamPrompts`, `teamTools`, `aiOfficeRepo`, `aiSkillVersionRepo`, `SkillEditorDrawer`, `PendingSkillProposals`, `AiOfficeView`, `AiExplorers` — 188 tests, all passing.
- `npx tsc --noEmit` clean.
- No round-1/2/3 fix was reverted: `07e9a428` (pre-39 backup strip), the WR-03 stale guard, `resolvePinnedSkill`, and the round-3 prose-preservation tests are untouched and green.

---

_Fixed: 2026-11-14T07:20:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 4_
