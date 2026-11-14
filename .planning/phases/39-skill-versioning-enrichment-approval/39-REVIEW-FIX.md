---
phase: 39-skill-versioning-enrichment-approval
fixed_at: 2026-11-14T07:35:00Z
review_path: .planning/phases/39-skill-versioning-enrichment-approval/39-REVIEW.md
iteration: 5
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 39: Code Review Fix Report

**Fixed at:** 2026-11-14T07:35:00Z
**Source review:** `.planning/phases/39-skill-versioning-enrichment-approval/39-REVIEW.md`
**Iteration:** 5

**Summary:**
- Findings in scope: 6
- Fixed: 6
- Skipped: 0

## Fixed Issues

### CR-01: Round 4's delimiter-tail requirement lets forged tags through

**Files modified:** `src/services/ai/office/teamPrompts.ts`, `tests/services/ai/office/teamPrompts.test.ts`
**Commit:** `d5509a00`
**Applied fix:** Widened the tail alternation to `(?=[^\S\n]*(?:[—–\-:|=\]]|$))` — exactly the separators a label can use. Round 4 accepted only `—`, `]` or EOL, so forged tags separated by `-`, `–`, `:`, `|` or `=` survived, including the opening tag with a hyphen. Prose is followed by a letter or a sentence period, neither of which is in the set. The comment records why `[^\p{L}\p{N}\s]` is wrong (it eats the sentence period).

The CR-01 test is now **bidirectional and table-driven**, which is the thing that stops a sixth regression:
- `still redacts every forged delimiter shape (CR-01)` — 13 rows: em dash, hyphen, en dash, colon, pipe, equals, bracketed-no-label, bare EOL, bare own-line, bare stray-bracket, and three opening-tag spellings. Each asserts `[redacted-tag]` is present and the body region carries no `KHÔNG ĐÁNG TIN<sep>` shape.
- `leaves every prose shape byte-identical (CR-01)` — 6 rows: `… cậy`, `… là dữ liệu`, `… KHÔNG ĐÁNG TIN.`, mid-line, line-break split, and the documented-control body. Each asserts the body survives verbatim and no `[redacted-tag]` appears.

Status: **fixed: requires human verification** (regex logic).

### WR-04: Invisible characters outside `\p{Cf}` still split the tag

**Files modified:** `src/services/ai/office/teamPrompts.ts`, `tests/services/ai/office/teamPrompts.test.ts`
**Commit:** `d5509a00`
**Applied fix:** Fold `\p{Default_Ignorable_Code_Point}` instead of `\p{Cf}`. Verified it matches U+3164, U+FFA0, U+FE0F, U+034F, U+115F, U+1160 as well as U+200B / U+00AD / U+200D / U+2060 / U+FEFF. The CR-04 test is now an 11-row table covering all of them, each asserting the forged tag is gone and the trailing injection text stays inside the block.

Status: **fixed**.

### WR-01: `unresolvedRows` does not exclude `recentlyDecided`

**Files modified:** `src/components/ai/office/SkillEditorDrawer.tsx`, `tests/components/ai/office/SkillEditorDrawer.test.tsx`
**Commit:** `676b145e`
**Applied fix:** `unresolvedRows: pending.filter((row) => !patches.has(row.id) && !recentlyDecided.has(row.id))`. Approving a base-0 proposal overwrites `aiSkills`, collapsing that row's own diff to `NO_CHANGES`; it lost its patch and rendered as a decided card *and* a stray unresolved row whose `Từ chối` reported a failure on a successful approval.

New test `never shows a just-decided row in the unresolved list (WR-01)` holds the write open, moves `aiSkills` first (the approval's real first effect), and asserts the row never appears in `unresolvedRows` in either window.

Status: **fixed: requires human verification** (state-list logic).

### WR-02: `decideUnresolved`'s error is never rendered

**Files modified:** `src/components/ai/office/SkillEditorDrawer.tsx`, `tests/components/ai/office/SkillEditorDrawer.test.tsx`
**Commit:** `676b145e`
**Applied fix:** The unresolved row now renders `error.get(row.id)` in a `role="alert"` span, mirroring the card. New test `surfaces a failed reject on an unresolved pending proposal (WR-02)` rejects once, asserts the alert carries `WRITE_FAILED_COPY`, and asserts the row stays `pending` (the safe state).

### WR-03: `item.description` / `item.notes` / `item.checklist[].text` reach the lead raw, and `get_item_details` is directly callable

**Files modified:** `src/services/ai/office/teamTools.ts`, `src/services/ai/chatTurnTools.ts`, `tests/services/ai/office/teamTools.test.ts`, `tests/ai/chatTurnTools.test.ts`
**Commit:** `d59252d7`
**Applied fix:** Two layers, per the review's "better" option.
1. `getLinkedContext` wraps `item.description`, `item.notes` and every `checklist[].text` through `wrapUntrusted`, so the handler's stated contract holds for the whole delegated payload. `name` / `code` stay raw because `buildLeadTurnRequest` wraps the linked-item name once at the prompt boundary — wrapping here too would nest the block.
2. `LEAD_TOOL_ALLOWLIST` no longer advertises `get_item_details` (`EMPLOYEE_READ_ONLY_ALLOWLIST.filter((name) => name !== 'get_item_details')`), so the lead cannot reach the same raw fields by calling the resolver directly. `get_linked_context` is the lead's item read.

Tests: `wraps every free-text field on the delegated task branch (WR-03)` asserts all three fields are wrapped and that exactly three copies of the injection text exist in the payload (a raw leak would add a fourth). `the lead cannot reach raw item text through get_item_details (WR-03)` asserts the allowlist entry is gone and the composed lead payload omits it.

### WR-05: The live re-seed silently discards a typed draft

**Files modified:** `src/components/ai/office/SkillEditorDrawer.tsx`, `src/db/repositories/aiOfficeRepo.ts`, `tests/components/ai/office/SkillEditorDrawer.test.tsx`
**Commit:** `676b145e`
**Applied fix:** The seed effect now distinguishes "no input yet" (safe to re-seed) from "the user has typed" (never clobber). When a draft is dirty and the live row moves, the draft is kept, the old seed stays in place so a save is still refused at the state owner (CR-02), and a warning `Alert` with a `Tải lại nội dung mới` button appears. `handleSave` resets the seed/form refs to the saved content so the post-write re-seed is not misread as a draft.

`SKILL_MOVED_MESSAGE` was reworded — it claimed "Nội dung mới đã được tải lại", which is no longer true. New copy: `Kỹ năng vừa được cập nhật ở nơi khác. Tải lại nội dung mới, kiểm tra rồi lưu lại.` The existing CR-02 test asserting that copy was updated, not deleted.

New test `keeps a typed draft when another surface writes, and offers a reload (WR-05)` asserts the draft survives, Save stays enabled, and the reload button adopts the new content.

## Verification

- `npx tsc --noEmit` — clean.
- Scoped suites, all green: `teamPrompts` (32), `teamTools` (51), `chatTurnTools` (7), `SkillEditorDrawer` (21), `aiSkillVersionRepo`, `aiOfficeRepo`, `teamRunCoordinator`, `AiOfficeView`, `AiExplorers`, `aiTools` — 406 tests across the touched files.
- **Mutation-checked** every new test: reverting each fix individually makes its test fail (CR-01 tail, WR-04 fold, WR-01 filter, WR-02 render, WR-03 wrap, WR-03 allowlist, WR-05 draft guard). No test is vacuous.

## Round-1..4 fixes preserved

`07e9a428` (pre-39 backup strip), the WR-03 stale guard, `resolvePinnedSkill`, the CR-02 seed guard, and the round-4 CR-03 sticky-note wrap are all intact — the WR-03 change extends the sticky-note wrap rather than replacing it, and the CR-02 seed guard is what the WR-05 draft path relies on.

---

_Fixed: 2026-11-14T07:35:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 5_
